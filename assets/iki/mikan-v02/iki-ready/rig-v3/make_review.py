from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parents[2]/'.tools/psd-export'))
from PIL import Image,ImageDraw
import numpy as np
def panel(path):
    im=Image.open(path).convert('RGBA')
    bg=Image.new('RGBA',im.size,'#8d8d8d')
    return Image.alpha_composite(bg,im).convert('RGB')
def compare(names,filename):
    sheet=Image.new('RGB',(1120,len(names)*590),'#8d8d8d');draw=ImageDraw.Draw(sheet)
    for row,name in enumerate(names):
        for col,version in enumerate((2,3)):
            sheet.paste(panel(ROOT/f'renders-v{version}'/(name+'.png')),(col*560,row*590+30))
            draw.text((col*560+10,row*590+10),f'v{version}  {name}',fill='white')
    sheet.save(ROOT/filename)
compare(['rest','blink','mouth-open'],'neutral-blink-mouth.jpg')
compare(['head-tilt-left','head-tilt-right','body-tilt-left','body-tilt-right'],'head-body-tilts.jpg')
compare(['combined-tilt-left','combined-tilt-right','opposed-left','opposed-right'],'combined-tilts.jpg')
compare(['stress-left','stress-right'],'stress-tilts.jpg')
compare(['rest','combined-tilt-left','stress-left'],'before-after.jpg')

motion=json.loads((ROOT/'motion-validation.json').read_text())
frames=[]
for i in range(144):
    canvas=Image.new('RGB',(1120,590),'#8d8d8d');draw=ImageDraw.Draw(canvas)
    for col,version in enumerate((2,3)):
        canvas.paste(panel(ROOT/f'motion-v{version}'/f'frame-{i:03}.png'),(col*560,30))
        value=motion['versions'][str(version)]['frames'][i]['values']['ParamTailSway']
        draw.text((col*560+10,10),f'v{version}  t={i/12:.2f}s  tail={value:+.3f}  '+('idle' if i<72 else 'combined tilt'),fill='white')
    frames.append(canvas)
frames[0].save(ROOT/'motion-comparison.webp',save_all=True,append_images=frames[1:],duration=83,loop=0,quality=88,method=4)
with Image.open(ROOT/'motion-comparison.webp') as animation:assert animation.n_frames==144
selected=[0,18,36,54,72,90,108,126,143]
sheet=Image.new('RGB',(1120,len(selected)*310),'#8d8d8d')
for row,i in enumerate(selected):sheet.paste(frames[i].resize((560,295)),((row%2)*560,(row//2)*310))
sheet.crop((0,0,1120,1550)).save(ROOT/'motion-comparison-sheet.jpg')

checks={}
for name in [p.stem for p in (ROOT/'renders-v3').glob('*.png')]:
    a=np.array(Image.open(ROOT/'renders-v2'/(name+'.png')).convert('RGBA'))
    b=np.array(Image.open(ROOT/'renders-v3'/(name+'.png')).convert('RGBA'))
    different=np.any(a!=b,axis=2);ys,xs=np.where(different)
    checks[name]={'changed_pixels':len(xs),'bbox':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)] if len(xs) else None}
for name in ['rest','blink','mouth-open']:
    a=np.array(Image.open(ROOT/'renders-v2'/(name+'.png')));b=np.array(Image.open(ROOT/'renders-v3'/(name+'.png')))
    assert np.array_equal(a[0:210,180:400],b[0:210,180:400]),name+' face changed'
summary={'pose_differences':checks,'neutral_blink_and_mouth_face_crop_exact':True,'motion_frames_each_version':144,'idle_tail_parameter_range':{},'tilt_tail_parameter_range':{}}
for version in ('2','3'):
    vals=[f['values']['ParamTailSway'] for f in motion['versions'][version]['frames']]
    assert all(np.isfinite(vals))
    summary['idle_tail_parameter_range'][version]=[min(vals[:72]),max(vals[:72])]
    summary['tilt_tail_parameter_range'][version]=[min(vals[72:]),max(vals[72:])]
build=json.loads((ROOT/'build-validation.json').read_text())
for rel,expected in build['input_sha256'].items():
    assert hashlib.sha256((ROOT.parent/rel).read_bytes()).hexdigest()==expected,rel+' changed'
summary['source_hashes_unchanged']=True
(ROOT/'comparison-validation.json').write_text(json.dumps(summary,indent=2))
# Keep selected real physics frames and the checked animation, discard only
# intermediate frames created by render_motion.mjs (no recursive deletion).
for version in (2,3):
    for i in range(144):
        if i not in selected:(ROOT/f'motion-v{version}'/f'frame-{i:03}.png').unlink()
print('Comparison sheets and 144-frame physics animation written; sources unchanged.')
