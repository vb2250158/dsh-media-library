/** Exercise the shipped client with the current Host's React and synthetic primitives/API. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const host = process.argv[2]
if (!host) throw new Error('Usage: node tests/client-interaction.mjs <current DSH source>')
const require = createRequire(join(resolve(host), 'packages/client/ui-primitives/package.json'))
const { JSDOM } = await import(pathToFileURL(require.resolve('jsdom')).href)
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })
const React = require('react'), { act } = React, { createRoot } = require('react-dom/client'), h = React.createElement
const primitives = {
  Button: ({ variant, children, ...props }) => h('button', props, children),
  Input: props => h('input', props),
}
let descriptor, dictionary, menu, unregisterCount = 0, panel = null, failSet = false, failTags = false, failDirectory = false, staleRead = null, manyPages = false
const registrations = new Map(), disposers = [], calls = [], notices = [], tags = new Map()
let projects = []
const response = (data, ok = true, code = undefined) => ({ ok, json: async () => ok ? { ok: true, data } : { ok: false, error: { code, message: 'Synthetic failure' } } })
const initialItems = [
  { path: '子目录', name: '子目录', kind: 'directory', size: 0, modified: '' },
  { path: 'demo.mp4', name: 'demo.mp4', kind: 'video', size: 5120, modified: '' },
  { path: 'sound.wav', name: 'sound.wav', kind: 'audio', size: 1200, modified: '' },
  { path: 'image.png', name: 'image.png', kind: 'image', size: 1500, modified: '' },
]
const clone = value => JSON.parse(JSON.stringify(value))
const fetchStub = async (path, init = {}) => {
  const url = new URL(path, 'http://localhost'), body = init.body === undefined ? null : JSON.parse(init.body)
  calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), body, signal: init.signal, credentials: init.credentials })
  if (url.pathname === '/media-library/state') return response({ projects: clone(projects) })
  if (url.pathname === '/media-library/projects/set') {
    if (failSet) return response(null, false, 'MEDIA_ACCESS_DENIED')
    projects = projects.filter(project => project.workspaceId !== body.workspaceId)
    if (body.enabled) projects.push({ workspaceId: body.workspaceId, title: body.workspaceId === 'a' ? '项目 A' : '项目 B', path: '/synthetic' })
    return response({ projects: clone(projects) })
  }
  if (url.pathname === '/media-library/directory') {
    if (staleRead) { const pending = staleRead; staleRead = null; return pending.promise }
    if (failDirectory) return response(null, false, 'MEDIA_DIRECTORY_CHANGED')
    const mediaPath = url.searchParams.get('path'), offset = url.searchParams.get('offset')
    const items = manyPages ? Array.from({ length: 100 }, (_, index) => ({ path: `media-${Number(offset) + index}.mp4`, name: `media-${Number(offset) + index}.mp4`, kind: 'video', size: 1 }))
      : mediaPath === '子目录' ? [] : offset === '100' ? [{ path: 'last.mp4', name: 'last.mp4', kind: 'video', size: 1 }] : initialItems
    return response({ items: items.map(item => ({ ...item, tags: tags.get(item.path) ?? [] })), hasMore: manyPages ? Number(offset) < 400 : mediaPath === '' && offset === '0', nextOffset: manyPages ? Number(offset) + 100 : 100, version: 'fixture-directory-v1' })
  }
  if (url.pathname === '/media-library/tags') {
    if (failTags) return response(null, false, 'MEDIA_SAVE_FAILED')
    tags.set(body.path, body.tags)
    return response({ source: body.workspaceId, path: `/${body.path}`, tags: body.tags })
  }
  throw new Error(`Unexpected fixture request: ${url.pathname}`)
}
vm.runInNewContext(await readFile(new URL('../src/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { descriptor = value } } }, document,
  fetch: fetchStub, AbortController, AbortSignal, URLSearchParams, Intl,
})
const plugin = descriptor.factory(name => name === 'react' ? React : primitives)
plugin.apply({
  effect(callback) { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose) },
  locale: { register(_ns, dictionaries) { dictionary = dictionaries.zh; return () => {} }, bind() { return key => dictionary[key] ?? key } },
  layout: { selectPanel(id) { panel = id }, panelInfo: { getSnapshot() { return { activePanelId: panel } } } },
  slots: { inject(_name, callback) { callback() }, register(spec, Component) { registrations.set(`${spec.name}:${spec.key}`, { spec, Component }); return () => registrations.delete(`${spec.name}:${spec.key}`) } },
  contextMenus: { register(value) { menu = value; return () => { unregisterCount++ } }, notify(...args) { notices.push(args) } },
})
const main = registrations.get('main:media-library'), config = registrations.get('plugins.bundle.config:dsh-media-library')
assert(main && config)
let checks = 0
const check = (name, run) => { run(); checks++; console.log(`PASS ${name}`) }
const click = async label => {
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === label)
  assert(button, `Missing button ${label}`)
  await act(async () => button.click())
}
const controller = new AbortController()
const setAction = (await menu.resolve({ workspaceId: 'a', path: '/never-used-client-path', displayTitle: 'A' }, controller.signal))[0]
check('right-click resolution does not write configuration', () => { assert.equal(setAction.label, '设为媒体库'); assert.equal(calls.filter(call => call.body).length, 0) })
await setAction.run()
check('designation captures clicked Workspace identity and selects the registered panel', () => {
  assert.equal(calls.find(call => call.body)?.body.workspaceId, 'a'); assert.equal(main.spec.inject().selectedSnapshot(), 'a'); assert.equal(panel, 'media-library')
})
failSet = true
const failedAction = (await menu.resolve({ workspaceId: 'b', path: '/unused', displayTitle: 'B' }, controller.signal))[0]
await assert.rejects(failedAction.run())
check('a failed designation is returned to the shared menu owner', () => assert.equal(main.spec.inject().selectedSnapshot(), 'a'))
failSet = false
const root = createRoot(document.getElementById('app'))
await act(async () => root.render(h(main.Component, main.spec.inject())))
check('designated project lists its media using the real client component', () => { assert(document.body.textContent.includes('demo.mp4')); assert(document.body.textContent.includes('项目 A')) })
await click('子目录')
check('subdirectory browsing retains the project and reports empty content', () => { assert(document.body.textContent.includes('此目录没有可浏览')); assert.equal(calls.at(-1).query.path, '子目录') })
await click('上一层')
await click('下一页')
check('next page replaces prior rows and supplies the first page version and offset', () => { assert.equal(calls.at(-1).query.version, 'fixture-directory-v1'); assert.equal(calls.at(-1).query.offset, '100'); assert(document.body.textContent.includes('last.mp4')); assert(!document.body.textContent.includes('demo.mp4')) })
await click('上一页')
check('previous page reloads rather than retaining a growing row cache', () => { assert.equal(calls.at(-1).query.version, 'fixture-directory-v1'); assert.equal(calls.at(-1).query.offset, '0'); assert(!document.body.textContent.includes('last.mp4')); assert(document.body.textContent.includes('demo.mp4')) })
await click('下一页')
await click('刷新')
check('refresh returns to the first page without retaining an old directory version', () => { assert.equal(calls.at(-1).query.offset, '0'); assert.equal(calls.at(-1).query.version, undefined); assert(!document.body.textContent.includes('last.mp4')) })
await click('demo.mp4')
check('video preview uses an authenticated same-origin media URL without a token', () => { const video = document.querySelector('video'); assert(video); assert.equal(new URL(video.src).searchParams.get('workspaceId'), 'a'); assert(!video.src.includes('token')) })
const input = document.querySelector('input[aria-label="标签"]')
await act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, '鱼, 片段,鱼')
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
})
await click('保存标签')
check('tag save writes normalized tags to the Host and displays its acknowledgement', () => { assert.deepEqual(tags.get('demo.mp4'), ['鱼', '片段']); assert(document.body.textContent.includes('标签已保存')) })
await click('关闭预览')
await click('刷新')
await click('demo.mp4')
check('reopening reads saved tags from the API rather than a local cache', () => assert.equal(document.querySelector('input[aria-label="标签"]').value, '鱼, 片段'))
await act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(document.querySelector('input'), 'new')
  document.querySelector('input').dispatchEvent(new dom.window.Event('input', { bubbles: true }))
})
failTags = true
await click('保存标签')
check('failed tag save retains the draft and reports an unconfirmed write', () => { assert.equal(document.querySelector('input').value, 'new'); assert(document.body.textContent.includes('标签保存未确认')); assert.deepEqual(tags.get('demo.mp4'), ['鱼', '片段']) })
failTags = false
await click('关闭预览')
failDirectory = true
await click('刷新')
check('changed directories invalidate continuation and require refresh', () => { assert(document.body.textContent.includes('目录已变化')); assert(![...document.querySelectorAll('button')].some(button => button.textContent === '下一页')) })
failDirectory = false
await click('刷新')
await click('sound.wav')
check('audio files use the browser audio player', () => assert(document.querySelector('audio')))
await click('关闭预览')
await click('image.png')
check('images use the browser image element', () => assert(document.querySelector('img[alt="image.png"]')))
await click('关闭预览')
manyPages = true
await click('刷新')
for (let page = 0; page < 4; page++) {
  assert.equal(document.querySelectorAll('.dsh-media-files>li').length, 100)
  await click('下一页')
}
check('five page visits retain only one hundred mounted file rows', () => { assert.equal(document.querySelectorAll('.dsh-media-files>li').length, 100); assert(document.body.textContent.includes('media-400.mp4')); assert(!document.body.textContent.includes('media-0.mp4')) })
manyPages = false
await click('刷新')
let releaseStale
staleRead = { promise: new Promise(resolve => { releaseStale = resolve }) }
await click('刷新')
const oldRead = calls.at(-1)
const enableOther = (await menu.resolve({ workspaceId: 'b', path: '/unused', displayTitle: 'B' }, controller.signal))[0]
await act(async () => enableOther.run())
await act(async () => releaseStale(response({ items: [{ name: 'stale-entry.mp4', path: 'stale-entry.mp4', kind: 'video', tags: [] }], hasMore: false, nextOffset: 0, version: 'old' })))
check('project navigation aborts an old directory read and ignores its late reply', () => { assert(oldRead.signal.aborted); assert(!document.body.textContent.includes('stale-entry.mp4')); assert.equal(main.spec.inject().selectedSnapshot(), 'b') })
await act(async () => main.spec.inject().selectProject('a'))
const enabledActions = await menu.resolve({ workspaceId: 'a', path: '/unused', displayTitle: 'A' }, controller.signal)
await act(async () => enabledActions.find(action => action.id === 'remove').run())
check('removing designation leaves metadata and does not send a media deletion', () => { assert.equal(main.spec.inject().selectedSnapshot(), null); assert.deepEqual(tags.get('demo.mp4'), ['鱼', '片段']); assert(!document.body.textContent.includes('项目 A')); assert(!calls.some(call => /delete/.test(call.path))) })
await act(async () => root.unmount())
for (const dispose of disposers.reverse()) dispose()
check('plugin unload releases menus/styles and returns its active panel to chat', () => { assert.equal(unregisterCount, 1); assert.equal(document.head.querySelectorAll('style').length, 0); assert.equal(panel, null) })
dom.window.close()
console.log(JSON.stringify({ fixture: 'shipped React client with synthetic primitives and API', passed: checks, failed: 0, actualBrowserQa: false }))
