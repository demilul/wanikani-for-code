# Changelog

All notable changes to WaniCode are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.4.2] - 2026-08-11

### Fixed

- Dashboard "Item spread" column headers no longer truncate to "Radi…" / "Voc…". The fixed column layout added in 0.4.1 was too narrow for the labels; the table now sizes to its content and shows full headers, while the scroll wrapper still keeps it inside its card on narrow panels.

### Docs

- Added light and dark screenshots of the full dashboard panel to the README.

## [0.4.1] - 2026-08-11

### Fixed

- Dashboard "Item spread" table no longer overflows its card. On narrow side panels the table sized to its content and spilled the Total column out over the neighbouring card; it now uses a fixed column layout that always fits inside the card, with horizontal scroll as a fallback on very narrow widths.

## [0.4.0] - 2026-08-11

### Added

- A WaniKani style dashboard in an editor panel, built entirely from the WaniKani API. Open it from the new "Open Dashboard" row at the top of the WaniCode sidebar, the dashboard icon in the view title bar, or the "WaniCode: Open Dashboard" command. It gathers seven at a glance widgets:
  - Reviews available now and a 24 hour review forecast.
  - Today's lessons.
  - Item spread: a matrix of SRS stage (Apprentice, Guru, Master, Enlightened, Burned) against item type (radical, kanji, vocabulary).
  - Level up progress, including how many more kanji you still need to Guru to advance a level.
  - Recently unlocked and recently burned items from the last 30 days.
  - Critical condition items: subjects below 75 percent accuracy that could use extra study.
- Start Reviews, Start Lessons, and Refresh actions on the dashboard, which tracks the extension's existing background refresh.

## [0.3.0] - 2026-08-11

### Added

- Continue lessons in batches. After finishing a batch you can start the next batch of `wanikani.lessonBatchSize` straight from the completion screen, the way WaniKani gates lessons. Nothing advances without your confirmation.
- `wanikani.lessonOrder` setting for how lessons are drawn from the available pool: `shuffled` (default, like WaniKani) or `level` (ascending level, then radical to kanji to vocabulary).
- README screenshots of the activity bar dashboard and the status bar summary.

### Fixed

- Lessons no longer open to a blank panel. Radical subjects omit the `readings` field in the WaniKani API, which threw while building the teaching card; reading data is now treated as optional everywhere it is read.

## [0.2.1] - 2026-08-11

### Changed

- Replace the retired VS Marketplace badges in the README with reliable static badges (shields.io retired the `visual-studio-marketplace` badge family).

## [0.2.0] - 2026-08-11

Initial public release. The full daily study loop: native reviews and lessons in the editor, submitting to your real WaniKani account.

### Added

- Native reviews in an editor panel: romaji to kana input (WanaKana), close enough meaning matching with typo tolerance, a reading vs meaning nudge, and subjects that repeat until both the meaning and reading are answered correctly.
- Review reinforcement: meanings, readings, and mnemonics after each answer, shown automatically on a wrong answer and on demand (press `I`) when correct.
- Native lessons: a teaching pass (characters, readings, mnemonics) followed by a quiz, then the batch is started on WaniKani. Batch size is configurable via `wanikani.lessonBatchSize` (default 5).
- Status bar summary and an activity bar dashboard (reviews, lessons, next review, SRS distribution).
- Secure API token storage via VS Code SecretStorage.
- Full local subject cache with incremental `updated_after` syncs, so reviews grade instantly and work offline.
- Background refresh with due review notifications.
- WaniKani mnemonic markup (`<radical>`, `<kanji>`, `<reading>`) rendered as styled highlights.

### Notes

- Practice mode defaults to off, so reviews and lessons submit to your real SRS. Turn `wanikani.practiceMode` on to run a session without writing anything.
- Commands and in editor branding use the name "WaniCode". This is an unofficial project and is not affiliated with WaniKani or Tofugu.
