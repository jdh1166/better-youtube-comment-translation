/* 동시 실행 수를 제한하는 작업 큐.
   - 같은 키의 작업이 이미 대기/진행 중이면 그 Promise를 재사용(중복 번역 방지)
   - 우선순위 지원: 화면에 보이는 댓글을 먼저 번역한다 */
(function (BYCT) {
  'use strict';

  function createQueue(concurrency = 3) {
    const pending = [];            // {key, fn, priority, resolve, reject}
    const inflight = new Map();    // key -> Promise
    let running = 0;

    function pump() {
      while (running < concurrency && pending.length) {
        // 우선순위 높은(숫자 큰) 것부터
        let bi = 0;
        for (let i = 1; i < pending.length; i++) {
          if (pending[i].priority > pending[bi].priority) bi = i;
        }
        const task = pending.splice(bi, 1)[0];
        running++;
        Promise.resolve()
          .then(task.fn)
          .then(task.resolve, task.reject)
          .finally(() => {
            running--;
            inflight.delete(task.key);
            pump();
          });
      }
    }

    /** @param {string} key 중복 제거용 키 @param {()=>Promise} fn */
    function push(key, fn, priority = 0) {
      if (inflight.has(key)) return inflight.get(key);
      const p = new Promise((resolve, reject) => {
        pending.push({ key, fn, priority, resolve, reject });
      });
      inflight.set(key, p);
      pump();
      return p;
    }

    /** 대기 중(아직 시작 안 한) 작업의 우선순위를 올린다 */
    function bump(key, priority) {
      const t = pending.find((x) => x.key === key);
      if (t && priority > t.priority) t.priority = priority;
    }

    function setConcurrency(n) {
      concurrency = Math.max(1, Math.min(8, n | 0));
      pump();
    }

    function clearPending() {
      while (pending.length) {
        const t = pending.pop();
        inflight.delete(t.key);
        t.reject(Object.assign(new Error('cancelled'), { __cancelled: true }));
      }
    }

    const stats = () => ({ running, pending: pending.length });

    return { push, bump, setConcurrency, clearPending, stats };
  }

  BYCT.createQueue = createQueue;
})(globalThis.BYCT);
