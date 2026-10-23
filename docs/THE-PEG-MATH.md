# The peg maths

Bar Vault turns four typed things (bottle size, fill, price paid, peg size) into the numbers on every screen. This page gives each formula, why every figure is a whole number, and the edge cases. Each worked example here is a test, and I quote its name so you can find it.

The code is in [`src/core/peg.ts`](../src/core/peg.ts) (65 lines), with the half-up division in [`src/core/decimal.ts`](../src/core/decimal.ts), the totals in [`src/core/stats.ts`](../src/core/stats.ts), and the tests in [`src/core/peg.test.ts`](../src/core/peg.test.ts) and [`src/core/stats.test.ts`](../src/core/stats.test.ts).

## 1. What a peg is here

A peg is a measure you choose. The app does not decide what a pour is. You set the peg size in Settings, from 5 to 500 ml, and the default is 30 ml. There are three presets, `PEG_PRESETS = [30, 45, 60]`.

The Settings page carries a note on Indian usage: a small peg is 30 ml and a large peg is 60 ml. Change the peg size and every screen changes with it: pegs left, price per peg, the histogram and the smart-home file.

## 2. The formulas

Volume is whole millilitres. Money is whole cents (Canadian dollars). Fill is a whole percent from a slider.

| Figure | Formula | Function |
| --- | --- | --- |
| ml left | `round-half-up(size x fill% / 100)` | `mlLeft(sizeMl, fillPct)` |
| pegs left | `floor(ml left / peg size)` | `pegsFrom(ml, pegMl)` |
| pegs in a full bottle | `floor(size / peg size)` | `pegsFrom(sizeMl, pegMl)` |
| price per peg | `round-half-up(paid cents x peg ml / size ml)` | `pricePerPegCents(paidCents, sizeMl, pegMl)` |
| value left | `round-half-up(paid cents x ml left / size ml)` | `valueLeftCents(paidCents, sizeMl, ml)` |
| low | `fill% <= low line%` | `isLow(bottle)` |

`derive(bottle, pegMl)` runs all of them and hands back one object, so a screen never does maths of its own.

Two choices worth knowing:

- **A part peg is not a peg.** 59 ml is one peg of 30, not two. Test: "a part peg is not counted as a peg".
- **Value left uses the ml that is left, already rounded.** It is the price paid, scaled by how much is still in the bottle. It is not what the bottle would sell for. The page says so.

## 3. Worked examples that are tests

**A 750 ml bottle at $45.00, a 30 ml peg.** 4,500 cents x 30 / 750 = 180 cents. 750 / 30 = 25 pegs. So $1.80 a peg and 25 pegs. Test: "a 750 ml bottle at $45.00 with a 30 ml peg holds 25 pegs at $1.80 each".

**A different peg on the same bottle.** Test: "a bigger peg means fewer pegs and a higher price for each".

| Peg | Pegs in the bottle | Price per peg |
| ---: | ---: | ---: |
| 30 ml | 25 | $1.80 |
| 45 ml | 16 | $2.70 |
| 60 ml | 12 | $3.60 |

**A bottle part-way down.** A 700 ml bottle at 40 percent has 280 ml left, which is 9.33 pegs of 30 ml, so 9. Test: "a 700 ml bottle at 40 percent has 280 ml left, which is 9 pegs of 30 ml".

**Value left.** Half of a 750 ml bottle that cost $45.00 is 375 ml, and the value left is $22.50. Test: "value left is the share of the price that is still in the bottle".

**Halves round up.** These are rows of one table-driven test, named by their numbers:

- "price per peg for 1 cents, 2 ml, 5 ml peg is 3 cents": 1 x 5 / 2 = 2.5, which rounds to 3.
- "price per peg for 3 cents, 2 ml, 5 ml peg is 8 cents": 3 x 5 / 2 = 7.5, which rounds to 8.
- "price per peg for 4987 cents, 750 ml, 30 ml peg is 199 cents": 199.48 rounds down. At 4,999 cents the answer is 199.96, and the test "price per peg for 4999 cents, 750 ml, 30 ml peg is 200 cents" checks that.

The same rule for ml left: "ml left of a 3 ml bottle at 50 percent is 2" (1.5 rounds up), "ml left of a 1 ml bottle at 49 percent is 0", and "ml left of a 333 ml bottle at 33 percent is 110" (109.89).

**Low is inclusive.** A bottle at 20 percent with a 20 percent low line is low. At 21 it is not. Test: "a bottle is low at exactly its threshold, and not one percent above".

## 4. Why integers, and why bigint half-up

A float cannot hold 0.1 exactly. A price per peg that is computed as a float and then shown to two places can be a cent off, and two screens that round at different steps can disagree. So there is no float in any figure the app shows. Millilitres and cents are integers, and a division is done once, in one place, and rounded once.

The rule is half up: 2.5 becomes 3, and 7.5 becomes 8. It is written as one line in `decimal.ts`:

```
divRoundHalfUp(n, d) = (2n + d) / (2d)     with bigint, where / drops the remainder
```

It runs on bigints. The product `paid x peg` is at most 10^12 x 500, which is under the largest integer a float holds exactly, so I did not need a bigint to dodge a wrong answer in that range. I used it because with bigint nothing about the result depends on what a float does, and the test can then check it a second way. The property test "rounding half up matches a separate bigint calculation" writes the same formula again in the test file and compares the two over random inputs.

Money totals are bigints too (`totalPaidCents`, `valueLeftCents` in `barStats`), so adding 5,000 bottles cannot overflow.

The shelf is the one place plain numbers are rounded as floats: the height of the orange is drawn in pixels with `Math.round`. No money or millilitre figure is read back from a drawing.

## 5. Properties that hold for every input

The property tests (fast-check, 300 runs each) say what must be true for any bottle, not only the hand-picked ones:

- "price per peg is never NaN, never negative and always a whole number"
- "price per peg never goes down when the price paid goes up"
- "price per peg never goes up when the bottle gets bigger"
- "whole pegs times peg size never exceed the ml left, which never exceeds the bottle"
- "a full bottle gives the whole size and an empty one gives nothing"
- "ml left never goes down when the fill goes up"
- "value left never exceeds what was paid and is zero for an empty bottle"
- "every derived figure of a random bottle is a safe whole number"

## 6. Edge cases

- **0 ml is refused.** A bottle size runs from 1 to 100,000 ml. Typing 0 gives "Size must be at least 1." A peg size runs from 5 to 500 ml, and 0 gives "Peg size must be at least 5." Underneath, the maths functions return 0 for an out-of-range input rather than NaN. Test: "refuses nonsense inputs by returning zero, never NaN".
- **A gift is $0.00.** Type 0 for a gift. The bottle shows "Gift or free: no price per peg", and its price per peg is 0.
- **A gift stays out of the average, the median and the histogram.** Zero is not a price paid. Counting it would pull the average down and put a bar at $0.00 that no purchase made. `barStats` only takes bottles with `paidCents > 0` for those three, and says how many it used (`pricedCount`). The totals for paid, value left and the category table still include every bottle. Test: "leaves gifts out of the per-peg figures and says how many were used". In that test a $45.00 bottle ($1.80 a peg) and a $60.00 bottle ($2.40 a peg) sit beside a gift. The average is $2.10. With the gift counted it would be $1.40.
- **An empty bottle.** 0 percent fill gives 0 ml, 0 pegs and a value of 0. It is drawn as a dim outline.
- **A very large price.** The price paid is capped at 1,000,000,000,000 cents, which is $10,000,000,000.00 (`MAX_CENTS`). The form refuses anything above it.
- **A typed comma.** "1,000" could be a thousand or one, so the number reader refuses it and says why. That is the strict parsing from Coin Vault.

## 7. The histogram of price per peg

The Stats screen sorts every priced bottle into price bands. The rule is in `histogram()` in `stats.ts`:

1. Keep values that are whole numbers of zero or more. Anything else is dropped.
2. Take the range, `max - min`, and divide it by 6 (the target number of bands), rounding up.
3. Round that width up to the next 1, 2 or 5 times a power of ten (`niceWidth`): 1, 2, 5, 10, 20, 50, 100, 200, 500 cents, and so on.
4. Start the first band at the largest multiple of the width that is at or below the smallest value.
5. Band `i` holds `start + i x width <= value < start + (i + 1) x width`. A value on a boundary goes in the upper band. Every value lands in exactly one band.

Worked example, the one in the test "uses round bucket widths and starts on a multiple of the width": prices of 100, 250, 300, 780 and 1,000 cents. The range is 900, divided by 6 is 150, and 150 rounds up to a width of 200. The first band starts at 0.

| Band | Bottles |
| --- | ---: |
| $0.00 to $1.99 | 1 |
| $2.00 to $3.99 | 2 |
| $4.00 to $5.99 | 0 |
| $6.00 to $7.99 | 1 |
| $8.00 to $9.99 | 0 |
| $10.00 to $11.99 | 1 |

The label shows the top of a band as one cent below the next band's start, so bands do not read as overlapping.

The properties: "covers every value exactly once (property)" and "keeps the bucket count small whatever the values (property)". On the invented sample bar at a 30 ml peg the width comes out at $2.00 with five bands.

The median is the middle value, or for an even count the two middle values added and halved, rounded half up. The mean is the sum divided by the count, rounded half up, and both are null for an empty list, which the screen shows as "none".

## 8. What this does not do

It does not look anything up. It does not say what a bottle is worth on the market. The reference price you can type on a bottle is stored and shown, and no figure on any screen uses it.
