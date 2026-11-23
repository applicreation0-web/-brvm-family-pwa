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
DOCS = """<html><h2><a href="/fr/rapport-sonatel-2026">SONATEL SENEGAL : Rapport annuel - Exercice 2025</a></h2><h2><a href="https://hostile.example/actif">TITRE MALVEILLANT : Rapport</a></h2></html>"""
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
            if "type-document" in url: return DOCS
            return SPLIT
        payload = produce(fake, "2026-11-23")
        self.assertEqual(payload["schema"], "brvm-public-watch-v1")
        self.assertGreaterEqual(len(payload["items"]), 7)
        self.assertNotIn("accounts", str(payload))
        self.assertNotIn("quotes", str(payload))
        self.assertIn("fractionnement", [x["type"] for x in payload["items"]])
        self.assertEqual(next(x for x in payload["items"] if x["type"]=="fractionnement")["eventOn"], "2026-10-26")
        self.assertEqual(next(x for x in payload["items"] if x["type"]=="dividende")["eventOn"], "2026-09-18")

    def test_financial_filing_links_are_only_source_pointers(self):
        items = records("annuel", "https://www.brvm.org/fr/type-document/rapports-annuels", DOCS)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["issuer"], "SONATEL SENEGAL")
        self.assertEqual(items[0]["publishedOn"], None)
        self.assertEqual(items[0]["url"], "https://www.brvm.org/fr/rapport-sonatel-2026")

    def test_fail_closed_missing_source(self):
        with self.assertRaises(RuntimeError):
            produce(lambda u: "<html>aucune annonce</html>", "2026-11-23")


if __name__ == "__main__":
    unittest.main()
