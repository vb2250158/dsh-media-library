/** Local project media through the public Workspace, Connection and Web services. @module */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { MediaLibrary } from './library.js'
import { createHandler } from './http.js'

export const name = 'dsh-media-library'
export const inject = ['workspaceRegistry', 'connection', 'webServer']

/** Mount once; unloading cancels media streams and drains accepted metadata writes. */
export function apply(ctx) {
  const lifetime = new AbortController()
  const library = new MediaLibrary({ workspaceRegistry: ctx.workspaceRegistry, stateDir: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'state', 'media-library') })
  ctx.effect(() => () => { lifetime.abort(); return library.dispose() })
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/media-library', handler: createHandler({ connection: ctx.connection, library, signal: lifetime.signal, logger: ctx.logger }) }))
}
