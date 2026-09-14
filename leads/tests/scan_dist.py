"""Ensure built public text files contain no local CRM credentials."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from service import load_env
import os

load_env('/home/claude/che_za_kvest/.amo.env')
needles = ['AMOCRM_TOKEN', os.environ['AMOCRM_TOKEN'], os.environ['AMOCRM_SUBDOMAIN']]
count = 0
for path in Path('dist').rglob('*'):
    if path.is_file() and path.suffix in {'.html','.js','.json','.css','.xml','.txt'}:
        count += 1
        body=path.read_text()
        if any(value and value in body for value in needles):
            raise SystemExit(f'Secret boundary failed in {path}; values withheld')
print(f'OK: {count} public text files; 0 credential matches')
