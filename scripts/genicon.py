from PIL import Image, ImageDraw, ImageFont

W = H = 128
R = 28
BG = (138, 92, 255, 255)   # #8a5cff
FG = (255, 255, 255, 255)
TEXT = "コード"
FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"

# Supersample 4x for crisp downscaled edges
S = 4
img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, W * S - 1, H * S - 1], radius=R * S, fill=BG)

# Auto-fit font so the word spans ~112px (of 128) wide
target = 112 * S
size = 10 * S
while True:
    f = ImageFont.truetype(FONT_PATH, size)
    box = d.textbbox((0, 0), TEXT, font=f)
    if box[2] - box[0] >= target or size > 120 * S:
        break
    size += S
f = ImageFont.truetype(FONT_PATH, size)

box = d.textbbox((0, 0), TEXT, font=f, stroke_width=S)
tw = box[2] - box[0]
th = box[3] - box[1]
x = (W * S - tw) / 2 - box[0]
y = (H * S - th) / 2 - box[1]
# faux-bold via same-color stroke
d.text((x, y), TEXT, font=f, fill=FG, stroke_width=S, stroke_fill=FG)

img = img.resize((W, H), Image.LANCZOS)
img.save("/Users/dennis/Dev/wanikani_for_code/media/icon.png")
print("saved", img.size, "font size", size // S)
