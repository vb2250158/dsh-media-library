import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
for (const file of await readdir(new URL('../src/', import.meta.url))) {
  if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', join(import.meta.dirname, '../src', file)], { stdio: 'inherit', windowsHide: true })
}
