"""Copie uniquement le shell statique explicitement autorisé."""
from pathlib import Path
from shutil import copy2
import sys

root = Path(__file__).resolve().parents[1]
shell = [
    'index.html', 'style.css', 'engine.js', 'finance.js', 'vault.js',
    'quotes.js', 'analysis.js', 'app.js', 'sw.js', 'manifest.webmanifest',
    'icons/icon-192.png', 'icons/icon-512.png', '.nojekyll', 'market/feed.json',
]

if __name__ == '__main__':
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist'
    if target.exists() and any(target.iterdir()):
        raise SystemExit('Destination de build non vide.')
    for name in shell:
        source = root / name
        if not source.is_file() or source.is_symlink():
            raise SystemExit(f'Fichier statique attendu absent : {name}')
        dest = target / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        copy2(source, dest)
