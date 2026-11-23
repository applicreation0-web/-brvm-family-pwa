"""Create privacy-safe, reproducible Android/PWA icon PNGs from the authored vector."""
from pathlib import Path
from io import BytesIO
from cairosvg import svg2png
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT / 'icons' / 'icon.svg'

def build():
    data=SOURCE.read_bytes()
    if b'<script' in data or b'<image' in data or b'xlink:href' in data or b'foreignObject' in data or b'url(http' in data:
        raise SystemExit('Icon source contains external or executable references.')
    for size in (192,512):
        output=ROOT/'icons'/f'icon-{size}.png'
        rendered=svg2png(bytestring=data,output_width=size,output_height=size)
        # Strip all ancillary PNG chunks; the privacy auditor only permits IHDR/IDAT/IEND.
        with Image.open(BytesIO(rendered)) as img:
            img.convert('RGBA').save(output,format='PNG',optimize=True)
        if output.stat().st_size<500:
            raise SystemExit('Rendered icon looks empty.')
    print('Icons regenerated reproducibly: 192, 512 px.')

if __name__=='__main__':
    build()
