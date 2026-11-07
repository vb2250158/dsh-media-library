import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Store only user-approved media metadata; original media remains at its source. */
export class Catalog {
  #file
  #pending = Promise.resolve()

  constructor(file) { this.#file = file }

  async list() {
    try {
      const value = JSON.parse(await readFile(this.#file, 'utf8'))
      if (value.version !== 1 || !Array.isArray(value.items)) throw new Error('Unsupported media catalog format')
      return value.items
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }

  /** Save tags to an explicitly identified source and path. */
  setTags(source, path, tags) {
    if (typeof source !== 'string' || !source.trim() || typeof path !== 'string' || !path.startsWith('/')) throw new TypeError('A source and absolute media path are required')
    if (!Array.isArray(tags) || tags.length > 100 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 100)) throw new TypeError('Invalid tags')
    const normalized = [...new Set(tags.map(tag => tag.trim()))]
    const operation = this.#pending.then(async () => {
      const items = await this.list()
      const existing = items.find(item => item.source === source && item.path === path)
      if (existing) existing.tags = normalized
      else items.push({ source, path, tags: normalized })
      await mkdir(dirname(this.#file), { recursive: true })
      const temporary = `${this.#file}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify({ version: 1, items }), { flag: 'wx', mode: 0o600 })
      await rename(temporary, this.#file)
      return { source, path, tags: normalized }
    })
    // A failed write must not prevent the next operation from trying again.
    this.#pending = operation.catch(() => undefined)
    return operation
  }
}
