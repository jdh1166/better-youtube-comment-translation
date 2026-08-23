/* UI 다국어.

   설계 메모:
   - 크롬 확장의 표준인 chrome.i18n(_locales)은 브라우저 UI 언어를 그대로 따르고
     확장 안에서 바꿀 수 없다. 그래서 manifest 의 이름·설명(스토어 등록 정보)에만 _locales 를 쓰고,
     화면 문구는 여기 카탈로그로 처리해 사용자가 직접 전환할 수 있게 한다.
   - 기본값은 'auto' — 브라우저 언어를 따라간다. 설치 직후 선택 화면을 띄우지 않는 이유는,
     대부분은 브라우저 언어가 곧 원하는 UI 언어라서 그 화면이 불필요한 마찰이기 때문이다.
     바꾸고 싶은 사람은 옵션 화면 맨 위에서 바로 바꿀 수 있다.

   문자열 안의 {name} 은 t() 의 두 번째 인자로 치환된다. */
(function (BYCT) {
  'use strict';

  /** 지원하는 UI 언어 */
  BYCT.UI_LANGS = [
    ['auto', { ko: '자동 (브라우저 언어)', en: 'Auto (browser language)' }],
    ['ko', { ko: '한국어', en: '한국어 (Korean)' }],
    ['en', { ko: 'English (영어)', en: 'English' }],
  ];

  const MESSAGES = {
    ko: {
      // 번역 엔진 메타데이터
      'engine.builtin.label': 'Chrome 내장 번역 (온디바이스)',
      'engine.builtin.note': 'API 키 불필요·무료·기기 밖으로 데이터가 나가지 않음. 최초 1회 언어팩 다운로드 필요.',
      'engine.deepl.label': 'DeepL',
      'engine.deepl.note': '번역 품질이 가장 자연스러운 편. 무료 티어 월 50만 자.',
      'engine.deepl.keyHint': 'DeepL API 키 (무료 키는 :fx 로 끝남)',
      'engine.google.label': 'Google Cloud Translation',
      'engine.google.note': '지원 언어가 가장 많음. 유료(월 50만 자 무료 크레딧).',
      'engine.google.keyHint': 'Google Cloud API 키',
      'engine.llm.label': 'LLM (OpenAI 호환)',
      'engine.llm.note': '인터넷 슬랭·밈·말장난 번역이 가장 자연스러움. 느리고 비용 발생.',
      'engine.llm.keyHint': 'API 키',

      // 댓글에 붙는 버튼과 상태
      'btn.translate': '번역',
      'btn.showOriginal': '원문만',
      'btn.showTranslation': '번역 보기',
      'btn.retry': '다시 시도',
      'btn.more': '더보기',
      'btn.less': '접기',
      'btn.enableLang': '{lang} 번역 켜기',
      'status.translating': '번역 중…',
      'status.downloading': '언어팩 다운로드 중… {pct}%',
      'status.needsDownload': '최초 1회 언어팩 다운로드가 필요합니다',
      'status.failed': '번역 실패',

      // 토스트
      'toast.translatingN': '{n}개 댓글 번역 중…',
      'toast.nothingNew': '번역할 새 댓글이 없습니다',
      'toast.autoOn': '자동 번역 켜짐',
      'toast.autoOff': '자동 번역 꺼짐',

      // 오류 — 내장 엔진
      'err.noBuiltinApi': '이 브라우저에는 Chrome 내장 번역 API가 없습니다 (Chrome 138+ 데스크톱 필요)',
      'err.modelStalled': '번역 모델을 준비하지 못했습니다 ({pair}) — 브라우저가 응답하지 않습니다',
      'err.pairUnavailable': 'Chrome 내장 번역이 {src}→{tgt} 언어쌍을 지원하지 않습니다',
      'err.pairUnsupported': '지원하지 않는 언어쌍입니다',
      'err.unknownSource': '원문 언어를 알 수 없습니다 — 설정에서 대체 엔진을 지정하면 번역할 수 있습니다',

      // 오류 — 공통
      'err.noBackground': '백그라운드 응답 없음',
      'err.http': '{engine} {status}: {detail}',
      'err.noPermission': '{origin} 접근 권한이 없습니다. 확장 프로그램 옵션 화면에서 이 엔진의 "권한 허용" 버튼을 눌러주세요.',
      'err.badEndpoint': '잘못된 엔드포인트 URL: {url}',
      'err.badSender': '허용되지 않은 발신자',

      // 오류 — 요청 검증
      'err.validate.engine': '알 수 없는 엔진: {engine}',
      'err.validate.noTexts': '잘못된 요청: 번역할 텍스트가 없습니다',
      'err.validate.tooMany': '한 번에 보낼 수 있는 항목 수({max})를 초과했습니다',
      'err.validate.nonString': '잘못된 요청: 문자열이 아닌 항목이 있습니다',
      'err.validate.itemTooLong': '댓글 하나가 너무 깁니다',
      'err.validate.tooLarge': '요청 크기가 너무 큽니다',
      'err.validate.badTarget': '잘못된 대상 언어 코드: {code}',
      'err.validate.badSource': '잘못된 원문 언어 코드: {code}',

      // 오류 — 각 엔진
      'err.deepl.noKey': 'DeepL API 키가 설정되지 않았습니다.',
      'err.deepl.auth': 'DeepL 인증 실패 — API 키를 확인해주세요.',
      'err.deepl.quota': 'DeepL 이번 달 번역 한도를 모두 사용했습니다.',
      'err.deepl.rate': 'DeepL 요청이 너무 많습니다 (429)',
      'err.google.noKey': 'Google Cloud API 키가 설정되지 않았습니다.',
      'err.google.auth': 'Google 번역 인증/요청 오류 — API 키와 Cloud Translation API 활성화 여부를 확인해주세요. {detail}',
      'err.llm.noKey': 'LLM API 키가 설정되지 않았습니다.',
      'err.llm.noEndpoint': 'LLM 엔드포인트가 설정되지 않았습니다.',
      'err.llm.auth': 'LLM 인증 실패 — API 키를 확인해주세요.',
      'err.llm.rate': 'LLM 요청 한도 초과 (429)',
      'err.llm.parse': 'LLM 응답을 JSON으로 파싱하지 못했습니다.',
      'err.llm.count': 'LLM이 항목 수를 맞추지 못했습니다 (요청 {want} / 응답 {got})',
      'err.llm.nonString': 'LLM 응답에 문자열이 아닌 항목이 있습니다.',

      // 팝업
      'popup.title': '댓글 번역',
      'popup.settingsTitle': '설정 열기',
      'popup.notYouTube': '유튜브 영상 페이지에서 열어주세요.',
      'popup.autoTranslate': '자동 번역',
      'popup.autoTranslateDesc': '스크롤하며 자동으로 번역합니다',
      'popup.targetLang': '번역할 언어',
      'popup.engine': '번역 엔진',
      'popup.translateNow': '지금 보이는 댓글 번역',
      'popup.allSettings': '전체 설정',
      'popup.statsSeen': '인식한 댓글 {n}개',
      'popup.statsDone': '번역 완료 {n}',
      'popup.statsSkipped': '건너뜀 {n}',
      'popup.statsRunning': '진행 중 {n}',
      'popup.needsReload': '페이지를 새로고침하면 상태가 표시됩니다.',
      'popup.reloadRetry': '페이지를 새로고침한 뒤 다시 시도해주세요.',
      'popup.noBuiltin': '이 브라우저에서 Chrome 내장 번역을 쓸 수 없습니다 (Chrome 138+ 데스크톱 필요)',
      'popup.needsKey': '이 엔진은 API 키가 필요합니다 — 전체 설정에서 입력해주세요.',

      // 옵션 — 공통
      'opt.pageTitle': 'Better YouTube Comment Translation — 설정',
      'opt.subtitle': '유튜브 댓글과 답글 전체를 원하는 언어로 번역합니다.',
      'opt.welcome': '설치가 완료되었습니다. 기본 설정은 <b>Chrome 내장 번역(온디바이스)</b>이라 API 키 없이 바로 쓸 수 있습니다. 유튜브 영상에서 댓글의 <b>번역</b> 버튼을 누르면 최초 1회 언어팩을 내려받습니다.',
      'opt.saved': '저장됨',

      // 옵션 — 기본
      'opt.section.general': '기본',
      'opt.uiLang': '화면 언어',
      'opt.uiLangDesc': '이 확장 프로그램의 메뉴와 버튼에 쓰이는 언어입니다 (번역 대상 언어와는 별개입니다)',
      'opt.enabled': '확장 프로그램 사용',
      'opt.enabledDesc': '끄면 유튜브에 아무것도 표시하지 않습니다',
      'opt.autoTranslate': '자동 번역',
      'opt.autoTranslateDesc': '스크롤하며 화면에 들어온 댓글을 자동으로 번역 (단축키 Alt+T)',
      'opt.targetLang': '번역할 언어',
      'opt.targetLangDesc': '댓글을 이 언어로 번역합니다',
      'opt.translateReplies': '답글도 번역',
      'opt.translateRepliesDesc': '유튜브 기본 기능이 가장 자주 놓치는 부분입니다',
      'opt.skipSameLanguage': '이미 같은 언어면 건너뛰기',
      'opt.skipSameLanguageDesc': '번역할 필요 없는 댓글에 버튼을 만들지 않습니다',

      // 옵션 — 엔진
      'opt.section.engine': '번역 엔진',
      'opt.engine': '기본 엔진',
      'opt.fallbackEngine': '대체 엔진',
      'opt.optional': '(선택)',
      'opt.fallbackDesc': '기본 엔진이 실패하거나 해당 언어쌍을 지원하지 않을 때 대신 사용합니다.',
      'opt.fallbackNone': '사용 안 함',
      'opt.builtinChecking': '확인 중…',
      'opt.builtinDesc': 'Chrome 138 이상 데스크톱에서만 동작합니다. 번역은 전부 기기 안에서 이뤄지며 댓글 내용이 외부로 전송되지 않습니다. 언어쌍마다 최초 1회 모델을 내려받습니다. 직접 지원하지 않는 언어쌍은 영어를 경유해 2단계로 번역합니다.',
      'opt.warmupDetector': '언어 감지 모델 준비',
      'opt.warmupDesc': '원문 언어를 알아내는 데 쓰는 모델입니다. 준비되지 않으면 문자·불용어 기반 추정으로 대신 동작하는데, 짧은 라틴 문자 댓글에서 가끔 틀립니다.',
      'opt.grant': '권한 허용',
      'opt.granted': '권한 허용됨 ✓',
      'opt.test': '연결 테스트',
      'opt.deeplKeyLabel': 'DeepL API 키',
      'opt.deeplKeyHint': '무료 키는 <code>:fx</code>로 끝납니다.',
      'opt.deeplKeyLink': '키 발급받기',
      'opt.googleKeyLabel': 'Google Cloud API 키',
      'opt.googleKeyHint': 'Google Cloud 콘솔에서 <b>Cloud Translation API</b>를 활성화한 프로젝트의 키가 필요합니다.',
      'opt.llmEndpoint': '엔드포인트 (OpenAI 호환 chat completions)',
      'opt.llmModel': '모델',
      'opt.llmKey': 'API 키',
      'opt.llmHint': '슬랭·밈·말장난 번역이 가장 자연스럽지만 느리고 비용이 발생합니다. 댓글이 API 제공자에게 전송된다는 점을 유의하세요.',

      // 옵션 — 표시
      'opt.section.display': '표시',
      'opt.showOriginal': '원문 함께 보기',
      'opt.showOriginalDesc': '끄면 번역문만 남기고 원문을 숨깁니다',
      'opt.showEngineBadge': '언어·엔진 배지 표시',
      'opt.showEngineBadgeDesc': '번역문 위에 "English → 한국어 · Chrome" 표시',
      'opt.hideYoutubeButton': '유튜브 기본 번역 버튼 숨기기',
      'opt.hideYoutubeButtonDesc': '버튼이 두 개 겹쳐 보이는 것을 방지합니다',

      // 옵션 — 고급
      'opt.section.advanced': '고급',
      'opt.minLength': '최소 글자 수',
      'opt.minLengthDesc': '이보다 짧은 댓글은 번역하지 않습니다.',
      'opt.concurrency': '동시 번역 수',
      'opt.concurrencyDesc': '높이면 빨라지지만 부하가 커집니다.',
      'opt.autoDownloadModels': '언어팩 자동 다운로드',
      'opt.autoDownloadModelsDesc': '클릭 없이 필요한 모델을 내려받습니다. 네트워크 사용량이 늘 수 있습니다',
      'opt.clearCache': '번역 캐시 비우기',
      'opt.cacheInfo': '저장된 번역 {n}개 ({kb} KB)',

      // 옵션 — 단축키
      'opt.section.shortcuts': '단축키',
      'opt.shortcutsDesc': '<b>Alt+T</b> — 자동 번역 켜기/끄기 · <b>Alt+Shift+T</b> — 현재 보이는 댓글 모두 번역<br>주소창에 <code>chrome://extensions/shortcuts</code> 를 입력하면 바꿀 수 있습니다.',

      // 옵션 — 상태 메시지
      'opt.noBuiltinApi': '이 브라우저에서는 Chrome 내장 번역 API를 쓸 수 없습니다. Chrome 138 이상 데스크톱 버전이 필요합니다. DeepL이나 Google 엔진을 사용해주세요.',
      'opt.checkingPacks': '{lang} 언어팩 상태를 확인하는 중…',
      'opt.packCheckFailed': '언어팩 상태를 확인하지 못했습니다: {error}',
      'opt.packTarget': '번역 대상: {lang}',
      'opt.packReady': '바로 번역 가능: {list}',
      'opt.packDownloadable': '다운로드 필요: {list} (유튜브에서 번역 버튼을 누르면 받습니다)',
      'opt.packUnavailable': '직접 지원 안 됨: {list} (영어 경유로 시도합니다)',
      'opt.packUnknown': '상태 확인 실패: {list} — 브라우저가 응답하지 않았습니다. 번역 자체는 시도해볼 수 있지만, 계속 실패하면 DeepL이나 Google 엔진을 쓰세요.',
      'opt.testing': '테스트 중…',
      'opt.testOk': '성공: {text}',
      'opt.testFail': '실패',
      'opt.needEndpointFirst': '엔드포인트 URL을 먼저 입력해주세요.',
      'opt.permGranted': '권한이 허용되었습니다.',
      'opt.permDenied': '권한이 거부되었습니다.',
      'opt.detectorUnavailable': '이 브라우저에서는 사용할 수 없습니다.',
      'opt.detectorPreparing': '준비 중… (모델을 내려받는 중이면 몇 분 걸릴 수 있습니다)',
      'opt.detectorReady': '준비 완료 (테스트 감지: {lang}, 방식: {source})',
      'opt.detectorFailed': '준비 실패 — 추정 방식으로 동작합니다.',
    },

    en: {
      'engine.builtin.label': 'Chrome built-in (on-device)',
      'engine.builtin.note': 'No API key, free, and nothing leaves your device. Downloads a language pack once per pair.',
      'engine.deepl.label': 'DeepL',
      'engine.deepl.note': 'Usually the most natural-sounding. Free tier covers 500,000 characters a month.',
      'engine.deepl.keyHint': 'DeepL API key (free keys end in :fx)',
      'engine.google.label': 'Google Cloud Translation',
      'engine.google.note': 'The widest language coverage. Paid, with a 500,000-character monthly credit.',
      'engine.google.keyHint': 'Google Cloud API key',
      'engine.llm.label': 'LLM (OpenAI-compatible)',
      'engine.llm.note': 'Best with slang, memes and wordplay. Slower, and it costs money.',
      'engine.llm.keyHint': 'API key',

      'btn.translate': 'Translate',
      'btn.showOriginal': 'Original only',
      'btn.showTranslation': 'Show translation',
      'btn.retry': 'Retry',
      'btn.more': 'Show more',
      'btn.less': 'Show less',
      'btn.enableLang': 'Enable {lang} translation',
      'status.translating': 'Translating…',
      'status.downloading': 'Downloading language pack… {pct}%',
      'status.needsDownload': 'Needs a one-time language pack download',
      'status.failed': 'Translation failed',

      'toast.translatingN': 'Translating {n} comments…',
      'toast.nothingNew': 'No new comments to translate',
      'toast.autoOn': 'Auto-translate on',
      'toast.autoOff': 'Auto-translate off',

      'err.noBuiltinApi': "This browser has no built-in Translator API (needs Chrome 138+ on desktop)",
      'err.modelStalled': 'Could not prepare the translation model ({pair}) — the browser stopped responding',
      'err.pairUnavailable': "Chrome's built-in translation does not support {src}→{tgt}",
      'err.pairUnsupported': 'Unsupported language pair',
      'err.unknownSource': 'Could not identify the source language — set a fallback engine in the options to translate it anyway',

      'err.noBackground': 'No response from the background service worker',
      'err.http': '{engine} {status}: {detail}',
      'err.noPermission': 'No access to {origin}. Open the extension options and press "Grant permission" for this engine.',
      'err.badEndpoint': 'Invalid endpoint URL: {url}',
      'err.badSender': 'Sender not allowed',

      'err.validate.engine': 'Unknown engine: {engine}',
      'err.validate.noTexts': 'Invalid request: nothing to translate',
      'err.validate.tooMany': 'Too many items in one request (limit {max})',
      'err.validate.nonString': 'Invalid request: a non-string item was included',
      'err.validate.itemTooLong': 'One comment is too long',
      'err.validate.tooLarge': 'Request is too large',
      'err.validate.badTarget': 'Invalid target language code: {code}',
      'err.validate.badSource': 'Invalid source language code: {code}',

      'err.deepl.noKey': 'No DeepL API key is set.',
      'err.deepl.auth': 'DeepL rejected the key — please check your API key.',
      'err.deepl.quota': "You have used up this month's DeepL quota.",
      'err.deepl.rate': 'Too many DeepL requests (429)',
      'err.google.noKey': 'No Google Cloud API key is set.',
      'err.google.auth': 'Google Translate rejected the request — check the API key and that Cloud Translation API is enabled. {detail}',
      'err.llm.noKey': 'No LLM API key is set.',
      'err.llm.noEndpoint': 'No LLM endpoint is set.',
      'err.llm.auth': 'The LLM rejected the key — please check your API key.',
      'err.llm.rate': 'LLM rate limit exceeded (429)',
      'err.llm.parse': 'Could not parse the LLM response as JSON.',
      'err.llm.count': 'The LLM returned the wrong number of items (sent {want}, got {got})',
      'err.llm.nonString': 'The LLM response contained a non-string item.',

      'popup.title': 'Comment Translation',
      'popup.settingsTitle': 'Open settings',
      'popup.notYouTube': 'Open this on a YouTube video page.',
      'popup.autoTranslate': 'Auto-translate',
      'popup.autoTranslateDesc': 'Translate comments as you scroll',
      'popup.targetLang': 'Translate into',
      'popup.engine': 'Engine',
      'popup.translateNow': 'Translate visible comments',
      'popup.allSettings': 'All settings',
      'popup.statsSeen': '{n} comments found',
      'popup.statsDone': '{n} translated',
      'popup.statsSkipped': '{n} skipped',
      'popup.statsRunning': '{n} in progress',
      'popup.needsReload': 'Reload the page to see status here.',
      'popup.reloadRetry': 'Reload the page and try again.',
      'popup.noBuiltin': "Chrome's built-in translation is unavailable here (needs Chrome 138+ on desktop)",
      'popup.needsKey': 'This engine needs an API key — add it in All settings.',

      'opt.pageTitle': 'Better YouTube Comment Translation — Settings',
      'opt.subtitle': 'Translates every YouTube comment and reply into the language you choose.',
      'opt.welcome': 'Installed. The default engine is <b>Chrome built-in (on-device)</b>, so it works right away with no API key. The first time you press <b>Translate</b> on a comment, Chrome downloads that language pack once.',
      'opt.saved': 'Saved',

      'opt.section.general': 'General',
      'opt.uiLang': 'Interface language',
      'opt.uiLangDesc': "The language of this extension's own menus and buttons (separate from what comments are translated into)",
      'opt.enabled': 'Extension enabled',
      'opt.enabledDesc': 'When off, nothing is added to YouTube',
      'opt.autoTranslate': 'Auto-translate',
      'opt.autoTranslateDesc': 'Translate comments as they scroll into view (shortcut Alt+T)',
      'opt.targetLang': 'Translate into',
      'opt.targetLangDesc': 'Comments are translated into this language',
      'opt.translateReplies': 'Translate replies too',
      'opt.translateRepliesDesc': "The thing YouTube's own feature misses most often",
      'opt.skipSameLanguage': 'Skip comments already in that language',
      'opt.skipSameLanguageDesc': 'No button is drawn on comments you can already read',

      'opt.section.engine': 'Translation engine',
      'opt.engine': 'Primary engine',
      'opt.fallbackEngine': 'Fallback engine',
      'opt.optional': '(optional)',
      'opt.fallbackDesc': "Used when the primary engine fails or doesn't support a language pair.",
      'opt.fallbackNone': 'None',
      'opt.builtinChecking': 'Checking…',
      'opt.builtinDesc': 'Works on Chrome 138+ desktop only. Translation happens entirely on your device and comment text is never sent anywhere. Each language pair downloads a model once. Pairs without direct support are routed through English in two steps.',
      'opt.warmupDetector': 'Prepare language detector',
      'opt.warmupDesc': "This model identifies the source language. Without it, detection falls back to a script-and-stopword guess, which is occasionally wrong on short Latin-script comments.",
      'opt.grant': 'Grant permission',
      'opt.granted': 'Permission granted ✓',
      'opt.test': 'Test connection',
      'opt.deeplKeyLabel': 'DeepL API key',
      'opt.deeplKeyHint': 'Free keys end in <code>:fx</code>.',
      'opt.deeplKeyLink': 'Get a key',
      'opt.googleKeyLabel': 'Google Cloud API key',
      'opt.googleKeyHint': 'You need a key from a project with <b>Cloud Translation API</b> enabled in the Google Cloud console.',
      'opt.llmEndpoint': 'Endpoint (OpenAI-compatible chat completions)',
      'opt.llmModel': 'Model',
      'opt.llmKey': 'API key',
      'opt.llmHint': 'Best with slang, memes and wordplay, but slower and it costs money. Note that comment text is sent to that provider.',

      'opt.section.display': 'Display',
      'opt.showOriginal': 'Keep the original visible',
      'opt.showOriginalDesc': 'When off, the original is hidden and only the translation is shown',
      'opt.showEngineBadge': 'Show language and engine badge',
      'opt.showEngineBadgeDesc': 'Shows "English → 한국어 · Chrome" above each translation',
      'opt.hideYoutubeButton': "Hide YouTube's own translate button",
      'opt.hideYoutubeButtonDesc': 'Avoids two overlapping buttons',

      'opt.section.advanced': 'Advanced',
      'opt.minLength': 'Minimum length',
      'opt.minLengthDesc': 'Comments shorter than this are ignored.',
      'opt.concurrency': 'Concurrent translations',
      'opt.concurrencyDesc': 'Higher is faster but heavier.',
      'opt.autoDownloadModels': 'Auto-download language packs',
      'opt.autoDownloadModelsDesc': 'Skips the one-time click, at the cost of background downloads',
      'opt.clearCache': 'Clear translation cache',
      'opt.cacheInfo': '{n} translations stored ({kb} KB)',

      'opt.section.shortcuts': 'Keyboard shortcuts',
      'opt.shortcutsDesc': '<b>Alt+T</b> — toggle auto-translate · <b>Alt+Shift+T</b> — translate all visible comments<br>Change them at <code>chrome://extensions/shortcuts</code>.',

      'opt.noBuiltinApi': "Chrome's built-in Translator API is unavailable in this browser. It needs Chrome 138 or newer on desktop. Use the DeepL or Google engine instead.",
      'opt.checkingPacks': 'Checking {lang} language packs…',
      'opt.packCheckFailed': 'Could not check language pack status: {error}',
      'opt.packTarget': 'Target: {lang}',
      'opt.packReady': 'Ready now: {list}',
      'opt.packDownloadable': 'Needs download: {list} (press Translate on a comment to fetch it)',
      'opt.packUnavailable': 'No direct support: {list} (will route through English)',
      'opt.packUnknown': 'Status check failed: {list} — the browser did not respond. Translation may still work; if it keeps failing, use the DeepL or Google engine.',
      'opt.testing': 'Testing…',
      'opt.testOk': 'Success: {text}',
      'opt.testFail': 'Failed',
      'opt.needEndpointFirst': 'Enter the endpoint URL first.',
      'opt.permGranted': 'Permission granted.',
      'opt.permDenied': 'Permission denied.',
      'opt.detectorUnavailable': 'Not available in this browser.',
      'opt.detectorPreparing': 'Preparing… (may take a few minutes if the model is downloading)',
      'opt.detectorReady': 'Ready (test detection: {lang}, via {source})',
      'opt.detectorFailed': 'Could not prepare it — falling back to guessing.',
    },
  };

  const FALLBACK = 'en';
  let current = null;         // 확정된 언어 코드 ('ko' | 'en')

  /** 브라우저 UI 언어 → 우리가 지원하는 코드 */
  function browserLang() {
    let raw = '';
    try {
      raw = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || '';
    } catch { /* 확장 컨텍스트가 아닐 수 있다 */ }
    if (!raw && typeof navigator !== 'undefined') raw = navigator.language || '';
    const base = String(raw).toLowerCase().split('-')[0];
    return MESSAGES[base] ? base : FALLBACK;
  }

  /** 'auto' 또는 명시된 코드를 실제 사용할 언어로 확정 */
  function resolve(pref) {
    if (pref && pref !== 'auto' && MESSAGES[pref]) return pref;
    return browserLang();
  }

  function setLang(pref) {
    current = resolve(pref);
    return current;
  }

  const getLang = () => current || (current = browserLang());

  /** {name} 치환. 값은 항상 문자열로 강제한다. */
  function format(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) =>
      Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m);
  }

  /**
   * @param {string} key 'btn.translate' 같은 카탈로그 키
   * @param {object} [params] {name} 치환값
   */
  function t(key, params) {
    const lang = getLang();
    const table = MESSAGES[lang] || MESSAGES[FALLBACK];
    let s = table[key];
    if (s === undefined) s = MESSAGES[FALLBACK][key];
    if (s === undefined) {
      console.warn('[BYCT] missing i18n key:', key);
      return key;
    }
    return format(s, params);
  }

  /**
   * data-i18n 속성이 붙은 요소를 채운다.
   *   data-i18n           → textContent
   *   data-i18n-html      → innerHTML (카탈로그 안의 <b>, <code> 를 살려야 하는 문구)
   *   data-i18n-title     → title 속성
   *   data-i18n-aria      → aria-label 속성
   *   data-i18n-placeholder → placeholder 속성
   *
   * innerHTML 을 쓰는 곳은 카탈로그 값뿐이다. 사용자 입력이나 번역 결과는 절대 넣지 않는다.
   */
  function applyDom(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    if (root === document) {
      const titleKey = document.documentElement.dataset.i18nTitle;
      if (titleKey) document.title = t(titleKey);
      document.documentElement.lang = getLang();
    }
  }

  /** UI 언어 셀렉트에 넣을 라벨 (현재 언어 기준으로 표기) */
  function uiLangLabel(code) {
    const row = BYCT.UI_LANGS.find(([c]) => c === code);
    if (!row) return code;
    return row[1][getLang()] || row[1].en;
  }

  BYCT.i18n = {
    t, setLang, getLang, resolve, browserLang, applyDom, uiLangLabel,
    MESSAGES, FALLBACK,
  };
})(globalThis.BYCT);
