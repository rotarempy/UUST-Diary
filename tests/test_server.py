import importlib.util
from io import BytesIO
from pathlib import Path
from http.server import ThreadingHTTPServer
from email.message import Message
from threading import Thread
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import ssl
from types import SimpleNamespace
from unittest.mock import patch
import unittest

spec = importlib.util.spec_from_file_location('lectures_server', Path(__file__).resolve().parents[1] / 'serve.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ProxyTest(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}/schedule-source'
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
    def post(self, fields):
        return urlopen(Request(self.url, data=fields.encode()), timeout=2)
    def test_exact_forwarding_and_utf8(self):
        html = '<div>Расписание</div>'
        response = BytesIO(html.encode('cp1251'))
        response.headers = Message(); response.headers['Content-Type'] = 'text/html; charset=windows-1251'
        with patch.object(module, 'urlopen', return_value=response) as upstream:
            with self.post('group_id=14380&week=7&funct=group&show_temp=0') as output:
                self.assertEqual(output.read().decode('utf-8'), html)
            upstream.assert_called_once()
            request = upstream.call_args.args[0]
            self.assertEqual(dict(request.header_items()), {
                "Referer": module.SOURCE_PAGE, "Origin": "https://isu.uust.ru"})
            self.assertEqual(request.full_url, module.SOURCE)
            self.assertEqual(request.data.decode(), 'group_id=14380&week=7&funct=group&show_temp=0')
    def test_rejects_unknown_fields(self):
        with patch.object(module, 'urlopen') as upstream:
            with self.assertRaises(HTTPError) as error: self.post('url=https://other-site.example')
            self.assertEqual(error.exception.code, 400); error.exception.close(); upstream.assert_not_called()
    def test_upstream_status_is_not_hidden(self):
        with patch.object(module, 'urlopen', side_effect=HTTPError(module.SOURCE, 403, 'Forbidden', None, None)):
            with self.assertRaises(HTTPError) as error: self.post('group_id=14380&week=7&funct=group_name')
            payload = __import__('json').loads(error.exception.read().decode('utf-8'))
            self.assertEqual(payload['source_status'], 403)
            self.assertIn('HTTP 403', payload['error'])
            error.exception.close()
    def test_health_identifies_new_server(self):
        with urlopen(self.url.replace('/schedule-source', '/schedule-health')) as response:
            payload = __import__('json').loads(response.read().decode('utf-8'))
            self.assertEqual(payload['version'], '20261013-13')
            self.assertEqual(response.headers.get('Cache-Control'), 'no-store')
    def test_source_failure_is_502(self):
        with patch.object(module, 'urlopen', side_effect=OSError('offline')):
            with self.assertRaises(HTTPError) as error: self.post('group_id=14380&week=7&funct=group_name')
            self.assertEqual(error.exception.code, 502)
            self.assertIn('error', __import__('json').loads(error.exception.read().decode('utf-8')))
            error.exception.close()

    def test_certificate_failure_has_actionable_diagnostic(self):
        for wrapped in (False, True):
            failure = ssl.SSLCertVerificationError(1, 'certificate verify failed')
            if wrapped:
                failure = URLError(failure)
            with self.subTest(wrapped=wrapped), patch.object(module, 'urlopen', side_effect=failure):
                with self.assertRaises(HTTPError) as error:
                    self.post('group_id=14380&week=7&funct=group_name')
                self.assertEqual(error.exception.code, 502)
                payload = __import__('json').loads(error.exception.read())
                self.assertEqual(payload['code'], 'source_certificate_error')
                self.assertIn('requirements.txt', payload['error'])
                error.exception.close()


class TLSContextTest(unittest.TestCase):
    def test_missing_dependencies_keep_verification_enabled(self):
        with patch.dict('sys.modules', {'truststore': None, 'certifi': None}):
            context, backend = module.create_source_context()
        self.assertEqual(backend, 'python')
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)

    def test_native_context_and_ca_files_are_used(self):
        from unittest.mock import Mock
        context = Mock()
        native = SimpleNamespace(SSLContext=Mock(return_value=context))
        bundle = SimpleNamespace(where=lambda: '/test/roots.pem')
        with patch.dict('sys.modules', {'truststore': native, 'certifi': bundle}):
            result, backend = module.create_source_context('/test/company.pem')
        self.assertIs(result, context)
        native.SSLContext.assert_called_once_with(ssl.PROTOCOL_TLS_CLIENT)
        self.assertEqual(backend, 'system+certifi+custom')
        self.assertEqual(context.load_verify_locations.call_count, 2)
        context.load_verify_locations.assert_any_call(cafile='/test/roots.pem')
        context.load_verify_locations.assert_any_call(cafile='/test/company.pem')
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)

    def test_invalid_ca_file_is_not_ignored(self):
        with self.assertRaises(OSError):
            module.create_source_context('/nonexistent/lectures-ca.pem')

if __name__ == '__main__': unittest.main()
