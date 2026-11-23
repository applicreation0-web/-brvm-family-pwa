"""Offline parser tests: genuine sources are fetched only by scheduled GitHub Actions."""
import unittest
from scripts.update_public_watch import records, produce

COMM = """<table><tr><th>Date</th><th>Société</th><th>Titre</th><th>Avis</th></tr>
<tr><td>13/10/2026</td><td>SONATEL</td><td>SONATEL SN : Communiqué</td>
<td><a href="/sites/default/files/sonatel.pdf">Télécharger</a></td></tr>
<tr><td>12/10/2026</td><td>TEST</td><td>Faux</td>
<td><a href="https://evil.example/doc.pdf">Télécharger</a></td></tr></table>"""
DIV = """<table><tr><td>SMB</td><td></td><td></td><td>2025</td>
<td>18 septembre 2026</td><td>17 septembre 2026</td><td>800 FCFA</td>
<td><a href="/sites/default/files/smb.pdf">Télécharger</a></td></tr></table>"""
SPLIT = """<table><tr><td>SONATEL</td><td></td><td></td>
<td>26 octobre 2026</td><td>10 pour 1</td><td></td>
<td><a href="/sites/default/files/split.pdf">Télécharger</a></td></tr></table>"""


class TestPublicWatch(unittest.TestCase):
    def test_official_links_and_exclusion(self):
        items = records("communique", "https://www.brvm.org/fr/emetteurs/type-annonces/communiques", COMM)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["publishedOn"], "2026-10-13")
        self.assertEqual(items[0]["issuer"], "SONATEL")
        self.assertEqual(items[0]["url"], "https://www.brvm.org/sites/default/files/sonatel.pdf")

    def test_source_metadata_no_private_data_or_quotes(self):
        def fake(url):
            if "communiques" in url: return COMM
            if "dividendes" in url: return DIV
            return SPLIT
        payload = produce(fake, "2026-11-23")
        self.assertEqual(payload["schema"], "brvm-public-watch-v1")
        self.assertEqual(len(payload["items"]), 3)
        self.assertNotIn("accounts", str(payload))
        self.assertNotIn("quotes", str(payload))
        self.assertIn("fractionnement", [x["type"] for x in payload["items"]])

    def test_fail_closed_missing_source(self):
        with self.assertRaises(RuntimeError):
            produce(lambda u: "<html>aucune annonce</html>", "2026-11-23")


if __name__ == "__main__":
    unittest.main()
