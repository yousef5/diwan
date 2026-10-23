// What the host the unit tests run on can do. The suite runs on Linux and on windows-latest (CI), so
// tests that rely on POSIX semantics (file modes, chmod-unreadable, root, FIFOs, /dev) or on symlinks
// ask here and skip where the answer is no.
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const isWindows = process.platform === 'win32'
export const isLinux = process.platform === 'linux'

// chmod-based "unreadable"/"read-only" tests mean nothing to root, and nothing at all on Windows.
export const canDenyAccess = !isWindows && process.getuid?.() !== 0

let symlinks: boolean | undefined
// Windows creates symlinks only with Developer Mode or an elevated token; probe once instead of guessing.
export function canSymlink(): boolean {
  if (symlinks !== undefined) return symlinks
  const dir = mkdtempSync(join(tmpdir(), 'diwan-symlink-probe-'))
  try {
    writeFileSync(join(dir, 'target'), '')
    symlinkSync(join(dir, 'target'), join(dir, 'link'), 'file')
    symlinks = true
  } catch {
    symlinks = false
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return symlinks
}
