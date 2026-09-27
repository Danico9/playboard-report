import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import { Link } from 'react-router'
import 'highlight.js/styles/github-dark.css'
import { t } from '../i18n'

function resolveNotePath(base, href) {
  const parts = base.split('/').slice(0, -1)
  for (const seg of href.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function makeComponents(notePath) {
  const heading = (Tag) => function H({ id, children, node, ...rest }) {
    void node
    return (
      <Tag id={id} {...rest}>
        {children}
        {id && <a className="anchor" href={`#${id}`} aria-label={t('Enlace a esta sección')}>#</a>}
      </Tag>
    )
  }
  return {
    h2: heading('h2'),
    h3: heading('h3'),
    table: ({ node, ...props }) => {
      void node
      return <div className="table-scroll"><table {...props} /></div>
    },
    a: ({ href = '', children, node, ...rest }) => {
      void node
      if (/^(https?:|mailto:)/i.test(href)) {
        return <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>
      }
      if (href.startsWith('#')) return <a href={href} {...rest}>{children}</a>
      const [file, hash] = href.split('#')
      if (notePath && /\.md$/i.test(file)) {
        const target = resolveNotePath(notePath, decodeURIComponent(file))
        return <Link to={`/notas/${target}${hash ? `#${hash}` : ''}`}>{children}</Link>
      }
      return <span title={href}>{children}</span>
    },
    img: ({ node, alt, ...rest }) => {
      void node
      return <img alt={alt ?? ''} loading="lazy" {...rest} />
    },
  }
}

function Markdown({ children, notePath }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={makeComponents(notePath)}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
