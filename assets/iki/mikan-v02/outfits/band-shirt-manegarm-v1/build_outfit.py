"""Transfer only the reference print; never rebuild the garment or rig."""
from pathlib import Path
import sys, json, base64, io, hashlib, copy
ROOT=Path(__file__).resolve().parent
WORK=ROOT.parents[2]
sys.path.insert(0,str(WORK/'.tools/psd-export'))
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=ROOT.parent/'black-shirt-v1'
protected_file=ROOT/'protected-input-hashes.json'
if not protected_file.exists():
    paths=[ROOT/'source.png',ROOT.parents[1]/'iki-ready/mikan-auto-rig-v3.iki']
    for folder in ['black-shirt-v1','gothic-blouse-v1','christmas-v1']:
        paths.extend(p for p in (ROOT.parent/folder).rglob('*') if p.is_file())
    protected_file.write_text(json.dumps({str(p.relative_to(WORK)):sha(p) for p in paths},indent=2))
protected=json.loads(protected_file.read_text())
assert all(sha(WORK/p)==h for p,h in protected.items())
old=json.loads((base/'mikan-black-shirt-v1.iki').read_text())
tex=Image.open(io.BytesIO(base64.b64decode(old['textures'][1]['source'].split(',')[1]))).convert('RGBA')
original=Image.new('RGBA',(1280,1280));original.paste(tex,(164,416))
assert np.array_equal(np.array(original),np.array(Image.open(base/'body-black-shirt.png')))
source=Image.open(ROOT/'source.png').convert('RGBA')
# Tight source rectangle contains print only; surrounding dark cloth is removed.
box=(360,850,750,1080)
crop=np.array(source.crop(box)).astype(float)
lum=crop[:,:,:3].mean(axis=2)
# Local ink coverage retains distressed holes and anti-aliased edges.
# Dark fabric stays at zero; extracted light pixels retain their source colour.
coverage=np.clip((lum-67)/32,0,1)
coverage*=crop[:,:,3]/255
ink=crop.copy();ink[:,:,3]=coverage*255
Image.fromarray(np.uint8(np.clip(ink,0,255))).save(ROOT/'logo-extracted.png')
# Uniform 0.86 scaling; gentle curvature only (max 3 px) preserves lettering.
scale=.86; left=485; top=812
y,x=np.mgrid[:1280,:1280]
sx=(x-left)/scale; sy=(y-top-3*((x-(left+195*scale))/(195*scale))**2)/scale
coords=np.array([sy,sx])
alpha=map_coordinates(coverage,coords,order=1,mode='constant',cval=0)
rgb=np.stack([map_coordinates(crop[:,:,i],coords,order=1,mode='constant',cval=0) for i in range(3)],axis=2)
arr=np.array(original); fabric=gaussian_filter(arr[:,:,:3].mean(axis=2).astype(float),sigma=3)
# Modest modulation follows the existing cloth shadows without importing source cloth.
shade=np.clip(.90+(fabric-40)*.004,.82,1.02)
rgb*=shade[:,:,None]
alpha*=arr[:,:,3]/255
aligned=np.dstack([rgb,alpha*255]).clip(0,255).astype(np.uint8)
Image.fromarray(aligned).save(ROOT/'logo-aligned.png')
result=arr.copy();result[:,:,:3]=np.round(arr[:,:,:3]*(1-alpha[:,:,None])+rgb*alpha[:,:,None]).clip(0,255).astype(np.uint8)
assert np.array_equal(result[:,:,3],arr[:,:,3])
assert np.array_equal(result[alpha==0],arr[alpha==0])
Image.fromarray(result).save(ROOT/'body-manegarm.png')
Image.fromarray(arr).save(ROOT/'body-original-black-shirt.png')
Image.fromarray(np.uint8(alpha*255)).save(ROOT/'print-mask.png')
model=copy.deepcopy(old);model['name']='Mikan Månegarm Band Shirt v1'
buf=io.BytesIO();Image.fromarray(result).crop((164,416,1063,1280)).save(buf,format='PNG')
model['textures'][1]['source']='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
target=ROOT/'mikan-band-shirt-manegarm-v1.iki';target.write_text(json.dumps(model,separators=(',',':')),encoding='utf-8')
check=copy.deepcopy(model);check['name']=old['name'];check['textures'][1]['source']=old['textures'][1]['source'];assert check==old
report={'baseline':'black-shirt-v1/mikan-black-shirt-v1.iki','baseline_sha256':sha(base/'mikan-black-shirt-v1.iki'),'variant_sha256':sha(target),'source_sha256':sha(ROOT/'source.png'),'body_sha256':sha(ROOT/'body-manegarm.png'),'changed_json_paths':['/name','/textures/1/source'],'all_other_rig_data_identical':True,'body_alpha_identical':True,'pixels_outside_print_identical':True,'source_logo_rectangle':box,'uniform_logo_scale':scale,'placement':[left,top],'maximum_curvature_pixels':3,'changed_body_pixels':int(np.any(result!=arr,axis=2).sum()),'protected_files_checked':len(protected),'protected_files_unchanged':True}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2))
review=Image.new('RGB',(1280,690),'#55555b');d=ImageDraw.Draw(review)
for i,(label,im) in enumerate([('Original black shirt',original),('Manegarm print',Image.fromarray(result))]):
    bg=Image.new('RGBA',im.size,'#65656b');bg.alpha_composite(im)
    review.paste(bg.crop((310,650,990,1130)).resize((640,452)),(i*640,30));d.text((i*640+12,10),label,fill='white')
review.crop((0,0,1280,482)).save(ROOT/'logo-comparison.png')
out=ROOT/'rig-validation';out.mkdir(exist_ok=True)
reference=ROOT.parent/'gothic-blouse-v1/rig-validation'
for name in ['render_detail.mjs','render_motion.mjs']:
    code=(reference/name).read_text().replace('gothic-blouse','band-shirt-manegarm').replace('../../../iki-ready/mikan-auto-rig-v3.iki','../../black-shirt-v1/mikan-black-shirt-v1.iki')
    (out/name).write_text(code)
(out/'poses.json').write_bytes((reference/'poses.json').read_bytes())
print(json.dumps(report,indent=2))
