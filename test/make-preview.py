"""확장 컨텍스트 밖(로컬 http 서버)에서 팝업/옵션 UI를 눈으로 확인하기 위한
미리보기 페이지를 생성한다. chrome.* 목 객체를 코어 스크립트보다 먼저 끼워 넣는다.

    python test/make-preview.py
    # http://localhost:8731/test/_preview/options.html
    # http://localhost:8731/test/_preview/popup.html
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', '_preview')

REWRITES = [
    ('href="shared.css"', 'href="../../src/ui/shared.css"'),
    ('href="options.css"', 'href="../../src/ui/options.css"'),
    ('href="popup.css"', 'href="../../src/ui/popup.css"'),
    ('src="../core/', 'src="../../src/core/'),
    ('src="options.js"', 'src="../../src/ui/options.js"'),
    ('src="popup.js"', 'src="../../src/ui/popup.js"'),
]

SHIM_TAG = '<script src="../harness-shim.js"></script>'
ANCHOR = '<script src="../../src/core/constants.js">'


def main():
    os.makedirs(OUT, exist_ok=True)
    for name in ('options.html', 'popup.html'):
        src_path = os.path.join(ROOT, 'src', 'ui', name)
        s = io.open(src_path, encoding='utf-8').read()
        for old, new in REWRITES:
            s = s.replace(old, new)
        # chrome.* 목 객체는 반드시 코어 스크립트보다 먼저 실행돼야 한다
        s = s.replace(ANCHOR, SHIM_TAG + '\n  ' + ANCHOR, 1)
        out_path = os.path.join(OUT, name)
        io.open(out_path, 'w', encoding='utf-8', newline='\n').write(s)
        print('생성:', os.path.relpath(out_path, ROOT))


if __name__ == '__main__':
    main()
