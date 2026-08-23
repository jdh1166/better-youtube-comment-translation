/* 유튜브 DOM 어댑터.
   유튜브는 마크업을 자주 바꾸므로 모든 셀렉터에 폴백을 둔다.
   (예: 예전 확장들이 #content-text 하나만 믿다가 레이아웃 개편 때 통째로 깨진다) */
(function (BYCT) {
  'use strict';

  const SEL = {
    // 댓글 하나 = 최상위 댓글 또는 답글
    comment: [
      'ytd-comment-view-model',      // 2024~ 현행
      'ytd-comment-renderer',        // 구버전
    ],
    // 댓글 본문 텍스트
    text: [
      '#content-text',
      '#expander #content yt-attributed-string',
      '#body #content yt-attributed-string',
      '#content-text.ytd-comment-renderer',
    ],
    main: ['#main', '#body'],
    expander: ['#expander', 'ytd-expander'],
    engagementBar: ['#action-buttons', 'ytd-comment-engagement-bar', '#toolbar'],
    author: ['#author-text', '#header-author #author-text'],
    ytTranslateBtn: [
      'ytd-tri-state-button-view-model.translate-button',
      '.translate-button',
      '#translate-button',
    ],
    // 댓글 섹션 컨테이너 (MutationObserver 부착 대상)
    commentsRoot: [
      'ytd-comments#comments',
      'ytd-comments',
      '#comments',
    ],
    replyContainer: ['ytd-comment-replies-renderer'],
  };

  /** 셀렉터 후보를 순서대로 시도 */
  function pick(root, list) {
    for (const s of list) {
      const el = root.querySelector(s);
      if (el) return el;
    }
    return null;
  }
  function pickAll(root, list) {
    for (const s of list) {
      const els = root.querySelectorAll(s);
      if (els.length) return [...els];
    }
    return [];
  }

  const commentsRoot = () => pick(document, SEL.commentsRoot);

  /** 문서 전체(또는 주어진 루트) 안의 댓글 노드 목록 */
  function allComments(root = document) {
    const joined = SEL.comment.join(',');
    const out = [...root.querySelectorAll(joined)];
    // root 자신이 댓글일 수도 있다 (MutationObserver가 넘겨주는 노드)
    if (root.nodeType === 1 && root.matches && root.matches(joined)) out.unshift(root);
    return out;
  }

  /** 댓글 노드 개수만 센다 (전체 스캔이 필요한지 판단하는 싸구려 체크용) */
  function countComments(root = document) {
    return root.querySelectorAll(SEL.comment.join(',')).length;
  }

  /** 어떤 노드가 속한 댓글 요소를 찾는다 (MutationObserver 대상 → 댓글 매핑) */
  function hostComment(node) {
    const el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    if (!el || !el.closest) return null;
    return el.closest(SEL.comment.join(','));
  }

  const textEl = (comment) => pick(comment, SEL.text);

  /** 답글인지 여부 */
  function isReply(comment) {
    return !!comment.closest(SEL.replyContainer[0]);
  }

  /**
   * 댓글 본문을 문자열로 추출.
   * - 커스텀 이모지 <img>는 alt(:emoji_name:)로 치환
   * - <br>은 개행으로
   * - 우리가 넣은 요소는 제외
   */
  function extractText(comment) {
    const el = textEl(comment);
    if (!el) return '';
    let out = '';
    (function walk(node) {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          out += n.nodeValue;
        } else if (n.nodeType === 1) {
          if (n.classList && n.classList.contains('byct-injected')) continue;
          const tag = n.tagName.toLowerCase();
          if (tag === 'br') out += '\n';
          else if (tag === 'img') out += n.getAttribute('alt') || '';
          else walk(n);
        }
      }
    })(el);
    return out.replace(/​/g, '').replace(/\r\n/g, '\n').trim();
  }

  /** 우리 UI를 끼워 넣을 위치: #main 안, 본문(expander) 바로 아래 */
  function insertionPoint(comment) {
    const main = pick(comment, SEL.main) || comment;
    const expander = pick(comment, SEL.expander);
    if (expander && expander.parentElement === main) {
      return { parent: main, before: expander.nextSibling };
    }
    const bar = pick(comment, SEL.engagementBar);
    if (bar && bar.parentElement === main) {
      return { parent: main, before: bar };
    }
    const tx = textEl(comment);
    if (tx && tx.parentElement) {
      return { parent: tx.parentElement, before: tx.nextSibling };
    }
    return { parent: main, before: null };
  }

  /** 유튜브 기본 번역 버튼 (중복 UI 방지용으로 숨길 수 있다) */
  const ytTranslateButton = (comment) => pick(comment, SEL.ytTranslateBtn);

  function setYoutubeButtonHidden(comment, hidden) {
    const btn = ytTranslateButton(comment);
    if (!btn) return false;
    // 유튜브가 스스로 hidden 속성을 관리하므로 클래스로만 제어한다
    btn.classList.toggle('byct-hide-yt-btn', !!hidden);
    return true;
  }

  /* ---------- 테마 판정 ----------
     유튜브 테마는 OS 설정과 독립적이라(유튜브만 라이트로 쓰는 사람이 많다)
     prefers-color-scheme 만으로는 맞출 수 없다.
     1순위는 <html dark> 속성. 유튜브가 이 속성을 없애더라도 깨지지 않도록
     2순위로 실제 배경색 휘도를 잰다. */

  function parseRgb(str) {
    const m = String(str).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }

  function detectTheme() {
    const html = document.documentElement;
    if (html.hasAttribute('dark')) return 'dark';

    // dark 속성이 없다 — 정말 라이트인지, 유튜브가 방식을 바꾼 건지 배경색으로 확인
    for (const sel of ['ytd-app', 'body', 'html']) {
      const el = sel === 'html' ? html : document.querySelector(sel);
      if (!el) continue;
      const c = parseRgb(getComputedStyle(el).backgroundColor);
      if (!c || c.a < 0.5) continue;          // 투명하면 판단 불가 → 다음 후보
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      return lum < 128 ? 'dark' : 'light';
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** 판정 결과를 <html data-byct-theme> 에 반영. 바뀌었으면 true. */
  function applyTheme() {
    const t = detectTheme();
    const html = document.documentElement;
    if (html.dataset.byctTheme === t) return false;
    html.dataset.byctTheme = t;
    return true;
  }

  /** 테마 변경을 감시한다. 정리 함수를 돌려준다. */
  function watchTheme(onChange) {
    applyTheme();
    const fire = () => { if (applyTheme() && onChange) onChange(document.documentElement.dataset.byctTheme); };

    // 유튜브가 <html> 의 dark 속성을 토글한다
    const mo = new MutationObserver(fire);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });

    // OS 테마 변경 (유튜브 "기기 테마 사용" 설정일 때)
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', fire);

    return () => { mo.disconnect(); mq.removeEventListener('change', fire); };
  }

  /** 댓글 고유 ID (없으면 작성자+본문 해시로 대체) */
  function commentId(comment) {
    const a = pick(comment, SEL.author);
    const author = a ? (a.textContent || '').trim() : '';
    const raw = comment.getAttribute('comment-id')
      || (comment.dataset && comment.dataset.commentId)
      || '';
    if (raw) return raw;
    return BYCT.util.hash(author + '|' + extractText(comment).slice(0, 200));
  }

  BYCT.ytdom = {
    SEL, pick, pickAll,
    commentsRoot, allComments, countComments, hostComment, textEl, isReply,
    extractText, insertionPoint,
    ytTranslateButton, setYoutubeButtonHidden, commentId,
    detectTheme, applyTheme, watchTheme,
  };
})(globalThis.BYCT);
