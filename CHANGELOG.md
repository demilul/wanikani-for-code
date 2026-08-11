# Changelog

All notable changes to WaniCode are documented here. This project follows [Semantic Versioning](https://semver.org/).

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
