# Small WebP thumbnails for the fighter pickers (the full art is only shown in the fighter detail view).
#   python3 tools/make-thumbs.py
import os
from PIL import Image
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')
for folder, width in (('Character Profile Art', 280), ('Character Card', 280), ('Ultimate Scene', 240)):
    src = os.path.join(A, folder); out = os.path.join(src, 'thumb'); os.makedirs(out, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith('.webp') or (f.startswith('ChatGPT') and folder != 'Ultimate Scene'): continue
        im = Image.open(os.path.join(src, f)).convert('RGB')
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(os.path.join(out, f), 'WEBP', quality=78, method=6)
        print(folder, f, os.path.getsize(os.path.join(out, f)) // 1024, 'KB')
