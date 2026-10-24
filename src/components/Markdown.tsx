/** GitHub-flavoured Markdown for PR bodies and comments. Raw HTML is not rendered; links open in the browser. */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cx } from '../lib/cx'
import { openUrl } from '../lib/github'

export function Markdown({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return <p className="text-muted italic">No description provided.</p>
  return (
    <div className={cx('markdown prose prose-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={e => {
                e.preventDefault()
                if (href?.startsWith('https://')) void openUrl(href)
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} className="max-w-full rounded-md" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
