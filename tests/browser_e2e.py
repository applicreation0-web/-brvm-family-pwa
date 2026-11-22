"""Browser qualification on synthetic data. The two origins never contain real records."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from os import environ
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from threading import Thread

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PHRASE = 'Recette synthétique coffre local'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def upload(page, content):
    page.locator('#import').set_input_files({
        'name': 'fixture-qualification.json', 'mimeType': 'application/json', 'buffer': content
    })


def confirm_import(page, initialize=False):
    dialog = page.get_by_role('dialog')
    expect(dialog.get_by_role('heading', name='Aperçu de l’import')).to_be_visible()
    if initialize:
        dialog.locator('[name=pass]').fill(PHRASE)
        dialog.locator('[name=again]').fill(PHRASE)
    dialog.locator('button[type=submit]').click()
    expect(page.get_by_text('Données importées et chiffrées sur cet appareil.')).to_be_visible()


def check(first, second):
    with sync_playwright() as harness:
        browser = harness.chromium.launch(executable_path=environ.get('BRVM_CHROMIUM_BIN'))
        context = browser.new_context()
        page = context.new_page()
        visited = []

        def observe(request):
            visited.append((request.method, request.url, request.post_data))

        context.on('request', observe)
        page.goto(first + '/')
        assert page.evaluate('isSecureContext')
        expect(page.get_by_role('button', name='Importer mes données')).to_be_visible()
        expect(page.locator('.total')).to_have_count(0)
        data = page.evaluate("""() => {
          const data=BRVM.empty();
          data.owners.push({id:'browser-only-u',label:'Identité synthétique E2E'});
          data.portfolios.push({id:'browser-only-p',ownerId:'browser-only-u',label:'Portefeuille fictif E2E',targets:BRVMEngine.targets});
          data.institutions.push({id:'browser-only-s',label:'SGI fictive E2E'});
          data.accounts.push({id:'browser-only-a',portfolioId:'browser-only-p',institutionId:'browser-only-s',label:'Compte fictif E2E',
             currency:'XOF',cash:87654,reserved:0,monthly:0,brokerRate:0,otherRate:0});
          data.positions.push({accountId:'browser-only-a',symbol:'SNTS',qty:7,cost:500});
          return data;
        }""")
        upload(page, b'{')
        expect(page.get_by_text('Fichier JSON illisible.')).to_be_visible()
        upload(page, json.dumps(data).encode())
        expect(page.locator('.total')).to_have_count(0)
        confirm_import(page, initialize=True)
        upload(page, json.dumps(data, sort_keys=True).encode())
        expect(page.get_by_text('Aucune écriture ne sera ajoutée.')).to_be_visible()
        confirm_import(page)
        total=page.locator('.total').text_content()
        page.evaluate('navigator.serviceWorker.ready.then(() => true)')
        for width in (360, 412, 768, 1366):
            page.set_viewport_size({'width': width, 'height': 900})
            assert page.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth')
        page.get_by_role('button', name='Actualiser les cours').click()
        expect(page.get_by_text('Les cours locaux sont conservés.')).to_be_visible()
        page.locator('#nav [data-page=data]').press('Enter')
        page.get_by_role('button', name='Exporter chiffré').click()
        dialog = page.get_by_role('dialog')
        dialog.locator('[name=pass]').fill(PHRASE)
        dialog.locator('[name=again]').fill(PHRASE)
        with page.expect_download() as pending:
            dialog.get_by_role('button', name='Chiffrer et télécharger').click()
        encrypted = pending.value.path().read_bytes()
        assert b'browser-only' not in encrypted
        fresh = browser.new_context()
        other = fresh.new_page()
        other.goto(first + '/')
        expect(other.get_by_role('button', name='Importer mes données')).to_be_visible()
        expect(other.locator('.total')).to_have_count(0)
        other.goto(second + '/')
        expect(other.locator('.total')).to_have_count(0)
        upload(other, encrypted)
        other.get_by_role('dialog').locator('[name=pass]').fill(PHRASE)
        other.get_by_role('button', name='Déchiffrer').click()
        confirm_import(other, initialize=True)
        expect(other.locator('.total')).to_have_text(total)
        other.locator('#nav [data-page=accounts]').press('Enter')
        expect(other.locator('article h2').filter(has_text='Compte fictif E2E')).to_be_visible()
        page.goto(first + '/')
        page.wait_for_function('Boolean(navigator.serviceWorker.controller)')
        context.set_offline(True)
        page.reload()
        expect(page.get_by_role('heading', name='Coffre local verrouillé')).to_be_visible()
        page.locator('[name=pass]').fill(PHRASE)
        page.get_by_role('button', name='Déverrouiller').click()
        expect(page.locator('.total')).to_be_visible()
        context.set_offline(False)
        page.locator('#nav [data-page=data]').press('Enter')
        page.get_by_role('button', name='Effacer mes données locales').click()
        page.get_by_role('dialog').locator('[name=confirm]').fill('EFFACER')
        page.get_by_role('button', name='Effacer définitivement').click()
        expect(page.locator('.total')).to_have_count(0)
        assert all(method=='GET' and url.startswith(first+'/') and '?' not in url and not body
                   and 'browser-only' not in url for method,url,body in visited), 'Une transmission inattendue a été observée.'
        fresh.close()
        context.close()
        browser.close()


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as target:
        subprocess.run([sys.executable, str(ROOT / 'scripts/build.py'), target], check=True)
        handler = partial(QuietHandler, directory=target)
        with ThreadingHTTPServer(('127.0.0.1', 0), handler) as a, ThreadingHTTPServer(('127.0.0.1', 0), handler) as b:
            for server in (a,b):
                Thread(target=server.serve_forever, daemon=True).start()
            try:
                check(f'http://127.0.0.1:{a.server_port}', f'http://127.0.0.1:{b.server_port}')
            finally:
                a.shutdown()
                b.shutdown()
    print('Recette Chromium synthétique réussie.')
