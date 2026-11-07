/** Bounded, read-only access to one explicitly selected local media directory. @module */
import { constants } from 'node:fs'
import { lstat, open, opendir, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path'

/** Protocol MIME allowlist; active document formats such as SVG and HTML are deliberately absent. */
const MEDIA_TYPES = new Map([
  ['.mp4', ['video', 'video/mp4']], ['.m4v', ['video', 'video/mp4']],
  ['.webm', ['video', 'video/webm']], ['.ogv', ['video', 'video/ogg']],
  ['.mov', ['video', 'video/quicktime']], ['.mkv', ['video', 'video/x-matroska']],
  ['.avi', ['video', 'video/x-msvideo']],
  ['.mp3', ['audio', 'audio/mpeg']], ['.wav', ['audio', 'audio/wav']],
  ['.ogg', ['audio', 'audio/ogg']], ['.oga', ['audio', 'audio/ogg']],
  ['.opus', ['audio', 'audio/ogg']], ['.m4a', ['audio', 'audio/mp4']],
  ['.aac', ['audio', 'audio/aac']], ['.flac', ['audio', 'audio/flac']],
  ['.jpg', ['image', 'image/jpeg']], ['.jpeg', ['image', 'image/jpeg']],
  ['.png', ['image', 'image/png']], ['.gif', ['image', 'image/gif']],
  ['.webp', ['image', 'image/webp']], ['.avif', ['image', 'image/avif']],
  ['.bmp', ['image', 'image/bmp']],
])

/** At most this many raw directory entries are examined by one offset-based browse. */
const MAX_DIRECTORY_ENTRIES = 100_000

/** Failure carrying a safe code/message, never the local absolute path. */
export class MediaReadError extends Error {
  /** @param {string} code Stable failure code. @param {string} message Safe operator-facing explanation. */
  constructor(code, message) {
    super(message)
    this.name = 'MediaReadError'
    this.code = code
  }
}

/** @param {unknown} value Untrusted relative path. @param {boolean} allowRoot Whether the empty root path is accepted. @returns {string[]} Validated path segments. */
function segmentsOf(value, allowRoot) {
  if (typeof value !== 'string' || value.length > 4096 || /[\\:\x00-\x1f\x7f]/u.test(value) || isAbsolute(value)) {
    throw new MediaReadError('MEDIA_INVALID_PATH', 'Choose a relative path inside this media library.')
  }
  if (value === '' && allowRoot) return []
  const segments = value.split('/')
  if (segments.length > 100 || segments.some(segment => (
    segment === '' || segment.startsWith('.') || /[. ]$/u.test(segment)
    || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(segment)
  ))) throw new MediaReadError('MEDIA_INVALID_PATH', 'Choose a visible relative path inside this media library.')
  return segments
}

/** @param {string} root Canonical root. @param {string} path Canonical candidate. @returns {boolean} Whether candidate is root or one of its descendants. */
function within(root, path) {
  const suffix = relative(root, path)
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`))
}

/** @param {import('node:fs').Stats} value Directory metadata. @returns {string} Browse generation token; contains no host path. */
function directoryVersion(value) {
  return `${value.dev}:${value.ino}:${value.mtimeMs}:${value.ctimeMs}`
}

/** @param {unknown} error Filesystem failure. @returns {Error} Safe public failure preserving explicit policy errors. */
function safeError(error) {
  if (error instanceof MediaReadError) return error
  if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
    return new MediaReadError('MEDIA_NOT_FOUND', 'The media item is no longer available. Refresh this directory.')
  }
  if (error?.code === 'EACCES' || error?.code === 'EPERM') {
    return new MediaReadError('MEDIA_NOT_READABLE', 'This media item cannot be read with the current Host permissions.')
  }
  return new MediaReadError('MEDIA_READ_FAILED', 'The media directory could not be read. Check its availability and retry.')
}

/**
 * A reader owns one canonical root; no media bytes or directory entries are cached.
 *
 * Every path is rechecked against that root and child symlinks/junctions are refused,
 * including links whose targets stay inside the library. This does not provide an
 * atomic sandbox against an adversary concurrently replacing writable ancestors on
 * Windows. Deploy on trusted local directories, not adversary-writable trees.
 */
export class LocalMedia {
  #root

  /** @param {string} root Absolute existing directory selected by the Workspace owner. */
  constructor(root) {
    if (typeof root !== 'string' || !isAbsolute(root) || root.includes('\0')) {
      throw new MediaReadError('MEDIA_INVALID_ROOT', 'The media library needs an absolute local directory.')
    }
    this.#root = root
  }

  /** @returns {Promise<string>} Canonical existing root directory. */
  async #canonicalRoot() {
    const canonical = await realpath(this.#root)
    if (!(await stat(canonical)).isDirectory()) {
      throw new MediaReadError('MEDIA_INVALID_ROOT', 'The media library location is not a directory.')
    }
    return canonical
  }

  /**
   * @param {string} root Canonical root for this operation.
   * @param {string[]} segments Validated root-relative components.
   * @returns {Promise<{path:string,info:import('node:fs').Stats}>} Canonical checked path and metadata.
   */
  async #resolve(root, segments) {
    let path = root
    let info = await lstat(root)
    for (const segment of segments) {
      path = join(path, segment)
      info = await lstat(path)
      if (info.isSymbolicLink()) {
        throw new MediaReadError('MEDIA_LINK_REFUSED', 'Linked files and directories are not opened by this media library.')
      }
    }
    const canonical = await realpath(path)
    if (!within(root, canonical)) throw new MediaReadError('MEDIA_OUTSIDE_ROOT', 'The item is outside this media library.')
    return { path: canonical, info }
  }

  /**
   * Read one native-order page without recursion or a full-directory in-memory sort.
   *
   * With no path, browse the root. Offset counts visible supported media/directories,
   * not hidden/unsupported entries. First-page version may be omitted; subsequent
   * pages pass the returned version and refresh on MEDIA_DIRECTORY_CHANGED. Omission
   * begins a new view. Concurrent directory mutation rejects the whole page.
   *
   * @param {string} [relativePath=''] Root-relative directory using '/' separators.
   * @param {{offset?:number,limit?:number,version?:string}} [options={}] Page offset, 1–200 page limit and prior directory generation.
   * @returns {Promise<{items:Array<{path:string,name:string,kind:string,size:number,modified:string}>,hasMore:boolean,nextOffset:number,version:string}>} One bounded page and its continuation.
   */
  async list(relativePath = '', { offset = 0, limit = 100, version } = {}) {
    const segments = segmentsOf(relativePath, true)
    if (!Number.isInteger(offset) || offset < 0 || offset >= MAX_DIRECTORY_ENTRIES
      || !Number.isInteger(limit) || limit < 1 || limit > 200
      || (version !== undefined && (typeof version !== 'string' || version.length > 160))) {
      throw new MediaReadError('MEDIA_INVALID_PAGE', 'Choose a valid media page with at most 200 entries.')
    }
    try {
      const root = await this.#canonicalRoot()
      const directory = await this.#resolve(root, segments)
      if (!directory.info.isDirectory()) throw new MediaReadError('MEDIA_NOT_DIRECTORY', 'Choose a media directory to browse.')
      const initialVersion = directoryVersion(directory.info)
      if (version !== undefined && version !== initialVersion) {
        throw new MediaReadError('MEDIA_DIRECTORY_CHANGED', 'This directory changed. Refresh before loading another page.')
      }
      const items = []
      let examined = 0
      let supported = 0
      let hasMore = false
      for await (const entry of await opendir(directory.path)) {
        examined++
        if (examined > MAX_DIRECTORY_ENTRIES) {
          throw new MediaReadError('MEDIA_DIRECTORY_LIMIT', 'This directory exceeds the 100,000-entry browse limit. Open a smaller subdirectory.')
        }
        const type = MEDIA_TYPES.get(extname(entry.name).toLowerCase())
        if (!entry.isDirectory() && (!entry.isFile() || type === undefined)) continue
        try { segmentsOf(entry.name, false) }
        catch (error) {
          if (error instanceof MediaReadError && error.code === 'MEDIA_INVALID_PATH') continue
          throw error
        }
        const candidate = await this.#resolve(root, [...segments, entry.name])
        if (!candidate.info.isDirectory() && !candidate.info.isFile()) continue
        // A replaced entry must still be of the type the iterator announced.
        if (entry.isDirectory() !== candidate.info.isDirectory()) {
          throw new MediaReadError('MEDIA_DIRECTORY_CHANGED', 'This directory changed. Refresh before loading another page.')
        }
        if (supported++ < offset) continue
        if (items.length === limit) { hasMore = true; break }
        items.push({
          path: [...segments, entry.name].join('/'), name: entry.name,
          kind: candidate.info.isDirectory() ? 'directory' : type[0],
          size: candidate.info.isFile() ? candidate.info.size : 0,
          modified: candidate.info.mtime.toISOString(),
        })
      }
      const finalDirectory = await this.#resolve(root, segments)
      if (directoryVersion(finalDirectory.info) !== initialVersion) {
        throw new MediaReadError('MEDIA_DIRECTORY_CHANGED', 'This directory changed. Refresh before loading another page.')
      }
      return { items, hasMore, nextOffset: offset + items.length, version: initialVersion }
    } catch (error) { throw safeError(error) }
  }

  /**
   * Open a supported regular media file for streaming; caller owns handle closure.
   *
   * The file is checked before and after open. No directory, hidden path, link,
   * unsupported extension, or special device is opened for streaming. Extension
   * acceptance states a media type, not a browser codec compatibility guarantee.
   *
   * @param {string} relativePath Nonempty root-relative media path using '/'.
   * @returns {Promise<{handle:import('node:fs/promises').FileHandle,stat:import('node:fs').Stats,mimeType:string,name:string}>} Read-only file descriptor and its exact opened metadata.
   */
  async open(relativePath) {
    const segments = segmentsOf(relativePath, false)
    const type = MEDIA_TYPES.get(extname(segments.at(-1)).toLowerCase())
    if (type === undefined) throw new MediaReadError('MEDIA_UNSUPPORTED_TYPE', 'This file type is not available for media playback.')
    let handle
    try {
      const root = await this.#canonicalRoot()
      const before = await this.#resolve(root, segments)
      if (!before.info.isFile()) throw new MediaReadError('MEDIA_NOT_FILE', 'Choose a regular media file for playback.')
      const flags = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW ?? 0)
      handle = await open(before.path, flags)
      const opened = await handle.stat()
      const after = await this.#resolve(root, segments)
      if (!opened.isFile() || after.path !== before.path
        || opened.dev !== before.info.dev || opened.ino !== before.info.ino
        || opened.dev !== after.info.dev || opened.ino !== after.info.ino) {
        throw new MediaReadError('MEDIA_FILE_CHANGED', 'This media file changed while opening. Refresh and try again.')
      }
      return { handle, stat: opened, mimeType: type[1], name: basename(before.path) }
    } catch (error) {
      if (handle !== undefined) await handle.close()
      throw safeError(error)
    }
  }
}
