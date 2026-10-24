/** The Stashes view: the stash list with apply / pop / drop, and the stash's patch. */
import { Archive } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DiffView } from '../components/Diff'
import { Resizer, usePanelSize } from '../components/Split'
import { Button, Empty } from '../components/ui'
import { cx } from '../lib/cx'
import { actions, stashDiff } from '../lib/git'
import { t } from '../lib/i18n'
import { useApp } from '../state'
import { listColumn, PaneHead } from './Changes'

export function StashesView() {
  const { root, repo, act, ask } = useApp()
  const [sel, setSel] = useState<string | null>(null)
  const [text, setText] = useState('')
  const stashes = repo?.stashes ?? []
  const list = usePanelSize('stash-list', 380, 260, 900)

  useEffect(() => {
    if (!stashes.some(s => s.ref === sel)) setSel(stashes[0]?.ref ?? null)
  }, [stashes, sel])

  useEffect(() => {
    if (!sel) return setText('')
    let live = true
    stashDiff(root, sel)
      .then(t => live && setText(t))
      .catch(() => live && setText(''))
    return () => {
      live = false
    }
  }, [root, sel])

  const drop = async (ref: string) => {
    if (await ask({ title: t('Drop {ref}?', { ref }), text: t('The stashed changes are deleted.'), confirm: t('Drop'), danger: true }))
      await act('Drop', actions.stashDrop(ref), { done: t('Dropped {ref}', { ref }) })
  }

  return (
    <>
      <div className={listColumn} style={{ width: list.size }}>
        <PaneHead title={t('Stashes')} count={stashes.length} />
        <div className="flex-1 overflow-y-auto p-1.5">
          {stashes.map(s => (
            <div key={s.ref} className={cx('flex flex-col gap-1.5 rounded-md px-2.5 py-2', s.ref === sel ? 'bg-selected' : 'hover:bg-hover')} onClick={() => setSel(s.ref)}>
              <div className="flex items-center gap-2">
                <Archive size={14} className="shrink-0 text-ref-tag-text" />
                <span className="font-mono text-sm font-semibold text-ref-tag-text">{s.ref}</span>
                <span className="flex-1 truncate">{s.subject}</span>
                <span className="text-sm text-muted">{s.when.replace(/ ago$/, '')}</span>
              </div>
              {s.ref === sel && (
                <div className="flex gap-1.5 pl-5.5">
                  <Button small kind="primary" onClick={() => void act('Apply', actions.stashApply(s.ref), { done: t('Applied {ref}', { ref: s.ref }) })}>
                    {t('Apply')}
                  </Button>
                  <Button small onClick={() => void act('Pop', actions.stashPop(s.ref), { done: t('Popped {ref}', { ref: s.ref }) })}>
                    {t('Pop')}
                  </Button>
                  <Button small onClick={() => void drop(s.ref)}>
                    <span className="text-status-deleted">{t('Drop')}</span>
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!stashes.length && <Empty>{t('No stashes. Use Stash in the toolbar to shelve your changes.')}</Empty>}
        </div>
      </div>
      <Resizer panel={list} />
      <div className="flex min-w-0 flex-1 flex-col">{sel ? <DiffView path={sel} text={text} /> : <Empty>{t('Select a stash')}</Empty>}</div>
    </>
  )
}
