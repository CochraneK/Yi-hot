# -*- coding: utf-8 -*-
"""Render the prefilter pipeline as a real PNG for the About page.

Drawn from packages/backend/src/editorial/analyze.ts (lines 342-355), not from a
conceptual sketch: UNKNOWN is let through, only BLOCK stops, and the expensive
understand step only runs when the score is near its threshold.

Palette taken from apps/web/app/app.css so the image matches the live site:
  accent #176b75, ink #202a30 / #59656b / #657176, surface #ffffff, line #dfe4e1.
"""
import io, os, struct, zlib, subprocess, sys

W, H = 1600, 1000
OUT = r'D:\Software\DSH\gonyi-hot\assets\pipeline-prefilter.png'
SVG_TMP = r'D:\Software\DSH\_pipeline.svg'

ACCENT = '#176b75'
ACCENT_SOFT = 'rgba(23,107,117,0.10)'
INK = '#202a30'
INK3 = '#59656b'
INK4 = '#8a9498'
LINE = '#dfe4e1'
LINE_STRONG = '#d1d9d5'

FONT = "Segoe UI, Microsoft YaHei, PingFang SC, Hiragino Sans GB, sans-serif"

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def box(x, y, w, h, r=10, stroke=LINE, fill='#ffffff', sw=1.5, extra=''):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}" {extra}/>')

def text(x, y, s, size=20, fill=INK, weight=400, anchor='start', ls='0'):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" fill="{fill}" '
            f'font-weight="{weight}" text-anchor="{anchor}" letter-spacing="{ls}">{esc(s)}</text>')

def arrow_down(cx, y, h=22, color=LINE_STRONG):
    return (f'<path d="M{cx} {y} v{h-6} " stroke="{color}" stroke-width="2" fill="none"/>'
            f'<path d="M{cx-5} {y+h-8} l5 6 5-6" fill="none" stroke="{color}" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')

p = []
p.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
p.append(f'<rect width="{W}" height="{H}" fill="#fbfcfb"/>')

# --- header ---
p.append(text(70, 78, '筛选流水线', 20, ACCENT, 700, ls='3'))
p.append(text(70, 132, '一条动态进来之后，会遇到什么', 40, INK, 700))
p.append(text(70, 172, '按 prefilter 的真实判定分支，不是概念示意。', 20, INK4))
p.append(f'<line x1="70" y1="200" x2="{W-70}" y2="200" stroke="{LINE}" stroke-width="1.5"/>')

# --- 01 collect + 02 dedupe, side by side ---
cx, cy, cw, ch = 70, 236, 690, 104
p.append(box(cx, cy, cw, ch, 12, LINE_STRONG, '#ffffff', 1.6))
p.append(text(cx + 30, cy + 44, '01', 17, INK4, 700))
p.append(text(cx + 78, cy + 44, '采集', 26, INK, 700))
p.append(text(cx + 30, cy + 80, '按栏目抓列表页，拿到标题、链接与发布时间', 19, INK3))

cx2 = 840
p.append(box(cx2, cy, cw, ch, 12, LINE_STRONG, '#ffffff', 1.6))
p.append(text(cx2 + 30, cy + 44, '02', 17, INK4, 700))
p.append(text(cx2 + 78, cy + 44, '去重', 26, INK, 700))
p.append(text(cx2 + 30, cy + 80, '以 url: 前缀做唯一键，同一链接只留一条', 19, INK3))

# --- 03 prefilter: the three verdicts ---
py = 400
p.append(box(70, py, W - 140, 300, 14, ACCENT, '#ffffff', 2.2))
p.append(text(102, py + 46, '03', 17, ACCENT, 700))
p.append(text(150, py + 46, '相关性预筛', 26, INK, 700))
p.append(text(330, py + 46, '只回答一个问题：跟公益有没有关系', 19, INK3))

cards = [
    ('PASS', '确认与公益相关', '继续打分', ACCENT, True),
    ('UNKNOWN', '材料不足，无法判定', '照样放行，等待补材料', INK4, False),
    ('BLOCK', '确认与公益无关', '就地停止，不再消耗模型调用', INK4, False),
]
cw3, gap = 430, 22
x0 = 102
for i, (label, meaning, nxt, col, strong) in enumerate(cards):
    x = x0 + i * (cw3 + gap)
    y = py + 74
    fill = ACCENT_SOFT if strong else '#fafbfb'
    p.append(box(x, y, cw3, 132, 10, col if strong else LINE, fill, 1.8 if strong else 1.4))
    chip = col if strong else '#7d878b'
    p.append(f'<rect x="{x+22}" y="{y+20}" width="{len(label)*13+34}" height="30" rx="15" '
             f'fill="none" stroke="{chip}" stroke-width="1.5"/>')
    p.append(text(x + 22 + (len(label) * 13 + 34) / 2, y + 41, label, 16, chip, 700, 'middle'))
    p.append(text(x + 22, y + 80, meaning, 19, INK3))
    p.append(text(x + 22, y + 112, nxt, 17, INK4))

p.append(text(102, py + 250, '只有 BLOCK 会让流程停下。UNKNOWN 放行——它手上的材料已经是最全的了，再等也不会多出信息。', 18, INK4))

# --- connector from prefilter to score ---
p.append(arrow_down(W / 2, 704, 26))

# --- 04 score with the short-circuit branch ---
sy = 744
p.append(box(70, sy, W - 140, 92, 12, LINE_STRONG, '#ffffff', 1.6))
p.append(text(102, sy + 42, '04', 17, INK4, 700))
p.append(text(150, sy + 42, '两次独立打分', 26, INK, 700))
p.append(text(390, sy + 42, '各打一次再相加，防止单次判断决定命运', 19, INK3))
p.append(text(102, sy + 74, '门槛按信源等级定：T1 / T1_5 = 35，T2 = 40；两项之和 ≥ 2 倍门槛才算入选。', 18, INK4))

# --- 04b the two branches ---
by = 852
bw = 706
p.append(box(70, by, bw, 112, 10, LINE, '#ffffff', 1.4))
p.append(text(96, by + 36, '分数够得着门槛', 20, INK, 700))
p.append(text(96, by + 68, '走深度理解，生成中文标题、摘要与推荐理由。', 18, INK3))
p.append(text(96, by + 94, '这一步最贵，所以只在接近门槛时才做。', 17, INK4))

bx2 = 70 + bw + 28
p.append(box(bx2, by, bw, 112, 10, LINE, '#fafbfb', 1.4))
p.append(text(bx2 + 26, by + 36, '分数明显偏低', 20, INK, 700))
p.append(text(bx2 + 26, by + 68, '跳过深度理解，只做摘要。', 18, INK3))
p.append(text(bx2 + 26, by + 94, '省下一次模型调用，内容仍然会进「全部动态」。', 17, INK4))

p.append('</svg>')

svg = '\n'.join(p)
io.open(SVG_TMP, 'w', encoding='utf-8').write(svg)
print('svg written:', len(svg), 'chars ->', SVG_TMP)

# Rasterise. Try resvg/rsvg/inkscape/chrome in order.
def which(exe):
    for d in os.environ.get('PATH', '').split(os.pathsep):
        c = os.path.join(d, exe)
        if os.path.isfile(c):
            return c
    return None

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
if os.path.isfile(CHROME):
    # Chrome renders SVG to PNG at exact size with this trick.
    html = ('<html><head><style>html,body{margin:0;padding:0;background:#fbfcfb}'
            'svg{display:block}</style></head><body>' + svg + '</body></html>')
    hp = r'D:\Software\DSH\_pipeline_render.html'
    io.open(hp, 'w', encoding='utf-8').write(html)
    out_png = SVG_TMP.replace('.svg', '.png')
    cmd = [CHROME, '--headless=new', '--disable-gpu', '--no-sandbox',
           '--default-background-color=00000000',
           '--window-size=%d,%d' % (W, H),
           '--screenshot=' + out_png, 'file:///' + hp.replace('\\', '/')]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if os.path.isfile(out_png) and os.path.getsize(out_png) > 2000:
        os.replace(out_png, OUT)
        print('PNG via chrome ->', OUT, os.path.getsize(OUT), 'bytes')
    else:
        print('chrome render failed:', r.stdout[-300:], r.stderr[-300:])
else:
    print('no chrome found')
