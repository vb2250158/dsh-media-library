import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaLibrary } from '../src/library.js'
import { byteRange, createHandler } from '../src/http.js'

test('byte ranges include open-ended and suffix ranges and refuse multipart/overflow', () => {
  assert.deepEqual(byteRange(undefined, 10), { start: 0, end: 9, partial: false })
  assert.deepEqual(byteRange('bytes=2-4', 10), { start: 2, end: 4, partial: true })
  assert.deepEqual(byteRange('bytes=8-', 10), { start: 8, end: 9, partial: true })
  assert.deepEqual(byteRange('bytes=-2', 10), { start: 8, end: 9, partial: true })
  for (const value of ['bytes=10-', 'bytes=3-2', 'bytes=-0', 'bytes=0-1,5-8', 'bytes=9007199254740992-']) assert.equal(byteRange(value, 10), null)
})

test('workspace permission failures return a localized readable error code', async () => {
  const handler = createHandler({ library: { async folders() { throw Object.assign(new Error('private path'), { code: 'EACCES' }) } }, signal: new AbortController().signal, connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }) } })
  const server = createServer((request, response) => { void handler(request, response) })
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const response = await fetch(`http://127.0.0.1:${server.address().port}/media-library/folders?workspaceId=one`)
    const body = await response.json()
    assert.equal(body.error.code, 'MEDIA_NOT_READABLE')
    assert(!JSON.stringify(body).includes('private path'))
  } finally { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)) }
})

test('oversized index requests return a recognizable limit error before reading the body', async () => {
  const handler = createHandler({ library: {}, signal: new AbortController().signal, connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }) } })
  const server = createServer((request, response) => { void handler(request, response) })
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    const body = await new Promise((resolve, reject) => {
      const req = httpRequest(`${origin}/media-library/index/replace`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'content-length': String(32 * 1024 * 1024 + 1) } }, response => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
      })
      req.on('error', reject); req.end()
    })
    assert.equal(body.error.code, 'MEDIA_INDEX_LIMIT')
  } finally { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)) }
})

test('real HTTP enforces owner/origin, membership, Range/HEAD and saved-tag readback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-media-http-'))
  const media = join(root, 'media'); await mkdir(media); await writeFile(join(media, 'demo.mp4'), '0123456789')
  const library = new MediaLibrary({ workspaceRegistry: new Map([['test-project', { path: media, title: 'Test media' }]]), stateDir: join(root, 'state') })
  const lifetime = new AbortController()
  const handler = createHandler({ library, signal: lifetime.signal, connection: { admit(request) {
    if (request.headers.cookie === 'owner') return { peer: { principal: { kind: 'owner' } } }
    if (request.headers.cookie === 'viewer') return { peer: { principal: { kind: 'viewer' } } }
    return { rejection: 401 }
  } } })
  const server = createServer((request, response) => { void handler(request, response) })
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    const request = (path, options = {}) => fetch(origin + '/media-library/' + path, { ...options, headers: { cookie: 'owner', Connection: 'close', ...options.headers } })
    assert.equal((await request('state', { headers: { cookie: '' } })).status, 401)
    assert.equal((await request('state', { headers: { cookie: 'viewer' } })).status, 403)
    assert.equal((await request('projects/set', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"workspaceId":"test-project","enabled":true}' })).status, 403)
    const jsonPost = (path, body) => request(path, { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal((await jsonPost('projects/set', { workspaceId: 'test-project', enabled: true, path: '/' })).status, 400)
    assert((await (await jsonPost('projects/set', { workspaceId: 'test-project', enabled: true })).json()).ok)
    assert.deepEqual((await (await request('folders?workspaceId=test-project')).json()).data.folders, [])
    const sourceId = (await (await jsonPost('folders/add', { workspaceId: 'test-project', path: media })).json()).data.folders[0].id
    const fileQuery = `workspaceId=test-project&sourceId=${sourceId}&path=demo.mp4`
    const ranged = await request(`file?${fileQuery}`, { headers: { Range: 'bytes=2-5' } })
    assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await ranged.text(), '2345')
    const head = await request(`file?${fileQuery}`, { method: 'HEAD' })
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '10'); assert.equal(await head.text(), '')
    assert.equal((await request(`file?${fileQuery}`, { headers: { Range: 'bytes=20-' } })).status, 416)
    assert.equal((await request(`file?workspaceId=test-project&sourceId=${sourceId}&path=../secret.mp4`)).status, 400)
    assert((await (await jsonPost('tags', { workspaceId: 'test-project', sourceId, path: 'demo.mp4', tags: ['已看'] })).json()).ok)
    const category = (await (await jsonPost('categories/create', { workspaceId: 'test-project', name: '类型' })).json()).data
    assert((await (await jsonPost('categories/tags/add', { workspaceId: 'test-project', categoryId: category.id, name: '喜剧' })).json()).ok)
    assert.deepEqual((await (await request('categories?workspaceId=test-project')).json()).data[0].tags, ['喜剧'])
    assert.equal((await request('categories/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"无来源"}' })).status, 403)
    assert((await (await jsonPost('tags/add', { workspaceId: 'test-project', sourceId, path: 'demo.mp4', tags: ['喜剧'] })).json()).ok)
    const listing = await (await request(`directory?workspaceId=test-project&sourceId=${sourceId}`)).json()
    assert.deepEqual(listing.data.items[0].tags, ['已看', '喜剧'])
    const indexBody = { workspaceId: 'test-project', sourceId, items: [{ path: 'demo.mp4', name: 'demo.mp4', size: 10, modified: '2026-11-07T00:00:00.000Z' }] }
    assert((await (await jsonPost('index/replace', indexBody)).json()).ok)
    assert.deepEqual((await (await request(`index?workspaceId=test-project&sourceId=${sourceId}`)).json()).data.items[0].tags, ['已看', '喜剧'])
    assert.equal((await jsonPost('index/replace', { ...indexBody, items: [{ ...indexBody.items[0], path: '../bad.mp4' }] })).status, 400)
    assert.equal((await (await request(`index?workspaceId=test-project&sourceId=${sourceId}`)).json()).data.items[0].path, 'demo.mp4')
    const edit = { workspaceId: 'test-project', sourceId, path: 'demo.mp4', add: ['手工'], remove: ['已看'] }
    assert.equal((await request('tags/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(edit) })).status, 403)
    assert.equal((await request('tags/edit', { method: 'POST', headers: { Origin: 'http://example.test', 'content-type': 'application/json' }, body: JSON.stringify(edit) })).status, 403)
    assert.equal((await jsonPost('tags/edit', { ...edit, add: ['已看'] })).status, 400)
    assert.equal((await jsonPost('tags/edit', { ...edit, unexpected: true })).status, 400)
    assert.deepEqual((await (await jsonPost('tags/edit', edit)).json()).data.tags, ['喜剧', '手工'])
    assert.deepEqual((await (await request(`directory?workspaceId=test-project&sourceId=${sourceId}`)).json()).data.items[0].tags, ['喜剧', '手工'])
    await jsonPost('projects/set', { workspaceId: 'test-project', enabled: false })
    assert.equal((await request(`file?${fileQuery}`)).status, 400)
  } finally { lifetime.abort(); await library.dispose(); server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }) }
})
