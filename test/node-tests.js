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

globalThis.chrome = {
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

// ---------- 결과 ----------

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
