# Draws the dance button glyph (265x265 white, like Jibo's stock actionIcons),
# the Store icon (330x330) and banner (1000x800).  python3 tools/make-art.py .
import math, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = sys.argv[1]
S = 4  # supersample
WHITE = (255, 255)

def canvas(size=265):
    im = Image.new('LA', (size * S, size * S), (0, 0)); return im, ImageDraw.Draw(im)

def save(im, path, size=265): im.resize((size, size), Image.LANCZOS).save(path)

def P(x, y): return (x * S, y * S)

def jibo(d, cx, base, k=1.0, tilt=0.0):
    """Jibo from the front: a body that widens to its base, a round head, and his face screen
    with the single eye. Tilted by `tilt` degrees around the base, as when he sways."""
    a = math.radians(tilt)
    rot = lambda x, y: P(cx + (x * math.cos(a) - y * math.sin(a)) * k, base + (x * math.sin(a) + y * math.cos(a)) * k)
    d.polygon([rot(x, y) for x, y in [(-52, 0), (52, 0), (34, -78), (-34, -78)]], fill=WHITE)
    def disc(x, y, r, fill):
        px, py = rot(x, y); r *= k * S; d.ellipse([px - r, py - r, px + r, py + r], fill=fill)
    disc(0, -120, 54, WHITE); disc(0, -120, 41, (0, 0)); disc(0, -120, 15, WHITE)

def dance():
    im, d = canvas(); jibo(d, 132, 226, 0.95, tilt=-12)
    for side in (-1, 1):
        for i, r in enumerate((86, 112)):
            d.arc([P(132 - r, 110 - r), P(132 + r, 110 + r)], 270 + side * 55 - 16, 270 + side * 55 + 16, fill=WHITE, width=10 * S)
    return im

def metronome(size):
    im, d = canvas(size); c = size / 2
    d.polygon([P(c - 70, size - 52), P(c + 70, size - 52), P(c + 28, 42), P(c - 28, 42)], outline=WHITE, width=12 * S)
    d.rectangle([P(c - 70, size - 100), P(c + 70, size - 52)], fill=WHITE)
    a = math.radians(24); top = (c + math.sin(a) * 190, size - 110 - math.cos(a) * 190)
    d.line([P(c, size - 110), P(*top)], fill=WHITE, width=12 * S)
    d.rounded_rectangle([P(top[0] + (c - top[0]) * 0.35 - 16, top[1] + (size - 110 - top[1]) * 0.35 - 12),
                         P(top[0] + (c - top[0]) * 0.35 + 16, top[1] + (size - 110 - top[1]) * 0.35 + 12)], radius=5 * S, fill=WHITE)
    return im

save(dance(), f'{ROOT}/metronome/resources/dance.png')
save(metronome(330), f'{ROOT}/icon.png', 330)

# Banner: dark background, glowing title, the metronome and a dancing Jibo.
FONT = '/root/.hermes/cache/scratch/Nunito.ttf'
W, H = 1000 * 2, 800 * 2
banner = Image.new('RGBA', (W, H), (14, 16, 26, 255))
layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ORANGE = (255, 179, 71, 255)
for i, (g, col) in enumerate([(metronome(330), ORANGE), (dance(), (200, 205, 225, 255))]):
    g = g.resize((300 * 2, 300 * 2), Image.LANCZOS).convert('RGBA')
    tint = Image.new('RGBA', g.size, col); tint.putalpha(g.getchannel('A'))
    layer.alpha_composite(tint, ((500 + (i * 2 - 1) * 170 - 150) * 2, 130 * 2))
f = ImageFont.truetype(FONT, 120 * 2); f.set_variation_by_name('Black')
ImageDraw.Draw(layer).text((W // 2, 590 * 2), 'Metronome', font=f, fill=ORANGE, anchor='mm')
blur = layer.filter(ImageFilter.GaussianBlur(14 * 2))
banner.alpha_composite(blur); banner.alpha_composite(blur); banner.alpha_composite(layer)
banner.convert('RGB').resize((1000, 800), Image.LANCZOS).save(f'{ROOT}/banner.png')
print('art written')
