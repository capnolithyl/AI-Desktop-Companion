"""Targeted, reproducible v1 patch. Source art and original rig are read only."""
from pathlib import Path
import sys,json,copy,base64,io,hashlib
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT.parents[1]/'.tools/psd-export'))
import numpy as np
from PIL import Image
from scipy import ndimage
OUT=ROOT/'rig-v2'; ASSETS=OUT/'assets'
ASSETS.mkdir(exist_ok=True)
source=ROOT/'mikan-auto-rig-v1.iki'
original=json.loads(source.read_text()); model=copy.deepcopy(original)
model['name']='Mikan v02 - tail and mouth v2'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
tracked=[source,*sorted((ROOT/'layers').glob('*.png')),*sorted((ROOT/'source-layers').glob('*.png')),ROOT/'preserved/tail.png']
v01=ROOT.parents[1]/'mikan-v01/layers'
tracked += [v01/(n+'.png') for n in ['mouth_inner','mouth_teeth','mouth_tongue']]
before={str(p):sha(p) for p in tracked}
atlas=Image.open(io.BytesIO(base64.b64decode(original['textures'][0]['source'].split(',')[1]))).convert('RGBA')
def part(name): return next(p for p in model['parts'] if p['id']==name)
def crop_info(p):
    uv=p['texture']['uv'];x=round(uv['x']*atlas.width-.5);y=round(uv['y']*atlas.height-.5)
    w=round(uv['width']*atlas.width)+1;h=round(uv['height']*atlas.height)+1
    return x,y,w,h
def install_texture(p,im,old_rect):
    x,y,w,h=old_rect; data=io.BytesIO();im.save(data,format='PNG')
    index=len(model['textures']);model['textures'].append({'source':'data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()})
    p['texture']={'index':index,'uv':{'x':.5/w,'y':.5/h,'width':(w-1)/w,'height':(h-1)/h}}
    olduv=p['mesh']['uvs'];p['mesh']['uvs']=[(v*(atlas.width if i%2==0 else atlas.height)-(x if i%2==0 else y))/(w if i%2==0 else h) for i,v in enumerate(olduv)]
def full_canvas(im,box,name):
    out=Image.new('RGBA',(1280,1280));out.paste(im,box);out.save(ASSETS/name)

# Split existing ATLAS pixels, avoiding color/quantization drift from reimporting art.
body=part('body'); rect=crop_info(body);x,y,w,h=rect
pixels=np.array(atlas.crop((x,y,x+w,y+h)))
left=round(640+body['transform']['x']-body['width']/2)
top=round(640-body['transform']['y']-body['height']/2)
tail_src=np.array(Image.open(ROOT/'preserved/tail.png').convert('RGBA'))
yy,xx=np.indices((1280,1280))
tail_region=(tail_src[:,:,3]>0)&(xx<400)&(yy>=440)&(yy<920)
# Existing garment/neck art covers none of the tail region: no inpainting needed.
clothing=Image.new('RGBA',(1280,1280))
for f in ['02-bottomwear Merged.png','03-topwear Merged.png','04-neckwear Merged.png']:
    clothing=Image.alpha_composite(clothing,Image.open(ROOT/'source-layers'/f))
overlap=int(np.count_nonzero(tail_region&(np.array(clothing)[:,:,3]>0)))
assert overlap==0, 'Tail overlaps source clothing; do not erase concealed garment art'
mask=ndimage.binary_dilation(tail_region,iterations=2)[top:top+h,left:left+w]
clean=pixels.copy(); clean[mask]=0
tail_pixels=pixels.copy();tail_pixels[~mask]=0
assert np.array_equal(np.asarray(Image.alpha_composite(Image.fromarray(clean),Image.fromarray(tail_pixels))),pixels)
tail=copy.deepcopy(body);tail['id']='tail';tail['order']=1.25
install_texture(body,Image.fromarray(clean),rect)
install_texture(tail,Image.fromarray(tail_pixels),rect)
full_canvas(Image.fromarray(clean),(left,top),'body-clean.png')
full_canvas(Image.fromarray(tail_pixels),(left,top),'tail-separated.png')
# Same body parent and mesh preserve neutral sampling and root attachment.
# Sway is zero below y=835, smoothly increasing toward the free tip.
verts=np.array(tail['mesh']['vertices']).reshape(-1,2)
py=top+(0.5-verts[:,1])*h
weights=np.clip((835-py)/380,0,1)**1.8
offset=np.column_stack((28*weights/w,5*weights/h)).reshape(-1)
tail['warps']=[{'parameter':'ParamTailSway','keyforms':[{'value':-1,'offsets':(-offset).round(7).tolist()},{'value':0,'offsets':[0]*len(offset)},{'value':1,'offsets':offset.round(7).tolist()}]}]
model['parts'].append(tail)
# Existing tail ends in the hair rather than beneath the garment. A rotated
# copy of its lower fur supplies an underlap, drawn BEHIND both hair and body.
support_canvas=Image.new('RGBA',(1280,1280))
support_source=Image.fromarray(tail_pixels).crop((170-left,650-top,300-left,840-top))
support_source=support_source.transpose(Image.Transpose.ROTATE_90)
sy,sx=np.indices((support_source.height,support_source.width))
radius=np.sqrt(((sx-95)/95)**2+((sy-65)/65)**2)
support_array=np.array(support_source)
support_array[:,:,3]=np.rint(support_array[:,:,3]*np.clip((1-radius)/.10,0,1)).astype('uint8')
support_source=Image.fromarray(support_array)
support_canvas.alpha_composite(support_source,(225,785))
support_canvas.save(ASSETS/'tail-root-underlap.png')
support=copy.deepcopy(next(p for p in original['parts'] if p['id']=='body'))
support['id']='tail_root_underlap';support['order']=-.25
install_texture(support,support_canvas.crop((left,top,left+w,top+h)),rect)
model['parts'].append(support)
model['parameters'].append({'id':'ParamTailSway','name':'Tail Sway','min':-1,'max':1,'default':0})
model['physics'].append({'id':'tailSway','inputs':[{'parameter':'ParamBodyAngleX','weight':.8,'mode':'lag'},{'parameter':'ParamAngleX','weight':.25,'mode':'lag'},{'parameter':'ParamBodyAngleZ','weight':.35,'mode':'lag'},{'parameter':'ParamAmbientSway','weight':.55}], 'output':{'parameter':'ParamTailSway','scale':.8},'mass':1.3,'stiffness':22,'damping':5.5})

# Retain the original mouth at rest. Reuse v01 cavity/teeth/tongue for an open pose.
mouth=part('mouth'); mouth_rect=crop_info(mouth);mx,my,mw,mh=mouth_rect
closed=atlas.crop((mx,my,mx+mw,my+mh))
interior=Image.new('RGBA',(1100,1100))
for name in ['mouth_inner','mouth_teeth','mouth_tongue']:
    interior=Image.alpha_composite(interior,Image.open(v01/(name+'.png')))
interior=interior.crop((514,578,586,609)).resize((62,24),Image.Resampling.LANCZOS)
opened=closed.copy();opened.alpha_composite(interior,(9,19))
full_canvas(opened,(627,394),'mouth-open-derived.png')
opened_part=copy.deepcopy(mouth);opened_part['id']='mouth_open';opened_part['order']=4.25
install_texture(opened_part,opened,mouth_rect)
mouth['bindings']=[{'parameter':'ParamMouthOpenY','channel':'opacity','from':1,'to':0}]
opened_part['bindings']=[{'parameter':'ParamMouthOpenY','channel':'opacity','from':0,'to':1},{'parameter':'ParamMouthOpenY','channel':'scaleY','from':-.35,'to':0},{'parameter':'ParamMouthOpenY','channel':'translateY','from':2,'to':0}]
model['parts'].append(opened_part)
target=ROOT/'mikan-auto-rig-v2.iki';target.write_text(json.dumps(model,separators=(',',':')))
# Regression contract: all unrelated parts, deformers, original physics, controls,
# motions, expressions and atlas are byte-for-byte equal as JSON objects.
assert model['deformers']==original['deformers']
assert model['parameters'][:-1]==original['parameters']
assert model['physics'][:-1]==original['physics']
for key in ['expressions','motions','canvas']:assert model[key]==original[key]
assert model['textures'][0]==original['textures'][0]
for old in original['parts']:
    if old['id'] not in ('body','mouth'): assert part(old['id'])==old
assert before=={str(p):sha(p) for p in tracked}
report={'source_sha256':before[str(source)],'output_sha256':sha(target),'source_files_unchanged':True,'unchanged_original_parts':[p['id'] for p in original['parts'] if p['id'] not in ('body','mouth')],'all_original_deformers_unchanged':True,'original_physics_unchanged':True,'body_plus_tail_atlas_pixels_exact':True,'tail_clothing_overlap_pixels':overlap,'tail_root_pinned_below_canvas_y':835,'tail_max_local_displacement_px':[28,5],'mouth_asset_sources':[str(v01/(n+'.png')) for n in ['mouth_inner','mouth_teeth','mouth_tongue']],'input_sha256':before}
(OUT/'build-validation.json').write_text(json.dumps(report,indent=2))
print('Wrote',target,'parts',len(model['parts']),'textures',len(model['textures']))
