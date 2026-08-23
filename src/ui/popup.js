/* 팝업: 자주 쓰는 설정만 빠르게 바꾸고, 현재 탭의 번역 상태를 보여준다. */
(function (BYCT) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let tabId = null;

  function fillSelects() {
    const lang = $('targetLang');
    for (const [code, name] of BYCT.LANGUAGES) {
      lang.appendChild(new Option(`${name} (${code})`, code));
    }
    const eng = $('engine');
    for (const [id, meta] of Object.entries(BYCT.ENGINE_META)) {
      eng.appendChild(new Option(meta.label, id));
    }
  }

  function updateEngineNote() {
    const meta = BYCT.ENGINE_META[$('engine').value];
    $('engine-note').textContent = meta ? meta.note : '';
  }

  /** content script에 메시지를 보낸다. 로드되어 있지 않으면 null 반환. */
  async function ask(msg) {
    if (tabId == null) return null;
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch {
      return null;
    }
  }

  async function refreshStats() {
    const s = await ask({ type: 'BYCT_GET_STATUS' });
    const box = $('stats');
    if (!s || !s.ok) {
      box.textContent = '페이지를 새로고침하면 상태가 표시됩니다.';
      return;
    }
    const parts = [`인식한 댓글 <b>${s.total}</b>개`];
    if (s.done) parts.push(`번역 완료 <b>${s.done}</b>`);
    if (s.skipped) parts.push(`건너뜀 <b>${s.skipped}</b>`);
    if (s.queue && (s.queue.running || s.queue.pending)) {
      parts.push(`진행 중 <b>${s.queue.running + s.queue.pending}</b>`);
    }
    box.innerHTML = parts.join(' · ');
    if (!s.builtinAvailable) {
      box.innerHTML += '<br><span style="color:var(--danger)">이 브라우저에서 Chrome 내장 번역을 쓸 수 없습니다 (Chrome 138+ 데스크톱 필요)</span>';
    }
  }

  async function init() {
    fillSelects();
    $('version').textContent = 'v' + BYCT.VERSION;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const onYT = tab && /^https:\/\/(www|m)\.youtube\.com\//.test(tab.url || '');
    tabId = onYT ? tab.id : null;
    $('not-youtube').hidden = !!onYT;

    const cfg = await BYCT.settings.get();
    $('autoTranslate').checked = cfg.autoTranslate;
    $('targetLang').value = cfg.targetLang;
    $('engine').value = cfg.engine;
    updateEngineNote();

    $('autoTranslate').addEventListener('change', (e) => {
      BYCT.settings.set({ autoTranslate: e.target.checked });
    });
    $('targetLang').addEventListener('change', (e) => {
      BYCT.settings.set({ targetLang: e.target.value });
    });
    $('engine').addEventListener('change', (e) => {
      BYCT.settings.set({ engine: e.target.value });
      updateEngineNote();
      const meta = BYCT.ENGINE_META[e.target.value];
      if (meta && meta.needsKey) {
        $('stats').innerHTML =
          '<span style="color:var(--danger)">이 엔진은 API 키가 필요합니다 — 전체 설정에서 입력해주세요.</span>';
      }
    });

    $('translate-now').addEventListener('click', async () => {
      const btn = $('translate-now');
      btn.disabled = true;
      const r = await ask({ type: 'BYCT_TRANSLATE_VISIBLE' });
      btn.disabled = false;
      if (!r) {
        $('stats').textContent = '페이지를 새로고침한 뒤 다시 시도해주세요.';
        return;
      }
      setTimeout(refreshStats, 400);
    });

    const openOptions = () => chrome.runtime.openOptionsPage();
    $('open-options').addEventListener('click', openOptions);
    $('open-options-2').addEventListener('click', openOptions);

    if (onYT) {
      refreshStats();
      setInterval(refreshStats, 1500);
    } else {
      $('main-panel').style.opacity = '0.5';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.BYCT);
