/* 실제 youtube.com 의 ytd-comment-view-model 구조를 재현해 댓글 노드를 생성한다.
   (2026-08 기준 실측: #main > #header / ytd-expander#expander > #content > yt-attributed-string#content-text
    > ytd-tri-state-button-view-model.translate-button[hidden] > ytd-comment-engagement-bar#action-buttons) */
(function () {
  'use strict';

  /** @param {{author:string, time:string, html:string, ytBtn?:boolean}} c */
  function commentEl(c) {
    const node = document.createElement('ytd-comment-view-model');
    node.id = 'comment';
    node.innerHTML = `
      <div id="body">
        <div id="author-thumbnail">
          <button id="author-thumbnail-button"><yt-img-shadow><img id="img" alt=""></yt-img-shadow></button>
        </div>
        <div id="main">
          <div id="header">
            <div id="header-author">
              <h3><a id="author-text"><span>${c.author}</span></a></h3>
              <span id="published-time-text"><a>${c.time}</a></span>
            </div>
          </div>
          <ytd-expander id="expander">
            <div id="content">
              <yt-attributed-string id="content-text"><span
                class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap"
                dir="auto" role="text">${c.html}</span></yt-attributed-string>
            </div>
            <tp-yt-paper-button id="more"><span class="more-button">더보기</span></tp-yt-paper-button>
            <tp-yt-paper-button id="less"><span class="less-button">간략히</span></tp-yt-paper-button>
          </ytd-expander>
          <yt-attributed-string id="error-text"></yt-attributed-string>
          <ytd-tri-state-button-view-model class="translate-button" state="untoggled"
            ${c.ytBtn ? '' : 'hidden=""'}>
            <tp-yt-paper-button>${c.ytBtn ? '한국어로 번역' : ''}</tp-yt-paper-button>
          </ytd-tri-state-button-view-model>
          <ytd-comment-engagement-bar id="action-buttons">
            <div id="toolbar">
              <ytd-toggle-button-renderer id="like-button">좋아요</ytd-toggle-button-renderer>
              <span id="vote-count-middle">1.2만</span>
              <ytd-button-renderer id="reply-button-end">답글</ytd-button-renderer>
            </div>
          </ytd-comment-engagement-bar>
        </div>
      </div>`;
    return node;
  }

  function threadEl(c) {
    const t = document.createElement('ytd-comment-thread-renderer');
    t.appendChild(commentEl(c));
    if (c.replies && c.replies.length) {
      const r = document.createElement('ytd-comment-replies-renderer');
      r.id = 'replies';
      const box = document.createElement('div');
      box.id = 'expander-contents';
      c.replies.forEach((rc) => box.appendChild(commentEl(rc)));
      r.appendChild(box);
      t.appendChild(r);
    }
    return t;
  }

  const BATCH_1 = [
    { author: '@YouTube', time: '1년 전', html: 'can confirm: he never gave us up',
      replies: [
        { author: '@user_es', time: '3주 전', html: 'Nunca pensé que este video fuera eliminado, ni por un segundo.' },
        { author: '@user_ko', time: '2주 전', html: '이건 진짜 레전드다 ㅋㅋㅋ' },
      ] },
    { author: '@MariahRhona', time: '3주 전', html: 'who came here saying this video was taken down', ytBtn: true },
    { author: '@日本のファン', time: '1개월 전', html: 'この曲は永遠に色褪せないですね。<br>1987年から2026年まで、ずっと最高です。' },
    { author: '@onlyemoji', time: '2일 전', html: '🔥🔥🔥😂😂' },                              // 건너뛰어야 함
    { author: '@onlyko', time: '5일 전', html: '와 진짜 오랜만에 듣네요 노래 좋다' },              // 건너뛰어야 함 (목표어=ko)
    { author: '@onlyurl', time: '1일 전', html: 'https://example.com/some/long/path' },        // 건너뛰어야 함
    { author: '@tooshort', time: '3시간 전', html: 'lol' },                                     // 3자 → 번역 대상
    { author: '@timestamps', time: '4일 전', html: '0:43 1:52 3:07' },                          // 건너뛰어야 함
    { author: '@mixed', time: '1주 전',
      html: 'Merci <img class="emoji" alt=":heart:" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="> ' +
            'pour cette vidéo <a href="#">@RickAstley</a> — regardez à 2:14, c\'est incroyable !' },
    { author: '@longone', time: '2주 전',
      html: 'I remember watching this back in 2008 when the rickroll was just starting to spread across forums, ' +
            'and honestly nobody could have predicted that almost two decades later we would still be doing this exact same joke. ' +
            'The staying power of this song is genuinely remarkable when you think about it, because it stopped being about the music ' +
            'a long time ago and became this shared cultural artifact that everyone on the internet just silently agreed to keep alive forever. ' +
            'Rick himself has been such a good sport about the whole thing too, which honestly makes it even better.' },
  ];

  const BATCH_2 = [
    { author: '@deutsch', time: '6일 전', html: 'Das ist einfach der beste Song, den es jemals gab. Niemand kann mir widersprechen!' },
    { author: '@brasil', time: '1주 전', html: 'Não acredito que caí nessa de novo, mas a música é boa demais.' },
    { author: '@россия', time: '2주 전', html: 'Кто здесь после того поста про удаление видео?' },
    { author: '@viet', time: '3일 전', html: 'Bài này của tuổi thơ mình, không thể nào quên được' },
  ];

  function render(list, target) {
    const frag = document.createDocumentFragment();
    list.forEach((c) => frag.appendChild(threadEl(c)));
    target.appendChild(frag);
  }

  window.HARNESS = {
    BATCH_1, BATCH_2, render, commentEl, threadEl,
    contents: () => document.querySelector('#comments #contents'),
  };

  // 초기 렌더
  render(BATCH_1, document.querySelector('#comments #contents'));
})();
