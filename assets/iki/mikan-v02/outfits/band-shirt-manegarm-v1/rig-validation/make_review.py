from pathlib import Path
import sys,json,math,hashlib
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[3]/'.tools/psd-export'))
from PIL import Image,ImageDraw
import numpy as np
versions=['original','band-shirt-manegarm']
def im(folder,name):return Image.open(ROOT/folder/(name+'.png')).convert('RGBA')
def flat(img):
    bg=Image.new('RGBA',img.size,'#65656b');bg.alpha_composite(img);return bg.convert('RGB')
def sheet(items,name,w,h,cols):
    out=Image.new('RGB',(cols*w,math.ceil(len(items)/cols)*(h+26)),'#333339');draw=ImageDraw.Draw(out)
    for i,(label,img) in enumerate(items):
        x=i%cols*w;y=i//cols*(h+26);out.paste(flat(img).resize((w,h),Image.Resampling.LANCZOS),(x,y+26));draw.text((x+6,y+6),label,fill='white')
    out.save(ROOT/name)
poses=json.loads((ROOT/'poses.json').read_text())
sheet([(v,im('detail-'+v,'rest')) for v in versions],'neutral-comparison.png',640,640,2)
names=['rest','head-tilt-left','head-tilt-right','body-tilt-left','body-tilt-right','combined-tilt-left','combined-tilt-right','opposed-left','opposed-right','stress-left','stress-right','breath-full']
sheet([(n+' / '+v,im('detail-'+v,n)) for n in names for v in versions],'pose-comparison.png',320,320,4)
sheet([(n+' / '+v,im('detail-'+v,n).crop((420,750,880,1080))) for n in names[:9] for v in versions],'logo-motion-closeups.png',460,330,4)
sheet([(n+' / '+v,im('detail-'+v,n).crop((505,245,820,470))) for n in ['rest','blink','mouth-half','mouth-open','smile','surprised','gaze-left','gaze-right'] for v in versions],'facial-tests.png',420,300,4)
sheet([(n+' / '+v,im('desktop-'+v,n)) for n in ['rest','combined-tilt-left','combined-tilt-right'] for v in versions],'desktop-size-comparison.png',514,472,2)
frames=[flat(im('motion-vband-shirt-manegarm',f'frame-{k:03d}')) for k in range(144)]
frames[0].save(ROOT/'physics-preview.webp',save_all=True,append_images=frames[1:],duration=83,loop=0,quality=85)
sheet([(f'{k/12:.2f}s / '+v,im('motion-v'+v,f'frame-{k:03d}')) for k in [0,18,36,54,72,90,108,126,143] for v in versions],'physics-comparison.png',280,280,6)
checks={}
for pose in poses:
    n=pose['name'];a=np.array(im('detail-original',n));b=np.array(im('detail-band-shirt-manegarm',n))
    checks[n]={'alpha_identical':bool(np.array_equal(a[:,:,3],b[:,:,3])),'upper_face_identical':bool(np.array_equal(a[:560],b[:560]))}
assert all(all(c.values()) for c in checks.values())
motion=json.loads((ROOT/'motion-validation.json').read_text())
assert motion['versions']['original']['frames']==motion['versions']['band-shirt-manegarm']['frames']
assert all(not d['failedTextures'] for d in motion['versions'].values())
audit=json.loads((ROOT/'engine-audit.json').read_text())
assert audit['ok'] and not audit['failedTextures'] and not audit['folds']['offenders'] and not audit['physics']['offenders']
detail=json.loads((ROOT/'detail-validation.json').read_text())
assert all(not val['failedTextures'] for version in detail.values() for val in version.values())
protected=json.loads((ROOT.parent/'protected-input-hashes.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert all(sha(ROOT.parents[3]/p)==h for p,h in protected.items())
report={'structure':json.loads((ROOT.parent/'validation.json').read_text()),'engine':{'poses_per_version':len(poses),'fold_checked_poses':audit['folds']['poses'],'failed_textures':audit['failedTextures'],'fold_offenders':audit['folds']['offenders'],'physics_offenders':audit['physics']['offenders'],'matched_render_checks':checks},'motion':{'frames_per_version':144,'seconds':12,'capture_fps':12,'physics_hz':60,'parameter_traces_identical':True},'integrity':{'protected_files_checked':len(protected),'all_unchanged':True},'application_import':{'file_extension_and_size_valid':True,'engine_parse_and_load_passed':True,'live_selector_import_confirmed':False,'reason':'Local checkout lacks app dependencies/build. Installed app wardrobe inspected; further computer-use access was denied before importing. No outfit/settings changed.','installed_app_observed':'0.8.42 wardrobe; currently wearing gothic blouse; Add outfit (.iki) and preview/Cancel preview available.'}}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'poses':len(poses),'folds':audit['folds']['poses'],'protected_files':len(protected),'motion_traces_match':True}))
