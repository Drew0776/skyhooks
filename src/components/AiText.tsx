import React from 'react';

// Renders the co-pilot's Markdown (headings, lists, bold, code, rules and tables) as React elements.
// Nothing is injected as HTML, so model output can't add markup or scripts to the page.

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i} className="font-mono text-amber-300 bg-slate-950 px-1 rounded">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'rule' }
  | { kind: 'para'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: { level: number; marker: string; text: string }[] }
  | { kind: 'table'; rows: string[][] };

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  const last = () => blocks[blocks.length - 1];
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      blocks.push({ kind: 'para', lines: [] });
    } else if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) {
      blocks.push({ kind: 'heading', text: m[1].replace(/\*\*/g, '') });
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
    } else if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      const ordered = /\d/.test(m[2]);
      const item = { level: Math.floor(m[1].replace(/\t/g, '  ').length / 2), marker: ordered ? m[2] : '', text: m[3] };
      const prev = last();
      if (prev?.kind === 'list' && (prev.ordered === ordered || item.level > 0)) prev.items.push(item);
      else blocks.push({ kind: 'list', ordered, items: [item] });
    } else if (line.trim().startsWith('|')) {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) continue; // header separator row
      const prev = last();
      if (prev?.kind === 'table') prev.rows.push(cells(line));
      else blocks.push({ kind: 'table', rows: [cells(line)] });
    } else {
      const prev = last();
      if (prev?.kind === 'para') prev.lines.push(line.trim());
      else blocks.push({ kind: 'para', lines: [line.trim()] });
    }
  }
  return blocks.filter(b => b.kind !== 'para' || b.lines.length > 0);
}

export default function AiText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {parse(text).map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return <p key={i} className="font-bold text-amber-300 pt-1">{inline(block.text)}</p>;
          case 'rule':
            return <hr key={i} className="border-slate-800" />;
          case 'list':
            return (
              <ul key={i} className="space-y-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2" style={{ paddingLeft: item.level * 14 }}>
                    <span className="text-amber-500 shrink-0" aria-hidden={!item.marker}>{item.marker || '•'}</span>
                    <span>{inline(item.text)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr>{block.rows[0].map((c, j) => <th key={j} className="border-b border-slate-700 px-2 py-1 font-semibold text-slate-100">{inline(c)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {block.rows.slice(1).map((row, r) => (
                      <tr key={r}>{row.map((c, j) => <td key={j} className="border-b border-slate-800 px-2 py-1 align-top">{inline(c)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={i}>{block.lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(l)}</React.Fragment>)}</p>;
        }
      })}
    </div>
  );
}
