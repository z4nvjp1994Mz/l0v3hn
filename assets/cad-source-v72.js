import * as THREE from 'three';

// V72 — SOURCE LOCK.
// CAD is authoritative for N1/D1/D2 alignment, road edges and site boundary.
// The 2D masterplan remains authoritative for features not present in this DXF.
// No roof-derived roads and no CAD centerline-only verification view.
export async function installCadSourceV72({
  world,mapPx,metersPerPixel,frameSignature,renderer
}){
  const [srcRes,junctionRes]=await Promise.all([
    fetch(new URL('./cad-source-v72.json',import.meta.url)),
    fetch(new URL('./cad-roads-v71.json',import.meta.url))
  ]);
  if(!srcRes.ok)throw new Error('V89 CAD source HTTP '+srcRes.status);
  if(!junctionRes.ok)throw new Error('V89 junction source HTTP '+junctionRes.status);
  const data=await srcRes.json();
  const junctionData=await junctionRes.json();
  if(data.frameSignature!==frameSignature)throw new Error('V72 coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='CAD_SOURCE_V72';
  root.userData={
    version:105,
    source:data.source,
    edgeLayer:data.edgeLayer,
    boundaryLayer:data.boundaryLayer,
    sourceLocked:true,
    roofDerivedRoads:false,
    runtimeInference:false,
    cadAuthoritative:true,
    visualRegistrationVersion:null,
    registeredRoadHandle:null,
    suppressedSurfaceHandles:['774F9']
  };
  world.add(root);

  const surfaceGroup=new THREE.Group();
  surfaceGroup.name='V72_CAD_ROAD_SURFACES';
  root.add(surfaceGroup);

  const edgeGroup=new THREE.Group();
  edgeGroup.name='V72_CAD_EDGE_OVERLAY';
  edgeGroup.visible=false;
  root.add(edgeGroup);

  const boundaryGroup=new THREE.Group();
  boundaryGroup.name='V72_CAD_SITE_BOUNDARY';
  root.add(boundaryGroup);

  // V104 visible CAD-road material. Exact CAD geometry is untouched; only the
  // shared material gets richer aggregate/bump detail generated once at startup.
  function makeRoadTexture(height=false){
    const size=256,c=document.createElement('canvas');c.width=c.height=size;
    const ctx=c.getContext('2d'),img=ctx.createImageData(size,size);
    const hash=(x,y)=>{
      let h=Math.imul(x+17,374761393)^Math.imul(y+29,668265263);
      h=Math.imul(h^(h>>>13),1274126177);
      return ((h^(h>>>16))>>>0)/4294967295;
    };
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const k=(y*size+x)*4,n=hash(x,y)-.5,f=hash(x*13+7,y*19+11)-.5;
      const band=(Math.sin(x*.029)+Math.cos(y*.033)+Math.sin((x+y)*.015))*1.6;
      const speck=hash(x*31,y*37)>.972?-16:0;
      const v=n*10+f*5+band+speck;
      const base=height?128:92;
      img.data[k]=img.data[k+1]=img.data[k+2]=Math.max(0,Math.min(255,base+(height?v*2.2:v)));
      if(!height){img.data[k+1]+=4;img.data[k+2]+=3;}
      img.data[k+3]=255;
    }
    ctx.putImageData(img,0,0);
    const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=height?THREE.NoColorSpace:THREE.SRGBColorSpace;
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(7,7);
    tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    return tex;
  }
  const cadRoadColor=makeRoadTexture(false);
  const cadRoadBump=makeRoadTexture(true);
  const roadMat=new THREE.MeshStandardMaterial({
    map:cadRoadColor,bumpMap:cadRoadBump,bumpScale:.018,
    color:0xffffff,roughness:.93,metalness:.012
  });
  const junctionMat=roadMat.clone();
  const edgeMat=new THREE.LineBasicMaterial({color:0x00d9a1,transparent:true,opacity:.95,depthTest:false});
  const boundaryMat=new THREE.LineBasicMaterial({color:0xe05b5b,transparent:true,opacity:.92,depthTest:false});

  function pxToWorld(pt,y=.34){
    const p=mapPx(pt[0],pt[1]);
    return new THREE.Vector3(p.x,y,p.z);
  }

  // Only the named project road axes are surfaced. Other TIM____NG objects in the
  // DXF include external tie-ins/symbol geometry and remain visible in the edge source view.
  // V210: hide ONLY the old filled CAD road directly underneath the new ROAD A.
  // The source 774F9 remains in data.roads and raw CAD edge diagnostics; only its
  // rendered surface is suppressed so the replacement road is not doubled.
  const suppressedSurfaceHandles=new Set(['774F9']);
  const surfaceHandles=new Set(['77505','77536','77537','7754C']);
  const surfaceRoads=(data.roads||[]).filter(r=>surfaceHandles.has(r.handle));

  function addRoadSurface(road){
    const pts=(road.pointsPx||[]).map(p=>pxToWorld(p));
    const width=road.widthCad*data.pxPerCadUnit*metersPerPixel;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i];
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(len<.05)continue;
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,.16,len+.18),roadMat);
      mesh.name=`V72_CAD_ROAD_${road.handle}_${i-1}`;
      mesh.position.set((a.x+b.x)/2,.31,(a.z+b.z)/2);
      mesh.rotation.y=Math.atan2(dx,dz);
      mesh.receiveShadow=true;
      mesh.userData={
        source:'DXF',
        layer:'TIM____NG',
        handle:road.handle,
        widthCad:road.widthCad,
        visualRegistration:null,
        rawCadPreserved:true,
        cadAuthoritative:true
      };
      surfaceGroup.add(mesh);
    }
    for(let i=1;i<pts.length-1;i++){
      const p=pts[i];
      const join=new THREE.Mesh(new THREE.CylinderGeometry(width*.5,width*.5,.165,32),roadMat);
      join.position.set(p.x,.315,p.z);
      join.name=`V72_CAD_JOIN_${road.handle}_${i}`;
      surfaceGroup.add(join);
    }
  }
  surfaceRoads.forEach(addRoadSurface);

  // Junction polygons are exact RG_NUT polygons from the DXF extraction used in V71.
  const cal=junctionData.cadToPixel.matrix;
  function cadToPx(p){
    return [
      cal[0][0]*p[0]+cal[0][1]*p[1]+cal[0][2],
      cal[1][0]*p[0]+cal[1][1]*p[1]+cal[1][2]
    ];
  }
  function shapeFromPx(points){
    const p0=mapPx(points[0][0],points[0][1]);
    const shape=new THREE.Shape();shape.moveTo(p0.x,-p0.z);
    for(let i=1;i<points.length;i++){
      const p=mapPx(points[i][0],points[i][1]);shape.lineTo(p.x,-p.z);
    }
    shape.closePath();return shape;
  }
  for(const j of junctionData.junctions||[]){
    const pts=j.pointsCad.map(cadToPx);
    const geo=new THREE.ExtrudeGeometry(shapeFromPx(pts),{depth:.17,bevelEnabled:false,steps:1,curveSegments:1});
    geo.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geo,junctionMat);
    mesh.name='V72_CAD_JUNCTION_'+j.handle;
    mesh.position.y=.225;
    mesh.receiveShadow=true;
    mesh.userData={source:'DXF',layer:'RG_NUT',handle:j.handle};
    surfaceGroup.add(mesh);
  }

  // V89: show the raw CAD road edges exactly as extracted from DXF.
  // The 3D circulation corridor is now warped to CAD, never the other way around.
  for(const edge of data.roadEdges||[]){
    if(!edge.pointsPx||edge.pointsPx.length<2)continue;
    const geo=new THREE.BufferGeometry().setFromPoints(edge.pointsPx.map(p=>pxToWorld(p,.72)));
    const line=new THREE.Line(geo,edgeMat);
    line.name='V89_RAW_CAD_EDGE_'+edge.handle;
    line.renderOrder=90;
    line.frustumCulled=false;
    line.userData={source:'raw DXF edge',handle:edge.handle,cadAuthoritative:true};
    edgeGroup.add(line);
  }

  if(data.siteBoundaryPx?.length>2){
    const pts=data.siteBoundaryPx.map(p=>pxToWorld(p,.55));
    pts.push(pts[0].clone());
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),boundaryMat);
    line.name='V72_SITE_BOUNDARY_DXF';
    line.renderOrder=80;
    line.frustumCulled=false;
    boundaryGroup.add(line);
  }

  let enabled=true;
  function setEnabled(v){
    enabled=!!v;
    surfaceGroup.visible=enabled;
    roadButton.classList.toggle('active',enabled);
    roadButton.textContent=enabled?'CAD roads: On':'CAD roads: Off';
  }
  function showEdges(v=true){
    edgeGroup.visible=!!v;
    edgeButton.classList.toggle('active',edgeGroup.visible);
    edgeButton.textContent=edgeGroup.visible?'CAD edges: On':'CAD edges: Off';
  }

  const controls=document.querySelector('.controls');
  const roadButton=document.createElement('button');
  roadButton.id='cadRoadsV72';roadButton.className='active';roadButton.textContent='CAD roads: On';
  roadButton.onclick=()=>setEnabled(!enabled);controls?.appendChild(roadButton);

  const edgeButton=document.createElement('button');
  edgeButton.id='cadEdgesV72';edgeButton.textContent='CAD edges: Off';
  edgeButton.onclick=()=>showEdges(!edgeGroup.visible);controls?.appendChild(edgeButton);

  const compareButton=document.createElement('button');
  compareButton.id='compare2DV72';compareButton.textContent='Compare 2D';
  compareButton.onclick=()=>window.open('./road-review-v53.html','_blank','noopener');
  controls?.appendChild(compareButton);

  window.__DALOC_V72={
    ready:true,version:89,group:root,surfaceGroup,edgeGroup,boundaryGroup,
    source:data.source,roads:surfaceRoads,roadEdges:data.roadEdges,siteBoundaryPx:data.siteBoundaryPx,
    cadAuthoritative:true,
    suppressedSurfaceHandles:[...suppressedSurfaceHandles],
    setEnabled,showEdges
  };

  console.info('[DaLoc] V210 CAD roads installed with only old 774F9 surface suppressed',{
    surfacedRoads:surfaceRoads.map(r=>r.handle),
    cadEdges:data.roadEdges?.length||0,
    siteBoundaryPoints:data.siteBoundaryPx?.length||0,
    source:data.source
  });

  return {
    ready:true,
    version:105,
    roads:surfaceRoads.length,
    edges:data.roadEdges?.length||0,
    sourceLocked:true,
    cadAuthoritative:true
  };
}
