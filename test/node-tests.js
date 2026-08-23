/* 브라우저 없이 돌리는 테스트.
   서비스 워커의 요청 검증과, 번역 제외 판정(ReDoS 회귀 포함)을 확인한다.

       node test/node-tests.js
*/
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.dirname(__dirname);
let pass = 0;
let fail = 0;

function check(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
}

function expectThrow(label, fn) {
  let msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  check(label + (msg ? `  (${msg.slice(0, 50)})` : ''), !!msg, '예외가 발생하지 않았음');
}

// ---------- 서비스 워커 환경 흉내 ----------

globalThis.importScripts = (...ps) => ps.forEach((p) =>
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, p), 'utf8'), { filename: p }));

let UI_LANGUAGE = 'en';   // 테스트에서 브라우저 언어를 바꿔가며 확인한다

globalThis.chrome = {
  i18n: { getUILanguage: () => UI_LANGUAGE },
  runtime: {
    id: 'testext',
    onMessage: { addListener() {} },
    onInstalled: { addListener() {} },
    getURL: (p) => p,
  },
  commands: { onCommand: { addListener() {} } },
  storage: { sync: { get: async (d) => ({ ...d }) }, onChanged: { addListener() {} } },
  permissions: { contains: async () => false },
  tabs: { query: async () => [] },
};

vm.runInThisContext(
  fs.readFileSync(path.join(ROOT, 'src/bg/service-worker.js'), 'utf8'),
  { filename: 'service-worker.js' }
);

// ---------- 1. 번역 제외 판정 ----------

console.log('\n[1] 번역 제외 판정');
const T = globalThis.BYCT;
for (const [text, want, label] of [
  ['https://example.com/a/b', true, 'URL만'],
  ['https://a.com https://b.com', true, 'URL 여러 개'],
  ['🔥🔥🔥😂', true, '이모지만'],
  ['0:43 1:52 3:07', true, '타임스탬프만'],
  ['@user1 @user2', true, '멘션만'],
  ['123 456', true, '숫자만'],
  ['!!!???', true, '문장부호만'],
  ['lol', false, '짧은 영어'],
  ['이건 진짜 레전드', false, '한국어'],
  ['check https://a.com out', false, 'URL 포함 문장'],
  ['3:42 이 부분 최고', false, '타임스탬프 포함 문장'],
]) {
  const got = T.isTrivialText(text, 2);
  check(`${label} -> ${want}`, got === want, String(got));
}

// ---------- 2. ReDoS 회귀 ----------
// 교체 전 정규식 `^\s*(https?:\/\/\S+\s*)+$` 은 이 입력에서 지수적으로 폭발했다.
// (실측: 276자에 4.5초, 300자 이상이면 사실상 정지)

console.log('\n[2] ReDoS 회귀');
for (const n of [40, 200, 2000]) {
  const evil = 'https://' + 'http://'.repeat(n) + ' X';
  const t0 = Date.now();
  T.isTrivialText(evil, 2);
  const ms = Date.now() - t0;
  check(`악성 입력 ${evil.length}자 -> ${ms}ms`, ms < 100, ms + 'ms');
}

// ---------- 3. 언어 코드 정규화 ----------

console.log('\n[3] 언어 코드 정규화');
const { normalizeLang, sameLang } = T.util;
check("'zh-Hans-CN' -> 'zh-Hans'", normalizeLang('zh-Hans-CN') === 'zh-Hans', normalizeLang('zh-Hans-CN'));
check("'EN-US' -> 'en'", normalizeLang('EN-US') === 'en', normalizeLang('EN-US'));
check('ko === ko', sameLang('ko', 'ko'));
check('zh-Hant !== zh-Hans', !sameLang('zh-Hant', 'zh-Hans'));
check('und 는 무엇과도 같지 않다', !sameLang('und', 'und'));
check('빈 값은 같지 않다', !sameLang('', 'ko'));

// ---------- 4. 서비스 워커 요청 검증 ----------

console.log('\n[4] 서비스 워커 요청 검증');
const good = { engine: 'deepl', texts: ['hello'], sourceLanguage: 'en', targetLanguage: 'ko' };

check('정상 요청 통과', (() => {
  try { validateRequest(good); return true; } catch { return false; }
})());
check('빈 sourceLanguage 허용 (자동 감지)', (() => {
  try { validateRequest({ ...good, sourceLanguage: '' }); return true; } catch { return false; }
})());
check('zh-Hant 같은 지역 코드 허용', (() => {
  try { validateRequest({ ...good, targetLanguage: 'zh-Hant' }); return true; } catch { return false; }
})());

expectThrow('알 수 없는 엔진 거부', () => validateRequest({ ...good, engine: 'evil' }));
expectThrow('프로토타입 체인 접근 거부', () => validateRequest({ ...good, engine: 'constructor' }));
expectThrow('texts 가 배열이 아니면 거부', () => validateRequest({ ...good, texts: 'hi' }));
expectThrow('빈 배열 거부', () => validateRequest({ ...good, texts: [] }));
expectThrow('문자열 아닌 항목 거부', () => validateRequest({ ...good, texts: ['a', { x: 1 }] }));
expectThrow('항목 수 초과 거부', () => validateRequest({ ...good, texts: Array(201).fill('a') }));
expectThrow('항목 하나가 너무 길면 거부', () => validateRequest({ ...good, texts: ['a'.repeat(20001)] }));
expectThrow('총 길이 초과 거부', () => validateRequest({ ...good, texts: Array(20).fill('a'.repeat(9000)) }));
expectThrow('언어 코드 주입 문자 거부', () => validateRequest({ ...good, targetLanguage: 'ko&key=x' }));
expectThrow('언어 코드 경로 문자 거부', () => validateRequest({ ...good, targetLanguage: '../../etc' }));
expectThrow('대상 언어 누락 거부', () => validateRequest({ ...good, targetLanguage: '' }));

// ---------- 5. i18n 카탈로그 ----------

console.log('\n[5] i18n 카탈로그');
const { MESSAGES, t: tr, setLang, resolve } = T.i18n;
const langs = Object.keys(MESSAGES);
check('지원 언어가 ko/en 둘 다 있다', langs.includes('ko') && langs.includes('en'), langs.join(','));

// 한쪽에만 있는 키가 있으면 그 언어에서 문구가 통째로 빠진다
const keysEn = Object.keys(MESSAGES.en);
const keysKo = Object.keys(MESSAGES.ko);
const missingKo = keysEn.filter((k) => !(k in MESSAGES.ko));
const missingEn = keysKo.filter((k) => !(k in MESSAGES.en));
check(`en 키 ${keysEn.length}개가 ko 에 모두 있다`, missingKo.length === 0, missingKo.join(', '));
check(`ko 키 ${keysKo.length}개가 en 에 모두 있다`, missingEn.length === 0, missingEn.join(', '));

// 치환자가 양쪽에서 같아야 한다. 한쪽에만 {n} 이 있으면 그 언어에서 숫자가 사라진다.
const phMismatch = [];
for (const k of keysEn) {
  const ph = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
  if (ph(MESSAGES.en[k]) !== ph(MESSAGES.ko[k])) {
    phMismatch.push(`${k} (en:${ph(MESSAGES.en[k])} / ko:${ph(MESSAGES.ko[k])})`);
  }
}
check('치환자 {name} 가 양쪽에서 일치', phMismatch.length === 0, phMismatch.join(' | '));

// 빈 문구가 있으면 화면에 아무것도 안 나온다
const empties = [];
for (const l of langs) for (const k of Object.keys(MESSAGES[l])) {
  if (!String(MESSAGES[l][k]).trim()) empties.push(`${l}:${k}`);
}
check('빈 문구 없음', empties.length === 0, empties.join(', '));

setLang('en');
check("영어: btn.translate = 'Translate'", tr('btn.translate') === 'Translate', tr('btn.translate'));
setLang('ko');
check("한국어: btn.translate = '번역'", tr('btn.translate') === '번역', tr('btn.translate'));
check('치환 동작', tr('toast.translatingN', { n: 7 }) === '7개 댓글 번역 중…', tr('toast.translatingN', { n: 7 }));
check('없는 치환자는 그대로 둔다', tr('toast.translatingN', {}).includes('{n}'), tr('toast.translatingN', {}));

// 'auto' 는 브라우저 언어를 따라간다
UI_LANGUAGE = 'ko-KR';
check("auto + 브라우저 ko-KR -> ko", resolve('auto') === 'ko', resolve('auto'));
UI_LANGUAGE = 'fr-FR';
check('auto + 미지원 언어(fr) -> en 폴백', resolve('auto') === 'en', resolve('auto'));
UI_LANGUAGE = 'en-US';
check('명시 지정이 브라우저 언어보다 우선', resolve('ko') === 'ko', resolve('ko'));

// 없는 키는 키 문자열을 그대로 돌려준다 (화면이 비지 않도록)
setLang('en');
check('없는 키는 키 이름을 반환', tr('no.such.key') === 'no.such.key', tr('no.such.key'));

// ---------- 6. 기본 번역 대상 언어 ----------

console.log('\n[6] 설치 시 기본 번역 대상 언어');
for (const [ui, want] of [
  ['ko-KR', 'ko'], ['en-US', 'en'], ['ja-JP', 'ja'],
  ['zh-TW', 'zh-Hant'], ['zh-CN', 'zh'], ['pt-BR', 'pt'],
  ['sw-KE', 'en'],   // 미지원 언어는 영어로
]) {
  UI_LANGUAGE = ui;
  const got = T.defaultTargetLang();
  check(`${ui} -> ${want}`, got === want, got);
}
UI_LANGUAGE = 'en-US';

// ---------- 결과 ----------

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
