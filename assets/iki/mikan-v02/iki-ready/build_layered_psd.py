"""Package existing role PNGs without editing the inputs or generating artwork."""
import sys, json, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / '.tools/psd-export'))
import numpy as np
from PIL import Image, ImageDraw
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer

manifest = json.loads((ROOT/'manifest.json').read_text())
order = manifest['role_stack_bottom_to_top']
inputs = [ROOT/'layers'/f'{role}.png' for role in order]
tracked = inputs + [ROOT/'manifest.json', ROOT.parent/'mikan-cleaned.psd']
def hashes():
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in tracked}
before = hashes()
assert len(order) == 14 and len(set(order)) == 14
psd = PSDImage.new('RGBA', (1280,1280), color=(0,0,0,0), depth=8)
psd.background_color = None
expected = Image.new('RGBA', psd.size)
for role, path in zip(order, inputs):
    im = Image.open(path).convert('RGBA')
    assert im.size == psd.size
    layer = PixelLayer.frompil(im, psd, name=role, top=0, left=0)
    layer.visible = True
    layer.opacity = 255
    assert not layer.has_mask()
    expected = Image.alpha_composite(expected, im)
target = ROOT/'mikan-iki-ready.psd'
if target.exists():
    assert (ROOT/'psd-validation.json').exists(), 'Refusing to overwrite an untracked PSD'
# PSD uses a negative layer count to identify merged transparency.
psd._record.layer_and_mask_information.layer_info.layer_count = -len(order)
psd._merged_alpha = True
psd.save(target)
loaded = PSDImage.open(target)
assert loaded.size == (1280,1280)
assert [l.name for l in loaded] == order
actual = Image.new('RGBA',loaded.size)
checks = []
for layer, path in zip(loaded, inputs):
    pixels = layer.topil().convert('RGBA')
    equal = np.array_equal(np.array(pixels), np.array(Image.open(path).convert('RGBA')))
    assert equal and layer.visible and layer.opacity == 255 and not layer.has_mask()
    assert layer.offset == (0,0) and layer.size == (1280,1280)
    checks.append({'role':layer.name,'rgba_exact':equal,'visible':layer.visible,'mask':layer.has_mask(),'blend_mode':str(layer.blend_mode),'offset':layer.offset})
    actual = Image.alpha_composite(actual,pixels)
assert np.array_equal(np.array(actual),np.array(expected))
actual.save(ROOT/'psd-validated-preview.png')
merged = loaded.topil().convert('RGBA')
merged.save(ROOT/'psd-embedded-preview.png')
def visible_delta(a,b):
    results=[]
    for color in ('black','white'):
        bg=Image.new('RGBA',a.size,color)
        results.append(np.abs(np.array(Image.alpha_composite(bg,a)).astype(int)-np.array(Image.alpha_composite(bg,b)).astype(int)))
    d=np.maximum(*results)
    return {'changed_pixels':int(np.any(d>0,axis=2).sum()),'max_channel_delta':int(d.max()),'mean_channel_delta':float(d.mean())}
canvas=Image.new('RGB',(2560,1340),'#333333')
draw=ImageDraw.Draw(canvas)
yy,xx=np.indices((1280,1280))
checker=np.repeat(np.where(((xx//20+yy//20)%2)[...,None],225,245).astype('uint8'),3,axis=2)
bg=Image.fromarray(checker).convert('RGBA')
for i,(label,im) in enumerate([('Prepared PNG composition',expected),('Reopened PSD layer composition',actual)]):
    draw.text((i*1280+20,20),label,fill='white')
    canvas.paste(Image.alpha_composite(bg,im).convert('RGB'),(i*1280,60))
canvas.save(ROOT/'psd-comparison.png')
assert before == hashes()
report={'output':str(target),'canvas':loaded.size,'depth':loaded.depth,'layer_count':len(loaded),'stack_bottom_to_top':order,'layers':checks,'source_hashes_unchanged':True,'input_sha256':before,'composition':visible_delta(expected,actual),'embedded_psd_preview':visible_delta(expected,merged),'auto_rigging_performed':False}
(ROOT/'psd-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ('input_sha256','layers')},indent=2))
