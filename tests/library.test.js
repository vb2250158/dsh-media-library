import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaLibrary } from '../src/library.js'
import { ProjectStore } from '../src/project-store.js'

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-media-library-'))
  try {
    const media = join(root, 'media'); await mkdir(media)
    await writeFile(join(media, 'clip.mp4'), '0123456789')
    const registry = new Map([['project-one', { path: media, title: 'Media project' }]])
    const options = { workspaceRegistry: registry, stateDir: join(root, 'state') }
    await run({ root, media, registry, options, library: new MediaLibrary(options) })
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('designation persists by Workspace identity and tags survive cancellation without media changes', () => fixture(async ({ media, registry, options, library }) => {
  const story = []
  story.push((await library.state()).projects.length)
  await assert.rejects(library.directory('project-one', ''), error => error.code === 'MEDIA_NOT_ENABLED')
  await library.setProject('project-one', true)
  story.push((await library.state()).projects.map(x => ({ id: x.workspaceId, title: x.title })))
  const listing = await library.directory('project-one', '')
  story.push(listing.items.map(({ name, kind, tags }) => ({ name, kind, tags })))
  await library.setTags('project-one', 'clip.mp4', [' 鱼 ', '鱼', '片段'])
  const reloaded = new MediaLibrary(options)
  story.push((await reloaded.directory('project-one', '')).items[0].tags)
  registry.get('project-one').title = 'Renamed project'
  assert.equal((await reloaded.state()).projects[0].title, 'Renamed project')
  await reloaded.setProject('project-one', false)
  story.push((await reloaded.state()).projects.length)
  await assert.rejects(reloaded.open('project-one', 'clip.mp4'), error => error.code === 'MEDIA_NOT_ENABLED')
  await reloaded.setProject('project-one', true)
  story.push((await reloaded.directory('project-one', '')).items[0].tags)
  assert.equal(await readFile(join(media, 'clip.mp4'), 'utf8'), '0123456789')
  assert.deepEqual(story, JSON.parse(await readFile(new URL('./snapshots/library.json', import.meta.url))))
}))

test('unknown Workspace, arbitrary root paths and unsupported tag targets cannot become libraries', () => fixture(async ({ library }) => {
  await assert.rejects(library.setProject('missing', true), error => error.code === 'MEDIA_WORKSPACE_MISSING')
  assert.throws(() => library.setProject('../media', true))
  await library.setProject('project-one', true)
  await assert.rejects(library.setTags('project-one', '../clip.mp4', ['x']))
  await assert.rejects(library.setTags('project-one', 'clip.mp4', ['\n']))
}))

test('membership writer preserves concurrent projects and rejects malformed persisted state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-media-membership-'))
  try {
    const file = join(root, 'projects.json'), store = new ProjectStore(file)
    await Promise.all([store.set('first', true), store.set('second', true)])
    assert.deepEqual(await store.list(), ['first', 'second'])
    await writeFile(file, '{"version":1,"workspaceIds":["first","first"]}')
    await assert.rejects(store.set('third', true))
    assert.equal(await readFile(file, 'utf8'), '{"version":1,"workspaceIds":["first","first"]}')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('unload drains accepted writes and refuses further filesystem reads', () => fixture(async ({ library }) => {
  await library.setProject('project-one', true)
  const accepted = library.setTags('project-one', 'clip.mp4', ['saved'])
  await library.dispose()
  assert.deepEqual((await accepted).tags, ['saved'])
  await assert.rejects(library.directory('project-one', ''), error => error.code === 'MEDIA_UNLOADING')
  await assert.rejects(library.setProject('project-one', true), error => error.code === 'MEDIA_UNLOADING')
}))

test('category creation and additive media labels preserve existing labels', () => fixture(async ({ library, options }) => {
  await library.setProject('project-one', true)
  const category = await library.createTagCategory('类型')
  await library.addCategoryTag(category.id, '剧情')
  await library.addCategoryTag(category.id, '喜剧')
  await library.setTags('project-one', 'clip.mp4', ['自定义'])
  await Promise.all([library.addTags('project-one', 'clip.mp4', ['剧情']), library.addTags('project-one', 'clip.mp4', ['喜剧'])])
  const restored = new MediaLibrary(options)
  assert.deepEqual((await restored.tagCategories())[0].tags, ['剧情', '喜剧'])
  assert.deepEqual((await restored.directory('project-one', '')).items[0].tags, ['自定义', '剧情', '喜剧'])
  await assert.rejects(restored.addTags('project-one', '../clip.mp4', ['恶意']))
  await restored.dispose()
  await library.dispose()
}))
