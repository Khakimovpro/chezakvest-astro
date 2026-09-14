"""Emit environment only into SSH stdin. Never invoke standalone in a terminal."""
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'leads'))
from service import load_env

if sys.stdout.isatty():
    raise SystemExit('Refusing to print credentials to a terminal')
load_env('/home/claude/che_za_kvest/.amo.env')
values = {key: os.environ[key] for key in ['AMOCRM_SUBDOMAIN', 'AMOCRM_TOKEN']}
values.update(AMO_PIPELINE_ID='6429238', AMO_STATUS_ID='54964090', LEAD_TEST_PHONE='+79000000000',
              LEAD_ALLOWED_HOSTS='82.146.60.212,chezakvest.com,www.chezakvest.com,xn--80aehcht5ci1b.xn--p1ai,www.xn--80aehcht5ci1b.xn--p1ai')
for key, value in values.items():
    if any(char in value for char in '\r\n\x00'):
        raise SystemExit('Invalid environment value')
    print(key + '="' + value.replace('\\', '\\\\').replace('"', '\\"') + '"')
