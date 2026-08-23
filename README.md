# Better YouTube Comment Translation

**English** · [한국어](README.ko.md)

A Chrome extension that translates **every** YouTube comment and reply — not just the ones
YouTube decides to offer a button for.

![License](https://img.shields.io/badge/license-MIT-blue)
![Chrome](https://img.shields.io/badge/Chrome-138%2B-brightgreen)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)
![Tests](https://img.shields.io/badge/tests-95%20passing-success)

> The interface is available in **English and Korean**, and follows your browser language
> automatically. You can override it at any time in the options.

---

## Why this exists

YouTube already has comment translation. It just shows up inconsistently.

Inspecting the live DOM explains why. YouTube puts a translate button into **every** comment,
then decides server-side, per comment, whether to reveal it:

```html
<ytd-tri-state-button-view-model class="translate-button" state="untoggled" hidden="">
```

When `hidden` is set, the button disappears. On one video I checked, all 20 loaded comments were
English on a Korean-locale page — and **all 20 had the button hidden**. Short comments, replies,
and comments with emoji get skipped especially often.

This extension makes that decision in your browser instead.

## Features

|                       | YouTube built-in            | This extension                       |
| --------------------- | --------------------------- | ------------------------------------ |
| When a button appears | Server decides, inconsistent | Every comment that needs translation |
| Replies              | Frequently skipped           | Always supported                     |
| Bulk translation     | None — one click at a time   | Auto-translate as you scroll         |
| Reading the original | Toggling hides the translation | Original and translation side by side |
| Engine choice        | None                         | Chrome built-in / DeepL / Google / LLM |
| Caching              | None                         | Never re-translates the same comment |

Plus:

- **Automatic language detection** — Chrome's `LanguageDetector` API, falling back to a
  script-and-stopword heuristic when the model isn't available.
- **Skips comments already in your language** — no button is drawn at all, so the page stays clean.
- **Never mangles the original** — custom emoji, `@mentions`, links and timestamps stay intact,
  because the translation is added as a sibling node rather than replacing anything.
- **Pivot translation** — language pairs the built-in engine doesn't support directly are routed
  `source → English → target`.
- **Request batching** — remote engines send everything collected within 180 ms as a single API call.
- **Follows the YouTube theme** — light and dark are detected at runtime, independently of your OS setting.
- **English and Korean interface** — picked from your browser language on install, switchable in the options.

## Install

Not on the Chrome Web Store yet. Load it unpacked:

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the repository folder.
5. **Reload** any YouTube tab you already had open.

**Requirements:** Chrome 138 or newer, desktop. The built-in Translator API is desktop-only.
On older Chrome, or when a language pack is unavailable, configure a fallback engine (see below).

## Usage

### Translating a single comment

Every comment that needs translating gets a small **Translate** button with the detected source
language next to it. Click it. The translation appears underneath the original.

Click the button again (now **Original only**) to hide the translation.

The very first time you translate from a given language, Chrome has to download that language pack.
The button will read **Enable `<Language>` translation** instead — click it once, and every later
comment in that language translates automatically. This click is required by Chrome, not by this
extension: the browser will not start a model download without a user gesture.

### Translating everything

Open the extension popup (toolbar icon) and turn on **Auto-translate**. Comments are then
translated as they scroll into view, replies included.

For a one-off pass over what's currently on screen, click **Translate visible comments** — or press
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>.

### Keyboard shortcuts

| Shortcut | Action |
| -------- | ------ |
| <kbd>Alt</kbd>+<kbd>T</kbd> | Toggle auto-translate |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> | Translate all visible comments |

Rebind them at `chrome://extensions/shortcuts`.

### Settings

The popup covers the everyday controls. **All settings** opens the full options page:

| Setting | Default | What it does |
| ------- | ------- | ------------ |
| Interface language | Browser language | Language of this extension's own menus — English or Korean |
| Extension enabled | on | Master switch |
| Auto-translate | off | Translate on scroll |
| Translate into | Browser language | 32 languages available |
| Translate replies too | on | The thing YouTube misses most |
| Skip comments already in that language | on | No button for comments you can already read |
| Keep the original visible | on | Off = replace the original with the translation |
| Show language and engine badge | on | `English → 한국어 · Chrome` above each translation |
| Hide YouTube's own translate button | on | Avoids two overlapping buttons |
| Minimum length | 2 | Shorter comments are ignored |
| Concurrent translations | 3 | Higher is faster but heavier |
| Auto-download language packs | off | Skip the one-time click, at the cost of background downloads |

## Translation engines

### Chrome built-in (default, recommended)

No API key, no cost, and **comment text never leaves your machine** — Chrome's on-device model
does the work. Each language pair downloads once, the first time you use it.

### DeepL / Google Cloud Translation / LLM (optional)

Enter your own API key on the options page, then press **Grant permission**.

The extension only requests `youtube.com` access up front. A remote engine's API origin is requested
separately via `chrome.permissions.request()`, and only when you actually turn that engine on.

The LLM engine works with any OpenAI-compatible `chat/completions` endpoint. It handles slang, memes
and wordplay the most naturally, but it is slower, costs money, and **sends comment text to that
provider**.

You can also set a **fallback engine**, used automatically when the primary one fails or doesn't
support a language pair.

## Privacy

No data is ever sent to the developer — there is no developer-operated server, no analytics, and no
telemetry. With the default engine, nothing leaves your device at all.

Full details, including exactly what each engine transmits: [PRIVACY.md](PRIVACY.md).

## Development

No build step. Clone it and load the folder — that's the whole workflow.

```
manifest.json              MV3
_locales/                  store listing name and description, per locale
src/
  core/                    shared between content script and service worker
    constants.js           namespace, defaults, engine metadata, trivial-text rules
    i18n.js                message catalogue (en/ko) + DOM localisation
    util.js                hashing, timeouts, language-code normalisation, retry
    settings.js            chrome.storage.sync wrapper + change subscription
    langdetect.js          LanguageDetector API + heuristic fallback
    cache.js               in-memory LRU + storage.local persistence
    queue.js               concurrency limit, de-duplication, priority
    engine-builtin.js      Chrome Translator API, incl. English pivot routing
  content/
    ytdom.js               YouTube DOM adapter (selectors with fallbacks, theme detection)
    ui.js                  per-comment UI rendering
    content.js             orchestrator
    styles.css
  bg/
    service-worker.js      DeepL/Google/LLM calls, request validation, shortcut routing
  ui/
    popup.*                quick settings
    options.*              full settings
test/
  harness.html             reproduces the real YouTube comment DOM; 41 in-browser checks
  node-tests.js            54 headless checks
  serve.py                 no-cache static server for testing
```

### Design notes

- **No bundler.** Files load in the order listed in `manifest.json` and share a single
  `globalThis.BYCT`. The service worker reuses the same files via `importScripts()`.
- **API keys never reach the content script.** Remote translation is done entirely by the service
  worker, and the content script sets `BYCT.stripSecrets` so key values are not even handed to it.
- **The service worker does not trust the content script.** A content script is still code running
  inside a web page, so engine name, item count, lengths, and language-code format are all validated
  before anything is sent to an external API.
- **Comments are untrusted input.** Every text-classification path is linear in input length — a
  regex with nested quantifiers here was a real DoS (see [CHANGELOG.md](CHANGELOG.md)). The LLM
  engine is told not to follow instructions found inside comment text, and translations are only
  ever inserted with `textContent`.
- **Selector fallbacks.** YouTube reshuffles its markup regularly, so every selector has several
  candidates.
- **Node recycling.** YouTube (Polymer) reuses comment DOM nodes while scrolling. Trusting a marker
  attribute would leave comment A's translation attached to comment B, so stored text is compared
  against current text on every scan.
- **Themes don't depend on YouTube's CSS variables.** This originally used `--yt-spec-text-primary`
  and friends; YouTube then dropped that system for `--yt-sys-color-*`, every `var()` silently fell
  back, and translations rendered near-black in dark mode. The theme is now detected at runtime from
  the `<html dark>` attribute, with background luminance as a backstop.
- **Timeouts everywhere.** Chrome's `availability()` can hang indefinitely, and `create()` can stall
  without ever firing a progress event. Both are guarded so the UI never sits on an endless spinner.

### Tests

Headless:

```bash
node test/node-tests.js
```

54 checks — trivial-text classification, ReDoS regression, language-code normalisation,
service-worker request validation, message-catalogue parity, default target language.

In-browser (needs a DOM):

```bash
python test/serve.py
```

- `http://localhost:8731/test/harness.html` → click **자동 검증 실행** — 41 checks
  (add `?ui=en` to see the English interface, `?target=en` to change the target language)
- `python test/make-preview.py`, then open `test/_preview/options.html` to inspect the UI outside
  the extension context

`test/serve.py` sends no-cache headers, and the harness loads its scripts with a cache-busting
query. If you still see stale behaviour, add a unique query to the URL (`harness.html?x=1`) —
a cached copy of the page silently invalidated a whole round of testing once.

The harness reproduces the real YouTube comment DOM and mocks `chrome.*` in memory, so the content
script logic can be exercised without installing anything. It deliberately does **not** define
YouTube's CSS variables — an earlier version did, which hid the dark-mode bug described above.

## Roadmap

- More interface languages (currently English and Korean)
- Live chat support
- Chrome Web Store release

## AI disclosure

This extension was built with **Claude (Anthropic's Claude Code)**. The DOM investigation,
architecture, implementation, test suites and documentation were all produced with AI assistance.

This is disclosed because it is relevant to how you should evaluate the code:

- Behaviour is covered by 95 automated checks (54 headless, 41 in-browser), and the DOM assumptions
  were verified against live youtube.com rather than assumed.
- A security and performance review pass found and fixed a real ReDoS vulnerability, an API-key
  exposure path, and several correctness bugs. Each is documented in [CHANGELOG.md](CHANGELOG.md)
  with the measurements behind it.
- It has not been audited by a third party. Read the source before trusting it with API keys, as you
  should with any extension.

## License

[MIT](LICENSE)
