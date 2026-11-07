import { readDocument, writeDocument } from './metadata-file.js'

function validTags(tags) {
  return Array.isArray(tags) && tags.length <= 100 && tags.every(tag => typeof tag === 'string' && tag.trim() && tag.length <= 100 && !/[\x00-\x1f]/.test(tag))
}

/** Store only user-approved media metadata; original media remains at its source. */
export class Catalog {
  #file
  #pending = Promise.resolve()

  constructor(file) { this.#file = file }

  async list() {
    const value = await readDocument(this.#file)
    if (value === undefined) return []
    if (value.version !== 1 || !Array.isArray(value.items) || value.items.length > 10_000 || value.items.some(item => !item || typeof item.source !== 'string' || !item.source.trim() || typeof item.path !== 'string' || !item.path.startsWith('/') || !validTags(item.tags))) throw new Error('Unsupported media catalog format')
    const identities = value.items.map(item => JSON.stringify([item.source, item.path]))
    if (new Set(identities).size !== identities.length) throw new Error('Duplicate media record')
    return value.items
  }

  /** Save tags to an explicitly identified source and path. */
  setTags(source, path, tags) {
    if (typeof source !== 'string' || !source.trim() || typeof path !== 'string' || !path.startsWith('/')) throw new TypeError('A source and absolute media path are required')
    if (!validTags(tags)) throw Object.assign(new TypeError('Invalid tags'), { code: 'MEDIA_INVALID_TAGS' })
    const normalized = [...new Set(tags.map(tag => tag.trim()))]
    const operation = this.#pending.then(async () => {
      const items = await this.list()
      const existing = items.find(item => item.source === source && item.path === path)
      if (existing) existing.tags = normalized
      else items.push({ source, path, tags: normalized })
      if (items.length > 10_000) throw new Error('Media catalog exceeds its item limit')
      await writeDocument(this.#file, { version: 1, items })
      return { source, path, tags: normalized }
    })
    // A failed write must not prevent the next operation from trying again.
    this.#pending = operation.catch(() => undefined)
    return operation
  }
}
