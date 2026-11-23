"""Collect public BRVM issuer-announcement pointers only, never private accounts or price feeds."""
import json
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

PAGES = {
    "communique": "https://www.brvm.org/fr/emetteurs/type-annonces/communiques",
    "dividende": "https://www.brvm.org/fr/esv/paiement-de-dividendes",
    "fractionnement": "https://www.brvm.org/fr/esv/fractionnement",
}
MONTHS = {"janvier":1,"fevrier":2,"mars":3,"avril":4,"mai":5,"juin":6,
          "juillet":7,"aout":8,"septembre":9,"octobre":10,"novembre":11,"decembre":12}


class Rows(HTMLParser):
    """Extract visible table cells and their linked official documents."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = {"text": "", "links": []}
        elif tag == "a" and self.cell is not None and props.get("href"):
            self.cell["links"].append(props["href"])

    def handle_data(self, text):
        if self.cell is not None:
            self.cell["text"] += text

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.row is not None and self.cell is not None:
            self.cell["text"] = " ".join(self.cell["text"].split())[:180]
            self.row.append(self.cell)
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None
            self.cell = None


def safe_link(href, page):
    url = urljoin(page, href)
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in ("www.brvm.org", "brvm.org"):
        return None
    if parts.username or parts.password or len(url) > 500:
        return None
    return url


def iso_date(text):
    match = re.search(r"\b(\d{2})/(\d{2})/(\d{4})\b", text)
    if match:
        try:
            return datetime(int(match[3]), int(match[2]), int(match[1])).date().isoformat()
        except ValueError:
            return None
    return None


def records(kind, page, html):
    parsed = Rows()
    parsed.feed(html)
    items = []
    for cells in parsed.rows:
        links = [safe_link(link, page) for cell in cells for link in cell["links"]]
        links = [link for link in links if link]
        if not links or len(cells) < 3:
            continue
        if kind == "communique":
            published = iso_date(cells[0]["text"])
            issuer = cells[1]["text"][:80]
            title = cells[2]["text"][:140]
            event = published
        else:
            issuer = cells[0]["text"][:80]
            published = None
            title = ("Avis de dividende — " if kind == "dividende" else "Avis de fractionnement — ") + issuer
            event = None
        if not issuer or not title or (kind == "communique" and not published):
            continue
        items.append({"type":kind, "issuer":issuer, "title":title, "url":links[0],
                      "publishedOn":published, "eventOn":event, "sourcePage":page})
    unique = {item["url"]:item for item in items}
    return list(unique.values())[:25]


def produce(fetch=None, today=None):
    def default_fetch(url):
        req = Request(url, headers={"User-Agent":"BRVM-Family-Public-Document-Watch/1.0 (source links only)"})
        with urlopen(req, timeout=25) as response:
            if response.status != 200 or len(response.read(1)) == 0:
                raise RuntimeError("Source officielle vide ou invalide")
        with urlopen(req, timeout=25) as response:
            data = response.read(1_000_001)
        if len(data)>1_000_000:
            raise RuntimeError("Source officielle trop volumineuse")
        return data.decode("utf-8", "replace")
    fetch = fetch or default_fetch
    checked = today or datetime.now(timezone.utc).date().isoformat()
    items = []
    succeeded = []
    for kind, page in PAGES.items():
        parsed = records(kind, page, fetch(page))
        if not parsed:
            raise RuntimeError("Aucun document exploitable pour " + kind)
        succeeded.append(page)
        items.extend(parsed)
    items.sort(key=lambda v: (v["publishedOn"] or "", v["type"], v["issuer"]), reverse=True)
    return {"schema":"brvm-public-watch-v1", "checkedOn":checked,
            "sources":succeeded, "items":items[:75]}


def main():
    result = produce()
    path = Path(__file__).resolve().parents[1] / "market/public-watch.json"
    path.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"BRVM public-watch: {len(result['items'])} liens officiels, {len(result['sources'])} catégories")


if __name__ == "__main__":
    main()
