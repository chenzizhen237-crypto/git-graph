/** The update pill in the title bar and the update button in Settings → About; the toast itself is in lib/update. */
import { CircleArrowDown, CircleCheck, Download, FileText, RefreshCcw } from 'lucide-react'

import { openUrl } from '../lib/github'
import { useT } from '../lib/i18n'
import { checkForUpdate, installUpdate, showUpdate, useUpdate } from '../lib/update'
import { Button } from './ui'

const bare = (tag: string) => tag.replace(/^v/, '')

/** Title bar: shows while a newer release is known; clicking it brings the toast back. */
export function UpdatePill() {
  const t = useT()
  const u = useUpdate()
  if (!u.release || (u.status !== 'available' && u.status !== 'installing')) return null
  const v = bare(u.release.tag)
  return (
    <button
      type="button"
      className="flex h-6 shrink-0 items-center gap-1.25 rounded-full border border-accent bg-selected pr-2.25 pl-1.75 text-xs font-semibold whitespace-nowrap text-accent hover:brightness-110"
      onClick={showUpdate}
      title={t('Git Graph {tag} is available', { tag: u.release.tag })}
    >
      <CircleArrowDown size={14} />
      {t('Update {v}', { v })}
    </button>
  )
}

/** Settings → About: one button that checks, then offers the update or says there is none. */
export function UpdateButton() {
  const t = useT()
  const u = useUpdate()
  const button =
    u.status === 'checking' ? (
      <Button busy disabled>
        {t('Checking…')}
      </Button>
    ) : u.status === 'latest' ? (
      <Button icon={CircleCheck} disabled className="[&>svg]:text-status-added!">
        {t('Already up to date')}
      </Button>
    ) : u.release && (u.status === 'available' || u.status === 'installing') ? (
      <Button kind="primary" icon={Download} busy={u.status === 'installing'} disabled={u.status === 'installing'} onClick={() => void installUpdate()}>
        {t('Update to {v}', { v: bare(u.release.tag) })}
      </Button>
    ) : (
      <Button icon={RefreshCcw} onClick={() => void checkForUpdate()}>
        {t('Check for updates')}
      </Button>
    )
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        {button}
        {u.release && (u.status === 'available' || u.status === 'installing') && (
          <Button icon={FileText} onClick={() => void openUrl(u.release!.url)}>
            {t('Release notes')}
          </Button>
        )}
        {u.status === 'latest' && (
          <button type="button" className="text-sm text-muted hover:text-primary" onClick={() => void checkForUpdate()}>
            {t('Check again')}
          </button>
        )}
      </div>
      {u.status === 'error' && <div className="text-sm text-status-deleted select-text">{t('Could not check for updates: {error}', { error: u.error ?? '' })}</div>}
      {u.release && u.status === 'available' && (
        <div className="text-sm leading-normal text-muted">
          {t('{v} is available. Updating downloads it from GitHub, checks its signature, quits Git Graph and opens the new version.', { v: bare(u.release.tag) })}
        </div>
      )}
      {u.status === 'installing' && <div className="text-sm text-muted">{t('The installer is running in Terminal. Git Graph quits and reopens when it is done.')}</div>}
    </div>
  )
}
