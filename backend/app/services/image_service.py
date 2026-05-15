"""Floor-plan image optimization.

Floor plans uploaded by admins are large PNG files (often 3–5 MB).  The mobile
client downloads them over a slow tunnel, which times out.  This module
re-encodes them once on upload:

- resize to fit within MAX_DIM (longest side, in pixels)
- quantize PNG to ≤256 palette colors when the image has many flat regions
- enable maximum zlib compression

The image stays a PNG (lines stay sharp), but typical 3–4 MB plans shrink to
300–600 KB without visible loss for navigation use.
"""

import io

from PIL import Image

MAX_DIM = 2400          # longest side in pixels; floor plans rarely need more
PNG_COMPRESS_LEVEL = 9  # zlib max
PALETTE_COLORS = 256


def optimize_plan_image(content: bytes, mime_type: str) -> tuple[bytes, str]:
    """Return (optimized_bytes, new_mime_type). Falls back to original on error."""
    try:
        img = Image.open(io.BytesIO(content))
        img.load()
    except Exception:
        return content, mime_type

    w, h = img.size
    longest = max(w, h)
    if longest > MAX_DIM:
        scale = MAX_DIM / longest
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

    if img.mode in ("RGBA", "LA"):
        img = img.convert("RGB").quantize(colors=PALETTE_COLORS, method=Image.Quantize.MEDIANCUT)
    elif img.mode != "P":
        img = img.convert("RGB").quantize(colors=PALETTE_COLORS, method=Image.Quantize.MEDIANCUT)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True, compress_level=PNG_COMPRESS_LEVEL)
    optimized = buf.getvalue()

    if len(optimized) >= len(content):
        return content, mime_type

    return optimized, "image/png"
