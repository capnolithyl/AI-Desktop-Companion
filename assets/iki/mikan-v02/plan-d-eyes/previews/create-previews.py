from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageChops
import hashlib, json
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
paths = [p for p in ROOT.rglob('*') if p.is_file() and OUT not in p.parents]
def hashes():
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before = hashes()
source = Image.open(ROOT/'plan-d-eyes/complete-eye.png').convert('RGBA')
# Remove residual low-opacity background, retaining the original RGB artwork.
# Main painted interior alpha is 253; only alpha is normalized, not RGB.
alpha = source.getchannel('A').point(lambda a: round(max(0,min(1,(a-16)/237))*255))
clean = source.copy()
clean.putalpha(alpha)
clean.putdata([(r,g,b,a) if a else (0,0,0,0) for r,g,b,a in clean.getdata()])
clean.save(OUT/'complete-eye-clean.png')
ImageOps.mirror(clean).save(OUT/'complete-eye-clean-mirrored.png')
bbox = alpha.getbbox()
# This crop removes empty padding only. Both axis scales remain identical.
art = clean.crop(bbox)
W,H = (1100,1500)
bg = (240,241,245,255)
canvas = Image.new('RGBA',(W,H),bg)
order = ['hair_back','ear_right','ear_left','body','face']
for name in order:
    canvas.alpha_composite(Image.open(ROOT/f'layers-refined/{name}.png').convert('RGBA'))
# Map the reference pupil spacing and eye-to-nose placement to the existing face.
# Mirrored anatomy: source outer lashes point toward viewer-left.
# Keep source inclination; it already follows the reference outer-to-inner slope.
scale = 132 / art.width
pupil_source = (828-bbox[0],559-bbox[1])
placements=[]
eye_union=Image.new('L',(W,H))
for mirrored, center in [(False,(468,436)),(True,(632,436))]:
    eye=ImageOps.mirror(art) if mirrored else art
    px=(art.width-pupil_source[0]) if mirrored else pupil_source[0]
    py=pupil_source[1]
    x=center[0]-px*scale
    y=center[1]-py*scale
    # Uniform affine scale and translation, with no independent width/height fit.
    placed=eye.transform((W*4,H*4),Image.Transform.AFFINE,(1/(scale*4),0,-x/scale,0,1/(scale*4),-y/scale),Image.Resampling.BICUBIC).resize((W,H),Image.Resampling.LANCZOS)
    canvas.alpha_composite(placed)
    eye_union=ImageChops.lighter(eye_union,placed.getchannel('A'))
    placements.append({'side':'viewer-right' if mirrored else 'viewer-left','mirrored':mirrored,'pupil_center':center,'uniform_scale':scale,'rotation_degrees':0,'translation':[x,y]})
for name in ['mouth','hair_front']:
    canvas.alpha_composite(Image.open(ROOT/f'layers-refined/{name}.png').convert('RGBA'))
canvas.save(OUT/'mikan-full-preview.png')
facebox=(330,290,770,650)
canvas.crop(facebox).resize((880,720),Image.Resampling.LANCZOS).save(OUT/'mikan-face-closeup.png')
# Equal display scale for full views, plus reference-aligned facial crops.
reference=Image.open(ROOT/'reference/ref-03-frontview.png').convert('RGBA')
try: font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',24)
except OSError: font=ImageFont.load_default()
sheet=Image.new('RGBA',(1100,1250),bg)
draw=ImageDraw.Draw(sheet)
for label,img,x in [('Front-view reference',reference,0),('Complete-eye experiment / up-30',canvas,550)]:
    draw.text((x+20,15),label,fill='#27232a',font=font)
    fitted=ImageOps.contain(img,(550,760),Image.Resampling.LANCZOS)
    sheet.alpha_composite(fitted,(x+(550-fitted.width)//2,55))
ref_face=reference.crop((387,260,757,563)).resize((550,450),Image.Resampling.LANCZOS)
new_face=canvas.crop(facebox).resize((550,450),Image.Resampling.LANCZOS)
sheet.alpha_composite(ref_face,(0,800))
sheet.alpha_composite(new_face,(550,800))
sheet.save(OUT/'reference-side-by-side.png')
# Diagnostic shows the cleaned complete eye against light and dark backgrounds.
qa=Image.new('RGBA',(1536,2048))
for y,color in [(0,(240,241,245,255)),(1024,(35,39,48,255))]:
    panel=Image.new('RGBA',source.size,color); panel.alpha_composite(clean); qa.alpha_composite(panel,(0,y))
qa.save(OUT/'eye-transparency-check.png')
assert before==hashes(), 'Existing asset changed'
report={'source_size':source.size,'clean_size':clean.size,'art_bounds':bbox,'placements':placements,'preserved_layers':order+['mouth','hair_front'],'excluded_layers':['eye_R','eye_L','iris_R','iris_L','lash_R','lash_L'],'existing_files_unchanged':True,'source_hashes':before,'method':'Non-generative alpha cleanup, uniform affine placement, horizontal mirror, existing up-30 layers unchanged.'}
(OUT/'preview-verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='source_hashes'},indent=2))

