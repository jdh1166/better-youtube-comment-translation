/* 팝업: 자주 쓰는 설정만 빠르게 바꾸고, 현재 탭의 번역 상태를 보여준다. */
(function (BYCT) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const t = (k, p) => BYCT.i18n.t(k, p);
  let tabId = null;

  function fillSelects() {
    const lang = $('targetLang');
    lang.textContent = '';
    for (const [code, name] of BYCT.LANGUAGES) {
      lang.appendChild(new Option(`${name} (${code})`, code));
    }
    const eng = $('engine');
    eng.textContent = '';
    for (const id of Object.keys(BYCT.ENGINE_META)) {
      eng.appendChild(new Option(t(`engine.${id}.label`), id));
    }
  }

  function updateEngineNote() {
    $('engine-note').textContent = t(`engine.${$('engine').value}.note`);
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

  /** 통계 줄. 숫자만 <b>로 감싸므로 innerHTML 대신 노드로 조립한다. */
  function renderStats(parts, warning) {
    const box = $('stats');
    box.textContent = '';
    parts.forEach((text, i) => {
      if (i) box.appendChild(document.createTextNode(' · '));
      box.appendChild(document.createTextNode(text));
    });
    if (warning) {
      box.appendChild(document.createElement('br'));
      const w = document.createElement('span');
      w.style.color = 'var(--danger)';
      w.textContent = warning;
      box.appendChild(w);
    }
  }

  async function refreshStats() {
    const s = await ask({ type: 'BYCT_GET_STATUS' });
    if (!s || !s.ok) {
      renderStats([t('popup.needsReload')]);
      return;
    }
    const parts = [t('popup.statsSeen', { n: s.total })];
    if (s.done) parts.push(t('popup.statsDone', { n: s.done }));
    if (s.skipped) parts.push(t('popup.statsSkipped', { n: s.skipped }));
    if (s.queue && (s.queue.running || s.queue.pending)) {
      parts.push(t('popup.statsRunning', { n: s.queue.running + s.queue.pending }));
    }
    renderStats(parts, s.builtinAvailable ? null : t('popup.noBuiltin'));
  }

  async function init() {
    const cfg = await BYCT.settings.get();
    BYCT.i18n.setLang(cfg.uiLang);
    BYCT.i18n.applyDom();

    fillSelects();
    $('version').textContent = 'v' + BYCT.VERSION;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const onYT = tab && /^https:\/\/(www|m)\.youtube\.com\//.test(tab.url || '');
    tabId = onYT ? tab.id : null;
    $('not-youtube').hidden = !!onYT;

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
      if (BYCT.ENGINE_META[e.target.value].needsKey) {
        renderStats([], t('popup.needsKey'));
      }
    });

    $('translate-now').addEventListener('click', async () => {
      const btn = $('translate-now');
      btn.disabled = true;
      const r = await ask({ type: 'BYCT_TRANSLATE_VISIBLE' });
      btn.disabled = false;
      if (!r) { renderStats([t('popup.reloadRetry')]); return; }
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
