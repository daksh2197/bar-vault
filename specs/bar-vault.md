# Bar Vault: spec

## Verdict

One installable web app (TypeScript strict, Vite, Vitest with fast-check, no framework) that is a home bar ledger: what is on the shelf, how much is left, what each peg cost, which bottles are rare by the owner's own tag, what is low, and a plain JSON and CSV the owner can wire into Alexa, Google Home or Apple Home routines by hand. Local-first, IndexedDB with migrations, passphrase-locked backup, storage layer reused from Coin Vault. The app records what the owner has and gives no drinking advice.

Repo: `daksh2197/bar-vault`.

## Decisions

1. **Age line.** The first brief said "19+ in Alberta". Alberta's legal drinking age is 18 (Manitoba and Quebec too; the rest of Canada is 19). The page says: "For adults of legal drinking age where you live (18 in Alberta). This app records what you own. It gives no drinking advice."
2. **Peg default 30 ml**, set by the user in Settings (5 to 500 ml). The page notes Indian usage: a small peg is 30 ml, a large peg 60 ml. Presets 30, 45, 60.
3. **Money and volume are integers.** Cents and millilitres, like Coin Vault's cents and nanograms. Price per peg is `round-half-up(paidCents x pegMl / sizeMl)`. Fill is a whole percent from a slider. Nothing on screen can be NaN.
4. **Rarity is a tag the owner picks** (common, limited, numbered, allocated, discontinued, unknown) plus a "limited or numbered" flag with a free-text bottle number ("214 of 1,000"). The "secondary market reference" is three typed fields: amount, source, date. The app never fetches or guesses a price, and the page says so on the bottle form, on Stats and on About.
5. **"On sale" is a manual watchlist**: a flag and a note per bottle ("seen at a lower price on a shelf tag"), nothing else. No scraping of liquor-store sites. Alberta liquor retail is private and no store's terms were checked, so none are fetched.
6. **Smart home is an export plus a guide.** Only features found on official vendor pages are stated as fact; everything else is marked "not documented on the pages fetched" with the date. Apple Shortcuts is the only platform where a documented action turns JSON into a dictionary. Alexa and Google get a typed one-line summary the app produces for pasting into a routine. No vendor SDK, no accounts.
7. **Photos stay local** in a `photos` object store (resized on the device to 640 px on the longest side, JPEG), included in backups as base64 behind a checkbox that is on by default, with a size cap. Never uploaded anywhere.
8. **The sample bar is invented**: eleven bottles with made-up names, labelled "Invented sample bar, not a real one" wherever they show, with a one-tap "clear sample" action.
9. **Brand**: the Coin Vault `brand.css` and fonts unchanged, dark only, a "DD" tile linking to dakshdua.ca, `?embed=1` supported.

## What it is

1. **Bottles.** Fields: name (up to 120 characters), category (whisky, gin, vodka, rum, tequila, brandy, liqueur, vermouth, wine, other), size in ml (1 to 100,000), fill % (0 to 100, slider), paid (cents, may be 0 for a gift), bought where (up to 200), bought on (ISO date, optional), limited or numbered flag, bottle number (up to 40), rarity tag, market reference {amountCents, source up to 200, date}, watch flag and watch note (up to 500), low threshold % (default 20), notes (up to 2,000), photo (separate store), createdAt and updatedAt as ISO times. Derived on every screen: ml left, pegs left, price per peg, value left.
2. **Shelf view** (default screen): an SVG shelf drawn from the ledger. One silhouette per category (original simple paths), fill level drawn with a clipPath in the accent colour, a small tag for limited bottles, a dim outline when empty. Tap a bottle to open it. Sort by category, fill or price per peg. Works at 320 px wide (bottles wrap onto more shelves).
3. **Bottles list**: search, sort, add, edit, delete with confirm. Form validation with field errors.
4. **Restock**: bottles at or under their threshold, the watchlist with notes, and exports: shopping list as text and CSV, whole bar as CSV, smart-home JSON. Copy button and download for each.
5. **Stats**: bottle count, bottles low, total paid, value left, average and median price per peg, a histogram of price per peg (SVG bars, buckets computed in core), paid by category. Every figure is computed from typed data, and a line says so. A gift entered as $0.00 is left out of the per-peg figures.
6. **Backup**: export plain JSON or passphrase-locked JSON (PBKDF2-SHA256 with 600,000 iterations, AES-GCM, format `bar-vault-enc`), import either with merge (same id: the newer `updatedAt` wins), last-backup date and a seven-day eviction warning, as in Coin Vault. Settings are not in the file.
7. **Smart home page**: the JSON shape, three guides, the one-line summary to paste, the "what is not documented" list.
8. **Settings**: peg size, default low threshold, clear sample, wipe everything (typed confirmation).
9. **About**: age line, no-advice line, no-price-fetch line, invented-sample line, privacy line (nothing leaves the device; no network after load; a Content-Security-Policy tag).

## Smart-home JSON (`bar-vault-smart-home/1`)

```
{ "format": "bar-vault-smart-home/1", "generated": ISO, "pegMl": 30,
  "bottles": [ { "name", "category", "sizeMl", "fillPct", "mlLeft", "pegsLeft", "pricePerPegCents", "low": bool, "limited": bool } ],
  "lowBottles": [ "name", ... ],
  "summary": "3 bottles low: SAMPLE Cassory Dry Vermouth, SAMPLE Quillon Dry Gin, SAMPLE Bitterwick Red." }
```

Bar CSV columns: `name,category,size_ml,fill_pct,ml_left,pegs_left,price_per_peg_cad,low,limited,rarity,bought_where,bought_on`. The sample bar uses invented names only.

## Module map

```
src/core/   types.ts  schema.ts (sanitize)  decimal.ts  money.ts  dates.ts  (from Coin Vault, attributed)
            peg.ts (all peg maths, pure)  stats.ts (histogram, median, mean, totals)
            restock.ts (low list, watchlist, shopping list as text and CSV)
            exports.ts (bar CSV, smart-home JSON and summary)  list.ts (search and sort)
            form.ts (typed text to a checked bottle)  vaultfile.ts (export, import, merge)  lock.ts (from Coin Vault)
            db.ts (openVault, MIGRATIONS v1 to v2, stores bottles, photos, meta)  photo.ts (resize to JPEG, size caps, base64)
            sample.ts  fixtures.ts (shared by the tests)
src/ui/     shelf.ts (SVG from data)  silhouettes.ts (category to path)  screens.ts  bottle-form.ts  backup-screen.ts
            smarthome.ts  smarthome-copy.ts  words.ts  route.ts  parts.ts  dom.ts  ctx.ts
src/main.ts  src/styles/ (brand.css, fonts.css, app.css)  src/hygiene.test.ts
public/ (sw.js, manifest, icons)  scripts/stamp-sw.mjs  .github/workflows/ship.yml
```

## Tests (Vitest and fast-check, 300 runs per property)

- `peg.test.ts`: worked examples (750 ml, $45.00, 30 ml peg gives 25 pegs at $1.80; 700 ml at 40% gives 280 ml, 9 pegs of 30 ml). Properties: price per peg is never NaN or negative, rises with the price paid, does not rise with the size, whole pegs times peg size never exceed ml left, which never exceeds the size, a full bottle gives the whole size and an empty one gives nothing, and rounding half up matches a separate bigint calculation.
- `db.test.ts` (fake-indexeddb): open at v1, write bottles, reopen at v2, rows survive, the photos store exists, the threshold is backfilled; photo round trip.
- `vaultfile.test.ts`: plain and locked round trip on random bottles (with and without photos); merge rules; junk, truncated, wrong-format and oversized files fail with a message.
- `exports.test.ts`: CSV escaping property (quotes, commas and newlines in names survive a CSV parser written in the test); smart-home JSON shape; summary sentence for 0, 1 and many low bottles.
- `schema.test.ts`: unknown keys dropped, every limit enforced, hostile strings.
- `stats.test.ts`: the histogram covers every value exactly once; median on odd, even and empty lists.
- `shelf.test.ts`, `route.test.ts`, `words.test.ts`, `smarthome-copy.test.ts`, `list.test.ts`, `restock.test.ts`, `photo.test.ts`, `form.test.ts`, `sample.test.ts`, `lock.test.ts`, `decimal.test.ts`, `money.test.ts`, `dates.test.ts`.
- `hygiene.test.ts`: rules for the whole repo: no network calls from app code, no user text written as markup, no real brand names in the sample or screens, and the page policy blocks all connections.

## QA

- Hostile input: blanks, negatives, 0 ml, 1e23, pasted junk, emoji names, a camera-sized photo, a 20 MB import, a mangled hash route.
- Walkthrough at 320, 390, 768, 1280 and 1440 wide: empty state, sample loaded, shelf, bottle form, slider, restock exports, stats, backup lock and unlock, smart-home page, `?embed=1`, offline reload.
- Independent review by a separate session that has not seen the build.

## Docs

README in the author's voice, `docs/CTO-NOTES.md` leading with "draw the data: an SVG shelf computed from the ledger, and peg maths in integers", `docs/THE-PEG-MATH.md`, `docs/SMART-HOME.md` (the guide with sources and dates), `docs/BUSINESS.md` (a "bar sheet" template pack on a storefront as the only honest path, one cheap demand test, no numbers), `docs/screenshots/`.

## Sources

- Legal drinking age by province: Wikipedia, "Alcoholic drinks in Canada" (fetched Oct 23, 2026). 18 in Alberta, Manitoba and Quebec.
- Alexa Routines custom action and lists pages, Google Home routines and Keep lists pages, Apple Shortcuts "Run shortcuts with Siri" and "Get Dictionary from Input" pages, each with its URL and the Oct 23, 2026 fetch date in `docs/SMART-HOME.md`.
- Coin Vault (MIT, Daksh Dua) for the shape of `db.ts`, `lock.ts`, `decimal.ts`, `money.ts`, `dates.ts` and `vaultfile.ts`.
