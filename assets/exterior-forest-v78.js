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

  root.name='EXTERIOR_SCENERY_V178';
  const forestMode='scenic-v178';

  root.userData={
    version:178,
    source:data.source,
    boundaryLayer:data.boundaryLayer,
    forestMode,
    purpose:'V178 optimized scenic exterior: forest, hills, water and village landscape'
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
  const floorMat=new THREE.MeshLambertMaterial({color:0x789a61});
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
  floor.receiveShadow=false;
  floor.name='V178_SCENIC_GROUND';
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
  // V178 SCENIC EXTERIOR
  // Visual richness is created with a handful of InstancedMeshes and large
  // low-poly surfaces. Nothing here casts shadows, so this scenery remains much
  // cheaper than the confirmed Factory Details bottleneck.
  // -------------------------------------------------------------------------
  const sceneryRoot=new THREE.Group();
  sceneryRoot.name='V178_SCENIC_LANDSCAPE';
  sceneryRoot.userData={fpsNonSolid:true,optimizedExterior:true};
  root.add(sceneryRoot);

  const terrainRoot=new THREE.Group();
  terrainRoot.name='V178_TERRAIN';
  sceneryRoot.add(terrainRoot);

  const waterRoot=new THREE.Group();
  waterRoot.name='V178_WATER';
  sceneryRoot.add(waterRoot);

  const mountainRoot=new THREE.Group();
  mountainRoot.name='V178_MOUNTAINS';
  sceneryRoot.add(mountainRoot);

  const forestRoot=new THREE.Group();
  forestRoot.name='V178_FOREST';
  sceneryRoot.add(forestRoot);

  const villageBackdropRoot=new THREE.Group();
  villageBackdropRoot.name='V178_VILLAGE_BACKDROP';
  sceneryRoot.add(villageBackdropRoot);

  const fieldMats=[
    new THREE.MeshLambertMaterial({color:0x89aa67}),
    new THREE.MeshLambertMaterial({color:0xa3b875}),
    new THREE.MeshLambertMaterial({color:0x728f58}),
    new THREE.MeshLambertMaterial({color:0xb2b77a})
  ];

  // Large agricultural/grass patches make the exterior read as real countryside
  // instead of a single flat green rectangle.
  const fieldPatches=[];
  let fieldGuard=0;
  while(fieldPatches.length<14&&fieldGuard++<8000){
    const x=rr(box.minX+55,box.maxX-55);
    const z=rr(box.minZ+55,box.maxZ-55);
    if(pointInPolygon(x,z,boundary))continue;
    const d=distanceToBoundary(x,z);
    if(d<55||d>390)continue;
    if(inRoadCorridor(x,z,8))continue;
    if(nearHouse(x,z,8))continue;
    if(fieldPatches.some(p=>Math.hypot(p.x-x,p.z-z)<75))continue;
    fieldPatches.push({
      x,z,w:rr(58,125),h:rr(42,92),rot:rr(-.55,.55),
      mat:fieldMats[fieldPatches.length%fieldMats.length]
    });
  }
  for(let i=0;i<fieldPatches.length;i++){
    const p=fieldPatches[i];
    const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),p.mat);
    m.name='V178_FIELD_'+i;
    m.rotation.x=-Math.PI/2;
    m.rotation.z=p.rot;
    m.scale.set(p.w,p.h,1);
    m.position.set(p.x,-.455,p.z);
    m.castShadow=false;
    m.receiveShadow=false;
    m.userData.fpsNonSolid=true;
    terrainRoot.add(m);
  }

  // Water: three ponds/lakes plus one meandering canal on the far exterior.
  const waterSites=[];
  let waterGuard=0;
  while(waterSites.length<3&&waterGuard++<10000){
    const x=rr(box.minX+70,box.maxX-70);
    const z=rr(box.minZ+70,box.maxZ-70);
    if(pointInPolygon(x,z,boundary))continue;
    const d=distanceToBoundary(x,z);
    if(d<115||d>365)continue;
    if(inRoadCorridor(x,z,18))continue;
    if(nearHouse(x,z,28))continue;
    if(waterSites.some(p=>Math.hypot(p.x-x,p.z-z)<120))continue;
    waterSites.push({x,z,rx:rr(32,58),rz:rr(22,45),rot:rr(-.4,.4)});
  }

  const waterMat=new THREE.MeshLambertMaterial({
    color:0x5f9eb2,
    transparent:true,
    opacity:.88,
    side:THREE.DoubleSide
  });
  const bankMat=new THREE.MeshLambertMaterial({color:0x91a772});
  for(let i=0;i<waterSites.length;i++){
    const p=waterSites[i];

    const bank=new THREE.Mesh(new THREE.CircleGeometry(1,48),bankMat);
    bank.name='V178_WATER_BANK_'+i;
    bank.rotation.x=-Math.PI/2;
    bank.rotation.z=p.rot;
    bank.scale.set(p.rx*1.16,p.rz*1.20,1);
    bank.position.set(p.x,-.445,p.z);
    bank.castShadow=false;
    bank.receiveShadow=false;
    bank.userData.fpsNonSolid=true;
    waterRoot.add(bank);

    const lake=new THREE.Mesh(new THREE.CircleGeometry(1,48),waterMat);
    lake.name='V178_LAKE_'+i;
    lake.rotation.x=-Math.PI/2;
    lake.rotation.z=p.rot;
    lake.scale.set(p.rx,p.rz,1);
    lake.position.set(p.x,-.425,p.z);
    lake.castShadow=false;
    lake.receiveShadow=false;
    lake.userData.fpsNonSolid=true;
    waterRoot.add(lake);
  }

  function nearWater(x,z,pad=0){
    return waterSites.some(w=>{
      const nx=(x-w.x)/(w.rx+pad);
      const nz=(z-w.z)/(w.rz+pad);
      return nx*nx+nz*nz<1.25;
    });
  }

  function makeStripGeometry(points,width){
    const positions=[];
    const indices=[];
    for(let i=0;i<points.length;i++){
      const a=points[Math.max(0,i-1)];
      const b=points[Math.min(points.length-1,i+1)];
      let dx=b.x-a.x,dz=b.z-a.z;
      const len=Math.hypot(dx,dz)||1;
      dx/=len;dz/=len;
      const nx=-dz,nz=dx;
      positions.push(
        points[i].x+nx*width*.5,-.43,points[i].z+nz*width*.5,
        points[i].x-nx*width*.5,-.43,points[i].z-nz*width*.5
      );
      if(i<points.length-1){
        const k=i*2;
        indices.push(k,k+2,k+1,k+1,k+2,k+3);
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setIndex(indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  const canalPoints=[];
  const canalZ=maxZ+235;
  const canalSpan=(maxX-minX)+500;
  const canalStart=minX-250;
  for(let i=0;i<=18;i++){
    const t=i/18;
    canalPoints.push({
      x:canalStart+canalSpan*t,
      z:canalZ+Math.sin(t*Math.PI*3.4)*28+Math.sin(t*Math.PI*7)*8
    });
  }
  const canalBank=new THREE.Mesh(makeStripGeometry(canalPoints,28),bankMat);
  canalBank.name='V178_CANAL_BANK';
  canalBank.position.y=-.01;
  canalBank.userData.fpsNonSolid=true;
  waterRoot.add(canalBank);

  const canal=new THREE.Mesh(makeStripGeometry(canalPoints,18),waterMat);
  canal.name='V178_CANAL';
  canal.position.y=.015;
  canal.userData.fpsNonSolid=true;
  waterRoot.add(canal);

  // Low-poly mountain/hill ring. Three instanced materials = only three draw calls.
  const mountainGeo=new THREE.CylinderGeometry(.10,1,1,10,4,false);
  const mountainMats=[
    new THREE.MeshLambertMaterial({color:0x657e59,flatShading:true}),
    new THREE.MeshLambertMaterial({color:0x718965,flatShading:true}),
    new THREE.MeshLambertMaterial({color:0x596f52,flatShading:true})
  ];
  const mountainSets=[[],[],[]];

  const mountainCandidates=[
    [box.minX+55,box.minZ+70],[box.minX+160,box.minZ+45],
    [box.maxX-75,box.minZ+55],[box.maxX-190,box.minZ+38],
    [box.minX+55,box.maxZ-80],[box.minX+180,box.maxZ-42],
    [box.maxX-70,box.maxZ-75],[box.maxX-210,box.maxZ-42],
    [box.minX+40,(box.minZ+box.maxZ)*.50],
    [box.maxX-45,(box.minZ+box.maxZ)*.43],
    [(box.minX+box.maxX)*.35,box.maxZ-35],
    [(box.minX+box.maxX)*.66,box.minZ+32]
  ];

  const mountainDummy=new THREE.Object3D();
  mountainCandidates.forEach((p,i)=>{
    const rx=rr(70,135),rz=rr(65,120),h=rr(42,88);
    mountainDummy.position.set(p[0],h*.5-.46,p[1]);
    mountainDummy.rotation.set(0,rr(-Math.PI,Math.PI),0);
    mountainDummy.scale.set(rx,h,rz);
    mountainDummy.updateMatrix();
    mountainSets[i%mountainSets.length].push(mountainDummy.matrix.clone());
  });

  mountainSets.forEach((matrices,mi)=>{
    if(!matrices.length)return;
    const mesh=new THREE.InstancedMesh(mountainGeo,mountainMats[mi],matrices.length);
    mesh.name='V178_MOUNTAIN_SET_'+mi;
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    mesh.userData.fpsNonSolid=true;
    mountainRoot.add(mesh);
  });

  // Background village: detailed interactive houses above remain; these extra
  // lightweight homes create clustered settlement depth for Top View.
  const backdropHouseSites=[];
  let backdropGuard=0;
  while(backdropHouseSites.length<34&&backdropGuard++<18000){
    const x=rr(box.minX+35,box.maxX-35),z=rr(box.minZ+35,box.maxZ-35);
    if(pointInPolygon(x,z,boundary))continue;
    const d=distanceToBoundary(x,z);
    if(d<85||d>340)continue;
    if(inRoadCorridor(x,z,8))continue;
    if(nearHouse(x,z,18)||nearWater(x,z,16))continue;
    if(backdropHouseSites.some(p=>Math.hypot(p.x-x,p.z-z)<24))continue;
    backdropHouseSites.push({
      x,z,rot:rr(-Math.PI,Math.PI),
      w:rr(5.5,9.2),d:rr(4.8,7.4),h:rr(3.4,5.5),
      colorIndex:backdropHouseSites.length%3
    });
  }

  const bgWallMats=[
    new THREE.MeshLambertMaterial({color:0xe6dbc7}),
    new THREE.MeshLambertMaterial({color:0xd8dfcf}),
    new THREE.MeshLambertMaterial({color:0xe2d3c1})
  ];
  const bgRoofMats=[
    new THREE.MeshLambertMaterial({color:0x93483d}),
    new THREE.MeshLambertMaterial({color:0x725142}),
    new THREE.MeshLambertMaterial({color:0x51665c})
  ];
  const bgBodyGeo=new THREE.BoxGeometry(1,1,1);
  const bgRoofGeo=new THREE.ConeGeometry(1,1,4);
  const bgDummy=new THREE.Object3D();

  for(let ci=0;ci<3;ci++){
    const houses=backdropHouseSites.filter(h=>h.colorIndex===ci);
    if(!houses.length)continue;

    const bodyBatch=new THREE.InstancedMesh(bgBodyGeo,bgWallMats[ci],houses.length);
    bodyBatch.name='V178_BG_HOUSE_BODY_'+ci;
    const roofBatch=new THREE.InstancedMesh(bgRoofGeo,bgRoofMats[ci],houses.length);
    roofBatch.name='V178_BG_HOUSE_ROOF_'+ci;

    houses.forEach((h,i)=>{
      bgDummy.position.set(h.x,h.h*.5-.38,h.z);
      bgDummy.rotation.set(0,h.rot,0);
      bgDummy.scale.set(h.w,h.h,h.d);
      bgDummy.updateMatrix();
      bodyBatch.setMatrixAt(i,bgDummy.matrix);

      bgDummy.position.set(h.x,h.h+1.0-.38,h.z);
      bgDummy.rotation.set(0,h.rot+Math.PI/4,0);
      bgDummy.scale.set(Math.max(h.w,h.d)*.72,2.0,Math.max(h.w,h.d)*.72);
      bgDummy.updateMatrix();
      roofBatch.setMatrixAt(i,bgDummy.matrix);
    });

    for(const batch of [bodyBatch,roofBatch]){
      batch.instanceMatrix.needsUpdate=true;
      batch.computeBoundingSphere();
      batch.castShadow=false;
      batch.receiveShadow=false;
      batch.userData.fpsNonSolid=true;
      villageBackdropRoot.add(batch);
    }
  }

  // Forest: ~900 low-poly trees, rendered in a tiny number of instanced batches.
  // This is visually much denser than V176, but orders of magnitude cheaper than
  // the old 14K-tree diagnostic forest.
  const treeSites=[];
  let treeGuard=0;
  const targetTreeCount=920;
  while(treeSites.length<targetTreeCount&&treeGuard++<180000){
    const x=rr(box.minX+18,box.maxX-18);
    const z=rr(box.minZ+18,box.maxZ-18);
    if(pointInPolygon(x,z,boundary))continue;
    const d=distanceToBoundary(x,z);
    if(d<42||d>405)continue;
    if(inRoadCorridor(x,z,5))continue;
    if(nearHouse(x,z,5)||nearWater(x,z,4))continue;

    // Break the forest into natural clearings instead of a uniform carpet.
    const patchNoise=
      Math.sin(x*.017)+
      Math.cos(z*.019)+
      Math.sin((x+z)*.011);
    if(patchNoise<-.72&&rnd()<.80)continue;

    treeSites.push({
      x,z,
      scale:rr(.78,1.42),
      rot:rr(-Math.PI,Math.PI),
      kind:rnd()<.22?'pine':'broad',
      shade:Math.floor(rnd()*3)
    });
  }

  const trunkGeo=new THREE.CylinderGeometry(.16,.26,4.2,6);
  const broadGeo=new THREE.DodecahedronGeometry(1.72,0);
  const pineGeo=new THREE.ConeGeometry(1.65,5.4,8);
  const trunkMat=new THREE.MeshLambertMaterial({color:0x664832});
  const broadMats=[
    new THREE.MeshLambertMaterial({color:0x3e7c43}),
    new THREE.MeshLambertMaterial({color:0x568c4a}),
    new THREE.MeshLambertMaterial({color:0x6b9c54})
  ];
  const pineMat=new THREE.MeshLambertMaterial({color:0x315f3c});

  const trunkBatch=new THREE.InstancedMesh(trunkGeo,trunkMat,treeSites.length);
  trunkBatch.name='V178_FOREST_TRUNKS';

  const broadSets=[[],[],[]];
  const pineMatrices=[];
  const treeDummy=new THREE.Object3D();

  treeSites.forEach((t,i)=>{
    treeDummy.position.set(t.x,1.75*t.scale-.43,t.z);
    treeDummy.rotation.set(0,t.rot,0);
    treeDummy.scale.setScalar(t.scale);
    treeDummy.updateMatrix();
    trunkBatch.setMatrixAt(i,treeDummy.matrix);

    if(t.kind==='pine'){
      treeDummy.position.set(t.x,5.25*t.scale-.43,t.z);
      treeDummy.scale.set(t.scale,t.scale,t.scale);
      treeDummy.updateMatrix();
      pineMatrices.push(treeDummy.matrix.clone());
    }else{
      treeDummy.position.set(t.x,5.35*t.scale-.43,t.z);
      treeDummy.scale.set(1.28*t.scale,1.02*t.scale,1.18*t.scale);
      treeDummy.updateMatrix();
      broadSets[t.shade].push(treeDummy.matrix.clone());
    }
  });

  trunkBatch.instanceMatrix.needsUpdate=true;
  trunkBatch.computeBoundingSphere();
  trunkBatch.castShadow=false;
  trunkBatch.receiveShadow=false;
  trunkBatch.userData.fpsNonSolid=true;
  forestRoot.add(trunkBatch);

  broadSets.forEach((matrices,mi)=>{
    if(!matrices.length)return;
    const batch=new THREE.InstancedMesh(broadGeo,broadMats[mi],matrices.length);
    batch.name='V178_FOREST_BROAD_'+mi;
    matrices.forEach((m,i)=>batch.setMatrixAt(i,m));
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingSphere();
    batch.castShadow=false;
    batch.receiveShadow=false;
    batch.userData.fpsNonSolid=true;
    forestRoot.add(batch);
  });

  if(pineMatrices.length){
    const batch=new THREE.InstancedMesh(pineGeo,pineMat,pineMatrices.length);
    batch.name='V178_FOREST_PINE';
    pineMatrices.forEach((m,i)=>batch.setMatrixAt(i,m));
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingSphere();
    batch.castShadow=false;
    batch.receiveShadow=false;
    batch.userData.fpsNonSolid=true;
    forestRoot.add(batch);
  }

  const deciduous=treeSites.filter(t=>t.kind==='broad');
  const conifers=treeSites.filter(t=>t.kind==='pine');
  const treeAssetMode='v178-lowpoly-instanced';
  const treeDrawMeshes=forestRoot.children.length;
  const treeChunkCount=1;
  const canopyBlanketPatchCount=0;
  const canopyBlanketChunkCount=0;
  const mountainCount=mountainCandidates.length;
  const waterBodyCount=waterSites.length+1;
  const backdropHouseCount=backdropHouseSites.length;

  root.userData.treeCount=deciduous.length+conifers.length;
  root.userData.treeAssetMode=treeAssetMode;
  root.userData.treeDrawMeshes=treeDrawMeshes;
  root.userData.treeChunkCount=treeChunkCount;
  root.userData.canopyBlanketPatchCount=canopyBlanketPatchCount;
  root.userData.canopyBlanketChunkCount=canopyBlanketChunkCount;
  root.userData.houseCount=houseSites.length;
  root.userData.backdropHouseCount=backdropHouseCount;
  root.userData.mountainCount=mountainCount;
  root.userData.waterBodyCount=waterBodyCount;
  root.userData.fieldPatchCount=fieldPatches.length;

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
    ready:true,version:178,group:root,treeAssetMode,forestMode,
    treeCount:root.userData.treeCount,
    treeChunkCount,
    canopyBlanketPatchCount,
    canopyBlanketChunkCount,
    treeDrawMeshes,
    houseCount:root.userData.houseCount,
    backdropHouseCount,
    mountainCount,
    waterBodyCount,
    fieldPatchCount:fieldPatches.length,
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
  window.__DALOC_EXTERIOR_V178=api;

  console.info('[DaLoc] V178 scenic exterior installed',{
    mode:forestMode,
    realTrees:root.userData.treeCount,
    treeChunks:treeChunkCount,
    canopyPatches:canopyBlanketPatchCount,
    canopyChunks:canopyBlanketChunkCount,
    assetMode:treeAssetMode,
    treeDrawMeshes,
    houses:root.userData.houseCount,
    backdropHouses:backdropHouseCount,
    mountains:mountainCount,
    waterBodies:waterBodyCount,
    fields:fieldPatches.length,
    doors:doors.length,
    boundaryPoints:boundary.length
  });

  return api;
}
