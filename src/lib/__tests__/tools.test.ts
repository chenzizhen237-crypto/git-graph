import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/path', () => ({ homeDir: vi.fn() }))

const { parseToolHelp } = await import('../tools')

const HELP = `'git difftool --tool=<tool>' may be set to one of the following:
\t\tnvimdiff         Use Neovim
\t\topendiff         Use FileMerge (requires a graphical session)
\t\tvscode           Use Visual Studio Code (requires a graphical session)

The following tools are valid, but not currently available:
\t\tmeld             Use Meld (requires a graphical session)
`

describe('parseToolHelp', () => {
  it('lists the available windowed tools only', () => {
    expect(parseToolHelp(HELP)).toEqual(['opendiff', 'vscode'])
  })
  it('is empty when git lists nothing', () => {
    expect(parseToolHelp('No tools found')).toEqual([])
  })
})
