/* 공용 유틸 */
(function (BYCT) {
  'use strict';

  /** 문자열 → 32bit 해시 (캐시 키용, FNV-1a) */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  /** promise에 타임아웃을 건다. 시간 초과 시 fallback 값으로 resolve.
      Chrome 내장 API의 availability()가 간헐적으로 영영 안 끝나는 사례가 있어 필수. */
  function withTimeout(promise, ms, fallback) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (!done) { done = true; resolve(fallback); }
      }, ms);
      Promise.resolve(promise).then(
        (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        () => { if (!done) { done = true; clearTimeout(t); resolve(fallback); } }
      );
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 연속 호출을 묶는다 (트레일링 엣지) */
  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /** 'zh-Hans-CN' → 'zh' 처럼 기본 서브태그만 남긴다.
      단 zh-Hant / pt-BR 처럼 의미 있는 구분은 보존. */
  const KEEP_REGION = new Set(['zh-Hant', 'zh-Hans', 'pt-BR', 'pt-PT']);
  function normalizeLang(code) {
    if (!code) return '';
    const c = String(code).trim();
    for (const k of KEEP_REGION) {
      if (c.toLowerCase().startsWith(k.toLowerCase())) return k;
    }
    return c.split('-')[0].toLowerCase();
  }

  /** 두 언어 코드가 실질적으로 같은지.
      zh-Hans / zh-Hant 처럼 표기가 다르면 다른 언어로 취급한다
      (번체 사용자에게 간체를 그대로 보여주면 안 되므로).
      또한 'und'(판별 실패)는 무엇과도 같지 않다 — 같다고 보면 번역을 건너뛰어버린다. */
  function sameLang(a, b) {
    a = normalizeLang(a); b = normalizeLang(b);
    if (!a || !b || a === 'und' || b === 'und') return false;
    return a === b;
  }

  /** 지수 백오프 재시도 */
  async function retry(fn, { tries = 3, baseMs = 400 } = {}) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try { return await fn(); }
      catch (e) {
        lastErr = e;
        if (e && e.__noRetry) throw e;
        if (i < tries - 1) await sleep(baseMs * Math.pow(2, i) + Math.random() * 200);
      }
    }
    throw lastErr;
  }

  BYCT.util = { hash, withTimeout, sleep, debounce, normalizeLang, sameLang, retry };
})(globalThis.BYCT);
