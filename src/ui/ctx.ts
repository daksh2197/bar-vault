/** What every screen is handed: the data, the database, and a few ways to change things and move around. */

import type { Vault } from '../core/db';
import type { Bottle, Settings } from '../core/types';

export interface State {
  bottles: Bottle[];
  settings: Settings;
  lastBackup: string | null;
  unreadable: number;
}

export interface Ctx {
  state: State;
  vault: Vault;
  now(): Date;
  today(): string;
  /** Run a database change, then reload and redraw (unless `draw` is false). Returns false and shows a banner if it failed. */
  change(work: () => Promise<void>, draw?: boolean): Promise<boolean>;
  /** A line shown once at the top of the next drawing of the screen. */
  flash(message: string): void;
  navigate(hash: string): void;
}
