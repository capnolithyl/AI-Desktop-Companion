import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'.tools/psd-export'))
from psd_tools import PSDImage
from PIL import Image, ImageDraw
p=PSDImage.open(Path(__file__).parent.parent/'mikan-cleaned.psd')
o=Path(__file__).parent/'source-layers'
o.mkdir(exist_ok=True)
sheet=Image.new('RGB',(1280,1600),'#777777')
d=ImageDraw.Draw(sheet)
for i,l in enumerate(p):
    im=l.composite(viewport=(0,0,*p.size))
    im.save(o/(str(i).zfill(2)+'-'+l.name.rstrip(chr(0))+'.png'))
    im.thumbnail((320,350))
    x=(i%4)*320; y=(i//4)*400
    sheet.paste(im,(x,y+30),im)
    d.text((x+5,y+5),l.name.rstrip(chr(0)),fill='white')
sheet.save(o.parent/'source-layer-sheet.jpg')
