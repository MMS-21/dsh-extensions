"""Fast structural screenshot check (not a semantic visual review)."""
from pathlib import Path
import struct


def check_png(path: Path, min_width: int = 1, min_height: int = 1) -> dict:
    with path.open('rb') as f:
        head = f.read(24)
    if len(head) != 24 or head[:8] != b'\x89PNG\r\n\x1a\n' or head[12:16] != b'IHDR':
        raise RuntimeError('Screenshot is not a well-formed PNG header')
    width, height = struct.unpack('>II', head[16:24])
    if width < min_width or height < min_height:
        raise RuntimeError(f'Unexpected screenshot size {width}x{height}')
    return {'format':'PNG','width':width,'height':height,'structuralCheck':'passed','visualReview':'pending'}
