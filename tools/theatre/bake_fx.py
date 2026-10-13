# Bakes the effect colours the battle cinematics would otherwise filter live, so no device has to filter while a move plays:
#   theatre/fx/<kind>.g.webp        the effect blurred, for its glow pass
#   theatre/fx/<kind>@<el>.webp     an element's recoloured copy (efx in the engine)
#   theatre/fx/<kind>@<el>.g.webp   that copy blurred, for its glow
# The colour maths matches CSS filter functions (each step clamped). Run after the effects or the TINT table change:
#   python3 tools/theatre/bake_fx.py
import json, os, re, math
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, '..', '..', 'public')
T = os.path.join(PUB, 'theatre')
KINDS = ['aura', 'blast', 'burst', 'pillar', 'slash', 'storm', 'wall', 'wave']   # the effects efx() recolours
GLOW_BLUR, TINT_GLOW_BLUR = 10, 9
GS = 3   # glow sheets are stored at 1/GS size

eng = open(os.path.join(T, 'engine.js')).read()
tint_src = re.search(r"const TINT = (\{.*?\});", eng, re.S).group(1)
TINT = dict(re.findall(r"(\w+): '([^']+)'", tint_src))

def matrix(fn, v):
    if fn == 'brightness': return np.array([[v, 0, 0, 0], [0, v, 0, 0], [0, 0, v, 0]])
    if fn == 'contrast': o = .5 - .5 * v; return np.array([[v, 0, 0, o], [0, v, 0, o], [0, 0, v, o]])
    if fn in ('saturate', 'grayscale'):
        s = 1 - min(1, v) if fn == 'grayscale' else v
        return np.array([[.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, 0], [.213 - .213 * s, .715 + .285 * s, .072 - .072 * s, 0], [.213 - .213 * s, .715 - .715 * s, .072 + .928 * s, 0]])
    if fn == 'sepia':
        a = 1 - min(1, v)
        return np.array([[.393 + .607 * a, .769 - .769 * a, .189 - .189 * a, 0], [.349 - .349 * a, .686 + .314 * a, .168 - .168 * a, 0], [.272 - .272 * a, .534 - .534 * a, .131 + .869 * a, 0]])
    if fn == 'hue-rotate':
        r = v * math.pi / 180; c, s = math.cos(r), math.sin(r)
        return np.array([[.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, 0],
                         [.213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283, 0],
                         [.213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072, 0]])
    return None

def tint(im, f):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    rgb = a[..., :3]
    for fn, v in re.findall(r"([a-z-]+)\(\s*(-?[\d.]+)", f):
        M = matrix(fn, float(v))
        if M is None: continue
        rgb = np.clip(rgb @ M[:, :3].T + M[:, 3], 0, 1)
    out = np.concatenate([rgb, a[..., 3:]], axis=-1)
    return Image.fromarray((out * 255 + .5).astype(np.uint8), 'RGBA')

def blur_sheet(im, n, fw, fh, radius):
    """Blur each frame on its own (as the engine draws one frame at a time), premultiplied so edges stay clean."""
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for i in range(n):
        fr = np.asarray(im.crop((i * fw, 0, (i + 1) * fw, fh)).convert('RGBA')).astype(np.float32) / 255
        pre = fr.copy(); pre[..., :3] *= pre[..., 3:]
        chans = [Image.fromarray((pre[..., k] * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(radius)) for k in range(4)]
        b = np.stack([np.asarray(c).astype(np.float32) / 255 for c in chans], -1)
        al = b[..., 3:]; rgb = np.where(al > 1e-3, b[..., :3] / np.maximum(al, 1e-3), 0)
        res = np.concatenate([np.clip(rgb, 0, 1), al], -1)
        out.paste(Image.fromarray((res * 255 + .5).astype(np.uint8), 'RGBA'), (i * fw, 0))
    # a blurred glow needs little detail: keep it at a third of the size and let the engine stretch it
    sw, sh = max(1, round(fw / GS)), max(1, round(fh / GS)); small = Image.new('RGBA', (sw * n, sh), (0, 0, 0, 0))
    for i in range(n): small.paste(out.crop((i * fw, 0, (i + 1) * fw, fh)).resize((sw, sh), Image.LANCZOS), (i * sw, 0))
    return small

man = json.load(open(os.path.join(T, 'manifest.json')))
man['FXG'], man['FXT'] = {}, {}
man['GS'] = GS
total = 0
def save(im, name, q=82):
    global total
    p = os.path.join(T, 'fx', name); im.save(p, 'WEBP', quality=q, method=2); total += os.path.getsize(p); return 'theatre/fx/' + name
for k, F in man['FX'].items():
    src = Image.open(os.path.join(PUB, F['src'])).convert('RGBA')
    man['FXG'][k] = save(blur_sheet(src, F['n'], F['w'], F['h'], GLOW_BLUR), f'{k}.g.webp', 70)
    if k in KINDS:
        for el, f in TINT.items():
            t = tint(src, f)
            man['FXT'][f'{k}|{el}'] = [save(t, f'{k}@{el}.webp', 88), save(blur_sheet(t, F['n'], F['w'], F['h'], TINT_GLOW_BLUR), f'{k}@{el}.g.webp', 70)]
json.dump(man, open(os.path.join(T, 'manifest.json'), 'w'), separators=(',', ':'))
print('baked', len(man['FXG']), 'glows and', len(man['FXT']), 'tints,', round(total / 1e6, 2), 'MB')
