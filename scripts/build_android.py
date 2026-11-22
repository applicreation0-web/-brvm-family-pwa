"""Package the audited blank BRVM Family shell inside Android assets.

No user data, accounts, quotes from private sources, keystore or API token enters
the APK. The Android-only patch replaces browser downloads with the Android
Storage Access Framework. The financial engine itself stays bit-for-bit equal.
"""
from pathlib import Path
from shutil import copy2, rmtree

from build import root, shell

ASSETS = root / 'android/app/src/main/assets/web'
ICON = root / 'android/app/src/main/res/drawable-nodpi/ic_launcher.png'
SKIP = {'.nojekyll', 'sw.js'}

NATIVE_DOWNLOAD = """    if(window.BRVMAndroid && typeof window.BRVMAndroid.beginSave==='function') {
      const bytes=typeof value==='string'?new TextEncoder().encode(value):
        value instanceof Uint8Array?value:new Uint8Array(value);
      if(!window.BRVMAndroid.beginSave(name,mime,bytes.length))
        throw Error('Export Android déjà en cours ou stockage local indisponible.');
      try {
        for(let offset=0;offset<bytes.length;offset+=24576) {
          const raw=String.fromCharCode(...bytes.subarray(offset,offset+24576));
          if(!window.BRVMAndroid.appendChunk(btoa(raw)))
            throw Error('Transfert du fichier vers Android interrompu.');
        }
        if(!window.BRVMAndroid.finishSave())
          throw Error('Le fichier Android exporté est incomplet.');
      } catch(err) {
        window.BRVMAndroid.cancelSave();
        throw err;
      }
      return;
    }
"""

def build():
    if ASSETS.exists():
        rmtree(ASSETS)
    for name in shell:
        if name in SKIP:
            continue
        source = root / name
        if not source.is_file() or source.is_symlink():
            raise SystemExit('Fichier du shell absent ou inattendu : ' + name)
        dest = ASSETS / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        copy2(source, dest)
    app = ASSETS / 'app.js'
    script = app.read_text('utf-8')
    marker = "  function download(value,name,mime='application/json') {\n"
    if script.count(marker) != 1:
        raise SystemExit('Signature de la fonction de sauvegarde modifiée, analyse nécessaire.')
    script = script.replace(marker, marker + NATIVE_DOWNLOAD)
    serviceworker = "if('serviceWorker' in navigator && isSecureContext)"
    if script.count(serviceworker) != 1:
        raise SystemExit('Point de montage du service worker modifié.')
    script = script.replace(serviceworker, "if('serviceWorker' in navigator && isSecureContext && !window.BRVMAndroid)")
    app.write_text(script, encoding='utf-8')
    ICON.parent.mkdir(parents=True, exist_ok=True)
    copy2(root / 'icons/icon-192.png', ICON)
    print(f'Android: {len([f for f in ASSETS.rglob("*") if f.is_file()])} ressources locales; aucune donnée privée.')

if __name__ == '__main__':
    build()
