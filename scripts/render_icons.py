from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "logo-source.png"
OUT_DIR = ROOT / "assets" / "icons"
SIZES = (16, 32, 48, 128, 512)


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing logo source: {SOURCE}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as image:
        source = image.convert("RGBA")
        for size in SIZES:
            icon = ImageOps.fit(source, (size, size), method=Image.Resampling.LANCZOS)
            icon.save(OUT_DIR / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
