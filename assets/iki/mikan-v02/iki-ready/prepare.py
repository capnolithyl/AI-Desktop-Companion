import sys, json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[1]/'.tools/psd-export'))
import numpy as np
from PIL import Image, ImageDraw, ImageChops
from psd_tools import PSDImage
src=ROOT.parent/'mikan-cleaned.psd'
before=hashlib.sha256(src.read_bytes()).hexdigest()
p=PSDImage.open(src)
size=p.size
layers={l.name.rstrip('\0'):Image.open(next((ROOT/'source-layers').glob(f'{i:02}-*.png'))).convert('RGBA') for i,l in enumerate(p)}
def merge(ims):
    out=Image.new('RGBA',size)
    for im in ims: out=Image.alpha_composite(out,im)
    return out
def stats(a,b):
    # Transparent RGB has no visual meaning. Compare on black and white.
    diffs=[]
    for c in ('black','white'):
        bg=Image.new('RGBA',size,c)
        diffs.append(np.abs(np.asarray(Image.alpha_composite(bg,a)).astype(int)-np.asarray(Image.alpha_composite(bg,b)).astype(int)))
    d=np.maximum(*diffs)
    return {'changed_pixels':int(np.any(d>0,axis=2).sum()),'pixels_over_2_levels':int(np.any(d>2,axis=2).sum()),'max_channel_delta':int(d.max()),'mean_channel_delta':float(d.mean())}
original=p.topil().convert('RGBA')
flat=merge(layers.values())
flat.save(ROOT/'source-recomposed.png')
roles={}
roles['hair_back']=merge([layers['cat_ears.png'],layers['back hair Merged']])
roles['body']=merge([layers[n] for n in ['bottomwear Merged','topwear Merged','neckwear Merged']])
for n in ['face','nose','mouth']: roles[n]=layers[n+' Merged']
splits={}
for source,role in [('eyebrow Merged','brow'),('eyewhite Merged','eye'),('eyelash Merged','lash'),('irides Merged','iris')]:
    a=np.array(layers[source]); occupied=np.any(a[:,:,3]>0,axis=0)
    # Select an entirely empty column in the gap between the two features.
    candidates=[x for x in range(630,691) if not occupied[x]]
    if not candidates: raise RuntimeError('No clean bilateral gap: '+source)
    cut=min(candidates,key=lambda x:abs(x-660))
    r=a.copy();r[:,cut:]=0
    l=a.copy();l[:,:cut]=0
    roles[role+'_R']=Image.fromarray(r)
    roles[role+'_L']=Image.fromarray(l)
    joined=np.array(merge([roles[role+'_R'],roles[role+'_L']]))
    assert np.array_equal(joined[:,:,3],a[:,:,3]) and np.array_equal(joined[a[:,:,3]>0],a[a[:,:,3]>0])
    splits[source]={'empty_split_column':cut,'R':'viewer left','L':'viewer right'}
roles['hair_front']=merge([layers['front hair Merged'],layers['headwear Merged']])
tail=layers['tail.png']
outdir=ROOT/'layers';outdir.mkdir(exist_ok=True)
preserved=ROOT/'preserved';preserved.mkdir(exist_ok=True)
tail.save(preserved/'tail.png')
candidate=dict(roles)
candidate['body']=merge([roles['body'],tail])
candidate_flat=merge(candidate.values())
print('tail in body vs exact',stats(flat,candidate_flat))
print('PSD merged vs exported source',stats(original,flat))
candidate_flat.save(ROOT/'candidate-tail-in-body.png')
roles=candidate
for name,im in roles.items(): im.save(outdir/(name+'.png'))
recomposed=merge(roles.values())
recomposed.save(ROOT/'recomposed-preview.png')
merge(roles.values()).save(ROOT/'roles-only-preview.png')
def checker(s):
    y,x=np.indices((s[1],s[0]));a=np.where(((x//20+y//20)%2)[...,None],225,245).astype('uint8');a=np.repeat(a,3,axis=2)
    return Image.fromarray(a).convert('RGBA')
def panel(im): return Image.alpha_composite(checker(size),im).convert('RGB')
sheet=Image.new('RGB',(2560,1340),'#292929');d=ImageDraw.Draw(sheet)
d.text((20,20),'Original PSD embedded composite',fill='white')
d.text((1300,20),'Recomposed Iki roles (tail included in body)',fill='white')
sheet.paste(panel(original),(0,60));sheet.paste(panel(recomposed),(1280,60));sheet.save(ROOT/'comparison.png')
face=Image.new('RGB',(1600,700),'#292929');d=ImageDraw.Draw(face)
for i,(name,im) in enumerate([('Original',original),('Recomposed',recomposed)]):
    crop=panel(im).crop((480,240,820,500)).resize((800,612))
    face.paste(crop,(i*800,60));d.text((i*800+20,20),name,fill='white')
face.save(ROOT/'face-comparison.png')
delta=ImageChops.difference(panel(original),panel(recomposed))
delta.point(lambda x:min(255,x*16)).save(ROOT/'difference-x16.png')
report={'source':str(src.resolve()),'source_sha256_before':before,'source_sha256_after':hashlib.sha256(src.read_bytes()).hexdigest(),'canvas':size,'source_stack_bottom_to_top':list(layers),'role_stack_bottom_to_top':list(roles),'tail':'Included over clothing in body; independent preserved/tail.png retained. Do not add the independent copy again. No native tail role assigned.','splits':splits,'original_vs_source_exports':stats(original,flat),'source_exports_vs_recomposed':stats(flat,recomposed),'original_vs_recomposed':stats(original,recomposed),'tail_in_body_candidate_vs_source':stats(flat,candidate_flat),'layers':[{'role':n,'path':'layers/'+n+'.png','bbox':im.getbbox()} for n,im in roles.items()]}
assert report['source_sha256_before']==report['source_sha256_after']
(ROOT/'manifest.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
