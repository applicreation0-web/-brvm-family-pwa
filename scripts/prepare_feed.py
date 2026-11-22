"""Validate and stage a licensed CSV into an already private deployment.

No fetching, credentials, Git pushes or distribution are performed.
"""
import argparse
import csv
import json
import io
from datetime import date
from pathlib import Path
import subprocess
import tempfile


def prepare(build: Path, csv_path: Path, source: str, authorization: str, bulletin_basis=False):
    if not (build / 'index.html').is_file() or not (build / 'quotes.js').is_file():
        raise ValueError('Build BRVM Family requis.')
    if not source.strip() or len(source) > 200 or not authorization.strip() or len(authorization) > 120:
        raise ValueError('Libellé et référence publique d’autorisation requis.')
    limit = 2 * 1024 * 1024
    with csv_path.open('rb') as source_file:
        payload = source_file.read(limit + 1)
    if len(payload) > limit:
        raise ValueError('CSV trop grand.')
    stream = io.StringIO(payload.decode('utf-8-sig'))
    rows = csv.DictReader(stream)
    if not {'symbol', 'close_xof', 'session_date'}.issubset(rows.fieldnames or []):
        raise ValueError('Colonnes de marché manquantes.')
    for row in rows:
        stamp = row['session_date']
        if not stamp or date.fromisoformat(stamp).isoformat() != stamp or stamp > date.today().isoformat():
            raise ValueError('Date de séance invalide ou future.')
    # Shares the exact CSV parser used by the served PWA.
    validator = "const q=require(process.argv[1]); q.parse(require('node:fs').readFileSync(0,'utf8'));"
    subprocess.run(['node', '-e', validator, str((build / 'quotes.js').resolve())], input=payload, check=True)
    market = build / 'market'
    market.mkdir(exist_ok=True)
    config = {'enabled': True, 'source': source, 'authorization': authorization, 'bulletinBasis': bulletin_basis}
    with tempfile.TemporaryDirectory(dir=market) as directory:
        temp = Path(directory)
        (temp / 'latest.csv').write_bytes(payload)
        (temp / 'feed.json').write_text(json.dumps(config, ensure_ascii=False) + '\n', encoding='utf-8')
        (temp / 'latest.csv').replace(market / 'latest.csv')
        (temp / 'feed.json').replace(market / 'feed.json')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('build', type=Path)
    parser.add_argument('csv', type=Path)
    parser.add_argument('--source', required=True)
    parser.add_argument('--authorization', required=True, help='Référence publique non secrète')
    parser.add_argument('--confirm-authorized-private', action='store_true', required=True)
    parser.add_argument('--bulletin-basis', action='store_true')
    args = parser.parse_args()
    prepare(args.build, args.csv, args.source, args.authorization, args.bulletin_basis)
