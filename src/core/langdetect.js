/* 언어 감지.
   1순위: Chrome 내장 LanguageDetector API (정확도 높음)
   2순위: 문자 스크립트 + 불용어 기반 휴리스틱 (API 없거나 미다운로드 시)

   Chrome Translator API는 sourceLanguage를 반드시 명시해야 하므로
   (auto 감지를 지원하지 않음) 이 모듈이 번역 파이프라인의 필수 전제다. */
(function (BYCT) {
  'use strict';
  const { withTimeout, normalizeLang } = BYCT.util;

  let detectorPromise = null;
  let detectorFailed = false;

  function apiPresent() {
    return typeof globalThis.LanguageDetector !== 'undefined';
  }

  /* availability() 는 비동기 API 호출이다. 캐시하지 않으면 댓글 하나마다 한 번씩
     불려서(응답이 느린 환경에서는 4초 타임아웃까지) 감지 파이프라인 전체가 기어간다.
     확정된 값은 계속 쓰고, 'unknown'(타임아웃)만 잠시 뒤 재시도한다. */
  let availCache = null;        // { value, at }
  const UNKNOWN_TTL = 30000;

  async function availability({ fresh = false } = {}) {
    if (!apiPresent()) return 'unavailable';
    if (!fresh && availCache) {
      const stale = availCache.value === 'unknown' && Date.now() - availCache.at > UNKNOWN_TTL;
      if (!stale) return availCache.value;
    }
    let r;
    try {
      r = await withTimeout(LanguageDetector.availability(), 4000, 'unknown');
    } catch { r = 'unavailable'; }
    availCache = { value: r, at: Date.now() };
    return r;
  }

  /** 감지기 인스턴스를 만들어 재사용. 실패하면 다시 시도하지 않는다. */
  async function getDetector({ allowDownload = false } = {}) {
    if (detectorFailed || !apiPresent()) return null;
    if (detectorPromise) return detectorPromise;

    const avail = await availability();
    if (avail === 'unavailable') { detectorFailed = true; return null; }
    // 다운로드가 필요한데 허용되지 않았으면 휴리스틱으로 넘어간다
    if (avail === 'downloadable' && !allowDownload) return null;

    detectorPromise = (async () => {
      try {
        return await withTimeout(LanguageDetector.create(), 60000, null);
      } catch (e) {
        console.warn('[BYCT] LanguageDetector.create failed:', e);
        detectorFailed = true;
        return null;
      }
    })();
    const d = await detectorPromise;
    if (!d) { detectorPromise = null; detectorFailed = true; }
    return d;
  }

  // ---------- 휴리스틱 폴백 ----------

  const SCRIPTS = [
    ['ko', /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/u],
    ['ja', /[\u3040-\u309F\u30A0-\u30FF]/u],          // 가나가 있으면 확실히 일본어
    ['th', /[\u0E00-\u0E7F]/u],
    ['he', /[\u0590-\u05FF]/u],
    ['ar', /[\u0600-\u06FF\u0750-\u077F]/u],
    ['hi', /[\u0900-\u097F]/u],
    ['bn', /[\u0980-\u09FF]/u],
    ['ta', /[\u0B80-\u0BFF]/u],
    ['te', /[\u0C00-\u0C7F]/u],
    ['kn', /[\u0C80-\u0CFF]/u],
    ['el', /[\u0370-\u03FF]/u],
    ['ru', /[\u0400-\u04FF]/u],                        // 키릴 → 러시아어로 근사
    ['zh', /[\u4E00-\u9FFF\u3400-\u4DBF]/u],          // 가나 없는 한자 → 중국어
  ];

  /* 라틴 문자권은 스크립트만으로 구분할 수 없어 [변별 문자 + 불용어] 점수로 판정한다.
     변별 문자는 그 언어에서만 쓰이다시피 하는 것이어야 한다 —
     예전에 nl 항목에 /[ij]/ 를 뒀다가 "i"나 "j"가 든 모든 문장이 네덜란드어로 잡혔다.
     prior 는 유튜브 댓글에서 그 언어가 나올 대략의 빈도. 점수가 동점일 때
     "짧은 댓글이면 흔한 언어 쪽"으로 기울이는 역할을 한다. (예: "Este ... al mismo nodo"
     는 es/ro 둘 다 1점이지만 스페인어일 확률이 압도적으로 높다.) */
  const LATIN_HINTS = [
    ['vi', 0.15, /[ăâđêôơư]|[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i,
      /\b(là|của|những|người|không|được|và|có|một|mình|rồi|cũng|này|thể|nào|quên)\b/i],
    ['tr', 0.15, /[ığşİĞŞ]/,
      /\b(bir|için|çok|ama|değil|olarak|bu|ve|daha|gibi)\b/i],
    ['pl', 0.10, /[ąćęłńśźż]/i,
      /\b(nie|jest|się|jak|tego|który|oraz|bardzo|tylko|jeszcze|żeby)\b/i],
    ['cs', 0.05, /[řůěščž]/i,
      /\b(není|jsem|jako|ale|tak|toho|který|jsou|když)\b/i],
    ['ro', 0.05, /[ăâîșț]/i,
      /\b(este|care|pentru|dar|foarte|acest|nu|mai|sunt|să)\b/i],
    ['sv', 0.05, /[åäö]/i,
      /\b(och|att|det|som|inte|för|med|jag|har|den|är)\b/i],
    ['de', 0.20, /[äöüß]/i,
      /\b(der|die|das|und|ist|nicht|mit|auch|ein|für|den|von|sich|kann|einfach|beste|jemals|niemand|mir)\b/i],
    ['es', 0.35, /[ñ¿¡]/,
      /\b(que|el|los|las|una|un|por|pero|como|muy|est[aeo]s?|todo|más|cuando|porque|nunca|hay|con|del|ni|fuera|mismo|al|se|más)\b/i],
    ['pt', 0.30, /[ãõ]/i,
      /\b(não|uma|com|para|mais|isso|você|muito|que|em|é|acredito|nessa|essa|mas|boa|novo)\b/i],
    ['fr', 0.25, /[àèùçœ]/i,
      /\b(le|la|les|des|est|pas|pour|avec|mais|vous|je|ce|cette|merci|très|c'est|à|regardez)\b/i],
    ['it', 0.20, /[àèìòù]/i,
      /\b(che|non|per|con|una|sono|questo|molto|anche|più|come|della)\b/i],
    ['nl', 0.10, null,
      /\b(het|een|van|niet|maar|ook|deze|voor|met|dat|zijn|heb|wat|naar|hij)\b/i],
    ['id', 0.25, null,
      /\b(yang|dan|tidak|untuk|dengan|ini|itu|saya|bisa|ada|juga|banget)\b/i],
    ['en', 0.50, null,
      /\b(the|is|and|you|this|that|of|for|to|it|was|are|with|but|not|have|here|who|came|down|just|about|when|would|been|still)\b/i],
  ];

  function heuristic(text) {
    const t = (text || '').slice(0, 800);
    if (!t.trim()) return { detectedLanguage: 'und', confidence: 0, source: 'heuristic' };

    // 가나·한글·키릴 등은 문자만으로 충분히 확실하다
    for (const [lang, re] of SCRIPTS) {
      if (re.test(t)) return { detectedLanguage: lang, confidence: 0.85, source: 'heuristic' };
    }

    // 라틴 문자권 점수 계산
    let best = null;
    for (const [lang, prior, charRe, wordRe] of LATIN_HINTS) {
      let score = prior;
      if (charRe && charRe.test(t)) score += 2;
      if (wordRe) {
        const m = t.match(new RegExp(wordRe.source, 'gi'));
        if (m) score += Math.min(4, m.length);
      }
      if (score >= 1 && (!best || score > best.score)) best = { lang, score };
    }
    if (best) {
      return {
        detectedLanguage: best.lang,
        confidence: Math.min(0.8, 0.3 + best.score * 0.08),
        source: 'heuristic',
      };
    }

    /* 라틴 문자가 대부분인데 어떤 단서도 안 걸리는 경우 — 짧은 댓글에서 흔하다.
       ("can confirm: he never gave us up" 은 어느 언어 불용어에도 안 걸린다.)
       여기서 'und'를 돌려주면 내장 엔진이 원문 언어를 못 정해 번역 자체를 거부하므로,
       유튜브 댓글에서 가장 가능성 높은 영어로 낮은 신뢰도를 붙여 넘긴다. */
    const letters = (t.match(/\p{L}/gu) || []).length;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    if (letters >= 2 && latin / letters > 0.7) {
      return { detectedLanguage: 'en', confidence: 0.25, source: 'heuristic-default' };
    }
    return { detectedLanguage: 'und', confidence: 0, source: 'heuristic' };
  }

  // ---------- 공개 API ----------

  /**
   * @returns {Promise<{detectedLanguage:string, confidence:number, source:string}>}
   *   detectedLanguage 'und' = 판별 실패
   */
  async function detect(text, opts = {}) {
    const t = (text || '').trim();
    if (!t) return { detectedLanguage: 'und', confidence: 0, source: 'empty' };

    const det = await getDetector(opts);
    if (det) {
      try {
        const results = await withTimeout(det.detect(t.slice(0, 1000)), 8000, null);
        if (results && results.length) {
          const top = results[0];
          // 신뢰도가 너무 낮으면 휴리스틱과 교차 검증
          if (top.confidence >= 0.5) {
            return {
              detectedLanguage: normalizeLang(top.detectedLanguage),
              confidence: top.confidence,
              source: 'api',
            };
          }
          const h = heuristic(t);
          if (h.detectedLanguage !== 'und' && h.confidence > top.confidence) return h;
          return {
            detectedLanguage: normalizeLang(top.detectedLanguage),
            confidence: top.confidence,
            source: 'api-low',
          };
        }
      } catch (e) {
        console.warn('[BYCT] detect failed, falling back to heuristic:', e);
      }
    }
    return heuristic(t);
  }

  /** 감지 모델을 미리 내려받는다. 다운로드에는 사용자 제스처가 필요하므로
      클릭 핸들러 안에서 호출해야 한다. 성공하면 이후 감지가 휴리스틱보다 훨씬 정확해진다. */
  async function warmup() {
    if (!apiPresent()) return false;
    detectorFailed = false;
    availCache = null;          // 캐시된 'downloadable' 때문에 막히지 않도록
    const d = await getDetector({ allowDownload: true });
    return !!d;
  }

  BYCT.langdetect = { detect, heuristic, availability, apiPresent, warmup };
})(globalThis.BYCT);
