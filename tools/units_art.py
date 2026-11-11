"""Tiny Swords 兵牌生成器。

从 192px 网格的 Warrior/Archer 图集切帧，按「一队人」排版成一张兵牌图；
免费包里没有骑乘单位，骑兵 = 骑士上半身 + 自绘俯视马体。
草地砖用程序生成，保证四边可无缝平铺。

用法：python3 tools/units_art.py --src <图集目录>
输出：public/assets/units/*.png、public/assets/terrain/ground.png
依赖：Pillow（pip install pillow）
"""
from __future__ import annotations

import argparse
import random
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_UNITS = ROOT / "public" / "assets" / "units"
OUT_TERRAIN = ROOT / "public" / "assets" / "terrain"
FRAME = 192
CANVAS = (116, 108)

BASE = "https://raw.githubusercontent.com/Hdisa/Tiny-Swords/9904d5a760a8e49d987acf3c29607f8962ac75a7/Assets/Tiny%20Swords/Factions/Knights/Troops"
SOURCES = {
    "Warrior_Blue.png": f"{BASE}/Warrior/Blue/Warrior_Blue.png",
    "Warrior_Red.png": f"{BASE}/Warrior/Red/Warrior_Red.png",
    "Archer_Blue.png": f"{BASE}/Archer/Blue/Archer_Blue.png",
    "Archer_Red.png": f"{BASE}/Archer/Red/Archer_Red.png",
}
# 行=朝向：蓝方朝上取第 4 行，红方朝下取第 0 行；列 0 步兵、列 1 弓手
FRAME_PICK = {"p": {"inf": (4, 0), "rng": (4, 1), "cav": (4, 0)}, "e": {"inf": (0, 0), "rng": (0, 1), "cav": (0, 0)}}


def ensure_sources(src: Path) -> None:
    src.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        dst = src / name
        if not dst.exists():
            print(f"download {name}")
            urllib.request.urlretrieve(url, dst)


def frame(sheet: Image.Image, row: int, col: int) -> Image.Image:
    return sheet.crop((col * FRAME, row * FRAME, (col + 1) * FRAME, (row + 1) * FRAME))


def trim(img: Image.Image) -> Image.Image:
    box = img.getbbox()
    return img.crop(box) if box else img


def scaled(img: Image.Image, size: int) -> Image.Image:
    w = max(1, round(img.width * size / img.height))
    return img.resize((w, size), Image.NEAREST)


def outline(img: Image.Image, color=(32, 26, 24, 255)) -> Image.Image:
    alpha = img.split()[3].filter(ImageFilter.MaxFilter(3))
    ring = Image.new("RGBA", img.size, color)
    ring.putalpha(alpha)
    return Image.alpha_composite(ring, img)


def shadow(layer: Image.Image, cx: int, cy: int, rx: int, ry: int) -> None:
    ImageDraw.Draw(layer).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(20, 22, 18, 90))


def squad(sheet: Image.Image, kind: str, side: str, size: int, count: int) -> Image.Image:
    row, col = FRAME_PICK[side][kind]
    unit = scaled(trim(frame(sheet, row, col)), size)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    spread = size * 0.55
    start = CANVAS[0] // 2 - round(spread * (count - 1) / 2)
    for i in range(count):
        cx = start + round(i * spread)
        cy = CANVAS[1] // 2 + (0 if count == 1 else (6 if i % 2 else -4))
        shadow(canvas, cx, cy + size * 0.38, size * 0.32, size * 0.1)
        canvas.alpha_composite(unit, (cx - unit.width // 2, cy - unit.height // 2))
    return canvas


def horse(color=(122, 84, 54, 255), mane=(58, 38, 26, 255), cloth=(52, 92, 168, 255)) -> Image.Image:
    """俯视马体：窄身 + 前伸的脖颈 + 双耳 + 四蹄"""
    w, h = 52, 62
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body = (14, 14, w - 14, h - 10)
    d.ellipse(body, fill=color)
    d.ellipse((body[0] + 4, body[1] + 6, body[2] - 4, body[3] - 6), fill=cloth)
    d.polygon([(w // 2 - 8, 16), (w // 2 + 8, 16), (w // 2 + 5, 2), (w // 2 - 5, 2)], fill=color)
    d.line([(w // 2 - 6, 15), (w // 2 - 4, 5)], fill=mane, width=3)
    d.line([(w // 2 + 6, 15), (w // 2 + 4, 5)], fill=mane, width=3)
    d.polygon([(w // 2 - 6, 2), (w // 2 - 2, -2), (w // 2 - 3, 4)], fill=color)
    d.polygon([(w // 2 + 6, 2), (w // 2 + 2, -2), (w // 2 + 3, 4)], fill=color)
    for lx in (body[0] + 4, body[2] - 8):
        d.rectangle((lx, body[3] - 4, lx + 5, h - 2), fill=(38, 28, 20, 255))
    d.ellipse((w // 2 - 5, 6, w // 2 - 2, 9), fill=(18, 16, 14, 255))
    d.ellipse((w // 2 + 2, 6, w // 2 + 5, 9), fill=(18, 16, 14, 255))
    return outline(img)


def cavalry(sheet: Image.Image, side: str, size: int) -> Image.Image:
    steed = horse(cloth=(52, 92, 168, 255) if side == "p" else (168, 52, 52, 255))
    if side == "e":
        steed = steed.transpose(Image.FLIP_TOP_BOTTOM)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    rider = scaled(trim(frame(sheet, *FRAME_PICK[side]["cav"])), size)
    shadow(canvas, CANVAS[0] // 2, CANVAS[1] // 2 + 24, 26, 8)
    canvas.alpha_composite(steed, (CANVAS[0] // 2 - steed.width // 2, CANVAS[1] // 2 - steed.height // 2 + 4))
    canvas.alpha_composite(rider, (CANVAS[0] // 2 - rider.width // 2, CANVAS[1] // 2 - rider.height // 2 - 6))
    return canvas


def ground_tile(size: int = 64, seed: int = 11) -> Image.Image:
    """3×3 画布撒草簇，按周期复制后取中间格 → 四边可拼的无缝砖"""
    rnd = random.Random(seed)
    base = (62, 82, 52)
    big = Image.new("RGBA", (size * 3, size * 3), base + (255,))
    d = ImageDraw.Draw(big)
    for _ in range(240):
        x, y = rnd.randrange(size * 3), rnd.randrange(size * 3)
        shade = rnd.choice([(74, 96, 60), (54, 72, 46), (86, 108, 66)])
        for dx in (-size * 3, 0, size * 3):
            for dy in (-size * 3, 0, size * 3):
                d.point((x + dx, y + dy), fill=shade + (255,))
        d.rectangle((x, y, x + rnd.choice([0, 1]), y + 2), fill=shade + (255,))
    return big.crop((size, size, size * 2, size * 2))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(Path(".cache") / "ts"), help="图集目录，缺失会自动下载")
    args = ap.parse_args()
    src = Path(args.src)
    ensure_sources(src)

    sheets = {name: Image.open(src / name).convert("RGBA") for name in SOURCES}
    OUT_UNITS.mkdir(parents=True, exist_ok=True)
    OUT_TERRAIN.mkdir(parents=True, exist_ok=True)

    plan = {"inf": ("Warrior", 3, 40), "rng": ("Archer", 2, 40), "cav": ("Warrior", 1, 34)}
    for kind, (family, count, size) in plan.items():
        for side in ("p", "e"):
            sheet = sheets[f"{family}_{'Blue' if side == 'p' else 'Red'}.png"]
            img = cavalry(sheet, side, size) if kind == "cav" else squad(sheet, kind, side, size, count)
            img.save(OUT_UNITS / f"{kind}_{side}.png", optimize=True)
    ground_tile().save(OUT_TERRAIN / "ground.png", optimize=True)
    print("units + terrain written to public/assets")


if __name__ == "__main__":
    main()
