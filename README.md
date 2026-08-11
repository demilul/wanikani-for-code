# WaniCode

[![Visual Studio Marketplace](https://img.shields.io/badge/Visual%20Studio%20Marketplace-WaniCode-0098FF?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=demilul.wanikani-for-code)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

> **Unofficial.** WaniCode is an independent project. It is not affiliated with, endorsed by, or sponsored by Tofugu or WaniKani. It talks to the public [WaniKani API v2](https://docs.api.wanikani.com/) with a token you provide. "WaniKani" is a trademark of its respective owner.

Do your [WaniKani](https://www.wanikani.com/) reviews and lessons without leaving VS Code.

Other WaniKani companions stop at showing your review counts. WaniCode runs the actual reviews and lessons in an editor panel: typed answers, live romaji to kana input, WaniKani style answer matching, and real SRS submission.

![Reviewing a kanji next to the WaniKani dashboard in VS Code](https://raw.githubusercontent.com/demilul/wanikani-for-code/main/docs/screenshots/hero.png)

<table>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/demilul/wanikani-for-code/main/docs/screenshots/review-reading.png" alt="Reading review with romaji to kana input" /></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/demilul/wanikani-for-code/main/docs/screenshots/review-correct.png" alt="A correct answer with reinforcement hints" /></td>
  </tr>
  <tr>
    <td align="center"><em>Romaji to kana input on readings</em></td>
    <td align="center"><em>Instant grading with reinforcement</em></td>
  </tr>
</table>

## Features

- **Status bar summary.** Reviews, lessons, and the next review time at a glance: `蟹 24 Reviews · 3 Lessons · Next 23:00`.
- **Activity bar dashboard.** Open reviews, available lessons, next review, and your SRS distribution.
- **Native reviews.** A full review session in an editor panel:
  - romaji to kana input on reading questions, via [WanaKana](https://github.com/WaniKani/WanaKana)
  - close enough meaning matching with typo tolerance, like the real site
  - a nudge when you type the reading where a meaning was expected
  - subjects repeat until you answer both the meaning and the reading correctly
  - reinforcement after each answer: meanings, readings, and mnemonics, shown automatically when you are wrong and on demand (press `I`) when you are right
- **Native lessons.** Learn new radicals, kanji, and vocabulary in the editor. A teaching pass (characters, readings, mnemonics) is followed by a quiz, then the batch is started on WaniKani. Batch size is configurable.
- **Live by default.** Reviews and lessons submit to your real SRS. Turn on practice mode to run a full session without writing anything to your account.
- **Due review notifications** while you work.

## Requirements

- A [WaniKani](https://www.wanikani.com/) account with reviews or lessons available.
- A personal access token from your WaniKani account. The token is stored in VS Code [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage), never in plain text settings.

## Getting started

1. Install the extension from the Marketplace, or press `F5` in this repo to launch an Extension Development Host.
2. Run **WaniCode: Set API Token** and paste a token from [wanikani.com, Settings, API Tokens](https://www.wanikani.com/settings/personal_access_tokens).
3. Open the **WaniCode** view in the activity bar, or run **WaniCode: Start Reviews**.

On first launch the extension downloads the subject catalogue once (about nine requests). After that, reviews grade instantly and work offline.

## Commands

| Command | Description |
| --- | --- |
| `WaniCode: Set API Token` | Store your personal access token securely |
| `WaniCode: Clear API Token` | Remove the stored token |
| `WaniCode: Show Dashboard` | Reveal the activity bar view |
| `WaniCode: Start Reviews` | Open the review session |
| `WaniCode: Start Lessons` | Learn and quiz a batch of new items |
| `WaniCode: Refresh` | Re-fetch the summary and counts |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `wanikani.practiceMode` | `false` | Run reviews and lessons without submitting them to WaniKani |
| `wanikani.lessonBatchSize` | `5` | How many lessons to teach and quiz per session |
| `wanikani.refreshInterval` | `15` | Minutes between background refreshes |
| `wanikani.notifyOnDue` | `true` | Notify when new reviews become available |

## Roadmap

- Reading audio playback and context sentences
- Closer answer matching parity (auxiliary meanings, warning states)
- Offline and resume for interrupted sessions
- Combined WaniKani and [Bunpro](https://bunpro.jp/) view

## Contributing

```bash
npm install
npm run watch   # esbuild watch for the extension and webview bundles, then press F5
```

- `npm run compile` type-checks with `tsc --noEmit`
- `npm test` runs the matcher and session unit tests
- `npm run build` produces the production bundles
- `npm run package` builds a `.vsix` with `vsce`

Project layout:

| Path | Responsibility |
| --- | --- |
| `src/api/wanikaniClient.ts` | REST wrapper with pagination and 429 backoff (60 req/min) |
| `src/cache/subjectStore.ts` | Full subject cache in global storage, incremental via `updated_after` |
| `src/matching/answerChecker.ts` | Close enough meaning matching, exact readings, nudges |
| `src/matching/reviewSession.ts` | Review and quiz queue plus SRS tally state machine (testable) |
| `src/ui/studyPanel.ts`, `src/webview/review.ts` | Study webview host and its client script |

## Disclaimer

Not affiliated with or endorsed by Tofugu or WaniKani. Uses the public WaniKani API v2.

## License

[Apache-2.0](LICENSE)
