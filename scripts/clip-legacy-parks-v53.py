"""Clip only conflicting legacy park surfaces; retain their materials and all tree positions."""
import json,re
from pathlib import Path
from shapely.geometry import Polygon
from shapely.ops import unary_union
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
file=root/'assets/circulation-v53.json'
data=json.loads(file.read_text())
def load(polys):return unary_union([Polygon(p['outer'],p['holes']) for p in polys])
cut=unary_union([load(data['layers'][name]) for name in ['carriageway','curb','sidewalk']])
def serialize(g):
 ps=[g] if g.geom_type=='Polygon' else list(g.geoms)
 return [{'outer':[[round(x,3),round(y,3)] for x,y in p.exterior.coords],'holes':[[[round(x,3),round(y,3)] for x,y in h.coords] for h in p.interiors]} for p in ps if p.geom_type=='Polygon' and p.area>.1]
clips=[]
for name in ['PARK_MAIN','PARK_SECONDARY','POND_GARDEN','ADMIN_PLAZA']:
 m=re.search(r'const '+name+r'=(\[.*?\]);',html,re.S)
 if not m:continue
 points=json.loads(m.group(1));original=Polygon(points).buffer(0)
 if original.intersection(cut).area<.1:continue
 clipped=original.difference(cut.buffer(.10))
 clips.append({'name':name,'boundsPx':[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)],'polygons':serialize(clipped)})
data['legacySurfaceClips']=clips
file.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
module=root/'assets/circulation-v53.js'
code=module.read_text(encoding='utf-8')
marker='  world.add(group);'
insertion="""  // Clip legacy approximate park fills where they used to overhang the measured roads.
  // Trees, benches, materials and park areas away from the corridor remain unchanged.
  const semantic=world.getObjectByName('semantic2D3D');
  if(semantic)for(const clip of data.legacySurfaceClips||[]){
    const [x0,y0,x1,y1]=clip.boundsPx,lo=mapPx(x0,y1),hi=mapPx(x1,y0);
    const mesh=semantic.children.find(o=>{
      if(o.geometry?.type!=='ShapeGeometry')return false;
      o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
      return Math.abs(b.min.x-lo.x)<.05&&Math.abs(b.max.x-hi.x)<.05&&Math.abs(b.min.y+lo.z)<.05&&Math.abs(b.max.y+hi.z)<.05;
    });
    if(!mesh)continue;
    const shapes=clip.polygons.map(p=>{const shape=new THREE.Shape(ring(p.outer,true));shape.holes=p.holes.map(h=>new THREE.Path(ring(h,false)));return shape;});
    if(!shapes.length){mesh.visible=false;continue;}
    const old=mesh.geometry;mesh.geometry=new THREE.ShapeGeometry(shapes);old.dispose();
  }
"""
if 'data.legacySurfaceClips' not in code:
 assert code.count(marker)==1
 module.write_text(code.replace(marker,insertion+marker,1),encoding='utf-8')
(root/'tests/site-syntax-check.mjs').write_text(re.search(r'<script type="module">(.*?)</script>',html,re.S).group(1),encoding='utf-8')
report_path=root/'docs/v53-validation.json'
report=json.loads(report_path.read_text());report['clippedLegacySurfaces']=[c['name'] for c in clips]
report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Clipped legacy surfaces:',report['clippedLegacySurfaces'])
