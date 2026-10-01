"""Guarded V52 -> V53 migration. Requires shapely only at build time.
Road lines are digitized from the provided image, not survey/CAD measurements.
Runtime consumes generated vector JSON; existing buildings, trees and frame stay fixed.
"""
import hashlib,json,math,re
from pathlib import Path
from shapely.geometry import LineString,Polygon
from shapely.ops import unary_union
root=Path(__file__).resolve().parents[1]
index=root/'index.html'
before=index.read_text(encoding='utf-8')
if 'BUILD V53 NARROW ROADS + GREEN BELTS' in before:
    print('V53 already installed');raise SystemExit(0)
expected='3f04ed00eeaaefaa0ad75c7b8fe7b908b0ad2950'
raw=before.encode('utf-8')
sha=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
if sha!=expected:raise RuntimeError('Index changed since review; refusing migration: '+sha)

def source_xy(p):
    u,v=p
    return [round(.8*u-.6*v,3),round(.6*u+.8*v,3)]
# Rectification is ONLY a digitizing aid; saved data is in the ORIGINAL pixel frame.
alignments=[
 ('north-cross',16,[(938,-9),(1265,-9),(1290,-9),(1320,-11),(1450,-13),(1580,-25),(1704,-42),(1750,-51),(1753,-69)]),
 ('central-spine',22,[(1187,985),(1185,850),(1182,650),(1180,450),(1180,205),(1180,164),(1183,143),(1192,124),(1210,104),(1304,8),(1398,-95),(1506,-228)]),
 ('south-cross',17,[(843,449),(1050,449),(1180,449),(1460,450)]),
 ('north-east-local',9,[(1323,-428),(1321,-300),(1318,-180),(1316,-43),(1304,-15)])
]
def round_bends(points,distance=5):
    out=[points[0]]
    for i in range(1,len(points)-1):
        a,b,c=points[i-1:i+2];l1,l2=math.dist(a,b),math.dist(b,c);d=min(distance,l1/3,l2/3)
        p=[b[j]+(a[j]-b[j])*d/l1 for j in (0,1)];q=[b[j]+(c[j]-b[j])*d/l2 for j in (0,1)]
        out.append(p)
        for k in range(1,7):
            t=k/6;out.append([(1-t)**2*p[j]+2*t*(1-t)*b[j]+t*t*q[j] for j in (0,1)])
    out.append(points[-1]);return out
paths=[{'id':n,'widthPx':w,'pointsPx':[source_xy(p) for p in round_bends(ps)]} for n,w,ps in alignments]
road=unary_union([LineString(p['pointsPx']).buffer(p['widthPx']/2,cap_style=2,join_style=1,quad_segs=12) for p in paths])
S=.782 # Retain the existing provisional scale; this is not a new calibration.
curb_outer=road.buffer(.28/S,quad_segs=12)
walk_outer=curb_outer.buffer(1.65/S,quad_segs=12)
green_outer=walk_outer.buffer(6/S,quad_segs=12)
layers={'carriageway':road,'curb':curb_outer.difference(road),'sidewalk':walk_outer.difference(curb_outer),'greenbelt':green_outer.difference(walk_outer)}
roof_literal=re.search(r'const roofs=(\[.*?\]);',before,re.S).group(1)
roofs=json.loads(roof_literal)
footprints=[]
for cx,cy,L,b,a in roofs:
    D=b*(2.35 if b<18 else 1.9 if b<26 else 1.52 if b<38 else 1.3)
    co,si=math.cos(math.radians(a)),math.sin(math.radians(a))
    footprints.append(Polygon([(cx+x*co-y*si,cy+x*si+y*co) for x,y in [(-L/2,-D/2),(L/2,-D/2),(L/2,D/2),(-L/2,D/2)]]))
footprint_union=unary_union(footprints)
assert road.intersection(footprint_union).area<.01,'Road crosses an existing factory'
layers['greenbelt']=layers['greenbelt'].difference(footprint_union.buffer(.8))
for name,g in layers.items():assert g.is_valid and g.area>0,'Invalid '+name
for i,(an,a) in enumerate(layers.items()):
    for bn,b in list(layers.items())[i+1:]:assert a.intersection(b).area<.01,an+' overlaps '+bn

def serialize(g):
    ps=[g] if g.geom_type=='Polygon' else list(g.geoms)
    return [{'outer':[[round(x,3),round(y,3)] for x,y in p.exterior.coords],'holes':[[[round(x,3),round(y,3)] for x,y in h.coords] for h in p.interiors]} for p in ps if p.geom_type=='Polygon']
signature='1616x2048@0.782|PIN:1053.34,850.71'
data={'version':53,'frameSignature':signature,'source':{'image':'assets/masterplan-hires.jpg','width':1616,'height':2048,'method':'Manual source-image digitization of primary internal road alignments. Widths approximate the raster drawing, not survey measurements. No colour segmentation, flood fill or skeletonization.'},'paths':paths,'layers':{k:serialize(v) for k,v in layers.items()},'areasPx2':{k:round(v.area,2) for k,v in layers.items()}}
(root/'assets/circulation-v53.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')

# Replace the failed segmentation in one operation, keeping the rest of the scene.
start=before.index('  // V47 — source-matched roads from the exact same blueprint bitmap.')
end=before.index("  bpBadge.style.color='#85edb4';",start)
after=before[:start]+'  // V53: blueprint is reference only; roads are separate vector meshes.\n'+before[end:]
needle="import { OrbitControls } from 'three/addons/controls/OrbitControls.js';"
assert after.count(needle)==1
after=after.replace(needle,needle+"\nimport { installCirculationV53 } from './assets/circulation-v53.js';",1)
# Hide unmeasured ground aprons, not the architectural details or factory footprints.
fa=after.index('function addFactoryScaleDetail(');fb=after.index('buildings.forEach(addFactoryScaleDetail);',fa)
part=after[fa:fb]
for old,new in [
 ('yard.receiveShadow=true;g.add(yard);','yard.receiveShadow=true;yard.visible=false;g.add(yard);'),
 ('walk.position.set(0,.06,-D/2-1.3);g.add(walk);','walk.position.set(0,.06,-D/2-1.3);walk.visible=false;g.add(walk);'),
 ('stripe.rotation.y=.12*k;g.add(stripe);','stripe.rotation.y=.12*k;stripe.visible=false;g.add(stripe);'),
 ('line.position.set(x,.11,D/2+yardDepth*.82);g.add(line);','line.position.set(x,.11,D/2+yardDepth*.82);line.visible=false;g.add(line);')]:
    if old not in part:raise RuntimeError('Ground-detail anchor changed: '+old)
    part=part.replace(old,new,1)
after=after[:fa]+part+after[fb:]
init="""// V53: install after shared resources. Failure cannot stop the existing render loop.
installCirculationV53({world,mapPx,frameSignature:SITE_FRAME_SIGNATURE,renderer,camera,controls})
 .then(()=>{coordBadge.textContent='V53: narrow asphalt | curb | walkway | planted green belt';})
 .catch(error=>{console.error(error);coordBadge.textContent='V53 road layer failed: '+error.message;coordBadge.style.color='#ff9b9b';});

"""
assert after.count('// Views\n')==1
after=after.replace('// Views\n',init+'// Views\n',1)
after=after.replace('BUILD V52 FULL-RES ROAD MASK','BUILD V53 NARROW ROADS + GREEN BELTS',1)
after=after.replace('Bản V52 bỏ cách dựng medial-axis gây mép nham nhở. Lòng đường dùng trực tiếp mask road đã flood-fill từ masterplan ở full resolution; curb và sidewalk chỉ là các dải mỏng sinh ra bên ngoài mép đường.','V53: Lòng đường hẹp được dựng bằng mesh vector riêng; bó vỉa, lối đi bộ và dải cây xanh tách biệt. Không còn tô cả vùng màu xám thành nhựa. Bề rộng đo trên ảnh, chưa phải số liệu khảo sát.',1)
after=after.replace('V52 full-res roads','V53 narrow roads',1).replace('exact road mask + edge bands','vector roads + planted green belts',1)
after=after.replace('V52: exact full-res road mask + clean edge bands','V53: narrow carriageways; green belts kept separate',1)
after=after.replace('.controls{right:16px;top:16px;','.controls{max-width:calc(100vw - 450px);flex-wrap:wrap;right:16px;top:16px;',1)
for label,pattern in [('roofs',r'const roofs=(\[.*?\]);'),('trees',r'const TREE_POINTS = (\[.*?\]);'),('frame',r'const SITE_FRAME=Object.freeze\((.*?)\n\}\);')]:
    a=re.search(pattern,before,re.S);b=re.search(pattern,after,re.S)
    assert a and b and a.group(0)==b.group(0),label+' changed during migration'
assert 'buildPixelLockedRoadSurface' not in after and 'const roadPalette' not in after
index.write_text(after,encoding='utf-8')
(root/'docs').mkdir(exist_ok=True)
report={'version':53,'sourceIndexBlob':expected,'unchanged':['SITE_FRAME','roofs','TREE_POINTS'],'roadFactoryOverlapPx2':road.intersection(footprint_union).area,'validPolygons':True,'overlappingSurfaceLayers':False,'areasPx2':data['areasPx2'],'primaryAlignments':len(paths),'scope':'Primary internal roads only; public-road arrows excluded. Green bands are a visual reconstruction, not approved landscape design.'}
(root/'docs/v53-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
module=re.search(r'<script type="module">(.*?)</script>',after,re.S).group(1)
(root/'tests/site-syntax-check.mjs').write_text(module,encoding='utf-8')
print(json.dumps(report,indent=2))
