#!/usr/bin/env python3
"""Self-host Sora + Clash Display from Fontshare: download the woff2 files into app/public/fonts
and generate app/src/fonts.css with local @font-face rules (no CDN dependency at runtime)."""
import re, os, urllib.request

CSS_URL = "https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=sora@400,500,600,700,800&display=swap"
OUT_FONTS = "app/public/fonts"
OUT_CSS = "app/src/fonts.css"
UA = {"User-Agent": "Mozilla/5.0"}
os.makedirs(OUT_FONTS, exist_ok=True)

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()

css = get(CSS_URL).decode()
blocks = re.findall(r"@font-face\s*\{(.*?)\}", css, re.S)

lines = ["/* Self-hosted Sora + Clash Display (Fontshare) — no runtime CDN dependency */"]
seen = set()
for b in blocks:
    fam = re.search(r"font-family:\s*'([^']+)'", b)
    wt = re.search(r"font-weight:\s*(\d+)", b)
    style = re.search(r"font-style:\s*(\w+)", b)
    woff2 = re.search(r"url\('([^']+\.woff2)'\)", b)
    if not (fam and wt and woff2):
        continue
    if style and style.group(1) != "normal":
        continue
    slug = fam.group(1).lower().replace(" ", "-")
    key = (slug, wt.group(1))
    if key in seen:
        continue
    seen.add(key)
    url = woff2.group(1)
    if url.startswith("//"):
        url = "https:" + url
    fn = f"{slug}-{wt.group(1)}.woff2"
    path = os.path.join(OUT_FONTS, fn)
    with open(path, "wb") as f:
        f.write(get(url))
    lines.append(
        "@font-face {\n"
        f"  font-family: '{fam.group(1)}';\n"
        "  font-style: normal;\n"
        f"  font-weight: {wt.group(1)};\n"
        "  font-display: swap;\n"
        f"  src: url('/fonts/{fn}') format('woff2');\n"
        "}"
    )

with open(OUT_CSS, "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"downloaded {len(seen)} woff2 files -> {OUT_FONTS}")
print(f"wrote {OUT_CSS}")
