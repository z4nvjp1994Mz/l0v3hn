import * as THREE from 'three';

export async function installExteriorForestV78({
  scene,mapPx,metersPerPixel,frameSignature,renderer
}){
  const response=await fetch(new URL('./cad-source-v72.json',import.meta.url));
  if(!response.ok)throw new Error('V89 exterior source HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V89 coordinate frame mismatch');

  const root=new THREE.Group();
  const doors=[];
  const doorTmpWorld=new THREE.Vector3();

  function localToWorld(building,local){
    building.updateWorldMatrix(true,false);
    doorTmpWorld.copy(local);
    return building.localToWorld(doorTmpWorld.clone());
  }

  root.name='EXTERIOR_VILLAGE_V176';
  const forestMode='none';

  root.userData={
    version:176,
    source:data.source,
    boundaryLayer:data.boundaryLayer,
    forestMode,
    purpose:'V176 exterior village + ground only; all exterior trees removed'
  };
  scene.add(root);

  const boundary=(data.siteBoundaryPx||[]).map(([x,y])=>{
    const p=mapPx(x,y);return {x:p.x,z:p.z};
  });
  if(boundary.length<3)throw new Error('V78 missing site boundary');

  function pointInPolygon(x,z,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    }
    return inside;
  }
  function distanceToSegment(x,z,a,b){
    const vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z,vv=vx*vx+vz*vz;
    const t=vv?Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)):0;
    return Math.hypot(x-(a.x+t*vx),z-(a.z+t*vz));
  }
  function distanceToBoundary(x,z){
    let best=Infinity;
    for(let i=0;i<boundary.length;i++){
      const a=boundary[i],b=boundary[(i+1)%boundary.length];
      best=Math.min(best,distanceToSegment(x,z,a,b));
    }
    return best;
  }

  // V89 CAD-authoritative clearance. Every road corridor, including 77505,
  // uses the raw DXF centerline and raw CAD width.
  const roadCorridors=[];
  for(const road of data.roads||[]){
    const pts=(road.pointsPx||[]).map(([x,y])=>{
      const p=mapPx(x,y);return {x:p.x,z:p.z};
    });
    const half=(road.widthCad||12)*(data.pxPerCadUnit||1.20434303125)*metersPerPixel*.5+6;
    for(let i=1;i<pts.length;i++)roadCorridors.push({a:pts[i-1],b:pts[i],radius:half});
  }

  function inRoadCorridor(x,z,pad=0){
    return roadCorridors.some(c=>distanceToSegment(x,z,c.a,c.b)<=c.radius+pad);
  }

  const xs=boundary.map(p=>p.x),zs=boundary.map(p=>p.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const expansion=430;
  const box={minX:minX-expansion,maxX:maxX+expansion,minZ:minZ-expansion,maxZ:maxZ+expansion};

  // Darker woodland floor around the whole project, with the exact CAD project
  // boundary cut out as a hole.
  const floorMat=new THREE.MeshStandardMaterial({color:0x6f9658,roughness:1});
  const outerPts=[
    new THREE.Vector2(box.minX,-box.minZ),
    new THREE.Vector2(box.minX,-box.maxZ),
    new THREE.Vector2(box.maxX,-box.maxZ),
    new THREE.Vector2(box.maxX,-box.minZ)
  ];
  if(!THREE.ShapeUtils.isClockWise(outerPts))outerPts.reverse();
  const shape=new THREE.Shape(outerPts);
  let holePts=boundary.map(p=>new THREE.Vector2(p.x,-p.z));
  if(THREE.ShapeUtils.isClockWise(holePts))holePts.reverse();
  shape.holes.push(new THREE.Path(holePts));
  const floor=new THREE.Mesh(new THREE.ShapeGeometry(shape),floorMat);
  floor.rotation.x=-Math.PI/2;
  floor.position.y=-.48;
  floor.receiveShadow=true;
  floor.name='V78_FOREST_FLOOR';
  root.add(floor);

  let seed=780131;
  function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function rr(a,b){return a+(b-a)*rnd();}

  // Sparse village: only a handful of houses, each with a small clearing.
  const houseSites=[];
  let houseGuard=0;
  while(houseSites.length<14 && houseGuard++<20000){
    const x=rr(box.minX+30,box.maxX-30),z=rr(box.minZ+30,box.maxZ-30);
    if(pointInPolygon(x,z,boundary))continue;
    const d=distanceToBoundary(x,z);
    if(d<70||d>320)continue;
    if(inRoadCorridor(x,z,10))continue;
    if(houseSites.some(p=>Math.hypot(p.x-x,p.z-z)<48))continue;
    houseSites.push({x,z,rot:rr(-Math.PI,Math.PI),scale:rr(.82,1.18)});
  }

  const clearingMat=new THREE.MeshStandardMaterial({color:0x8f9b72,roughness:1});
  const wallMats=[
    new THREE.MeshStandardMaterial({color:0xeee0c8,roughness:.82}),
    new THREE.MeshStandardMaterial({color:0xe5d1bd,roughness:.82}),
    new THREE.MeshStandardMaterial({color:0xe8e5d8,roughness:.82}),
    new THREE.MeshStandardMaterial({color:0xd8e0d1,roughness:.82})
  ];
  const roofMats=[
    new THREE.MeshStandardMaterial({color:0x9b493c,roughness:.76}),
    new THREE.MeshStandardMaterial({color:0x6f4e3d,roughness:.78}),
    new THREE.MeshStandardMaterial({color:0x465d51,roughness:.78})
  ];
  const doorMat=new THREE.MeshStandardMaterial({color:0x4b4d49,roughness:.78});

  function addHouseWall(g,size,pos,mat,name){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);
    mesh.position.set(...pos);
    mesh.name=name;
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.userData.collider=true;
    mesh.userData.type='village-house-wall';
    g.add(mesh);
    return mesh;
  }

  function buildHouseShell(g,w,d,bh,wallMat,doorWidth,doorHeight,idx){
    const t=.18;
    const gapPad=.06;
    const leftEdge=-doorWidth*.5-gapPad;
    const rightEdge=doorWidth*.5+gapPad;
    const y=bh*.5;

    addHouseWall(g,[t,bh,d],[-w*.5+t*.5,y,0],wallMat,'V168_HOUSE_SIDE_L_'+idx);
    addHouseWall(g,[t,bh,d],[ w*.5-t*.5,y,0],wallMat,'V168_HOUSE_SIDE_R_'+idx);
    addHouseWall(g,[w-2*t,bh,t],[0,y,-d*.5+t*.5],wallMat,'V168_HOUSE_REAR_'+idx);

    const leftW=Math.max(.1,leftEdge-(-w*.5+t));
    if(leftW>.11)addHouseWall(
      g,[leftW,bh,t],[-w*.5+t+leftW*.5,y,d*.5-t*.5],
      wallMat,'V168_HOUSE_FRONT_L_'+idx
    );

    const rightW=Math.max(.1,(w*.5-t)-rightEdge);
    if(rightW>.11)addHouseWall(
      g,[rightW,bh,t],[rightEdge+rightW*.5,y,d*.5-t*.5],
      wallMat,'V168_HOUSE_FRONT_R_'+idx
    );

    const lintelH=Math.max(.16,bh-doorHeight);
    addHouseWall(
      g,[doorWidth+gapPad*2,lintelH,t],
      [0,doorHeight+lintelH*.5,d*.5-t*.5],
      wallMat,'V168_HOUSE_FRONT_LINTEL_'+idx
    );
  }

  for(let i=0;i<houseSites.length;i++){
    const h=houseSites[i],g=new THREE.Group();
    g.position.set(h.x,-.37,h.z);
    g.rotation.y=h.rot;
    g.name='V78_HOUSE_'+i;
    g.userData={collider:true,type:'village-house',houseIndex:i};

    const clear=new THREE.Mesh(new THREE.CylinderGeometry(12*h.scale,13*h.scale,.08,24),clearingMat);
    clear.position.y=-.03;
    clear.receiveShadow=true;
    clear.userData.fpsNonSolid=true;
    g.add(clear);

    const w=rr(6.5,10.0)*h.scale,d=rr(5.4,8.2)*h.scale,bh=rr(4.0,6.2)*h.scale;
    const wallMat=wallMats[i%wallMats.length];
    const doorWidth=.95*h.scale,doorHeight=2.0*h.scale;

    const body=new THREE.Mesh(new THREE.BoxGeometry(w,bh,d),wallMat);
    body.position.y=bh/2;
    body.visible=false;
    body.name='V168_HOUSE_BODY_REFERENCE_'+i;
    body.userData.fpsNonSolid=true;
    g.add(body);

    buildHouseShell(g,w,d,bh,wallMat,doorWidth,doorHeight,i);
    g.userData.fpsDoorShell={L:w,D:d,H:bh,doorXs:[0],doorWidth,doorHeight};

    const roof=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*.72,2.6*h.scale,4),roofMats[i%roofMats.length]);
    roof.rotation.y=Math.PI/4;
    roof.position.y=bh+1.18*h.scale;
    roof.castShadow=true;
    roof.userData.fpsNonSolid=true;
    g.add(roof);

    const pivot=new THREE.Group();
    pivot.name='V168_HOUSE_DOOR_PIVOT_'+i;
    pivot.position.set(-doorWidth*.5,0,d*.5+.06);
    pivot.userData={fpsInteractiveDoor:true,ignoreFpsCollision:true};
    g.add(pivot);

    const panel=new THREE.Mesh(new THREE.BoxGeometry(doorWidth,doorHeight,.10),doorMat);
    panel.name='V168_HOUSE_DOOR_PANEL_'+i;
    panel.position.set(doorWidth*.5,doorHeight*.5,0);
    panel.userData={fpsInteractiveDoor:true,fpsNonSolid:true};
    pivot.add(panel);

    doors.push({
      index:doors.length,
      source:'village',
      houseIndex:i,
      building:g,
      pivot,
      panel,
      width:doorWidth,
      height:doorHeight,
      L:w,D:d,H:bh,
      swingSign:i%2===0?-1:1,
      openAmount:0,
      targetOpen:0,
      isOpen:false,
      centerLocal:new THREE.Vector3(0,doorHeight*.5,d*.5+.06),
      outsideLocal:new THREE.Vector3(0,.08,d*.5+1.25),
      insideLocal:new THREE.Vector3(0,.08,d*.5-1.25),
      displayName:'nhà dân '+(i+1)
    });

    root.add(g);
  }

  function nearHouse(x,z,pad=0){
    return houseSites.some(h=>Math.hypot(h.x-x,h.z-z)<18*h.scale+pad);
  }

  // -------------------------------------------------------------------------
  // V176: EXTERIOR TREES REMOVED
  // Keep village houses/interactive doors and the exterior ground, but render
  // no oak, pine, procedural fallback, canopy blanket or tree asset at all.
  // Internal V120 roadside trees are defined in index.html and are unaffected.
  // -------------------------------------------------------------------------
  const deciduous=[];
  const conifers=[];
  const treeAssetMode='none';
  const treeDrawMeshes=0;
  const treeChunkCount=0;
  const canopyBlanketPatchCount=0;
  const canopyBlanketChunkCount=0;

  root.userData.treeCount=deciduous.length+conifers.length;
  root.userData.treeAssetMode=treeAssetMode;
  root.userData.treeDrawMeshes=treeDrawMeshes;
  root.userData.treeChunkCount=treeChunkCount;
  root.userData.canopyBlanketPatchCount=canopyBlanketPatchCount;
  root.userData.canopyBlanketChunkCount=canopyBlanketChunkCount;
  root.userData.houseCount=houseSites.length;

  function setDoorOpen(index,v){
    const d=doors[index];
    if(!d)return false;
    d.targetOpen=v?1:0;
    d.isOpen=!!v;
    return true;
  }

  function toggleDoor(index){
    const d=doors[index];
    if(!d)return false;
    return setDoorOpen(index,!d.isOpen);
  }

  function update(dt){
    const k=Math.min(1,Math.max(0,dt)*8.5);
    for(const d of doors){
      d.openAmount+=(d.targetOpen-d.openAmount)*k;
      if(Math.abs(d.targetOpen-d.openAmount)<.002)d.openAmount=d.targetOpen;
      d.pivot.rotation.y=d.swingSign*d.openAmount*Math.PI*.49;
    }
  }

  function doorWorldInfo(index){
    const d=doors[index];
    if(!d)return null;
    return {
      center:localToWorld(d.building,d.centerLocal),
      outside:localToWorld(d.building,d.outsideLocal),
      inside:localToWorld(d.building,d.insideLocal),
      openAmount:d.openAmount,
      isOpen:d.isOpen,
      width:d.width,
      source:d.source,
      displayName:d.displayName
    };
  }

  const api={
    ready:true,version:176,group:root,treeAssetMode,forestMode,
    treeCount:root.userData.treeCount,
    treeChunkCount,
    canopyBlanketPatchCount,
    canopyBlanketChunkCount,
    treeDrawMeshes,
    houseCount:root.userData.houseCount,
    boundaryPoints:boundary.length,
    doors,
    setDoorOpen,
    toggleDoor,
    update,
    doorWorldInfo
  };
  window.__DALOC_V79=api;
  window.__DALOC_FOREST_V170=api;
  window.__DALOC_FOREST_V172=api;
  window.__DALOC_EXTERIOR_V176=api;

  console.info('[DaLoc] V175 light exterior forest installed',{
    mode:forestMode,
    realTrees:root.userData.treeCount,
    treeChunks:treeChunkCount,
    canopyPatches:canopyBlanketPatchCount,
    canopyChunks:canopyBlanketChunkCount,
    assetMode:treeAssetMode,
    treeDrawMeshes,
    houses:root.userData.houseCount,
    doors:doors.length,
    boundaryPoints:boundary.length
  });

  return api;
}
