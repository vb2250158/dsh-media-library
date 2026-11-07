import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalMedia } from '../src/local-media.js'

/** @param {(root:string)=>Promise<void>} run Fixture test body. */
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-local-media-'))
  try { await run(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('pages visible media/directories in native order without modifying original bytes', async () => fixture(async root => {
  await mkdir(join(root, 'album'))
  await writeFile(join(root, 'a.mp4'), 'video')
  await writeFile(join(root, 'b.MP3'), 'sound')
  await writeFile(join(root, 'c.png'), 'image')
  await writeFile(join(root, 'README.md'), 'not media')
  await writeFile(join(root, '.secret.mp4'), 'hidden')
  const reader = new LocalMedia(root)
  const first = await reader.list('', { limit: 2 })
  assert.equal(first.items.length, 2)
  assert(first.hasMore)
  const second = await reader.list('', { limit: 2, offset: first.nextOffset, version: first.version })
  assert.equal(second.items.length, 2)
  assert.equal(second.hasMore, false)
  const items = [...first.items, ...second.items]
  assert.equal(new Set(items.map(item => item.path)).size, 4)
  assert.deepEqual(items.map(item => item.name).sort(), ['a.mp4', 'album', 'b.MP3', 'c.png'])
  assert.deepEqual(new Set(items.map(item => item.kind)), new Set(['directory', 'video', 'audio', 'image']))
  assert(items.every(item => typeof item.modified === 'string' && typeof item.size === 'number'))
  assert.equal(await readFile(join(root, 'a.mp4'), 'utf8'), 'video')
}))

test('opens one nested media file and leaves descriptor closure to the stream owner', async () => fixture(async root => {
  await mkdir(join(root, 'nested'))
  await writeFile(join(root, 'nested', 'épisode.mp4'), 'unchanged media bytes')
  const file = await new LocalMedia(root).open('nested/épisode.mp4')
  try {
    assert.equal(file.name, 'épisode.mp4')
    assert.equal(file.mimeType, 'video/mp4')
    assert.equal(file.stat.size, 21)
    assert.equal(await file.handle.readFile('utf8'), 'unchanged media bytes')
  } finally { await file.handle.close() }
}))

test('refuses traversal, absolute paths, hidden components, backslashes, ADS and Windows device names', async () => fixture(async root => {
  const reader = new LocalMedia(root)
  for (const path of ['/etc/passwd.mp4', '../outside.mp4', 'a/../b.mp4', 'a\\b.mp4', 'C:/a.mp4', '//server/share.mp4', 'a.mp4:stream', 'a\0.mp4', '.private/a.mp4', 'a//b.mp4', './a.mp4', 'CON.mp4', 'aux.png', 'nul/x.mp4']) {
    await assert.rejects(reader.open(path), error => error.code === 'MEDIA_INVALID_PATH', path)
    await assert.rejects(reader.list(path), error => error.code === 'MEDIA_INVALID_PATH', path)
  }
  await assert.rejects(reader.open(''), error => error.code === 'MEDIA_INVALID_PATH')
  assert.throws(() => new LocalMedia('relative/path'), error => error.code === 'MEDIA_INVALID_ROOT')
}))

test('refuses unsupported files and directories even when the name has a media extension', async () => fixture(async root => {
  await writeFile(join(root, 'data.json'), '{"secret":true}')
  await writeFile(join(root, 'icon.svg'), '<svg/>')
  await mkdir(join(root, 'album.mp4'))
  const reader = new LocalMedia(root)
  await assert.rejects(reader.open('data.json'), error => error.code === 'MEDIA_UNSUPPORTED_TYPE')
  await assert.rejects(reader.open('icon.svg'), error => error.code === 'MEDIA_UNSUPPORTED_TYPE')
  await assert.rejects(reader.open('album.mp4'), error => error.code === 'MEDIA_NOT_FILE')
  await assert.rejects(reader.list('missing'), error => error.code === 'MEDIA_NOT_FOUND' && !error.message.includes(root))
}))

test('refuses directory junction escape and keeps the original target untouched', async () => fixture(async root => {
  const library = join(root, 'library')
  const outside = join(root, 'outside')
  await mkdir(library)
  await mkdir(outside)
  await writeFile(join(outside, 'secret.mp4'), 'outside bytes')
  await symlink(outside, join(library, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  const reader = new LocalMedia(library)
  assert.deepEqual((await reader.list()).items, [])
  await assert.rejects(reader.list('escape'), error => error.code === 'MEDIA_LINK_REFUSED')
  await assert.rejects(reader.open('escape/secret.mp4'), error => error.code === 'MEDIA_LINK_REFUSED')
  assert.equal(await readFile(join(outside, 'secret.mp4'), 'utf8'), 'outside bytes')
}))

test('refuses an internal directory junction as well as an escaping one', async () => fixture(async root => {
  await mkdir(join(root, 'actual'))
  await writeFile(join(root, 'actual', 'clip.mp4'), 'video')
  await symlink(join(root, 'actual'), join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
  const reader = new LocalMedia(root)
  assert.deepEqual((await reader.list()).items.map(x => x.name), ['actual'])
  await assert.rejects(reader.open('alias/clip.mp4'), error => error.code === 'MEDIA_LINK_REFUSED')
}))

test('rejects a stale directory generation rather than silently continuing a changed listing', async () => fixture(async root => {
  await writeFile(join(root, 'first.mp4'), 'one')
  const reader = new LocalMedia(root)
  const page = await reader.list()
  await mkdir(join(root, 'new-album'))
  await assert.rejects(reader.list('', { offset: 1, version: page.version }), error => error.code === 'MEDIA_DIRECTORY_CHANGED')
  assert.equal((await reader.list()).items.length, 2)
}))

test('rejects unbounded or malformed page inputs and reports an empty directory distinctly', async () => fixture(async root => {
  const reader = new LocalMedia(root)
  for (const options of [{ offset: -1 }, { offset: 100000 }, { offset: 1.1 }, { limit: 0 }, { limit: 201 }, { version: {} }]) {
    await assert.rejects(reader.list('', options), error => error.code === 'MEDIA_INVALID_PAGE')
  }
  const result = await reader.list()
  assert.deepEqual(result.items, [])
  assert.equal(result.hasMore, false)
  assert.equal(result.nextOffset, 0)
  assert.equal(typeof result.version, 'string')
}))
