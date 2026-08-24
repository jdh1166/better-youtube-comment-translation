/* 전역 네임스페이스. content script(격리 월드)와 service worker 양쪽에서 공유된다.
   번들러 없이 manifest의 js 배열 순서대로 로드되므로, 이 파일이 항상 첫 번째다. */
var BYCT = (globalThis.BYCT = globalThis.BYCT || {});

BYCT.VERSION = '0.4.0';

/** 엔진 ID */
BYCT.ENGINE = {
  BUILTIN: 'builtin',   // Chrome 내장 Translator API (온디바이스, 무료, 키 불필요)
  DEEPL: 'deepl',       // DeepL API (무료 티어 월 50만자)
  GOOGLE: 'google',     // Google Cloud Translation v2
  LLM: 'llm',           // OpenAI 호환 chat completions (슬랭/밈에 강함)
};

/* 엔진 메타데이터. options 화면이 이걸로 폼을 그린다.
   표시 문구는 i18n 카탈로그 키로만 들고 있는다 — 이 파일은 i18n.js 보다 먼저 로드되므로
   여기서 t() 를 부를 수 없고, 사용자가 화면 언어를 바꾸면 다시 그려야 하기 때문이다. */
BYCT.ENGINE_META = {
  builtin: { needsKey: false, remote: false },
  deepl: { needsKey: true, remote: true },
  google: { needsKey: true, remote: true },
  llm: { needsKey: true, remote: true },
};

/** 엔진 표시 이름 (배지 등에 쓰는 짧은 이름 — 번역하지 않는 고유명사) */
BYCT.ENGINE_SHORT = {
  builtin: 'Chrome', deepl: 'DeepL', google: 'Google', llm: 'LLM',
};

/** 번역 대상 언어 목록 (Chrome 내장 Translator 지원 언어 위주) */
BYCT.LANGUAGES = [
  ['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['zh', '中文 (简体)'],
  ['zh-Hant', '中文 (繁體)'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['pt', 'Português'], ['ru', 'Русский'], ['it', 'Italiano'], ['nl', 'Nederlands'],
  ['pl', 'Polski'], ['tr', 'Türkçe'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'],
  ['id', 'Bahasa Indonesia'], ['hi', 'हिन्दी'], ['ar', 'العربية'], ['bn', 'বাংলা'],
  ['uk', 'Українська'], ['cs', 'Čeština'], ['sv', 'Svenska'], ['ro', 'Română'],
  ['el', 'Ελληνικά'], ['he', 'עברית'], ['fa', 'فارسی'], ['ta', 'தமிழ்'],
  ['te', 'తెలుగు'], ['mr', 'मराठी'], ['kn', 'ಕನ್ನಡ'], ['ms', 'Bahasa Melayu'],
];

/* 브라우저 UI 언어로 기본 번역 대상을 정한다.
   예전에는 'ko' 로 하드코딩되어 있어서, 영어권 사용자가 설치하면 모든 댓글이
   한국어로 번역되는 상태로 시작했다. 설치 시점에 storage 에 기록해 고정한다. */
BYCT.defaultTargetLang = function () {
  let raw = '';
  try {
    raw = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || '';
  } catch { /* 확장 컨텍스트가 아닐 수 있다 */ }
  if (!raw && typeof navigator !== 'undefined') raw = navigator.language || '';
  const lower = String(raw).toLowerCase();

  // zh-TW / zh-HK 는 번체를 쓴다
  if (lower.startsWith('zh')) {
    return /tw|hk|mo|hant/.test(lower) ? 'zh-Hant' : 'zh';
  }
  const base = lower.split('-')[0];
  return BYCT.LANGUAGES.some(([c]) => c === base) ? base : 'en';
};

/** 기본 설정값 */
BYCT.DEFAULTS = {
  enabled: true,
  uiLang: 'auto',              // 'auto' | 'ko' | 'en' — 확장 화면 자체의 언어
  autoTranslate: false,        // true면 스크롤하며 자동 번역
  targetLang: 'en',            // 설치 시 defaultTargetLang() 결과로 덮어쓴다
  engine: 'builtin',
  fallbackEngine: '',          // 기본 엔진 실패 시 대체 (빈 문자열이면 없음)
  translateReplies: true,
  showOriginal: true,          // 원문 유지 + 번역문 병기 (false면 번역문만 표시)
  hideYoutubeButton: true,     // 유튜브 기본 번역 버튼 숨김 (중복 방지)
  skipSameLanguage: true,      // 이미 목표 언어인 댓글은 건너뜀
  minLength: 2,                // 이 글자 수 미만은 번역 안 함
  autoDownloadModels: false,   // 언어팩을 클릭 없이 자동 다운로드 시도
  concurrency: 3,              // 동시 번역 요청 수
  showEngineBadge: true,       // 번역문 옆에 "en→ko · Chrome" 배지 표시
  // 엔진별 자격증명
  deeplKey: '',
  googleKey: '',
  llmKey: '',
  llmEndpoint: 'https://api.openai.com/v1/chat/completions',
  llmModel: 'gpt-4o-mini',
};

/** content script 가 알 필요 없는 값. 페이지 쪽 컨텍스트로 새어나가지 않게 가린다. */
BYCT.SECRET_KEYS = ['deeplKey', 'googleKey', 'llmKey'];

/* 번역할 필요 없는 텍스트 판별.

   원래 정규식이었는데 `^\s*(https?:\/\/\S+\s*)+$` 처럼 중첩 수량자 패턴이라
   긴 댓글에서 백트래킹이 폭발했다(ReDoS). 댓글 길이는 공격자가 정할 수 있는 값이므로
   입력 길이에 대해 선형인 토큰 검사로 바꿨다. */
const TOKEN_RE = {
  url: /^https?:\/\/\S+$/i,
  mention: /^@[^\s@]+$/u,
  timestamp: /^\d{1,3}:\d{2}(?::\d{2})?$/,
};

function everyToken(text, re) {
  let n = 0;
  for (const t of text.split(/\s+/)) {
    if (!t) continue;
    if (!re.test(t)) return false;
    n++;
  }
  return n > 0;
}

BYCT.TRIVIAL = {
  urlOnly: (t) => everyToken(t, TOKEN_RE.url),
  mentionOnly: (t) => everyToken(t, TOKEN_RE.mention),
  timestampOnly: (t) => everyToken(t, TOKEN_RE.timestamp),
  /** 글자가 하나도 없으면 번역할 것도 없다 (이모지·기호·숫자만) */
  noLetters: (t) => !/\p{L}/u.test(t),
};

/** 위 조건 중 하나라도 해당하면 번역 대상이 아니다 */
BYCT.isTrivialText = function (text, minLength) {
  const t = (text || '').trim();
  if (t.length < Math.max(1, minLength || 1)) return true;
  const T = BYCT.TRIVIAL;
  return T.noLetters(t) || T.urlOnly(t) || T.mentionOnly(t) || T.timestampOnly(t);
};
