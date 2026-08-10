# WaniKani for Code

Do your [WaniKani](https://www.wanikani.com/) reviews and lessons without leaving VS Code.

Most WaniKani tooling stops at "show me my counts." This extension goes further: it runs an actual **review session** inside an editor webview — typed answers, live romaji→kana input, close-enough answer matching — and (when you're ready) submits the results straight to your real SRS.

> **Status:** v0.2 — the full daily study loop. Native lessons and reviews both run in-editor and submit to your real account.

## Features

- **Status bar** at a glance: `蟹 24 Reviews · 3 Lessons · Next 23:00`
- **Activity-bar dashboard**: open reviews, available lessons, next review, and your SRS distribution
- **Native review session** in a webview:
  - romaji→kana input on reading questions (via [WanaKana](https://github.com/WaniKani/WanaKana))
  - "close-enough" meaning matching with typo tolerance, like real WaniKani
  - a nudge when you type the reading where a meaning was expected
  - you keep seeing a subject until you get both parts right
  - **reinforcement**: meanings, readings, and mnemonics appear after each answer (auto-shown when you're wrong, `I` to peek when you're right)
- **Native lessons**: learn new radicals, kanji, and vocabulary in-editor — a teaching pass (characters, readings, mnemonics) followed by a quiz, then the batch is started on WaniKani. Batch size is configurable.
- **Live by default**: reviews and lessons submit to your real SRS. Prefer to drill without consequences? Flip on **practice mode** and nothing is written.
- **Due-review notifications** while you work.

## Getting started

1. Install the extension (or press `F5` from this repo to launch an Extension Development Host).
2. Run **WaniKani: Set API Token** and paste a personal access token from
   [wanikani.com → Settings → API Tokens](https://www.wanikani.com/settings/personal_access_tokens).
   The token is stored in VS Code **SecretStorage**, never in plain-text settings.
3. Open the **WaniKani** view in the activity bar, or run **WaniKani: Start Reviews**.

The first launch downloads the subject catalogue once (~9 requests) so reviews grade instantly and offline afterwards.

## Commands

| Command | Description |
| --- | --- |
| `WaniKani: Set API Token` | Store your personal access token securely |
| `WaniKani: Clear API Token` | Remove the stored token |
| `WaniKani: Show Dashboard` | Reveal the activity-bar view |
| `WaniKani: Start Reviews` | Open the review session |
| `WaniKani: Start Lessons` | Learn and quiz a batch of new items in-editor |
| `WaniKani: Refresh` | Re-fetch summary and counts |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `wanikani.practiceMode` | `false` | Run reviews/lessons without submitting them to WaniKani |
| `wanikani.lessonBatchSize` | `5` | How many lessons to teach and quiz per session |
| `wanikani.refreshInterval` | `15` | Minutes between background refreshes |
| `wanikani.notifyOnDue` | `true` | Notify when new reviews become available |

## Development

```bash
npm install
npm run watch      # esbuild in watch mode (extension + webview bundles)
# then press F5 in VS Code to launch the Extension Development Host
```

- `npm run compile` — type-check with `tsc --noEmit`
- `npm run build` — production bundles
- `npm run package` — build a `.vsix` with `vsce`

## Architecture

- `src/api/wanikaniClient.ts` — REST wrapper with pagination + 429 backoff (60 req/min)
- `src/cache/subjectStore.ts` — full subject cache in global storage, incremental via `updated_after`
- `src/matching/answerChecker.ts` — close-enough meaning matching, exact readings, nudges
- `src/matching/reviewSession.ts` — the review/quiz queue + SRS-tally state machine (host-side, testable)
- `src/ui/studyPanel.ts` + `src/webview/review.ts` — the study webview host (reviews and lessons) and its client script

## Roadmap

- Reading audio playback and context sentences
- WaniKani-parity answer matching (auxiliary/warning edge cases)
- Offline / resume for interrupted sessions
- Combined WaniKani + [Bunpro](https://bunpro.jp/) view

## Disclaimer

Not affiliated with or endorsed by Tofugu / WaniKani. Uses the public WaniKani API v2.

## License

[Apache-2.0](LICENSE)
