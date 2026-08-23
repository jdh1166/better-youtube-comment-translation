/* Chrome 내장 Translator API 엔진 (Chrome 138+).
   - 온디바이스: API 키 불필요, 무료, 텍스트가 기기 밖으로 나가지 않음
   - 언어쌍(src→tgt)마다 모델 다운로드가 필요하고, 최초 다운로드에는 사용자 제스처가 필요함
   - 직접 지원되지 않는 언어쌍은 영어를 경유(pivot)해서 2단계 번역으로 처리 */
(function (BYCT) {
  'use strict';
  const { withTimeout, normalizeLang } = BYCT.util;
  const t = (k, params) => BYCT.i18n.t(k, params);

  const instances = new Map();      // "src>tgt" -> Promise<Translator>
  const availCache = new Map();     // "src>tgt" -> { value, at }
  const UNKNOWN_TTL = 30000;        // 'unknown' 재시도 간격
  const PIVOT = 'en';

  const present = () => typeof globalThis.Translator !== 'undefined';

  function pairKey(src, tgt) { return `${src}>${tgt}`; }

  /** 'unsupported'(구 문서) / 'unavailable'(현 스펙) 표기를 하나로 통일 */
  function normStatus(s) {
    if (s === 'unsupported') return 'unavailable';
    if (s === 'readily') return 'available';
    return s;
  }

  async function availability(src, tgt, { fresh = false } = {}) {
    if (!present()) return 'unavailable';
    src = normalizeLang(src); tgt = normalizeLang(tgt);
    if (!src || !tgt || src === 'und') return 'unavailable';
    if (src === tgt) return 'available';

    const k = pairKey(src, tgt);
    if (!fresh && availCache.has(k)) {
      const hit = availCache.get(k);
      // 'unknown'(타임아웃)은 일시적일 수 있으니 잠시 뒤 재시도. 확정값은 계속 쓴다.
      if (hit.value !== 'unknown' || Date.now() - hit.at < UNKNOWN_TTL) return hit.value;
    }

    // availability()가 응답 없이 멈추는 사례가 있어 반드시 타임아웃을 건다
    const r = normStatus(
      await withTimeout(
        Translator.availability({ sourceLanguage: src, targetLanguage: tgt })
          .catch(() => 'unavailable'),
        6000,
        'unknown'
      )
    );
    /* 'unknown'도 캐시한다. 캐시하지 않으면 응답 없는 환경에서 댓글마다 6초씩
       기다리게 되어 번역 큐 전체가 멈춘다. */
    availCache.set(k, { value: r, at: Date.now() });
    return r;
  }

  /* availability()가 응답하지 않으면 'unknown'이 돌아온다(실측으로 확인된 동작).
     이때 '지원 안 함'으로 단정해버리면 실제로는 번역이 되는 환경에서도 기능이 죽는다.
     그래서 시도는 하되 사용자 클릭을 요구하도록 'downloadable'과 같이 취급한다. */
  const usable = (s) => s === 'available' || s === 'downloadable' || s === 'downloading' || s === 'unknown';
  const asStatus = (s) => (s === 'unknown' ? 'downloadable' : s);

  /** src→tgt 직행이 안 되면 src→en→tgt 경유 경로를 찾는다.
      @returns {Promise<{path:string[], status:string}>} path는 [src,tgt] 또는 [src,'en',tgt] */
  async function resolveRoute(src, tgt) {
    src = normalizeLang(src); tgt = normalizeLang(tgt);
    const direct = await availability(src, tgt);
    if (usable(direct)) return { path: [src, tgt], status: asStatus(direct) };
    if (src === PIVOT || tgt === PIVOT) return { path: [src, tgt], status: 'unavailable' };

    const [a, b] = await Promise.all([
      availability(src, PIVOT),
      availability(PIVOT, tgt),
    ]);
    if (usable(a) && usable(b)) {
      const status = (a === 'available' && b === 'available') ? 'available' : 'downloadable';
      return { path: [src, PIVOT, tgt], status };
    }
    return { path: [src, tgt], status: 'unavailable' };
  }

  /** Translator 인스턴스를 만들거나 캐시에서 가져온다.
      @param onProgress (0~1) 모델 다운로드 진행률 콜백 */
  function getTranslator(src, tgt, onProgress) {
    const k = pairKey(src, tgt);
    if (instances.has(k)) return instances.get(k);

    const p = (async () => {
      // 모델 다운로드는 정당하게 몇 분씩 걸릴 수 있으므로 고정 타임아웃을 걸 수 없다.
      // 대신 "진행 이벤트가 STALL_MS 동안 한 번도 없으면 멈춘 것"으로 판정한다.
      // (실측: 모델 백엔드가 응답하지 않으면 create()가 영영 안 끝나 UI가 무한 스피너에 갇힌다)
      const STALL_MS = 25000;
      let lastTick = Date.now();

      const opts = {
        sourceLanguage: src,
        targetLanguage: tgt,
        monitor: (m) => {
          m.addEventListener('downloadprogress', (e) => {
            lastTick = Date.now();
            if (onProgress) { try { onProgress(e.loaded, k); } catch {} }
          });
        },
      };

      const created = Translator.create(opts);
      const stalled = new Promise((_, reject) => {
        const iv = setInterval(() => {
          if (Date.now() - lastTick > STALL_MS) {
            clearInterval(iv);
            reject(Object.assign(
              new Error(t('err.modelStalled', { pair: k })),
              { __noRetry: true, __code: 'STALL' }
            ));
          }
        }, 1000);
        created.then(() => clearInterval(iv), () => clearInterval(iv));
      });

      const translator = await Promise.race([created, stalled]);
      availCache.set(k, { value: 'available', at: Date.now() });
      return translator;
    })();

    instances.set(k, p);
    p.catch(() => instances.delete(k));   // 실패한 인스턴스는 캐시에서 제거
    return p;
  }

  /**
   * @param {string} text
   * @param {{sourceLanguage:string, targetLanguage:string, onProgress?:Function}} opts
   * @returns {Promise<{text:string, via:string[]}>}
   */
  async function translate(text, { sourceLanguage, targetLanguage, onProgress }) {
    if (!present()) {
      throw Object.assign(new Error(t('err.noBuiltinApi')), { __noRetry: true });
    }
    const src = normalizeLang(sourceLanguage);
    const tgt = normalizeLang(targetLanguage);
    if (src === tgt) return { text, via: [] };

    const { path, status } = await resolveRoute(src, tgt);
    if (status === 'unavailable') {
      throw Object.assign(
        new Error(t('err.pairUnavailable', { src, tgt })),
        { __noRetry: true, __code: 'PAIR_UNAVAILABLE' }
      );
    }

    let cur = text;
    for (let i = 0; i < path.length - 1; i++) {
      const translator = await getTranslator(path[i], path[i + 1], onProgress);
      cur = await translator.translate(cur);
    }
    return { text: cur, via: path };
  }

  /** 언어팩 선다운로드. 사용자 클릭 핸들러 안에서 호출해야 한다(사용자 제스처 필요). */
  async function preload(src, tgt, onProgress) {
    const { path, status } = await resolveRoute(normalizeLang(src), normalizeLang(tgt));
    if (status === 'unavailable') throw new Error(t('err.pairUnsupported'));
    for (let i = 0; i < path.length - 1; i++) {
      await getTranslator(path[i], path[i + 1], onProgress);
    }
    return path;
  }

  function destroyAll() {
    for (const p of instances.values()) {
      p.then((tr) => { try { tr.destroy && tr.destroy(); } catch {} }).catch(() => {});
    }
    instances.clear();
  }

  /** await 없이 캐시된 판정만 읽는다 (사용자 제스처를 소모하지 않아야 할 때 사용) */
  function cachedAvailability(src, tgt) {
    src = normalizeLang(src); tgt = normalizeLang(tgt);
    if (src === tgt) return 'available';
    const hit = availCache.get(pairKey(src, tgt));
    return hit ? hit.value : null;
  }

  BYCT.builtinEngine = {
    id: 'builtin',
    present,
    availability,
    cachedAvailability,
    resolveRoute,
    translate,
    preload,
    destroyAll,
  };
})(globalThis.BYCT);
