# Changelog

## [0.2.0] - Unreleased

The full daily study loop.

### Added
- **Native lessons**: learn radicals/kanji/vocabulary in-editor — a teaching pass
  (characters, readings, mnemonics) then a quiz, then `PUT /assignments/<id>/start`
  for the batch. Ordered radical → kanji → vocab by level. `wanikani.lessonBatchSize`
  controls batch size (default 5).
- **Review reinforcement**: meanings, readings, and mnemonics shown after each
  answer — auto-revealed on a wrong answer, `I` to peek on a correct one.
- WaniKani mnemonic markup (`<radical>`, `<kanji>`, `<reading>`, …) rendered as
  styled highlights.

### Changed
- **Practice mode now defaults to off** — reviews and lessons submit to your real
  SRS by default. Turn `wanikani.practiceMode` on to drill without writing.
- Unified the review and lesson flows into a single `StudyPanel` (was `ReviewPanel`).

## [0.1.0] - Unreleased

Initial vertical slice.

### Added
- Secure API-token storage via VS Code SecretStorage (`Set`/`Clear API Token`).
- Status bar summary: reviews, lessons, and next review time.
- Activity-bar dashboard: reviews, lessons, next review, SRS distribution.
- Native review session webview:
  - romaji→kana input on readings (WanaKana)
  - close-enough meaning matching with length-scaled typo tolerance
  - reading-vs-meaning nudge
  - subjects requeue until both parts are answered correctly
- **Practice mode** (default on): full review UX with no submission to WaniKani.
- Live submission of reviews to `POST /reviews` when practice mode is off.
- Full local subject cache with incremental `updated_after` syncs.
- Background refresh with due-review notifications.

### Deferred
- Native lesson webview (lessons currently open on wanikani.com).
- Audio, mnemonics, offline/resume, Bunpro integration.
