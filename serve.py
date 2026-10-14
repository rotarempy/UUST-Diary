#!/usr/bin/env python3
"""Serve Lectures and forward the official UUST POST API with verified TLS."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPCookieProcessor, HTTPSHandler
from urllib.error import HTTPError, URLError
from http.cookiejar import CookieJar
from threading import Lock
import ssl
import socket

SOURCE = 'https://isu.uust.ru/module/schedule/schedule_2024_script.php'
SOURCE_PAGE = 'https://isu.uust.ru/class_schedule/'
def create_source_context(cafile=None):
    # Native trust uses Windows/macOS certificate stores and chain building.
    # Do not inject globally or disable certificate/hostname verification.
    try:
        import truststore
    except ImportError:
        context = ssl.create_default_context()
        backend = 'python'
    else:
        context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        backend = 'system'
    try:
        import certifi
    except ImportError:
        pass
    else:
        context.load_verify_locations(cafile=certifi.where())
        backend += '+certifi'
    if cafile:
        context.load_verify_locations(cafile=cafile)
        backend += '+custom'
    context.verify_mode = ssl.CERT_REQUIRED
    context.check_hostname = True
    return context, backend


def configure_source(cafile=None):
    global SOURCE_OPENER, urlopen, TLS_BACKEND
    context, TLS_BACKEND = create_source_context(cafile)
    SOURCE_OPENER = build_opener(HTTPSHandler(context=context), HTTPCookieProcessor(CookieJar()))
    urlopen = SOURCE_OPENER.open


configure_source()
SESSION_LOCK = Lock()


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.command in ('GET', 'HEAD'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == '/schedule-health':
            self.json_response(200, {'version': '20261013-13', 'proxy': True, 'tls': TLS_BACKEND})
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != '/schedule-source':
            self.send_error(404); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096:
                raise ValueError('Неверный размер запроса')
            values = parse_qs(self.rfile.read(length).decode('utf-8'), keep_blank_values=True)
            if any(len(value) != 1 for value in values.values()):
                raise ValueError('Повторяющиеся параметры')
            form = {key: value[0] for key, value in values.items()}
            action = form.get('funct')
            required = {'filter_group': {'text_search_group', 'week', 'funct'},
                        'group_name': {'group_id', 'week', 'funct'},
                        'group': {'group_id', 'week', 'funct', 'show_temp'}}
            if action not in required or set(form) != required[action]:
                raise ValueError('Неизвестные параметры')
            if not form['week'].isdigit() or not 1 <= int(form['week']) <= 60:
                raise ValueError('Неверная неделя')
            if 'group_id' in form and (not form['group_id'].isdigit() or int(form['group_id']) < 1):
                raise ValueError('Неверная группа')
            if action == 'group' and form['show_temp'] != '0':
                raise ValueError('Неверный режим')
            # Match the direct urllib POST confirmed working on the user's PC.
            # No preliminary page request and no custom browser/bot headers.
            request = Request(SOURCE, data=urlencode(form).encode(), headers={
                'Referer': SOURCE_PAGE, 'Origin': 'https://isu.uust.ru'})
            with SESSION_LOCK:
                response = urlopen(request, timeout=20)
            with response:
                payload = response.read(8 * 1024 * 1024 + 1)
                if len(payload) > 8 * 1024 * 1024:
                    raise ValueError('Слишком большой ответ источника')
                charset = response.headers.get_content_charset() or 'utf-8'
                payload = payload.decode(charset).encode('utf-8')
                content_type = 'text/html; charset=utf-8'
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers(); self.wfile.write(payload)
        except HTTPError as error:
            self.log_error("UUST HTTP error: %s", error.code)
            self.json_response(502, {'code': 'source_http_error', 'error': f'Сайт УУНиТ ответил HTTP {error.code}', 'source_status': error.code})
        except URLError as error:
            reason = error.reason
            self.log_error("UUST connection error: %s: %s", type(reason).__name__, reason)
            if isinstance(reason, ssl.SSLCertVerificationError):
                self.certificate_error(reason)
                return
            elif isinstance(reason, socket.gaierror):
                message = 'Не удалось найти сервер сайта УУНиТ'
            elif isinstance(reason, (TimeoutError, socket.timeout)):
                message = 'Сайт УУНиТ не ответил вовремя'
            else:
                message = 'Не удалось соединиться с сайтом УУНиТ'
            self.json_response(502, {'code': 'source_connection_error', 'error': message})
        except ssl.SSLCertVerificationError as error:
            self.certificate_error(error)
        except (TimeoutError, socket.timeout):
            self.json_response(504, {'code': 'source_timeout', 'error': 'Сайт УУНиТ не ответил вовремя'})
        except UnicodeError:
            self.json_response(502, {'code': 'source_encoding_error', 'error': 'Не удалось прочитать кодировку ответа сайта УУНиТ'})
        except ValueError:
            self.json_response(400, {'code': 'invalid_request', 'error': 'Локальный сервер отклонил параметры запроса'})
        except OSError as error:
            self.log_error("UUST connection error: %s: %s", type(error).__name__, error)
            self.json_response(502, {'code': 'source_connection_error', 'error': 'Не удалось соединиться с сайтом УУНиТ'})

    def certificate_error(self, error):
        self.log_error('UUST TLS verification failed: %s', error)
        self.json_response(502, {
            'code': 'source_certificate_error',
            'error': 'Не удалось проверить сертификат сайта УУНиТ. '
                     'Установите зависимости: python -m pip install -U -r requirements.txt, '
                     'затем перезапустите serve.py. Если ошибка остаётся, см. раздел SSL в README-WEB.md.',
            'tls': TLS_BACKEND,
        })

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--ca-file', help='Дополнительный доверенный CA-сертификат (PEM)')
    args = parser.parse_args()
    if args.ca_file:
        try:
            configure_source(args.ca_file)
        except (OSError, ssl.SSLError) as error:
            parser.error(f'Не удалось загрузить CA-файл: {error}')
    docs = Path(__file__).resolve().parent / 'docs'
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(docs)))
    print(f'Откройте http://localhost:{args.port}', flush=True)
    print(f'Проверка сертификатов: {TLS_BACKEND}', flush=True)
    if TLS_BACKEND != 'system+certifi' and not TLS_BACKEND.startswith('system+certifi+'):
        print('Для загрузки расписания установите зависимости: python -m pip install -U -r requirements.txt', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
