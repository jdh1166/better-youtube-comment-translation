/* chrome.storage.sync 래퍼. 값이 바뀌면 구독자에게 알린다.

   content script 는 API 키를 알 필요가 없다(원격 번역은 전부 서비스 워커가 호출한다).
   BYCT.stripSecrets 를 켠 컨텍스트에서는 키 값을 아예 캐시에 담지 않는다.
   격리 월드라 페이지가 직접 읽지는 못하지만, 필요 없는 비밀은 애초에 들고 있지 않는 게 맞다. */
(function (BYCT) {
  'use strict';

  let cache = null;
  const listeners = new Set();

  /** stripSecrets 컨텍스트에서는 비밀값을 빈 문자열로 지운다 (제자리 수정) */
  function sanitize(obj) {
    if (!BYCT.stripSecrets) return obj;
    for (const k of BYCT.SECRET_KEYS) {
      if (k in obj) obj[k] = '';
    }
    return obj;
  }

  async function get() {
    if (cache) return cache;
    const stored = await chrome.storage.sync.get(BYCT.DEFAULTS);
    cache = sanitize({ ...BYCT.DEFAULTS, ...stored });
    return cache;
  }

  /** 캐시된 값을 동기적으로 읽는다 (get()이 한 번 이상 불린 뒤에만 유효) */
  function getSync() {
    return cache || sanitize({ ...BYCT.DEFAULTS });
  }

  async function set(patch) {
    cache = sanitize({ ...(cache || BYCT.DEFAULTS), ...patch });
    await chrome.storage.sync.set(patch);
    return cache;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // 다른 탭/옵션 페이지에서 바꾼 설정을 반영
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const patch = {};
      let touched = false;
      for (const [k, v] of Object.entries(changes)) {
        if (k in BYCT.DEFAULTS) { patch[k] = v.newValue; touched = true; }
      }
      if (!touched) return;
      sanitize(patch);
      cache = sanitize({ ...(cache || BYCT.DEFAULTS), ...patch });
      listeners.forEach((fn) => { try { fn(cache, patch); } catch (e) { console.error(e); } });
    });
  }

  BYCT.settings = { get, getSync, set, onChange };
})(globalThis.BYCT);
