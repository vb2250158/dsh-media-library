/** Workspace-scoped media queries and tag writes. @module */
import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Catalog } from './catalog.js'
import { LocalMedia } from './local-media.js'
import { ProjectStore, workspaceIdentity } from './project-store.js'
import { TagTaxonomy } from './tag-taxonomy.js'

/** A request failure safe for a localized Client error message. */
export function mediaFailure(code) { return Object.assign(new Error(code), { code }) }

/** Membership and tags live in DSH Home, never inside the user's media directory. */
export class MediaLibrary {
  #registry
  #projects
  #catalog
  #taxonomy
  #pending = Promise.resolve()
  #closed = false
  constructor({ workspaceRegistry, stateDir }) {
    this.#registry = workspaceRegistry
    this.#projects = new ProjectStore(join(stateDir, 'projects.json'))
    this.#catalog = new Catalog(join(stateDir, 'catalog.json'))
    this.#taxonomy = new TagTaxonomy(join(stateDir, 'tag-taxonomy.json'))
  }

  /** Return only registered libraries, resolving titles/paths from Workspace each time. */
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

  /** Change the library designation without renaming or moving the Workspace. */
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

  async #reader(workspaceId, acceptedWrite = false) {
    if (this.#closed && !acceptedWrite) throw mediaFailure('MEDIA_UNLOADING')
    workspaceIdentity(workspaceId)
    const workspace = this.#registry.get(workspaceId)
    if (!workspace) throw mediaFailure('MEDIA_WORKSPACE_MISSING')
    if (!(await this.#projects.list()).includes(workspaceId)) throw mediaFailure('MEDIA_NOT_ENABLED')
    return new LocalMedia(workspace.path)
  }

  /** Read just one directory page; binary media is fetched only on selection. */
  async directory(workspaceId, path, options) {
    const reader = await this.#reader(workspaceId)
    const listing = await reader.list(path, options)
    const wanted = new Set(listing.items.map(item => '/' + item.path))
    const tags = new Map((await this.#catalog.list()).filter(item => item.source === workspaceId && wanted.has(item.path)).map(item => [item.path, item.tags]))
    return { ...listing, items: listing.items.map(item => ({ ...item, tags: tags.get('/' + item.path) ?? [] })) }
  }

  /** Open a known media file within an enabled project. Caller closes its descriptor. */
  async open(workspaceId, path) { return (await this.#reader(workspaceId)).open(path) }

  /** Persist only user-entered labels after confirming the target is actual media. */
  setTags(workspaceId, path, tags) {
    return this.#write(async () => {
      const reader = await this.#reader(workspaceId, true)
      const media = await reader.open(path)
      await media.handle.close()
      return this.#catalog.setTags(workspaceId, '/' + path, tags)
    })
  }

  /** Append labels without replacing existing user or Agent labels. */
  addTags(workspaceId, path, tags) {
    return this.#write(async () => {
      const reader = await this.#reader(workspaceId, true)
      const media = await reader.open(path)
      await media.handle.close()
      return this.#catalog.addTags(workspaceId, '/' + path, tags)
    })
  }

  async tagCategories() {
    if (this.#closed) throw mediaFailure('MEDIA_UNLOADING')
    return this.#taxonomy.list()
  }

  createTagCategory(name) { return this.#write(() => this.#taxonomy.createCategory(name)) }
  addCategoryTag(categoryId, name) { return this.#write(() => this.#taxonomy.addTag(categoryId, name)) }

  /** Stop admission and let already accepted writes reach their durable end. */
  async dispose() { this.#closed = true; await this.#pending; await this.#projects.drain(); await this.#taxonomy.drain() }
}
