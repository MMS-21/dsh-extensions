import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import Handler


class ControlHttpTests(unittest.TestCase):
    def test_approval_and_legacy_mutation_cannot_bypass_control_channel(self):
        class Local(Handler):
            control_token='a'*64
        server=ThreadingHTTPServer(('127.0.0.1',0),Local)
        port=server.server_port
        Local.allowed_hosts={f'127.0.0.1:{port}'}
        Local.allowed_origins=set()
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        opener=build_opener(ProxyHandler({}))
        try:
            for path in ['/api/changes/approve','/api/changes/apply','/api/changes/rollback','/api/changes/processing-approve','/api/changes/processing-run','/api/reload','/api/attach','/api/refresh/run']:
                request=Request(f'http://127.0.0.1:{port}'+path,data=b'{"approved":true}',
                    headers={'Content-Type':'application/json','X-PBI-Live-Designer':'1'},method='POST')
                with self.assertRaises(HTTPError) as caught:
                    opener.open(request,timeout=3)
                self.assertEqual(caught.exception.code,403)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)
