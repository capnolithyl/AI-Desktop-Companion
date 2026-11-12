from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageChops, ImageFilter
import hashlib, json, math

OUT = Path(__file__).resolve().parent
PLAN = OUT.parent
ROOT = PLAN.parent
SIZE = (1100,1500)
BG = (240,241,245,255)
def hashes():
    return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
            for p in ROOT.rglob('*') if p.is_file() and OUT not in p.parents}
before = hashes()
def read(p): return Image.open(p).convert('RGBA')
original = read(PLAN/'previews/complete-eye-clean.png')
corrected = original.copy()
# The original aperture is traced inside the lash ink; the outline never moves.
top=[(330,552),(400,505),(500,447),(600,397),(700,369),(800,354),(900,354),(1000,372),(1100,420),(1200,504),(1280,605)]
bottom=[(330,590),(400,656),(500,712),(600,754),(700,782),(800,795),(900,792),(1000,778),(1100,750),(1200,714),(1280,663)]
def interp(points,x):
    for (a,b),(c,d) in zip(points,points[1:]):
        if a<=x<=c: return b+(d-b)*(x-a)/(c-a)
    return points[0][1] if x<points[0][0] else points[-1][1]
aperture=Image.new('L',original.size)
ad=ImageDraw.Draw(aperture)
for x in range(330,1281): ad.line((x,interp(top,x)+2,x,interp(bottom,x)-2),fill=255)
aperture=aperture.filter(ImageFilter.GaussianBlur(1))
# Remove only the old iris footprint, using existing sclera pixels from this eye.
erase=Image.new('L',original.size)
ImageDraw.Draw(erase).ellipse((558,282,1092,804),fill=255)
erase=ImageChops.multiply(erase.filter(ImageFilter.GaussianBlur(2)),aperture)
sclera=Image.new('RGBA',original.size)
sd=ImageDraw.Draw(sclera)
for y in range(280,806):
    # Sample the original white on both sides, with gentle existing pink shading.
    left=original.getpixel((515,max(490,min(685,y))))
    right=original.getpixel((1160,max(505,min(700,y))))
    c=tuple(round((a+b)/2) for a,b in zip(left,right))
    sd.line((0,y,1535,y),fill=c)
corrected=Image.composite(sclera,corrected,erase)
# Existing separate Plan D iris; no synthesis. Local mesh reshapes the pupil,
# leaving outer amber texture and highlights in their original positions.
iris=read(PLAN/'iris_L.png')
alpha=iris.getchannel('A').point(lambda a: 255 if a>32 else 0)
iris=iris.crop(alpha.getbbox())
iw,ih=iris.size
cx,cy=iw*.502,ih*.494
mesh=[]
def sample(x,y):
    dx,dy=x-cx,y-cy
    r=math.sqrt((dx/(iw*.27))**2+(dy/(ih*.27))**2)
    influence=max(0,1-r)**2
    return (cx+dx*(1+1.5*influence),cy+dy/(1+.65*influence))
for y in range(0,ih,6):
    for x in range(0,iw,6):
        x2,y2=min(iw,x+6),min(ih,y+6)
        mesh.append(((x,y,x2,y2),sum((sample(a,b) for a,b in [(x,y),(x,y2),(x2,y2),(x2,y)]),())))
iris=iris.transform(iris.size,Image.Transform.MESH,mesh,Image.Resampling.BICUBIC)
# Subtle brown ring inside existing alpha, without enlarging the silhouette.
a=iris.getchannel('A')
edge=ImageChops.subtract(a,a.filter(ImageFilter.MinFilter(17))).point(lambda v:round(v*.65))
ring=Image.new('RGBA',iris.size,(79,35,16,0));ring.putalpha(edge)
iris=Image.alpha_composite(iris,ring)
scale=132/1282
shift=12.5/scale
# Original iris height 514 source px, width 526; narrow width by 20% only.
iris=iris.resize((421,514),Image.Resampling.LANCZOS)
placed=Image.new('RGBA',original.size)
placed.alpha_composite(iris,(round(828+shift-421/2),259))
placed.putalpha(ImageChops.multiply(placed.getchannel('A'),aperture))
corrected.alpha_composite(placed)
corrected.save(OUT/'corrected-complete-eye.png')

def eyes(source):
    bbox=(74,115,1356,871)
    art=source.crop(bbox)
    result=Image.new('RGBA',SIZE)
    for mirrored,center in [(False,(468,436)),(True,(632,436))]:
        eye=ImageOps.mirror(art) if mirrored else art
        px=art.width-(828-bbox[0]) if mirrored else 828-bbox[0]
        x=center[0]-px*scale; y=center[1]-(559-bbox[1])*scale
        placed=eye.transform((2200,3000),Image.Transform.AFFINE,(1/(scale*2),0,-x/scale,0,1/(scale*2),-y/scale),Image.Resampling.BICUBIC).resize(SIZE,Image.Resampling.LANCZOS)
        result.alpha_composite(placed)
    return result
eye_layer=eyes(corrected); eye_layer.save(OUT/'corrected-eyes-layer.png')
layers={name:read(ROOT/f'layers-refined/{name}.png') for name in ['hair_back','ear_right','ear_left','body','face','mouth','hair_front']}
def group(names):
    im=Image.new('RGBA',SIZE)
    for name in names: im.alpha_composite(eye_layer if name=='eyes' else layers[name])
    return im
back=group(['hair_back','ear_right','ear_left'])
front=group(['face','eyes','mouth','hair_front'])
# A single shared affine transform keeps the whole head aligned. Pivot at
# the centre of the face/neck overlap keeps the fixed body's neck connected.
pivot=(550,620)
def headscale(im,s):
    if s==1:return im.copy()
    return im.transform(SIZE,Image.Transform.AFFINE,(1/s,0,pivot[0]*(1-1/s),0,1/s,pivot[1]*(1-1/s)),Image.Resampling.BICUBIC)
variants=[]
for percent in [90,94,100]:
    im=Image.new('RGBA',SIZE,BG)
    im.alpha_composite(headscale(back,percent/100))
    im.alpha_composite(layers['body'])
    im.alpha_composite(headscale(front,percent/100))
    im.save(OUT/f'head-{percent}.png')
    variants.append(im)
ref=read(ROOT/'reference/ref-03-frontview.png')
font=lambda n:ImageFont.truetype('C:/Windows/Fonts/arial.ttf',n)
sheet=Image.new('RGBA',(2200,1510),BG);d=ImageDraw.Draw(sheet)
d.text((32,18),'MIKAN v02 / PLAN D / EYES + HEAD SCALE',font=font(34),fill='#29232c')
d.text((32,64),'Review only | Existing artwork | Body fixed at 100% | Shared neck pivot | No rigging',font=font(23),fill='#5d5661')
for i,(label,im) in enumerate([('Original front-view reference',ref)]+[(f'Corrected eyes / head {p}%',im) for p,im in zip([90,94,100],variants)]):
    x=i*550
    d.text((x+20,117),label,font=font(25),fill='#29232c')
    fit=ImageOps.contain(im,(530,760),Image.Resampling.LANCZOS)
    sheet.alpha_composite(fit,(x+(550-fit.width)//2,160))
    crop=im.crop((365,280,785,650)) if i==0 else im.crop((340,300,760,670))
    sheet.alpha_composite(crop.resize((530,467),Image.Resampling.LANCZOS),(x+10,960))
d.text((32,1450),'Eye width retained at 100% head size; iris shift 12.5 px inward; iris width 80%; height retained.',font=font(23),fill='#413b45')
sheet.save(OUT/'comparison-sheet.png')
detail=Image.new('RGBA',(1800,650),BG);dd=ImageDraw.Draw(detail)
for x,label,im,box in [(0,'Reference',ref,(410,340,730,430)),(600,'Current Plan D',read(PLAN/'previews/mikan-full-preview.png'),(390,390,710,480)),(1200,'Corrected Plan D / 100%',variants[2],(390,390,710,480))]:
    dd.text((x+20,20),label,font=font(28),fill='#29232c')
    detail.alpha_composite(im.crop(box).resize((580,163),Image.Resampling.LANCZOS),(x+10,80))
    facebox=(387,260,757,563) if x==0 else (365,320,735,623)
    detail.alpha_composite(im.crop(facebox).resize((460,377),Image.Resampling.LANCZOS),(x+70,265))
detail.save(OUT/'eye-comparison.png')
after=hashes();assert before==after,'Existing source changed'
(OUT/'verification.json').write_text(json.dumps({'existing_sources_unchanged':True,'source_sha256':before,'iris_inward_shift_canvas_px':12.5,'iris_width_ratio':.8,'head_scales':[.90,.94,1.0],'shared_head_pivot':pivot,'body_transform':'identity','head_layers':list(layers.keys())[:3]+['face','eyes','mouth','hair_front'],'method':'Pillow deterministic compositing and resampling; no generative tools; no rigging'},indent=2))
print('Saved comparison sheets and three variants. Existing source hashes unchanged.')
