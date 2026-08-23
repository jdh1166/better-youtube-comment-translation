/* 옵션 화면: 변경 즉시 저장. */
(function (BYCT) {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const t = (k, p) => BYCT.i18n.t(k, p);

  const BOOLS = [
    'enabled', 'autoTranslate', 'translateReplies', 'skipSameLanguage',
    'showOriginal', 'showEngineBadge', 'hideYoutubeButton', 'autoDownloadModels',
  ];
  const TEXTS = ['deeplKey', 'googleKey', 'llmKey', 'llmEndpoint', 'llmModel'];
  const NUMS = ['minLength', 'concurrency'];
  const SELECTS = ['targetLang', 'engine', 'fallbackEngine', 'uiLang'];

  // ---------- 저장 알림 ----------
  let saveTimer = null;
  function flashSaved() {
    const bar = $('#save-bar');
    bar.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => bar.classList.remove('show'), 1200);
  }

  async function save(patch) {
    await BYCT.settings.set(patch);
    flashSaved();
  }

  // ---------- 셀렉트 채우기 ----------
  /** 언어를 바꾸면 라벨도 다시 그려야 하므로, 선택값을 유지한 채 다시 채운다 */
  function fillSelects() {
    const keep = {};
    for (const id of SELECTS) keep[id] = $('#' + id).value;

    const ui = $('#uiLang');
    ui.textContent = '';
    for (const [code] of BYCT.UI_LANGS) {
      ui.appendChild(new Option(BYCT.i18n.uiLangLabel(code), code));
    }

    const target = $('#targetLang');
    target.textContent = '';
    for (const [code, name] of BYCT.LANGUAGES) {
      target.appendChild(new Option(`${name} (${code})`, code));
    }

    for (const sel of [$('#engine'), $('#fallbackEngine')]) {
      sel.textContent = '';
      for (const id of Object.keys(BYCT.ENGINE_META)) {
        sel.appendChild(new Option(t(`engine.${id}.label`), id));
      }
    }
    $('#fallbackEngine').insertBefore(new Option(t('opt.fallbackNone'), ''),
                                      $('#fallbackEngine').firstChild);

    for (const id of SELECTS) if (keep[id] !== undefined) $('#' + id).value = keep[id];
  }

  function syncEnginePanels() {
    const active = new Set([$('#engine').value, $('#fallbackEngine').value].filter(Boolean));
    for (const panel of $$('.engine-panel')) {
      panel.hidden = !active.has(panel.dataset.engine);
    }
    $('#engine-note').textContent = t(`engine.${$('#engine').value}.note`);
  }

  // ---------- Chrome 내장 번역 상태 ----------
  async function refreshBuiltinStatus() {
    const box = $('#builtin-status');
    box.className = 'notice';

    if (!BYCT.builtinEngine.present()) {
      box.classList.add('notice-error');
      box.textContent = t('opt.noBuiltinApi');
      return;
    }

    const tgt = $('#targetLang').value;
    const tgtName = (BYCT.LANGUAGES.find(([c]) => c === tgt) || [tgt, tgt])[1];
    box.textContent = t('opt.checkingPacks', { lang: tgtName });

    const probes = ['en', 'ja', 'es', 'pt', 'ru'].filter((c) => c !== tgt).slice(0, 4);
    let results;
    try {
      results = await Promise.all(
        probes.map(async (src) => {
          try { return [src, await BYCT.builtinEngine.availability(src, tgt, { fresh: true })]; }
          catch { return [src, 'unknown']; }
        })
      );
    } catch (e) {
      box.classList.add('notice-error');
      box.textContent = t('opt.packCheckFailed', { error: String(e.message || e) });
      return;
    }

    const pickBy = (...want) => results.filter(([, s]) => want.includes(s)).map(([s]) => s);
    const ready = pickBy('available');
    const dl = pickBy('downloadable', 'downloading');
    const no = pickBy('unavailable');
    const unknown = pickBy('unknown');

    const parts = [t('opt.packTarget', { lang: tgtName })];
    if (ready.length) parts.push(t('opt.packReady', { list: ready.join(', ') }));
    if (dl.length) parts.push(t('opt.packDownloadable', { list: dl.join(', ') }));
    if (no.length) parts.push(t('opt.packUnavailable', { list: no.join(', ') }));
    if (unknown.length) parts.push(t('opt.packUnknown', { list: unknown.join(', ') }));

    if (ready.length) box.classList.add('notice-ok');
    else if (unknown.length === results.length) box.classList.add('notice-error');
    box.textContent = parts.join(' · ');
  }

  // ---------- 권한 ----------
  function originsFor(engine) {
    if (engine === 'deepl') {
      return ['https://api-free.deepl.com/*', 'https://api.deepl.com/*'];
    }
    if (engine === 'google') {
      return ['https://translation.googleapis.com/*'];
    }
    if (engine === 'llm') {
      const raw = ($('#llmEndpoint').value || '').trim();
      try { return [new URL(raw).origin + '/*']; }
      catch { return []; }
    }
    return [];
  }

  function setResult(engine, text, cls) {
    const el = $(`[data-result="${engine}"]`);
    if (!el) return;
    el.textContent = text;
    el.className = 'test-result' + (cls ? ' ' + cls : '');
  }

  async function refreshGrantButtons() {
    for (const btn of $$('[data-grant]')) {
      const origins = originsFor(btn.dataset.grant);
      if (!origins.length) { btn.textContent = t('opt.grant'); btn.disabled = true; continue; }
      btn.disabled = false;
      try {
        const granted = await chrome.permissions.contains({ origins });
        btn.textContent = granted ? t('opt.granted') : t('opt.grant');
        btn.disabled = granted;
      } catch {
        btn.textContent = t('opt.grant');
      }
    }
  }

  // ---------- 연결 테스트 ----------
  async function testEngine(engine) {
    setResult(engine, t('opt.testing'));
    const res = await chrome.runtime.sendMessage({
      type: 'BYCT_TRANSLATE',
      engine,
      texts: ['Hello, this is a test.'],
      sourceLanguage: 'en',
      targetLanguage: $('#targetLang').value,
    });
    if (res && res.ok) {
      setResult(engine, t('opt.testOk', { text: String(res.texts[0]).slice(0, 60) }), 'ok');
    } else {
      setResult(engine, (res && res.error) || t('opt.testFail'), 'err');
    }
  }

  // ---------- 캐시 ----------
  async function refreshCacheInfo() {
    try {
      const obj = await chrome.storage.local.get('byct_cache_v1');
      const n = Array.isArray(obj.byct_cache_v1) ? obj.byct_cache_v1.length : 0;
      const bytes = await chrome.storage.local.getBytesInUse('byct_cache_v1').catch(() => 0);
      $('#cache-info').textContent = t('opt.cacheInfo', { n, kb: (bytes / 1024).toFixed(0) });
    } catch {
      $('#cache-info').textContent = '';
    }
  }

  /** 화면 언어가 바뀌면 정적 문구와 동적으로 채운 것 모두 다시 그린다 */
  function relocalize() {
    BYCT.i18n.applyDom();
    fillSelects();
    syncEnginePanels();
    refreshGrantButtons();
    refreshCacheInfo();
    refreshBuiltinStatus();
  }

  // ---------- 초기화 ----------
  async function init() {
    const cfg = await BYCT.settings.get();
    BYCT.i18n.setLang(cfg.uiLang);
    BYCT.i18n.applyDom();

    fillSelects();

    if (new URLSearchParams(location.search).get('welcome')) {
      $('#welcome').hidden = false;
    }

    for (const id of BOOLS) $('#' + id).checked = !!cfg[id];
    for (const id of TEXTS) $('#' + id).value = cfg[id] || '';
    for (const id of NUMS) $('#' + id).value = cfg[id];
    for (const id of SELECTS) $('#' + id).value = cfg[id] || '';

    syncEnginePanels();
    refreshBuiltinStatus();
    refreshGrantButtons();
    refreshCacheInfo();

    // 변경 → 즉시 저장
    for (const id of BOOLS) {
      $('#' + id).addEventListener('change', (e) => save({ [id]: e.target.checked }));
    }
    for (const id of TEXTS) {
      $('#' + id).addEventListener('change', (e) => {
        save({ [id]: e.target.value.trim() });
        if (id === 'llmEndpoint') refreshGrantButtons();
      });
    }
    for (const id of NUMS) {
      $('#' + id).addEventListener('change', (e) => {
        const min = Number(e.target.min), max = Number(e.target.max);
        let v = Math.round(Number(e.target.value) || min);
        v = Math.max(min, Math.min(max, v));
        e.target.value = v;
        save({ [id]: v });
      });
    }

    $('#uiLang').addEventListener('change', (e) => {
      save({ uiLang: e.target.value });
      BYCT.i18n.setLang(e.target.value);
      relocalize();
    });
    $('#targetLang').addEventListener('change', (e) => {
      save({ targetLang: e.target.value });
      refreshBuiltinStatus();
    });
    $('#engine').addEventListener('change', (e) => {
      save({ engine: e.target.value });
      syncEnginePanels();
      refreshGrantButtons();
    });
    $('#fallbackEngine').addEventListener('change', (e) => {
      save({ fallbackEngine: e.target.value });
      syncEnginePanels();
      refreshGrantButtons();
    });

    // 권한 요청은 반드시 클릭 핸들러 안에서 직접 호출해야 한다 (사용자 제스처 필요)
    for (const btn of $$('[data-grant]')) {
      btn.addEventListener('click', async () => {
        const engine = btn.dataset.grant;
        const origins = originsFor(engine);
        if (!origins.length) {
          setResult(engine, t('opt.needEndpointFirst'), 'err');
          return;
        }
        try {
          const granted = await chrome.permissions.request({ origins });
          setResult(engine, t(granted ? 'opt.permGranted' : 'opt.permDenied'),
                    granted ? 'ok' : 'err');
        } catch (e) {
          setResult(engine, String(e.message || e), 'err');
        }
        refreshGrantButtons();
      });
    }

    for (const btn of $$('[data-test]')) {
      btn.addEventListener('click', () => testEngine(btn.dataset.test));
    }

    // 감지 모델 다운로드도 사용자 제스처가 필요하므로 클릭 핸들러에서 바로 호출한다
    $('#warmup-detector').addEventListener('click', async () => {
      const out = $('#detector-result');
      const btn = $('#warmup-detector');
      if (!BYCT.langdetect.apiPresent()) {
        out.textContent = t('opt.detectorUnavailable');
        out.className = 'test-result err';
        return;
      }
      btn.disabled = true;
      out.textContent = t('opt.detectorPreparing');
      out.className = 'test-result';
      const ok = await BYCT.langdetect.warmup();
      btn.disabled = false;
      if (ok) {
        const r = await BYCT.langdetect.detect('This is an English sentence for verification.');
        out.textContent = t('opt.detectorReady', { lang: r.detectedLanguage, source: r.source });
        out.className = 'test-result ok';
      } else {
        out.textContent = t('opt.detectorFailed');
        out.className = 'test-result err';
      }
    });

    $('#clear-cache').addEventListener('click', async () => {
      await chrome.storage.local.remove('byct_cache_v1');
      refreshCacheInfo();
      flashSaved();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(globalThis.BYCT);
