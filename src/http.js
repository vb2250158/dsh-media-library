/** Owner-authenticated JSON and bounded Range streaming for local media. @module */
import { pipeline } from 'node:stream/promises'

const BASE = '/media-library/'
const allowedErrors = new Set(['MEDIA_INVALID_REQUEST', 'MEDIA_INVALID_PATH', 'MEDIA_INVALID_PAGE', 'MEDIA_INVALID_ROOT', 'MEDIA_OUTSIDE_ROOT', 'MEDIA_LINK_REFUSED', 'MEDIA_UNSUPPORTED_TYPE', 'MEDIA_NOT_FILE', 'MEDIA_NOT_DIRECTORY', 'MEDIA_FILE_CHANGED', 'MEDIA_NOT_FOUND', 'MEDIA_NOT_READABLE', 'MEDIA_READ_FAILED', 'MEDIA_INVALID_TAGS', 'MEDIA_CATEGORY_EXISTS', 'MEDIA_CATEGORY_MISSING', 'MEDIA_TAG_EXISTS', 'MEDIA_WORKSPACE_MISSING', 'MEDIA_NOT_ENABLED', 'MEDIA_DIRECTORY_MISSING', 'MEDIA_DIRECTORY_CHANGED', 'MEDIA_DIRECTORY_LIMIT', 'MEDIA_UNLOADING'])

/** Parse a single byte range. Invalid or unsatisfiable ranges return null. */
export function byteRange(value, size) {
  if (!Number.isSafeInteger(size) || size < 0) return null
  if (value === undefined) return { start: 0, end: size - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2]) || size === 0) return null
  let start, end
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix); end = size - 1
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null
    end = Math.min(end, size - 1)
  }
  return { start, end, partial: true }
}

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(JSON.stringify(value))
}

async function bodyOf(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw Object.assign(new Error('content-type'), { code: 'MEDIA_INVALID_REQUEST' })
  let bytes = 0; const chunks = []
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 16_384) throw Object.assign(new Error('body-size'), { code: 'MEDIA_INVALID_REQUEST' }); chunks.push(chunk) }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('body'), { code: 'MEDIA_INVALID_REQUEST' })
  return body
}

function keys(body, allowed) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw Object.assign(new Error('unknown-field'), { code: 'MEDIA_INVALID_REQUEST' })
}

/** Build one effect-owned Web handler; neither auth failure nor missing membership reads files. */
export function createHandler({ connection, library, signal, logger }) {
  return async (request, response) => {
    const admission = connection.admit(request)
    if ('rejection' in admission) { response.writeHead(admission.rejection); response.end(); return }
    if (admission.peer.principal.kind !== 'owner') { response.writeHead(403); response.end(); return }
    const url = new URL(request.url, 'http://localhost')
    const action = url.pathname.slice(BASE.length)
    const write = ['projects/set', 'tags', 'tags/add', 'categories/create', 'categories/tags/add'].includes(action)
    if (write && request.method !== 'POST' || !write && !['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return }
    // Same-origin browsers send Origin on JSON POSTs. Refuse missing/foreign origins for writes.
    if (write) {
      let origin
      try { origin = new URL(request.headers.origin) } catch { response.writeHead(403); response.end(); return }
      if (origin.host !== request.headers.host || !['http:', 'https:'].includes(origin.protocol)) { response.writeHead(403); response.end(); return }
    }
    let file
    try {
      if (action === 'file') {
        file = await library.open(url.searchParams.get('workspaceId'), url.searchParams.get('path'))
        const range = byteRange(request.headers.range, file.stat.size)
        if (!range) { response.writeHead(416, { 'content-range': `bytes */${file.stat.size}`, 'cache-control': 'no-store' }); response.end(); return }
        const headers = { 'content-type': file.mimeType, 'content-length': range.end - range.start + 1, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'content-disposition': "inline; filename*=UTF-8''" + encodeURIComponent(file.name) }
        if (range.partial) headers['content-range'] = `bytes ${range.start}-${range.end}/${file.stat.size}`
        response.writeHead(range.partial ? 206 : 200, headers)
        if (request.method === 'HEAD' || file.stat.size === 0) { response.end(); return }
        const stream = file.handle.createReadStream({ start: range.start, end: range.end, autoClose: false })
        await pipeline(stream, response, { signal })
        return
      }
      let data
      if (action === 'state') data = await library.state()
      else if (action === 'categories') data = await library.tagCategories()
      else if (action === 'directory') data = await library.directory(url.searchParams.get('workspaceId'), url.searchParams.get('path') ?? '', { offset: Number(url.searchParams.get('offset') ?? 0), limit: Number(url.searchParams.get('limit') ?? 100), version: url.searchParams.get('version') ?? undefined })
      else if (action === 'projects/set') { const body = await bodyOf(request); keys(body, ['workspaceId', 'enabled']); data = await library.setProject(body.workspaceId, body.enabled) }
      else if (action === 'tags') { const body = await bodyOf(request); keys(body, ['workspaceId', 'path', 'tags']); data = await library.setTags(body.workspaceId, body.path, body.tags) }
      else if (action === 'tags/add') { const body = await bodyOf(request); keys(body, ['workspaceId', 'path', 'tags']); data = await library.addTags(body.workspaceId, body.path, body.tags) }
      else if (action === 'categories/create') { const body = await bodyOf(request); keys(body, ['name']); data = await library.createTagCategory(body.name) }
      else if (action === 'categories/tags/add') { const body = await bodyOf(request); keys(body, ['categoryId', 'name']); data = await library.addCategoryTag(body.categoryId, body.name) }
      else { response.writeHead(404); response.end(); return }
      json(response, 200, { ok: true, data })
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.destroy(); return }
      const code = allowedErrors.has(error.code) ? error.code : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'MEDIA_DIRECTORY_MISSING' : 'MEDIA_OPERATION_FAILED'
      if (code === 'MEDIA_OPERATION_FAILED') logger?.warn?.('media-library: %s failed (%s)', action, error.code ?? error.name)
      json(response, 400, { ok: false, error: { code, message: code } })
    } finally {
      if (file) await file.handle.close().catch(error => { logger?.warn?.('media-library: descriptor close failed (%s)', error.code ?? error.name) })
    }
  }
}
