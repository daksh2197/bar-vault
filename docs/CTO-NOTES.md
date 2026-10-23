# CTO notes

You do not have to write this code. You have to be able to do three things with it:

1. **Explain it** to an interviewer, a partner or a customer.
2. **Find a bug** in it when a number looks wrong.
3. **Know what to ask for** when you want it changed.

Read sections 1 and 2 once (about 15 minutes). Keep section 4 for the day something breaks. Do section 5 with your own hands, because that is where it sticks.

## The one idea this build teaches

**Draw the data.** The shelf on screen is an SVG computed from the ledger. Each bottle is a silhouette as a path. The orange level is a rectangle clipped to that path with a `clipPath`, and its height comes from the fill percent. There is no chart library and no image of a bottle. Change a number in the ledger and the picture changes, because the picture is the number.

The second half of the idea sits underneath: **peg maths in integers**, so nothing drifts. Millilitres and cents are whole numbers, every division rounds half up through a bigint, and the shelf, the list, the stats and the export all read the same `derive()` function. A drawing that disagrees with a figure is the bug you cannot afford, and one source for both rules it out.

## 1. The whole app in one picture

```
   you type           the brain                      the screen
 +-----------+     +----------------+           +-------------------+
 | bottle    | --> | buildBottle()  | --> DB -->| derive(), barStats| --> shelf (SVG), list,
 | form      |     | (form.ts)      |           | (peg.ts, stats.ts)|     restock, stats,
 +-----------+     +----------------+           +-------------------+     exports
        main.ts reads the form        main.ts reads the DB (readAll) and paints
```

In words: the form hands text to `buildBottle()`, which turns it into a checked `Bottle` or one message per field. `putBottle()` saves it into IndexedDB. `readAll()` reads every row back and passes each through `sanitizeBottle()`, and a row that fails is counted and left out. Then `derive()` and `barStats()` work out the numbers, and a screen draws them.

There is no server. The data is in IndexedDB, a database the browser keeps for this site. The page is a handful of files that GitHub hands to the phone, and then the phone does all the work.

- **The brain** (`src/core/`) knows numbers, text and the database. It has never heard of a button.
- **The screen** (`index.html`, `src/ui/`, `src/styles/`) knows how to look.
- **The wiring** (`src/main.ts`) carries data between them.

Keeping those apart is the most important design choice in the repo. It is why a wrong number can only come from a few places, and why the brain is tested without opening a browser.

## 2. Ideas this repo teaches

### Draw the data (the new one)

`drawShelf()` in [`src/ui/shelf.ts`](../src/ui/shelf.ts) takes the bottles and returns an SVG element. For each bottle it:

1. looks up the outline for the category in [`src/ui/silhouettes.ts`](../src/ui/silhouettes.ts), ten hand-written paths on a 60 by 130 grid;
2. asks `liquidTop()` for the y where the liquid starts: the bottom of the body at 0 percent, the top of the body at 100;
3. draws the outline path, then a `rect` from that y down, clipped by a `clipPath` that holds the same path, so the liquid takes the bottle's shape;
4. adds a diamond if the bottle is flagged limited, and a dim outline if it is empty;
5. wraps the whole bottle in a link to its page, with an `aria-label` that says the name, the fill, the ml and the pegs, so a screen reader gets the same facts as the picture.

How many bottles fit on a shelf comes from the width: `perRowFor()` gives one bottle per 84 pixels, between 3 and 10, and `shelfLayout()` turns that into x and y for each one. Narrow screens get more shelves.

- **See it:** `src/ui/shelf.ts`, `src/ui/silhouettes.ts`, and `src/ui/shelf.test.ts`, which checks that every category has its own outline and that the liquid rises as the fill rises, for every category.
- **Say it:** "The shelf is computed from the ledger. A silhouette is a path, the fill is a clipPath, and there is no chart library."

### Peg maths in integers

Volume is whole millilitres and money is whole cents. Price per peg is `round-half-up(paid cents x peg ml / size ml)`, done as a bigint division. A 750 ml bottle that cost $45.00 with a 30 ml peg gives 25 pegs at $1.80.

- **See it:** [`src/core/peg.ts`](../src/core/peg.ts), 65 lines, and all of [THE-PEG-MATH.md](THE-PEG-MATH.md).
- **Say it:** "Every figure is an integer, rounded once, in one named place, and a property test checks it against a second implementation."

### Local-first software

The data lives in a database inside the browser, changes shape through numbered migrations (`MIGRATIONS` in [`src/core/db.ts`](../src/core/db.ts), version 2 adds the photos and meta stores), and leaves only as a file you save. This layer comes from [Coin Vault](https://github.com/daksh2197/coin-vault), and its [THE-DATABASE.md](https://github.com/daksh2197/coin-vault/blob/main/docs/THE-DATABASE.md) teaches it in full, so I do not repeat it here. What Bar Vault adds is a photos store and the photo rules.

- **Say it:** "The data never leaves the device unless the user exports a file. The price is no sync and user-owned backups, and the app tells them so."

### Strict parsing, once

Typed text becomes a number in one place. `parseDecimal()` refuses "1,000" because it could mean a thousand or one. `buildBottle()` reports every bad field at once. Imported files and rows read from the database go through `sanitizeBottle()`, which rebuilds each bottle field by field and drops unknown keys.

- **See it:** [`src/core/decimal.ts`](../src/core/decimal.ts), [`src/core/form.ts`](../src/core/form.ts), [`src/core/schema.ts`](../src/core/schema.ts).
- **Say it:** "The form and the schema are two doors into the same room. Both must agree about what a valid bottle is, and a test feeds the schema's largest value through the form to prove it."

### Photos that never leave

A photo is chosen from the device, shrunk to 640 px on the longest side with a canvas, saved as a JPEG in its own store, and never uploaded. The canvas only exists in a browser, so `photo.ts` takes the shrinking as a function you pass in. The tests pass a stand-in and check everything else: the size limits, the 10 MB backup cap and the base64 round trip.

- **See it:** [`src/core/photo.ts`](../src/core/photo.ts).

### A file for voice routines, with no connection

The Smart home page makes a JSON file (`bar-vault-smart-home/1`) and a one-line summary. The app does not talk to any assistant. The guides cite the vendor pages they rely on, and anything those pages do not say is marked as not documented.

- **See it:** [`src/core/exports.ts`](../src/core/exports.ts), [`src/ui/smarthome-copy.ts`](../src/ui/smarthome-copy.ts) and [SMART-HOME.md](SMART-HOME.md).

### Pure functions and a property test

A pure function gets values in and gives values out, and does nothing else. `derive()` is one. A property test checks a rule for hundreds of invented inputs. Here, among others, price per peg never goes down when the price paid goes up.

- **See it:** the "price per peg never goes down when the price paid goes up" test in [`src/core/peg.test.ts`](../src/core/peg.test.ts). Test names are written as sentences, so each file doubles as a spec.
- **Run it:** `npm test`.

### Offline, and CI

A service worker saves the app on the first visit, so it opens with no signal. A GitHub Actions file runs the tests on every push to main and every pull request, and deploys only if they pass and the repo is public. A Content-Security-Policy tag in the built page sets `connect-src 'none'`, so the page cannot send anything anywhere.

- **See it:** [`public/sw.js`](../public/sw.js), [`scripts/stamp-sw.mjs`](../scripts/stamp-sw.mjs), [`.github/workflows/ship.yml`](../.github/workflows/ship.yml), and the `CSP` list in [`vite.config.ts`](../vite.config.ts).

## 3. Where things live

| You want to change... | Open this |
| --- | --- |
| How ml left, pegs, price per peg or value left are worked out | `src/core/peg.ts` |
| The peg size limits or the three presets | `src/core/peg.ts` (`PEG_MIN_ML`, `PEG_MAX_ML`, `PEG_PRESETS`) |
| When a bottle counts as low | `isLow()` in `src/core/peg.ts` |
| Totals, average, median, the histogram | `src/core/stats.ts` |
| The low list, the watchlist, the shopping list | `src/core/restock.ts` |
| The whole-bar CSV, the smart-home JSON and its summary | `src/core/exports.ts` |
| Search and sort | `src/core/list.ts` |
| What the add-a-bottle form accepts | `src/core/form.ts` |
| What counts as a valid saved bottle, and its length limits | `src/core/schema.ts` |
| The categories and rarity tags | `src/core/types.ts` |
| The database, or a new migration | `src/core/db.ts` |
| The backup file and merge rules | `src/core/vaultfile.ts` |
| Passphrase rules and the lock | `src/core/lock.ts` |
| Photo size, the backup cap | `src/core/photo.ts` |
| The invented demo bottles | `src/core/sample.ts` |
| The look of a bottle, or where the liquid starts | `src/ui/silhouettes.ts` |
| How the shelf is laid out | `src/ui/shelf.ts` |
| A screen's layout and words | `src/ui/screens.ts`, `src/ui/bottle-form.ts`, `src/ui/backup-screen.ts`, `src/ui/smarthome.ts` |
| The smart-home guides and their cited sources | `src/ui/smarthome-copy.ts` |
| Sentences that include a number or a date | `src/ui/words.ts` |
| Which address shows which screen | `src/ui/route.ts` |
| What happens on start-up | `src/main.ts` |
| A brand colour or font name | `src/styles/brand.css` (font files are in `src/styles/fonts.css`) |
| Layout, spacing, the tab bar, the shelf's colours | `src/styles/app.css` |

## 4. When something breaks

| What you see | Likely cause | Where to look | How to check |
| --- | --- | --- | --- |
| A price per peg looks wrong | The peg size, or the maths | **Settings** first, then `pricePerPegCents()` in `peg.ts` | Work it by hand: paid cents x peg ml / size ml, halves up. Then write the case as a test in `peg.test.ts`. If it passes, the bug is in the form or the screen. |
| "Gift or free: no price per peg" | The bottle was saved with a price of $0.00 | The bottle's **Paid** box, `priceLine()` in `words.ts` | Edit the bottle and type the price. |
| Per-peg figures use fewer bottles than the count | Gifts are left out on purpose | `barStats()` in `stats.ts` | The Stats page says how many bottles it used. |
| The orange level on a bottle looks too high or too low | The fill percent, or that category's `bodyTop` and `bodyBottom` | `liquidTop()` and `SILHOUETTES` in `silhouettes.ts` | Open the bottle and read the slider. The level is the bottom of the body at 0 and the top at 100, so check those two numbers for the category. |
| A bottle's name runs into the shelf board | A long name with no space in it | `nameLines()` in `shelf.ts` | A name breaks at a space if there is one at the fifth character or later in its first 12, and otherwise after 11 characters. Try a name with a space. |
| A bar is missing a bottle and a red line says "N saved rows could not be read" | A row on disk fails validation | `sanitizeBottle()` in `schema.ts` | In the browser's Application tab, open IndexedDB, `bar-vault`, `bottles`, and look at the row. |
| "This bar was saved by a newer version of Bar Vault" | The page you opened is older than the database on this device | `openVault()` in `db.ts` | Hard-refresh to get the newer page. Nothing was changed. |
| "This browser does not let Bar Vault keep data here." | IndexedDB is blocked (private windows often do) | The red message at the top | Use a normal window. |
| "That picture is over 25 MB" or "This browser could not read that picture" | The photo rules, or a format the browser cannot decode | `makePhoto()` and `canvasResize()` in `photo.ts` | Try a JPEG or PNG under 25 MB. |
| Import says "This is not a Bar Vault file." | The file is not JSON, or its `format` is not `bar-vault` | `parseVaultText()` in `vaultfile.ts` | Open the file in a text editor. The first lines should name the format. A Coin Vault file is refused, because its format string differs. |
| "That passphrase does not open this file" | Wrong passphrase, or the file was edited | `unlockText()` in `lock.ts` | Try again, typed slowly. There is no other way in. |
| The smart-home summary ends "and 3 more" | It names at most eight bottles | `SUMMARY_NAMES` in `exports.ts` | Count the names. The JSON has every low bottle. |
| The site still shows an old version after a deploy | GitHub Pages lets browsers reuse files for about 10 minutes | Nothing to fix | Wait, or hard-refresh. If it is still old, check the Actions tab. |
| It does not work offline when you run it with `npm run dev` | The service worker is only registered in the built app | `main.ts` (`import.meta.env.PROD`) | Run `npm run build`, then `npm run preview`. |
| Green check, but no website | The repo is private, so the deploy steps are skipped on purpose | `.github/workflows/ship.yml` | Make the repo public, set Pages to **GitHub Actions**, then run the workflow once. |
| Red X on a push | A test or the build failed | GitHub, **Actions**, click the red run | The log names the failing test. Nothing deployed, so the live site is the last good version. |

**The one debugging habit that matters:** reproduce it as a test first. A bug you can trigger with a test is a bug you can fix once and keep fixed.

## 5. Your turn

Five real changes, easiest first. I made each one on a scratch copy of the repo, ran `npm test` and `npm run typecheck` where it says so, and threw the copy away, so each works as written. Each is worth a commit with your name on it. Undo an uncommitted change with `git checkout .` before you start the next.

1. **Add a fourth peg preset.** In `src/core/peg.ts` change `PEG_PRESETS = [30, 45, 60] as const` to `[30, 45, 60, 90] as const`. The Settings screen builds its chips by mapping over that list (`settingsScreen` in `src/ui/screens.ts`), so there is nothing else to edit. *Done when:* Settings shows a fourth chip, "90 ml", that fills 90 into the peg box, and `npm test` still says 543 passed. Then fix the line in `docs/THE-PEG-MATH.md` that says the presets are 30, 45 and 60, or undo the change.

2. **Shorten the spoken summary.** In `src/core/exports.ts` change `SUMMARY_NAMES = 8` to `5`. *Done when:* with six low bottles the summary on the Smart home page reads "6 bottles low: a, b, c, d, e and 1 more." with your own names in place of a to e. Now notice what `npm test` says: it stays green, because the test reads the constant instead of repeating the number. A green run does not mean the docs are right. `docs/SMART-HOME.md` still says "Past eight names it lists eight". Fix that line. This is the lesson: tests guard behaviour, and prose is on you.

3. **Write a test.** In `src/core/peg.test.ts`, inside the first `describe`, above the "a part peg is not counted as a peg" test, add:
   ```ts
   it('a 1000 ml bottle at $38.00 with a 60 ml peg holds 16 pegs at $2.28 each', () => {
     const d = derive(bottle('a', { sizeMl: 1000, paidCents: 3800, fillPct: 100 }), 60);
     expect(d.pegsFull).toBe(16);
     expect(d.pricePerPegCents).toBe(228);
   });
   ```
   Work the answer by hand first: 3,800 x 60 / 1,000 = 228 cents, and 1,000 / 60 = 16.67, so 16 whole pegs. *Done when:* `npm test` says 544 passed. If your hand figure and the test disagree, you have found either a bug or an arithmetic slip, and both are worth knowing about.

4. **Change the low rule and read the failures.** In `src/core/peg.ts` change `isLow` from `b.fillPct <= b.lowPct` to `b.fillPct < b.lowPct`. `npm run typecheck` still passes, which is a reminder that only tests catch a rule change. *Done when:* `npm test` goes red with four failures: "a bottle is low at exactly its threshold, and not one percent above" in `peg.test.ts`, "uses each bottle's own threshold" and "lists every bottle at most once (property)" in `restock.test.ts`, and "never contains NaN or null for a random bar (property)" in `exports.test.ts`. Read each one and say which rule it protects. Then undo the change. That red X is the safety net doing its job.

5. **Add a category.** Add Mezcal. In `src/core/types.ts` put `'mezcal'` after `'tequila'` in `CATEGORIES`, and `mezcal: 'Mezcal',` after the tequila line in `CATEGORY_LABEL`. Run `npm run typecheck`: it fails in `src/ui/silhouettes.ts` because every category needs an outline, and that error is your checklist. In `SILHOUETTES`, above the `brandy` line, add an outline that is not a copy of another one, for example:
   ```ts
   mezcal: { d: 'M24 12H36V30Q50 38 50 56V119Q50 127 42 127H18Q10 127 10 119V56Q10 38 24 30Z', bodyTop: 44, bodyBottom: 127 },
   ```
   *Done when:* `npm run typecheck` is clean and `npm test` says 543 passed. The shelf test fails if two categories share a path, so a pasted copy of tequila's outline will go red. The form's list, the sort order and the Paid by category table all read `CATEGORIES`, and the shelf draws the outline you added, so the new category appears in each without another edit. This is the one to talk through with Claude: ask it to explain why the type checker, and not a test, found the missing outline.

## 6. Questions you should be ready for

**Why draw the shelf by hand instead of using a chart library?**
It is ten outlines and some rectangles. A library would be more code to keep current and could not draw a bottle anyway. The app's JavaScript is about 26 kB compressed.

**Why integers and bigint?**
So nothing in the maths depends on what a float does. A price is cents, a volume is millilitres, and a division rounds half up in one place. A property test compares the result against a second way of writing the same rule.

**Why no React?**
Forms, lists and one drawing. The structure a framework gives you, logic separate from view, is here already.

**Does it fetch prices or tell you what a bottle is worth?**
No. Every price is typed by the owner. The reference price on a bottle is three typed fields, and no figure uses it. "On sale" is a flag and a note the owner writes.

**Does it connect to Alexa, Google Home or Apple Home?**
No. It writes a file and a one-line summary. The guides say which steps a vendor page documents, and I did not run them on a device.

**What happens with no signal?**
The service worker saved every file on the first visit, and the data is already on the device. The page is fetched fresh when there is a connection, so updates arrive, and falls back to the saved copy when there is not.

**Where is the data stored, and what if I lose my phone?**
In IndexedDB on the device. If the device is lost and no backup file was saved, the data is gone. That is the cost of local-first, and the Backup page shows the date of the last backup for that reason.

**What did the AI do, and what did you do?**
Say it straight: Claude wrote most of the code as a pair programmer. You chose the problem, made the product decisions, reviewed the changes and can walk through any file. Then walk through one.

## 7. Words you'll hear

| Word | Plain meaning |
| --- | --- |
| Peg | A measure of spirit you choose in Settings, 30 ml by default |
| SVG | A picture written as shapes in text, so code can draw it |
| `clipPath` | A shape that cuts off whatever is drawn inside it. Here it keeps the orange inside the bottle |
| Silhouette | The outline of a bottle, stored as a path |
| Bigint | A whole number with no size limit, so a division can be exact |
| Round half up | 2.5 becomes 3. The same rule everywhere |
| IndexedDB | The database a browser keeps for a site |
| Migration | A numbered step that moves a database from one shape to the next |
| Property test | A test that checks a rule over hundreds of invented inputs |
| Service worker | A small script the browser keeps so the app opens with no signal |
| Content-Security-Policy | A tag that tells the browser what the page may load or connect to. Here, nothing outside the page |
