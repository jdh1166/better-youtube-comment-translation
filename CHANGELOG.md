# Changelog

**English** · [한국어](CHANGELOG.ko.md)

## 0.4.0 — Empty gap removed, translation quality

### Fixed

- **A blank gap was left where a skipped comment's button would have been.** Comments already in
  your language (a Korean comment for a Korean user) still got a UI container; only the button was
  set to `hidden`. The `.byct-root` margin and `.byct-row` minimum height stayed, punching a hole
  under every such comment. Now nothing is created at all when a comment doesn't need translating,
  or hasn't been language-detected yet. (Measured: text-to-toolbar gap **36px → 6px**.)
- Changing the target language now also removes the UI from comments that no longer need it.

### Translation quality

- **Tokens that must not reach the translator are now shielded.** `@mentions`, `#hashtags`, URLs,
  timestamps (2:14) and custom-emoji placeholders (`:heart:`) were being fed straight into the
  translation engine. That is how a person's handle gets translated as a word, a URL picks up a
  space in the middle, or `:heart:` turns into something unrelated. They are swapped for `⟦0⟧`
  markers before translation and restored afterwards. If a marker goes missing during translation,
  the text is translated once more without masking — a slightly worse translation beats a sentence
  reassembled incorrectly.
- **Pivot translations are now labelled.** Language pairs the built-in engine doesn't support
  directly are routed `source → English → target`. Translating twice noticeably degrades quality,
  so the badge now reads `· via English`, making the reason visible instead of mysterious.

### Tests

- Headless 54 → **69** (mask/restore round-trip, lost-marker detection, URL false-positive guard)
- In-browser 41 → **46** (measured gap for skipped comments, UI removal on target-language change)

## 0.3.0 — Localisation

### Added

- **Interface language (Korean / English).** Follows your browser language on install and can be
  changed any time from the options page header. Switching re-renders immediately and keeps your
  selected values. There is deliberately no language picker at install time: for most people the
  browser language *is* the language they want, so that screen would be pure friction. Anyone who
  wants something else changes it in the options.
- **`_locales`** — the Chrome Web Store listing (name, description) and the keyboard-shortcut
  descriptions are now localised.

### Fixed

- **The default target language was hardcoded to `'ko'`.** An English-speaking user installing the
  extension would start with every comment being translated into Korean. It is now derived from the
  browser language at install time (`zh-TW` → Traditional Chinese, unsupported languages → English).
- **Name collision between the `t()` helper and local variables.** Adding i18n introduced
  `const t = (k) => ...`, but `engine-builtin.js` already had variables like
  `const t = await Promise.race(...)` in the same scope. A `t(...)` call placed before that
  declaration would have thrown a TDZ `ReferenceError`. The variables were renamed, and every file
  using i18n was swept for the same hazard.

### Tests

- **Found that the browser was caching old JS, making verification meaningless.** On inspection the
  browser was running **v0.2.0**, not v0.3.0 — so the in-browser results from that stretch could not
  be trusted. Added `test/serve.py`, which sends no-cache headers, and made the harness load its
  scripts with a cache-busting query.
- Pinned the harness's target language so results don't depend on the test machine's browser
  language (`?ui=en`, `?target=en` to vary it).
- Added message-catalogue checks — that both languages have exactly the same keys (149), that
  `{placeholders}` match on both sides, and that no string is empty. A key present in only one
  language makes that string vanish entirely in the other.
- Headless 34 → **54**, in-browser stayed at 41.

## 0.2.0 — Security and performance review

A full pass back over the code. All 75 tests passing.

### Security

- **ReDoS (serious).** The regexes used to classify non-translatable text, such as
  `^\s*(https?:\/\/\S+\s*)+$`, had nested quantifiers and backtracked exponentially. Measured:
  **4.5 seconds on a single 276-character comment**, and past 300 characters the tab effectively
  freezes. Anyone can post a comment, so this was a real DoS against every user of the extension.
  The regexes were replaced with token checks that are linear in input length (0 ms even at 14,000
  characters).
- **API keys were reaching the content script.** The content script never calls a remote engine
  itself, so it has no need for them. In contexts with `BYCT.stripSecrets` set, key values are no
  longer put into the settings object at all. The options and popup pages still read and write them
  normally.
- **Added request validation in the service worker.** A content script is still code running inside
  a web page, so its input is no longer forwarded to an external API unchecked: engine name (which
  also blocks prototype-chain access), item count (≤200), item length (≤20,000 chars), total length
  (≤100,000 chars), and language-code format are all validated.
- **Sender checks.** Both the background worker and the content script verify `sender.id`.
- **LLM prompt-injection hardening.** Comments are public user input. The system prompt now states
  that `items` is untrusted data and that anything resembling an instruction inside it must be
  translated as content, never acted on. The response is also checked to be all strings — previously
  a stray object would let `String()` produce `"[object Object]"` and fail silently.

### Performance

- **Scan only what changed.** Every DOM mutation triggered a full rescan, repeating text extraction
  (a DOM walk) across hundreds of comments every 250 ms. Mutation records are now used to revisit
  only the comments that actually changed. Measured: **18 extractions → 2** when one comment is
  added. With 300 comments loaded, as on real YouTube, the difference is far larger.
- **Removed forced reflows.** Visibility was determined by calling `getBoundingClientRect()` per
  comment; it now uses the IntersectionObserver results that were already being collected.
- **Cached `availability()` results.** Neither the language detector nor the translation engine
  cached their status queries, so the API was called **once per comment** — with 4–6 second timeouts
  stacking up on slow environments, dragging the whole pipeline down. Settled values are cached now,
  and only `unknown` is retried, after 30 seconds.
- **Comments that aren't translation targets are recorded too.** Without a record, every scan
  repeated the same classification work.
- **Cache write debounce** 2.5 s → 5 s.

### Bugs

- **The UI disappeared permanently when YouTube re-rendered a comment.** The text was unchanged, so
  the node-recycling check didn't catch it and there was no way back. Rendering now goes through a
  single `paint()` function, and each scan verifies the UI is still attached, restoring it in place.
- **MutationObserver leak.** Page navigation disconnected the `IntersectionObserver` but left the
  `MutationObserver` running, so the old observer kept waking up scans.
- **Known comments were dropped when observers were recreated.** A new `IntersectionObserver` never
  re-observed comments already on the page, so auto-translate stopped working.
- **Race condition writing stale results to recycled nodes.** The record is now re-checked after
  every `await`.
- **`sameLang('und','und')` returned true**, so a comment whose language couldn't be identified
  could be skipped as "already in that language".
- **Servers without `response_format` support.** Plenty of OpenAI-compatible servers reject that
  option. On a 400 the request is retried without it. Responses wrapped in code fences are handled
  too.
- **Added a safety-net tick.** Every 2 seconds it counts comment nodes to see whether the
  MutationObserver missed any — much cheaper than a full scan.
- **That safety net was itself causing full scans.** Performance measurements became unstable right
  after adding it, and two causes turned out to be stacked. (1) A brief count mismatch is normal
  while newly added comments wait out the debounce, but a full scan was triggered anyway — meaning a
  full rescan on every tick precisely when infinite scroll is streaming comments in, the moment
  performance matters most. (2) Records for detached DOM nodes weren't cleaned up until 300 had
  accumulated, so the count stayed **permanently** off and a full scan ran every 4 seconds forever.
  It now scans only when nothing is pending, only after a mismatch is seen twice in a row, and only
  after clearing detached records first. (Measured: extractions per added comment went from an
  intermittent 20 to a steady 1–2.)

### Tests

- `node test/node-tests.js` — 34 checks (classification, ReDoS regression, language codes, request
  validation)
- Browser harness — 41 checks (the original 32 plus 9 security/optimisation regressions)

## 0.1.0 — First release

Comment and reply translation, Chrome's built-in on-device engine by default, optional
DeepL/Google/LLM, auto-translate, original kept alongside the translation, caching, automatic
light/dark handling.
