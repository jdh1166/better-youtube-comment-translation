/* 확장 프로그램 밖(일반 웹페이지)에서 content script를 돌리기 위한 chrome.* 목 객체.
   storage는 실제로 동작하는 인메모리 구현이라 설정 변경·캐시 로직까지 그대로 검증된다. */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);

  /* 테스트는 "한국어 사용자" 를 가정한다.
     기본 번역 대상 언어는 이제 브라우저 언어를 따라가므로, 고정하지 않으면
     테스트를 돌리는 기기의 언어 설정에 따라 결과가 달라진다.
     ?target=en / ?ui=en 으로 바꿔 확인할 수 있다. */
  const syncStore = {
    targetLang: params.get('target') || 'ko',
    uiLang: params.get('ui') || 'auto',
  };
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

  // 브라우저 UI 언어. ?uilang=en 으로 바꿔서 테스트할 수 있다.
  const forced = params.get('uilang');
  chrome.i18n = {
    getUILanguage: () => forced || navigator.language || 'en',
  };

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
