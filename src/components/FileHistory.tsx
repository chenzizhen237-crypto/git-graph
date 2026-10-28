/** File history and blame: every commit that touched a file (following renames), and who wrote each line. */
import { FileClock, GitGraph, History, ScanText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { cx } from '../lib/cx'
import { commitDate } from '../lib/dates'
import { commitFileDiff } from '../lib/git'
import { type BlameLine, blame, type FileCommit, fileLog } from '../lib/history'
import { t } from '../lib/i18n'
import { closeSheet, openSheet } from '../lib/sheets'
import { useApp } from '../state'
import { DiffView } from './Diff'
import { Sheet } from './Sheet'
import { Avatar, Button, Empty, Segmented } from './ui'

export function FileHistory({ path, tab }: { path: string; tab: 'history' | 'blame' }) {
  const { root, setSelected, setView } = useApp()
  const [commits, setCommits] = useState<FileCommit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fileLog(root, path)
      .then(list => {
        if (!live) return
        setCommits(list)
        setPick(p => p ?? list[0]?.hash ?? null)
      })
      .catch(e => live && setError(String(e instanceof Error ? e.message : e)))
    return () => {
      live = false
    }
  }, [root, path])

  const showInGraph = (hash: string) => {
    setSelected(hash)
    setView('history')
    closeSheet()
  }
  const setTab = (next: 'history' | 'blame') => openSheet({ kind: 'history', path, tab: next })

  return (
    <Sheet
      icon={FileClock}
      title={path.split('/').pop() ?? path}
      sub={path}
      onClose={closeSheet}
      actions={
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'history', icon: History, title: t('History') },
            { value: 'blame', icon: ScanText, title: t('Blame') },
          ]}
        />
      }
    >
      {error ? (
        <Empty>{error}</Empty>
      ) : tab === 'history' ? (
        <HistoryTab path={path} commits={commits} pick={pick} setPick={setPick} onGraph={showInGraph} />
      ) : (
        <BlameTab
          path={path}
          onCommit={hash => {
            setPick(hash)
            setTab('history')
          }}
        />
      )}
    </Sheet>
  )
}

function HistoryTab({
  path,
  commits,
  pick,
  setPick,
  onGraph,
}: {
  path: string
  commits: FileCommit[] | null
  pick: string | null
  setPick: (h: string) => void
  onGraph: (h: string) => void
}) {
  const { root } = useApp()
  const [diff, setDiff] = useState({ text: '', loading: false })
  const commit = commits?.find(c => c.hash === pick)
  useEffect(() => {
    if (!commit) return
    let live = true
    setDiff(d => ({ ...d, loading: true }))
    commitFileDiff(root, commit.hash, commit.path)
      .then(text => live && setDiff({ text, loading: false }))
      .catch(() => live && setDiff({ text: '', loading: false }))
    return () => {
      live = false
    }
  }, [root, commit])

  return (
    <>
      <div className="flex w-90 shrink-0 flex-col overflow-y-auto border-r border-subtle p-1.5">
        {commits === null && <Empty>{t('Loading…')}</Empty>}
        {commits?.length === 0 && <Empty>{t('No commits touch this file yet.')}</Empty>}
        {commits?.map(c => (
          <button
            key={c.hash}
            type="button"
            onClick={() => setPick(c.hash)}
            className={cx('flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.75 text-left', c.hash === pick ? 'bg-selected' : 'hover:bg-hover')}
            title={`${c.subject}\n${c.short} · ${c.author}${c.path !== path ? `\n${c.path}` : ''}`}
          >
            <span className="w-full truncate font-medium">{c.subject}</span>
            <span className="flex w-full items-center gap-1.5 text-sm text-muted">
              <Avatar name={c.author} size={14} />
              <span className="truncate">{c.author}</span>
              <span className="font-mono text-link">{c.short}</span>
              <span className="ml-auto shrink-0">{commitDate(c.time * 1000)}</span>
            </span>
            {c.path !== path && <span className="w-full truncate font-mono text-xs text-faint">{c.path}</span>}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {commit ? (
          <DiffView
            path={`${commit.short} · ${commit.path}`}
            text={diff.text}
            loading={diff.loading}
            actions={
              <Button small icon={GitGraph} onClick={() => onGraph(commit.hash)}>
                {t('Show in graph')}
              </Button>
            }
          />
        ) : (
          <Empty>{t('Select a commit')}</Empty>
        )}
      </div>
    </>
  )
}

function BlameTab({ path, onCommit }: { path: string; onCommit: (hash: string) => void }) {
  const { root } = useApp()
  const [lines, setLines] = useState<BlameLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    blame(root, path)
      .then(l => live && setLines(l))
      .catch(e => live && setError(String(e instanceof Error ? e.message : e)))
    return () => {
      live = false
    }
  }, [root, path])
  // Shade each commit's lines by age: the newest stand out.
  const range = useMemo(() => {
    const times = (lines ?? []).map(l => l.time).filter(Boolean)
    return { min: Math.min(...times), max: Math.max(...times) }
  }, [lines])

  if (error) return <Empty>{error}</Empty>
  if (!lines) return <Empty>{t('Loading…')}</Empty>
  return (
    <div className="min-w-0 flex-1 overflow-auto font-mono text-code select-text">
      <table className="min-w-full border-collapse">
        <tbody>
          {lines.map(l => {
            const age = range.max > range.min && l.time ? (l.time - range.min) / (range.max - range.min) : 0
            const uncommitted = /^0+$/.test(l.hash)
            return (
              <tr key={l.line} className={cx('leading-5', l.start && 'border-t border-subtle')}>
                <td
                  className="w-72 max-w-72 min-w-72 px-2 align-top font-sans text-sm select-none"
                  style={{ boxShadow: `inset 3px 0 0 color-mix(in srgb, var(--accent) ${Math.round(15 + age * 85)}%, transparent)` }}
                >
                  {l.start && (
                    <button
                      type="button"
                      disabled={uncommitted}
                      onClick={() => onCommit(l.hash)}
                      className="flex w-full items-center gap-1.5 text-left enabled:hover:text-link"
                      title={uncommitted ? t('Not committed yet') : `${l.summary}\n${l.hash.slice(0, 7)} · ${l.author} · ${new Date(l.time * 1000).toLocaleString()}`}
                    >
                      <span className="font-mono text-xs text-link">{uncommitted ? '·······' : l.hash.slice(0, 7)}</span>
                      <span className="w-20 shrink-0 truncate text-muted">{uncommitted ? t('You') : l.author}</span>
                      <span className="min-w-0 flex-1 truncate text-secondary">{uncommitted ? t('Not committed yet') : l.summary}</span>
                    </button>
                  )}
                </td>
                <td className="w-10 min-w-10 pr-2 text-right align-top text-xs text-faint select-none">{l.line}</td>
                <td className="pr-4 whitespace-pre">{l.text || ' '}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
