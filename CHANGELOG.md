# Changelog

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
