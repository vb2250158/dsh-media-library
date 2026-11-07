/** Persist explicit media roots in their owning workspace. */
import { randomUUID } from 'node:crypto'
import { basename, isAbsolute } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { readDocument, writeDocument } from './metadata-file.js'

const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)
const fail = code => Object.assign(new Error(code), { code })
const key = path => process.platform === 'win32' ? path.toLowerCase() : path

/** Folders removed from the UI retain their identity and assignments. */
export class FolderStore {
  #file
  constructor(file) { this.#file = file }
  async #read() {
    const document = await readDocument(this.#file)
    if (document === undefined) return []
    if (document.version !== 1 || !Array.isArray(document.folders) || document.folders.length > 1000) throw new Error('Unsupported media folder configuration')
    const ids = new Set(), paths = new Set()
    for (const item of document.folders) {
      if (!item || !validId(item.id) || ids.has(item.id) || typeof item.path !== 'string' || !isAbsolute(item.path) || item.path.includes('\0') || paths.has(key(item.path)) || typeof item.name !== 'string' || !item.name || typeof item.active !== 'boolean' || typeof item.migrated !== 'boolean') throw new Error('Invalid media folder configuration')
      ids.add(item.id); paths.add(key(item.path))
    }
    return document.folders
  }
  async list() { return (await this.#read()).filter(folder => folder.active).map(({ id, path, name }) => ({ id, path, name })) }
  async add(path) {
    if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0') || path.length > 4096) throw fail('MEDIA_INVALID_ROOT')
    let canonical
    try { canonical = await realpath(path); if (!(await stat(canonical)).isDirectory()) throw fail('MEDIA_INVALID_ROOT') }
    catch (error) { if (error.code === 'MEDIA_INVALID_ROOT') throw error; if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) throw fail('MEDIA_NOT_READABLE'); throw fail('MEDIA_DIRECTORY_MISSING') }
    const folders = await this.#read()
    let folder = folders.find(item => key(item.path) === key(canonical))
    if (!folder) {
      if (folders.length >= 1000) throw fail('MEDIA_DIRECTORY_LIMIT')
      folder = { id: randomUUID(), path: canonical, name: basename(canonical) || canonical, active: false, migrated: false }
      folders.push(folder)
    } else folder.active = folder.migrated
    await writeDocument(this.#file, { version: 1, folders })
    return { id: folder.id, path: folder.path, name: folder.name, migrated: folder.migrated }
  }
  async markMigrated(sourceId) {
    const folders = await this.#read(), folder = folders.find(item => item.id === sourceId)
    if (!folder) throw fail('MEDIA_SOURCE_MISSING')
    folder.migrated = true
    folder.active = true
    await writeDocument(this.#file, { version: 1, folders })
  }
  async remove(sourceId) {
    if (!validId(sourceId)) throw fail('MEDIA_INVALID_REQUEST')
    const folders = await this.#read(), folder = folders.find(item => item.id === sourceId && item.active)
    if (!folder) throw fail('MEDIA_SOURCE_MISSING')
    folder.active = false
    await writeDocument(this.#file, { version: 1, folders })
  }
}
