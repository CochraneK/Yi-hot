#!/usr/bin/env python3
"""Render the canonical README and living MAINTENANCE manual into standalone PDFs."""
from __future__ import annotations
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from bs4 import BeautifulSoup
import mistune
from weasyprint import HTML
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)
EDITION = datetime.now(timezone.utc).strftime("%Y-%m-%d")
MARKDOWN = mistune.create_markdown(escape=False, plugins=["table", "strikethrough", "url"])

CSS = r"""
@page {
  size: A4;
  margin: 18mm 17mm 19mm;
  @top-right { content: "YiHot · 项目文档"; font: 8pt "Noto Sans CJK SC", sans-serif; color: #708399; }
  @bottom-left { content: "GitHub / CochraneK / Yi-hot"; font: 8pt "Noto Sans CJK SC", sans-serif; color: #91a0af; }
  @bottom-right { content: counter(page); font: 9pt "Noto Sans CJK SC", sans-serif; color: #708399; }
}
* { box-sizing: border-box; }
html { font-family: "Noto Sans CJK SC", "Noto Sans CJK JP", sans-serif; font-size: 10pt; color: #203247; }
body { margin: 0; line-height: 1.75; overflow-wrap: anywhere; }
header { border-bottom: 2px solid #dce7ef; padding-bottom: 9mm; margin-bottom: 7mm; }
.edition { color: #71859b; font-size: 9pt; letter-spacing: .08em; }
h1 { font-size: 22pt; color: #153453; line-height: 1.35; margin: 16pt 0 10pt; }
h2 { font-size: 15pt; color: #174f73; margin: 18pt 0 7pt; padding-bottom: 4pt; border-bottom: 1px solid #dbe6ef; break-after: avoid; }
h3 { font-size: 12pt; color: #245c75; margin: 14pt 0 5pt; break-after: avoid; }
h4 { font-size: 10pt; color: #385974; margin: 12pt 0 5pt; break-after: avoid; }
p { margin: 0 0 7pt; }
a { color: #1574a8; text-decoration: none; overflow-wrap: anywhere; }
strong { font-weight: 700; }
code { font-family: "DejaVu Sans Mono", monospace; font-size: 8.1pt; background: #f1f6fa; padding: 1pt 2pt; }
pre { font-family: "DejaVu Sans Mono", "Noto Sans CJK SC", monospace; font-size: 8pt; line-height: 1.45; background: #f3f7fa; border: 1px solid #dce6ee; padding: 9pt; white-space: pre-wrap; overflow-wrap: anywhere; }
pre code { background: transparent; padding: 0; font-size: inherit; white-space: inherit; }
blockquote { background: #f4f8fc; color: #41566d; border-left: 3px solid #77a5c7; padding: 9pt 12pt; margin: 9pt 0; }
blockquote p:last-child { margin-bottom: 0; }
hr { border: 0; border-top: 1px solid #dde6ed; margin: 16pt 0; }
img { max-width: 100%; height: auto; }
ul, ol { margin: 5pt 0 9pt; padding-left: 17pt; }
li { margin: 2pt 0; }
li p { margin: 0; }
table { width: 100%; border-collapse: collapse; margin: 9pt 0 12pt; font-size: 8.2pt; table-layout: auto; }
th { background: #eaf1f7; color: #193b59; font-weight: 700; text-align: left; }
th,td { border: 1px solid #dbe4ee; padding: 5pt 6pt; vertical-align: top; overflow-wrap: anywhere; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.toc { padding: 7pt 0 12pt; border-bottom: 1px solid #dce7ef; margin-bottom: 10pt; }
.toc-title { font-size: 14pt; color: #214864; font-weight: 700; margin-bottom: 7pt; }
.toc a { display: block; color: #355b79; margin: 1pt 0; font-size: 9pt; }
.toc a::after { content: leader(".") target-counter(attr(href), page); color: #728a9c; }
.external-image { color: #697f92; font-size: 8pt; border: 1px solid #dce6ef; padding: 2pt 5pt; margin-right: 5pt; }
section { break-inside: auto; }
"""

def to_html(file_name: str, title: str) -> str:
    src = (ROOT / file_name).read_text(encoding="utf-8-sig")
    soup = BeautifulSoup(MARKDOWN(src), "html.parser")
    toc = []
    for index, tag in enumerate(soup.find_all(["h2", "h3"]), start=1):
        anchor = "section-" + str(index)
        tag["id"] = anchor
        if tag.name == "h2":
            toc.append((anchor, tag.get_text(" ", strip=True)))
    for img in list(soup.find_all("img")):
        link = img.get("src", "")
        if link.startswith(("http://", "https://")):
            replacement = soup.new_tag("span", attrs={"class": "external-image"})
            replacement.string = img.get("alt", "External image")
            img.replace_with(replacement)
    toc_html = '<nav class="toc"><div class="toc-title">目录 / Contents</div>'
    toc_html += "".join(f'<a href="#{escape(ref)}">{escape(label)}</a>' for ref,label in toc)
    toc_html += "</nav>"
    edition = escape(EDITION)
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>{escape(title)}</title><style>{CSS}</style></head>
<body><header><div class="edition">YI-HOT · GITHUB MAIN · {edition}</div>
<div style="font-size:10pt;color:#516b83">{escape(title)}</div>
<div style="font-size:8pt;color:#91a0af">由 GitHub 仓库原始 Markdown 导出；仓库版本见 CochraneK/Yi-hot。</div>
</header>
{toc_html}
<main>{str(soup)}</main>
</body></html>"""

def export(file_name: str, output_name: str, title: str) -> Path:
    html = to_html(file_name, title)
    output = OUT / output_name
    HTML(string=html, base_url=str(ROOT)).write_pdf(str(output))
    count = len(PdfReader(str(output)).pages)
    print(f"Exported {output.relative_to(ROOT)}: {count} pages, {output.stat().st_size} bytes")
    return output

readme = export("README.md", "YiHot_README.pdf", "YiHot README · 项目展示与快速入门")
manual = export("MAINTENANCE.md", "YiHot_MAINTENANCE.pdf", "YiHot 维护手册 · Living Handbook")
merged = PdfWriter()
merged.append(str(readme), outline_item="README · 项目展示")
merged.append(str(manual), outline_item="MAINTENANCE · 完整维护手册")
merged.add_metadata({"/Title": "YiHot · README 与完整维护手册", "/Author": "YiHot", "/Subject": "Exported from CochraneK/Yi-hot"})
target = OUT / "YiHot_Complete.pdf"
with target.open("wb") as output:
    merged.write(output)
print(f"Exported {target.relative_to(ROOT)}: {len(PdfReader(str(target)).pages)} pages, {target.stat().st_size} bytes")
