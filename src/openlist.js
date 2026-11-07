/** Read a configured OpenList server without exposing its token to the caller. */
export class OpenList {
  #base
  #token
  #fetch

  constructor({ baseUrl, token, fetchImpl = fetch }) {
    const url = new URL(baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError('Invalid OpenList URL')
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new TypeError('Remote OpenList requires HTTPS')
    if (typeof token !== 'string' || !token.trim()) throw new TypeError('OpenList token is required')
    this.#base = `${url.href.replace(/\/+$/, '')}/`
    this.#token = token
    this.#fetch = fetchImpl
  }

  async list(path, { page = 1, perPage = 100, signal } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || !Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 200) throw new TypeError('Invalid listing request')
    const response = await this.#fetch(new URL('api/fs/list', this.#base), {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
      headers: { Authorization: this.#token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, password: '', page, per_page: perPage, refresh: false }),
    })
    if (!response.ok) throw new Error(`OpenList request failed (HTTP ${response.status})`)
    const data = await response.json()
    if (data.code !== 200 || !data.data || !(data.data.content === null || Array.isArray(data.data.content))) throw new Error('OpenList did not return a valid directory listing')
    return { items: (data.data.content ?? []).map(item => ({ name: item.name, size: item.size, isDirectory: item.is_dir, modified: item.modified })), total: data.data.total }
  }
}
