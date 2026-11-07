/** Bounded metadata reads and atomic replacement shared by the two local documents. @module */
import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const LIMIT = 4 * 1024 * 1024

/** Read one JSON document without allocating an unbounded file; missing means undefined. */
export async function readDocument(file, limit = LIMIT) {
  let handle
  try { handle = await open(file, 'r') }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
  try {
    const chunks = []
    let used = 0
    while (used <= limit) {
      const buffer = Buffer.alloc(Math.min(65_536, limit + 1 - used))
      const result = await handle.read(buffer, 0, buffer.length, used)
      if (!result.bytesRead) break
      used += result.bytesRead
      chunks.push(buffer.subarray(0, result.bytesRead))
    }
    if (used > limit) throw Object.assign(new RangeError('Media metadata exceeds its size limit'), { code: 'MEDIA_METADATA_LIMIT' })
    return JSON.parse(Buffer.concat(chunks, used).toString('utf8'))
  } finally { await handle.close() }
}

/** Replace only an owned metadata document; callers serialize their own writes. */
export async function writeDocument(file, value, limit = LIMIT) {
  const text = JSON.stringify(value) + '\n'
  if (Buffer.byteLength(text) > limit) throw Object.assign(new RangeError('Media metadata exceeds its size limit'), { code: 'MEDIA_METADATA_LIMIT' })
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, text, { flag: 'wx', mode: 0o600 })
    await rename(temporary, file)
  } finally { await rm(temporary, { force: true }) }
}
