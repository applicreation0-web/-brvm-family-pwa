"""Checks of the exact shell published by the build, with synthetic market data."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from prepare_feed import prepare


class Shell(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.csp = None

    def handle_starttag(self, tag, pairs):
        attributes = dict(pairs)
        if tag == 'script':
            self.scripts.append(attributes.get('src'))
        if tag == 'meta' and attributes.get('http-equiv') == 'Content-Security-Policy':
            self.csp = attributes.get('content')


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.directory.cleanup)
        cls.build = Path(cls.directory.name) / 'app'
        subprocess.run([sys.executable, str(ROOT / 'scripts/build.py'), str(cls.build)], check=True)

    def test_manifest_and_shell(self):
        page = Shell()
        page.feed((self.build / 'index.html').read_text())
        self.assertIn('quotes.js', page.scripts)
        for script in page.scripts:
            self.assertIsNotNone(script)
            self.assertTrue((self.build / script).is_file())
            subprocess.run(['node', '--check', str(self.build / script)], check=True)
        self.assertIn("connect-src 'self';", page.csp)
        self.assertIn("script-src 'self';", page.csp)
        manifest = json.loads((self.build / 'manifest.webmanifest').read_text())
        self.assertEqual(manifest['start_url'], './')
        self.assertEqual(manifest['display'], 'standalone')
        for icon in manifest['icons']:
            self.assertTrue((self.build / icon['src']).is_file())
        worker = (self.build / 'sw.js').read_text()
        shell = re.search(r'const SHELL=\[(.*?)\];', worker, re.S).group(1)
        for name in re.findall(r"'([^']+)'", shell):
            self.assertTrue((self.build / name).is_file())
        self.assertNotIn('market/', shell)
        self.assertNotIn('skipWaiting', worker)
        self.assertFalse(json.loads((self.build / 'market/feed.json').read_text())['enabled'])
        self.assertFalse((self.build / 'market/latest.csv').exists())

    def test_staging_with_active_parser_and_no_future_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            deployment = Path(directory) / 'build'
            subprocess.run([sys.executable, str(ROOT / 'scripts/build.py'), str(deployment)], check=True)
            content = Path(directory) / 'quotes.csv'
            content.write_text('symbol,session_date,basis,close_xof\nTTLC,2099-01-01,official,1250\n')
            with self.assertRaisesRegex(ValueError, 'future'):
                prepare(deployment, content, 'Test local', 'FIXTURE')
            self.assertFalse((deployment / 'market/latest.csv').exists())
            content.write_text('symbol,session_date,basis,close_xof\nTTLC,2025-01-06,official,1250\n')
            prepare(deployment, content, 'Test local', 'FIXTURE', True)
            self.assertEqual((deployment / 'market/latest.csv').read_bytes(), content.read_bytes())
            self.assertTrue(json.loads((deployment / 'market/feed.json').read_text())['enabled'])


if __name__ == '__main__':
    unittest.main()
