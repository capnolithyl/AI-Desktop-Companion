from pathlib import Path
import sys,json,math
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[3]/'.tools/psd-export'))
from PIL import Image,ImageDraw
import numpy as np
def image(folder,name):return Image.open(ROOT/folder/(name+'.png')).convert('RGBA')
def flat(im):
 bg=Image.new('RGBA',im.size,'#65656b');bg.alpha_composite(im);return bg.convert('RGB')
def sheet(items,out,w,h,cols):
 result=Image.new('RGB',(cols*w,math.ceil(len(items)/cols)*(h+28)),'#333339');d=ImageDraw.Draw(result)
 for i,(label,im) in enumerate(items):
  x=i%cols*w;y=i//cols*(h+28);result.paste(flat(im).resize((w,h),Image.Resampling.LANCZOS),(x,y+28));d.text((x+8,y+8),label,fill='white')
 result.save(ROOT/out)
versions=['original','gothic-blouse']
sheet([(v,image('detail-'+v,'rest')) for v in versions],'neutral-comparison.png',640,640,2)
poses=['head-turn-left','head-turn-right','head-tilt-left','head-tilt-right','body-tilt-left','body-tilt-right','combined-tilt-left','combined-tilt-right','opposed-left','opposed-right','stress-left','stress-right','breath-full']
sheet([(n+' / '+v,image('detail-'+v,n)) for n in poses for v in versions],'pose-comparison.png',320,320,4)
items=[]
for n in ['rest','combined-tilt-left','combined-tilt-right','opposed-left','opposed-right','stress-left','stress-right']:
 for side,box in [('viewer-left',(350,820,540,1050)),('viewer-right',(740,820,930,1050))]:
  for v in versions:items.append((n+' '+side+' '+v,image('detail-'+v,n).crop(box)))
sheet(items,'underarm-closeups.png',285,345,4)
facial=['rest','blink','mouth-half','mouth-open','smile','surprised']
sheet([(n+' / '+v,image('detail-'+v,n).crop((505,245,820,470))) for n in facial for v in versions],'mouth-expression-tests.png',420,300,4)
sheet([(n+' / '+v,image('desktop-'+v,n)) for n in ['rest','combined-tilt-left','combined-tilt-right'] for v in versions],'desktop-size-comparison.png',514,472,2)
frames=[flat(image('motion-vgothic-blouse','frame-%03d'%k)) for k in range(144)]
frames[0].save(ROOT/'physics-preview.webp',save_all=True,append_images=frames[1:],duration=83,loop=0,quality=85)
selected=[0,18,36,54,72,90,108,126,143]
sheet([(str(round(k/12,2))+' s / '+v,image('motion-v'+v,'frame-%03d'%k)) for k in selected for v in versions],'physics-comparison.png',280,280,6)
a=json.loads((ROOT/'render-original.json').read_text());b=json.loads((ROOT/'render-gothic-blouse.json').read_text());motion=json.loads((ROOT/'motion-validation.json').read_text())
checks={}
for p in json.loads((ROOT/'poses.json').read_text()):
 n=p['name'];x=np.array(image('detail-original',n));y=np.array(image('detail-gothic-blouse',n));checks[n]={'alpha_identical':bool(np.array_equal(x[:,:,3],y[:,:,3])),'upper_face_region_identical':bool(np.array_equal(x[:560],y[:560]))}
report={'structure':json.loads((ROOT/'structural-validation.json').read_text()),'render':{'engine':'Installed @ikijs/mcp real WebGL Iki engine, headless Chrome','poses_per_version':len(checks),'fold_checked_poses':b['folds']['poses'],'failed_textures':b['failedTextures'],'fold_offenders':b['folds']['offenders'],'physics_offenders':b['physics']['offenders'],'fold_reports_identical':a['folds']==b['folds'],'physics_reports_identical':a['physics']==b['physics'],'matched_pixels':checks},'motion':{'frames_per_version':144,'seconds':12,'physics_hz':60,'capture_fps':12,'parameter_traces_identical':motion['versions']['original']['frames']==motion['versions']['gothic-blouse']['frames'],'failed_textures':{k:v['failedTextures'] for k,v in motion['versions'].items()}},'desktop':{'canvas_css_pixels':[514,472],'view':{'x':0,'y':110,'width':1150,'height':1050},'basis':'Default 520x740 window minus CSS portrait insets; actual user resize/DPI may differ.'}}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report['motion']))

# Detailed garment landmarks and new eye-tracking regression sheet.
items=[]
for n in ['rest','combined-tilt-left','combined-tilt-right','stress-left']:
 for label,box in [('neckline-lace-bow',(350,650,950,925)),('ribbons-underarms',(300,790,960,1050)),('cuffs-ruffles-shorts',(210,1080,1070,1280))]:
  for v in versions:items.append((n+' '+label+' '+v,image('detail-'+v,n).crop(box)))
sheet(items,'garment-closeups.png',600,250,2)
sheet([(n+' / '+v,image('detail-'+v,n).crop((505,245,820,470))) for n in ['gaze-left','gaze-right','gaze-up','gaze-down'] for v in versions],'eye-tracking-tests.png',420,300,4)
extracted=Image.open(ROOT.parent/'blouse-extracted.png').convert('RGBA')
flat(extracted).save(ROOT/'extraction-review.png')
