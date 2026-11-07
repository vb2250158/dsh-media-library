/** User-managed tag categories. Media assignments remain in the existing catalog. */
import { randomUUID } from 'node:crypto'
import { readDocument, writeDocument } from './metadata-file.js'

const validName = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100 && !/[\x00-\x1f]/.test(value)
const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)
const invalid = () => Object.assign(new TypeError('Invalid tag category or name'), { code: 'MEDIA_INVALID_TAGS' })

export class TagTaxonomy {
  #file
  #pending = Promise.resolve()
  constructor(file) { this.#file = file }

  async list() {
    const data = await readDocument(this.#file)
    if (data === undefined) return []
    if (data.version !== 1 || !Array.isArray(data.categories) || data.categories.length > 1000) throw new Error('Unsupported tag taxonomy')
    const ids = new Set(), names = new Set()
    for (const category of data.categories) {
      if (!validId(category?.id) || ids.has(category.id) || !validName(category.name) || names.has(category.name) || !Array.isArray(category.tags) || category.tags.length > 1000) throw new Error('Invalid tag category')
      ids.add(category.id); names.add(category.name)
      if (new Set(category.tags).size !== category.tags.length || category.tags.some(tag => !validName(tag))) throw new Error('Invalid category tags')
    }
    return data.categories
  }

  #write(operation) {
    const result = this.#pending.then(async () => {
      const categories = await this.list()
      const value = operation(categories)
      await writeDocument(this.#file, { version: 1, categories })
      return value
    })
    this.#pending = result.catch(() => undefined)
    return result
  }

  createCategory(name) {
    if (!validName(name)) throw invalid()
    name = name.trim()
    return this.#write(categories => {
      if (categories.some(category => category.name === name)) throw Object.assign(new Error('Category already exists'), { code: 'MEDIA_CATEGORY_EXISTS' })
      if (categories.length >= 1000) throw invalid()
      const category = { id: randomUUID(), name, tags: [] }
      categories.push(category)
      return category
    })
  }

  addTag(categoryId, name) {
    if (!validId(categoryId) || !validName(name)) throw invalid()
    name = name.trim()
    return this.#write(categories => {
      const category = categories.find(item => item.id === categoryId)
      if (!category) throw Object.assign(new Error('Category not found'), { code: 'MEDIA_CATEGORY_MISSING' })
      if (categories.some(item => item.tags.includes(name))) throw Object.assign(new Error('Tag already exists'), { code: 'MEDIA_TAG_EXISTS' })
      if (category.tags.length >= 1000) throw invalid()
      category.tags.push(name)
      return { categoryId, name }
    })
  }

  async drain() { await this.#pending }
}
