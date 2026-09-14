"""HTTP test double: never connects to the real CRM."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
from leads.service import MAP

class FakeHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def handle_request(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length']))) if self.headers.get('Content-Length') else None
        self.server.calls.append((self.command, self.path, data))
        status = self.server.failure if self.server.failure and (not self.server.fail_path or self.server.fail_path in self.path) else 200
        if 'custom_fields' in self.path:
            fields = [{'id': value, 'code': key.upper()} for key, value in MAP['fields'].items()]
            fields += [{'id': item['id'], 'enums': [{'id': index + 1, 'value': value} for index, value in enumerate(item['values'])]} for item in MAP['selects'].values()]
            if '/contacts/' in self.path:
                fields = [{'id': MAP['contact_phone'], 'code': 'PHONE'}]
            body = {'_embedded': {'custom_fields': fields}}
        elif self.path.startswith('/api/v4/contacts?'):
            body = {'_embedded': {'contacts': self.server.contacts}}
        elif self.path == '/api/v4/contacts':
            body = {'_embedded': {'contacts': [{'id': 123}]}}
        elif self.path == '/api/v4/leads':
            body = {'_embedded': {'leads': [{'id': 456}]}}
        else:
            body = {}
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    do_GET = do_POST = do_PATCH = handle_request


def fake_server():
    server = ThreadingHTTPServer(('127.0.0.1', 0), FakeHandler)
    server.calls, server.contacts = [], []
    server.failure, server.fail_path = 0, ''
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
