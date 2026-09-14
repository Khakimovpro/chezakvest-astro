"""Local full-stack browser fixture: dist -> HTTP proxy -> receiver -> fake amo."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import tempfile
import threading
import urllib.request
import urllib.error
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from leads.service import Amo, Handler, Store
from leads.tests.fake_amo import fake_server

class Proxy(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

    def do_POST(self):
        if self.path != '/api/lead':
            return self.send_error(404)
        body = self.rfile.read(int(self.headers['Content-Length']))
        request = urllib.request.Request('http://127.0.0.1:8790/api/lead', data=body,
            headers={key:self.headers[key] for key in ['Content-Type','Origin','Referer','User-Agent'] if key in self.headers})
        try:
            response = urllib.request.urlopen(request)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            self.send_response(response.status)
            self.send_header('Content-Type','application/json')
            self.end_headers()
            self.wfile.write(response.read())

    def do_GET(self):
        if self.path == '/_test/calls':
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.end_headers()
            self.wfile.write(json.dumps(self.server.fake.calls).encode())
        else:
            super().do_GET()

if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='cheza-lead-fixture-') as state:
        fake = fake_server()
        lead = ThreadingHTTPServer(('127.0.0.1',8790),Handler)
        lead.hosts = {'127.0.0.1'}
        lead.store = Store(state,Amo(f'http://127.0.0.1:{fake.server_port}/api/v4'))
        threading.Thread(target=lead.serve_forever,daemon=True).start()
        proxy = ThreadingHTTPServer(('127.0.0.1',0),partial(Proxy,directory=sys.argv[1]))
        proxy.fake = fake
        threading.Thread(target=proxy.serve_forever,daemon=True).start()
        print(json.dumps({'url':f'http://127.0.0.1:{proxy.server_port}'}),flush=True)
        try:
            sys.stdin.read()
        finally:
            for server in [proxy,lead,fake]:
                server.shutdown()
                server.server_close()
