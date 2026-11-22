"""Audit of generic source history, checked-out source and static distributables."""
import argparse
from binascii import crc32
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
import zipfile

from build import shell

ALLOWED = re.compile(
    r'(?:\.(?:gitignore|nojekyll)|\.github/workflows/(?:ci|pages)\.yml|'
    r'(?:README|CHANGELOG|PRIVACY_DEPLOYMENT_WARNING)\.md|DEPLOIEMENT\.txt|'
    r'(?:index\.html|style\.css|manifest\.webmanifest|package\.json)|'
    r'(?:app|sw|finance|engine|analysis|quotes|vault)\.js|'
    r'icons/icon-(?:192|512)\.png|market/feed\.json|'
    r'scripts/(?:build|privacy_check|prepare_feed)\.py|'
    r'tests/(?:[a-z_0-9]+\.test\.js|[a-z_0-9]+\.py))'
)
SENSITIVE = re.compile(
    r'(?:-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|gh[pso]_[a-z0-9]{30,}|'
    r'github_pat_[a-z0-9_]{30,}|AKIA[A-Z0-9]{16}|'
    r'xox[baprs]-[a-z0-9-]{20,}|(?:https?|wss?)://(?:[^/"\s]+\.)?(?:internal|local)(?:[:/"\s]|$))',
    re.I,
)
DATA_OBJECT = re.compile(r'["\x27](?:accounts|owners|positions|transactions|attachments)["\x27]\s*:\s*\[\s*\{')
BODY_TRANSPORT = re.compile(r'\b(?:sendBeacon|XMLHttpRequest|WebSocket|EventSource)\s*\(')


def normalized(value):
    decomposed = unicodedata.normalize('NFKD', value.casefold())
    return ''.join(c for c in decomposed if not unicodedata.combining(c))


def inspect_icon(name, data):
    if not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data)>100_000:
        raise ValueError('Icône inattendue.')
    offset = 8
    dimension = int(Path(name).stem.split('-')[-1])
    allowed_chunks = {b'IHDR', b'IDAT', b'IEND'}
    seen = []
    while offset+12 <= len(data):
        length = int.from_bytes(data[offset:offset+4], 'big')
        end = offset+12+length
        kind = data[offset+4:offset+8]
        if end>len(data) or kind not in allowed_chunks:
            break
        if crc32(data[offset+4:end-4]) != int.from_bytes(data[end-4:end], 'big'):
            break
        if kind==b'IHDR' and (seen or length!=13 or
                data[offset+8:offset+16] != dimension.to_bytes(4,'big')*2):
            break
        seen.append(kind)
        if kind==b'IEND':
            if length==0 and end==len(data) and seen[0]==b'IHDR' and b'IDAT' in seen:
                return
            break
        offset=end
    raise ValueError('Icône invalide, métadonnées ou octets ajoutés.')


def check(name, data, terms=(), current=False):
    if not ALLOWED.fullmatch(name):
        raise ValueError('Fichier inattendu dans le périmètre publiable.')
    if data.startswith((b'PK\x03\x04', b'%PDF-', b'\xff\xd8\xff')):
        raise ValueError('Archive, image ou document inattendu.')
    if name.endswith('.png'):
        inspect_icon(name,data)
        return
    text = data.decode('utf-8')
    if SENSITIVE.search(text):
        raise ValueError('Secret ou adresse interne plausible.')
    local = normalized(text) if terms else ''
    if any(term in local for term in terms):
        raise ValueError('Correspondance avec le lexique confidentiel fourni en local.')
    if not name.startswith(('tests/', 'scripts/')):
        if DATA_OBJECT.search(text) or 'brvm-family-private-snapshot' in text:
            raise ValueError('Données structurées personnelles possibles.')
    if name == 'market/feed.json' and json.loads(text) != {'enabled': False}:
        raise ValueError('Un flux doit rester désactivé dans l’archive générique.')
    if current and name in {'app.js','vault.js','engine.js','finance.js','analysis.js','quotes.js','sw.js'}:
        if BODY_TRANSPORT.search(text):
            raise ValueError('Nouveau canal réseau à revoir.')
        if name in {'app.js','vault.js','engine.js','finance.js','analysis.js'} and re.search(r'\bfetch\s*\(',text):
            raise ValueError('Un module de données contient un envoi réseau à revoir.')


def inspect_checkout(terms):
    try:
        paths = subprocess.check_output(['git','ls-files','-z'], stderr=subprocess.DEVNULL).decode().split('\0')
    except subprocess.CalledProcessError:
        raise ValueError('Utiliser --dist ou --archive hors d’un checkout Git.') from None
    for name in filter(None, paths):
        path = Path(name)
        if path.is_symlink():
            raise ValueError('Lien symbolique inattendu.')
        check(name,path.read_bytes(),terms,current=True)
    commits = subprocess.check_output(['git','rev-list','--all','HEAD'],text=True).splitlines()
    blobs = set()
    for commit in commits:
        metadata = subprocess.check_output(['git','show','-s','--format=%an%n%ae%n%cn%n%ce%n%B',commit],text=True)
        if SENSITIVE.search(metadata) or any(term in normalized(metadata) for term in terms):
            raise ValueError('Correspondance confidentielle dans les métadonnées Git.')
        tree = subprocess.check_output(['git','ls-tree','-rz',commit]).decode().split('\0')
        for line in filter(None,tree):
            info,name=line.split('\t',1)
            mode,kind,oid=info.split()
            if kind!='blob' or mode=='120000':
                raise ValueError('Objet Git inattendu.')
            if (name,oid) not in blobs:
                check(name,subprocess.check_output(['git','cat-file','blob',oid]),terms)
                blobs.add((name,oid))
    return f'{len(commits)} commits et {len(blobs)} versions de fichiers'


def inspect_dist(path,terms):
    pieces = {file.relative_to(path).as_posix() for file in path.rglob('*') if file.is_file() or file.is_symlink()}
    if pieces != set(shell):
        raise ValueError('Inventaire du shell différent des fichiers autorisés.')
    for name in pieces:
        file=path/name
        if file.is_symlink():
            raise ValueError('Lien inattendu dans le build.')
        check(name,file.read_bytes(),terms,current=True)
    return f'{len(pieces)} fichiers du shell'


def inspect_archive(path, terms):
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if len(infos)!=len(shell) or {item.filename for item in infos}!=set(shell):
            raise ValueError('Inventaire installable inattendu.')
        for item in infos:
            if item.file_size>2_000_000 or item.external_attr>>28==10:
                raise ValueError('Objet installable inattendu.')
            check(item.filename,archive.read(item),terms,current=True)
    return f'{len(infos)} fichiers installables'


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist',type=Path)
    parser.add_argument('--archive',type=Path)
    parser.add_argument('--private-terms',type=Path,help='Lexique local hors dépôt et hors CI, une expression par ligne.')
    args=parser.parse_args()
    terms=tuple(normalized(line.strip()) for line in args.private_terms.read_text(encoding='utf-8').splitlines()
                if len(line.strip())>=5) if args.private_terms else ()
    try:
        if args.dist: print('PASS ·',inspect_dist(args.dist,terms))
        if args.archive: print('PASS ·',inspect_archive(args.archive,terms))
        if not (args.dist or args.archive): print('PASS ·',inspect_checkout(terms))
    except (ValueError,OSError,subprocess.CalledProcessError,zipfile.BadZipFile) as error:
        sys.exit('Échec du contrôle de confidentialité : '+type(error).__name__+
                 ('. '+str(error) if isinstance(error,ValueError) else '.'))
