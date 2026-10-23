// Adapted from coin-vault (MIT, Daksh Dua)
/** Small DOM helpers. Text always goes in with textContent, never innerHTML, so typed names cannot become markup. */

export function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`index.html is missing an element with id="${id}"`);
  return found as T;
}

export const input = (id: string): HTMLInputElement => el<HTMLInputElement>(id);

/**
 * Change text only when it is different. Screen readers announce every change inside a live
 * region, so rewriting the same words would make them repeat themselves.
 */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

type Child = Node | string | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(key, value === true ? '' : value);
  }
  const add = (child: Child): void => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(add);
    else node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  };
  children.forEach(add);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Build an SVG element. Attributes are set one by one and text goes in as text, so a name can never become markup. */
export function s(tag: string, attrs: Record<string, string | number | undefined> = {}, ...children: Child[]): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined) node.setAttribute(key, String(value));
  const add = (child: Child): void => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(add);
    else node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  };
  children.forEach(add);
  return node;
}
