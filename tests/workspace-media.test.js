import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaLibrary } from '../src/library.js'

test('explicit external folders and independent workspaces retain multiple labels on removal and re-add', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-workspaces-'))
  try {
    const one = join(root, 'one'), two = join(root, 'two'), external = join(root, 'external')
    await Promise.all([mkdir(one), mkdir(two), mkdir(external)])
    await writeFile(join(one, 'unselected.mp4'), 'workspace')
    await writeFile(join(external, 'selected.mp4'), 'external')
    const registry = new Map([['one', { path: one, title: 'One' }], ['two', { path: two, title: 'Two' }]])
    const library = new MediaLibrary({ workspaceRegistry: registry, stateDir: join(root, 'home') })
    await library.setProject('one', true); await library.setProject('two', true)
    assert.deepEqual((await library.folders('one')).folders, [])
    const source = (await library.addFolder('one', external)).folders[0]
    assert.deepEqual((await library.directory('one', source.id, '')).items.map(item => item.name), ['selected.mp4'])
    await assert.rejects(library.directory('two', source.id, ''), error => error.code === 'MEDIA_SOURCE_MISSING')
    await library.setTags('one', source.id, 'selected.mp4', ['动画', '冒险'])
    const scan = [{ path: 'selected.mp4', name: 'selected.mp4', size: 8, modified: '2026-11-07T00:00:00.000Z' }]
    await library.replaceIndex('one', source.id, scan)
    assert.deepEqual((await library.index('one', source.id)).items[0].tags, ['动画', '冒险'])
    const indexPath = join(one, '.dsh-media-library', 'index.json')
    const before = await readFile(indexPath, 'utf8')
    await assert.rejects(library.replaceIndex('one', source.id, [{ ...scan[0], path: '../escape.mp4' }]), error => error.code === 'MEDIA_INVALID_INDEX')
    assert.equal(await readFile(indexPath, 'utf8'), before)
    await assert.rejects(library.replaceIndex('one', source.id, [...scan, ...scan]), error => error.code === 'MEDIA_INVALID_INDEX')
    assert.equal(await readFile(indexPath, 'utf8'), before)
    await assert.rejects(library.replaceIndex('one', source.id, Array(100_001).fill(scan[0])), error => error.code === 'MEDIA_INDEX_LIMIT')
    assert.equal(await readFile(indexPath, 'utf8'), before)
    const category = await library.createTagCategory('one', '类型')
    await library.addCategoryTag('one', category.id, '动画')
    assert.deepEqual(await library.tagCategories('two'), [])
    assert.match(await readFile(join(one, '.dsh-media-library', 'catalog.json'), 'utf8'), /动画/)
    assert.match(await readFile(join(one, '.dsh-media-library', 'folders.json'), 'utf8'), /selected|external/)
    await library.removeFolder('one', source.id)
    await assert.rejects(library.open('one', source.id, 'selected.mp4'), error => error.code === 'MEDIA_SOURCE_MISSING')
    const readded = (await library.addFolder('one', external)).folders[0]
    assert.equal(readded.id, source.id)
    assert.deepEqual((await library.directory('one', readded.id, '')).items[0].tags, ['动画', '冒险'])
    assert.deepEqual((await library.index('one', readded.id)).items[0].tags, ['动画', '冒险'])
    assert.equal(await readFile(join(external, 'selected.mp4'), 'utf8'), 'external')
    await library.dispose()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('old home labels migrate to a selected workspace subfolder without overwriting or deleting originals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-migrate-'))
  try {
    const workspace = join(root, 'work'), sub = join(workspace, 'video'), home = join(root, 'home')
    await mkdir(workspace); await mkdir(sub); await mkdir(home)
    await writeFile(join(sub, 'clip.mp4'), 'video')
    const oldCatalog = JSON.stringify({ version: 1, items: [{ source: 'one', path: '/video/clip.mp4', tags: ['旧标签'] }] })
    await writeFile(join(home, 'catalog.json'), oldCatalog)
    const oldTaxonomy = JSON.stringify({ version: 1, categories: [{ id: '00000000-0000-0000-0000-000000000001', name: '类型', tags: ['旧标签'] }] })
    await writeFile(join(home, 'tag-taxonomy.json'), oldTaxonomy)
    const library = new MediaLibrary({ workspaceRegistry: new Map([['one', { path: workspace, title: 'One' }]]), stateDir: home })
    await library.setProject('one', true)
    const folder = (await library.addFolder('one', sub)).folders[0]
    assert.deepEqual((await library.directory('one', folder.id, '')).items[0].tags, ['旧标签'])
    assert.equal((await library.tagCategories('one'))[0].name, '类型')
    await library.setTags('one', folder.id, 'clip.mp4', ['新标签'])
    await library.removeFolder('one', folder.id); await library.addFolder('one', sub)
    assert.deepEqual((await library.directory('one', folder.id, '')).items[0].tags, ['新标签'])
    assert.equal(await readFile(join(home, 'catalog.json'), 'utf8'), oldCatalog)
    assert.equal(await readFile(join(home, 'tag-taxonomy.json'), 'utf8'), oldTaxonomy)
    await library.dispose()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('a failed legacy import leaves original data intact and the folder disabled until retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-bad-legacy-'))
  try {
    const workspace = join(root, 'work'), home = join(root, 'home')
    await mkdir(workspace); await mkdir(home)
    await writeFile(join(home, 'catalog.json'), '{bad')
    const library = new MediaLibrary({ workspaceRegistry: new Map([['one', { path: workspace, title: 'One' }]]), stateDir: home })
    await library.setProject('one', true)
    await assert.rejects(library.addFolder('one', workspace))
    assert.deepEqual((await library.folders('one')).folders, [])
    assert.equal(await readFile(join(home, 'catalog.json'), 'utf8'), '{bad')
    await writeFile(join(home, 'catalog.json'), JSON.stringify({ version: 1, items: [] }))
    assert.equal((await library.addFolder('one', workspace)).folders.length, 1)
    await library.dispose()
  } finally { await rm(root, { recursive: true, force: true }) }
})
