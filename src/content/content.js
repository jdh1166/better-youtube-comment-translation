/* 메인 오케스트레이터.
   댓글 탐지 → 언어 감지 → 번역 → 렌더링 파이프라인과, 유튜브 SPA 특유의 문제들
   (무한 스크롤, 노드 재활용, 부분 재렌더, 페이지 전환)을 처리한다. */
(function (BYCT) {
  'use strict';

  // 이 컨텍스트는 API 키를 알 필요가 없다. settings 가 값을 지우고 넘겨준다.
  BYCT.stripSecrets = true;

  const { ytdom, ui, cache, langdetect, builtinEngine, settings, util } = BYCT;
  const { sameLang, debounce, normalizeLang } = util;
  const t = (k, params) => BYCT.i18n.t(k, params);

  /** comment element -> 처리 레코드 */
  const records = new Map();
  const queue = BYCT.createQueue(3);
  let io = null;                 // IntersectionObserver
  let mo = null;                 // MutationObserver
  let tick = null;               // 안전망 인터벌
  let started = false;
  let cfg = { ...BYCT.DEFAULTS };

  const isTrivial = (text) => BYCT.isTrivialText(text, cfg.minLength);

  // ---------- 원격 엔진 배치 처리 ----------
  // 댓글 하나당 API 요청 하나는 낭비이자 rate limit 유발.
  // 짧은 시간(180ms) 안에 모인 요청을 언어쌍별로 묶어서 한 번에 보낸다.

  const batchBuf = new Map();    // "engine|src>tgt" -> [{text, resolve, reject}]
  let batchTimer = null;
  let flightCount = 0;
  const MAX_FLIGHT = 2;

  function remoteTranslate(engine, text, src, tgt) {
    return new Promise((resolve, reject) => {
      const k = `${engine}|${src}>${tgt}`;
      if (!batchBuf.has(k)) batchBuf.set(k, []);
      batchBuf.get(k).push({ text, resolve, reject });
      scheduleFlush();
    });
  }

  function scheduleFlush() {
    if (batchTimer) return;
    batchTimer = setTimeout(() => { batchTimer = null; flushBatches(); }, 180);
  }

  async function flushBatches() {
    if (flightCount >= MAX_FLIGHT) { scheduleFlush(); return; }
    const entry = batchBuf.entries().next();
    if (entry.done) return;

    const [key, items] = entry.value;
    batchBuf.delete(key);
    const [engine, pair] = key.split('|');
    const [src, tgt] = pair.split('>');

    // 같은 문장이 여러 번 들어오면 한 번만 보낸다
    const uniq = [];
    const indexOf = new Map();
    for (const it of items) {
      if (!indexOf.has(it.text)) { indexOf.set(it.text, uniq.length); uniq.push(it.text); }
    }

    flightCount++;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'BYCT_TRANSLATE',
        engine,
        texts: uniq,
        sourceLanguage: src === 'und' ? '' : src,
        targetLanguage: tgt,
      });
      if (!res || !res.ok) {
        const err = Object.assign(new Error((res && res.error) || t('err.noBackground')), {
          __code: res && res.code, __noRetry: res && res.noRetry,
        });
        items.forEach((it) => it.reject(err));
      } else {
        items.forEach((it) => {
          const i = indexOf.get(it.text);
          it.resolve({
            text: res.texts[i],
            detected: (res.detected && res.detected[i]) || src,
          });
        });
      }
    } catch (e) {
      items.forEach((it) => it.reject(e));
    } finally {
      flightCount--;
      if (batchBuf.size) scheduleFlush();
    }
  }

  // ---------- 엔진 호출 ----------

  const engineLabel = (id) => BYCT.ENGINE_SHORT[id] || id;

  async function callEngine(engineId, text, src, tgt, comment) {
    if (engineId === 'builtin') {
      const r = await builtinEngine.translate(text, {
        sourceLanguage: src,
        targetLanguage: tgt,
        onProgress: (loaded) => {
          const rec = comment && records.get(comment);
          if (rec) setState(comment, rec, 'downloading', { progress: loaded });
        },
      });
      // via.length === 3 이면 영어를 경유한 2단계 번역이라 품질이 떨어진다
      return { text: r.text, detected: src, engine: 'builtin', via: r.via };
    }
    const r = await remoteTranslate(engineId, text, src, tgt);
    return { text: r.text, detected: r.detected || src, engine: engineId };
  }

  /* 번역기에 넣으면 안 되는 토큰(@멘션, URL, :이모지:, 타임스탬프)을 가리고 번역한 뒤
     되돌린다. 자리표시자가 번역 과정에서 사라지면 마스킹 없이 한 번 더 시도한다 —
     엉뚱하게 복원된 문장보다는 원래 동작이 낫다. */
  async function runEngine(engineId, text, src, tgt, comment) {
    const masked = BYCT.protect.mask(text);
    if (!masked.tokens.length) return callEngine(engineId, text, src, tgt, comment);

    const r = await callEngine(engineId, masked.text, src, tgt, comment);
    const restored = BYCT.protect.restore(r.text, masked.tokens);
    if (restored.complete) return { ...r, text: restored.text };

    console.warn('[BYCT] placeholders lost in translation, retrying without masking');
    return callEngine(engineId, text, src, tgt, comment);
  }

  // ---------- 렌더링 ----------

  /** "원문 함께 보기"가 꺼져 있고 번역이 표시 중이면 원문을 숨긴다 */
  function applyOriginalVisibility(comment, rec) {
    const hide = !cfg.showOriginal && rec.state === 'done' && rec.showing;
    comment.classList.toggle('byct-hide-original', hide);
  }

  /* 레코드 상태 → 화면. 상태 변경 지점마다 setState 를 흩어놓으면
     유튜브가 댓글을 다시 그려 UI가 날아갔을 때 복구할 방법이 없다.
     항상 여기 한 곳을 거치게 해서 언제든 현재 상태로 다시 그릴 수 있게 한다. */
  function paint(comment, rec) {
    if (rec.trivial) return;

    /* 번역이 필요 없거나(같은 언어) 아직 언어 판정 전이면 아무것도 남기지 않는다.
       버튼만 hidden 으로 감추고 컨테이너를 두면 .byct-root 마진 + .byct-row 최소높이만큼
       (약 32px) 빈 자리가 남아서, 한국어 사용자가 한국어 댓글을 볼 때 댓글마다 구멍이 뚫린다. */
    if (rec.state === 'new' || rec.state === 'skipped') {
      ui.unmount(comment);
      return;
    }

    switch (rec.state) {
      case 'done':
        applyOriginalVisibility(comment, rec);
        ui.setState(comment, 'done', {
          text: rec.translated,
          detected: rec.detected,
          target: cfg.targetLang,
          engineLabel: engineLabel(rec.engine),
          pivot: rec.pivot,
          showBadge: cfg.showEngineBadge,
          showing: rec.showing,
        });
        break;
      case 'loading':
        ui.setState(comment, 'loading');
        break;
      case 'downloading':
        ui.setState(comment, 'downloading', { progress: rec.progress || 0 });
        break;
      case 'needs-download':
        ui.setState(comment, 'needs-download', { detected: rec.detected });
        break;
      case 'error':
        ui.setState(comment, 'error', { message: rec.error || t('status.failed') });
        break;
      case 'skipped':
        ui.setState(comment, 'skipped');
        break;
      case 'new':
        ui.setState(comment, 'pending');
        break;
      default:
        ui.setState(comment, 'idle', { detected: rec.detected });
        break;
    }
    bindUI(comment);
  }

  function setState(comment, rec, state, extra) {
    rec.state = state;
    if (extra) Object.assign(rec, extra);
    paint(comment, rec);
  }

  // ---------- 번역 ----------

  async function translateComment(comment, { userGesture = false, priority = 0 } = {}) {
    const rec = records.get(comment);
    if (!rec || rec.skip || rec.trivial) return;

    // 이미 번역된 상태에서 버튼을 누르면 원문/번역 토글
    if (rec.state === 'done') {
      rec.showing = !rec.showing;
      paint(comment, rec);
      return;
    }
    if (rec.state === 'loading' || rec.state === 'downloading') return;

    const src = rec.detected && rec.detected !== 'und' ? rec.detected : 'und';
    const tgt = cfg.targetLang;
    const primary = cfg.engine;

    // 1) 캐시 확인
    for (const eng of [primary, cfg.fallbackEngine].filter(Boolean)) {
      const hit = cache.get(eng, src, tgt, rec.text);
      if (hit) {
        setState(comment, rec, 'done',
          { translated: hit, detected: src, engine: eng, showing: true });
        return;
      }
    }

    // 2) 내장 엔진 사전 점검
    if (primary === 'builtin') {
      // 내장 엔진은 원문 언어를 명시해야 한다(auto 미지원).
      // 감지에 실패했다면 자동 감지가 되는 원격 엔진에게 넘긴다.
      if (src === 'und') {
        if (cfg.fallbackEngine) {
          return translateWith(comment, rec, cfg.fallbackEngine, 'und', tgt, priority);
        }
        setState(comment, rec, 'error', { error: t('err.unknownSource') });
        return;
      }
      const route = await builtinEngine.resolveRoute(src, tgt);
      if (!records.has(comment) || records.get(comment) !== rec) return;   // 그 사이 재활용됨
      if (route.status === 'unavailable') {
        if (cfg.fallbackEngine) {
          return translateWith(comment, rec, cfg.fallbackEngine, src, tgt, priority);
        }
        setState(comment, rec, 'error', {
          error: t('err.pairUnavailable', { src: ui.langLabel(src), tgt: ui.langLabel(tgt) }),
        });
        return;
      }
      const activated = userGesture
        || (navigator.userActivation && navigator.userActivation.isActive);
      if (route.status === 'downloadable' && !activated && !cfg.autoDownloadModels) {
        setState(comment, rec, 'needs-download');
        return;
      }
    }

    return translateWith(comment, rec, primary, src, tgt, priority);
  }

  function queueKey(engineId, src, tgt, text) {
    return `${engineId}|${src}>${tgt}|${util.hash(text)}|${text.length}`;
  }

  async function translateWith(comment, rec, engineId, src, tgt, priority) {
    setState(comment, rec, 'loading');

    const key = queueKey(engineId, src, tgt, rec.text);
    rec.queueKey = key;
    try {
      const r = await queue.push(key, () => runEngine(engineId, rec.text, src, tgt, comment), priority);
      if (records.get(comment) !== rec) return;   // 그 사이 재활용됨

      // 번역 결과가 원문과 같으면 굳이 보여줄 필요 없음
      if (!r.text || r.text.trim() === rec.text.trim()) {
        rec.skip = true;
        setState(comment, rec, 'skipped');
        return;
      }
      cache.set(engineId, src, tgt, rec.text, r.text);
      setState(comment, rec, 'done', {
        translated: r.text,
        detected: normalizeLang(r.detected) || src,
        engine: engineId,
        pivot: r.via && r.via.length === 3 ? r.via[1] : null,
        showing: true,
      });
    } catch (e) {
      if (records.get(comment) !== rec) return;
      if (e && e.__cancelled) { setState(comment, rec, 'idle'); return; }

      // 기본 엔진이 실패하면 대체 엔진으로 한 번 더
      if (engineId === cfg.engine && cfg.fallbackEngine && cfg.fallbackEngine !== engineId) {
        console.warn('[BYCT] primary engine failed, trying fallback:', e && e.message);
        return translateWith(comment, rec, cfg.fallbackEngine, src, tgt, priority);
      }
      const msg = String((e && e.message) || e);
      setState(comment, rec, 'error', { error: msg.slice(0, 160) });
      if (e && (e.__code === 'NO_KEY' || e.__code === 'AUTH' || e.__code === 'NO_PERMISSION')) {
        notifyOnce(e.__code, msg);
      }
    }
  }

  const notified = new Set();
  function notifyOnce(code, msg) {
    if (notified.has(code)) return;
    notified.add(code);
    ui.toast(msg, 5000);
  }

  // ---------- 댓글 발견 & 동기화 ----------

  function bindUI(comment) {
    ui.onClick(comment, () => {
      const r = records.get(comment);
      if (!r) return;
      if (r.state === 'error') r.state = 'idle';
      maybeWarmupDetector(r);
      translateComment(comment, { userGesture: true, priority: 100 });
    });
  }

  /* 유튜브가 댓글 내부를 다시 그리면 우리가 넣은 노드도 같이 날아간다.
     텍스트가 그대로라 재활용으로도 잡히지 않으므로 UI 존재 여부를 따로 확인해 복구한다. */
  function ensureUI(comment, rec) {
    if (rec.trivial) return;
    if (rec.state === 'new' || rec.state === 'skipped') return;   // UI 가 없는 게 정상
    const v = ui.get(comment);
    if (v && v.root.isConnected) return;
    paint(comment, rec);
  }

  /** 새 댓글 / 재활용된 노드 / 재렌더로 UI가 날아간 노드를 모두 처리 */
  function syncComment(comment) {
    const text = ytdom.extractText(comment);
    const existing = records.get(comment);

    if (existing) {
      if (existing.text === text) { ensureUI(comment, existing); return existing; }
      // 노드 재활용 → 이전 상태 폐기하고 새 댓글로 취급
      ui.unmount(comment);
      records.delete(comment);
    }

    if (!cfg.enabled) return null;

    /* 번역 대상이 아닌 댓글도 레코드에 남긴다. 이유가 두 가지:
       1) 남기지 않으면 스캔할 때마다 텍스트를 다시 추출해 같은 판정을 반복한다.
       2) 안전망 틱이 "댓글 노드 수 == 레코드 수"로 누락을 감지하는데,
          빼먹으면 영원히 개수가 안 맞아 매번 전체 스캔을 돌게 된다. */
    const ignore = (!cfg.translateReplies && ytdom.isReply(comment)) || isTrivial(text);
    if (ignore) {
      records.set(comment, { comment, text, trivial: true, skip: true, state: 'skipped' });
      return null;
    }

    const rec = { comment, text, detected: null, state: 'new', skip: false, visible: undefined };
    records.set(comment, rec);

    if (cfg.hideYoutubeButton) ytdom.setYoutubeButtonHidden(comment, true);

    // 언어 감지가 끝나기 전까지는 UI를 노출하지 않는다 (paint 가 처리)
    paint(comment, rec);

    if (io) io.observe(comment);
    detectLater(comment, rec);
    return rec;
  }

  /* 감지 모델도 다운로드에 사용자 제스처가 필요하다. 하지만 번역 모델 다운로드와
     같은 제스처를 두고 경쟁하면 안 되므로, 해당 언어쌍이 이미 'available'로 확인돼
     번역 쪽이 제스처를 쓸 필요가 없을 때만 곁다리로 준비한다. */
  let warmupTried = false;
  function maybeWarmupDetector(rec) {
    if (warmupTried || !rec || rec.detectSource === 'api') return;
    if (cfg.engine !== 'builtin') return;
    if (builtinEngine.cachedAvailability(rec.detected, cfg.targetLang) !== 'available') return;
    warmupTried = true;
    langdetect.warmup().catch(() => {});
  }

  // 언어 감지는 빠르지만 수백 개가 동시에 몰리면 부담 → 작은 큐로 흘린다
  const detectQueue = BYCT.createQueue(6);
  function detectLater(comment, rec) {
    detectQueue.push(`det:${util.hash(rec.text)}:${rec.text.length}`,
      () => langdetect.detect(rec.text)
    ).then(({ detectedLanguage: lang, source }) => {
      if (records.get(comment) !== rec) return;   // 그 사이 재활용됨
      rec.detected = lang;
      rec.detectSource = source;

      if (cfg.skipSameLanguage && sameLang(lang, cfg.targetLang)) {
        rec.skip = true;
        setState(comment, rec, 'skipped');
        return;
      }
      if (rec.state === 'new') setState(comment, rec, 'idle');
      if (cfg.autoTranslate && isVisible(comment)) {
        translateComment(comment, { priority: 50 });
      }
    }).catch(() => {
      // 감지에 실패해도 수동 번역은 할 수 있게 버튼을 띄운다
      if (records.get(comment) !== rec) return;
      setState(comment, rec, 'idle');
    });
  }

  /* IntersectionObserver 가 알려준 값을 쓴다.
     getBoundingClientRect() 를 댓글마다 부르면 강제 리플로가 수백 번 발생한다. */
  function isVisible(comment) {
    const rec = records.get(comment);
    if (rec && rec.visible !== undefined) return rec.visible;
    const r = comment.getBoundingClientRect();
    return r.bottom > -200 && r.top < window.innerHeight + 600;
  }

  // ---------- 스캔 ----------

  /* 예전에는 DOM 이 바뀔 때마다 전체 재스캔을 돌렸는데, 댓글 수백 개마다
     extractText(DOM 순회)를 250ms 간격으로 반복하는 셈이라 스크롤이 무거웠다.
     이제는 MutationRecord 를 보고 실제로 바뀐 댓글만 다시 본다. */
  const dirty = new Set();

  function onMutations(muts) {
    for (const m of muts) {
      // 우리가 넣은 노드가 만든 변경은 무시 (안 그러면 스스로를 계속 깨운다)
      const target = m.target;
      const tEl = target && target.nodeType === 1 ? target : (target && target.parentElement);
      if (tEl && tEl.closest && tEl.closest('.byct-root')) continue;

      if (m.addedNodes && m.addedNodes.length) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains('byct-root')) continue;
          for (const c of ytdom.allComments(n)) dirty.add(c);
        }
      }
      const host = ytdom.hostComment(target);
      if (host) dirty.add(host);
    }
    if (dirty.size) flushDirty();
  }

  const flushDirty = debounce(() => {
    if (!cfg.enabled) return;
    const nodes = [...dirty];
    dirty.clear();
    for (const c of nodes) {
      if (!c.isConnected) continue;
      try { syncComment(c); } catch (e) { console.error('[BYCT] syncComment failed', e); }
    }
    pruneDetached();
  }, 200);

  /** 전체 스캔 (최초 1회 + 안전망) */
  function scanAll() {
    if (!cfg.enabled) return;
    const root = ytdom.commentsRoot() || document;
    for (const c of ytdom.allComments(root)) {
      try { syncComment(c); } catch (e) { console.error('[BYCT] syncComment failed', e); }
    }
    pruneDetached();
  }

  /* DOM 에서 떨어져 나간 레코드를 버린다.
     isConnected 는 속성 읽기라 싸다. 평소에는 레코드가 많이 쌓였을 때만 돌리고,
     안전망 틱은 개수를 비교하기 전에 반드시 force 로 한 번 정리한다 —
     떨어진 레코드가 남아 있으면 개수가 영원히 안 맞아서 매번 전체 스캔을 하게 된다. */
  function pruneDetached(force) {
    if (!force && records.size < 300) return;
    for (const c of [...records.keys()]) {
      if (!c.isConnected) records.delete(c);
    }
  }

  // ---------- 관찰자 ----------

  function setupObservers() {
    if (io) io.disconnect();
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const rec = records.get(e.target);
        if (!rec) continue;
        rec.visible = e.isIntersecting;
        if (!e.isIntersecting || rec.skip || rec.trivial) continue;

        // 대기 중인 번역이 있으면 우선순위를 올린다
        if (rec.state === 'loading' && rec.queueKey) queue.bump(rec.queueKey, 80);
        if (cfg.autoTranslate && rec.state === 'idle' && rec.detected) {
          translateComment(e.target, { priority: 60 });
        }
      }
    }, { rootMargin: '400px 0px' });

    // 이미 알고 있는 댓글도 새 observer 에 다시 등록해야 한다
    for (const [c, rec] of records) {
      if (!rec.trivial && c.isConnected) io.observe(c);
    }

    if (mo) mo.disconnect();
    const target = ytdom.commentsRoot() || document.body;
    mo = new MutationObserver(onMutations);
    mo.observe(target, { childList: true, subtree: true, characterData: true });
  }

  /** 댓글 섹션이 아직 없으면 생길 때까지 기다린다 */
  function waitForComments(tries = 0) {
    if (ytdom.commentsRoot()) {
      setupObservers();
      scanAll();
      return;
    }
    if (tries > 120) return;    // 최대 60초
    setTimeout(() => waitForComments(tries + 1), 500);
  }

  /* 안전망: MutationObserver 가 놓친 댓글이 있는지 싼 방법으로 확인한다.
     노드 개수만 세면 되므로 전체 스캔보다 훨씬 가볍다.

     주의: 개수가 잠깐 안 맞는 건 정상이다. 댓글이 막 추가되어 flushDirty 의 디바운스를
     기다리는 중이면 아직 레코드가 없다. 그때 전체 스캔을 돌리면, 무한 스크롤로 댓글이
     계속 들어오는 동안(= 성능이 가장 중요한 순간) 오히려 매번 전수 재스캔을 하게 된다.
     그래서 대기 중인 작업이 없고, 불일치가 두 번 연속 관측될 때만 전체 스캔한다. */
  function startTicker() {
    if (tick) clearInterval(tick);
    let lastHref = location.href;
    let mismatchStreak = 0;
    tick = setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        mismatchStreak = 0;
        setTimeout(resetForNavigation, 500);
        return;
      }
      const root = ytdom.commentsRoot();
      if (!cfg.enabled || !root) return;
      if (dirty.size) { mismatchStreak = 0; return; }   // 아직 처리 대기 중

      pruneDetached(true);
      if (ytdom.countComments(root) !== records.size) {
        if (++mismatchStreak >= 2) { mismatchStreak = 0; scanAll(); }
      } else {
        mismatchStreak = 0;
      }
    }, 2000);
  }

  // ---------- 페이지 전환 ----------

  function resetForNavigation() {
    queue.clearPending();
    detectQueue.clearPending();
    batchBuf.clear();
    dirty.clear();
    for (const c of records.keys()) ui.unmount(c);
    records.clear();
    notified.clear();
    if (io) { io.disconnect(); io = null; }
    if (mo) { mo.disconnect(); mo = null; }
    waitForComments();
  }

  // ---------- 메시지 ----------

  function translateVisible() {
    let n = 0;
    for (const [comment, rec] of records) {
      if (rec.skip || rec.trivial) continue;
      if (rec.state === 'done' || rec.state === 'loading' || rec.state === 'downloading') continue;
      if (!isVisible(comment)) continue;
      translateComment(comment, { userGesture: true, priority: 70 });
      n++;
    }
    ui.toast(n ? t('toast.translatingN', { n }) : t('toast.nothingNew'));
    return n;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    // 확장 내부에서 온 메시지만 처리한다
    if (sender && sender.id && sender.id !== chrome.runtime.id) return;

    switch (msg.type) {
      case 'BYCT_TRANSLATE_VISIBLE':
        sendResponse({ ok: true, count: translateVisible() });
        return true;
      case 'BYCT_TOAST':
        ui.toast(String(msg.text || '').slice(0, 300));
        sendResponse({ ok: true });
        return true;
      case 'BYCT_GET_STATUS': {
        let done = 0, pending = 0, skipped = 0, trivial = 0;
        for (const rec of records.values()) {
          if (rec.trivial) trivial++;
          else if (rec.state === 'done') done++;
          else if (rec.skip) skipped++;
          else pending++;
        }
        sendResponse({
          ok: true,
          onYouTubeWatch: !!ytdom.commentsRoot(),
          total: records.size - trivial, done, pending, skipped, trivial,
          cacheSize: cache.size(),
          builtinAvailable: builtinEngine.present(),
          queue: queue.stats(),
        });
        return true;
      }
      case 'BYCT_RESCAN':
        resetForNavigation();
        sendResponse({ ok: true });
        return true;
    }
  });

  // ---------- 설정 변경 ----------

  function repaintAll() {
    for (const [c, rec] of records) if (!rec.trivial) paint(c, rec);
  }

  function applySettings(next, patch) {
    const prev = cfg;
    cfg = next;
    queue.setConcurrency(cfg.concurrency);
    if (!patch) return;

    // 목표 언어나 엔진이 바뀌면 기존 번역이 전부 무효
    if (patch.targetLang !== undefined || patch.engine !== undefined
        || patch.minLength !== undefined || patch.translateReplies !== undefined) {
      resetForNavigation();
      return;
    }
    if (patch.enabled === false) {
      for (const c of records.keys()) ui.unmount(c);
      records.clear();
      if (io) { io.disconnect(); io = null; }
      if (mo) { mo.disconnect(); mo = null; }
      return;
    }
    if (patch.enabled === true && !prev.enabled) { resetForNavigation(); return; }

    if (patch.hideYoutubeButton !== undefined) {
      for (const c of records.keys()) ytdom.setYoutubeButtonHidden(c, cfg.hideYoutubeButton);
    }
    if (patch.showOriginal !== undefined) {
      for (const [c, rec] of records) if (!rec.trivial) applyOriginalVisibility(c, rec);
    }
    if (patch.showEngineBadge !== undefined) repaintAll();
    if (patch.uiLang !== undefined) { BYCT.i18n.setLang(cfg.uiLang); repaintAll(); }
    if (patch.autoTranslate === true) {
      for (const [comment, rec] of records) {
        if (!rec.skip && !rec.trivial && rec.state === 'idle' && rec.detected && isVisible(comment)) {
          translateComment(comment, { priority: 60 });
        }
      }
    }
  }

  // ---------- 시작 ----------

  async function start() {
    if (started) return;
    started = true;

    cfg = await settings.get();
    BYCT.i18n.setLang(cfg.uiLang);
    await cache.load();
    settings.onChange(applySettings);
    queue.setConcurrency(cfg.concurrency);

    waitForComments();
    startTicker();

    document.addEventListener('yt-navigate-finish', () => setTimeout(resetForNavigation, 300));

    console.log('[BYCT] Better YouTube Comment Translation v' + BYCT.VERSION + ' started');
  }

  // 디버깅용 (콘솔에서 상태 확인). cfg 에는 API 키가 들어있지 않다.
  BYCT._debug = {
    records, queue, scanAll, translateVisible, syncComment, dirty,
    get dirtySize() { return dirty.size; },
    get cfg() { return cfg; },
  };

  // 테마는 설정 로딩을 기다릴 필요가 없으므로 가장 먼저 반영한다
  ytdom.watchTheme();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(globalThis.BYCT);
