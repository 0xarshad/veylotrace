import { Fragment, type ReactNode } from 'react'

// Minimal markdown subset (headings, lists, **bold**, `code`, paragraphs). Model output is untrusted:
// everything is emitted as React text nodes, never as HTML, and links/images/HTML are not interpreted.

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    const key = `${keyBase}-${i}`
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] dark:bg-slate-800">{part.slice(1, -1)}</code>
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

type Block = { type: 'h'; level: number; text: string } | { type: 'list'; ordered: boolean; items: string[] } | { type: 'p'; text: string }

function parse(src: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') })
    para = []
  }
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    let m: RegExpMatchArray | null
    if (!line) flush()
    else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flush()
      blocks.push({ type: 'h', level: m[1].length, text: m[2] })
    } else if ((m = line.match(/^[-*•]\s+(.*)$/))) {
      flush()
      const last = blocks[blocks.length - 1]
      if (last?.type === 'list' && !last.ordered) last.items.push(m[1])
      else blocks.push({ type: 'list', ordered: false, items: [m[1]] })
    } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      flush()
      const last = blocks[blocks.length - 1]
      if (last?.type === 'list' && last.ordered) last.items.push(m[1])
      else blocks.push({ type: 'list', ordered: true, items: [m[1]] })
    } else para.push(line)
  }
  flush()
  return blocks
}

export function SafeMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]">
      {parse(text).map((b, i) => {
        const k = `b${i}`
        if (b.type === 'h') {
          const cls = b.level <= 2 ? 'mt-3 text-sm font-semibold first:mt-0' : 'mt-2 text-sm font-medium'
          return <h3 key={k} className={cls}>{inline(b.text, k)}</h3>
        }
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul'
          return (
            <Tag key={k} className={b.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>
              {b.items.map((it, j) => <li key={`${k}-${j}`}>{inline(it, `${k}-${j}`)}</li>)}
            </Tag>
          )
        }
        return <p key={k}>{inline(b.text, k)}</p>
      })}
    </div>
  )
}
