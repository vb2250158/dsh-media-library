import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TagTaxonomy } from '../src/tag-taxonomy.js'

test('users can create categories and add multiple tags without losing concurrent changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tags-'))
  try {
    const taxonomy = new TagTaxonomy(join(root, 'tags.json'))
    const [genre, mood] = await Promise.all([taxonomy.createCategory('类型'), taxonomy.createCategory('情绪')])
    await Promise.all([taxonomy.addTag(genre.id, '喜剧'), taxonomy.addTag(genre.id, '剧情'), taxonomy.addTag(mood.id, '治愈')])
    assert.deepEqual((await taxonomy.list()).map(({ name, tags }) => ({ name, tags })), [{ name: '类型', tags: ['喜剧', '剧情'] }, { name: '情绪', tags: ['治愈'] }])
    await assert.rejects(taxonomy.addTag(genre.id, '喜剧'), { code: 'MEDIA_TAG_EXISTS' })
    await taxonomy.addTag(genre.id, '科幻')
    assert.equal((await taxonomy.list())[0].tags.length, 3)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('corrupt taxonomy is retained and no write is attempted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tags-'))
  try {
    const file = join(root, 'tags.json'); await writeFile(file, 'broken')
    await assert.rejects(new TagTaxonomy(file).createCategory('类型'))
    assert.equal(await readFile(file, 'utf8'), 'broken')
  } finally { await rm(root, { recursive: true, force: true }) }
})
