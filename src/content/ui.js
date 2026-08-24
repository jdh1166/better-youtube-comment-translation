/* 댓글마다 붙는 UI 렌더링.
   원문 DOM은 절대 건드리지 않고(이모지·멘션·링크 보존) 형제 노드로 번역 블록을 추가한다. */
(function (BYCT) {
  'use strict';
  const { ytdom } = BYCT;
  const t = (k, p) => BYCT.i18n.t(k, p);

  /** comment element -> view 객체 */
  const views = new WeakMap();

  const LANG_NAME = new Map(BYCT.LANGUAGES);
  function langLabel(code) {
    if (!code || code === 'und') return '?';
    return (LANG_NAME.get(code) || code).replace(/\s*\(.*\)$/, '');
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** 스피너 + 문구. innerHTML 을 쓰지 않고 노드로 조립한다. */
  function setStatus(status, text, withSpinner) {
    status.textContent = '';
    if (withSpinner) status.appendChild(el('span', 'byct-spinner'));
    if (text) status.appendChild(document.createTextNode(text));
  }

  /** 댓글에 UI 컨테이너를 붙이고 view 객체를 돌려준다 */
  function mount(comment) {
    let v = views.get(comment);
    if (v && v.root.isConnected) return v;

    const root = el('div', 'byct-root byct-injected');

    const row = el('div', 'byct-row');
    const btn = el('button', 'byct-btn');
    btn.type = 'button';
    const status = el('span', 'byct-status');
    row.append(btn, status);

    const block = el('div', 'byct-translation');
    const badge = el('span', 'byct-badge');
    const body = el('div', 'byct-text');
    const more = el('button', 'byct-more', t('btn.more'));
    more.type = 'button';
    block.append(badge, body, more);

    root.append(row, block);

    const { parent, before } = ytdom.insertionPoint(comment);
    parent.insertBefore(root, before);

    v = { comment, root, row, btn, status, block, badge, body, more, state: 'idle' };
    views.set(comment, v);

    more.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const clamped = body.classList.toggle('byct-clamp');
      more.textContent = t(clamped ? 'btn.more' : 'btn.less');
    });

    return v;
  }

  const get = (comment) => views.get(comment);

  function unmount(comment) {
    const v = views.get(comment);
    if (v && v.root.parentElement) v.root.remove();
    views.delete(comment);
    comment.classList.remove('byct-hide-original');
  }

  /**
   * @param {'idle'|'loading'|'done'|'error'|'needs-download'|'skipped'|'pending'|'downloading'} state
   * @param {object} data
   */
  function setState(comment, state, data = {}) {
    const v = mount(comment);
    v.state = state;
    v.root.dataset.byctState = state;

    const { btn, status, block, badge, body, more } = v;
    btn.disabled = false;
    btn.classList.remove('byct-btn-primary');
    status.textContent = '';
    status.className = 'byct-status';

    switch (state) {
      case 'idle':
        btn.textContent = t('btn.translate');
        btn.hidden = false;
        block.hidden = true;
        if (data.detected && data.detected !== 'und') {
          status.textContent = langLabel(data.detected);
        }
        break;

      case 'loading':
        btn.textContent = t('btn.translate');
        btn.hidden = false;
        btn.disabled = true;
        block.hidden = true;
        setStatus(status, t('status.translating'), true);
        break;

      case 'downloading':
        btn.hidden = true;
        block.hidden = true;
        setStatus(status, t('status.downloading', {
          pct: Math.round((data.progress || 0) * 100),
        }), true);
        break;

      case 'needs-download':
        btn.textContent = t('btn.enableLang', { lang: langLabel(data.detected) });
        btn.hidden = false;
        btn.classList.add('byct-btn-primary');
        block.hidden = true;
        status.textContent = t('status.needsDownload');
        break;

      case 'done': {
        btn.textContent = t(data.showing === false ? 'btn.showTranslation' : 'btn.showOriginal');
        btn.hidden = false;
        block.hidden = data.showing === false;

        badge.hidden = !data.showBadge;
        badge.textContent = `${langLabel(data.detected)} → ${langLabel(data.target)}`
          + (data.engineLabel ? ` · ${data.engineLabel}` : '')
          // 영어 경유 2단계 번역은 품질이 떨어지므로 이유를 밝혀둔다
          + (data.pivot ? ` · ${t('badge.viaPivot', { lang: langLabel(data.pivot) })}` : '');

        body.textContent = data.text || '';
        body.classList.add('byct-clamp');
        more.textContent = t('btn.more');
        // 실제로 넘칠 때만 "더보기" 노출
        requestAnimationFrame(() => {
          const overflow = body.scrollHeight - body.clientHeight > 4;
          more.hidden = !overflow;
          if (!overflow) body.classList.remove('byct-clamp');
        });
        break;
      }

      case 'error':
        btn.textContent = t('btn.retry');
        btn.hidden = false;
        block.hidden = true;
        status.textContent = data.message || t('status.failed');
        status.classList.add('byct-status-error');
        break;

      // pending: 언어 감지 전. 아직 아무것도 보여주지 않는다
      // (이미 목표 언어인 댓글에 "번역" 버튼이 잠깐 깜빡이는 것을 막는다)
      case 'pending':
      case 'skipped':
        btn.hidden = true;
        block.hidden = true;
        status.textContent = '';
        break;
    }
    return v;
  }

  function onClick(comment, handler) {
    const v = mount(comment);
    if (v.btn.dataset.bound) return;
    v.btn.dataset.bound = '1';
    v.btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler(v);
    });
  }

  // ---------- 토스트 ----------

  let toastEl = null;
  let toastTimer = null;
  function toast(text, ms = 1800) {
    if (!toastEl) {
      toastEl = el('div', 'byct-toast byct-injected');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('byct-toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('byct-toast-show'), ms);
  }

  BYCT.ui = { mount, get, unmount, setState, onClick, toast, langLabel };
})(globalThis.BYCT);
