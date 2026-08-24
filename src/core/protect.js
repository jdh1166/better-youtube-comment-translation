/* 번역기에 넘기면 안 되는 토큰 보호.

   유튜브 댓글에는 번역 대상이 아닌 것들이 문장 안에 섞여 있다:
   @멘션, #해시태그, URL, 타임스탬프(2:14), 그리고 커스텀 이모지 자리표시자(:heart:).
   이걸 그대로 번역기에 넣으면
     - 멘션의 사람 이름이 단어로 번역되거나 (@Rick → @릭)
     - URL 이 중간에 잘리거나 공백이 끼거나
     - :heart: 가 "심장" 같은 말로 바뀌거나
     - 타임스탬프 숫자가 바뀌는
   일이 생긴다. 번역 전에 자리표시자로 치환하고, 번역 후 되돌린다.

   자리표시자는 ⟦0⟧ 형태를 쓴다. 흔한 문장부호가 아니라 번역기가 건드릴 이유가 적고,
   되돌릴 때 공백이 끼어도(⟦ 0 ⟧) 인식되도록 느슨하게 매칭한다.

   그래도 번역 결과에서 자리표시자가 사라지는 모델이 있을 수 있으므로,
   restore() 는 전부 복원됐는지(complete) 함께 알려준다. 호출한 쪽이 판단해서
   마스킹 없이 다시 번역할 수 있게 하기 위함이다. */
(function (BYCT) {
  'use strict';

  const OPEN = '⟦';    // ⟦
  const CLOSE = '⟧';   // ⟧

  /** 적용 순서가 중요하다. URL 을 먼저 걷어내야 그 안의 :// 나 숫자가 다른 패턴에 걸리지 않는다. */
  const PATTERNS = [
    /https?:\/\/\S+/gi,                       // URL
    /\bwww\.[^\s/$.?#][^\s]*/gi,              // www. 로 시작하는 주소
    /@[^\s@#:,.!?()[\]{}"']+/g,               // @멘션
    /#[^\s@#:,.!?()[\]{}"']+/g,               // #해시태그
    /:[a-z0-9_+-]{2,}:/gi,                    // 커스텀 이모지 자리표시자 (:heart:)
    /\b\d{1,3}:\d{2}(?::\d{2})?\b/g,          // 타임스탬프 (2:14, 1:02:33)
  ];

  const PLACEHOLDER_RE = new RegExp(OPEN + '\\s*(\\d+)\\s*' + CLOSE, 'g');
  const ALREADY_PRESENT_RE = new RegExp('[' + OPEN + CLOSE + ']');

  /**
   * @param {string} text
   * @returns {{text:string, tokens:string[]}} tokens 가 비어 있으면 마스킹하지 않은 것
   */
  function mask(text) {
    const src = String(text == null ? '' : text);

    /* 원문에 이미 ⟦ ⟧ 가 들어있으면 복원할 때 원문의 것과 구분할 수 없다.
       아주 드문 경우이고, 마스킹을 포기하는 쪽이 잘못 복원하는 것보다 안전하다. */
    if (ALREADY_PRESENT_RE.test(src)) return { text: src, tokens: [] };

    const tokens = [];
    let out = src;
    for (const re of PATTERNS) {
      out = out.replace(re, (m) => {
        tokens.push(m);
        return OPEN + (tokens.length - 1) + CLOSE;
      });
    }
    return { text: out, tokens };
  }

  /**
   * @param {string} text 번역 결과
   * @param {string[]} tokens mask() 가 돌려준 토큰
   * @returns {{text:string, complete:boolean}} complete=false 면 자리표시자가 유실된 것
   */
  function restore(text, tokens) {
    const src = String(text == null ? '' : text);
    if (!tokens || !tokens.length) return { text: src, complete: true };

    const seen = new Set();
    const out = src.replace(PLACEHOLDER_RE, (m, digits) => {
      const i = Number(digits);
      if (i >= 0 && i < tokens.length) { seen.add(i); return tokens[i]; }
      return m;   // 우리가 만든 게 아닌 번호는 그대로 둔다
    });
    return { text: out, complete: seen.size === tokens.length };
  }

  BYCT.protect = { mask, restore, OPEN, CLOSE };
})(globalThis.BYCT);
