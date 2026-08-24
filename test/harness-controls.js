/* 하네스 조작 버튼 + 자동 검증 */
(function () {
  'use strict';

  const logEl = document.getElementById('log');
  function log(...a) {
    logEl.textContent += a.join(' ') + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }
  window.HLOG = log;

  const $ = (id) => document.getElementById(id);
  const S = () => globalThis.BYCT.settings;

  $('t-auto').onclick = async () => {
    const cfg = await S().get();
    await S().set({ autoTranslate: !cfg.autoTranslate });
    log('자동 번역 →', !cfg.autoTranslate);
  };

  $('t-visible').onclick = async () => {
    const r = await chrome.runtime._dispatch({ type: 'BYCT_TRANSLATE_VISIBLE' });
    log('보이는 댓글 번역 요청:', JSON.stringify(r));
  };

  $('t-lang').onclick = async () => {
    const cfg = await S().get();
    const next = cfg.targetLang === 'ko' ? 'en' : 'ko';
    await S().set({ targetLang: next });
    log('목표 언어 →', next);
  };

  $('t-original').onclick = async () => {
    const cfg = await S().get();
    await S().set({ showOriginal: !cfg.showOriginal });
    log('원문 표시 →', !cfg.showOriginal);
  };

  // 유튜브 Polymer는 스크롤 중 댓글 노드를 재활용한다.
  // 텍스트만 갈아끼우고 확장이 이전 번역을 지우고 새로 처리하는지 본다.
  $('t-recycle').onclick = () => {
    const first = document.querySelector('ytd-comment-view-model');
    const span = first.querySelector('#content-text span');
    span.textContent = 'RECYCLED: Este comentario reemplazó al anterior en el mismo nodo.';
    log('1번 댓글 노드 내용 교체 (스페인어)');
  };

  // 유튜브가 하는 것과 동일하게 <html dark> 를 토글한다
  $('t-theme').onclick = () => {
    const html = document.documentElement;
    html.toggleAttribute('dark');
    log('유튜브 테마 →', html.hasAttribute('dark') ? 'dark' : 'light',
        '| 확장 판정:', html.dataset.byctTheme);
  };

  $('t-append').onclick = () => {
    window.HARNESS.render(window.HARNESS.BATCH_2, window.HARNESS.contents());
    log('댓글 4개 추가 로드 (de/pt/ru/vi)');
  };

  // ---------- 자동 검증 ----------

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function textOf(comment) {
    return globalThis.BYCT.ytdom.extractText(comment);
  }
  function stateOf(comment) {
    const root = comment.querySelector('.byct-root');
    return root ? root.dataset.byctState : '(UI 없음)';
  }
  /** 건너뛴 댓글은 UI 를 만들지 않으므로 레코드에서 상태를 읽는다 */
  function recStateOf(comment) {
    const rec = globalThis.BYCT._debug.records.get(comment);
    return rec ? rec.state : '(레코드 없음)';
  }
  function findByAuthor(name) {
    return [...document.querySelectorAll('ytd-comment-view-model')]
      .find((c) => (c.querySelector('#author-text')?.textContent || '').trim() === name);
  }

  let pass = 0, fail = 0;
  function check(label, cond, extra) {
    if (cond) { pass++; log('  PASS  ' + label); }
    else { fail++; log('  FAIL  ' + label + (extra ? '  → ' + extra : '')); }
  }

  $('t-assert').onclick = async () => {
    logEl.textContent = '';
    pass = 0; fail = 0;
    log('=== 자동 검증 시작 ===\n');

    log('[1] 텍스트 추출');
    const mixed = findByAuthor('@mixed');
    const mt = textOf(mixed);
    check('커스텀 이모지가 alt로 치환됨', mt.includes(':heart:'), mt);
    check('@멘션 보존', mt.includes('@RickAstley'), mt);
    check('타임스탬프 보존', mt.includes('2:14'), mt);

    const jp = findByAuthor('@日本のファン');
    check('<br>이 개행으로 변환됨', textOf(jp).includes('\n'), JSON.stringify(textOf(jp)));

    log('\n[2] 번역 제외 판정 (UI가 아예 안 붙어야 함)');
    await wait(1200);
    for (const [author, why] of [
      ['@onlyemoji', '이모지만'],
      ['@onlyurl', 'URL만'],
      ['@timestamps', '타임스탬프만'],
    ]) {
      const c = findByAuthor(author);
      check(`${why} 댓글은 UI 미생성`, !c.querySelector('.byct-root'), stateOf(c));
    }

    log('\n[3] 언어 감지 & 같은 언어 건너뛰기');
    const ko = findByAuthor('@onlyko');
    check('한국어 댓글은 skipped', recStateOf(ko) === 'skipped', recStateOf(ko));
    check('건너뛴 댓글에는 UI 컨테이너가 없다 (빈 자리 방지)',
      !ko.querySelector('.byct-root'), '컨테이너가 남아있음');

    const en = findByAuthor('@MariahRhona');
    check('영어 댓글은 번역 대기(idle)',
      ['idle', 'needs-download', 'done', 'loading'].includes(recStateOf(en)), recStateOf(en));

    const detected = [];
    for (const [author, expect] of [
      ['@MariahRhona', 'en'], ['@日本のファン', 'ja'], ['@onlyko', 'ko'],
      // 불용어가 하나도 안 걸리는 짧은 영어 문장 — 예전에 und 로 떨어져 번역이 거부됐다
      ['@YouTube', 'en'],
      ['@tooshort', 'en'],
    ]) {
      const c = findByAuthor(author);
      const rec = globalThis.BYCT._debug.records.get(c);
      detected.push(`${author}=${rec ? rec.detected : '-'}`);
      check(`${author} → ${expect} 로 감지`, rec && rec.detected === expect, rec && rec.detected);
    }
    log('  감지 결과: ' + detected.join(', '));

    log('\n[4] 답글 처리');
    const esReply = findByAuthor('@user_es');
    check('답글에도 UI가 붙음', !!esReply.querySelector('.byct-root'), stateOf(esReply));
    check('답글 언어 감지 (es)',
      globalThis.BYCT._debug.records.get(esReply)?.detected === 'es',
      globalThis.BYCT._debug.records.get(esReply)?.detected);
    const koReply = findByAuthor('@user_ko');
    check('한국어 답글은 skipped', recStateOf(koReply) === 'skipped', recStateOf(koReply));
    check('건너뛴 답글에도 UI 컨테이너 없음', !koReply.querySelector('.byct-root'));

    log('\n[5] 유튜브 기본 번역 버튼 숨김');
    const ytBtn = findByAuthor('@MariahRhona').querySelector('.translate-button');
    check('유튜브 버튼에 숨김 클래스 적용', ytBtn.classList.contains('byct-hide-yt-btn'));

    log('\n[6] 노드 재활용 대응');
    const first = document.querySelector('ytd-comment-view-model');
    const beforeRec = globalThis.BYCT._debug.records.get(first);
    const beforeText = beforeRec && beforeRec.text;
    first.querySelector('#content-text span').textContent =
      'RECYCLED: Este comentario reemplazó al anterior en el mismo nodo.';
    globalThis.BYCT._debug.scanAll();
    await wait(900);
    const afterRec = globalThis.BYCT._debug.records.get(first);
    check('재활용된 노드의 레코드가 갱신됨',
      afterRec && afterRec.text !== beforeText && afterRec.text.startsWith('RECYCLED'),
      JSON.stringify({ before: (beforeText || '').slice(0, 30), after: (afterRec && afterRec.text || '').slice(0, 30) }));
    check('재감지 언어 = es', afterRec && afterRec.detected === 'es', afterRec && afterRec.detected);
    check('UI가 중복 생성되지 않음', first.querySelectorAll('.byct-root').length === 1,
      String(first.querySelectorAll('.byct-root').length));

    log('\n[7] 무한 스크롤 (새 댓글 감지)');
    const before = globalThis.BYCT._debug.records.size;
    window.HARNESS.render(window.HARNESS.BATCH_2, window.HARNESS.contents());
    await wait(1400);
    const after = globalThis.BYCT._debug.records.size;
    check('MutationObserver가 새 댓글을 잡음', after >= before + 4, `${before} → ${after}`);
    const de = findByAuthor('@deutsch');
    check('추가 댓글 언어 감지 (de)',
      globalThis.BYCT._debug.records.get(de)?.detected === 'de',
      globalThis.BYCT._debug.records.get(de)?.detected);
    const vi = findByAuthor('@viet');
    check('추가 댓글 언어 감지 (vi)',
      globalThis.BYCT._debug.records.get(vi)?.detected === 'vi',
      globalThis.BYCT._debug.records.get(vi)?.detected);

    log('\n[8] Chrome 내장 번역 API');
    const be = globalThis.BYCT.builtinEngine;
    log('  Translator 존재: ' + be.present());
    log('  LanguageDetector 존재: ' + globalThis.BYCT.langdetect.apiPresent());
    if (be.present()) {
      const av = await be.availability('en', 'ko', { fresh: true });
      log('  en→ko availability: ' + av);
      const route = await be.resolveRoute('vi', 'ko');
      log('  vi→ko 경로: ' + route.path.join(' → ') + ' (' + route.status + ')');
      check('언어쌍 라우팅이 경로를 반환', route.path.length >= 2);
    }

    log('\n[9] 다크/라이트 테마');
    const html = document.documentElement;
    const wasDark = html.hasAttribute('dark');
    const textEl = document.querySelector('.byct-text');
    const colorNow = () => getComputedStyle(textEl).color;

    html.setAttribute('dark', '');
    await wait(120);
    check('유튜브 dark → 확장이 dark 로 판정', html.dataset.byctTheme === 'dark', html.dataset.byctTheme);
    const darkColor = colorNow();
    check('다크에서 번역문이 밝은 색 (#f1f1f1)', darkColor === 'rgb(241, 241, 241)', darkColor);

    html.removeAttribute('dark');
    await wait(120);
    check('유튜브 light → 확장이 light 로 판정', html.dataset.byctTheme === 'light', html.dataset.byctTheme);
    const lightColor = colorNow();
    check('라이트에서 번역문이 검은 색 (#0f0f0f)', lightColor === 'rgb(15, 15, 15)', lightColor);
    check('두 테마의 색이 실제로 다름', darkColor !== lightColor, `${darkColor} vs ${lightColor}`);

    // dark 속성이 사라져도(유튜브가 방식을 바꿔도) 배경 휘도로 판정되는지
    document.body.style.backgroundColor = '#0f0f0f';
    check('dark 속성 없이 어두운 배경 → dark 로 판정',
      globalThis.BYCT.ytdom.detectTheme() === 'dark', globalThis.BYCT.ytdom.detectTheme());
    document.body.style.backgroundColor = '#ffffff';
    check('dark 속성 없이 밝은 배경 → light 로 판정',
      globalThis.BYCT.ytdom.detectTheme() === 'light', globalThis.BYCT.ytdom.detectTheme());
    document.body.style.backgroundColor = '';

    // 원래 테마로 복원
    if (wasDark) html.setAttribute('dark', '');
    await wait(60);

    log('\n[10] 보안·최적화 회귀');

    // ReDoS: 예전 정규식은 276자 입력에 4.5초가 걸렸다
    const evil = 'https://' + 'http://'.repeat(40) + ' X';
    const t0 = performance.now();
    globalThis.BYCT.isTrivialText(evil, 2);
    const redosMs = performance.now() - t0;
    check(`악성 URL 패턴 ${evil.length}자 즉시 처리 (ReDoS 회귀)`,
      redosMs < 50, redosMs.toFixed(1) + 'ms');

    // API 키가 content script 컨텍스트에 남으면 안 된다
    await globalThis.BYCT.settings.set({ deeplKey: 'SECRET-SHOULD-NOT-LEAK' });
    await wait(60);
    check('content script 설정에 API 키가 남지 않음',
      globalThis.BYCT._debug.cfg.deeplKey === '',
      JSON.stringify(globalThis.BYCT._debug.cfg.deeplKey));
    const stored = await chrome.storage.sync.get('deeplKey');
    check('저장소에는 정상 보관 (옵션 화면은 계속 동작)',
      stored.deeplKey === 'SECRET-SHOULD-NOT-LEAK', JSON.stringify(stored));
    await globalThis.BYCT.settings.set({ deeplKey: '' });

    // 사소한 댓글도 레코드에 남아 재추출을 반복하지 않는다
    const emoji = findByAuthor('@onlyemoji');
    check('사소한 댓글도 레코드에 기록됨', globalThis.BYCT._debug.records.has(emoji));
    check('그래도 UI는 만들지 않음', !emoji.querySelector('.byct-root'));

    // 유튜브가 댓글 내부를 다시 그려 우리 UI가 날아간 경우 복구
    const victim = findByAuthor('@MariahRhona');
    const beforeState = stateOf(victim);
    victim.querySelector('.byct-root').remove();
    check('UI 제거 확인', !victim.querySelector('.byct-root'));
    globalThis.BYCT._debug.syncComment(victim);
    check('재렌더로 날아간 UI가 복구됨', !!victim.querySelector('.byct-root'));
    check('복구 후 상태가 유지됨', stateOf(victim) === beforeState,
      `${beforeState} → ${stateOf(victim)}`);

    // 변경분만 처리하는지: 댓글 1개 추가 시 텍스트 추출 횟수
    const total = document.querySelectorAll('ytd-comment-view-model').length;
    let extracts = 0;
    const origExtract = globalThis.BYCT.ytdom.extractText;
    globalThis.BYCT.ytdom.extractText = function (c) { extracts++; return origExtract(c); };
    window.HARNESS.render(
      [{ author: '@perfprobe', time: '방금', html: 'One more comment for the perf probe.' }],
      window.HARNESS.contents()
    );
    await wait(700);
    globalThis.BYCT.ytdom.extractText = origExtract;
    check(`댓글 1개 추가에 전체(${total}개) 재스캔이 일어나지 않음`,
      extracts < total, `추출 ${extracts}회 / 화면에 ${total}개`);
    log('\n[11] 건너뛴 댓글의 빈 자리');

    /* 예전에는 건너뛴 댓글에도 컨테이너를 남기고 버튼만 hidden 처리했다.
       .byct-root 마진 + .byct-row 최소높이만큼(약 32px) 구멍이 뚫렸다. */
    const koC = findByAuthor('@onlyko');
    const enC = findByAuthor('@MariahRhona');
    const gapOf = (c) => {
      const text = c.querySelector('#content-text');
      const bar = c.querySelector('ytd-comment-engagement-bar');
      return Math.round(bar.getBoundingClientRect().top - text.getBoundingClientRect().bottom);
    };
    const koGap = gapOf(koC);
    const enGap = gapOf(enC);
    check(`건너뛴 한국어 댓글의 본문~버튼바 간격이 좁다 (${koGap}px)`, koGap < 16, koGap + 'px');
    check(`번역 대상 영어 댓글은 UI 만큼 간격이 있다`, enGap > koGap, `ko=${koGap} en=${enGap}`);

    // 목표 언어가 바뀌어 번역이 불필요해지면 이미 붙은 UI 도 사라져야 한다
    const hadUI = !!enC.querySelector('.byct-root');
    await globalThis.BYCT.settings.set({ targetLang: 'en' });
    await wait(1000);
    const enAfter = findByAuthor('@MariahRhona');
    check('목표 언어를 영어로 바꾸면 영어 댓글 UI 가 사라진다',
      hadUI && !enAfter.querySelector('.byct-root'),
      `before=${hadUI} after=${!!enAfter.querySelector('.byct-root')}`);
    await globalThis.BYCT.settings.set({ targetLang: 'ko' });
    await wait(1000);


    log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
    window.__BYCT_TEST = { pass, fail };
  };

  log('하네스 준비 완료. "자동 검증 실행"을 누르세요.');
})();
