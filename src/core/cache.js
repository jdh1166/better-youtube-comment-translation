/* 번역 결과 캐시.
   메모리 LRU + chrome.storage.local 영속화(디바운스 저장).
   같은 댓글을 스크롤로 다시 만나거나 페이지를 다시 열어도 재번역하지 않는다. */
(function (BYCT) {
  'use strict';
  const { hash, debounce } = BYCT.util;

  const MAX_ENTRIES = 3000;
  const STORAGE_KEY = 'byct_cache_v1';

  /** Map은 삽입 순서를 보존하므로 그대로 LRU로 쓴다 */
  const mem = new Map();
  let loaded = false;
  let dirty = false;

  function key(engine, src, tgt, text) {
    return `${engine}|${src}>${tgt}|${hash(text)}|${text.length}`;
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const obj = await chrome.storage.local.get(STORAGE_KEY);
      const entries = obj[STORAGE_KEY];
      if (Array.isArray(entries)) {
        for (const [k, v] of entries) mem.set(k, v);
      }
    } catch (e) {
      console.warn('[BYCT] 캐시 로드 실패:', e);
    }
  }

  const flush = debounce(async () => {
    if (!dirty) return;
    dirty = false;
    try {
      // 최근 것부터 MAX_ENTRIES 개만 남긴다
      const entries = [...mem.entries()].slice(-MAX_ENTRIES);
      await chrome.storage.local.set({ [STORAGE_KEY]: entries });
    } catch (e) {
      // QUOTA_BYTES 초과 시 절반 버리고 재시도
      console.warn('[BYCT] 캐시 저장 실패, 축소 후 재시도:', e);
      const half = [...mem.entries()].slice(-Math.floor(MAX_ENTRIES / 2));
      mem.clear();
      half.forEach(([k, v]) => mem.set(k, v));
      try { await chrome.storage.local.set({ [STORAGE_KEY]: half }); } catch {}
    }
  }, 5000);

  function get(engine, src, tgt, text) {
    const k = key(engine, src, tgt, text);
    if (!mem.has(k)) return null;
    const v = mem.get(k);
    mem.delete(k); mem.set(k, v);   // LRU 갱신
    return v;
  }

  function set(engine, src, tgt, text, translated) {
    const k = key(engine, src, tgt, text);
    if (mem.has(k)) mem.delete(k);
    mem.set(k, translated);
    while (mem.size > MAX_ENTRIES) mem.delete(mem.keys().next().value);
    dirty = true;
    flush();
    return translated;
  }

  async function clear() {
    mem.clear();
    dirty = false;
    try { await chrome.storage.local.remove(STORAGE_KEY); } catch {}
  }

  const size = () => mem.size;

  BYCT.cache = { load, get, set, clear, size };
})(globalThis.BYCT);
