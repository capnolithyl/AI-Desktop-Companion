"""Replace only v2's compromised tail with a continuous root-overlapped sprite."""
from pathlib import Path
import sys,json,copy,hashlib,base64,io
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT.parents[1]/'.tools/psd-export'))
import numpy as np
from scipy import ndimage
from PIL import Image
OUT=ROOT/'rig-v3'; ASSETS=OUT/'assets'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
inputs=[ROOT/'mikan-auto-rig-v1.iki',ROOT/'mikan-auto-rig-v2.iki',*sorted(p for p in (ROOT/'rig-v2').rglob('*') if p.is_file()),ASSETS/'tail-generated.png']
before={str(p.relative_to(ROOT)):sha(p) for p in inputs}
old=json.loads((ROOT/'mikan-auto-rig-v2.iki').read_text());m=copy.deepcopy(old)
m['name']='Mikan v02 - continuous tail v3'

# Discard detached low-alpha generation specks, preserving the actual fur edge.
a=np.array(Image.open(ASSETS/'tail-generated.png').convert('RGBA'))
labels,n=ndimage.label(a[:,:,3]>8)
component=1+np.argmax(np.bincount(labels.ravel())[1:])
keep=ndimage.binary_dilation(labels==component,iterations=3)
a[~keep]=0
im=Image.fromarray(a);bbox=im.getbbox()
im=im.crop(bbox)
im.save(ASSETS/'tail-clean-source.png')
left,top,width,height=160,450,380,585
im=im.resize((width,height),Image.Resampling.LANCZOS)
full=Image.new('RGBA',(1280,1280));full.paste(im,(left,top))
full.save(ASSETS/'tail.png')

# A tight independent mesh, no v2 root patch and no tail in the body texture.
cols,rows=16,28
verts=[];uvs=[];indices=[];offsets=[]
for row in range(rows+1):
    for col in range(cols+1):
        u,v=col/cols,row/rows
        verts.extend([round(u-.5,7),round(.5-v,7)])
        uvs.extend([(.5+u*(width-1))/width,(.5+v*(height-1))/height])
        y=top+v*height
        weight=max(0,min(1,(900-y)/450))**1.8
        offsets.extend([round(18*weight/width,8),round(2*weight/height,8)])
for row in range(rows):
    for col in range(cols):
        k=row*(cols+1)+col;down=k+cols+1
        indices.extend([down,down+1,k,k,down+1,k+1])
buf=io.BytesIO();im.save(buf,format='PNG');texture=len(m['textures'])
m['textures'].append({'source':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()})
tail={'id':'tail','color':[1,1,1,1],'width':width,'height':height,'transform':{'x':left+width/2-640,'y':640-top-height/2},'order':-1,'texture':{'index':texture,'uv':{'x':.5/width,'y':.5/height,'width':(width-1)/width,'height':(height-1)/height}},'deformer':'tailRoot','mesh':{'vertices':verts,'uvs':uvs,'indices':indices},'warps':[{'parameter':'ParamTailSway','keyforms':[{'value':-1,'offsets':[-v for v in offsets]},{'value':0,'offsets':[0]*len(offsets)},{'value':1,'offsets':offsets}]}]}
m['parts']=[p for p in m['parts'] if p['id'] not in ('tail','tail_root_underlap')]+[tail]
# Rigid body attachment samples the body's warp at the hidden root, so the
# tail is not sheared across the body's wide breathing/turn grid.
m['deformers'].append({'id':'tailRoot','parent':'bodyWarp','pivot':{'x':-150,'y':-350}})
spring={'id':'tailSway','inputs':[{'parameter':'ParamBodyAngleX','weight':.65,'mode':'lag'},{'parameter':'ParamBodyAngleZ','weight':.45,'mode':'lag'},{'parameter':'ParamAngleZ','weight':.08,'mode':'lag'},{'parameter':'ParamAmbientSway','weight':.45}], 'output':{'parameter':'ParamTailSway','scale':.75},'mass':1.2,'stiffness':32,'damping':10}
m['physics']=[spring if p['id']=='tailSway' else p for p in m['physics']]
target=ROOT/'mikan-auto-rig-v3.iki';target.write_text(json.dumps(m,separators=(',',':')))

unchanged=[]
for p in old['parts']:
    if p['id'] not in ('tail','tail_root_underlap'):
        assert p==next(q for q in m['parts'] if q['id']==p['id'])
        unchanged.append(p['id'])
for key in ['parameters','canvas','expressions','motions']:assert m[key]==old[key]
assert m['deformers'][:-1]==old['deformers']
assert m['textures'][:-1]==old['textures']
assert [p for p in m['physics'] if p['id']!='tailSway']==[p for p in old['physics'] if p['id']!='tailSway']
assert before=={str(p.relative_to(ROOT)):sha(p) for p in inputs}
root=np.array(offsets).reshape(-1,2)[np.repeat(np.linspace(top,top+height,rows+1)>=900,cols+1)]
assert np.all(root==0)
report={'output':target.name,'sha256':sha(target),'v1_v2_and_supporting_files_unchanged':True,'unchanged_parts':unchanged,'original_deformers_and_non_tail_physics_unchanged':True,'mouth_and_mouth_open_unchanged':True,'placement':{'left':left,'top':top,'width':width,'height':height,'canvas':[1280,1280]},'generated_main_bbox':bbox,'root_canvas':[490,990],'sway_zero_at_or_below_canvas_y':900,'max_local_tip_sway_px':[18,2],'input_sha256':before}
(OUT/'build-validation.json').write_text(json.dumps(report,indent=2))
print('Wrote',target,'parts',len(m['parts']),'root pinned, v2 non-tail data unchanged')
