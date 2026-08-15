#!/usr/bin/env python3
"""Generate macOS .icns and Windows .ico from resources/icon.png.

The source PNG is expected to be at least 256x256. This script will:
- Generate all standard macOS icon sizes (16..1024) packed into build/icon.icns.
- Generate a multi-resolution Windows icon at build/icon.ico.
- The source will be upscaled with LANCZOS when larger sizes are needed.
"""

import io
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "resources" / "icon.png"
BUILD_DIR = ROOT / "build"

# macOS ICNS type codes and sizes (width in px)
# ic10 (1024x1024) is required for Apple Silicon / Retina app icons.
ICNS_SIZES = [
    ("icp4", 16),
    ("icp5", 32),
    ("icp6", 64),
    ("ic07", 128),
    ("ic08", 256),
    ("ic09", 512),
    ("ic10", 1024),
    ("ic11", 32),   # 16x16@2x
    ("ic12", 64),   # 32x32@2x
    ("ic13", 256),  # 128x128@2x
    ("ic14", 512),  # 256x256@2x
]

# Windows ICO sizes to include
ICO_SIZES = [16, 32, 48, 64, 128, 256]


def _resample(src: Image.Image, size: int) -> Image.Image:
    """Resize source image to the requested square size."""
    filter_ = getattr(Image, "LANCZOS", Image.ANTIALIAS)
    return src.resize((size, size), filter_)


def build_icns() -> None:
    src = Image.open(SRC)
    if src.mode != "RGBA":
        src = src.convert("RGBA")

    chunks = []
    for type_code, size in ICNS_SIZES:
        img = _resample(src, size)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        type_bytes = type_code.encode("ascii")
        length = 8 + len(data)
        chunks.append(type_bytes + struct.pack(">I", length) + data)

    body = b"".join(chunks)
    total_length = 8 + len(body)
    icns = b"icns" + struct.pack(">I", total_length) + body

    out = BUILD_DIR / "icon.icns"
    out.write_bytes(icns)
    print(f"Wrote {out} ({len(icns)} bytes, {len(ICNS_SIZES)} icon sizes)")


def build_ico() -> None:
    """Build a multi-resolution Windows .ico manually.

    PIL 9.x does not reliably write multi-image ICO files via append_images,
    so we pack PNG-compressed frames into the ICO container ourselves.
    """
    src = Image.open(SRC)
    if src.mode != "RGBA":
        src = src.convert("RGBA")

    png_frames = []
    for size in ICO_SIZES:
        img = _resample(src, size)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        png_frames.append(buf.getvalue())

    count = len(png_frames)
    header = struct.pack("<HHH", 0, 1, count)

    offset = 6 + 16 * count
    directory = bytearray()
    data = bytearray()
    for size, frame in zip(ICO_SIZES, png_frames):
        width = size if size < 256 else 0
        height = width
        directory += struct.pack(
            "<BBBBHHII",
            width,
            height,
            0,       # colors
            0,       # reserved
            1,       # color planes
            32,      # bits per pixel
            len(frame),
            offset,
        )
        data += frame
        offset += len(frame)

    out = BUILD_DIR / "icon.ico"
    out.write_bytes(header + directory + data)
    print(f"Wrote {out} ({out.stat().st_size} bytes, {count} icon sizes)")


if __name__ == "__main__":
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    if not SRC.exists():
        raise FileNotFoundError(f"Source icon not found: {SRC}")
    build_icns()
    build_ico()
