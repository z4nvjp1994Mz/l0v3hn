import * as THREE from 'three';
import { loadKenneyTreeAssets, createStaticInstancedAsset } from './real-assets-v105.js?v=1051';

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

  root.name='EXTERIOR_FOREST_V78';
  const forestQuery=new URLSearchParams(globalThis.location?.search||'');
  const forestMode=forestQuery.get('forest')==='legacy'?'legacy':'hybrid';

  root.userData={
    version:170,
    source:data.source,
    boundaryLayer:data.boundaryLayer,
    forestMode,
    purpose:forestMode==='legacy'
      ?'A/B legacy dense exterior forest (14k trees)'
      :'V170 hybrid exterior forest: near real trees + canopy clusters + horizon masses'
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
  // V170 A/B FOREST EXPERIMENT
  // Default "hybrid" dramatically reduces real-tree instances and replaces
  // medium/far woodland with broad low-poly canopy masses. Add ?forest=legacy
  // to restore the previous 14,000-tree implementation for same-camera tests.
  // -------------------------------------------------------------------------
  const legacyForest=forestMode==='legacy';
  const targetTrees=legacyForest?14000:2200;
  const nearMaxDistance=legacyForest?420:112;
  const deciduous=[],conifers=[];
  let guard=0;
  while(deciduous.length+conifers.length<targetTrees && guard++<(legacyForest?360000:160000)){
    const x=rr(box.minX,box.maxX),z=rr(box.minZ,box.maxZ);
    if(pointInPolygon(x,z,boundary))continue;
    const d=distanceToBoundary(x,z);
    if(d<18||d>nearMaxDistance)continue;
    if(inRoadCorridor(x,z,7))continue;
    if(nearHouse(x,z,4))continue;

    const density=legacyForest
      ?(d<180?.93:d<300?.84:.72)
      :(d<58?.96:d<90?.90:.78);
    if(rnd()>density)continue;

    const item={x,z,scale:rr(.72,1.55),rot:rr(0,Math.PI*2)};
    if(rnd()<.72)deciduous.push(item);else conifers.push(item);
  }

  let treeAssetMode=legacyForest?'kenney-glb-instanced-legacy':'hybrid-v170';
  let treeDrawMeshes=0;
  let treeChunkCount=0;
  let canopyClusterCount=0;
  let canopyLobeCount=0;
  let canopyChunkCount=0;
  let horizonClusterCount=0;
  let horizonLobeCount=0;
  let horizonChunkCount=0;

  function spatialKey(x,z,size){
    return Math.floor((x-box.minX)/size)+','+Math.floor((z-box.minZ)/size);
  }

  function groupedRealTreeChunks(){
    const chunks=new Map();
    function add(item,type){
      const key=spatialKey(item.x,item.z,165);
      let chunk=chunks.get(key);
      if(!chunk){
        chunk={oak:[],pine:[]};
        chunks.set(key,chunk);
      }
      chunk[type].push(item);
    }
    deciduous.forEach(p=>add(p,'oak'));
    conifers.forEach(p=>add(p,'pine'));
    return chunks;
  }

  try{
    const assets=await loadKenneyTreeAssets();

    if(legacyForest){
      // Exact comparison path: preserve the original giant two-species batches.
      const oakPlacements=deciduous.map(p=>({
        position:new THREE.Vector3(p.x,-.42,p.z),rotationY:p.rot,scale:p.scale
      }));
      const pinePlacements=conifers.map(p=>({
        position:new THREE.Vector3(p.x,-.42,p.z),rotationY:p.rot,scale:p.scale
      }));
      const oakBatch=createStaticInstancedAsset(root,assets.oak,oakPlacements,{
        name:'V105_KENNEY_OAK_FOREST',castShadow:false,receiveShadow:true
      });
      const pineBatch=createStaticInstancedAsset(root,assets.pine,pinePlacements,{
        name:'V105_KENNEY_PINE_FOREST',castShadow:false,receiveShadow:true
      });
      treeDrawMeshes=oakBatch.meshes.length+pineBatch.meshes.length;
      treeChunkCount=2;
    }else{
      // Hybrid path: spatial chunks give each InstancedMesh a small bounding
      // sphere, so off-screen forest sectors can finally be frustum-culled.
      const chunks=groupedRealTreeChunks();
      for(const [key,chunk] of chunks){
        const chunkGroup=new THREE.Group();
        chunkGroup.name='V170_NEAR_TREE_CHUNK_'+key;
        root.add(chunkGroup);
        treeChunkCount++;

        if(chunk.oak.length){
          const batch=createStaticInstancedAsset(
            chunkGroup,
            assets.oak,
            chunk.oak.map(p=>({
              position:new THREE.Vector3(p.x,-.42,p.z),rotationY:p.rot,scale:p.scale
            })),
            {name:'V170_NEAR_OAK_'+key,castShadow:false,receiveShadow:false}
          );
          treeDrawMeshes+=batch.meshes.length;
          batch.meshes.forEach(m=>{m.userData.forestLayer='near-real';});
        }
        if(chunk.pine.length){
          const batch=createStaticInstancedAsset(
            chunkGroup,
            assets.pine,
            chunk.pine.map(p=>({
              position:new THREE.Vector3(p.x,-.42,p.z),rotationY:p.rot,scale:p.scale
            })),
            {name:'V170_NEAR_PINE_'+key,castShadow:false,receiveShadow:false}
          );
          treeDrawMeshes+=batch.meshes.length;
          batch.meshes.forEach(m=>{m.userData.forestLayer='near-real';});
        }
      }
    }
  }catch(error){
    console.error('[DaLoc] V170 real forest asset fallback',error);
    treeAssetMode=legacyForest?'procedural-fallback-legacy':'procedural-fallback-hybrid';

    const trunkGeo=new THREE.CylinderGeometry(.18,.38,4.9,8);
    const crownGeo=new THREE.DodecahedronGeometry(1.62,1);
    const coneGeo=new THREE.ConeGeometry(1.82,6.8,10);
    const trunkMat=new THREE.MeshLambertMaterial({color:0x6a4931});
    const leafMat=new THREE.MeshLambertMaterial({color:0x3d824a});
    const pineMat=new THREE.MeshLambertMaterial({color:0x2b6940});

    const fillFallback=(items,type)=>{
      if(!items.length)return;
      const trunk=new THREE.InstancedMesh(trunkGeo,trunkMat,items.length);
      const crown=new THREE.InstancedMesh(type==='oak'?crownGeo:coneGeo,type==='oak'?leafMat:pineMat,items.length);
      const d=new THREE.Object3D();
      items.forEach((p,i)=>{
        d.position.set(p.x,2.05*p.scale-.42,p.z);
        d.rotation.set(0,p.rot,0);
        d.scale.setScalar(p.scale);
        d.updateMatrix();
        trunk.setMatrixAt(i,d.matrix);
        d.position.set(p.x,type==='oak'?5.15*p.scale-.42:5.45*p.scale-.42,p.z);
        d.updateMatrix();
        crown.setMatrixAt(i,d.matrix);
      });
      for(const mesh of [trunk,crown]){
        mesh.instanceMatrix.needsUpdate=true;
        mesh.computeBoundingSphere();
        mesh.castShadow=false;
        mesh.receiveShadow=false;
        mesh.userData.forestLayer='near-fallback';
        root.add(mesh);
      }
      treeDrawMeshes+=2;
    };
    fillFallback(deciduous,'oak');
    fillFallback(conifers,'pine');
  }

  function collectForestMassCenters(target,minD,maxD,minSpacing){
    const out=[];
    let attempts=0;
    while(out.length<target&&attempts++<target*900){
      const x=rr(box.minX+20,box.maxX-20),z=rr(box.minZ+20,box.maxZ-20);
      if(pointInPolygon(x,z,boundary))continue;
      const d=distanceToBoundary(x,z);
      if(d<minD||d>maxD)continue;
      if(inRoadCorridor(x,z,9))continue;
      if(nearHouse(x,z,8))continue;
      if(out.some(p=>Math.hypot(p.x-x,p.z-z)<minSpacing))continue;
      out.push({x,z,d,rot:rr(0,Math.PI*2)});
    }
    return out;
  }

  function createCanopyMasses(centers,{
    layer='mid',
    chunkSize=190,
    lobesPerCluster=3,
    horizon=false
  }={}){
    if(!centers.length)return {clusters:0,lobes:0,chunks:0,meshes:0};
    const geometry=horizon
      ?new THREE.DodecahedronGeometry(1,0)
      :new THREE.IcosahedronGeometry(1,1);
    const material=horizon
      ?new THREE.MeshBasicMaterial({color:0xffffff})
      :new THREE.MeshLambertMaterial({color:0xffffff});
    material.toneMapped=!horizon;

    const chunks=new Map();
    let totalLobes=0;
    centers.forEach((p,ci)=>{
      for(let l=0;l<lobesPerCluster;l++){
        const angle=p.rot+l*(Math.PI*2/lobesPerCluster)+rr(-.36,.36);
        const radial=horizon?rr(5,16):rr(3.2,9.5);
        const x=p.x+Math.cos(angle)*radial;
        const z=p.z+Math.sin(angle)*radial;

        const sx=horizon?rr(24,44):rr(9,17);
        const sy=horizon?rr(7,12):rr(4.8,8.2);
        const sz=horizon?rr(22,42):rr(8.5,16.5);
        const y=(horizon?sy*.72:sy*.88)-.35;
        const key=spatialKey(p.x,p.z,chunkSize);
        let list=chunks.get(key);
        if(!list){list=[];chunks.set(key,list);}
        list.push({
          x,y,z,sx,sy,sz,rot:rr(0,Math.PI*2),
          color:horizon
            ?[0x315f38,0x386a3e,0x2d5834][(ci+l)%3]
            :[0x3b7b45,0x4a8a4f,0x32703e,0x568f52][(ci+l)%4]
        });
        totalLobes++;
      }
    });

    let meshCount=0;
    const matrix=new THREE.Matrix4();
    const quat=new THREE.Quaternion();
    const pos=new THREE.Vector3();
    const scale=new THREE.Vector3();
    for(const [key,list] of chunks){
      const mesh=new THREE.InstancedMesh(geometry,material,list.length);
      mesh.name='V170_'+layer.toUpperCase()+'_CANOPY_'+key;
      mesh.castShadow=false;
      mesh.receiveShadow=false;
      mesh.frustumCulled=true;
      mesh.userData={forestLayer:layer,forestChunk:key};
      list.forEach((p,index)=>{
        pos.set(p.x,p.y,p.z);
        quat.setFromEuler(new THREE.Euler(0,p.rot,0));
        scale.set(p.sx,p.sy,p.sz);
        matrix.compose(pos,quat,scale);
        mesh.setMatrixAt(index,matrix);
        mesh.setColorAt(index,new THREE.Color(p.color));
      });
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      mesh.computeBoundingSphere();
      root.add(mesh);
      meshCount++;
    }

    return {
      clusters:centers.length,
      lobes:totalLobes,
      chunks:chunks.size,
      meshes:meshCount
    };
  }

  if(!legacyForest){
    // Medium ring: large overlapping crowns preserve a dense forest silhouette
    // with only a few hundred very low-poly objects.
    const canopyCenters=collectForestMassCenters(260,88,300,24);
    const canopyStats=createCanopyMasses(canopyCenters,{
      layer:'mid',chunkSize:190,lobesPerCluster:3,horizon:false
    });
    canopyClusterCount=canopyStats.clusters;
    canopyLobeCount=canopyStats.lobes;
    canopyChunkCount=canopyStats.chunks;
    treeDrawMeshes+=canopyStats.meshes;

    // Far ring/horizon: huge low-poly masses, unlit and shadow-free.
    const horizonCenters=collectForestMassCenters(72,255,420,50);
    const horizonStats=createCanopyMasses(horizonCenters,{
      layer:'horizon',chunkSize:260,lobesPerCluster:2,horizon:true
    });
    horizonClusterCount=horizonStats.clusters;
    horizonLobeCount=horizonStats.lobes;
    horizonChunkCount=horizonStats.chunks;
    treeDrawMeshes+=horizonStats.meshes;
  }

  root.userData.treeCount=deciduous.length+conifers.length;
  root.userData.treeAssetMode=treeAssetMode;
  root.userData.treeDrawMeshes=treeDrawMeshes;
  root.userData.treeChunkCount=treeChunkCount;
  root.userData.canopyClusterCount=canopyClusterCount;
  root.userData.canopyLobeCount=canopyLobeCount;
  root.userData.canopyChunkCount=canopyChunkCount;
  root.userData.horizonClusterCount=horizonClusterCount;
  root.userData.horizonLobeCount=horizonLobeCount;
  root.userData.horizonChunkCount=horizonChunkCount;
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
    ready:true,version:170,group:root,treeAssetMode,forestMode,
    treeCount:root.userData.treeCount,
    treeChunkCount,
    canopyClusterCount,
    canopyLobeCount,
    canopyChunkCount,
    horizonClusterCount,
    horizonLobeCount,
    horizonChunkCount,
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

  console.info('[DaLoc] V170 exterior forest A/B installed',{
    mode:forestMode,
    realTrees:root.userData.treeCount,
    treeChunks:treeChunkCount,
    canopyClusters:canopyClusterCount,
    canopyLobes:canopyLobeCount,
    canopyChunks:canopyChunkCount,
    horizonClusters:horizonClusterCount,
    horizonLobes:horizonLobeCount,
    horizonChunks:horizonChunkCount,
    assetMode:treeAssetMode,
    treeDrawMeshes,
    houses:root.userData.houseCount,
    doors:doors.length,
    boundaryPoints:boundary.length
  });

  return api;
}
