/** Atomic per-workspace index of the most recently completed folder scans. */
import { extname } from 'node:path'
import { readDocument, writeDocument } from './metadata-file.js'

const maximum = 100_000
const maximumBytes = 32 * 1024 * 1024
const formats = new Set(['.mp4', '.m4v', '.webm', '.ogv', '.mov', '.mkv', '.avi'])
const fail = () => Object.assign(new TypeError('Invalid video index'), { code: 'MEDIA_INVALID_INDEX' })
const limit = () => Object.assign(new RangeError('Video index limit exceeded'), { code: 'MEDIA_INDEX_LIMIT' })
const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)

function itemOf(value) {
  if (!value || typeof value.path !== 'string' || value.path.length > 4096 || /[\\:\x00-\x1f\x7f]/u.test(value.path)) throw fail()
  const parts = value.path.split('/')
  if (parts.length > 100 || parts.some(part => !part || part.startsWith('.') || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(part))) throw fail()
  const name = parts.at(-1)
  if (!formats.has(extname(name).toLowerCase()) || value.name !== name || !Number.isSafeInteger(value.size) || value.size < 0 || typeof value.modified !== 'string' || !Number.isFinite(Date.parse(value.modified)) || value.modified.length > 40) throw fail()
  return { path: value.path, name, size: value.size, modified: value.modified }
}

export class MediaIndex {
  #file
  constructor(file) { this.#file = file }
  async #read() {
    let data
    try { data = await readDocument(this.#file, maximumBytes) }
    catch (error) { if (error.code === 'MEDIA_METADATA_LIMIT') throw limit(); throw error }
    if (data === undefined) return []
    if (data.version !== 1 || !Array.isArray(data.sources) || data.sources.length > 1000) throw fail()
    const ids = new Set(); let count = 0
    for (const source of data.sources) {
      if (!source || !validId(source.id) || ids.has(source.id) || !Array.isArray(source.items)) throw fail()
      ids.add(source.id); count += source.items.length
      const paths = new Set()
      for (const item of source.items) { const normalized = itemOf(item); if (paths.has(normalized.path)) throw fail(); paths.add(normalized.path) }
    }
    if (count > maximum) throw limit()
    return data.sources
  }
  async list(sourceId) {
    if (!validId(sourceId)) throw fail()
    return (await this.#read()).find(source => source.id === sourceId)?.items ?? []
  }
  /** The caller submits only a completed scan; reject before replacing prior data. */
  async replace(sourceId, values) {
    if (!validId(sourceId) || !Array.isArray(values)) throw fail()
    if (values.length > maximum) throw limit()
    const items = values.map(itemOf), paths = new Set(items.map(item => item.path))
    if (paths.size !== items.length) throw fail()
    const sources = (await this.#read()).filter(source => source.id !== sourceId)
    if (sources.reduce((count, source) => count + source.items.length, items.length) > maximum) throw limit()
    sources.push({ id: sourceId, items })
    const result = { version: 1, sources }
    if (Buffer.byteLength(JSON.stringify(result) + '\n') > maximumBytes) throw limit()
    await writeDocument(this.#file, result, maximumBytes)
    return items
  }
}
