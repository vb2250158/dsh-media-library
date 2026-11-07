import test from 'node:test'
import assert from 'node:assert/strict'
import { OpenList } from '../src/openlist.js'

test('lists mounted files with a bounded page and does not expose the token', async () => {
  let request
  const client = new OpenList({ baseUrl: 'http://127.0.0.1:5244', token: 'test-token', fetchImpl: async (url, init) => {
    request = { url: String(url), init }
    return new Response(JSON.stringify({ code: 200, data: { content: [{ name: 'a.mp4', size: 5, is_dir: false }], total: 1 } }))
  } })
  const result = await client.list('/media')
  assert.equal(request.url, 'http://127.0.0.1:5244/api/fs/list')
  assert.equal(request.init.redirect, 'error')
  assert.equal(result.items[0].name, 'a.mp4')
  assert.ok(!JSON.stringify(result).includes('test-token'))
})

test('rejects insecure remote servers and invalid pages', async () => {
  assert.throws(() => new OpenList({ baseUrl: 'http://example.com', token: 'x' }))
  const client = new OpenList({ baseUrl: 'https://example.com', token: 'x' })
  await assert.rejects(client.list('/', { perPage: 201 }))
})
