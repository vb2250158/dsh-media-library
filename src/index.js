/** Local project media through the public Workspace, Connection and Web services. @module */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { MediaLibrary } from './library.js'
import { createHandler } from './http.js'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-media-library'
export const inject = ['workspaceRegistry', 'connection', 'webServer', 'tools']

/** Mount once; unloading cancels media streams and drains accepted metadata writes. */
export function apply(ctx) {
  const lifetime = new AbortController()
  const library = new MediaLibrary({ workspaceRegistry: ctx.workspaceRegistry, stateDir: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'state', 'media-library') })
  ctx.effect(() => () => { lifetime.abort(); return library.dispose() })
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/media-library', handler: createHandler({ connection: ctx.connection, library, signal: lifetime.signal, logger: ctx.logger }) }))
  const output = { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'media_library_list', description: 'List designated media libraries. Pass a workspace ID to include its selected folders and categories.', parameters: { workspace_id: { type: 'string' } }, output,
    execute: async args => ({ ...(await library.state()), ...(args.workspace_id ? { folders: await library.folders(args.workspace_id), categories: await library.tagCategories(args.workspace_id) } : {}) }),
    presentCall: () => ({ card: 'generic', title: 'List media libraries', kind: 'read' }),
  })))
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'media_library_directory', description: 'List a page of files and their tags inside a designated media library. Use returned paths for tagging; recurse into directories to find videos.',
    parameters: { workspace_id: { type: 'string', required: true }, source_id: { type: 'string', required: true }, path: { type: 'string', required: true }, offset: { type: 'number' }, version: { type: 'string' } }, output,
    execute: args => library.directory(args.workspace_id, args.source_id, args.path, { offset: args.offset ?? 0, limit: 100, ...(args.version ? { version: args.version } : {}) }),
    presentCall: args => ({ card: 'generic', title: 'Browse media library', kind: 'read', rawInput: args.path }),
  })))
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'media_library_add_tags', description: 'Add comma-separated tags to an existing media file, retaining existing tags. Base labels on known evidence; do not claim to have viewed video content without doing so.',
    parameters: { workspace_id: { type: 'string', required: true }, source_id: { type: 'string', required: true }, path: { type: 'string', required: true }, tags: { type: 'string', required: true, description: 'Comma-separated labels.' } }, output,
    execute: args => library.addTags(args.workspace_id, args.source_id, args.path, args.tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean)),
    presentCall: args => ({ card: 'generic', title: 'Add media tags', kind: 'other', rawInput: args.path }),
  })))
}
