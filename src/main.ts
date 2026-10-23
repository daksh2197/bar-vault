/**
 * The wiring. It opens the database, keeps the current data in `state`, picks a screen from the hash and draws it.
 * It does no peg maths and builds no Bottle by hand: core/peg does the first, core/form the second.
 *
 *   database --readAll()--> state --> screen for the current hash --> page
 *   form --buildBottle()--> database --reload--> state ...
 */

import './styles/fonts.css';
import './styles/brand.css';
import './styles/app.css';

import { openVault, type Vault, VaultError } from './core/db';
import { todayLocal } from './core/dates';
import { DEFAULT_SETTINGS } from './core/types';
import { backupScreen } from './ui/backup-screen';
import { bottleFormScreen } from './ui/bottle-form';
import type { Ctx, State } from './ui/ctx';
import { el, h } from './ui/dom';
import { isPageAnchor, navGroup, parseRoute, type Route } from './ui/route';
import { aboutScreen, bottlesScreen, clearSample, loadSample, moreScreen, notFoundScreen, releasePhotoUrls, restockScreen, runCleanups, settingsScreen, shelfScreen, statsScreen } from './ui/screens';
import { smartHomeScreen } from './ui/smarthome';

let vault: Vault;
let state: State = { bottles: [], settings: { ...DEFAULT_SETTINGS }, lastBackup: null, unreadable: 0 };
let flashMessage = '';
let lastRouteKey = '';
let banner = '';

const TITLES: Record<Route['name'], string> = {
  shelf: 'Your shelf',
  bottles: 'Bottles',
  new: 'Add a bottle',
  edit: 'Edit bottle',
  restock: 'Restock',
  stats: 'Stats',
  more: 'More',
  backup: 'Backup',
  'smart-home': 'Smart home',
  settings: 'Settings',
  about: 'About',
  notfound: 'Page not found',
};

function errorText(error: unknown): string {
  if (error instanceof VaultError) return error.message;
  return 'Something went wrong saving to this device.';
}

const ctx: Ctx = {
  get state() {
    return state;
  },
  get vault() {
    return vault;
  },
  now: () => new Date(),
  today: () => todayLocal(),
  async change(work, draw = true) {
    try {
      await work();
      state = await vault.readAll();
      banner = state.unreadable > 0 ? `${state.unreadable} saved ${state.unreadable === 1 ? 'row' : 'rows'} could not be read and ${state.unreadable === 1 ? 'is' : 'are'} not shown.` : '';
      if (draw) render();
      return true;
    } catch (error) {
      banner = errorText(error);
      flashMessage = '';
      render();
      return false;
    }
  },
  flash(message) {
    flashMessage = message;
  },
  navigate(hash) {
    if (location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) render();
    else location.hash = hash;
  },
};

function render(): void {
  const route = parseRoute(location.hash);
  const app = el('app');
  runCleanups();
  releasePhotoUrls();

  const redraw = (): void => render();
  let screen: HTMLElement;
  switch (route.name) {
    case 'shelf':
      screen = shelfScreen(ctx);
      break;
    case 'bottles':
      screen = bottlesScreen(ctx, redraw);
      break;
    case 'new':
      screen = bottleFormScreen(ctx, null);
      break;
    case 'edit':
      screen = bottleFormScreen(ctx, route.id);
      break;
    case 'restock':
      screen = restockScreen(ctx);
      break;
    case 'stats':
      screen = statsScreen(ctx);
      break;
    case 'more':
      screen = moreScreen();
      break;
    case 'backup':
      screen = backupScreen(ctx);
      break;
    case 'smart-home':
      screen = smartHomeScreen(ctx);
      break;
    case 'settings':
      screen = settingsScreen(ctx);
      break;
    case 'about':
      screen = aboutScreen();
      break;
    default:
      screen = notFoundScreen();
  }

  const top: HTMLElement[] = [];
  if (banner) top.push(h('p', { class: 'banner', role: 'alert' }, banner));
  if (flashMessage) {
    top.push(h('p', { class: 'flash', role: 'status' }, flashMessage));
    flashMessage = '';
  }
  app.replaceChildren(...top, screen);

  // Menu highlight and page title.
  const group = navGroup(route);
  for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-nav]')) {
    if (a.dataset.nav === group) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = `${TITLES[route.name]} · Bar Vault`;

  // A new screen starts at the top with focus on its heading. A redraw of the same screen leaves focus alone.
  const key = route.name === 'edit' ? `edit:${route.id}` : route.name;
  if (key !== lastRouteKey) {
    lastRouteKey = key;
    window.scrollTo(0, 0);
    document.getElementById('page-title')?.focus({ preventScroll: true });
  }
}

/** Buttons that appear on more than one screen are wired once, here, by their id. */
function wireGlobalClicks(): void {
  el('app').addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('#load-sample')) {
      ctx.flash('Loaded the sample bar. Invented sample bar, not a real one.');
      void loadSample(ctx);
    } else if (target.closest('#clear-sample')) {
      void clearSample(ctx);
    }
  });
}

async function start(): Promise<void> {
  if (new URLSearchParams(location.search).has('embed')) document.documentElement.dataset.embed = '';
  wireGlobalClicks();
  // A jump to an anchor on the page (the skip link) is not a screen change. Leave the screen as it is.
  window.addEventListener('hashchange', () => {
    if (!isPageAnchor(location.hash)) render();
  });
  document.querySelector('.skip')?.addEventListener('click', (event) => {
    event.preventDefault();
    el('app').focus();
  });
  try {
    vault = await openVault();
  } catch (error) {
    el('app').replaceChildren(h('p', { class: 'banner', role: 'alert' }, errorText(error)));
    return;
  }
  state = await vault.readAll();
  if (state.unreadable > 0) banner = `${state.unreadable} saved ${state.unreadable === 1 ? 'row' : 'rows'} could not be read and ${state.unreadable === 1 ? 'is' : 'are'} not shown.`;
  render();

  // The service worker is what makes the app open with no signal. Only in the real build.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  }
}

void start();
