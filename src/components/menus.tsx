/** Right-click menus for commits, files, branches and tags: GitHub links first, then git actions. */
import { CherryIcon, Copy, ExternalLink, GitBranchPlus, GitCompareArrows, Link, LogIn, Tag, Undo2 } from 'lucide-react'

import { links, webUrl } from '../lib/actions'
import { actions } from '../lib/git'
import { openUrl } from '../lib/github'
import { t } from '../lib/i18n'
import type { BranchRef, LogRow } from '../lib/types'
import { useApp } from '../state'
import type { MenuItem } from './Menu'

export function useMenus() {
  const { root, repo, act, ask, prompt, toast } = useApp()

  /** Runs `make` with the repository's github.com URL, or says why there is none. */
  const onGitHub = (make: (base: string) => string) => async () => {
    try {
      await openUrl(make(await webUrl(root)))
    } catch (e) {
      toast({ kind: 'error', title: t('Not on GitHub'), detail: e instanceof Error ? e.message : String(e) })
    }
  }
  const copy = (text: string | (() => Promise<string>), what: string) => async () => {
    try {
      await navigator.clipboard.writeText(typeof text === 'string' ? text : await text())
      toast({ kind: 'ok', title: t('{what} copied', { what: t(what) }) })
    } catch (e) {
      toast({ kind: 'error', title: t('Copy failed'), detail: String(e) })
    }
  }
  const permalink = (make: (base: string) => string) => async () => make(await webUrl(root))

  const commit = (row: Pick<LogRow, 'hash' | 'short' | 'subject'>): MenuItem[] => [
    { icon: ExternalLink, label: t('Open commit on GitHub'), run: onGitHub(b => links.commit(b, row.hash)) },
    {
      icon: Link,
      label: t('Copy permalink'),
      run: copy(
        permalink(b => links.commit(b, row.hash)),
        'Permalink',
      ),
    },
    { icon: Copy, label: t('Copy SHA'), run: copy(row.hash, 'SHA') },
    'separator',
    {
      icon: LogIn,
      label: t('Check out…'),
      run: async () => {
        if (
          await ask({ title: t('Check out {sha}?', { sha: row.short }), text: t('This puts HEAD in a detached state. Create a branch to keep new work.'), confirm: t('Check out') })
        )
          await act('Checkout', actions.checkoutCommit(row.hash))
      },
    },
    {
      icon: GitBranchPlus,
      label: t('New branch here…'),
      run: async () => {
        const name = await prompt({ title: t('New branch at {sha}', { sha: row.short }), placeholder: 'feature/name', confirm: t('Create and switch') })
        if (name) await act('Create branch', actions.createBranch(name.trim(), row.hash), { done: t('Switched to {name}', { name }) })
      },
    },
    {
      icon: CherryIcon,
      label: t('Cherry-pick'),
      disabled: row.hash === repo?.head,
      run: () => void act('Cherry-pick', actions.cherryPick(row.hash), { done: t('Cherry-picked') }),
    },
    {
      icon: Undo2,
      label: t('Revert'),
      run: async () => {
        if (await ask({ title: t('Revert {sha}?', { sha: row.short }), text: t('Creates a new commit that undoes “{subject}”.', { subject: row.subject }), confirm: t('Revert') }))
          await act('Revert', actions.revert(row.hash), { done: t('Reverted') })
      },
    },
  ]

  const file = (sha: string, path: string): MenuItem[] => [
    { icon: ExternalLink, label: t('Open file on GitHub'), run: onGitHub(b => links.file(b, sha, path)) },
    {
      icon: Link,
      label: t('Copy permalink'),
      run: copy(
        permalink(b => links.file(b, sha, path)),
        'Permalink',
      ),
    },
    { icon: Copy, label: t('Copy path'), run: copy(path, 'Path') },
  ]

  const branch = (ref: BranchRef): MenuItem[] => {
    // Remote refs are `origin/name`; GitHub knows them by `name`.
    const name = ref.kind === 'remote' ? ref.name.slice(ref.name.indexOf('/') + 1) : ref.name
    const base = repo?.refs.find(r => r.kind === 'local' && ['main', 'master'].includes(r.name))?.name ?? 'main'
    return [
      { icon: ExternalLink, label: t('Open branch on GitHub'), run: onGitHub(b => links.branch(b, name)) },
      { icon: GitCompareArrows, label: t('Compare on GitHub'), disabled: name === base, run: onGitHub(b => links.compare(b, name, base)) },
      { icon: Copy, label: t('Copy branch name'), run: copy(name, 'Branch name') },
      'separator',
      {
        icon: LogIn,
        label: t('Check out'),
        disabled: ref.isHead,
        run: () =>
          void act('Checkout', ref.kind === 'remote' ? actions.checkoutRemote(ref.name) : actions.checkout(ref.name), {
            done: t('Switched to {name}', { name: ref.name }),
          }),
      },
    ]
  }

  const tag = (name: string): MenuItem[] => [
    { icon: Tag, label: t('Open release on GitHub'), run: onGitHub(b => links.tag(b, name)) },
    { icon: Copy, label: t('Copy tag name'), run: copy(name, 'Tag name') },
  ]

  return { commit, file, branch, tag }
}
