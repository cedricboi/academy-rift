# Offline version of game.js blackKnockout(): flood-fill the near-black background from the borders to transparent,
# feather dim edge pixels, then shrink to 540 px and save as WebP in "Attack Costume/cut/".
import numpy as np, os, sys
from PIL import Image
from scipy import ndimage
D = '/home/claude/academy-rift/public/assets/Attack Costume'
os.makedirs(D + '/cut', exist_ok=True)
for f in sorted(os.listdir(D)):
    if not f.endswith('.webp'): continue
    a = np.array(Image.open(f'{D}/{f}').convert('RGBA')).astype(np.int32)
    H, W = a.shape[:2]
    bg = (a[..., 0] < 46) & (a[..., 1] < 46) & (a[..., 2] < 46)
    lab, n = ndimage.label(bg, structure=[[0,1,0],[1,1,1],[0,1,0]])
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    clear = np.isin(lab, list(edge))
    a[..., 3][clear] = 0
    al = a[..., 3]
    z = al == 0
    adj = np.zeros_like(z)
    adj[:, 1:] |= z[:, :-1]; adj[:, :-1] |= z[:, 1:]; adj[1:, :] |= z[:-1, :]; adj[:-1, :] |= z[1:, :]
    mx = a[..., :3].max(axis=2)
    m = (~z) & (mx <= 110) & adj
    al[m] = np.minimum(al[m], np.round(mx[m] / 110 * 255)).astype(np.int32)
    im = Image.fromarray(a.astype(np.uint8), 'RGBA').convert('RGBa').resize((540, 540), Image.LANCZOS).convert('RGBA')
    out = f'{D}/cut/{f}'
    im.save(out, 'WEBP', quality=82, method=6, alpha_quality=90)
    print(f, os.path.getsize(f'{D}/{f}') // 1024, '->', os.path.getsize(out) // 1024, 'KB')
