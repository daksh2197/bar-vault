# Smart home: what Bar Vault gives you and what it cannot do

Bar Vault does not connect to Alexa, Google Home or Apple Home. It makes two things on your device: a small JSON file and a one-line summary. You carry them across by hand.

This page is the long version of the Smart home screen in the app. The rule I followed: a feature is stated as fact only if an official vendor page fetched for this build says it, and I quote the page with its URL. Everything else is written as "not documented on the pages fetched for this build (Oct 23, 2026)". That is not a claim that it cannot be done. It means this build found no official page saying it can.

I did not run any of these steps on a phone or a speaker. App menus change. Treat every guide as a test to try, not a promise.

## The file

Format string: `bar-vault-smart-home/1`. Every value is computed on the device from the numbers you typed and your peg size.

```json
{
  "format": "bar-vault-smart-home/1",
  "generated": "2026-10-23T12:00:00.000Z",
  "pegMl": 30,
  "bottles": [
    {
      "name": "SAMPLE Quillon Dry Gin",
      "category": "gin",
      "sizeMl": 750,
      "fillPct": 12,
      "mlLeft": 90,
      "pegsLeft": 3,
      "pricePerPegCents": 180,
      "low": true,
      "limited": false
    }
  ],
  "lowBottles": ["SAMPLE Quillon Dry Gin"],
  "summary": "1 bottle low: SAMPLE Quillon Dry Gin."
}
```

`pricePerPegCents` is `null` for a bottle you paid nothing for, because a gift has no price per peg. In the whole-bar CSV the `price_per_peg_cad` field is empty for the same reason.

The summary reads "No bottles are low." for none, "1 bottle low: Bitterwick." for one, and "3 bottles low: Bitterwick, dry vermouth, gin." for three. Past eight names it lists eight and says how many more.

## What the vendor pages say

All pages fetched Oct 23, 2026. Amazon's pages were reached through an Amazon-hosted copy of the Alexa help (digprjsurvey.amazon.com), fetched Oct 23, 2026. I did not fetch amazon.com/alexa pages directly.

| Platform | Capability | Answer | Evidence |
|---|---|---|---|
| Alexa | Put a typed voice command into a routine | Documented | "Use a custom action to put an Alexa voice command into a routine." and "Type in what you want Alexa to do, just as you might say by voice, but without the wake word." https://digprjsurvey.amazon.com/csad/help/node/GLXY7RFX3L5GH2VR |
| Alexa | Add to a list by voice | Documented in general form | Example: "Add [item] to [list name]." The page does not name a shopping list. https://digprjsurvey.amazon.com/csad/help/node/GYASCW9JH26A47T2 |
| Alexa | A routine that speaks a sentence you typed | Not documented on the pages fetched | The page describes a typed voice command, not a read-aloud of free text. |
| Alexa | Read or import a file | Not documented on the pages fetched | Neither page mentions it. |
| Alexa | List actions inside a routine | Not documented on the pages fetched | The list page is silent on routines. |
| Google Home | Custom voice starter | Documented | "Start a Routine when you say a custom voice command." https://support.google.com/googlehome/answer/7029585 |
| Google Home | Custom action | Documented | "Enter a command for your voice assistant." https://support.google.com/googlehome/answer/7029585 |
| Google Home | Broadcast in a routine | Documented | "Broadcast messages and send and read texts." Whether the text can be typed freely is not stated. https://support.google.com/googlehome/answer/7029585 |
| Google Home | Shopping list by voice, saved in Keep | Documented | "Your Shopping List and Assistant Notes and Lists are now saved in Google Keep." No exact voice phrase is quoted. https://support.google.com/assistant/answer/14171370 |
| Google Home | A "say something" text action | Not documented on the pages fetched | Not found on the routines page. |
| Google Home | Add to the shopping list inside a routine | Not documented on the pages fetched | The routines page does not mention lists. |
| Google Home | Read or import a file | Not documented on the pages fetched | The routines page mentions no file import. |
| Apple | Ask Siri to run a shortcut by name | Documented | "You can ask Siri to run any shortcut in your collection." and "Siri tells you the result." https://support.apple.com/en-ca/guide/shortcuts/apd07c25bb38/ios |
| Apple | Turn JSON text into a dictionary | Documented | "Use the Get Dictionary from Input action to turn text containing JSON or .plist data into a dictionary item." https://support.apple.com/en-ca/guide/shortcuts/apd43b69f337/ios |
| Apple | Get File, Speak Text, Add to Reminders, Home automation running a shortcut, Convert to Shortcut | Not documented on the pages fetched | No fetched page described them. A page titled "Create a new home automation in Shortcuts on iPhone or iPad" exists, but the fetch returned only its table of contents. |

## The guides

### Alexa

1. Open the Smart home page in Bar Vault and read the one-line summary. It names the low bottles.
2. In the Alexa app, make a routine with a voice trigger you choose, such as "bar check".
3. Add a custom action. Type a voice command without the wake word, shaped like the documented example: "add Bitterwick to my shopping list". One custom action per low bottle.
4. Say the trigger and see whether the list changed. Whether a list command works inside a routine is not documented on the pages fetched for this build (Oct 23, 2026), so this is a test.
5. When the bar changes, copy a fresh summary and edit the actions by hand. Nothing syncs.

### Google Home

1. Read the one-line summary on the Smart home page.
2. In the Google Home app, make a household routine with a custom voice starter, such as "bar check".
3. Add a custom action and type a command for the assistant, such as "add Bitterwick to my shopping list".
4. Say the starter, then open Google Keep to see whether the list changed. A list command inside a routine is not documented on the pages fetched for this build (Oct 23, 2026), so this is a test.
5. Outside a routine you can say the list command to the assistant directly.

### Apple Shortcuts and Siri

1. On the Smart home page, copy the JSON.
2. In Shortcuts, make a shortcut named "Bar check".
3. Add a Text action and paste the JSON. Add Get Dictionary from Input (documented), then Get Dictionary Value for the key "summary". The page for Get Dictionary Value is linked from the documented page and was not read for this build. The Text action and the pasting are not covered by the pages fetched.
4. Say "Hey Siri, Bar check". Siri runs shortcuts by name and tells you the result (both documented).
5. Pasted JSON is a snapshot. Copy it again after the bar changes.

## What is not documented

Each of these is not documented on the pages fetched for this build (Oct 23, 2026).

- Alexa and Google Home reading, importing or syncing a JSON or CSV file.
- Alexa speaking a sentence you typed in a routine, and Google Home having a "say something" action.
- List actions inside an Alexa or Google Home routine.
- Apple: Get File, Speak Text, Add to Reminders, a Home automation that runs a shortcut, and Convert to Shortcut.
