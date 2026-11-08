import { readDocument, writeDocument } from './metadata-file.js'

const MAX_ITEMS = 100_000
const MAX_BYTES = 32 * 1024 * 1024
const catalogLimit = () => Object.assign(new RangeError('Media catalog exceeds its size limit'), { code: 'MEDIA_CATALOG_LIMIT' })

async function writeCatalog(file, items) {
  if (items.length > MAX_ITEMS || Buffer.byteLength(JSON.stringify({ version: 1, items }) + '\n') > MAX_BYTES) throw catalogLimit()
  await writeDocument(file, { version: 1, items }, MAX_BYTES)
}

function validTags(tags) {
  return Array.isArray(tags) && tags.length <= 100 && tags.every(tag => typeof tag === 'string' && tag.trim() && tag.length <= 100 && !/[\x00-\x1f]/.test(tag))
}

/** Store only user-approved media metadata; original media remains at its source. */
export class Catalog {
  #file
  #pending = Promise.resolve()

  constructor(file) { this.#file = file }

  async list() {
    let value
    try { value = await readDocument(this.#file, MAX_BYTES) }
    catch (error) { if (error.code === 'MEDIA_METADATA_LIMIT') throw catalogLimit(); throw error }
    if (value === undefined) return []
    if (value.version !== 1 || !Array.isArray(value.items)) throw new Error('Unsupported media catalog format')
    if (value.items.length > MAX_ITEMS) throw catalogLimit()
    if (value.items.some(item => !item || typeof item.source !== 'string' || !item.source.trim() || typeof item.path !== 'string' || !item.path.startsWith('/') || !validTags(item.tags))) throw new Error('Unsupported media catalog format')
    const identities = value.items.map(item => JSON.stringify([item.source, item.path]))
    if (new Set(identities).size !== identities.length) throw new Error('Duplicate media record')
    return value.items
  }

  /** Save tags to an explicitly identified source and path. */
  setTags(source, path, tags) {
    return this.#updateTags(source, path, tags, false)
  }

  /** Add tags without discarding labels already applied to the media. */
  addTags(source, path, tags) {
    return this.#updateTags(source, path, tags, true)
  }

  /** Apply a user's explicit additions and removals to the latest labels. */
  editTags(source, path, add, remove) {
    if (!validTags(remove)) throw Object.assign(new TypeError('Invalid tags'), { code: 'MEDIA_INVALID_TAGS' })
    const removed = [...new Set(remove.map(tag => tag.trim()))]
    if (!validTags(add) || add.some(tag => removed.includes(tag.trim()))) throw Object.assign(new TypeError('Invalid tags'), { code: 'MEDIA_INVALID_TAGS' })
    return this.#updateTags(source, path, add, true, removed)
  }

  /** Copy absent legacy records in one atomic write, never replacing local labels. */
  importMissing(source, records) {
    if (typeof source !== 'string' || !source.trim() || !Array.isArray(records) || records.some(item => !item || typeof item.path !== 'string' || !item.path.startsWith('/') || !validTags(item.tags))) throw new TypeError('Invalid media import')
    const operation = this.#pending.then(async () => {
      const items = await this.list()
      const paths = new Set(items.filter(item => item.source === source).map(item => item.path))
      for (const item of records) {
        if (paths.has(item.path)) continue
        items.push({ source, path: item.path, tags: [...new Set(item.tags.map(tag => tag.trim()))] })
        paths.add(item.path)
      }
      if (records.length) await writeCatalog(this.#file, items)
    })
    this.#pending = operation.catch(() => undefined)
    return operation
  }

  #updateTags(source, path, tags, append, remove = []) {
    if (typeof source !== 'string' || !source.trim() || typeof path !== 'string' || !path.startsWith('/')) throw new TypeError('A source and absolute media path are required')
    if (!validTags(tags)) throw Object.assign(new TypeError('Invalid tags'), { code: 'MEDIA_INVALID_TAGS' })
    const normalized = [...new Set(tags.map(tag => tag.trim()))]
    const operation = this.#pending.then(async () => {
      const items = await this.list()
      const existing = items.find(item => item.source === source && item.path === path)
      const next = append && existing ? [...new Set([...existing.tags.filter(tag => !remove.includes(tag)), ...normalized])] : normalized
      if (!validTags(next)) throw Object.assign(new TypeError('Invalid tags'), { code: 'MEDIA_INVALID_TAGS' })
      if (existing) existing.tags = next
      else items.push({ source, path, tags: next })
      await writeCatalog(this.#file, items)
      return { source, path, tags: next }
    })
    // A failed write must not prevent the next operation from trying again.
    this.#pending = operation.catch(() => undefined)
    return operation
  }
}
