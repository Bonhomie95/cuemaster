"""Compose store listing art from the UI walk's screenshots.

node tools/ui-walk.mjs --store      # first: real screenshots at store sizes
python3 tools/store_art.py          # then: captioned listing images, Play feature graphic, icon
Writes artifacts/store-listing/<size>/NN-name.png, feature-graphic-1024x500.png, icon-512.png.
Every image is the real game; the caption and frame are the only additions.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "artifacts/store-screenshots")
OUT = os.path.join(ROOT, "artifacts/store-listing")
BOLD = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
SEMI = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
PICKS = [
    ("01-home", "Pool, your way", "Online, friends, computer rivals and practice"),
    ("09-online-break", "Real physics. Every shot.", "Spin, cushions and throw, played out for real"),
    ("08-vs-online", "Play the world", "1 vs 1 online. The winner takes the pot"),
    ("10-victory", "Win coins, crates, trophies", "Every win seals a reward crate"),
    ("13-wheel", "Free spin every day", "Plus free coins every four hours"),
    ("11-friend-room", "Challenge your friends", "Send a link, play a private table"),
    ("15-pass", "A season pass of rewards", "30 tiers of coins, rubies and crates"),
]


def gradient(size, top, bottom):
    w, h = size
    g = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        g.putpixel((0, y), tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    return g.resize(size)


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *im.size), radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out


def frame(shot, title, subtitle, size):
    w, h = size
    canvas = gradient(size, (10, 38, 60), (3, 12, 20)).convert("RGBA")
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((w * 0.2, -h * 0.5, w * 0.8, h * 0.45), fill=(255, 208, 91, 60))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(w // 12)))
    band = int(h * 0.2)
    s = (h - band - int(h * 0.05)) / shot.height
    shot = shot.resize((int(shot.width * s), int(shot.height * s)), Image.LANCZOS)
    x, y = (w - shot.width) // 2, band
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x + 8, y + 18, x + shot.width + 8, y + shot.height + 18), w // 60, fill=(0, 0, 0, 170))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(w // 90)))
    canvas.alpha_composite(rounded(shot.convert("RGBA"), w // 60), (x, y))
    d = ImageDraw.Draw(canvas)
    big = ImageFont.truetype(BOLD, int(h * 0.07))
    small = ImageFont.truetype(SEMI, int(h * 0.032))
    d.text((w / 2, band * 0.42), title, font=big, fill=(255, 253, 243), anchor="mm")
    d.text((w / 2, band * 0.8), subtitle, font=small, fill=(255, 208, 91), anchor="mm")
    return canvas.convert("RGB")


def feature_graphic():
    w, h = 1024, 500
    hero = Image.open(os.path.join(ROOT, "mobile/assets/lounge/hero.jpg")).convert("RGB")
    s = max(w / hero.width, h / hero.height)
    hero = hero.resize((int(hero.width * s), int(hero.height * s)), Image.LANCZOS)
    hero = hero.crop(((hero.width - w) // 2, (hero.height - h) // 2, (hero.width - w) // 2 + w, (hero.height - h) // 2 + h))
    shade = Image.new("RGBA", (w, h))
    for x in range(w):
        a = int(235 * max(0.0, 1 - x / (w * 0.62)))
        ImageDraw.Draw(shade).line([(x, 0), (x, h)], fill=(8, 30, 48, a))
    out = hero.convert("RGBA")
    out.alpha_composite(shade)
    d = ImageDraw.Draw(out)
    logo = ImageFont.truetype(BOLD, 74)
    d.text((56, 150), "CUE", font=logo, fill=(255, 253, 243))
    d.text((56 + d.textlength("CUE", font=logo), 150), "MASTER", font=logo, fill=(255, 208, 91))
    d.text((60, 255), "Real physics. Real rivals.", font=ImageFont.truetype(SEMI, 34), fill=(255, 253, 243))
    d.text((60, 305), "Play online, challenge friends, win every day.", font=ImageFont.truetype(SEMI, 22), fill=(169, 196, 214))
    return out.convert("RGB")


os.makedirs(OUT, exist_ok=True)
for folder in sorted(os.listdir(SHOTS)) if os.path.isdir(SHOTS) else []:
    w, h = (int(v) for v in folder.split("-")[-1].split("x"))
    dest = os.path.join(OUT, folder)
    os.makedirs(dest, exist_ok=True)
    for i, (name, title, subtitle) in enumerate(PICKS, 1):
        src = os.path.join(SHOTS, folder, name + ".png")
        if not os.path.exists(src):
            print("missing", src)
            continue
        frame(Image.open(src).convert("RGB"), title, subtitle, (w, h)).save(os.path.join(dest, f"{i:02d}-{name}.png"), optimize=True)
    print("wrote", dest)
feature_graphic().save(os.path.join(OUT, "feature-graphic-1024x500.png"), optimize=True)
Image.open(os.path.join(ROOT, "mobile/assets/club-icon.png")).convert("RGB").resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"), optimize=True)
print("wrote feature graphic and icon")
