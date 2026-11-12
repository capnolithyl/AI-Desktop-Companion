from pathlib import Path
import sys,json,hashlib,io,base64
ROOT=Path(__file__).resolve().parent
IKI=ROOT.parents[2]
sys.path.insert(0,str(IKI/'.tools/psd-export'))
import numpy as np
from scipy.spatial import Delaunay
from scipy.ndimage import map_coordinates,distance_transform_edt,gaussian_filter,binary_fill_holes,median_filter,label,binary_dilation,binary_opening,binary_erosion
from PIL import Image,ImageDraw
SOURCE=Path('E:/Users/marcu/Downloads/Festive Christmas Sweater Catgirl Mikan.png')
RIG=ROOT.parents[1]/'iki-ready/mikan-auto-rig-v3.iki'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
original_hashes={str(p):sha(p) for p in [SOURCE,RIG,ROOT.parents[1]/'mikan-cleaned.psd',ROOT.parents[1]/'iki-ready/layers/body.png']}
m=json.loads(RIG.read_text());body=next(p for p in m['parts'] if p['id']=='body')
textures=[Image.open(io.BytesIO(base64.b64decode(t['source'].split(',')[1]))).convert('RGBA') for t in m['textures']]
base=Image.new('RGBA',(1280,1280));base.paste(textures[body['texture']['index']],(164,416));b=np.array(base)
base.save(ROOT/'body-original-v3.png')
source=Image.open(SOURCE).convert('RGBA');s=np.array(source)
# Explicit visible garment outline; source PNG's checkerboard is opaque.
outline=[(237,757),(300,776),(400,806),(500,833),(560,843),(650,830),(750,799),(838,766),(862,754),(870,808),(878,874),(890,940),(904,1004),(916,1070),(934,1130),(954,1195),(982,1254),(1014,1306),(1027,1338),(1013,1371),(1005,1402),(1000,1447),(889,1447),(870,1403),(850,1383),(826,1354),(797,1347),(700,1360),(550,1366),(400,1364),(300,1353),(244,1335),(225,1370),(210,1388),(198,1447),(89,1447),(82,1406),(82,1375),(60,1358),(53,1334),(65,1303),(94,1265),(123,1225),(146,1180),(167,1134),(183,1087),(194,1030),(204,973),(211,921),(221,868),(228,813)]
maskim=Image.new('L',source.size);ImageDraw.Draw(maskim).polygon(outline,fill=255)
smask=np.array(maskim)>0
# Remove obvious orange hair/background accidentally crossing the outline.
rgb=s[:,:,:3].astype(float);rr,gg,bb=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
hair=(rr>65)&((rr-bb)>.52*rr)&(gg>.30*rr)&((gg-bb)>20)
background=(rgb.max(2)-rgb.min(2)<12)&(rgb.min(2)>205)
border=distance_transform_edt(smask)<32
smask &= ~((hair|background)&border)
smask=binary_fill_holes(smask)
syy,sxx=np.indices(smask.shape)
smask &= ~((syy>1420)&(rr>1.1*gg))
source_hem=np.interp(sxx,[244,300,400,500,550,600,700,797,826],[1335,1350,1357,1357,1356,1356,1354,1344,1354])
smask &= ~((sxx>=244)&(sxx<=826)&(syy>source_hem))
smask=binary_opening(smask,structure=np.ones((3,3)))
components,n=label(smask);smask=components==(1+np.argmax(np.bincount(components.ravel())[1:]))
extracted=s.copy();extracted[:,:,3]=np.where(smask,255,0)
extracted[~smask]=0
Image.fromarray(extracted).save(ROOT/'sweater-extracted.png')
Image.fromarray((smask*255).astype('uint8')).save(ROOT/'source-sweater-mask.png')

# Source->target landmark pairs, measured on the visible garment, not the face.
pairs=[
((237,757),(369,669)),((300,776),(430,686)),((400,806),(520,712)),((500,833),(610,740)),((560,843),(663,748)),((650,830),(747,728)),((750,799),(836,704)),((838,766),(914,678)),((862,754),(923,672)),
((230,843),(361,741)),((310,874),(436,772)),((425,906),(539,801)),((550,917),(651,812)),((675,901),(762,796)),((790,868),(864,767)),((873,835),(931,742)),
((211,921),(357,811)),((204,1000),(340,882)),((185,1090),(318,961)),((149,1180),(288,1047)),((100,1260),(248,1117)),((55,1333),(212,1180)),((81,1375),(231,1222)),((89,1448),(230,1280)),((198,1448),(345,1280)),((225,1370),(365,1214)),
((350,950),(482,847)),((337,1030),(490,920)),((316,1110),(478,987)),((282,1200),(429,1075)),((245,1280),(402,1141)),((244,1335),(400,1190)),
((550,1030),(652,909)),((550,1140),(652,1007)),((550,1250),(652,1108)),((550,1300),(652,1148)),((550,1366),(652,1191)),
((750,950),(824,847)),((768,1030),(813,920)),((786,1110),(829,987)),((807,1200),(874,1075)),((820,1280),(895,1141)),((826,1354),(895,1190)),
((890,940),(939,828)),((904,1004),(952,887)),((920,1100),(974,972)),((952,1190),(994,1050)),((989,1270),(1031,1124)),((1027,1338),(1062,1184)),((1007,1380),(1049,1222)),((1000,1448),(1041,1280)),((889,1448),(944,1280)),((850,1383),(918,1216)),
((400,1364),(520,1203)),((700,1360),(783,1203)),
((210,1388),(354,1243)),((870,1403),(943,1244)),
((0,0),(0,0)),((1085,0),(1279,0)),((0,1448),(0,1280)),((1085,1448),(1279,1280))]
sp=np.array([p[0] for p in pairs],float);tp=np.array([p[1] for p in pairs],float)
for i in range(len(sp)):
    if tp[i,1]==1280 and 200<tp[i,0]<1100:sp[i,1]=1425
# Follow the actual pale knit/skin-lace transition, avoiding a leftover cream
# outline. Search only near the manually measured collar edge.
neck_guess=np.array([(369,669),(430,686),(520,712),(610,740),(650,747),(680,746),(747,728),(836,704),(914,678),(923,672)])
edge=np.interp(np.arange(1280),neck_guess[:,0],neck_guess[:,1])
for x in range(369,925):
    cy=round(edge[x]); ys=np.arange(max(0,cy-12),min(1280,cy+9));colors=b[ys,x,:3].astype(float)
    hit=(colors[:,0]>145)&(colors[:,1]>.79*colors[:,0])&(b[ys,x,3]>100)
    if hit.any():edge[x]=ys[np.where(hit)[0][0]]
edge[369:925]=median_filter(edge[369:925],size=5)
for i in range(9):tp[i,1]=edge[int(tp[i,0])]
yy,xx=np.indices((1280,1280));q=np.column_stack((xx.ravel(),yy.ravel()))
tri=Delaunay(tp);simplex=tri.find_simplex(q);safe=np.maximum(simplex,0)
t=tri.transform[safe];bary=np.einsum('nij,nj->ni',t[:,:2,:],q-t[:,2,:]);bary=np.column_stack((bary,1-bary.sum(1)))
coords=np.einsum('ni,nij->nj',bary,sp[tri.simplices[safe]])
sx=coords[:,0].reshape(1280,1280);sy=coords[:,1].reshape(1280,1280)
warped=np.stack([map_coordinates(s[:,:,c].astype(float),[sy,sx],order=1,mode='nearest') for c in range(3)],axis=-1)
valid=map_coordinates(smask.astype(float),[sy,sx],order=0,mode='constant')>.5

# Exact original body alpha is retained. Bound edits to the original sweater.
neck=np.array([(369,669),(430,686),(520,712),(610,740),(650,747),(680,746),(747,728),(836,704),(914,678),(923,672)])
topline=edge[xx]
hem=np.array([(395,1190),(450,1200),(520,1203),(600,1197),(652,1191),(710,1198),(783,1203),(860,1200),(901,1187)])
hemline=np.interp(xx,hem[:,0],hem[:,1])
sleeves=(xx<np.interp(yy,[1180,1210,1240,1280],[398,384,352,350]))|(xx>np.interp(yy,[1180,1210,1240,1280],[901,919,942,943]))
topwear=np.array(Image.open(ROOT.parents[1]/'iki-ready/source-layers/03-topwear Merged.png'))
garment=(yy>=topline)&(yy>=665)&(b[:,:,3]>0)&(topwear[:,:,3]>32)
component,n=label(b[:,:,3]>32);main=1+np.argmax(np.bincount(component.ravel())[1:])
garment &= binary_dilation(component==main,iterations=2)

# Fill narrow source occlusions only from nearest available garment color.
# This is recorded separately for review, not silently treated as source art.
usable=valid&garment
dist,nearest=distance_transform_edt(~usable,return_indices=True)
missing=garment&~valid
filled=warped.copy();filled[missing]=warped[nearest[0][missing],nearest[1][missing]]
blend=np.clip(yy-topline+.5,0,1)*garment
result=b.copy();result[:,:,:3]=np.rint(b[:,:,:3]*(1-blend[:,:,None])+filled*blend[:,:,None]).clip(0,255).astype('uint8')
Image.fromarray(result).save(ROOT/'body-christmas.png')
Image.fromarray((garment*255).astype('uint8')).save(ROOT/'target-sweater-mask.png')
aligned=np.dstack((filled.clip(0,255).astype('uint8'),np.where(garment,b[:,:,3],0).astype('uint8')))
Image.fromarray(aligned).save(ROOT/'sweater-aligned.png')
Image.fromarray((missing*255).astype('uint8')).save(ROOT/'reconstructed-regions.png')

# Neutral artwork preview from the rig's embedded textures at their actual
# canvas registration. No model is edited or written, even temporarily.
def compose(body_pixels):
    canvas=Image.new('RGBA',(1280,1280))
    for p in sorted(m['parts'],key=lambda x:x['order']):
        if p['id']=='mouth_open':continue # opacity is zero at neutral
        if p['id']=='body':layer=Image.fromarray(body_pixels)
        else:
            tex=textures[p['texture']['index']];uv=p['texture']['uv']
            x=round(uv['x']*tex.width-.5);y=round(uv['y']*tex.height-.5)
            w=round(uv['width']*tex.width)+1;h=round(uv['height']*tex.height)+1
            patch=tex.crop((x,y,x+w,y+h))
            assert patch.size==(round(p['width']),round(p['height']))
            x=round(640+p['transform']['x']-p['width']/2);y=round(640-p['transform']['y']-p['height']/2)
            layer=Image.new('RGBA',(1280,1280));layer.paste(patch,(x,y))
        canvas=Image.alpha_composite(canvas,layer)
    return canvas
orig=compose(b);new=compose(result);orig.save(ROOT/'preview-original.png');new.save(ROOT/'preview-christmas.png')
def checker():
    values=np.where((xx//20+yy//20)%2,225,245).astype('uint8')
    return Image.fromarray(np.dstack([values,values,values,np.full_like(values,255)]))
def flat(im):return Image.alpha_composite(checker(),im).convert('RGB')
sheet=Image.new('RGB',(2560,1330),'#333333');d=ImageDraw.Draw(sheet)
for i,(label,im) in enumerate([('Original v3 embedded artwork',orig),('Christmas sweater candidate',new)]):sheet.paste(flat(im),(1280*i,50));d.text((1280*i+20,15),label,fill='white')
sheet.save(ROOT/'comparison.png')
overlay=Image.blend(flat(base),flat(Image.fromarray(result)),.5);d=ImageDraw.Draw(overlay)
for p in tp[:-4]:x,y=p;d.ellipse((x-3,y-3,x+3,y+3),fill='cyan')
contour=garment & ~binary_erosion(garment)
ov=np.array(overlay);ov[contour]=[255,0,255];overlay=Image.fromarray(ov);d=ImageDraw.Draw(overlay)
d.line([(x,float(edge[x])) for x in range(369,925)],fill='lime',width=2)
d.rectangle((15,15,800,65),fill='#333333')
d.text((25,25),'50% original / candidate | magenta: edit boundary | green: neckline',fill='white')
d.text((25,43),'Cyan dots: alignment landmarks. Original alpha retained exactly.',fill='white')
overlay.save(ROOT/'overlay-comparison.png')
assert np.array_equal(result[:,:,3],b[:,:,3])
assert np.array_equal(result[~garment],b[~garment])
assert original_hashes=={p:sha(Path(p)) for p in original_hashes}
report={'source':str(SOURCE),'source_size':source.size,'source_has_real_transparency':False,'body_texture_index':body['texture']['index'],'body_texture_size':textures[1].size,'body_canvas_origin':[164,416],'body_mesh_vertices':len(body['mesh']['vertices'])//2,'body_mesh_triangles':len(body['mesh']['indices'])//3,'body_deformer':body['deformer'],'body_uv':body['texture']['uv'],'landmarks_source_target':list(zip(sp.tolist(),tp.tolist())),'alpha_exact':True,'pixels_outside_sweater_exact':True,'garment_pixels':int(garment.sum()),'reconstructed_pixels':int(missing.sum()),'maximum_reconstruction_distance':float(dist[missing].max()) if missing.any() else 0,'source_hashes':original_hashes,'rig_written':False}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2))
print({k:v for k,v in report.items() if k not in ['landmarks_source_target','source_hashes']})
