import base64
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from screenshot_check import check_png

class ImageCheck(unittest.TestCase):
    def test_valid_png_header(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td)/'a.png'
            path.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/F8sAAAAASUVORK5CYII='))
            self.assertEqual(check_png(path)['visualReview'], 'pending')
    def test_invalid_png_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/'bad.png'
            path.write_bytes(b'not a screenshot')
            with self.assertRaisesRegex(RuntimeError, 'PNG'): check_png(path)
if __name__ == '__main__': unittest.main()
