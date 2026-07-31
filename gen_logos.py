from pathlib import Path
from PIL import Image

ICON_DIR = Path("build/icons")
SOURCE = ICON_DIR / "logo.png"

SIZES = [
    16,
    24,
    32,
    48,
    64,
    96,
    128,
    256,
    512,
]

img = Image.open(SOURCE).convert("RGBA")

for size in SIZES:
    out = img.resize((size, size), Image.Resampling.LANCZOS)
    out.save(ICON_DIR / f"{size}x{size}.png", optimize=True)

print("Generated Linux icons:")
for size in SIZES:
    print(f" - {size}x{size}.png")

img.save(
    "build/icon.ico",
    format="ICO",
    sizes=[
        (16, 16),
        (24, 24),
        (32, 32),
        (48, 48),
        (64, 64),
        (128, 128),
        (256, 256),
    ],
)

print("Generated build/icon.ico")