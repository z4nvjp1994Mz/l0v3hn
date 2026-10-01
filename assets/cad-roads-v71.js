import * as THREE from 'three';

// V71 — CAD DIRECT.
// Source of truth is the original DXF. Unlike V70, this module never derives roads
// from factory roofs and never loads the frozen masterplan frontage-road vectors.
export async function installCadRoadsV71({
  world,mapPx,metersPerPixel,frameSignature,renderer
}){
  const response=await fetch(new URL('./cad-roads-v71.json',import.meta.url));
  if(!response.ok)throw new Error('V71 CAD roads HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V71 coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='CAD_ROADS_V71';
  root.userData={
    version:71,
    frameSignature,
    source:data.source,
    method:data.method,
    runtimeInference:false,
    roofDerived:false
  };
  world.add(root);

  const roadGroup=new THREE.Group();
  roadGroup.name='V71_DXF_ROAD_SURFACES';
  root.add(roadGroup);

  const debugGroup=new THREE.Group();
  debugGroup.name='V71_DXF_SOURCE_OVERLAY';
  debugGroup.visible=false;
  debugGroup.renderOrder=100;
  root.add(debugGroup);

  const asphalt=new THREE.MeshStandardMaterial({color:0x6f7474,roughness:.97,metalness:0});
  const jointAsphalt=new THREE.MeshStandardMaterial({color:0x707575,roughness:.96,metalness:0});
  const centerMat=new THREE.LineBasicMaterial({color:0x00e5a5,transparent:true,opacity:.95,depthTest:false});
  const junctionMat=new THREE.LineBasicMaterial({color:0xffd34d,transparent:true,opacity:.95,depthTest:false});

  const m=data.cadToPixel.matrix;
  const pxPerCadUnit=data.cadToPixel.pxPerCadUnit;
  function cadToPx(p){
    const x=p[0],y=p[1];
    return [
      m[0][0]*x+m[0][1]*y+m[0][2],
      m[1][0]*x+m[1][1]*y+m[1][2]
    ];
  }
  function cadToWorld(p){
    const px=cadToPx(p);
    const w=mapPx(px[0],px[1]);
    return {x:w.x,z:w.z,px};
  }
  function widthCadToWorld(widthCad){
    return widthCad*pxPerCadUnit*metersPerPixel;
  }

  const roadCorridors=[];
  const junctionWorldPolygons=[];

  function addCenterDebug(pointsCad,id){
    const pts=pointsCad.map(p=>{
      const w=cadToWorld(p);
      return new THREE.Vector3(w.x,.78,w.z);
    });
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),centerMat);
    line.name='V71_CENTERLINE_'+id;
    line.frustumCulled=false;
    debugGroup.add(line);
  }

  function addRoad(path){
    const pts=path.pointsCad.map(cadToWorld);
    const width=widthCadToWorld(path.widthCad);
    addCenterDebug(path.pointsCad,path.id);

    // Segment rectangles come directly from CAD centerlines. Circular joins close
    // only the geometric seam between consecutive CAD segments; no new branch is invented.
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i];
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(len<.01)continue;
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,.18,len+.25),asphalt);
      mesh.name=`V71_ROAD_${path.id}_${i-1}`;
      mesh.position.set((a.x+b.x)/2,.33,(a.z+b.z)/2);
      mesh.rotation.y=Math.atan2(dx,dz);
      mesh.receiveShadow=true;
      mesh.userData={
        source:'DXF',
        handles:path.handles,
        widthCad:path.widthCad,
        widthBasis:path.widthBasis,
        walkable:true,
        siteFrameSignature:frameSignature
      };
      roadGroup.add(mesh);
      roadCorridors.push({a,b,radius:width*.5+.7});
    }

    if(pts.length>2){
      for(let i=1;i<pts.length-1;i++){
        const p=pts[i];
        const join=new THREE.Mesh(new THREE.CylinderGeometry(width*.5,width*.5,.185,32),asphalt);
        join.name=`V71_JOIN_${path.id}_${i}`;
        join.position.set(p.x,.335,p.z);
        join.receiveShadow=true;
        roadGroup.add(join);
      }
    }
  }

  function addJunction(poly){
    if(!poly.pointsCad?.length)return;
    const worldPts=poly.pointsCad.map(cadToWorld);
    const shapePts=worldPts.map(p=>new THREE.Vector2(p.x,-p.z));
    if(THREE.ShapeUtils.isClockWise(shapePts))shapePts.reverse();
    const shape=new THREE.Shape(shapePts);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.19,bevelEnabled:false,steps:1,curveSegments:1});
    geo.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geo,jointAsphalt);
    mesh.name='V71_JUNCTION_'+poly.handle;
    mesh.position.y=.235;
    mesh.receiveShadow=true;
    mesh.userData={source:'DXF',handle:poly.handle,layer:'RG_NUT',siteFrameSignature:frameSignature,walkable:true};
    roadGroup.add(mesh);
    junctionWorldPolygons.push(worldPts.map(p=>({x:p.x,z:p.z})));

    const dbgPts=worldPts.map(p=>new THREE.Vector3(p.x,.81,p.z));
    dbgPts.push(dbgPts[0].clone());
    const dbg=new THREE.Line(new THREE.BufferGeometry().setFromPoints(dbgPts),junctionMat);
    dbg.name='V71_RG_NUT_'+poly.handle;
    dbg.frustumCulled=false;
    debugGroup.add(dbg);
  }

  for(const road of data.roads||[])addRoad(road);
  for(const junction of data.junctions||[])addJunction(junction);

  // The V53 carriageway was manually digitized from the raster masterplan. Keep its
  // sidewalks/greenbelt/landscape, but do not show the approximate asphalt underneath
  // the authoritative CAD road surface while V71 is enabled.
  const legacyCarriageway=world.getObjectByName('V53_CARRIAGEWAY');
  const legacyCarriagewayInitial=legacyCarriageway?.visible!==false;

  function distanceToSegment(px,pz,a,b){
    const vx=b.x-a.x,vz=b.z-a.z,wx=px-a.x,wz=pz-a.z;
    const vv=vx*vx+vz*vz;
    const t=vv?Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)):0;
    return Math.hypot(px-(a.x+vx*t),pz-(a.z+vz*t));
  }
  function pointInPolygon(x,z,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    }
    return inside;
  }
  function inRoadCorridor(x,z){
    return roadCorridors.some(c=>distanceToSegment(x,z,c.a,c.b)<=c.radius) ||
      junctionWorldPolygons.some(poly=>pointInPolygon(x,z,poly));
  }

  // Only legacy stand-alone tree groups are culled, and only where the CAD carriageway
  // physically passes. This avoids broad landscape deletion.
  const treeVisibility=new Map();
  world.traverse(o=>{
    if(!o.userData?.isTreeGroup)return;
    const p=new THREE.Vector3();o.getWorldPosition(p);
    if(!inRoadCorridor(p.x,p.z))return;
    treeVisibility.set(o,o.visible);
    o.visible=false;
  });

  // Preserve exact matrices for V53 instanced planting so the CAD-road toggle can
  // restore them rather than permanently deleting landscape objects.
  const instancedClearance=[];
  const circulation=world.getObjectByName('CIRCULATION_V53');
  circulation?.updateWorldMatrix(true,true);
  circulation?.traverse(o=>{
    if(!o.isInstancedMesh)return;
    o.updateWorldMatrix(true,false);
    const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
    const hidden=[];
    for(let i=0;i<o.count;i++){
      o.getMatrixAt(i,matrix);
      matrix.decompose(pos,q,sc);
      const wp=pos.clone().applyMatrix4(o.matrixWorld);
      if(!inRoadCorridor(wp.x,wp.z))continue;
      const original=matrix.clone();
      const hiddenMatrix=matrix.clone();
      hiddenMatrix.decompose(pos,q,sc);
      sc.setScalar(.0001);
      hiddenMatrix.compose(pos,q,sc);
      hidden.push({index:i,original,hidden:hiddenMatrix});
    }
    if(hidden.length)instancedClearance.push({mesh:o,hidden});
  });
  function applyInstancedClearance(hide){
    for(const entry of instancedClearance){
      for(const item of entry.hidden)entry.mesh.setMatrixAt(item.index,hide?item.hidden:item.original);
      entry.mesh.instanceMatrix.needsUpdate=true;
      entry.mesh.computeBoundingSphere?.();
    }
  }

  let enabled=true;
  function applyVisibility(){
    roadGroup.visible=enabled;
    if(legacyCarriageway)legacyCarriageway.visible=enabled?false:legacyCarriagewayInitial;
    for(const [tree,wasVisible] of treeVisibility)tree.visible=enabled?false:wasVisible;
    applyInstancedClearance(enabled);
  }

  const controls=document.querySelector('.controls');
  const button=document.createElement('button');
  button.id='cadRoadsV71';
  button.className='active';
  button.textContent='CAD roads: On';
  button.onclick=()=>setEnabled(!enabled);
  controls?.appendChild(button);

  const debugButton=document.createElement('button');
  debugButton.id='cadSourceV71';
  debugButton.textContent='CAD source: Off';
  debugButton.onclick=()=>showCad(!debugGroup.visible);
  controls?.appendChild(debugButton);

  function setEnabled(v){
    enabled=!!v;
    applyVisibility();
    button.classList.toggle('active',enabled);
    button.textContent=enabled?'CAD roads: On':'CAD roads: Off';
  }
  function showCad(v=true){
    debugGroup.visible=!!v;
    debugButton.classList.toggle('active',debugGroup.visible);
    debugButton.textContent=debugGroup.visible?'CAD source: On':'CAD source: Off';
  }

  applyVisibility();

  window.__DALOC_V71={
    ready:true,
    version:71,
    group:root,
    roadGroup,
    debugGroup,
    source:data.source,
    method:data.method,
    roads:data.roads,
    junctions:data.junctions,
    setEnabled,
    showCad,
    cadToPx
  };

  console.info('[DaLoc] V71 CAD-direct roads installed',{
    roads:data.roads?.length||0,
    junctions:data.junctions?.length||0,
    runtimeInference:false,
    roofDerived:false,
    source:data.source
  });

  return {
    ready:true,
    version:71,
    roads:data.roads?.length||0,
    junctions:data.junctions?.length||0,
    cadDirect:true,
    runtimeInference:false,
    roofDerived:false
  };
}
