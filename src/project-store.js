/** Durable media-library membership; paths and names remain owned by Workspace. @module */
import { readDocument, writeDocument } from './metadata-file.js'

/** Validate an opaque Workspace identity at the HTTP/file boundary. */
export function workspaceIdentity(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x20/\\]/.test(value)) {
    throw Object.assign(new Error('Invalid workspace identity'), { code: 'MEDIA_INVALID_REQUEST' })
  }
  return value
}

/** One effect-owned writer serializes membership updates without changing project files. */
export class ProjectStore {
  #file
  #pending = Promise.resolve()
  constructor(file) { this.#file = file }

  /** Read the bounded membership document; preserve and reject corrupt data. */
  async list() {
    const data = await readDocument(this.#file)
    if (data === undefined) return []
    if (data.version !== 1 || !Array.isArray(data.workspaceIds) || data.workspaceIds.length > 10_000) throw new Error('Unsupported media project registry')
    const ids = data.workspaceIds.map(workspaceIdentity)
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate media project identity')
    return ids
  }

  /** Enable or disable a project; disabling retains all tags and original files. */
  set(workspaceId, enabled) {
    workspaceIdentity(workspaceId)
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be boolean')
    const operation = this.#pending.then(async () => {
      const ids = await this.list()
      const next = enabled ? [...new Set([...ids, workspaceId])] : ids.filter(id => id !== workspaceId)
      if (JSON.stringify(ids) === JSON.stringify(next)) return ids
      if (next.length > 10_000) throw new Error('Too many media projects')
      await writeDocument(this.#file, { version: 1, workspaceIds: next })
      return next
    })
    this.#pending = operation.catch(() => undefined)
    return operation
  }

  /** Wait for writes already accepted before unloading the plugin. */
  async drain() { await this.#pending }
}
