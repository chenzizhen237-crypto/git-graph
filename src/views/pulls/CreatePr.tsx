/** Create a new pull request form with commit-based title/body prefill and Markdown preview. */
import { ArrowLeft, GitBranch, GitPullRequest } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Markdown } from '../../components/Markdown'
import { Button, caps, IconButton } from '../../components/ui'
import { cx } from '../../lib/cx'
import { git } from '../../lib/git'
import { prActions, type RepoInfo } from '../../lib/github'
import { t } from '../../lib/i18n'
import { useApp } from '../../state'

export function CreatePr({ info, openHeads, onCancel, onCreated }: { info: RepoInfo; openHeads: Map<string, number>; onCancel: () => void; onCreated: () => void }) {
  const { root, repo, act } = useApp()
  const defaultBase = info.defaultBranchRef.name
  const locals = useMemo(() => repo?.refs.filter(r => r.kind === 'local') ?? [], [repo?.refs])
  // Head: the current branch, unless that is the base; then the newest other branch.
  const [head, setHead] = useState(() => (repo && repo.branch !== defaultBase ? repo.branch : (locals.find(r => r.name !== defaultBase && !openHeads.has(r.name))?.name ?? '')))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState(defaultBase)
  const [draft, setDraft] = useState(false)
  const [preview, setPreview] = useState(false)
  const [edited, setEdited] = useState(false)

  // Start from the head's commits: the last subject as title, the list as body.
  useEffect(() => {
    if (!head || edited) return
    void git(root, ['log', '--format=%s', `origin/${base}..${head}`])
      .catch(() => git(root, ['log', '--format=%s', `${base}..${head}`]))
      .then(out => {
        const subjects = out.trim().split('\n').filter(Boolean)
        setTitle(subjects[0] ?? '')
        setBody(subjects.length > 1 ? subjects.map(s => `- ${s}`).join('\n') : '')
      })
      .catch(() => {})
  }, [root, head, base, edited])

  if (!repo) return null
  const ref = locals.find(r => r.name === head)
  const ahead = Number(/ahead (\d+)/.exec(ref?.track ?? '')?.[1] ?? 0)
  const needsPush = !!ref && (!ref.upstream || ahead > 0)
  const existing = openHeads.get(head)
  const create = async () => {
    // gh cannot push for us without a terminal; publish the branch first.
    if (needsPush && !(await act('Push', ['push', '--set-upstream', 'origin', head], { done: t('Pushed {head}', { head }) }))) return
    if (await act('Create pull request', prActions.create(title.trim(), base, head, draft), { stdin: body, done: t('Pull request opened'), tool: 'gh' })) onCreated()
  }
  const field = 'rounded-md border border-strong bg-app px-2.5 outline-none focus:border-focus focus:ring-1 focus:ring-focus'
  const branchSelect = (value: string, onChange: (v: string) => void, names: string[]) => (
    <select className={cx(field, 'h-7 max-w-80 text-primary')} value={value} onChange={e => onChange(e.target.value)}>
      {names.map(b => (
        <option key={b} value={b}>
          {b}
          {openHeads.has(b) && value !== b ? ` (#${openHeads.get(b)})` : ''}
        </option>
      ))}
    </select>
  )

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-215 flex-col gap-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <IconButton icon={ArrowLeft} onClick={onCancel} title={t('Back')} />
          <h2 className="m-0 text-xl font-semibold">{t('Open a pull request')}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <GitBranch size={14} />
          <span>{t('Merge')}</span>
          {branchSelect(
            head,
            h => {
              setHead(h)
              setEdited(false)
            },
            locals.map(r => r.name).filter(n => n !== base),
          )}
          <span>into</span>
          {branchSelect(
            base,
            b => {
              setBase(b)
              setEdited(false)
            },
            [...new Set([defaultBase, ...locals.map(r => r.name)])].filter(n => n !== head),
          )}
          {needsPush && (
            <span>
              · {ref?.upstream ? t(ahead === 1 ? '{n} commit will be pushed first' : '{n} commits will be pushed first', { n: ahead }) : t('the branch will be published first')}
            </span>
          )}
        </div>
        {!head && <div className="text-sm text-status-modified">Create a branch first — there is no branch to propose besides {base}.</div>}
        {existing !== undefined && (
          <div className="text-sm text-status-modified">
            {head} already has an open pull request, #{existing}.
          </div>
        )}
        <input
          className={cx(field, 'h-9 text-lg font-medium')}
          placeholder={t('Title')}
          value={title}
          onChange={e => {
            setTitle(e.target.value)
            setEdited(true)
          }}
          autoFocus
        />
        <div className="flex gap-3 text-sm">
          <button type="button" className={cx('border-b-2 pb-1', !preview ? 'border-primary font-semibold' : 'border-transparent text-muted')} onClick={() => setPreview(false)}>
            {t('Write')}
          </button>
          <button type="button" className={cx('border-b-2 pb-1', preview ? 'border-primary font-semibold' : 'border-transparent text-muted')} onClick={() => setPreview(true)}>
            {t('Preview')}
          </button>
        </div>
        {preview ? (
          <div className="min-h-60 rounded-md border border-subtle p-3">
            <Markdown text={body} />
          </div>
        ) : (
          <textarea
            className={cx(field, 'h-60 resize-y py-2 leading-normal')}
            placeholder={t('Describe the change (Markdown)')}
            value={body}
            onChange={e => {
              setBody(e.target.value)
              setEdited(true)
            }}
          />
        )}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-secondary">
            <input type="checkbox" className="m-0 accent-accent" checked={draft} onChange={e => setDraft(e.target.checked)} />
            {t('Create as draft')}
          </label>
          <span className="min-w-4 flex-1" />
          <Button onClick={onCancel}>{t('Cancel')}</Button>
          <Button kind="primary" icon={GitPullRequest} disabled={!title.trim() || !head || head === base || existing !== undefined} onClick={() => void create()}>
            {draft ? t('Create draft') : t('Create pull request')}
          </Button>
        </div>
        <div className={caps}>Opens on {info.nameWithOwner}</div>
      </div>
    </div>
  )
}
