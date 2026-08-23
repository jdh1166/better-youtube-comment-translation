/* 옵션 화면: 변경 즉시 저장. */
(function (BYCT) {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const BOOLS = [
    'enabled', 'autoTranslate', 'translateReplies', 'skipSameLanguage',
    'showOriginal', 'showEngineBadge', 'hideYoutubeButton', 'autoDownloadModels',
  ];
  const TEXTS = ['deeplKey', 'googleKey', 'llmKey', 'llmEndpoint', 'llmModel'];
  const NUMS = ['minLength', 'concurrency'];
  const SELECTS = ['targetLang', 'engine', 'fallbackEngine'];

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
  function fillSelects() {
    for (const [code, name] of BYCT.LANGUAGES) {
      $('#targetLang').appendChild(new Option(`${name} (${code})`, code));
    }
    for (const [id, meta] of Object.entries(BYCT.ENGINE_META)) {
      $('#engine').appendChild(new Option(meta.label, id));
      $('#fallbackEngine').appendChild(new Option(meta.label, id));
    }
    $('#fallbackEngine').insertBefore(new Option('사용 안 함', ''), $('#fallbackEngine').firstChild);
  }

  function syncEnginePanels() {
    const active = new Set([$('#engine').value, $('#fallbackEngine').value].filter(Boolean));
    for (const panel of $$('.engine-panel')) {
      panel.hidden = !active.has(panel.dataset.engine);
    }
    const meta = BYCT.ENGINE_META[$('#engine').value];
    $('#engine-note').textContent = meta ? meta.note : '';
  }

  // ---------- Chrome 내장 번역 상태 ----------
  async function refreshBuiltinStatus() {
    const box = $('#builtin-status');
    box.className = 'notice';

    if (!BYCT.builtinEngine.present()) {
      box.classList.add('notice-error');
      box.textContent = '이 브라우저에서는 Chrome 내장 번역 API를 쓸 수 없습니다. '
        + 'Chrome 138 이상 데스크톱 버전이 필요합니다. DeepL이나 Google 엔진을 사용해주세요.';
      return;
    }

    const tgt = $('#targetLang').value;
    const tgtName = (BYCT.LANGUAGES.find(([c]) => c === tgt) || [tgt, tgt])[1];
    box.textContent = `${tgtName} 언어팩 상태를 확인하는 중…`;

    // 대표적인 원문 언어 몇 개만 확인
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
      box.textContent = '언어팩 상태를 확인하지 못했습니다: ' + String(e.message || e);
      return;
    }

    const pickBy = (...want) => results.filter(([, s]) => want.includes(s)).map(([s]) => s);
    const ready = pickBy('available');
    const dl = pickBy('downloadable', 'downloading');
    const no = pickBy('unavailable');
    const unknown = pickBy('unknown');

    const parts = [`번역 대상: ${tgtName}`];
    if (ready.length) parts.push(`바로 번역 가능: ${ready.join(', ')}`);
    if (dl.length) parts.push(`다운로드 필요: ${dl.join(', ')} (유튜브에서 번역 버튼을 누르면 받습니다)`);
    if (no.length) parts.push(`직접 지원 안 됨: ${no.join(', ')} (영어 경유로 시도합니다)`);
    if (unknown.length) {
      parts.push(`상태 확인 실패: ${unknown.join(', ')} — 브라우저가 응답하지 않았습니다. `
        + '번역 자체는 시도해볼 수 있지만, 계속 실패하면 DeepL이나 Google 엔진을 쓰세요.');
    }

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
      const engine = btn.dataset.grant;
      const origins = originsFor(engine);
      if (!origins.length) { btn.textContent = '권한 허용'; btn.disabled = true; continue; }
      btn.disabled = false;
      try {
        const granted = await chrome.permissions.contains({ origins });
        btn.textContent = granted ? '권한 허용됨 ✓' : '권한 허용';
        btn.disabled = granted;
      } catch {
        btn.textContent = '권한 허용';
      }
    }
  }

  // ---------- 연결 테스트 ----------
  async function testEngine(engine) {
    setResult(engine, '테스트 중…');
    const res = await chrome.runtime.sendMessage({
      type: 'BYCT_TRANSLATE',
      engine,
      texts: ['Hello, this is a test.'],
      sourceLanguage: 'en',
      targetLanguage: $('#targetLang').value,
    });
    if (res && res.ok) {
      setResult(engine, '성공: ' + String(res.texts[0]).slice(0, 60), 'ok');
    } else {
      setResult(engine, (res && res.error) || '실패', 'err');
    }
  }

  // ---------- 캐시 ----------
  async function refreshCacheInfo() {
    try {
      const obj = await chrome.storage.local.get('byct_cache_v1');
      const n = Array.isArray(obj.byct_cache_v1) ? obj.byct_cache_v1.length : 0;
      const bytes = await chrome.storage.local.getBytesInUse('byct_cache_v1').catch(() => 0);
      $('#cache-info').textContent = `저장된 번역 ${n}개 (${(bytes / 1024).toFixed(0)} KB)`;
    } catch {
      $('#cache-info').textContent = '';
    }
  }

  // ---------- 초기화 ----------
  async function init() {
    fillSelects();

    if (new URLSearchParams(location.search).get('welcome')) {
      $('#welcome').hidden = false;
    }

    const cfg = await BYCT.settings.get();

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
          setResult(engine, '엔드포인트 URL을 먼저 입력해주세요.', 'err');
          return;
        }
        try {
          const granted = await chrome.permissions.request({ origins });
          setResult(engine, granted ? '권한이 허용되었습니다.' : '권한이 거부되었습니다.', granted ? 'ok' : 'err');
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
        out.textContent = '이 브라우저에서는 사용할 수 없습니다.';
        out.className = 'test-result err';
        return;
      }
      btn.disabled = true;
      out.textContent = '준비 중… (모델을 내려받는 중이면 몇 분 걸릴 수 있습니다)';
      out.className = 'test-result';
      const ok = await BYCT.langdetect.warmup();
      btn.disabled = false;
      if (ok) {
        const r = await BYCT.langdetect.detect('This is an English sentence for verification.');
        out.textContent = `준비 완료 (테스트 감지: ${r.detectedLanguage}, 방식: ${r.source})`;
        out.className = 'test-result ok';
      } else {
        out.textContent = '준비 실패 — 추정 방식으로 동작합니다.';
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
