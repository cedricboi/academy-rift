# Skill icon strips for the fighter detail sheet: assets/Skill Icons/<id>.webp, five 128 px icons in a row
# (the four skill hexagons cut from the Skill Menu Art sheets, then the Ultimate from the Ultimate Scene art).
#   python3 tools/make-skill-icons.py   (hexagon positions found by template matching, checked by eye)
import os, json
from PIL import Image
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')
SHEET = {'raiden': 1, 'nao': 2, 'hina': 3, 'jun': 4, 'saya': 5, 'taiga': 6, 'renji': 7, 'kuro': 8, 'emi': 9, 'mina': 10}
ULT = {'emi': 1, 'hina': 2, 'jun': 3, 'kuro': 4, 'mina': 5, 'nao': 6, 'raiden': 7, 'renji': 8, 'saya': 9, 'taiga': 10}
# hexagon boxes per sheet: x, y, width, height (top-left, top-right, bottom-left, bottom-right card)
HEX = {"1": [[59, 224, 133, 154], [587, 225, 126, 146], [58, 565, 130, 150], [587, 567, 126, 146]], "2": [[56, 225, 129, 149], [576, 224, 132, 152], [55, 582, 129, 149], [578, 583, 129, 149]], "3": [[49, 222, 126, 146], [578, 224, 124, 143], [51, 549, 124, 143], [577, 549, 124, 143]], "4": [[42, 209, 116, 134], [576, 207, 114, 132], [43, 557, 114, 132], [576, 557, 114, 132]], "5": [[50, 224, 126, 146], [575, 223, 126, 146], [52, 545, 124, 143], [575, 547, 124, 143]], "6": [[43, 228, 137, 158], [575, 229, 133, 154], [55, 564, 113, 130], [576, 542, 128, 148]], "7": [[43, 208, 132, 152], [576, 208, 129, 149], [45, 545, 129, 149], [576, 546, 126, 146]], "8": [[51, 224, 129, 149], [580, 225, 126, 146], [49, 586, 129, 149], [580, 586, 126, 146]], "9": [[65, 201, 130, 150], [582, 203, 128, 148], [65, 568, 130, 150], [582, 569, 128, 148]], "10": [[56, 180, 134, 155], [595, 179, 134, 155], [60, 553, 132, 152], [600, 556, 129, 149]]}
os.makedirs(os.path.join(A, 'Skill Icons'), exist_ok=True)
for cid, n in SHEET.items():
    sheet = Image.open(os.path.join(A, 'Skill Menu Art', f'{n}.webp')).convert('RGB')
    strip = Image.new('RGB', (128 * 5, 128))
    for j, (x, y, w, h) in enumerate(HEX[str(n)]):
        pad = h * .1   # inside the gold frame
        strip.paste(sheet.crop((x + w / 2 - h / 2 + pad, y + pad, x + w / 2 + h / 2 - pad, y + h - pad)).resize((128, 128), Image.LANCZOS), (128 * j, 0))
    u = Image.open(os.path.join(A, 'Ultimate Scene', f'ChatGPT Image Jun 15, 2026, 06_22_41 AM ({ULT[cid]}).webp')).convert('RGB')
    s = min(u.size) * .5; top = max(0, u.height * .3 - s / 2)
    strip.paste(u.crop((u.width / 2 - s / 2, top, u.width / 2 + s / 2, top + s)).resize((128, 128), Image.LANCZOS), (512, 0))
    out = os.path.join(A, 'Skill Icons', f'{cid}.webp'); strip.save(out, 'WEBP', quality=80, method=6)
    print(cid, os.path.getsize(out) // 1024, 'KB')
