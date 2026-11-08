/**
 * The words on the Smart home page, kept as data so a test can check them.
 *
 * The rule: a feature is stated as fact only if an official vendor page fetched for this build says it,
 * and the sentence quotes that page with its URL. Everything else is written as "not documented on the
 * pages fetched for this build (Oct 23, 2026)". Nothing here says that Alexa or Google can read a file.
 */

export const FETCHED = 'fetched Oct 23, 2026';
/** Said wherever the Alexa pages are cited, because they were not read on amazon.com itself. */
export const AMAZON_NOTE = "Amazon's pages were reached through an Amazon-hosted copy of the Alexa help (digprjsurvey.amazon.com), fetched Oct 23, 2026";
export const NOT_DOCUMENTED = 'not documented on the pages fetched for this build (Oct 23, 2026)';

export interface Fact {
  /** What the page says, quoted. */
  quote: string;
  url: string;
  /** A plain note on what the quote does and does not cover. */
  note?: string;
}

export interface Guide {
  id: 'alexa' | 'google' | 'apple';
  name: string;
  intro: string;
  documented: Fact[];
  steps: string[];
  notDocumented: string[];
}

export const GUIDES: Guide[] = [
  {
    id: 'alexa',
    name: 'Alexa',
    intro: `Alexa Routines can hold a typed voice command. That is the documented hook, so the guide uses it for the shopping list. ${AMAZON_NOTE}.`,
    documented: [
      {
        quote: 'Use a custom action to put an Alexa voice command into a routine.',
        url: 'https://digprjsurvey.amazon.com/csad/help/node/GLXY7RFX3L5GH2VR',
        note: 'The same page says: "Type in what you want Alexa to do, just as you might say by voice, but without the wake word."',
      },
      {
        quote: 'Add [item] to [list name].',
        url: 'https://digprjsurvey.amazon.com/csad/help/node/GYASCW9JH26A47T2',
        note: 'Given as an example of adding to a list by voice. The page does not name a shopping list.',
      },
    ],
    steps: [
      'Open the Smart home page in Bar Vault and look at the one-line summary. It lists the low bottles by name.',
      'In the Alexa app, make a routine with a voice trigger you choose, such as "bar check".',
      'Add a custom action. Type a voice command without the wake word, shaped like the documented example: "add Bitterwick to my shopping list". Use one custom action per low bottle.',
      'Say the trigger and see whether the list changed. Whether a list command works inside a routine is ' + 'not documented on the pages fetched for this build (Oct 23, 2026), so treat this as a test, not a promise.',
      'When the bar changes, copy a fresh summary and edit the actions by hand. Nothing syncs.',
    ],
    notDocumented: [
      'A routine that speaks a sentence you typed (a read-aloud of free text).',
      'Reading, importing or syncing a JSON or CSV file.',
      'List actions inside a routine.',
      'Adding to a list called "shopping list" by name (the page gives only the general form).',
    ],
  },
  {
    id: 'google',
    name: 'Google Home',
    intro: 'Google Home routines take a custom voice starter and a custom command. Lists live in Google Keep.',
    documented: [
      {
        quote: 'Start a Routine when you say a custom voice command.',
        url: 'https://support.google.com/googlehome/answer/7029585',
        note: 'The page says a custom starter is added with "When I say to my assistant".',
      },
      {
        quote: 'Enter a command for your voice assistant.',
        url: 'https://support.google.com/googlehome/answer/7029585',
        note: 'This is the custom action on the same page.',
      },
      {
        quote: 'Broadcast messages and send and read texts.',
        url: 'https://support.google.com/googlehome/answer/7029585',
        note: 'Whether a broadcast can carry text you typed is not stated on the page.',
      },
      {
        quote: 'Your Shopping List and Assistant Notes and Lists are now saved in Google Keep.',
        url: 'https://support.google.com/assistant/answer/14171370',
        note: 'The same page says this "will allow you to use Google Assistant to create, update, and delete your notes and lists." It does not quote an exact voice phrase.',
      },
    ],
    steps: [
      'Open the Smart home page in Bar Vault and look at the one-line summary.',
      'In the Google Home app, make a household routine with a custom voice starter, such as "bar check".',
      'Add a custom action and type a command for the assistant, such as "add Bitterwick to my shopping list".',
      'Say the starter, then open Google Keep to see whether the list changed. Putting a list command inside a routine is ' + 'not documented on the pages fetched for this build (Oct 23, 2026), so this is a test.',
      'Outside a routine you can say the list command to the assistant directly. The summary tells you which bottles to name.',
    ],
    notDocumented: [
      'Reading, importing or syncing a JSON or CSV file.',
      'A "say something" action that speaks text you typed.',
      'Adding to a shopping list from inside a routine.',
      'Free-typed text in a broadcast.',
    ],
  },
  {
    id: 'apple',
    name: 'Apple Shortcuts and Siri',
    intro: 'Apple documents the one step that turns the JSON into something a shortcut can use.',
    documented: [
      {
        quote: 'You can ask Siri to run any shortcut in your collection.',
        url: 'https://support.apple.com/en-ca/guide/shortcuts/apd07c25bb38/ios',
        note: 'The page also says "Siri tells you the result."',
      },
      {
        quote: 'Use the Get Dictionary from Input action to turn text containing JSON or .plist data into a dictionary item.',
        url: 'https://support.apple.com/en-ca/guide/shortcuts/apd43b69f337/ios',
        note: 'The page links a "Get Dictionary Value action" page for reading a value out of the dictionary. That page was not read for this build.',
      },
    ],
    steps: [
      'On the Smart home page, copy the JSON.',
      'In Shortcuts, make a new shortcut and name it "Bar check".',
      'Add a Text action and paste the JSON into it. Add Get Dictionary from Input (documented) and then Get Dictionary Value for the key "summary". The Text action and the pasting are not covered by the pages fetched.',
      'Say "Hey Siri, Bar check". Siri runs shortcuts by name (documented) and tells you the result (documented).',
      'Pasted JSON is a snapshot. Copy it again after the bar changes.',
    ],
    notDocumented: [
      'Get File, to read the downloaded file instead of pasting it.',
      'Speak Text, to read a value aloud.',
      'Adding to Reminders from a shortcut.',
      'Running a shortcut from a Home automation, and Convert to Shortcut.',
    ],
  },
];

/** Things no page fetched for this build documents, across the three platforms. */
export const NOT_DOCUMENTED_SUMMARY: string[] = [
  'Alexa and Google Home reading, importing or syncing a JSON or CSV file.',
  'Alexa speaking a sentence you typed in a routine, and Google Home having a "say something" action.',
  'List actions inside an Alexa or Google Home routine.',
  'Apple: Get File, Speak Text, Add to Reminders, a Home automation that runs a shortcut, and Convert to Shortcut.',
];
