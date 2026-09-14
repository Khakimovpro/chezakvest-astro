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

    def test_short_product_and_form_names(self):
        cases = [
            ({'form': 'party', 'quest': '', 'crmName': 'Детский день рождения'}, 'Праздник', 'Детский день рождения'),
            ({'form': 'callback', 'quest': 'Игра в Кальмара', 'crmName': 'Детский день рождения'}, 'Обратный звонок', 'Игра в Кальмара'),
            ({'form': 'snapshot-rec123', 'quest': 'Роблокс. Радужные Друзья'}, 'Форма сайта', 'Роблокс. Радужные Друзья'),
            ({'form': 'snapshot-rec456', 'quest': '', 'crmName': 'День рождения в стиле Майнкрафт'}, 'Форма сайта', 'День рождения в стиле Майнкрафт'),
            ({'form': 'prebooking', 'quest': 'Квест ' + 'а' * 60}, 'Предварительная бронь', ('Квест ' + 'а' * 60)[:40]),
        ]
        for index, (changes, kind, product) in enumerate(cases):
            with self.subTest(form=changes['form'], product=product):
                self.post(payload(phone=f'+7910000010{index}', pageTitle='Длинный SEO-заголовок страницы',
                                  formTitle='Длинный рекламный заголовок', **changes))
                lead = self.calls('POST', '/api/v4/leads')[-1][0]
                self.assertEqual(lead['name'], f'Заявка с сайта: {kind} — {product}')
                self.assertIn({'name': product}, lead['_embedded']['tags'])
                self.assertTrue(all(len(t['name']) <= 40 for t in lead['_embedded']['tags']))

    def test_note_preserves_plain_url_and_formula_protection(self):
        url = 'https://chezakvest.com/roblox/?utm_source=codex_r2&utm_campaign=snimok'
        self.post(payload(pageUrl=url, comment='=DANGEROUS & details'))
        text = self.calls('POST', '/api/v4/leads/456/notes')[0][0]['params']['text']
        self.assertIn('Страница: ' + url, text)
        self.assertIn("Комментарий: '=DANGEROUS & details", text)
        self.assertNotIn('&amp;', text)

    def test_rejection_logs_one_safe_line_per_request(self):
        for changes, headers, reason, status in [
            ({'website': 'SECRET'}, {}, 'honeypot', 200),
            ({'startedAt': time.time()*1000}, {}, 'too_fast', 200),
            ({}, {'Origin': 'https://evil.test/SECRET'}, 'origin', 403),
        ]:
            with self.subTest(reason=reason):
                with self.assertLogs('chezakvest-leads', level='INFO') as logs:
                    self.assertEqual(self.post(payload(name='SECRET', **changes), headers)[0], status)
                self.assertEqual(len(logs.output), 1)
                self.assertIn(f'reason={reason} phone=+7******3623', logs.output[0])
                self.assertNotIn('SECRET', logs.output[0])
                self.assertNotIn('79282163623', logs.output[0])
        self.assertEqual(self.fake.calls, [])
        self.post()
        with self.assertLogs('chezakvest-leads', level='INFO') as logs:
            self.post(payload(phone='8 (928) 216-36-23'))
        self.assertEqual(len(logs.output), 1)
        self.assertIn('reason=dedup phone=+7******3623', logs.output[0])
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 1)
        with self.assertLogs('chezakvest-leads', level='INFO') as logs:
            self.assertEqual(self.post(payload(phone='SECRET'), {'Origin': 'null'})[0], 403)
        self.assertIn('phone=unknown', logs.output[0])
        self.assertNotIn('SECRET', logs.output[0])

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
        self.post(payload(phone='8 (928) 216-36-23', pageUrl='https://chezakvest.com/arbitrary-new-path/?utm_source=other'))
        self.assertEqual(len(self.calls('POST','/api/v4/leads')), 1)
        done = next((Path(self.temp.name)/'done').glob('*.json'))
        self.store.save(done, {'created':time.time()-601})
        self.post()
        self.assertEqual(len(self.calls('POST','/api/v4/leads')), 2)

    def test_daily_limit_survives_restart_and_holds_fourth(self):
        start = time.time()
        for index in range(4):
            with patch('leads.service.time.time', return_value=start + index * 601):
                self.http.store = Store(self.temp.name, self.store.amo)
                if index == 3:
                    with self.assertLogs('chezakvest-leads', level='CRITICAL') as logs:
                        self.post()
                    self.assertIn('phone_daily', logs.output[0])
                else:
                    self.post()
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 3)
        held = list((Path(self.temp.name) / 'hold').glob('*.json'))
        self.assertEqual(len(held), 1)
        self.assertEqual(held[0].stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(held[0].read_text())['hold_reason'], 'phone_daily')
        self.store.retry()
        original = held[0].read_bytes()
        for delta in [2404, 86401]:
            with patch('leads.service.time.time', return_value=start + delta):
                self.post(payload(phone='8 (928) 216-36-23', comment='Повтор с изменёнными деталями'))
        self.assertEqual(held[0].read_bytes(), original)
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 3)

    def test_hourly_limit_applies_to_queued_delivery_and_expires(self):
        start = time.time()
        with self.store.lock():
            for index in range(42):
                self.post(payload(phone=f'+7910000{index:04d}'))
        with patch('leads.service.time.time', return_value=start):
            with self.assertLogs('chezakvest-leads', level='CRITICAL'):
                self.store.retry()
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 40)
        self.assertEqual(len(self.calls('POST', '/api/v4/contacts')), 40)
        self.assertEqual(len(list((Path(self.temp.name) / 'hold').glob('*.json'))), 2)
        with patch('leads.service.time.time', return_value=start + 3601):
            self.post(payload(phone='+79100009999'))
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 41)

    def test_failed_field_lookup_does_not_consume_creation_quota(self):
        self.fake.failure, self.fake.fail_path = 500, '/custom_fields'
        self.post()
        for _ in range(3):
            self.store.retry()
        self.assertEqual(self.calls('POST', '/api/v4/leads'), [])
        self.assertFalse((Path(self.temp.name) / 'quota.json').exists())
        self.fake.failure = 0
        self.store.retry()
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 1)

    def test_ambiguous_creation_attempts_consume_quota(self):
        self.store.amo.enums = {}
        self.fake.failure, self.fake.fail_path = 500, '/api/v4/leads'
        self.post()
        self.store.retry()
        self.store.retry()
        self.fake.failure = 0
        with self.assertLogs('chezakvest-leads', level='CRITICAL'):
            self.store.retry()
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 3)
        self.assertEqual(len(list((Path(self.temp.name) / 'hold').glob('*.json'))), 1)

    def test_note_retry_succeeds_even_when_phone_quota_is_full(self):
        start = time.time()
        for delta in [0, 601]:
            with patch('leads.service.time.time', return_value=start + delta):
                self.post()
        self.fake.failure, self.fake.fail_path = 500, '/notes'
        with patch('leads.service.time.time', return_value=start + 1202):
            self.post()
            self.fake.failure = 0
            self.store.retry()
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 3)
        self.assertEqual(len(self.calls('POST', '/api/v4/leads/456/notes')), 4)
        self.assertEqual(list((Path(self.temp.name) / 'hold').glob('*.json')), [])
        self.assertEqual(list((Path(self.temp.name) / 'queue').glob('*.json')), [])

    def test_phone_daily_window_expires(self):
        start = time.time()
        for delta in [0, 601, 1202, 86401]:
            with patch('leads.service.time.time', return_value=start + delta):
                self.post()
        self.assertEqual(len(self.calls('POST', '/api/v4/leads')), 4)

    def test_formula_text_is_escaped_and_phone_only_in_phone_field(self):
        for index, prefix in enumerate(['=', '+', '-', '@', '\t', '\n', '\r']):
            value = prefix + 'DANGEROUS'
            self.post(payload(phone=f'+7911111111{index}', name=value, quest=value,
                              pageTitle=value, formTitle=value, comment=value,
                              utm_source=value))
            contact = self.calls('POST', '/api/v4/contacts')[-1][0]
            self.assertTrue(contact['name'].startswith("'"), repr(value))
            self.assertEqual(contact['custom_fields_values'][0]['values'][0]['value'], f'+7911111111{index}')
            lead = self.calls('POST', '/api/v4/leads')[-1][0]
            self.assertTrue(lead['name'].startswith('Заявка с сайта: '))
            self.assertIn({'name': "'" + value.strip()}, lead['_embedded']['tags'])
            field = next(f for f in lead['custom_fields_values'] if f['field_id'] == 491799)
            self.assertTrue(field['values'][0]['value'].startswith("'"))
            note = self.calls('POST', '/api/v4/leads/456/notes')[-1][0]['params']['text']
            self.assertIn("Комментарий: '" + value.strip(), note)
            self.assertNotIn(f'+7911111111{index}', note)

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
