"""Browser qualification on synthetic data. The two origins never contain real records."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from os import environ
from pathlib import Path
import json
import zipfile
from io import BytesIO
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
        # La saisie doit rester libre, sans sauvegarde mensuelle bloquante.
        expect(page.locator('.backup-banner')).to_have_count(0)
        page.get_by_role('button', name='Modifier mes données et mes actions').click()
        page.get_by_role('dialog').get_by_role('button', name='Cours / prix').click()
        dialog=page.get_by_role('dialog')
        dialog.locator('[name=symbol]').fill('SNTS')
        dialog.locator('[name=price]').fill('4000')
        dialog.locator('[name=source]').fill('Cotation fictive recette')
        dialog.get_by_role('button', name='Enregistrer le cours').click()
        expect(page.get_by_text('Cotation enregistrée.')).to_be_visible()
        page.get_by_role('button', name='Modifier mes données et mes actions').click()
        page.get_by_role('dialog').get_by_role('button', name='Sauvegardes').click()
        with page.expect_download() as backup_download:
            page.get_by_role('button', name='Télécharger une sauvegarde ZIP (facultatif)').click()
        backup=backup_download.value.path().read_bytes()
        with zipfile.ZipFile(BytesIO(backup)) as archive:
            names=archive.namelist()
            assert len(names)==3
            assert 'BRVM_COMPLET.json' in names and 'MANIFESTE.json' in names
            assert json.loads(archive.read('BRVM_COMPLET.json'))['accounts'][0]['id']=='browser-only-a'
        expect(page.locator('.backup-banner')).to_have_count(0)
        page.locator('#nav [data-page=dashboard]').press('Enter')
        zipcontext=browser.new_context()
        zip_page=zipcontext.new_page()
        zip_page.goto(second + '/')
        zip_page.locator('#import').set_input_files({
            'name':'BRVM_SAUVEGARDE_TEST.zip','mimeType':'application/zip','buffer':backup})
        confirm_import(zip_page, initialize=True)
        expect(zip_page.locator('.backup-banner')).to_have_count(0)
        zip_page.locator('#nav [data-page=accounts]').press('Enter')
        expect(zip_page.locator('article h2').filter(has_text='Compte fictif E2E')).to_be_visible()
        zipcontext.close()

        # Les 5 JSON individuels regroupés dans un ZIP DEFLATE standard s'importent
        # en un seul geste; aucun JSON financier réel n'entre dans le dépôt.
        synthetic_snapshots=page.evaluate("""() => Array.from({length:5},(_,i)=>{
          const d=BRVM.empty(), owner='synthetic-u-'+i,portfolio='synthetic-p-'+i,
            account='synthetic-a-'+i;
          d.owners.push({id:owner,label:'Propriétaire fictif '+i});
          d.portfolios.push({id:portfolio,ownerId:owner,label:'Portefeuille fictif '+i,
            targets:{...BRVMEngine.targets}});
          d.institutions.push({id:'fictional-sgi',label:'SGI fictive'});
          d.accounts.push({id:account,portfolioId:portfolio,institutionId:'fictional-sgi',
            label:'Compte fictif '+i,currency:'XOF',cash:10000+i,reserved:0,
            monthly:0,brokerRate:0,otherRate:0});
          d.positions.push({accountId:account,symbol:'SNTS',qty:1,cost:4000+i});
          d.transactions.push({id:'fractionnement-synthetique-'+i,type:'SPLIT',
            accountId:account,symbol:'SNTS',date:'2026-10-26',status:'CONFIRMED',
            brokerRef:'FICTIF_SPLIT_'+i,ratioFrom:1,ratioTo:10,source:'Cas fictif'});
          BRVM.calculate(d);
          return d;
        })""")
        archive_stream=BytesIO()
        with zipfile.ZipFile(archive_stream,'w',compression=zipfile.ZIP_DEFLATED) as archive:
            for i,snapshot in enumerate(synthetic_snapshots):
                archive.writestr(f'compte_fictif_{i}.json',json.dumps(snapshot))
        standard_zip=archive_stream.getvalue()
        multi_context=browser.new_context()
        multi_page=multi_context.new_page()
        multi_page.goto(second+'/')
        multi_page.locator('#import').set_input_files({
            'name':'FIVE_INDEPENDENT_ACCOUNTS.zip',
            'mimeType':'application/zip','buffer':standard_zip})
        expect(multi_page.get_by_role('dialog').get_by_text('5 comptes',exact=False)).to_be_visible()
        confirm_import(multi_page,initialize=True)
        multi_account_ids=multi_page.evaluate("""() => {
          const names=[];
          return new Promise((resolve,reject)=>{
            const request=indexedDB.open('brvm-family-v3:'+new URL('./',location.href).pathname,1);
            request.onsuccess=()=>{
              const db=request.result,tx=db.transaction('vault','readonly');
              tx.objectStore('vault').get('current').onsuccess=()=>{
                // The persisted vault is encrypted: inspect via UI instead.
                db.close();resolve(true);
              };
            };
            request.onerror=()=>reject(request.error);
          });
        }""")
        assert multi_account_ids is True
        multi_page.locator('#nav [data-page=accounts]').press('Enter')
        for i in range(5):
            multi_page.locator('#portfolio').select_option(f'synthetic-p-{i}')
            expect(multi_page.locator('article h2').filter(
                has_text=f'Compte fictif {i}')).to_be_visible()
        multi_context.close()

        page.get_by_role('button', name='Modifier mes données et mes actions').click()
        page.get_by_role('dialog').get_by_role('button', name='Cours / prix').click()
        dialog=page.get_by_role('dialog')
        dialog.locator('[name=symbol]').fill('SNTS')
        dialog.locator('[name=price]').fill('4000')
        dialog.locator('[name=source]').fill('Cotation fictive recette')
        dialog.get_by_role('button', name='Enregistrer le cours').click()
        expect(page.get_by_text('Cotation enregistrée.')).to_be_visible()
        page.locator('#nav [data-page=dashboard]').press('Enter')
        expect(page.locator('.allocation-pie')).to_be_visible()
        assert page.locator('.core-watch').count()==0
        assert page.locator('.core-selection').count()==0
        assert page.locator('#nav [data-page=settings]').count()==0
        assert page.locator('#nav [data-page=data]').count()==0
        expect(page.get_by_role('button', name='Modifier mes données et mes actions')).to_be_visible()
        expect(page.get_by_role('button', name='Acheter', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Vendre', exact=True)).to_be_visible()
        # Vendre 2 actions avec frais vrais, puis racheter une action sur avis.
        page.get_by_role('button', name='Vendre', exact=True).click()
        sale=page.get_by_role('dialog')
        expect(sale.get_by_role('heading', name='Vente')).to_be_visible()
        sale.locator('[name=symbol]').fill('SNTS')
        sale.locator('[name=qty]').fill('2')
        sale.locator('[name=price]').fill('4000')
        sale.locator('[name=broker]').fill('10')
        sale.locator('[name=other]').fill('5')
        sale.locator('[name=actualTotal]').fill('7985')
        sale.locator('[name=brokerRef]').fill('BROWSER-SELL-1')
        sale.locator('[name=confirmed]').check()
        expect(sale.locator('[data-trade-total]')).to_contain_text('7')
        sale.get_by_role('button', name='Comptabiliser').click()
        expect(sale.get_by_text('Confirmer avant comptabilisation')).to_be_visible()
        expect(sale).to_be_visible()  # Première validation : aucune écriture
        sale.get_by_role('button', name='Confirmer et comptabiliser').click()
        expect(sale).not_to_be_visible()
        page.get_by_role('button', name='Acheter', exact=True).click()
        buy=page.get_by_role('dialog')
        buy.locator('[name=symbol]').fill('SNTS')
        buy.locator('[name=qty]').fill('1')
        buy.locator('[name=price]').fill('4000')
        buy.locator('[name=broker]').fill('20')
        buy.locator('[name=other]').fill('10')
        buy.locator('[name=actualTotal]').fill('4030')
        buy.locator('[name=brokerRef]').fill('BROWSER-BUY-1')
        buy.locator('[name=confirmed]').check()
        buy.get_by_role('button', name='Comptabiliser').click()
        buy.get_by_role('button', name='Confirmer et comptabiliser').click()
        expect(buy).not_to_be_visible()
        # Les versements et frais ont un point d'accès direct, sans deuxième écran achat/vente.
        page.locator('#nav [data-page=invest]').press('Enter')
        expect(page.get_by_role('heading', name='Opérations', exact=True)).to_be_visible()
        assert page.locator('#nav [data-page=orders]').count()==0
        expect(page.locator('.operations-actions').get_by_role('button', name='Verser')).to_be_visible()
        expect(page.locator('.operations-actions').get_by_role('button', name='Vendre')).to_be_visible()
        expect(page.locator('.operations-actions').get_by_role('button', name='Acheter')).to_be_visible()
        expect(page.locator('.operations-planner')).not_to_have_attribute('open', '')
        page.locator('.operations-actions').get_by_role('button', name='Verser').click()
        deposit=page.get_by_role('dialog')
        deposit.locator('[name=amount]').fill('12000')
        deposit.locator('[name=brokerRef]').fill('DEP-FICTIVE-01')
        deposit.locator('[name=confirmed]').check()
        deposit.get_by_role('button', name='Comptabiliser').click()
        deposit.get_by_role('button', name='Confirmer et comptabiliser').click()
        expect(deposit).not_to_be_visible()
        page.locator('.operations-actions').get_by_role('button', name='Retirer').click()
        withdraw=page.get_by_role('dialog')
        withdraw.locator('[name=amount]').fill('500')
        withdraw.locator('[name=brokerRef]').fill('RET-FICTIVE-01')
        withdraw.locator('[name=confirmed]').check()
        withdraw.get_by_role('button', name='Comptabiliser').click()
        withdraw.get_by_role('button', name='Confirmer et comptabiliser').click()
        expect(withdraw).not_to_be_visible()
        page.locator('.operations-secondary').first.evaluate('(el)=>el.open=true')
        page.get_by_role('button', name='Frais du compte').click()
        fee=page.get_by_role('dialog')
        fee.locator('[name=amount]').fill('250')
        fee.locator('[name=feeCategory]').select_option('virement')
        fee.locator('[name=brokerRef]').fill('FRAIS-FICTIVE-01')
        fee.locator('[name=confirmed]').check()
        fee.get_by_role('button', name='Comptabiliser').click()
        fee.get_by_role('button', name='Confirmer et comptabiliser').click()
        expect(fee).not_to_be_visible()
        page.locator('.operations-secondary').first.evaluate('(el)=>el.open=true')
        expect(page.get_by_role('button', name='Frais du compte')).to_be_visible()
        # Les ordres de même nature sont regroupés dans une sous-section, non dans un menu redondant.
        page.locator('.operations-orders').evaluate('(el)=>el.open=true')
        expect(page.get_by_role('button', name='Créer un projet d’ordre')).to_be_visible()
        page.set_viewport_size({'width':390,'height':850})
        shots=ROOT / 'test_artifacts';shots.mkdir(exist_ok=True)
        page.screenshot(path=str(shots / 'operations_fictives_android_390px.png'),full_page=True)
        page.set_viewport_size({'width':1366,'height':900})
        page.locator('#nav [data-page=history]').press('Enter')
        expect(page.get_by_text('Frais de compte · Virement / transfert', exact=False).first).to_be_visible()
        page.locator('#nav [data-page=accounts]').press('Enter')
        expect(page.locator('article h2').filter(has_text='Compte fictif E2E')).to_be_visible()
        expect(page.get_by_text('6', exact=True).first).to_be_visible()
        page.locator('#nav [data-page=dashboard]').press('Enter')
        # Capture fictive : aucune information personnelle n'est importée dans cette recette.
        page.set_viewport_size({'width':390,'height':850})
        shots=ROOT / 'test_artifacts'
        shots.mkdir(exist_ok=True)
        page.screenshot(path=str(shots / 'dashboard_fictif_android_390px.png'),full_page=True)
        page.get_by_role('button', name='Menu').click()
        expect(page.locator('.rail')).to_be_visible()
        page.get_by_role('button', name='Menu').click()
        page.set_viewport_size({'width':360,'height':800})
        editor_button=page.get_by_role('button', name='Modifier mes données et mes actions')
        expect(editor_button).to_be_visible()
        editor_button.click()
        manual=page.get_by_role('dialog')
        expect(manual.get_by_role('heading', name='Modifier mes données et mes actions')).to_be_visible()
        assert manual.locator('form[data-form=manual-core] .manual-core-line').count()==8
        assert page.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth')
        shots=ROOT / 'test_artifacts'
        shots.mkdir(exist_ok=True)
        page.screenshot(path=str(shots / 'editeur_manuel_mobile_fictif_360px.png'),full_page=True)
        page.set_viewport_size({'width':1366,'height':900})
        original_total=page.locator('.total').text_content()
        # Remplacer un ticker CORE ne vend jamais une position enregistrée.
        manual.locator('[name=core_symbol_0]').fill('TEST')
        manual.locator('[name=confirmed]').check()
        manual.locator('button[type=submit]').click()
        expect(manual).not_to_be_visible()
        assert page.locator('.total').text_content()==original_total
        editor_button.click()
        manual=page.get_by_role('dialog')
        expect(manual.locator('[name=core_symbol_0]')).to_have_value('TEST')
        manual.locator('[name=core_symbol_0]').fill('SNTS')
        manual.locator('[name=core_weight_0]').fill('25')
        manual.locator('[name=core_weight_3]').fill('17')
        manual.locator('[name=confirmed]').check()
        manual.locator('button[type=submit]').click()
        expect(manual).not_to_be_visible()
        editor_button.click()
        manual=page.get_by_role('dialog')
        expect(manual.locator('[name=core_weight_0]')).to_have_value('25')
        expect(manual.locator('[name=core_weight_3]')).to_have_value('17')
        # Restauration des 30/12 % testée explicitement.
        manual.locator('[name=core_weight_0]').fill('30')
        manual.locator('[name=core_weight_3]').fill('12')
        manual.locator('[name=confirmed]').check()
        manual.locator('button[type=submit]').click()
        expect(manual).not_to_be_visible()
        assert page.locator('.total').text_content()==original_total

        # Contrôles négatifs sur le formulaire réel : aucune mutation en cas de saisie fausse.
        editor_button.click()
        manual=page.get_by_role('dialog')
        manual.locator('[name=core_weight_0]').fill('30.01')
        manual.locator('[name=confirmed]').check()
        manual.locator('button[type=submit]').click()
        expect(manual.locator('.modal-error')).to_contain_text('exactement 100 %')
        assert page.locator('.total').text_content()==original_total
        manual.locator('[name=core_weight_0]').fill('30')
        manual.locator('[name=core_symbol_7]').fill('SNTS')
        manual.locator('[name=core_weight_7]').fill('1')
        manual.locator('button[type=submit]').click()
        expect(manual.locator('.modal-error')).to_contain_text('doublon')
        manual.locator('[name=core_symbol_7]').fill('SGBC')
        manual.locator('button[type=submit]').click()
        expect(manual.locator('.modal-error')).to_contain_text('exclue')
        manual.locator('[name=core_symbol_7]').fill('')
        manual.locator('[name=core_weight_7]').fill('')
        # Alias de marché TTLC normalisé vers TOCI et sauvegardé sans doublon.
        manual.locator('[name=core_symbol_3]').fill('TTLC')
        manual.locator('button[type=submit]').click()
        expect(manual).not_to_be_visible()
        assert page.locator('.total').text_content()==original_total
        editor_button.click()
        manual=page.get_by_role('dialog')
        expect(manual.locator('[name=core_symbol_3]')).to_have_value('TOCI')
        manual.get_by_role('button', name='Fermer').click()

        # Nouvelle SGI sur le même portefeuille ; zéro achat/dépôt, répartition globale inchangée.
        initial_total=page.locator('.total').text_content()
        original_color=page.locator('.allocation-legend li').filter(has_text='SNTS').first.locator('i').evaluate(
            '(el)=>getComputedStyle(el).backgroundColor')
        assert original_color=='rgb(0, 168, 107)', original_color
        page.get_by_role('button', name='Ajouter une SGI / un compte').click()
        new_account=page.get_by_role('dialog')
        new_account.locator('[name=newInstitution]').fill('SGI supplémentaire')
        new_account.locator('[name=label]').fill('Compte deuxième SGI')
        new_account.locator('button[type=submit]').click()
        expect(new_account).not_to_be_visible()
        page.locator('#nav [data-page=dashboard]').press('Enter')
        assert page.locator('.total').text_content()==initial_total
        first_sgi=page.locator('#sgi-view option').filter(has_text='SGI fictive E2E').get_attribute('value')
        other_sgi=page.locator('#sgi-view option').filter(has_text='SGI supplémentaire').get_attribute('value')
        assert first_sgi and other_sgi!=first_sgi
        page.locator('#sgi-view').select_option(first_sgi)
        expect(page.locator('.allocation-pie')).to_be_visible()
        assert page.locator('.allocation-legend li').filter(has_text='SNTS').first.locator('i').evaluate(
            '(el)=>getComputedStyle(el).backgroundColor')==original_color
        page.locator('#sgi-view').select_option(other_sgi)
        expect(page.get_by_text('Aucun titre valorisé ni espèces sur cette sélection.', exact=False)).to_be_visible()
        expect(page.locator('#sgi-view')).to_be_visible()
        page.locator('#sgi-view').select_option('')
        expect(page.locator('.allocation-pie')).to_be_visible()
        assert page.locator('.total').text_content()==initial_total

        total=page.locator('.total').text_content()
        page.evaluate('navigator.serviceWorker.ready.then(() => true)')
        for width in (360, 412, 768, 1366):
            page.set_viewport_size({'width': width, 'height': 900})
            assert page.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth')
        page.locator('#nav [data-page=dashboard]').press('Enter')
        page.get_by_role('button', name='Modifier mes données et mes actions').click()
        page.get_by_role('dialog').get_by_role('button', name='Mettre à jour les cours').click()
        market=page.get_by_role('dialog')
        expect(market.get_by_role('heading', name='Mettre à jour les cours BRVM')).to_be_visible()
        expect(market.get_by_text("aucun flux automatique autorisé", exact=False)).to_be_visible()
        expect(market.get_by_role('button', name='1. Importer un fichier de cours CSV / JSON')).to_be_visible()
        market.get_by_role('button', name='Fermer').click()
        page.locator('#nav [data-page=dashboard]').press('Enter')
        page.get_by_role('button', name='Modifier mes données et mes actions').click()
        page.get_by_role('dialog').get_by_role('button', name='Sauvegardes').click()
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
        other.locator('#nav [data-page=dashboard]').press('Enter')
        other.get_by_role('button', name='Modifier mes données et mes actions').click()
        other.get_by_role('dialog').get_by_role('button', name='Sauvegardes').click()
        with other.expect_download() as action_backup_download:
            other.get_by_role('button', name='Télécharger une sauvegarde ZIP (facultatif)').click()
        action_backup=action_backup_download.value.path().read_bytes()
        with zipfile.ZipFile(BytesIO(action_backup)) as archive:
            assert 'BRVM_COMPLET.json' in archive.namelist()
        expect(other.locator('.backup-banner')).to_have_count(0)
        other.locator('#nav [data-page=events]').press('Enter')
        other.get_by_role('button', name='Saisir un événement').click()
        action_dialog=other.get_by_role('dialog')
        action_dialog.locator('[name=date]').fill('2026-11-04')
        action_dialog.locator('[name=brokerRef]').fill('SPLIT-E2E-001')
        action_dialog.locator('[name=symbol]').fill('SNTS')
        action_dialog.locator('[name=source]').fill('Avis fictif fractionnement')
        action_dialog.locator('[name=confirmed]').check()
        action_dialog.get_by_role('button', name='Comptabiliser').click()
        action_dialog.get_by_role('button', name='Confirmer et comptabiliser').click()
        try:
            expect(action_dialog).not_to_be_visible(timeout=12000)
        except AssertionError:
            raise AssertionError('Opération sur titres 1 refusée : '+str(action_dialog.locator('.modal-error').text_content()))
        expect(other.get_by_text('Écriture confirmée et enregistrée dans le journal.')).to_be_visible()
        other.get_by_role('button', name='Saisir un événement').click()
        action_dialog=other.get_by_role('dialog')
        action_dialog.locator('[name=type]').select_option('DIVIDEND')
        action_dialog.locator('[name=date]').fill('2026-11-07')
        action_dialog.locator('[name=brokerRef]').fill('DIVIDEND-E2E-001')
        action_dialog.locator('[name=symbol]').fill('SNTS')
        action_dialog.locator('[name=gross]').fill('7000')
        action_dialog.locator('[name=tax]').fill('100')
        action_dialog.locator('[name=dividendRecordDate]').fill('2026-11-06')
        action_dialog.locator('[name=dividendEligibleQty]').fill('70')
        action_dialog.locator('[name=dividendGrossPerShare]').fill('100')
        action_dialog.locator('[name=dividendStatementRef]').fill('AVIS-E2E-70')
        action_dialog.locator('[name=confirmed]').check()
        action_dialog.get_by_role('button', name='Comptabiliser').click()
        action_dialog.get_by_role('button', name='Confirmer et comptabiliser').click()
        try:
            expect(action_dialog).not_to_be_visible(timeout=12000)
        except AssertionError:
            raise AssertionError('Opération sur titres 2 refusée : '+str(action_dialog.locator('.modal-error').text_content()))
        expect(other.get_by_text('Écriture confirmée et enregistrée dans le journal.')).to_be_visible()
        other.locator('#nav [data-page=history]').press('Enter')
        expect(other.get_by_text('Fractionnement / regroupement', exact=False)).to_be_visible()
        expect(other.get_by_text('Dividende encaissé', exact=False)).to_be_visible()
        # Confirmation de retrait : aucune suppression avant le deuxième geste.
        fee_row=other.get_by_role('row').filter(has_text='FRAIS-FICTIVE-01')
        expect(fee_row).to_be_visible()
        fee_row.get_by_role('button',name='Retirer').click()
        removal=other.get_by_role('dialog')
        expect(removal.get_by_role('heading',name='Confirmer le retrait de l’écriture')).to_be_visible()
        expect(fee_row).to_be_visible()
        removal.locator('[name=reason]').fill('Frais saisis en double')
        removal.locator('[name=confirmed]').check()
        removal.get_by_role('button',name='Confirmer le retrait').click()
        expect(other.get_by_text('Écriture retirée du journal.')).to_be_visible()
        expect(other.get_by_role('row').filter(has_text='FRAIS-FICTIVE-01')).to_have_count(0)
        expect(other.locator('.backup-banner')).to_have_count(0)
        page.goto(first + '/')
        page.wait_for_function('Boolean(navigator.serviceWorker.controller)')
        context.set_offline(True)
        page.reload()
        expect(page.get_by_role('heading', name='Coffre local verrouillé')).to_be_visible()
        page.locator('[name=pass]').fill(PHRASE)
        page.get_by_role('button', name='Déverrouiller').click()
        expect(page.locator('.total')).to_be_visible()
        context.set_offline(False)
        # Deux onglets synchronisés au même coffre : le second ne doit jamais écraser
        # silencieusement une version plus récente de la même famille.
        mirror=context.new_page()
        mirror.goto(first + '/')
        vault_bootstrap="""async phrase => {
          const session=await BRVMVault.start();
          const rec=session.current.locked?
            await session.store.unlock(phrase):session.current;
          window.__stressStore=session.store;
          window.__stressRecord=rec;
          return rec.revision;
        }"""
        revision_a=page.evaluate(vault_bootstrap,PHRASE)
        revision_b=mirror.evaluate(vault_bootstrap,PHRASE)
        assert revision_a==revision_b
        accepted=page.evaluate("""async () => {
          const r=window.__stressRecord;
          const next=structuredClone(r.data);
          next.settings.staleDays=next.settings.staleDays===31?30:31;
          const stored=await window.__stressStore.commit(next,r.revision,false);
          return {revision:stored.revision,days:stored.data.settings.staleDays};
        }""")
        assert accepted['revision']==revision_a+1
        rejected=mirror.evaluate("""async () => {
          const r=window.__stressRecord;
          const next=structuredClone(r.data);
          next.settings.staleDays=200;
          try {
            await window.__stressStore.commit(next,r.revision,false);
            return {rejected:false};
          } catch (error) {
            return {rejected:true,message:String(error.message||error)};
          }
        }""")
        assert rejected['rejected'] and 'autre onglet' in rejected['message']
        actual_revision=mirror.evaluate("""async () => {
          const r=await window.__stressStore.read('current');
          return {revision:r.revision,days:r.data.settings.staleDays};
        }""")
        assert actual_revision==accepted
        page.evaluate("window.__stressStore.close()")
        mirror.evaluate("window.__stressStore.close()")
        mirror.close()
        page.reload()
        page.locator('[name=pass]').fill(PHRASE)
        page.get_by_role('button', name='Déverrouiller').click()
        expect(page.locator('.total')).to_be_visible()
        assert page.locator('.total').text_content()==total

        page.locator('#nav [data-page=dashboard]').press('Enter')
        page.get_by_role('button', name='Modifier mes données et mes actions').click()
        page.get_by_role('dialog').get_by_role('button', name='Sauvegardes').click()
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
