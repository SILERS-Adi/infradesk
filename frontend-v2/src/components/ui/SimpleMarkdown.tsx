// Lekki "markdown" renderer (bez biblioteki — bundle slim).
// Obsługuje: **bold**, *italic*, [text](url), auto-link http(s)://, line breaks.
// XSS-safe: build z React.createElement, brak dangerouslySetInnerHTML.

import React from 'react';

interface Props {
  text: string;
  className?: string;
}

const URL_RE = /(https?:\/\/[^\s)]+)/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ITALIC_RE = /(?<!\*)\*([^*]+)\*(?!\*)/g;
const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

interface Token {
  type: 'text' | 'bold' | 'italic' | 'link';
  text: string;
  href?: string;
}

function tokenize(line: string): Token[] {
  // Build markers list with offsets
  type Marker = { start: number; end: number; node: Token };
  const markers: Marker[] = [];

  // [text](url) — must be first so it doesn't conflict with bold/italic
  let m: RegExpExecArray | null;
  while ((m = MD_LINK_RE.exec(line)) !== null) {
    markers.push({
      start: m.index,
      end: m.index + m[0].length,
      node: { type: 'link', text: m[1] ?? '', href: m[2] ?? '' },
    });
  }

  // Auto URL (poza [...](...))
  while ((m = URL_RE.exec(line)) !== null) {
    const overlap = markers.some((mk) => m!.index >= mk.start && m!.index < mk.end);
    if (overlap) continue;
    markers.push({
      start: m.index,
      end: m.index + m[0].length,
      node: { type: 'link', text: m[0], href: m[0] },
    });
  }

  // **bold**
  while ((m = BOLD_RE.exec(line)) !== null) {
    const overlap = markers.some((mk) => m!.index >= mk.start && m!.index < mk.end);
    if (overlap) continue;
    markers.push({
      start: m.index,
      end: m.index + m[0].length,
      node: { type: 'bold', text: m[1] ?? '' },
    });
  }

  // *italic*
  while ((m = ITALIC_RE.exec(line)) !== null) {
    const overlap = markers.some((mk) => m!.index >= mk.start && m!.index < mk.end);
    if (overlap) continue;
    markers.push({
      start: m.index,
      end: m.index + m[0].length,
      node: { type: 'italic', text: m[1] ?? '' },
    });
  }

  // Sort by start
  markers.sort((a, b) => a.start - b.start);

  // Walk and emit text + tokens
  const tokens: Token[] = [];
  let pos = 0;
  for (const mk of markers) {
    if (mk.start > pos) tokens.push({ type: 'text', text: line.slice(pos, mk.start) });
    tokens.push(mk.node);
    pos = mk.end;
  }
  if (pos < line.length) tokens.push({ type: 'text', text: line.slice(pos) });
  return tokens.length > 0 ? tokens : [{ type: 'text', text: line }];
}

function renderToken(tok: Token, key: number): React.ReactNode {
  if (tok.type === 'bold') return <strong key={key}>{tok.text}</strong>;
  if (tok.type === 'italic') return <em key={key}>{tok.text}</em>;
  if (tok.type === 'link') {
    // Sanitize href — allow only http(s)/mailto, cap length so an enormous
    // injected URL (e.g. javascript: prepended to https:) cannot derail layout.
    const raw = (tok.href ?? '').slice(0, 2048);
    const safe = /^(https?:\/\/|mailto:)/i.test(raw) ? raw : '#';
    return (
      <a
        key={key}
        href={safe}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-pri hover:underline"
        title={safe === '#' ? 'Niedozwolony link' : safe}
      >
        {tok.text.slice(0, 200)}
      </a>
    );
  }
  return <React.Fragment key={key}>{tok.text}</React.Fragment>;
}

export function SimpleMarkdown({ text, className }: Props) {
  const lines = text.split('\n');
  return (
    <div className={className} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {tokenize(line).map((tok, j) => renderToken(tok, j))}
          {i < lines.length - 1 && '\n'}
        </React.Fragment>
      ))}
    </div>
  );
}
