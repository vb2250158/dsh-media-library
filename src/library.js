/** Workspace-owned metadata and explicitly selected media folders. @module */
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Catalog } from './catalog.js'
import { FolderStore } from './folder-store.js'
import { LocalMedia } from './local-media.js'
import { MediaIndex } from './media-index.js'
import { ProjectStore, workspaceIdentity } from './project-store.js'
import { TagTaxonomy } from './tag-taxonomy.js'

/** A request failure safe for a localized Client error message. */
export function mediaFailure(code) { return Object.assign(new Error(code), { code }) }

/** Workspace settings and labels are stored in .dsh-media-library, apart from membership. */
export class MediaLibrary {
  #registry
  #projects
  #legacyCatalog
  #legacyTaxonomyPath
  #workspaces = new Map()
  #pending = Promise.resolve()
  #closed = false
  constructor({ workspaceRegistry, stateDir }) {
    this.#registry = workspaceRegistry
    this.#projects = new ProjectStore(join(stateDir, 'projects.json'))
    this.#legacyCatalog = new Catalog(join(stateDir, 'catalog.json'))
    this.#legacyTaxonomyPath = join(stateDir, 'tag-taxonomy.json')
  }

  async state() {
    const ids = await this.#projects.list()
    return { projects: ids.flatMap(id => {
      const workspace = this.#registry.get(id)
      return workspace ? [{ workspaceId: id, title: workspace.title, path: workspace.path }] : []
    }) }
  }

  #write(operation) {
    if (this.#closed) return Promise.reject(mediaFailure('MEDIA_UNLOADING'))
    const pending = this.#pending.then(operation)
    this.#pending = pending.catch(() => undefined)
    return pending
  }

  setProject(workspaceId, enabled) {
    workspaceIdentity(workspaceId)
    if (typeof enabled !== 'boolean') throw mediaFailure('MEDIA_INVALID_REQUEST')
    return this.#write(async () => {
      if (enabled) {
        const workspace = this.#registry.get(workspaceId)
        if (!workspace) throw mediaFailure('MEDIA_WORKSPACE_MISSING')
        const directory = await realpath(workspace.path)
        if (!(await stat(directory)).isDirectory()) throw mediaFailure('MEDIA_DIRECTORY_MISSING')
      }
      await this.#projects.set(workspaceId, enabled)
      return this.state()
    })
  }

  async #workspace(workspaceId, acceptedWrite = false) {
    if (this.#closed && !acceptedWrite) throw mediaFailure('MEDIA_UNLOADING')
    workspaceIdentity(workspaceId)
    const workspace = this.#registry.get(workspaceId)
    if (!workspace) throw mediaFailure('MEDIA_WORKSPACE_MISSING')
    if (!(await this.#projects.list()).includes(workspaceId)) throw mediaFailure('MEDIA_NOT_ENABLED')
    const root = await realpath(workspace.path), directory = join(root, '.dsh-media-library')
    try { await mkdir(directory) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory) throw mediaFailure('MEDIA_INVALID_ROOT')
    const old = this.#workspaces.get(workspaceId)
    if (old?.root === root) return old
    const taxonomyPath = join(directory, 'tag-taxonomy.json')
    // Exclusive copy preserves the old document and never replaces local workspace data.
    try {
      await new TagTaxonomy(this.#legacyTaxonomyPath).list()
      await copyFile(this.#legacyTaxonomyPath, taxonomyPath, constants.COPYFILE_EXCL)
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EEXIST') throw error }
    const entry = { root, folders: new FolderStore(join(directory, 'folders.json')), catalog: new Catalog(join(directory, 'catalog.json')), taxonomy: new TagTaxonomy(taxonomyPath), index: new MediaIndex(join(directory, 'index.json')) }
    this.#workspaces.set(workspaceId, entry)
    return entry
  }

  async folders(workspaceId) { return { folders: await (await this.#workspace(workspaceId)).folders.list() } }

  addFolder(workspaceId, path) {
    return this.#write(async () => {
      const workspace = await this.#workspace(workspaceId, true)
      const folder = await workspace.folders.add(path)
      // Old catalog paths were relative to the workspace root. Import only paths
      // contained by the selected folder; retain old bytes as a recovery source.
      const legacy = []
      for (const item of folder.migrated ? [] : await this.#legacyCatalog.list()) {
        if (item.source !== workspaceId) continue
        const parts = item.path.slice(1).split('/')
        if (parts.some(part => !part || part.startsWith('.') || /[\\:\x00-\x1f\x7f]/u.test(part))) continue
        const absolute = resolve(workspace.root, ...parts), suffix = relative(folder.path, absolute)
        if (!suffix || isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`)) continue
        legacy.push({ path: '/' + suffix.split(sep).join('/'), tags: item.tags })
      }
      if (legacy.length) await workspace.catalog.importMissing(folder.id, legacy)
      if (!folder.migrated) await workspace.folders.markMigrated(folder.id)
      return { folders: await workspace.folders.list() }
    })
  }

  removeFolder(workspaceId, sourceId) {
    return this.#write(async () => {
      const workspace = await this.#workspace(workspaceId, true)
      await workspace.folders.remove(sourceId)
      return { folders: await workspace.folders.list() }
    })
  }

  async #reader(workspaceId, sourceId, acceptedWrite = false) {
    const workspace = await this.#workspace(workspaceId, acceptedWrite)
    const folder = (await workspace.folders.list()).find(item => item.id === sourceId)
    if (!folder) throw mediaFailure('MEDIA_SOURCE_MISSING')
    return { workspace, reader: new LocalMedia(folder.path) }
  }

  async directory(workspaceId, sourceId, path, options) {
    const { workspace, reader } = await this.#reader(workspaceId, sourceId)
    const listing = await reader.list(path, options)
    const wanted = new Set(listing.items.map(item => '/' + item.path))
    const tags = new Map((await workspace.catalog.list()).filter(item => item.source === sourceId && wanted.has(item.path)).map(item => [item.path, item.tags]))
    return { ...listing, items: listing.items.map(item => ({ ...item, tags: tags.get('/' + item.path) ?? [] })) }
  }

  async open(workspaceId, sourceId, path) { return (await this.#reader(workspaceId, sourceId)).reader.open(path) }

  /** A prior completed scan can render while a new scan is in progress. */
  async index(workspaceId, sourceId) {
    const { workspace } = await this.#reader(workspaceId, sourceId)
    const items = await workspace.index.list(sourceId)
    const tags = new Map((await workspace.catalog.list()).filter(item => item.source === sourceId).map(item => [item.path, item.tags]))
    return { items: items.map(item => ({ ...item, kind: 'video', tags: tags.get('/' + item.path) ?? [] })) }
  }

  /** Replace one source index only after the caller completes the entire scan. */
  replaceIndex(workspaceId, sourceId, items) {
    return this.#write(async () => {
      const { workspace } = await this.#reader(workspaceId, sourceId, true)
      const replaced = await workspace.index.replace(sourceId, items)
      return { count: replaced.length }
    })
  }

  setTags(workspaceId, sourceId, path, tags) {
    return this.#write(async () => {
      const { workspace, reader } = await this.#reader(workspaceId, sourceId, true)
      const media = await reader.open(path); await media.handle.close()
      return workspace.catalog.setTags(sourceId, '/' + path, tags)
    })
  }

  addTags(workspaceId, sourceId, path, tags) {
    return this.#write(async () => {
      const { workspace, reader } = await this.#reader(workspaceId, sourceId, true)
      const media = await reader.open(path); await media.handle.close()
      return workspace.catalog.addTags(sourceId, '/' + path, tags)
    })
  }

  /** Apply explicit user changes while retaining concurrently added labels. */
  editTags(workspaceId, sourceId, path, add, remove) {
    return this.#write(async () => {
      const { workspace, reader } = await this.#reader(workspaceId, sourceId, true)
      const media = await reader.open(path); await media.handle.close()
      return workspace.catalog.editTags(sourceId, '/' + path, add, remove)
    })
  }

  async tagCategories(workspaceId) { return (await this.#workspace(workspaceId)).taxonomy.list() }
  createTagCategory(workspaceId, name) { return this.#write(async () => (await this.#workspace(workspaceId, true)).taxonomy.createCategory(name)) }
  addCategoryTag(workspaceId, categoryId, name) { return this.#write(async () => (await this.#workspace(workspaceId, true)).taxonomy.addTag(categoryId, name)) }

  async dispose() { this.#closed = true; await this.#pending; await this.#projects.drain(); await Promise.all([...this.#workspaces.values()].map(item => item.taxonomy.drain())) }
}
