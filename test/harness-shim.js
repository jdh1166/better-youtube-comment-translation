/* 확장 프로그램 밖(일반 웹페이지)에서 content script를 돌리기 위한 chrome.* 목 객체.
   storage는 실제로 동작하는 인메모리 구현이라 설정 변경·캐시 로직까지 그대로 검증된다. */
(function () {
  'use strict';

  const syncStore = {};
  const localStore = {};
  const changeListeners = [];

  function areaFactory(store, areaName) {
    return {
      async get(keys) {
        if (keys == null) return { ...store };
        if (typeof keys === 'string') {
          return keys in store ? { [keys]: store[keys] } : {};
        }
        if (Array.isArray(keys)) {
          const out = {};
          keys.forEach((k) => { if (k in store) out[k] = store[k]; });
          return out;
        }
        // 객체 = 기본값 맵
        const out = {};
        for (const [k, def] of Object.entries(keys)) out[k] = (k in store) ? store[k] : def;
        return out;
      },
      async set(obj) {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: store[k], newValue: v };
          store[k] = v;
        }
        changeListeners.forEach((fn) => fn(changes, areaName));
      },
      async remove(keys) {
        for (const k of [].concat(keys)) delete store[k];
      },
      async getBytesInUse() {
        return JSON.stringify(store).length;
      },
    };
  }

  window.chrome = window.chrome || {};

  chrome.storage = {
    sync: areaFactory(syncStore, 'sync'),
    local: areaFactory(localStore, 'local'),
    onChanged: { addListener: (fn) => changeListeners.push(fn) },
  };

  const msgListeners = [];
  chrome.runtime = {
    id: 'harness',
    getURL: (p) => p,
    onMessage: { addListener: (fn) => msgListeners.push(fn) },
    // 원격 엔진은 백그라운드가 없으므로 실패시킨다 → 내장 엔진 경로만 검증
    async sendMessage(msg) {
      if (msg && msg.type === 'BYCT_TRANSLATE') {
        return { ok: false, error: '테스트 하네스에는 백그라운드가 없습니다', noRetry: true };
      }
      return undefined;
    },
    /** 하네스가 content script에 메시지를 보낼 때 사용 */
    _dispatch(msg) {
      return new Promise((resolve) => {
        let answered = false;
        for (const fn of msgListeners) {
          const r = fn(msg, {}, (resp) => { answered = true; resolve(resp); });
          if (r === true) return;
        }
        if (!answered) resolve(undefined);
      });
    },
  };

  chrome.permissions = {
    async contains() { return false; },
    async request() { return false; },
  };

  // 팝업 미리보기용 (실제 확장에서는 chrome.tabs 를 팝업에서만 쓴다)
  chrome.tabs = {
    async query() {
      return [{ id: 1, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }];
    },
    async sendMessage(id, msg) {
      if (msg && msg.type === 'BYCT_GET_STATUS') {
        return {
          ok: true, onYouTubeWatch: true, total: 24, done: 9, pending: 3, skipped: 12,
          cacheSize: 9, builtinAvailable: true, queue: { running: 2, pending: 1 },
        };
      }
      if (msg && msg.type === 'BYCT_TRANSLATE_VISIBLE') return { ok: true, count: 5 };
      return { ok: true };
    },
  };
  chrome.runtime.openOptionsPage = () => { location.href = 'options.html'; };
})();
