#!/usr/bin/env python3
"""Parse africanfinancials.com price-list HTML into compact row JSON.

Mirrors the TS parser semantics (columns: Company | Price | % Change |
Value | Volume | YTD % | Sector | Updated). Ticker from title="(SCOM.ke)"
or the /company/ke-scom/ slug, uppercased + exchange suffix.
"""
import json
import re
import sys

FEEDS = {"NSE": ("ke-", ".NSE"), "NGX": ("ng-", ".NGX"), "GSE": ("gh-", ".GSE")}


def num(s):
    if not s:
        return None
    try:
        n = float(s.replace(",", "").replace("+", "").replace("%", ""))
    except ValueError:
        return None
    return n if n == n else None  # filter NaN


def integer(s):
    if not s:
        return None
    try:
        return int(s.replace(",", "").split(".")[0])
    except ValueError:
        return None


def strip_tags(s):
    s = re.sub(r"<[^>]+>", "", s)
    return s.replace("&amp;", "&").replace("&nbsp;", " ").strip()


def parse(html, exchange):
    prefix, suffix = FEEDS[exchange]
    rows = []
    for m in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", html):
        row = m.group(1)
        cells = [
            strip_tags(c.group(1))
            for c in re.finditer(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", row)
        ]
        if len(cells) < 5:
            continue
        price = num(cells[1])
        if price is None:
            continue
        ticker = None
        tm = re.search(r'title="[^"]*\(([A-Za-z0-9]+)\.[a-z]{2}\)', row)
        if tm:
            ticker = tm.group(1).upper() + suffix
        if not ticker:
            sm = re.search(r"/company/" + prefix.replace("-", r"\-") + r"([a-z0-9]+)/", row)
            if sm:
                ticker = sm.group(1).upper() + suffix
        if not ticker:
            continue
        rows.append(
            {
                "ticker": ticker,
                "name": cells[0],
                "price": price,
                "change_percent": num(cells[2]),
                "value_traded": integer(cells[3]),
                "volume": integer(cells[4]),
                "ytd_percent": num(cells[5]),
                "sector": cells[6] or None,
                "updated": cells[7] or None,
            }
        )
    return rows


if __name__ == "__main__":
    html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
    exchange = sys.argv[2]
    rows = parse(html, exchange)
    print(json.dumps({"exchange": exchange, "rows": rows}))
    print(f"parsed {len(rows)} rows for {exchange}", file=sys.stderr)
