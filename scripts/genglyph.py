from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
TEXT = "コード"
OUT = "/Users/dennis/Dev/wanikani_for_code/media/activitybar.svg"
VB = 24.0
PAD = 1.5

font = TTFont(FONT, fontNumber=0)
cmap = font.getBestCmap()
gs = font.getGlyphSet()

# Collect combined path (font units, y-up) with per-glyph x advance
path_pen = SVGPathPen(gs)
bounds_pen = BoundsPen(gs)
x = 0.0
for ch in TEXT:
    gname = cmap[ord(ch)]
    glyph = gs[gname]
    glyph.draw(TransformPen(path_pen, (1, 0, 0, 1, x, 0)))
    glyph.draw(TransformPen(bounds_pen, (1, 0, 0, 1, x, 0)))
    x += glyph.width
d = path_pen.getCommands()

xMin, yMin, xMax, yMax = bounds_pen.bounds
cw, ch = xMax - xMin, yMax - yMin
scale = min((VB - 2 * PAD) / cw, (VB - 2 * PAD) / ch)
offX = (VB - cw * scale) / 2.0
offY = (VB - ch * scale) / 2.0
# matrix maps font (px,py y-up) -> svg (y-down), flipping Y and centering
a, dd = scale, -scale
e = offX - xMin * scale
f = offY + yMax * scale

svg = (
    f'<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">\n'
    f'  <g transform="matrix({a:.5f} 0 0 {dd:.5f} {e:.4f} {f:.4f})" fill="currentColor">\n'
    f'    <path d="{d}"/>\n'
    f'  </g>\n'
    f'</svg>\n'
)
with open(OUT, "w") as fp:
    fp.write(svg)
print(f"wrote {OUT}  content {cw:.0f}x{ch:.0f} scale {scale:.4f} bytes {len(svg)}")
