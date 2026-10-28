/**
 * Agents: the repository's worktrees, each a place for a coding agent to work
 * without touching the others. Launch Claude Code, Codex, Gemini, Copilot or
 * OpenCode (whichever are installed) in an in-app terminal tab per worktree,
 * see which are running and what each worktree has changed.
 */
import { invoke } from '@tauri-apps/api/core'
import { Bot, FolderGit2, FolderOpen, Plus, RefreshCcw, SquareTerminal, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button, Empty, IconButton } from '../components/ui'
import { cx } from '../lib/cx'
import { reveal, run } from '../lib/git'
import { t } from '../lib/i18n'
import { newTab, showTab, useTerminal } from '../lib/terminal'
import type { Worktree } from '../lib/types'
import { useApp } from '../state'
import { PaneHead } from './Changes'

/** Agent CLIs, in the order they are offered. */
const AGENTS = [
  { cmd: 'claude', name: 'Claude Code' },
  { cmd: 'codex', name: 'Codex' },
  { cmd: 'gemini', name: 'Gemini' },
  { cmd: 'copilot', name: 'Copilot' },
  { cmd: 'opencode', name: 'OpenCode' },
]

type Status = { changes: number; ahead: number; behind: number }

async function worktreeStatus(path: string): Promise<Status | null> {
  const out = await run(path, ['status', '--porcelain=v1', '-b'])
  if (out.code !== 0) return null
  const [head = '', ...rest] = out.stdout.split('\n')
  return {
    changes: rest.filter(Boolean).length,
    ahead: Number(/ahead (\d+)/.exec(head)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(head)?.[1] ?? 0),
  }
}

/** A folder next to the repository: `~/code/app` → `~/code/app-fix-login`. */
const siblingPath = (root: string, branch: string) => `${root}-${branch.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')}`

export function AgentsView() {
  const { root, repo, act, ask, prompt, refresh } = useApp()
  const { tabs } = useTerminal()
  const [installed, setInstalled] = useState<string[] | null>(null)
  const [status, setStatus] = useState<Map<string, Status | null>>(new Map())

  useEffect(() => {
    void invoke<string[]>('installed_commands', { names: AGENTS.map(a => a.cmd) })
      .then(setInstalled)
      .catch(() => setInstalled([]))
  }, [])
  const worktrees = repo?.worktrees ?? []
  const key = worktrees.map(w => w.path).join('|')
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read when the worktree list or the repository changes
  const loadStatus = useCallback(async () => {
    const entries = await Promise.all(worktrees.map(async w => [w.path, await worktreeStatus(w.path).catch(() => null)] as const))
    setStatus(new Map(entries))
  }, [key])
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the counts as the repository changes
  useEffect(() => {
    void loadStatus()
  }, [loadStatus, repo])

  const agents = AGENTS.filter(a => installed?.includes(a.cmd))
  const launch = (w: Worktree, cmd?: string) => {
    const name = w.path.split('/').pop() ?? w.path
    const agent = AGENTS.find(a => a.cmd === cmd)
    newTab({ cwd: w.path, command: cmd, title: agent ? `${agent.name} — ${name}` : name })
  }
  const running = (w: Worktree) => tabs.filter(tab => tab.cwd === w.path && tab.command)

  const addWorktree = async () => {
    const branch = (await prompt({ title: t('New worktree for an agent'), placeholder: 'agent/fix-login', confirm: t('Create worktree') }))?.trim()
    if (!branch) return
    const path = siblingPath(root, branch)
    const exists = repo?.refs.some(r => r.kind === 'local' && r.name === branch)
    const ok = await act('Add worktree', ['worktree', 'add', ...(exists ? [path, branch] : ['-b', branch, path])], { done: t('Worktree ready at {path}', { path }) })
    if (ok && agents[0]) launch({ path, branch, isMain: false }, agents[0].cmd)
  }
  const removeWorktree = async (w: Worktree) => {
    if (
      await ask({
        title: t('Remove the worktree {name}?', { name: w.path.split('/').pop() ?? w.path }),
        text: t('Deletes the folder. Its branch {branch} stays. git refuses if the folder has uncommitted changes.', { branch: w.branch }),
        confirm: t('Remove'),
        danger: true,
      })
    )
      await act('Remove worktree', ['worktree', 'remove', w.path])
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PaneHead title={t('Agents')} count={worktrees.length}>
        <IconButton
          icon={RefreshCcw}
          title={t('Refresh')}
          onClick={() => {
            void refresh()
            void loadStatus()
          }}
        />
        <Button small kind="primary" icon={Plus} onClick={() => void addWorktree()}>
          {t('New worktree for an agent…')}
        </Button>
      </PaneHead>
      <div className="flex-1 overflow-y-auto p-3">
        <p className="m-0 mb-3 max-w-180 text-sm leading-normal text-muted">
          {t('Each worktree is a separate checkout on its own branch, so agents can work side by side. Agents run in the terminal panel below.')}
        </p>
        {installed?.length === 0 && (
          <div className="mb-3 max-w-180 rounded-md border border-dashed border-strong px-3 py-2 text-sm text-secondary">
            {t('No agent CLI found in your shell. Install Claude Code (claude), Codex (codex), Gemini (gemini), Copilot (copilot) or OpenCode (opencode).')}
          </div>
        )}
        {!worktrees.length && <Empty>{t('Loading…')}</Empty>}
        <div className="flex flex-col gap-1.5">
          {worktrees.map(w => {
            const st = status.get(w.path)
            const live = running(w)
            const name = w.path.split('/').pop() ?? w.path
            return (
              <div key={w.path} className={cx('flex items-center gap-3 rounded-lg border px-3 py-2.5', w.path === root ? 'border-focus bg-selected' : 'border-subtle bg-elevated')}>
                <FolderGit2 size={18} className="shrink-0 text-muted" />
                <div className="flex w-64 min-w-0 shrink flex-col">
                  <span className="truncate font-semibold" title={w.path}>
                    {name}
                    {w.isMain && <span className="ml-1.5 text-sm font-normal text-muted">{t('main checkout')}</span>}
                  </span>
                  <span className="truncate font-mono text-xs text-muted" title={w.branch}>
                    {w.branch}
                  </span>
                </div>
                <span className="w-32 shrink-0 text-sm">
                  {st === undefined ? (
                    <span className="text-faint">…</span>
                  ) : st === null ? (
                    <span className="text-status-deleted">{t('missing')}</span>
                  ) : st.changes ? (
                    <span className="text-status-modified">{t(st.changes === 1 ? '{n} change' : '{n} changes', { n: st.changes })}</span>
                  ) : (
                    <span className="text-muted">{t('clean')}</span>
                  )}
                  {!!st?.ahead && <span className="ml-1.5 text-ref-head">↑{st.ahead}</span>}
                  {!!st?.behind && <span className="ml-1 text-status-deleted">↓{st.behind}</span>}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {live.map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => showTab(tab.key)}
                      className="flex h-6 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--status-added)_14%,transparent)] px-2 text-sm font-medium text-status-added"
                      title={t('Show its terminal')}
                    >
                      <span className="size-1.5 animate-pulse rounded-full bg-status-added" />
                      {AGENTS.find(a => a.cmd === tab.command)?.name ?? tab.command}
                    </button>
                  ))}
                </span>
                {agents.map((a, i) => (
                  <Button
                    key={a.cmd}
                    small
                    kind={i === 0 ? 'primary' : 'secondary'}
                    icon={Bot}
                    onClick={() => launch(w, a.cmd)}
                    title={t('Run {cmd} in {name}', { cmd: a.cmd, name })}
                  >
                    {a.name}
                  </Button>
                ))}
                <IconButton icon={SquareTerminal} small title={t('Terminal in this worktree')} onClick={() => launch(w)} />
                <IconButton icon={FolderOpen} small title={t('Reveal in Finder')} onClick={() => void reveal(w.path)} />
                {/* The main checkout cannot be removed; keep its slot so the buttons line up. */}
                {w.isMain ? <span className="size-6 shrink-0" /> : <IconButton icon={Trash2} small title={t('Remove worktree')} onClick={() => void removeWorktree(w)} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
