"""테스트용 정적 서버.

`python -m http.server` 를 쓰면 브라우저가 JS 를 캐시해서, 고친 코드가 아니라
예전 코드로 검증하게 되는 일이 생긴다. 여기서는 캐시를 완전히 끈다.

    python test/serve.py [포트]
    # 기본 http://localhost:8731
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass    # 요청 로그는 시끄럽기만 하다


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'serving {ROOT} at http://localhost:{port} (no-cache)')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
