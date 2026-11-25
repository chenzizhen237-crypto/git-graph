/**
 * The Settings dialog (Nib: Desktop 08–10): a category list on the left and,
 * on the right, rows of right-aligned labels with their controls and help.
 * Changes apply at once and are remembered.
 */
import { Bell, FileDiff, Settings as Gear, GitBranch, GitCommitHorizontal, GitPullRequest, Globe, Info, Keyboard, type LucideIcon, Palette, Type, Wrench, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cx } from '../lib/cx'
import { useT } from '../lib/i18n'
import { About, Appearance, Fonts, General, Notifications, Shortcuts } from './settings/GeneralPages'
import { CommitsGraph, DiffEditor, ExternalTools, GitHubAccount, GitPage, Network } from './settings/GitPages'
import { IconButton } from './ui'

export { REPO_URL } from './settings/GeneralPages'

type Section = 'general' | 'appearance' | 'fonts' | 'git' | 'commits' | 'tools' | 'notify' | 'network' | 'github' | 'diff' | 'keys' | 'about'

const SECTIONS: { id: Section; icon: LucideIcon; label: string }[] = [
  { id: 'general', icon: Gear, label: 'General' },
  { id: 'appearance', icon: Palette, label: 'Appearance' },
  { id: 'fonts', icon: Type, label: 'Fonts' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'commits', icon: GitCommitHorizontal, label: 'Commits & graph' },
  { id: 'diff', icon: FileDiff, label: 'Diff & editor' },
  { id: 'tools', icon: Wrench, label: 'External tools' },
  { id: 'notify', icon: Bell, label: 'Notifications' },
  { id: 'network', icon: Globe, label: 'Network' },
  { id: 'github', icon: GitPullRequest, label: 'GitHub' },
  { id: 'keys', icon: Keyboard, label: 'Shortcuts' },
  { id: 'about', icon: Info, label: 'About' },
]

export function SettingsDialog({ onClose, initial = 'general' }: { onClose: () => void; initial?: Section }) {
  const t = useT()
  const [section, setSection] = useState<Section>(initial)
  const title = SECTIONS.find(s => s.id === section)!.label

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t('Settings')}
        className="flex h-165 max-h-[calc(100vh-48px)] w-245 max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-strong bg-app shadow-[0_24px_60px_var(--shadow)]"
        onMouseDown={e => e.stopPropagation()}
      >
        <nav className="flex w-60 shrink-0 flex-col gap-0.5 border-r border-subtle bg-sidebar px-3 py-4">
          <div className="mb-1.5 text-[11px] font-bold tracking-[0.7px] text-muted">{t('Settings')}</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cx('flex h-8.5 items-center gap-2.5 rounded-md px-3 text-left font-medium', section === s.id ? 'bg-selected font-semibold' : 'hover:bg-hover')}
            >
              <s.icon size={16} className={section === s.id ? 'text-ref-head' : 'text-secondary'} />
              {t(s.label)}
            </button>
          ))}
          <span className="min-w-4 flex-1" />
          <About.Version />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pt-6.5 pb-8">
          <div className="mb-5.5 flex items-center">
            <h2 className="m-0 flex-1 text-2xl font-bold">{t(title)}</h2>
            <IconButton icon={X} onClick={onClose} title={t('Close (esc)')} />
          </div>
          <div className="flex flex-col gap-5.5">
            {section === 'general' && <General />}
            {section === 'appearance' && <Appearance />}
            {section === 'fonts' && <Fonts />}
            {section === 'git' && <GitPage />}
            {section === 'commits' && <CommitsGraph />}
            {section === 'network' && <Network />}
            {section === 'github' && <GitHubAccount />}
            {section === 'diff' && <DiffEditor />}
            {section === 'tools' && <ExternalTools />}
            {section === 'notify' && <Notifications />}
            {section === 'keys' && <Shortcuts />}
            {section === 'about' && <About />}
          </div>
        </div>
      </div>
    </div>
  )
}
