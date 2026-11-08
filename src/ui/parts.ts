/** Small pieces several screens share: page headings, copy and download buttons, the export block. */

import { h, setText } from './dom';

export function pageHead(title: string, lede?: string): HTMLElement {
  return h('div', { class: 'page-head' }, h('h1', { tabindex: '-1', id: 'page-title' }, title), lede ? h('p', { class: 'lede' }, lede) : null);
}

/** Put text on the clipboard. Falls back to selecting a hidden box, which older browsers still allow. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = h('textarea', { class: 'vh', 'aria-hidden': 'true', tabindex: '-1' });
    box.value = text;
    document.body.append(box);
    box.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    box.remove();
    return ok;
  }
}

/** Hand the user a file. The blob lives in this tab and is released after ten seconds. */
export function downloadFile(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface ExportSpec {
  id: string;
  title: string;
  help: string;
  filename: string;
  mime: string;
  /** Called when the block is drawn and again on every press, so the text is never stale. */
  make: () => string;
}

/** A titled block with a preview and Copy and Download buttons. The preview is a text node, never markup. */
export function exportBlock(spec: ExportSpec): HTMLElement {
  const status = h('span', { class: 'status', role: 'status', id: `${spec.id}-status` });
  const text = spec.make();
  const pre = h('pre', { class: 'preview', tabindex: '0', 'aria-label': `${spec.title}, preview` }, text);
  const copy = h('button', { type: 'button', class: 'btn btn-primary' }, 'Copy');
  const save = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Download');
  copy.addEventListener('click', () => {
    void copyText(spec.make()).then((ok) => setText(status, ok ? 'Copied.' : 'This browser blocked copying. Use Download, or select the text above.'));
  });
  save.addEventListener('click', () => {
    downloadFile(spec.filename, spec.make(), spec.mime);
    setText(status, `Saved ${spec.filename}.`);
  });
  return h(
    'section',
    { class: 'export', 'aria-labelledby': `${spec.id}-h` },
    h('h3', { id: `${spec.id}-h` }, spec.title),
    h('p', { class: 'help' }, spec.help),
    pre,
    h('div', { class: 'actions' }, copy, save, status),
  );
}

/** A horizontal bar for a fill percent. Width is set through the style object, which a strict page policy allows. */
export function fillBar(pct: number, label: string): HTMLElement {
  const inner = h('span', { class: 'fillbar-in' });
  inner.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  return h('span', { class: 'fillbar', role: 'img', 'aria-label': label }, inner);
}

export function extLink(href: string, text: string): HTMLElement {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
}
