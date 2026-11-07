import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaIndex } from '../src/media-index.js'

test('video index atomically retains each source and rejects invalid or oversized replacements', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-video-index-'))
  try {
    const file = join(root, 'index.json'), index = new MediaIndex(file)
    const first = '00000000-0000-0000-0000-000000000001', second = '00000000-0000-0000-0000-000000000002'
    const a = { path: 'a.mp4', name: 'a.mp4', size: 1, modified: '2026-11-07T00:00:00.000Z' }
    const b = { path: 'b.mp4', name: 'b.mp4', size: 2, modified: '2026-11-07T00:00:00.000Z' }
    await index.replace(first, [a]); await index.replace(second, [b])
    const before = await readFile(file, 'utf8')
    await assert.rejects(index.replace(first, [{ ...a, path: '../a.mp4' }]), error => error.code === 'MEDIA_INVALID_INDEX')
    await assert.rejects(index.replace(first, Array(100_001).fill(a)), error => error.code === 'MEDIA_INDEX_LIMIT')
    assert.equal(await readFile(file, 'utf8'), before)
    assert.deepEqual(await index.list(first), [a]); assert.deepEqual(await index.list(second), [b])
  } finally { await rm(root, { recursive: true, force: true }) }
})
