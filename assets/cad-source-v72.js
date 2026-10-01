import * as THREE from 'three';

// V72 — SOURCE LOCK.
// CAD is authoritative for N1/D1/D2 alignment, road edges and site boundary.
// The 2D masterplan remains authoritative for features not present in this DXF.
// No roof-derived roads and no CAD centerline-only verification view.
export async function installCadSourceV72({
  world,mapPx,metersPerPixel,frameSignature,renderer
}){
  const [srcRes,junctionRes,registrationRes]=await Promise.all([
    fetch(new URL('./cad-source-v72.json',import.meta.url)),
    fetch(new URL('./cad-roads-v71.json',import.meta.url)),
    fetch(new URL('./cad-road-registration-v87.json',import.meta.url))
  ]);
  if(!srcRes.ok)throw new Error('V72 CAD source HTTP '+srcRes.status);
  if(!junctionRes.ok)throw new Error('V72 junction source HTTP '+junctionRes.status);
  if(!registrationRes.ok)throw new Error('V77 road registration HTTP '+registrationRes.status);
  const data=await srcRes.json();
  const junctionData=await junctionRes.json();
  const roadRegistration=await registrationRes.json();
  if(data.frameSignature!==frameSignature)throw new Error('V72 coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='CAD_SOURCE_V72';
  root.userData={
    version:72,
    source:data.source,
    edgeLayer:data.edgeLayer,
    boundaryLayer:data.boundaryLayer,
    sourceLocked:true,
    roofDerivedRoads:false,
    runtimeInference:false,
    visualRegistrationVersion:87,
    registeredRoadHandle:roadRegistration.roadHandle
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

  const roadMat=new THREE.MeshStandardMaterial({color:0x727777,roughness:.98,metalness:0});
  const junctionMat=new THREE.MeshStandardMaterial({color:0x757a7a,roughness:.98,metalness:0});
  const edgeMat=new THREE.LineBasicMaterial({color:0x00d9a1,transparent:true,opacity:.95,depthTest:false});
  const boundaryMat=new THREE.LineBasicMaterial({color:0xe05b5b,transparent:true,opacity:.92,depthTest:false});

  function pxToWorld(pt,y=.34){
    const p=mapPx(pt[0],pt[1]);
    return new THREE.Vector3(p.x,y,p.z);
  }

  // Only the named project road axes are surfaced. Other TIM____NG objects in the
  // DXF include external tie-ins/symbol geometry and remain visible in the edge source view.
  const surfaceHandles=new Set(['77505','77536','77537','7754C','774F9']);
  const surfaceRoads=(data.roads||[]).filter(r=>surfaceHandles.has(r.handle));

  function visualRoadPoints(road){
    if(road.handle===roadRegistration.roadHandle && Array.isArray(roadRegistration.visualPointsPx)){
      return roadRegistration.visualPointsPx;
    }
    return road.pointsPx;
  }

  function addRoadSurface(road){
    const sourcePoints=visualRoadPoints(road);
    const pts=sourcePoints.map(p=>pxToWorld(p));
    const width=(road.handle===roadRegistration.roadHandle && Number.isFinite(roadRegistration.visualWidthPx))
      ? roadRegistration.visualWidthPx*metersPerPixel
      : road.widthCad*data.pxPerCadUnit*metersPerPixel;
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
        visualRegistration:road.handle===roadRegistration.roadHandle?'V87':null,
        rawCadPreserved:true
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

  // V88 registered edge overlay:
  // raw DXF edges around 77505 are intentionally NOT drawn because the road surface is
  // visually registered to V53. Showing raw edges beside a registered surface creates
  // a false "misalignment" in Top View. Secondary-road raw edges remain untouched.
  const registeredCenter=Array.isArray(roadRegistration.visualPointsPx)
    ? roadRegistration.visualPointsPx
    : [];
  const registeredHalfPx=(roadRegistration.visualWidthPx||0)*.5;

  function pointSegDistPx(p,a,b){
    const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1],vv=vx*vx+vy*vy;
    const t=vv?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
    return Math.hypot(p[0]-(a[0]+t*vx),p[1]-(a[1]+t*vy));
  }
  function pointPathDistPx(p,path){
    let best=Infinity;
    for(let i=1;i<path.length;i++)best=Math.min(best,pointSegDistPx(p,path[i-1],path[i]));
    return best;
  }
  function belongsToRegisteredMainEdge(edge){
    if(registeredCenter.length<2||!edge.pointsPx?.length)return false;
    const near=edge.pointsPx.filter(p=>pointPathDistPx(p,registeredCenter)<=18).length;
    return near/edge.pointsPx.length>=.60;
  }

  for(const edge of data.roadEdges||[]){
    if(!edge.pointsPx||edge.pointsPx.length<2)continue;
    if(belongsToRegisteredMainEdge(edge))continue;
    const geo=new THREE.BufferGeometry().setFromPoints(edge.pointsPx.map(p=>pxToWorld(p,.72)));
    const line=new THREE.Line(geo,edgeMat);
    line.name='V72_EDGE_'+edge.handle;
    line.renderOrder=90;
    line.frustumCulled=false;
    edgeGroup.add(line);
  }

  function offsetRegisteredPath(path,side){
    return path.map((p,i)=>{
      const prev=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)];
      let tx=next[0]-prev[0],ty=next[1]-prev[1];
      const len=Math.hypot(tx,ty)||1;tx/=len;ty/=len;
      const nx=-ty,ny=tx;
      return [p[0]+nx*registeredHalfPx*side,p[1]+ny*registeredHalfPx*side];
    });
  }
  if(registeredCenter.length>=2&&registeredHalfPx>0){
    for(const side of [-1,1]){
      const pts=offsetRegisteredPath(registeredCenter,side);
      const line=new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts.map(p=>pxToWorld(p,.76))),
        edgeMat
      );
      line.name='V88_REGISTERED_EDGE_77505_'+(side<0?'L':'R');
      line.renderOrder=95;
      line.frustumCulled=false;
      line.userData={source:'V53 registered edge',roadHandle:'77505',side};
      edgeGroup.add(line);
    }
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
    ready:true,version:88,group:root,surfaceGroup,edgeGroup,boundaryGroup,
    source:data.source,roads:surfaceRoads,roadEdges:data.roadEdges,siteBoundaryPx:data.siteBoundaryPx,
    roadRegistration,
    setEnabled,showEdges
  };

  console.info('[DaLoc] V88 source-locked CAD road + registered edge overlay installed',{
    surfacedRoads:surfaceRoads.map(r=>r.handle),
    registeredRoad:roadRegistration.roadHandle,
    fit:roadRegistration.fit,
    cadEdges:data.roadEdges?.length||0,
    registeredEdgeOverlay:registeredCenter.length>=2,
    siteBoundaryPoints:data.siteBoundaryPx?.length||0,
    source:data.source
  });

  return {
    ready:true,
    version:88,
    roads:surfaceRoads.length,
    edges:data.roadEdges?.length||0,
    sourceLocked:true,
    registeredRoad:roadRegistration.roadHandle,
    registrationFit:roadRegistration.fit,
    registeredEdgeOverlay:true
  };
}
