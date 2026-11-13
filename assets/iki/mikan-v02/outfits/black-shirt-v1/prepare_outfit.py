from pathlib import Path
import sys,json,hashlib,io,base64
ROOT=Path(__file__).resolve().parent
IKI=ROOT.parents[2]
sys.path.insert(0,str(IKI/'.tools/psd-export'))
import numpy as np
from scipy.spatial import Delaunay
from scipy.ndimage import map_coordinates,distance_transform_edt,gaussian_filter,binary_fill_holes,median_filter,label,binary_dilation,binary_opening,binary_erosion
from PIL import Image,ImageDraw
SOURCE=ROOT/'source.png'
RIG=ROOT.parents[1]/'iki-ready/mikan-auto-rig-v3.iki'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
original_hashes={str(p):sha(p) for p in [SOURCE,RIG,ROOT.parents[1]/'mikan-cleaned.psd',ROOT.parents[1]/'iki-ready/layers/body.png']}
m=json.loads(RIG.read_text());body=next(p for p in m['parts'] if p['id']=='body')
textures=[Image.open(io.BytesIO(base64.b64decode(t['source'].split(',')[1]))).convert('RGBA') for t in m['textures']]
base=Image.new('RGBA',(1280,1280));base.paste(textures[body['texture']['index']],(164,416));b=np.array(base)
base.save(ROOT/'body-original-v3.png')
source=Image.open(SOURCE).convert('RGBA');s=np.array(source)
# Hand-measured visible shirt boundary; dark neutral color excludes white, hair and skin.
outline=[(410,389),(460,402),(510,414),(565,419),(620,414),(670,401),(713,389),(719,434),(724,500),(734,553),(748,607),(759,654),(775,680),(766,704),(779,737),(735,749),(723,710),(703,690),(692,670),(645,679),(560,681),(485,678),(420,671),(410,694),(398,713),(390,749),(341,741),(347,703),(346,680),(360,653),(371,600),(382,551),(393,502),(402,434)]
maskim=Image.new('L',source.size);ImageDraw.Draw(maskim).polygon(outline,fill=255)
rgb=s[:,:,:3].astype(float)
smask=(np.array(maskim)>0)&(rgb.max(2)<115)&((rgb.max(2)-rgb.min(2))<35)
smask=binary_fill_holes(smask)
smask=binary_opening(smask,structure=np.ones((3,3)))
# Erode one pixel to keep source edge anti-aliasing free of background/hair.
smask=binary_erosion(smask,iterations=1)
extracted=s.copy();extracted[:,:,3]=smask*255;extracted[~smask]=0
Image.fromarray(extracted).save(ROOT/'shirt-extracted.png')
Image.fromarray((smask*255).astype('uint8')).save(ROOT/'source-shirt-mask.png')
pairs=[
((410,392),(369,669)),((450,402),(430,686)),((500,414),(520,712)),((540,419),(610,740)),((565,419),(663,748)),((615,415),(747,728)),((665,404),(836,704)),((703,393),(914,678)),((713,392),(923,672)),
((405,431),(361,741)),((450,444),(436,772)),((505,451),(539,801)),((565,454),(651,812)),((620,449),(762,796)),((673,441),(864,767)),((716,430),(931,742)),
((398,478),(357,811)),((391,522),(340,882)),((380,570),(318,961)),((369,614),(288,1047)),((357,661),(248,1117)),((349,682),(212,1180)),((351,703),(231,1222)),((346,738),(230,1280)),((388,740),(345,1280)),((399,705),(365,1214)),
((455,478),(482,847)),((465,523),(490,920)),((465,567),(478,987)),((449,614),(429,1075)),((431,648),(402,1141)),((422,669),(400,1190)),
((563,510),(652,909)),((563,561),(652,1007)),((563,621),(652,1108)),((563,651),(652,1148)),((563,679),(652,1191)),
((667,478),(824,847)),((655,523),(813,920)),((656,567),(829,987)),((673,614),(874,1075)),((690,648),(895,1141)),((699,669),(895,1190)),
((722,478),(939,828)),((729,523),(952,887)),((738,570),(974,972)),((749,614),(994,1050)),((761,661),(1031,1124)),((771,682),(1062,1184)),((767,703),(1049,1222)),((774,738),(1041,1280)),((736,740),(944,1280)),((723,705),(918,1216)),
((485,676),(520,1203)),((645,676),(783,1203)),((394,723),(354,1243)),((729,723),(943,1244)),
((0,0),(0,0)),((1121,0),(1279,0)),((0,1401),(0,1280)),((1121,1401),(1279,1280))]
sp=np.array([p[0] for p in pairs],float);tp=np.array([p[1] for p in pairs],float)
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

# Exact original body alpha is retained. Bound edits to the original shirt.
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
smoothed=gaussian_filter(filled,sigma=(2,2,0));filled[missing]=smoothed[missing]
blend=garment.astype(float)
result=b.copy();result[:,:,:3]=np.rint(b[:,:,:3]*(1-blend[:,:,None])+filled*blend[:,:,None]).clip(0,255).astype('uint8')
Image.fromarray(result).save(ROOT/'body-black-shirt.png')
Image.fromarray((garment*255).astype('uint8')).save(ROOT/'target-shirt-mask.png')
aligned=np.dstack((filled.clip(0,255).astype('uint8'),np.where(garment,b[:,:,3],0).astype('uint8')))
Image.fromarray(aligned).save(ROOT/'shirt-aligned.png')
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
orig=compose(b);new=compose(result);orig.save(ROOT/'preview-original.png');new.save(ROOT/'preview-black-shirt.png')
def checker():
    values=np.where((xx//20+yy//20)%2,225,245).astype('uint8')
    return Image.fromarray(np.dstack([values,values,values,np.full_like(values,255)]))
def flat(im):return Image.alpha_composite(checker(),im).convert('RGB')
sheet=Image.new('RGB',(2560,1330),'#333333');d=ImageDraw.Draw(sheet)
for i,(label,im) in enumerate([('Original v3 embedded artwork',orig),('Black cotton shirt candidate',new)]):sheet.paste(flat(im),(1280*i,50));d.text((1280*i+20,15),label,fill='white')
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
report={'source':str(SOURCE),'source_size':source.size,'source_has_real_transparency':False,'body_texture_index':body['texture']['index'],'body_texture_size':textures[1].size,'body_canvas_origin':[164,416],'body_mesh_vertices':len(body['mesh']['vertices'])//2,'body_mesh_triangles':len(body['mesh']['indices'])//3,'body_deformer':body['deformer'],'body_uv':body['texture']['uv'],'landmarks_source_target':list(zip(sp.tolist(),tp.tolist())),'alpha_exact':True,'pixels_outside_shirt_exact':True,'garment_pixels':int(garment.sum()),'reconstructed_pixels':int(missing.sum()),'maximum_reconstruction_distance':float(dist[missing].max()) if missing.any() else 0,'source_hashes':original_hashes,'rig_written':False}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2))
print({k:v for k,v in report.items() if k not in ['landmarks_source_target','source_hashes']})
