# 개인정보 처리방침 / Privacy Policy

**최종 수정: 2026-08-22 · Better YouTube Comment Translation v0.1.0**

## 요약

이 확장 프로그램은 **개발자에게 어떤 데이터도 전송하지 않습니다.** 분석 도구, 추적기, 원격 로깅이 없습니다.
개발자가 운영하는 서버 자체가 없습니다.

## 처리하는 데이터

| 데이터 | 어디로 가나 | 언제 |
|---|---|---|
| 유튜브 댓글 본문 | 선택한 번역 엔진 | 번역할 때만 |
| 사용자 설정 (언어, 엔진 등) | `chrome.storage.sync` (사용자 Google 계정) | 설정 변경 시 |
| 번역 결과 캐시 | `chrome.storage.local` (사용자 기기) | 번역 성공 시 |
| API 키 | `chrome.storage.sync` (사용자 Google 계정) | 사용자가 입력했을 때 |

## 번역 엔진별 데이터 흐름

### Chrome 내장 번역 (기본값)

댓글이 **기기 밖으로 나가지 않습니다.** Chrome이 내려받은 온디바이스 모델이 로컬에서 처리합니다.
네트워크 통신은 최초 모델 다운로드뿐이며, 이는 Chrome 자체 기능이고
[Google 개인정보처리방침](https://policies.google.com/privacy)이 적용됩니다.

### DeepL / Google Cloud Translation / LLM (선택)

사용자가 직접 켜고 API 키를 입력했을 때만 동작합니다. 이 경우 **번역 대상 댓글 본문이
해당 제공자의 서버로 전송됩니다.** 각 제공자의 정책이 적용됩니다:

- [DeepL](https://www.deepl.com/privacy)
- [Google Cloud](https://cloud.google.com/terms/cloud-privacy-notice)
- LLM: 사용자가 지정한 엔드포인트 제공자의 정책

댓글 본문 외에 작성자 이름, 채널 정보, 시청 기록은 **전송하지 않습니다.**

## 권한

| 권한 | 이유 |
|---|---|
| `storage` | 설정과 번역 캐시 저장 |
| `https://*.youtube.com/*` | 댓글을 읽고 번역문을 표시 |
| `https://*/*` (선택) | 사용자가 직접 켠 원격 번역 엔진 호출. **기본으로 부여되지 않으며**, 옵션 화면에서 해당 엔진의 "권한 허용"을 눌렀을 때만 그 도메인에 한해 요청됩니다. 임의의 엔드포인트를 지정하는 LLM 엔진을 지원하기 위해 넓은 패턴이 필요합니다. |

## 하지 않는 것

- 개발자 서버로의 데이터 전송 (서버 없음)
- 분석·통계·텔레메트리 수집
- 광고, 제3자 추적기
- 데이터 판매·공유
- 유튜브 외 사이트 접근
- 로그인 정보, 쿠키, 시청 기록 접근

## 데이터 삭제

- 번역 캐시: 옵션 화면 → **번역 캐시 비우기**
- 설정과 API 키: 확장 프로그램 삭제 시 함께 제거됩니다

## 문의

이슈 트래커로 문의해주세요.

---

## English

This extension sends **no data to the developer**. There is no developer-operated server,
no analytics, and no telemetry.

By default, translation runs **entirely on your device** using Chrome's built-in Translator API;
comment text never leaves your machine.

If you explicitly enable a remote engine (DeepL, Google Cloud Translation, or an OpenAI-compatible
LLM endpoint) and supply your own API key, the text of the comments being translated is sent to
that provider, subject to their privacy policy. Author names, channel data, and watch history
are never transmitted.

Settings and API keys are stored in `chrome.storage.sync`; the translation cache is stored in
`chrome.storage.local`. Both are removed when you uninstall the extension.

The optional `https://*/*` host permission is never granted by default. It is requested only for
the specific origin of a remote engine you turn on, and exists so that user-specified LLM
endpoints can be supported.
