/** Exercise the video grid with the Host's React and synthetic APIs. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const host = process.argv[2]
if (!host) throw new Error('Pass the current DSH source path')
const require = createRequire(join(resolve(host), 'packages/client/ui-primitives/package.json'))
const { JSDOM } = await import(pathToFileURL(require.resolve('jsdom')).href)
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })
const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), h = React.createElement
const components = { Button: ({ variant, children, ...props }) => h('button', props, children), Input: props => h('input', props) }
let descriptor, menu, dictionary, panel, opened = 0, unavailable = false, releaseState
const initialState = new Promise(resolve => { releaseState = resolve })
let delayState = true
const entries = new Map(), tags = new Map(), listeners = new Set(), added = [], replacements = []
const configuredFolders = [{ id: 'folder-1', path: '/media', name: 'media' }]
const categories = [{ id: 'cat', name: '类型', tags: ['动画', '冒险'] }, { id: 'language', name: '语言', tags: ['中文', '日语'] }]
const workspaces = { list: { snapshot: null, getSnapshot() { return this.snapshot }, subscribe(listener) { assert.equal(this.snapshot, snapshot); listeners.add(listener); return () => listeners.delete(listener) } } }
const snapshot = { items: [{ workspaceId: 'a', sessionIds: ['session-a', 'session-b'] }] }
workspaces.list.snapshot = snapshot
const sidebar = { mounted: { getSnapshot: () => 'session-a' }, openTab: () => { opened++ } }
const response = (data, ok = true, code = '') => ({ ok, json: async () => ok ? { ok: true, data } : { ok: false, error: { code } } })
const fetch = async (path, init = {}) => {
  const url = new URL(path, 'http://localhost'), body = init.body ? JSON.parse(init.body) : null
  if (url.pathname.endsWith('/state')) { if (delayState) await initialState; return response({ projects: [{ workspaceId: 'a', title: '测试媒体库' }] }) }
  if (url.pathname.endsWith('/folders')) return response({ folders: [...unavailable ? [{ id: 'offline', path: '/offline', name: 'offline' }] : [], ...configuredFolders] })
  if (url.pathname.endsWith('/folders/add')) { added.push(body.path); if (!configuredFolders.some(folder => folder.path === body.path)) configuredFolders.push({ id: 'folder-2', path: body.path, name: 'other' }); return response({ folders: [...configuredFolders] }) }
  if (url.pathname.endsWith('/index')) return response({ items: unavailable && url.searchParams.get('sourceId') === 'offline' ? [{ path: 'cached.mp4', name: 'cached.mp4', kind: 'video', size: 1, modified: '2024-01-01', tags: [] }] : [] })
  if (url.pathname.endsWith('/index/replace')) { replacements.push(body.sourceId); return response({ ok: true }) }
  if (url.pathname.endsWith('/categories')) return response(categories)
  if (url.pathname.endsWith('/directory')) {
    if (url.searchParams.get('sourceId') === 'offline') return response(null, false, 'MEDIA_NOT_READABLE')
    if (url.searchParams.get('sourceId') === 'folder-2') return response({ items: [{ path: 'other.mp4', name: 'other.mp4', kind: 'video', size: 1, modified: '2023-01-01', tags: [] }], hasMore: false, nextOffset: 1, version: 'v1' })
    return response({ items: url.searchParams.get('path') ? [{ path: 'nested/demo.mp4', name: 'demo.mp4', kind: 'video', size: 9, modified: '2024-01-01', tags: tags.get('nested/demo.mp4') ?? [] }, { path: 'nested/z.mp4', name: 'z.mp4', kind: 'video', size: 2, modified: '2025-01-01', tags: [] }] : [{ path: 'nested', name: 'nested', kind: 'directory' }], hasMore: false, nextOffset: 1, version: 'v1' })
  }
  if (url.pathname.endsWith('/tags/edit')) { const next = [...new Set([...(tags.get(body.path) ?? []).filter(tag => !body.remove.includes(tag)), ...body.add])]; tags.set(body.path, next); return response({ tags: next }) }
  throw new Error(`Unexpected request ${path}`)
}
vm.runInNewContext(await readFile(new URL('../src/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(value) { descriptor = value } } }, document, fetch, AbortController, AbortSignal, URLSearchParams, Intl, setTimeout, clearTimeout, console })
const plugin = descriptor.factory(name => name === 'react' ? React : components)
plugin.apply({ effect: callback => callback(), locale: { register(_ns, value) { dictionary = value.zh }, bind: () => key => dictionary[key] ?? key }, layout: { selectPanel: value => { panel = value }, panelInfo: { getSnapshot: () => ({ activePanelId: panel }) } }, sidebarRight: sidebar, sidebarRightTabs: { register: () => () => {} }, uiWorkspace: { listDirectory: async path => ({ path: path || '/media', crumbs: [], entries: [] }) }, workspaces, slots: { inject: (_name, callback) => callback(), register(spec, component) { entries.set(`${spec.name}:${spec.key ?? spec.id}`, { spec, component }); return () => {} } }, contextMenus: { register: value => { menu = value }, notify() {} } })
const slot = entries.get('sidebar.right.pane.tab:dsh-media-library')
const auto = entries.get('conversation.session.header.actions:dsh-media-library')
assert(slot && auto && menu)
const root = createRoot(document.getElementById('app'))
await act(async () => { root.render(h(slot.component, slot.spec.inject('session-a'))) })
assert(document.body.textContent.includes('正在读取'), 'pending membership shows loading instead of removal')
assert(!document.body.textContent.includes('此项目已移出媒体库'), 'pending membership does not report a removed library')
await act(async () => { delayState = false; releaseState(); await initialState })
assert(document.body.textContent.includes('demo.mp4'), 'nested video appears in grid')
assert(document.body.textContent.includes('未分类'))
assert(!document.querySelector('input[aria-label="分类名称"]'), 'category editor is not in the grid')
await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '设置').click())
assert(document.querySelector('input[aria-label="分类名称"]'), 'category editor is in settings')
assert(document.body.textContent.includes('/media'), 'selected media folder is visible in settings')
await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '浏览').click())
assert.equal(document.querySelector('input[aria-label="文件夹路径"]').value, '/media')
await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '添加文件夹').click())
assert.deepEqual(added, ['/media'])
const folderInput = document.querySelector('input[aria-label="文件夹路径"]')
await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(folderInput, '/other'); folderInput.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '添加文件夹').click())
assert.deepEqual(added, ['/media', '/other'])
assert(document.body.textContent.includes('/media') && document.body.textContent.includes('/other'), 'settings retains both folders')
await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '完成').click())
assert(document.body.textContent.includes('other.mp4'), 'videos from a second folder appear in the same grid')
assert(document.querySelector('.dsh-media-card').textContent.includes('z.mp4'), 'recent video appears first')
const sort = document.querySelector('select[aria-label="排序"]')
await act(async () => { sort.value = 'size'; sort.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
assert(document.querySelector('.dsh-media-card').textContent.includes('demo.mp4'), 'largest video appears first')
await act(async () => document.querySelector('.dsh-media-card').click())
const checks = [...document.querySelectorAll('input[type=checkbox]')]
assert.equal(checks.length, 4)
await act(async () => { checks[0].click(); checks[1].click() })
tags.set('nested/demo.mp4', ['AI'])
await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '保存标签').click())
assert.deepEqual(tags.get('nested/demo.mp4'), ['AI', '动画', '冒险'])
await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '关闭预览').click())
tags.set('nested/demo.mp4', ['动画', '中文'])
await act(async () => { [...document.querySelectorAll('button')].find(button => button.textContent === '刷新').click(); await new Promise(resolve => setTimeout(resolve, 10)) })
const clickFilter = async name => act(async () => [...document.querySelectorAll('.dsh-media-filters button')].find(button => button.textContent === name).click())
await clickFilter('动画'); await clickFilter('中文')
assert.equal(document.querySelectorAll('.dsh-media-card').length, 1, 'filters from different categories intersect')
await clickFilter('日语')
assert.equal(document.querySelectorAll('.dsh-media-card').length, 0, 'selecting a different tag replaces the category filter')
await clickFilter('日语')
assert.equal(document.querySelectorAll('.dsh-media-card').length, 1, 'clicking a selected tag clears its category filter')
await clickFilter('未分类')
assert.equal(document.querySelectorAll('.dsh-media-card').length, 2, 'uncategorized clears category filters')
await clickFilter('全部')
assert.equal(document.querySelectorAll('.dsh-media-card').length, 3, 'all clears every filter')
const search = document.querySelector('input[aria-label="搜索视频"]')
await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'other'); search.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
assert.equal(document.querySelectorAll('.dsh-media-card').length, 1, 'search filters videos by name')
await act(async () => document.querySelector('button[aria-label="清除搜索"]').click())
assert.equal(document.querySelectorAll('.dsh-media-card').length, 3, 'clearing search restores the video list')
unavailable = true; replacements.length = 0
await act(async () => { [...document.querySelectorAll('button')].find(button => button.textContent === '刷新').click(); await new Promise(resolve => setTimeout(resolve, 10)) })
assert(document.body.textContent.includes('cached.mp4'), 'offline folder keeps its prior index visible')
assert(document.body.textContent.includes('demo.mp4'), 'a later available folder is still scanned')
assert(document.body.textContent.includes('部分文件夹读取或索引更新未确认'), 'failed folder is reported')
assert(!replacements.includes('offline'), 'offline folder index is not replaced')
assert(replacements.includes('folder-1'), 'available folder index is updated')
await act(async () => root.render(h(auto.component, auto.spec.inject('session-a'))))
await act(async () => new Promise(resolve => setTimeout(resolve, 10)))
assert.equal(opened, 1, 'designated session opens the media tab')
const projectActions = await menu.resolve({ workspaceId: 'a' }, new AbortController().signal)
await act(async () => projectActions.find(action => action.id === 'open').run())
assert.equal(panel, 'media-library', 'Workspace open uses its main panel even with a mounted Session')
assert.equal(auto.spec.id, 'dsh-media-library', 'session-header list registration uses its required id field')
await act(async () => root.unmount())
dom.window.close()
console.log('PASS recursive grid, uncategorized default, multi-tag save and session tab')
