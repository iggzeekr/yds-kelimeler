import pathlib
import struct
import zlib

def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

def png(size, paint):
    raw = b"".join(b"\x00" + paint(x, y) for y in range(size) for x in range(size))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

def icon(size):
    ink = bytes((27, 35, 48))
    cream = bytes((246, 241, 231))
    gold = bytes((217, 199, 164))
    # A serif-like K built from blocks, centered.
    def on(x, y):
        nx = (x + 0.5) / size
        ny = (y + 0.5) / size
        margin = 0.08
        if nx < margin or ny < margin or nx > 1 - margin or ny > 1 - margin:
            return False
        # stem
        if 0.30 <= nx <= 0.40 and 0.22 <= ny <= 0.78:
            return True
        # upper arm
        arm = (nx - 0.38) / 0.34
        if 0.38 <= nx <= 0.72 and abs(ny - (0.50 - arm * 0.28)) < 0.045 and ny <= 0.52:
            return True
        # lower arm
        if 0.38 <= nx <= 0.72 and abs(ny - (0.50 + arm * 0.28)) < 0.045 and ny >= 0.48:
            return True
        return False
    def paint(x, y):
        # rounded square background
        nx = (x + 0.5) / size
        ny = (y + 0.5) / size
        r = 0.18
        dx = max(abs(nx - 0.5) - (0.5 - r), 0)
        dy = max(abs(ny - 0.5) - (0.5 - r), 0)
        if dx * dx + dy * dy > r * r:
            return bytes((231, 225, 212))
        if on(x, y):
            return cream
        # thin gold line under the mark
        if 0.30 <= nx <= 0.70 and abs(ny - 0.84) < 0.012:
            return gold
        return ink
    return png(size, paint)

root = pathlib.Path(__file__).resolve().parents[1]
(root / "icon-192.png").write_bytes(icon(192))
(root / "icon-512.png").write_bytes(icon(512))
print("ok")
