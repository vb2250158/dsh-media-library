/** Bounded metadata reads and atomic replacement shared by the two local documents. @module */
import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const LIMIT = 4 * 1024 * 1024

/** Read one JSON document without allocating an unbounded file; missing means undefined. */
export async function readDocument(file) {
  let handle
  try { handle = await open(file, 'r') }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
  try {
    const buffer = Buffer.alloc(LIMIT + 1)
    let used = 0
    while (used < buffer.length) {
      const result = await handle.read(buffer, used, buffer.length - used, used)
      if (!result.bytesRead) break
      used += result.bytesRead
    }
    if (used > LIMIT) throw new Error('Media metadata exceeds its size limit')
    return JSON.parse(buffer.toString('utf8', 0, used))
  } finally { await handle.close() }
}

/** Replace only an owned metadata document; callers serialize their own writes. */
export async function writeDocument(file, value) {
  const text = JSON.stringify(value) + '\n'
  if (Buffer.byteLength(text) > LIMIT) throw new Error('Media metadata exceeds its size limit')
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, text, { flag: 'wx', mode: 0o600 })
    await rename(temporary, file)
  } finally { await rm(temporary, { force: true }) }
}
