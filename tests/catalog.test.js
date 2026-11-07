import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Catalog } from '../src/catalog.js'

test('concurrent updates retain both media records and normalize tags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-media-test-'))
  try {
    const catalog = new Catalog(join(root, 'catalog.json'))
    await Promise.all([catalog.setTags('drive-a', '/one.mp4', [' 鱼 ', '鱼']), catalog.setTags('drive-a', '/two.mp4', ['钓鱼'])])
    assert.deepEqual(await catalog.list(), [{ source: 'drive-a', path: '/one.mp4', tags: ['鱼'] }, { source: 'drive-a', path: '/two.mp4', tags: ['钓鱼'] }])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('corrupt catalog is preserved and rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-media-test-'))
  try {
    const file = join(root, 'catalog.json')
    await writeFile(file, 'broken')
    await assert.rejects(new Catalog(file).setTags('drive', '/one.mp4', ['tag']))
    assert.equal(await readFile(file, 'utf8'), 'broken')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('concurrent additions to one video preserve all existing labels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-media-test-'))
  try {
    const catalog = new Catalog(join(root, 'catalog.json'))
    await catalog.setTags('drive', '/one.mp4', ['用户'])
    await Promise.all([catalog.addTags('drive', '/one.mp4', ['AI', '用户']), catalog.addTags('drive', '/one.mp4', ['喜剧'])])
    assert.deepEqual((await catalog.list())[0].tags, ['用户', 'AI', '喜剧'])
  } finally { await rm(root, { recursive: true, force: true }) }
})
