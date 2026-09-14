"""Same-origin lead receiver. Only Python standard library is required."""
import contextlib
import datetime as dt
import fcntl
import hashlib
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import math
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

LOG = logging.getLogger('chezakvest-leads')
MAP = json.loads(Path(__file__).with_name('amo-map.json').read_text())
KINDS = {'booking': 'Бронь квеста', 'prebooking': 'Предварительная бронь',
         'party': 'Праздник', 'callback': 'Обратный звонок'}
LIMITS = {'name': 80, 'comment': 1000, 'form': 100, 'formTitle': 250, 'pageUrl': 1500,
          'pageTitle': 300, 'pageSlug': 150, 'pageType': 40, 'quest': 200, 'venue': 200,
          'referrer': 1500, 'utm_referrer': 1500, 'ym_uid': 100, 'roistat_visit': 100,
          'yclid': 250, 'gclid': 250, **{f'utm_{k}': 250 for k in ['source','medium','campaign','content','term']}}


def load_env(path):
    """Read local credentials without evaluating shell or logging values."""
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.removeprefix('export ').split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('\"\''))


def clean(value):
    if not isinstance(value, str):
        raise ValueError('Expected text')
    return re.sub(r'[\x00-\x1f\x7f]', ' ', re.sub(r'<[^>]*>', '', html.unescape(value))).strip()


def phone(value):
    if not isinstance(value, str) or not re.fullmatch(r'[+\d ()\-]+', value, re.ASCII):
        raise ValueError('phone')
    digits = re.sub(r'\D', '', value)
    if len(digits) == 10:
        digits = '7' + digits
    if len(digits) == 11 and digits[0] == '8':
        digits = '7' + digits[1:]
    if not re.fullmatch(r'7[0-9]{10}', digits):
        raise ValueError('phone')
    return '+' + digits


def allowed_url(value, hosts):
    try:
        url = urllib.parse.urlsplit(value)
        return url.scheme in ('http', 'https') and url.hostname in hosts and not url.username and not url.password
    except ValueError:
        return False


def validate(data, hosts):
    if not isinstance(data, dict):
        raise ValueError('JSON object required')
    # Silent bot rejection happens before normal field validation.
    started = data.get('startedAt')
    if data.get('website') or (isinstance(started, (int, float)) and time.time()*1000 - started < 3000):
        return None
    if isinstance(started, bool) or not isinstance(started, (int, float)) or not math.isfinite(started):
        raise ValueError('startedAt')
    result = {key: clean(data.get(key, '')) for key in LIMITS}
    if any(len(result[k]) > limit for k, limit in LIMITS.items()):
        raise ValueError('Field too long')
    if len(result['name']) < 2 or data.get('consent') is not True:
        raise ValueError('Name and consent required')
    result['phone'] = phone(data.get('phone'))
    if result['form'] not in KINDS and not re.fullmatch(r'snapshot-[\w-]+', result['form']):
        raise ValueError('form')
    if not allowed_url(result['pageUrl'], hosts):
        raise ValueError('pageUrl')
    result['date'] = data.get('date') or ''
    if result['date']:
        if not isinstance(result['date'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', result['date']):
            raise ValueError('date')
        dt.date.fromisoformat(result['date'])
    result['consent'] = True
    return result


class Amo:
    def __init__(self, base=None):
        subdomain = os.environ.get('AMOCRM_SUBDOMAIN', '')
        if base is None and not re.fullmatch(r'[a-zA-Z0-9-]+', subdomain):
            raise ValueError('AMOCRM_SUBDOMAIN missing or invalid')
        self.base = base or f'https://{subdomain}.amocrm.ru/api/v4'
        self.token = os.environ.get('AMOCRM_TOKEN', '')
        self.enums = None

    def request(self, method, path, data=None):
        request = urllib.request.Request(self.base + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'}, method=method)
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read()
            return json.loads(body) if body else {}

    def fields(self, entity='leads'):
        fields = []
        page = 1
        while True:
            result = self.request('GET', f'/{entity}/custom_fields?limit=250&page={page}')
            fields.extend(result.get('_embedded', {}).get('custom_fields', []))
            if not result.get('_links', {}).get('next'):
                return fields
            page += 1

    def custom_fields(self, lead):
        if self.enums is None:
            self.enums = {field['id']: {enum['value']: enum['id'] for enum in field.get('enums') or []}
                          for field in self.fields()}
        values = {**lead, 'ym_counter': '48864086'}
        if values.get('date'):
            values['date'] = int(dt.datetime.combine(dt.date.fromisoformat(values['date']), dt.time(), ZoneInfo('Europe/Moscow')).timestamp())
        result = [{'field_id': field_id, 'values': [{'value': values[key]}]}
                  for key, field_id in MAP['fields'].items() if values.get(key)]
        selects = {'source': 'Наш сайт',
                   'venue': MAP['venue_aliases'].get(lead['venue'], lead['venue']),
                   'quest': MAP['quest_aliases'].get(lead['quest'], lead['quest']),
                   'occasion': 'День рождения' if lead['form'] == 'party' or lead['pageType'] == 'holiday' else ''}
        for key, value in selects.items():
            field_id = MAP['selects'][key]['id']
            enum_id = self.enums.get(field_id, {}).get(value)
            if enum_id:
                result.append({'field_id': field_id, 'values': [{'enum_id': enum_id}]})
        return result

    def deliver(self, record, checkpoint):
        lead = record['lead']
        test = lead['phone'] == os.environ.get('LEAD_TEST_PHONE', '+79000000000')
        if not record.get('contact_id'):
            contacts = self.request('GET', '/contacts?query=' + urllib.parse.quote(lead['phone'])).get('_embedded', {}).get('contacts', [])
            contact_id = None
            for contact in contacts:
                for field in contact.get('custom_fields_values') or []:
                    if field.get('field_id') != MAP['contact_phone']:
                        continue
                    for value in field.get('values', []):
                        try:
                            if phone(value.get('value')) == lead['phone']:
                                contact_id = contact['id']
                        except ValueError:
                            pass
            if not contact_id:
                contact = self.request('POST', '/contacts', [{'name': lead['name'], 'custom_fields_values': [
                    {'field_id': MAP['contact_phone'], 'values': [{'value': lead['phone'], 'enum_code': 'WORK'}]}]}])
                contact_id = contact['_embedded']['contacts'][0]['id']
            record['contact_id'] = contact_id
            checkpoint()
        if not record.get('lead_id'):
            kind = KINDS.get(lead['form'], 'Форма сайта')
            tags = ['Сайт', 'Ростов', kind, lead['quest'] or lead['pageTitle']]
            if test:
                tags.append('ТЕСТ сайта')
            created = self.request('POST', '/leads', [{
                'name': f"Заявка с сайта: {lead['formTitle']} — {lead['pageTitle']}"[:255],
                'pipeline_id': 5519260 if test else int(os.environ.get('AMO_PIPELINE_ID', '6429238')),
                'status_id': 48805513 if test else int(os.environ.get('AMO_STATUS_ID', '54964090')),
                'custom_fields_values': self.custom_fields(lead),
                '_embedded': {'contacts': [{'id': record['contact_id']}], 'tags': [{'name': tag[:100]} for tag in dict.fromkeys(tags) if tag]}
            }])
            record['lead_id'] = created['_embedded']['leads'][0]['id']
            checkpoint()
        if test and not record.get('closed'):
            self.request('PATCH', f"/leads/{record['lead_id']}", {'status_id': 143})
            record['closed'] = True
            checkpoint()
        if not record.get('noted'):
            self.request('POST', f"/leads/{record['lead_id']}/notes", [{'note_type': 'common', 'params': {'text': note(record)}}])
            record['noted'] = True
            checkpoint()


def note(record):
    lead = record['lead']
    labels = {'name': 'Имя', 'phone': 'Телефон', 'pageUrl': 'Страница', 'pageTitle': 'Заголовок',
              'pageSlug': 'Слаг', 'pageType': 'Тип страницы', 'form': 'Вид формы', 'formTitle': 'Форма',
              'quest': 'Квест', 'venue': 'Площадка', 'date': 'Желаемая дата', 'comment': 'Комментарий'}
    lines = [f'{labels.get(key, key)}: {value}' for key, value in lead.items() if value and key != 'consent']
    lines += ['Согласие: получено', 'Устройство: ' + record['device'],
              'Отправлено (Москва): ' + dt.datetime.fromtimestamp(record['created'], ZoneInfo('Europe/Moscow')).isoformat(timespec='seconds')]
    return '\n'.join(lines)


def device(agent):
    platform = next((x for x in ['Android', 'iPhone', 'iPad', 'Windows', 'Macintosh', 'Linux'] if x in agent), 'Другое')
    browser = next((x for x in ['Edg', 'Firefox', 'Chrome', 'Safari'] if x in agent), 'Браузер')
    return f'{platform}, {browser}'


class Store:
    def __init__(self, root, amo):
        self.root, self.amo = Path(root), amo
        for name in ['queue', 'failed', 'done']:
            (self.root / name).mkdir(parents=True, exist_ok=True, mode=0o700)

    @contextlib.contextmanager
    def lock(self, name='.lock', blocking=True):
        with open(self.root / name, 'a') as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
            except BlockingIOError:
                yield False
                return
            yield True

    @staticmethod
    def save(path, data):
        temp = path.with_suffix('.tmp')
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as handle:
            json.dump(data, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)

    def attempt(self, path, record):
        try:
            self.amo.deliver(record, lambda: self.save(path, record))
        except Exception as exc:
            code = exc.code if isinstance(exc, urllib.error.HTTPError) else type(exc).__name__
            LOG.error('LEAD QUEUED amo=%s phone=+7******%s', code, record['lead']['phone'][-4:])
            return False
        self.save(self.root / 'done' / path.name, {'created': record['created']})
        path.unlink()
        return True

    def accept(self, lead, agent):
        parsed = urllib.parse.urlsplit(lead['pageUrl'])
        key = hashlib.sha256((lead['phone'] + parsed.netloc + parsed.path).encode()).hexdigest()
        with self.lock('.ingest.lock'):
            pending = self.root / 'queue' / (key + '.json')
            done = self.root / 'done' / pending.name
            if pending.exists() or (done.exists() and time.time() - json.loads(done.read_text())['created'] < 600):
                return
            record = {'created': time.time(), 'lead': lead, 'device': device(agent)}
            self.save(pending, record)
        # Intake is durable before trying the delivery lock. A timer batch or a slow
        # CRM request must never keep fresh requests waiting in process memory.
        with self.lock(blocking=False) as available:
            if available and pending.exists():
                self.attempt(pending, json.loads(pending.read_text()))

    def retry(self):
        with self.lock():
            for path in (self.root / 'queue').glob('*.json'):
                record = json.loads(path.read_text())
                if time.time() - record['created'] >= 86400:
                    os.replace(path, self.root / 'failed' / f'{path.stem}-{int(record["created"])}.json')
                    LOG.critical('LEAD FAILED after 24 hours: %s', path.name)
                else:
                    self.attempt(path, record)
            for path in (self.root / 'done').glob('*.json'):
                if time.time() - json.loads(path.read_text())['created'] >= 600:
                    path.unlink()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # URLs and request lines may contain personal data.

    def respond(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(200 if self.path == '/api/lead/health' else 404, {'ok': self.path == '/api/lead/health'})

    def do_POST(self):
        if self.path != '/api/lead':
            return self.respond(404, {'ok': False})
        origin, referer = self.headers.get('Origin'), self.headers.get('Referer')
        if not (origin or referer) or any(not allowed_url(v, self.server.hosts) for v in [origin, referer] if v):
            return self.respond(403, {'ok': False})
        if self.headers.get_content_type() != 'application/json':
            return self.respond(415, {'ok': False})
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if self.headers.get('Transfer-Encoding') or not 0 < length <= 8192:
            return self.respond(413, {'ok': False})
        try:
            self.connection.settimeout(10)
            data = json.loads(self.rfile.read(length))
            lead = validate(data, self.server.hosts)
        except (ValueError, TypeError, UnicodeError, TimeoutError):
            return self.respond(400, {'ok': False})
        try:
            if lead:
                self.server.store.accept(lead, self.headers.get('User-Agent', ''))
        except OSError:
            LOG.critical('LEAD storage unavailable')
            return self.respond(503, {'ok': False})
        self.respond(200, {'ok': True})


def main():
    logging.basicConfig(level=logging.INFO)
    server = ThreadingHTTPServer(('127.0.0.1', 8790), Handler)
    server.hosts = set(os.environ.get('LEAD_ALLOWED_HOSTS', '82.146.60.212,chezakvest.com,www.chezakvest.com,xn--80aehcht5ci1b.xn--p1ai,www.xn--80aehcht5ci1b.xn--p1ai').split(','))
    server.store = Store(os.environ.get('LEAD_STATE_DIR', '/var/lib/chezakvest-leads'), Amo())
    server.serve_forever()


if __name__ == '__main__':
    main()
