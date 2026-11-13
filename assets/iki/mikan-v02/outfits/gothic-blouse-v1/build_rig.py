from pathlib import Path
import json,copy,base64,io,hashlib,sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[2]/'.tools/psd-export'))
from PIL import Image
import numpy as np
OUT=ROOT/'rig-validation';OUT.mkdir(exist_ok=True)
source=ROOT.parents[1]/'iki-ready/mikan-auto-rig-v3.iki'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=sha(source);old=json.loads(source.read_text());m=copy.deepcopy(old)
body=next(p for p in old['parts'] if p['id']=='body')
assert body['texture']['index']==1
im=Image.open(io.BytesIO(base64.b64decode(old['textures'][1]['source'].split(',')[1]))).convert('RGBA')
full=Image.open(ROOT/'body-gothic-blouse.png');assert full.size==(1280,1280) and full.mode=='RGBA'
assert im.size==(899,864)
assert (round(640+body['transform']['x']-body['width']/2),round(640-body['transform']['y']-body['height']/2))==(164,416)
uv=body['texture']['uv'];assert abs(uv['x']-.5/899)<1e-12 and abs(uv['y']-.5/864)<1e-12
new=full.crop((164,416,1063,1280));assert np.array_equal(np.array(im)[:,:,3],np.array(new)[:,:,3])
clean=Image.open(ROOT.parents[1]/'iki-ready/rig-v2/assets/body-clean.png').crop((164,416,1063,1280))
assert np.array_equal(np.array(clean),np.array(im))
buf=io.BytesIO();new.save(buf,format='PNG')
m['textures'][1]['source']='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
m['name']='Mikan Gothic Blouse v1'
target=ROOT/'mikan-gothic-blouse-v1.iki';target.write_text(json.dumps(m,separators=(',',':')))
def diffs(a,b,path=''):
 if type(a)!=type(b):return [path]
 if isinstance(a,dict):return sum([diffs(a[k],b[k],path+'/'+k) for k in a],[])
 if isinstance(a,list):
  assert len(a)==len(b)
  return sum([diffs(x,y,path+'/'+str(i)) for i,(x,y) in enumerate(zip(a,b))],[])
 return [] if a==b else [path]
d=diffs(old,json.loads(target.read_text()));assert d==['/name','/textures/1/source'] or set(d)=={'/name','/textures/1/source'}
assert before==sha(source)
report={'source_sha256':before,'variant_sha256':sha(target),'body_png_sha256':sha(ROOT/'body-gothic-blouse.png'),'changed_json_paths':d,'all_other_data_identical':True,'source_unchanged':True,'body_alpha_identical':True,'texture_size':[899,864],'canvas_rectangle':[164,416,1063,1280],'parts':len(m['parts']),'textures':len(m['textures']),'self_contained':all(t['source'].startswith('data:image/png;base64,') for t in m['textures'])}
(OUT/'structural-validation.json').write_text(json.dumps(report,indent=2))
poses=json.loads((ROOT.parents[1]/'iki-ready/rig-v3/poses.json').read_text())
poses += [{'name':'head-turn-left','values':{'ParamAngleX':-30}},{'name':'head-turn-right','values':{'ParamAngleX':30}},{'name':'mouth-half','values':{'ParamMouthOpenY':.5}},{'name':'breath-full','values':{'ParamBreath':1}}]
for name in ['smile','surprised']:
 e=next(e for e in m['expressions'] if e['id']==name)
 poses.append({'name':name,'values':{v['parameter']:v['value'] for v in e['parameters']}})
poses += [{'name':'gaze-left','values':{'ParamEyeBallX':-1}},{'name':'gaze-right','values':{'ParamEyeBallX':1}},{'name':'gaze-up','values':{'ParamEyeBallY':1}},{'name':'gaze-down','values':{'ParamEyeBallY':-1}}]
(OUT/'poses.json').write_text(json.dumps(poses,indent=2))
print(json.dumps(report))
