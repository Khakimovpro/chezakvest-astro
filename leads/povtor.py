import logging
import os
from service import Amo, Store

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    Store(os.environ.get('LEAD_STATE_DIR', '/var/lib/chezakvest-leads'), Amo()).retry()
