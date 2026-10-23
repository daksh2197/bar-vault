/** The Smart home page: the JSON, the one-line summary, three guides, and what is not documented. */

import { smartHome, smartHomeJson, SMART_HOME_FORMAT } from '../core/exports';
import type { Ctx } from './ctx';
import { h } from './dom';
import { copyText, exportBlock, extLink, pageHead } from './parts';
import { setText } from './dom';
import { FETCHED, GUIDES, NOT_DOCUMENTED, NOT_DOCUMENTED_SUMMARY } from './smarthome-copy';

export function smartHomeScreen(ctx: Ctx): HTMLElement {
  const make = (): string => smartHomeJson(ctx.state.bottles, ctx.state.settings.pegMl, new Date());
  const summaryLine = (): string => smartHome(ctx.state.bottles, ctx.state.settings.pegMl, new Date()).summary;
  const copyStatus = h('span', { class: 'status', role: 'status', id: 'summary-status' });
  const copySummary = h('button', { type: 'button', class: 'btn btn-primary', id: 'copy-summary' }, 'Copy the summary');
  copySummary.addEventListener('click', () => {
    void copyText(summaryLine()).then((ok) => setText(copyStatus, ok ? 'Copied.' : 'This browser blocked copying. Select the line above.'));
  });

  const field = (name: string, text: string): HTMLElement => h('div', { class: 'fig' }, h('dt', {}, name), h('dd', {}, text));

  return h(
    'div',
    { class: 'screen' },
    pageHead('Smart home', 'Bar Vault does not connect to Alexa, Google Home or Apple Home. It makes a small file and a one-line summary, and you carry them across by hand.'),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'sum-h' },
      h('h2', { id: 'sum-h' }, 'One line to paste'),
      h('p', { class: 'help' }, 'Worked out from your bottles each time you open this page.'),
      h('p', { class: 'summary-line', id: 'summary-line' }, summaryLine()),
      h('div', { class: 'actions' }, copySummary, copyStatus),
    ),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'json-h' },
      h('h2', { id: 'json-h' }, 'The JSON'),
      h('p', { class: 'help' }, `The format string is ${SMART_HOME_FORMAT}. Every value is computed on this device from the numbers you typed, with your peg size.`),
      h(
        'dl',
        { class: 'shape' },
        field('format', `Always "${SMART_HOME_FORMAT}".`),
        field('generated', 'The time the file was made.'),
        field('pegMl', 'Your peg size in ml.'),
        field('bottles', 'One entry per bottle: name, category, sizeMl, fillPct, mlLeft, pegsLeft, pricePerPegCents, low, limited. pricePerPegCents is null for a bottle you paid nothing for.'),
        field('lowBottles', 'Names of the low bottles, emptiest first.'),
        field('summary', 'The one-line sentence above.'),
      ),
      exportBlock({
        id: 'sh-json',
        title: 'Your file',
        help: 'Copy it or download it.',
        filename: `bar-vault-smart-home-${ctx.today()}.json`,
        mime: 'application/json',
        make,
      }),
    ),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'guides-h' },
      h('h2', { id: 'guides-h' }, 'Three guides'),
      h('p', { class: 'help' }, `Only what an official vendor page says is stated as fact, with the page and the date it was ${FETCHED}. Everything else is marked as ${NOT_DOCUMENTED}. These steps were not run on a phone or a speaker for this build, and app menus change, so test each one.`),
      ...GUIDES.map((g) =>
        h(
          'details',
          { class: 'guide', id: `guide-${g.id}` },
          h('summary', {}, g.name),
          h('p', {}, g.intro),
          h('h3', {}, 'What the vendor page says'),
          h(
            'ul',
            { class: 'plain-list' },
            g.documented.map((f) =>
              h('li', {}, h('q', {}, f.quote), ' ', extLink(f.url, f.url), ` (${FETCHED}).`, f.note ? h('span', { class: 'sub' }, f.note) : null),
            ),
          ),
          h('h3', {}, 'Steps to try'),
          h('ol', { class: 'steps' }, g.steps.map((t) => h('li', {}, t))),
          h('h3', {}, 'Not documented on the pages fetched'),
          h('ul', { class: 'plain-list' }, g.notDocumented.map((t) => h('li', {}, `${t.replace(/\.$/, '')}: ${NOT_DOCUMENTED}.`))),
        ),
      ),
    ),
    h(
      'section',
      { class: 'block', 'aria-labelledby': 'nd-h' },
      h('h2', { id: 'nd-h' }, 'What is not documented'),
      h('p', { class: 'help' }, `Each of these is ${NOT_DOCUMENTED}. That is not a claim that it cannot be done, only that this build found no official page saying it can.`),
      h('ul', { class: 'plain-list' }, NOT_DOCUMENTED_SUMMARY.map((t) => h('li', {}, t))),
    ),
  );
}
