from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "source"
OUT = ROOT / "previews"
OUT.mkdir(exist_ok=True)
BG = (166, 169, 174, 255)

def trim_alpha(im, threshold=8):
    im = im.convert("RGBA")
    a = im.getchannel("A").point(lambda p: 255 if p > threshold else 0)
    box = a.getbbox()
    return im.crop(box) if box else im

def clean_eye(im):
    im = trim_alpha(im, 14)
    # Fade low-alpha ambient glow while retaining the opaque eyelid and lash ink.
    r,g,b,a = im.split()
    a = a.point(lambda p: 0 if p < 90 else (p-90)*255//165)
    im.putalpha(a)
    return trim_alpha(im, 8)

def fit_height(im, h):
    w = round(im.width * h / im.height)
    return im.resize((w,h), Image.Resampling.LANCZOS)

def pair(eye_name, iris_name, height):
    eye = clean_eye(Image.open(SRC / f"{eye_name}.png"))
    iris = trim_alpha(Image.open(SRC / f"{iris_name}.png"), 8)
    eye = fit_height(eye, height)
    # Equal displayed eye width follows naturally from same target height only if native
    # ratios match; normalize to shared panel eye width while preserving aspect.
    target_w = 600 if height == 430 else 120
    if eye.width > target_w:
        eye = eye.resize((target_w, round(eye.height * target_w / eye.width)), Image.Resampling.LANCZOS)
    # iris size is circular diameter, aspect retained.
    d = 180 if height == 430 else 50
    iris = iris.resize((round(iris.width*d/max(iris.size)), round(iris.height*d/max(iris.size))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (max(target_w,eye.width), max(height,eye.height)), (0,0,0,0))
    ex=(canvas.width-eye.width)//2; ey=(canvas.height-eye.height)//2
    # Geometric almond opening mask, deliberately inset from lash silhouette.
    mask=Image.new("L",canvas.size,0)
    md=ImageDraw.Draw(mask)
    cx=ex+eye.width*.52; cy=ey+eye.height*.59
    rx=eye.width*.235; ry=eye.height*.30
    md.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=255)
    ix=round(cx-iris.width/2); iy=round(cy-iris.height/2)
    imask=Image.new("L",canvas.size,0); imask.paste(iris.getchannel("A"),(ix,iy))
    from PIL import ImageChops
    imask=ImageChops.multiply(imask,mask)
    iris_layer=Image.new("RGBA",canvas.size,(0,0,0,0)); iris_layer.paste(iris,(ix,iy)); iris_layer.putalpha(imask)
    canvas.alpha_composite(iris_layer)
    eye_layer=Image.new("RGBA",canvas.size,(0,0,0,0));eye_layer.alpha_composite(eye,(ex,ey))
    # Clear only the geometric iris aperture from the sclera. Lash artwork stays in place above.
    aperture=Image.new("L",canvas.size,0)
    ad=ImageDraw.Draw(aperture)
    ad.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=255)
    from PIL import ImageChops
    eye_layer.putalpha(ImageChops.subtract(eye_layer.getchannel("A"),aperture))
    canvas.alpha_composite(eye_layer)
    return canvas

combos=[("Eye A + Iris A","eye_A","iris_A"),("Eye A + Iris B","eye_A","iris_B"),
        ("Eye B + Iris A","eye_B","iris_A"),("Eye B + Iris B","eye_B","iris_B")]

# Large, equally sized eyes, paired with consistent 180 px irises.
panels=[]
for label,e,i in combos:
    im=pair(e,i,430)
    panels.append((label,im))
sheet=Image.new("RGBA",(1600,1120),BG)
draw=ImageDraw.Draw(sheet)
font=ImageFont.truetype("arial.ttf",34)
for idx,(label,im) in enumerate(panels):
    col=idx%2;row=idx//2;x=col*800;y=row*560
    draw.text((x+25,y+20),label,font=font,fill=(20,20,22,255))
    sheet.alpha_composite(im,(x+(800-im.width)//2,y+95+(430-im.height)//2))
sheet.convert("RGB").save(OUT/"eye-combinations.png",quality=95)

# Intended character scale, 120 px eye width and 50 px iris diameter.
actual=Image.new("RGBA",(800,380),BG)
draw=ImageDraw.Draw(actual);small=ImageFont.truetype("arial.ttf",22)
for idx,(label,e,i) in enumerate(combos):
    col=idx%2;row=idx//2;x=col*400;y=row*190
    draw.text((x+12,y+10),label,font=small,fill=(20,20,22,255))
    im=pair(e,i,120)
    actual.alpha_composite(im,(x+(400-im.width)//2,y+48+(125-im.height)//2))
actual.convert("RGB").save(OUT/"eye-combinations-actual-size.png",quality=95)
print("wrote", OUT/"eye-combinations.png", OUT/"eye-combinations-actual-size.png")

