from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

from leads.service import Amo, Handler, MAP, Store, phone, validate
from leads.tests.fake_amo import fake_server


def payload(**changes):
    return {'name': 'Анна', 'phone': '+79282163623', 'consent': True, 'startedAt': time.time()*1000-4000,
            'form': 'party', 'formTitle': 'Праздник', 'pageUrl': 'https://chezakvest.com/kids/',
            'pageTitle': 'Детский праздник', 'pageSlug': 'kids', 'pageType': 'holiday',
            'quest': 'Игра в Кальмара', 'venue': 'ул. 40-летия Победы, 216', 'date': '2026-10-01',
            'comment': '<b>Десять гостей</b>\x00', 'utm_source': 'test', 'utm_medium': 'cpc',
            'utm_campaign': 'autumn', 'utm_content': 'button', 'utm_term': 'quest', 'ym_uid': '12345',
            'roistat_visit': '9876', 'referrer': 'https://example.com/', 'utm_referrer': 'search',
            'yclid': 'yclid-value', 'gclid': 'gclid-value', **changes}


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'LEAD_TEST_PHONE': '+79000000000', 'AMO_PIPELINE_ID': '6429238', 'AMO_STATUS_ID': '54964090'})
        self.env.start()
        self.temp = tempfile.TemporaryDirectory()
        self.fake = fake_server()
        self.store = Store(self.temp.name, Amo(f'http://127.0.0.1:{self.fake.server_port}/api/v4'))
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.http.store, self.http.hosts = self.store, {'chezakvest.com'}
        threading.Thread(target=self.http.serve_forever, daemon=True).start()

    def tearDown(self):
        for server in [self.http, self.fake]:
            server.shutdown()
            server.server_close()
        self.temp.cleanup()
        self.env.stop()

    def post(self, data=None, headers=None, raw=None):
        body = raw if raw is not None else json.dumps(payload() if data is None else data).encode()
        headers = {'Content-Type': 'application/json', 'Origin': 'https://chezakvest.com', **(headers or {})}
        request = urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}/api/lead', data=body, headers=headers)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def calls(self, method, path):
        return [data for m, p, data in self.fake.calls if m == method and p == path]

    def test_phone(self):
        for value in ['8 (928) 216-36-23', '9282163623', '+79282163623']:
            self.assertEqual(phone(value), '+79282163623')
        for value in ['+19282163623', '123', 'abc79282163623', None]:
            with self.assertRaises(ValueError): phone(value)

    def test_bots_are_silent(self):
        for item in [payload(website='bot'), payload(startedAt=time.time()*1000)]:
            self.assertEqual(self.post(item), (200, {'ok': True}))
        self.assertEqual(self.fake.calls, [])
        self.assertEqual(list((Path(self.temp.name)/'queue').iterdir()), [])

    def test_origin_content_type_size_and_validation(self):
        for headers in [{'Origin': 'https://evil.test'}, {'Origin': 'null'}, {'Referer': 'https://evil.test/a'}, {'Origin': ''}]:
            self.assertEqual(self.post(headers=headers)[0], 403)
        self.assertEqual(self.post(headers={'Origin': '', 'Referer': 'https://chezakvest.com/kids/'})[0], 200)
        self.assertEqual(self.post(headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.post(raw=b'x'*8193)[0], 413)
        for change in [{'name': 'А'}, {'consent': False}, {'startedAt': None}, {'date': '2026-02-30'}, {'comment': 'x'*1001}, {'pageUrl': 'https://evil.test/'}]:
            self.assertEqual(self.post(payload(**change))[0], 400, change)
        self.assertEqual(self.post(raw=b'[]')[0], 400)

    def test_fields_note_and_normal_pipeline(self):
        self.assertEqual(self.post(), (200, {'ok': True}))
        lead = self.calls('POST', '/api/v4/leads')[0][0]
        self.assertEqual((lead['pipeline_id'], lead['status_id']), (6429238,54964090))
        fields = {field['field_id']: field['values'][0] for field in lead['custom_fields_values']}
        self.assertEqual(set(fields), set(MAP['fields'].values()) | {item['id'] for item in MAP['selects'].values()})
        self.assertEqual(fields[491799], {'value': 'test'})
        for key, value in {'source':'Наш сайт','venue':'Ростов-на-Дону, Улица 40-летия Победы, 216','quest':'Игра в Кальмара','occasion':'День рождения'}.items():
            item = MAP['selects'][key]
            expected = item['values'].index(value) + 1
            self.assertEqual(fields[item['id']], {'enum_id': expected})
        self.assertEqual(lead['_embedded']['contacts'], [{'id': 123}])
        contact = self.calls('POST', '/api/v4/contacts')[0][0]
        self.assertEqual(contact['name'], 'Анна')
        self.assertEqual(contact['custom_fields_values'], [{'field_id': 363447, 'values': [{'value': '+79282163623', 'enum_code': 'WORK'}]}])
        note = self.calls('POST', '/api/v4/leads/456/notes')[0][0]['params']['text']
        for text in ['https://chezakvest.com/kids/', 'Праздник', 'Десять гостей', '2026-10-01', 'utm_source: test', 'Москва', '+03:00', 'Устройство:']:
            self.assertIn(text, note)
        self.assertNotIn('<b>', note)
        self.assertNotIn('\x00', note)

    def test_exact_contact_match_and_unknown_enum(self):
        self.fake.contacts = [{'id': 888, 'custom_fields_values': [{'field_id':363447,'values':[{'value':'+79282163623'}]}]}]
        self.post(payload(quest='Неизвестный квест', venue='Нет адреса'))
        self.assertEqual(self.calls('POST','/api/v4/contacts'), [])
        lead = self.calls('POST','/api/v4/leads')[0][0]
        self.assertEqual(lead['_embedded']['contacts'], [{'id':888}])
        self.assertFalse({445553,682005} & {x['field_id'] for x in lead['custom_fields_values']})

    def test_dedup_concurrent_and_after_restart(self):
        with ThreadPoolExecutor(max_workers=3) as executor:
            results = list(executor.map(lambda _: self.post(), range(3)))
        self.assertTrue(all(result[0] == 200 for result in results))
        self.http.store = Store(self.temp.name, self.store.amo)
        self.post(payload(pageUrl='https://chezakvest.com/kids/?utm_source=other'))
        self.assertEqual(len(self.calls('POST','/api/v4/leads')), 1)
        done = next((Path(self.temp.name)/'done').glob('*.json'))
        self.store.save(done, {'created':time.time()-601})
        self.post()
        self.assertEqual(len(self.calls('POST','/api/v4/leads')), 2)

    def test_queue_500_401_retry_and_checkpoint(self):
        for code in [500,401]:
            self.fake.failure, self.fake.fail_path = code, '/notes'
            self.assertEqual(self.post(payload(phone='+79282163624' if code == 500 else '+79282163625'))[0], 200)
            path = next((Path(self.temp.name)/'queue').glob('*.json'))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(path.read_text())['lead_id'], 456)
            before = len(self.calls('POST', '/api/v4/leads'))
            notes_before = len(self.calls('POST', '/api/v4/leads/456/notes'))
            self.fake.failure = 0
            self.store.retry()
            self.assertEqual(len(self.calls('POST', '/api/v4/leads/456/notes')), notes_before + 1)
            self.assertEqual(len(self.calls('POST','/api/v4/leads')), before)
            self.assertFalse(path.exists())

    def test_retry_after_initial_amo_outage_delivers(self):
        self.fake.failure = 500
        self.assertEqual(self.post()[0], 200)
        self.assertEqual(self.calls('POST', '/api/v4/leads'), [])
        self.fake.failure = 0
        self.store.retry()
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 1)
        self.assertIn('Десять гостей', self.calls('POST', '/api/v4/leads/456/notes')[0][0]['params']['text'])
        self.assertEqual(list((Path(self.temp.name)/'queue').glob('*.json')), [])

    def test_intake_is_durable_while_delivery_is_locked(self):
        with self.store.lock():
            self.assertEqual(self.post(), (200, {'ok': True}))
            self.assertEqual(len(list((Path(self.temp.name)/'queue').glob('*.json'))), 1)
            self.assertEqual(self.fake.calls, [])
        self.store.retry()
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 1)
        self.assertEqual(len(self.calls('POST', '/api/v4/leads/456/notes')), 1)

    def test_queue_expiry(self):
        self.fake.failure = 500
        self.post()
        path = next((Path(self.temp.name)/'queue').glob('*.json'))
        record = json.loads(path.read_text()); record['created'] = time.time()-86401
        self.store.save(path, record)
        with self.assertLogs('chezakvest-leads', level='CRITICAL'): self.store.retry()
        self.assertFalse(path.exists())
        self.assertEqual(len(list((Path(self.temp.name)/'failed').glob('*.json'))), 1)

    def test_test_phone_closed(self):
        self.post(payload(phone='8 (900) 000-00-00'))
        lead = self.calls('POST','/api/v4/leads')[0][0]
        self.assertEqual((lead['pipeline_id'],lead['status_id']), (5519260,48805513))
        self.assertIn({'name':'ТЕСТ сайта'},lead['_embedded']['tags'])
        self.assertEqual(self.calls('PATCH','/api/v4/leads/456'), [{'status_id':143}])

    def test_health_no_secrets(self):
        with urllib.request.urlopen(f'http://127.0.0.1:{self.http.server_port}/api/lead/health') as response:
            self.assertEqual(json.load(response), {'ok':True})

if __name__ == '__main__': unittest.main()
