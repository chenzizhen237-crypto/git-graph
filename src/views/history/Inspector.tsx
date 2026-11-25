/** Commit inspector: metadata, signature verification, changed files/tree, and diff viewer. */
import {
  CherryIcon,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FileText,
  FolderTree,
  GitBranchPlus,
  GitCommitHorizontal,
  LogIn,
  type LucideIcon,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Undo2,
} from 'lucide-react'
import { Fragment, type ReactNode, useEffect, useState } from 'react'

import { DiffView } from '../../components/Diff'
import { useMenus } from '../../components/menus'
import { Resizer, usePanelSize } from '../../components/Split'
import { Avatar, Chip, Count, Empty, FilePath, fileRowClass, IconButton, LineStats, refChips, StatusBadge, splitPath } from '../../components/ui'
import { cx } from '../../lib/cx'
import { actions, commitDetail, commitFileDiff, run } from '../../lib/git'
import { t } from '../../lib/i18n'
import { useSettings } from '../../lib/settings'
import type { CommitDetail, CommitFile } from '../../lib/types'
import { useApp, useRemoteNames } from '../../state'

/** `git log %G?`: G good, U good but untrusted, E no key to check, others bad. */
function SignatureBadge({ status, signer }: { status: string; signer: string }) {
  const good = status === 'G' || status === 'U'
  const unknown = status === 'E'
  const label = good ? t('Verified') : unknown ? t('Signed') : t('Bad signature')
  const title = good ? signer : unknown ? t('Signed, but the key to check it is not here') : t('The signature does not match')
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium',
        good ? 'bg-ref-local-soft text-ref-local' : unknown ? 'bg-surface text-muted' : 'bg-diff-del-bg text-status-deleted',
      )}
    >
      {good ? <ShieldCheck size={13} /> : unknown ? <Shield size={13} /> : <ShieldAlert size={13} />}
      {label}
    </span>
  )
}

/** Files grouped by folder, for the Tree tab. */
function byFolder(files: CommitFile[]) {
  const groups = new Map<string, CommitFile[]>()
  for (const f of files) {
    const { dir } = splitPath(f.path)
    groups.set(dir, [...(groups.get(dir) ?? []), f])
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
}

/** Tab/Active and Tab/Inactive. */
function Tab({ on, icon: Icon, children, onClick }: { on: boolean; icon: LucideIcon; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('-mb-px flex items-center gap-1.25 border-b-2 py-2', on ? 'border-primary font-semibold text-primary' : 'border-transparent font-medium text-muted')}
    >
      <Icon size={13} />
      {children}
    </button>
  )
}

export function Inspector({ width }: { width: number }) {
  const { root, repo, selected, setSelected, act, prompt, ask, toast, openMenu } = useApp()
  const menus = useMenus()
  const remotes = useRemoteNames()
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [file, setFile] = useState<CommitFile | null>(null)
  const [diff, setDiff] = useState<{ text: string; truncated: boolean; loading: boolean }>({ text: '', truncated: false, loading: false })
  const [tab, setTab] = useState<'files' | 'tree'>('files')
  const [compact, setCompact] = useState(() => localStorage.getItem('inspector:compact') === '1')
  const filesPanel = usePanelSize('inspector-files', 200, 56, 900)
  const row = repo?.rows.find(r => r.hash === selected)

  useEffect(() => {
    if (!selected) return
    let live = true
    commitDetail(root, selected)
      .then(d => {
        if (!live) return
        setDetail(d)
        setFile(d.files[0] ?? null)
      })
      .catch(() => live && setDetail(null))
    return () => {
      live = false
    }
  }, [root, selected])

  // The commit's signature, checked by git (slow enough to keep out of the list).
  const [sig, setSig] = useState<{ status: string; signer: string } | null>(null)
  useEffect(() => {
    if (!selected) return setSig(null)
    let live = true
    setSig(null)
    void run(root, ['show', '-s', '--format=%G?%x1f%GS', selected]).then(out => {
      const [status = 'N', signer = ''] = out.stdout.trim().split('\x1f')
      if (live) setSig({ status, signer })
    })
    return () => {
      live = false
    }
  }, [root, selected])

  const diffWhitespace = useSettings(s => s.diffWhitespace)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the whitespace setting changes
  useEffect(() => {
    if (!selected || !file) return setDiff({ text: '', truncated: false, loading: false })
    let live = true
    setDiff(d => ({ ...d, loading: true }))
    commitFileDiff(root, selected, file.path, file.orig)
      .then(res => live && setDiff({ text: res.text, truncated: res.truncated, loading: false }))
      .catch(() => live && setDiff({ text: '', truncated: false, loading: false }))
    return () => {
      live = false
    }
  }, [root, selected, file, diffWhitespace])

  const shell = 'flex min-h-0 shrink-0 flex-col border-l border-subtle'
  if (!row || !detail || detail.hash !== row.hash)
    return (
      <aside className={shell} style={{ width }}>
        <Empty>{row ? t('Loading…') : t('Select a commit')}</Empty>
      </aside>
    )

  const [subject = '', ...rest] = detail.body.split('\n')
  const message = rest.join('\n').trim()
  const authorName = detail.author.replace(/ <.*>$/, '')
  const chips = refChips(row.refs, remotes)
  const fileRow = (f: CommitFile, nested = false) => {
    const { name, dir } = splitPath(f.path)
    return (
      <button
        key={f.path}
        type="button"
        className={cx(fileRowClass(file?.path === f.path), nested && 'pl-6.5')}
        onClick={() => setFile(f)}
        onContextMenu={e => openMenu(e, menus.file(row.hash, f.path))}
        title={f.orig ? `${f.orig} → ${f.path}` : f.path}
      >
        <StatusBadge letter={f.status} />
        <FilePath name={name} dir={nested ? undefined : dir} />
        <LineStats added={f.added} deleted={f.deleted} />
      </button>
    )
  }

  const newBranch = async () => {
    const name = await prompt({ title: t('New branch at {sha}', { sha: row.short }), placeholder: 'feature/name', confirm: t('Create and switch') })
    if (name) await act('Create branch', actions.createBranch(name.trim(), row.hash), { done: t('Switched to {name}', { name }) })
  }
  const newTag = async () => {
    const name = await prompt({ title: t('Tag {sha}', { sha: row.short }), placeholder: 'v1.0.0', confirm: t('Create tag') })
    if (name) await act('Tag', actions.tag(name.trim(), row.hash), { done: t('Tagged {name}', { name }) })
  }
  const checkout = async () => {
    const branch = chips.find(c => c.kind === 'local' || c.kind === 'head')
    if (branch) return void act('Checkout', actions.checkout(branch.name), { done: t('Switched to {name}', { name: branch.name }) })
    if (await ask({ title: t('Check out {sha}?', { sha: row.short }), text: t('This puts HEAD in a detached state. Create a branch to keep new work.'), confirm: t('Check out') }))
      await act('Checkout', actions.checkoutCommit(row.hash))
  }
  const revert = async () => {
    if (await ask({ title: t('Revert {sha}?', { sha: row.short }), text: t('Creates a new commit that undoes “{subject}”.', { subject }), confirm: t('Revert') }))
      await act('Revert', actions.revert(row.hash), { done: t('Reverted') })
  }

  return (
    <aside className={shell} style={{ width }}>
      <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1.25 rounded-sm bg-surface px-1.5 py-0.5 font-mono text-sm font-medium text-link">
            <GitCommitHorizontal size={12} className="text-muted" />
            {row.short}
          </span>
          {sig && sig.status !== 'N' && <SignatureBadge status={sig.status} signer={sig.signer} />}
          <IconButton
            icon={Copy}
            size={13}
            small
            title={t('Copy full SHA')}
            onClick={() => {
              void navigator.clipboard.writeText(row.hash)
              toast({ kind: 'ok', title: t('SHA copied') })
            }}
          />
          <span className="min-w-4 flex-1" />
          <IconButton icon={LogIn} title={t('Check out')} onClick={() => void checkout()} />
          <IconButton icon={GitBranchPlus} title={t('New branch here')} onClick={() => void newBranch()} />
          <IconButton icon={Tag} title={t('Tag this commit')} onClick={() => void newTag()} />
          <IconButton
            icon={CherryIcon}
            title={t('Cherry-pick onto current branch')}
            disabled={row.hash === repo?.head}
            onClick={() => void act('Cherry-pick', actions.cherryPick(row.hash), { done: t('Cherry-picked') })}
          />
          <IconButton icon={Undo2} title={t('Revert')} onClick={() => void revert()} />
          <IconButton
            icon={compact ? ChevronsUpDown : ChevronsDownUp}
            title={compact ? t('Show commit details') : t('Collapse commit details')}
            onClick={() => {
              localStorage.setItem('inspector:compact', compact ? '0' : '1')
              setCompact(!compact)
            }}
          />
        </div>
        <div className={cx('leading-snug font-semibold select-text', compact ? 'truncate' : 'text-lg')} title={compact ? subject : undefined}>
          {subject}
        </div>
        {!compact && message && <div className="max-h-30 overflow-y-auto leading-normal whitespace-pre-wrap text-secondary select-text">{message}</div>}
        {!compact && (
          <>
            <div className="flex items-center gap-2.5">
              <Avatar name={authorName} size={28} />
              <div className="min-w-0">
                <div className="truncate font-semibold" title={authorName}>
                  {authorName}
                </div>
                <div
                  className="truncate text-sm text-muted"
                  title={`${detail.date}${detail.committer && detail.committer !== authorName ? t(' · committed by {committer}', { committer: detail.committer }) : ''}`}
                >
                  {detail.date}
                  {detail.committer && detail.committer !== authorName ? t(' · committed by {committer}', { committer: detail.committer }) : ''}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              {chips.map(c => (
                <Chip key={c.kind + c.name} kind={c.kind} name={c.name} synced={c.synced} />
              ))}
              {detail.parents.length > 0 && <span>{detail.parents.length > 1 ? t('Parents') : t('Parent')}</span>}
              {detail.parents.map(p => (
                <button key={p} type="button" className="font-mono font-medium text-link hover:underline" onClick={() => setSelected(p)}>
                  {p.slice(0, 7)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex shrink-0 gap-4.5 border-y border-subtle px-4">
        <Tab on={tab === 'files'} icon={FileText} onClick={() => setTab('files')}>
          Files <Count>{detail.files.length}</Count>
        </Tab>
        <Tab on={tab === 'tree'} icon={FolderTree} onClick={() => setTab('tree')}>
          {t('Tree')}
        </Tab>
      </div>
      <div className="shrink-0 overflow-y-auto p-1.5" style={{ height: file ? filesPanel.size : undefined, flex: file ? undefined : 1 }}>
        {tab === 'files'
          ? detail.files.map(f => fileRow(f))
          : byFolder(detail.files).map(([dir, files]) => (
              <Fragment key={dir}>
                <div className="flex h-7 items-center gap-1.5 px-1.5 text-sm font-medium text-muted">
                  <FolderTree size={12} />
                  {dir || '/'}
                </div>
                {files.map(f => fileRow(f, true))}
              </Fragment>
            ))}
        {!detail.files.length && <Empty>{t('No file changes')}</Empty>}
      </div>
      {file && (
        <>
          <Resizer panel={filesPanel} axis="y" />
          <DiffView
            path={file.orig ? `${file.orig} → ${file.path}` : file.path}
            text={diff.text}
            loading={diff.loading}
            truncated={diff.truncated}
            empty={file.orig ? t('Renamed without changes') : undefined}
          />
        </>
      )}
    </aside>
  )
}
