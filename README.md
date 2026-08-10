# WaniKani for Code

Do your [WaniKani](https://www.wanikani.com/) reviews and lessons without leaving VS Code.

Most WaniKani tooling stops at "show me my counts." This extension goes further: it runs an actual **review session** inside an editor webview — typed answers, live romaji→kana input, close-enough answer matching — and (when you're ready) submits the results straight to your real SRS.

> **Status:** v0.1 — a thin but complete vertical slice. Reviews are fully playable; lessons currently hand off to wanikani.com while the native lesson UI is built.

## Features

- **Status bar** at a glance: `蟹 24 Reviews · 3 Lessons · Next 23:00`
- **Activity-bar dashboard**: open reviews, available lessons, next review, and your SRS distribution
- **Native review session** in a webview:
  - romaji→kana input on reading questions (via [WanaKana](https://github.com/WaniKani/WanaKana))
  - "close-enough" meaning matching with typo tolerance, like real WaniKani
  - a nudge when you type the reading where a meaning was expected
  - you keep seeing a subject until you get both parts right
- **Practice mode (on by default):** run the whole review experience without writing anything to WaniKani — dogfood the matcher against your real queue with zero risk to your SRS. Flip it off to submit for real.
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
| `WaniKani: Start Lessons` | Open your lessons (hands off to WaniKani for now) |
| `WaniKani: Refresh` | Re-fetch summary and counts |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `wanikani.practiceMode` | `true` | Run reviews without submitting them to WaniKani |
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
- `src/matching/reviewSession.ts` — the review queue/SRS-tally state machine (host-side, testable)
- `src/ui/reviewPanel.ts` + `src/webview/review.ts` — the review webview host and its client script

## Roadmap

- Native lesson webview (mnemonics, teaching flow)
- Audio playback
- WaniKani-parity answer matching (auxiliary/warning edge cases)
- Offline / resume for interrupted sessions
- Combined WaniKani + [Bunpro](https://bunpro.jp/) view

## Disclaimer

Not affiliated with or endorsed by Tofugu / WaniKani. Uses the public WaniKani API v2.

## License

[Apache-2.0](LICENSE)
