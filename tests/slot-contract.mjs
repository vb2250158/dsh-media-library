/** Check the current Host's actual SlotRegistry, including the rejected keyed-field regression. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const host = process.argv[2]
if (!host) throw new Error('Pass the fixed current DSH source root')
const { Context } = await import(pathToFileURL(`${host}/vendor/cordis/lib/index.js`).href)
const { SlotRegistry } = await import(pathToFileURL(`${host}/packages/client/ui-renderer/src/client/registry.ts`).href)
const ctx = new Context()
await ctx.plugin(SlotRegistry)
const slots = ctx.slots
slots.register({ name: 'root', children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } } }, () => null)
const name = 'conversation.session.header.actions'
assert.throws(() => slots.register({ name, key: 'dsh-media-library' }, () => null), /requires options.id/)
const dispose = slots.register({ name, id: 'dsh-media-library', inject: sessionId => ({ sessionId }) }, () => null)
assert.equal(slots.entries(name).some(entry => entry.options.id === 'dsh-media-library'), true)
await dispose()
await ctx.fiber.dispose()
console.log('PASS real current SlotRegistry: list id accepted, keyed-only metadata rejected')
