import type { CSSProperties, ReactNode } from 'react'
import { parseBBCode, type BBNode } from '@profile-editor/core'

// Отрисовка BBCode так, как его показывает Steam. Стили взяты из shared_global.css.
// Никакого innerHTML: всё собирается из React-элементов, чужой текст ничего не выполнит

const HEADINGS: Record<string, CSSProperties> = {
  h1: { fontSize: 20, lineHeight: '23px', color: '#5aa9d6', marginBottom: 10, borderBottom: '1px dotted #666666' },
  h2: { fontSize: 18, lineHeight: '21px', color: '#5aa9d6', margin: '8px 0 6px' },
  h3: { fontSize: 16, lineHeight: '19px', color: '#5aa9d6', fontWeight: 300, margin: '8px 0 6px' },
}
const CELL: CSSProperties = { display: 'table-cell', border: '1px solid #4d4d4d', padding: 4, verticalAlign: 'middle' }

const textOf = (nodes: BBNode[]): string =>
  nodes.map((node) => (node.type === 'text' ? node.text : textOf(node.children))).join('')

// в превью пускаем только обычные ссылки
const safeUrl = (url: string) => (/^https?:\/\//i.test(url.trim()) ? url.trim() : undefined)

function render(nodes: BBNode[], prefix = ''): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${prefix}${i}`
    if (node.type === 'text') return node.text
    const children = render(node.children, `${key}.`)
    switch (node.tag) {
      case 'b':
        return <b key={key}>{children}</b>
      case 'i':
        return <i key={key}>{children}</i>
      case 'u':
        return <u key={key}>{children}</u>
      case 'strike':
        return <s key={key}>{children}</s>
      case 'h1':
      case 'h2':
      case 'h3':
        return (
          <div key={key} style={HEADINGS[node.tag]}>
            {children}
          </div>
        )
      case 'spoiler':
        return (
          <span key={key} className="bg-black px-2 text-black hover:text-white">
            {children}
          </span>
        )
      case 'url': {
        const href = safeUrl(node.value ?? textOf(node.children))
        return (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" style={{ color: '#66c0f4' }}>
            {children}
          </a>
        )
      }
      case 'list':
        return (
          <ul key={key} style={{ listStyle: 'disc', paddingLeft: 24, margin: '4px 0' }}>
            {children}
          </ul>
        )
      case 'olist':
        return (
          <ol key={key} style={{ listStyle: 'decimal', paddingLeft: 24, margin: '4px 0' }}>
            {children}
          </ol>
        )
      case 'li':
        return <li key={key}>{children}</li>
      case 'quote':
        return (
          <blockquote
            key={key}
            style={{ border: '1px solid #56707f', background: 'rgba(0, 0, 0, 0.2)', padding: 8, margin: '8px 0', color: '#acb2b8' }}
          >
            {node.value && <div style={{ fontSize: 11, color: '#8f98a0', marginBottom: 4 }}>{node.value}:</div>}
            {children}
          </blockquote>
        )
      case 'code':
        return (
          <div
            key={key}
            style={{
              border: '1px solid #535354',
              borderRadius: 3,
              padding: 12,
              margin: 8,
              fontSize: 11,
              fontFamily: 'Consolas, monospace',
              whiteSpace: 'pre-wrap',
            }}
          >
            {children}
          </div>
        )
      case 'hr':
        return <hr key={key} style={{ border: 0, borderTop: '1px solid #4d4d4d', margin: '8px 0' }} />
      case 'table':
        return (
          <div key={key} style={{ display: 'table', fontSize: 12 }}>
            {children}
          </div>
        )
      case 'tr':
        return (
          <div key={key} style={{ display: 'table-row' }}>
            {children}
          </div>
        )
      case 'th':
        return (
          <div key={key} style={{ ...CELL, fontWeight: 'bold' }}>
            {children}
          </div>
        )
      case 'td':
        return (
          <div key={key} style={CELL}>
            {children}
          </div>
        )
      default:
        return <span key={key}>{children}</span>
    }
  })
}

export default function BBPreview({ text }: { text: string }) {
  return (
    <div style={{ whiteSpace: 'pre-line', wordWrap: 'break-word', fontSize: 13, lineHeight: '18px', color: '#c6d4df' }}>
      {render(parseBBCode(text))}
    </div>
  )
}
