"""Negative controls for the distribution auditor, using synthetic content."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

SCRIPTS = Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(SCRIPTS))
spec = importlib.util.spec_from_file_location('brvm_privacy_audit',SCRIPTS/'privacy_check.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class PrivacyAudit(unittest.TestCase):
    def test_rejects_embedded_data_and_secret(self):
        for name, data in [
            ('app.js', b'let p={"accounts":[{"id":"fixture-sensible"}]};'),
            ('README.md', b'ghp_'+b'R'*36),
            ('market/feed.json', b'{"enabled":true}'),
            ('icons/icon-192.png', b'%PDF-'),
            ('app.js', b"navigator.sendBeacon('./local', records)"),
        ]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                audit.check(name,data,current=True)
        audit.check('tests/finance.test.js', b'const example={"accounts":[{"id":"fiction"}]};')

    def test_icon_rejects_trailing_data_or_corruption(self):
        name = 'icons/icon-192.png'
        data = (SCRIPTS.parent/name).read_bytes()
        audit.check(name,data)
        corrupt=bytearray(data)
        corrupt[40]^=1
        for bad in (data+b'exemple confidentiel fictif', bytes(corrupt)):
            with self.assertRaises(ValueError):
                audit.check(name,bad)

    def test_optional_dictionary(self):
        with self.assertRaises(ValueError):
            audit.check('README.md','Mention de L’Échantillon'.encode(),('echantillon',))

    def test_rejects_unexpected_installable_file(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'fixture.zip'
            with zipfile.ZipFile(path,'w') as archive:
                archive.writestr('index.html','<!doctype html>')
                archive.writestr('market/fixture.json','{}')
            with self.assertRaises(ValueError):
                audit.inspect_archive(path,())
