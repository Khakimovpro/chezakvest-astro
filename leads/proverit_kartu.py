"""Read-only validation of configured field IDs and exact enumeration labels."""
import argparse
import json
from pathlib import Path
from service import Amo, MAP, load_env

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--env', default='/home/claude/che_za_kvest/.amo.env')
    parser.add_argument('--export-enums', help='Write non-secret field metadata for map preparation')
    args = parser.parse_args()
    if Path(args.env).exists():
        load_env(args.env)
    amo = Amo()
    fields = {field['id']: field for field in amo.fields()}
    contacts = {field['id']: field for field in amo.fields('contacts')}
    assert MAP['contact_phone'] in contacts, 'Missing contact phone field'
    assert contacts[MAP['contact_phone']]['code'] == 'PHONE'
    for field_id in MAP['fields'].values():
        assert field_id in fields, f'Missing field {field_id}'
    for item in MAP['selects'].values():
        assert item['id'] in fields, f'Missing field {item["id"]}'
        values = {enum['value'] for enum in fields[item['id']].get('enums') or []}
        assert set(item['values']) <= values, f'Missing enums for {item["id"]}'
    if args.export_enums:
        Path(args.export_enums).write_text(json.dumps({key: fields[item['id']]['enums'] for key, item in MAP['selects'].items()}, ensure_ascii=False, indent=2))
    print(f'OK: {len(MAP["fields"]) + len(MAP["selects"])} lead fields, 1 contact field, {sum(len(i["values"]) for i in MAP["selects"].values())} exact enums; GET only')
