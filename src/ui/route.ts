/** Hash routes. The page address after the # picks the screen. Anything unknown, or mangled, is "notfound". */

import { isValidId } from '../core/schema';

export type Route =
  | { name: 'shelf' }
  | { name: 'bottles' }
  | { name: 'new' }
  | { name: 'edit'; id: string }
  | { name: 'restock' }
  | { name: 'stats' }
  | { name: 'more' }
  | { name: 'backup' }
  | { name: 'smart-home' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'notfound' };

const SIMPLE: Record<string, Route> = {
  '': { name: 'shelf' },
  bottles: { name: 'bottles' },
  'bottles/new': { name: 'new' },
  restock: { name: 'restock' },
  stats: { name: 'stats' },
  more: { name: 'more' },
  backup: { name: 'backup' },
  'smart-home': { name: 'smart-home' },
  settings: { name: 'settings' },
  about: { name: 'about' },
};

export function parseRoute(hash: string): Route {
  if (typeof hash !== 'string' || hash.length > 200) return { name: 'notfound' };
  let path = hash.startsWith('#') ? hash.slice(1) : hash;
  path = path.startsWith('/') ? path.slice(1) : path;
  if (path.startsWith('/')) return { name: 'notfound' };
  if (path.endsWith('/')) path = path.slice(0, -1);
  const simple = Object.prototype.hasOwnProperty.call(SIMPLE, path) ? SIMPLE[path] : undefined;
  if (simple) return simple;
  const edit = /^bottles\/([^/]+)$/.exec(path);
  if (edit && isValidId(edit[1])) return { name: 'edit', id: edit[1] };
  return { name: 'notfound' };
}

export const hrefFor = (r: Route): string => {
  switch (r.name) {
    case 'shelf':
      return '#/';
    case 'edit':
      return `#/bottles/${r.id}`;
    case 'new':
      return '#/bottles/new';
    case 'notfound':
      return '#/';
    default:
      return `#/${r.name}`;
  }
};

/** Which bottom-nav item a route belongs under. */
export function navGroup(r: Route): 'shelf' | 'bottles' | 'restock' | 'stats' | 'more' | null {
  switch (r.name) {
    case 'shelf':
      return 'shelf';
    case 'bottles':
    case 'new':
    case 'edit':
      return 'bottles';
    case 'restock':
      return 'restock';
    case 'stats':
      return 'stats';
    case 'more':
    case 'backup':
    case 'smart-home':
    case 'settings':
    case 'about':
      return 'more';
    default:
      return null;
  }
}
