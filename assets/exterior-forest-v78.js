import * as THREE from 'three';

export async function installExteriorForestV78({
  scene,mapPx,metersPerPixel,frameSignature,renderer
}){
  const response=await fetch(new URL('./cad-source-v72.json',import.meta.url));
  if(!response.ok)throw new Error('V78 exterior source HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V78 coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='EXTERIOR_FOREST_V78';
  root.userData={
    version:79,
    source:data.source,
    boundaryLayer:data.boundaryLayer,
    purpose:'dense exterior forest with sparse village houses'
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

  // Convert every CAD road centerline to world space so exterior vegetation never
  // grows on the road corridors around the industrial cluster.
  const roadCorridors=[];
  for(const road of data.roads||[]){
    const pts=(road.pointsPx||[]).map(([x,y])=>{
      const p=mapPx(x,y);return {x:p.x,z:p.z};
    });
    const half=(road.widthCad||12)*(data.pxPerCadUnit||1.20434303125)*metersPerPixel*.5+6;
    for(let i=1;i<pts.length;i++)roadCorridors.push({a:pts[i-1],b:pts[i],radius:half});
  }
  // Keep the existing presentation-context roads open too.
  for(const r of [
    {x:760,z:20,w:18,l:1700,rot:-.10},
    {x:-720,z:620,w:16,l:1250,rot:.92},
    {x:0,z:900,w:16,l:1650,rot:Math.PI/2}
  ]){
    const dx=Math.sin(r.rot)*r.l*.5,dz=Math.cos(r.rot)*r.l*.5;
    roadCorridors.push({
      a:{x:r.x-dx,z:r.z-dz},
      b:{x:r.x+dx,z:r.z+dz},
      radius:r.w*.5+7
    });
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

  for(let i=0;i<houseSites.length;i++){
    const h=houseSites[i],g=new THREE.Group();
    g.position.set(h.x,-.37,h.z);g.rotation.y=h.rot;g.name='V78_HOUSE_'+i;
    const clear=new THREE.Mesh(new THREE.CylinderGeometry(12*h.scale,13*h.scale,.08,24),clearingMat);
    clear.position.y=-.03;clear.receiveShadow=true;g.add(clear);
    const w=rr(6.5,10.0)*h.scale,d=rr(5.4,8.2)*h.scale,bh=rr(4.0,6.2)*h.scale;
    const body=new THREE.Mesh(new THREE.BoxGeometry(w,bh,d),wallMats[i%wallMats.length]);
    body.position.y=bh/2;body.castShadow=true;body.receiveShadow=true;g.add(body);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*.72,2.6*h.scale,4),roofMats[i%roofMats.length]);
    roof.rotation.y=Math.PI/4;roof.position.y=bh+1.18*h.scale;roof.castShadow=true;g.add(roof);
    const door=new THREE.Mesh(new THREE.BoxGeometry(.95*h.scale,2.0*h.scale,.10),doorMat);
    door.position.set(0,1.0*h.scale,d/2+.06);g.add(door);
    root.add(g);
  }

  function nearHouse(x,z,pad=0){
    return houseSites.some(h=>Math.hypot(h.x-x,h.z-z)<18*h.scale+pad);
  }

  // Dense woodland. Instancing keeps the exterior highly populated without thousands
  // of individual draw calls.
  const targetTrees=14000;
  const deciduous=[],conifers=[];
  let guard=0;
  while(deciduous.length+conifers.length<targetTrees && guard++<360000){
    const x=rr(box.minX,box.maxX),z=rr(box.minZ,box.maxZ);
    if(pointInPolygon(x,z,boundary))continue;
    const d=distanceToBoundary(x,z);
    if(d<18||d>420)continue;
    if(inRoadCorridor(x,z,7))continue;
    if(nearHouse(x,z,4))continue;

    // Slightly denser near the project edge, but still continuous deep into the background.
    const density=d<180?.93:d<300?.84:.72;
    if(rnd()>density)continue;

    const item={x,z,scale:rr(.72,1.55),rot:rr(0,Math.PI*2)};
    if(rnd()<.72)deciduous.push(item);else conifers.push(item);
  }

  const trunkGeo=new THREE.CylinderGeometry(.20,.34,4.7,6);
  const crownGeo=new THREE.IcosahedronGeometry(1.65,1);
  const crown2Geo=new THREE.IcosahedronGeometry(1.25,1);
  const coneGeo=new THREE.ConeGeometry(1.75,6.4,8);
  const trunkMat=new THREE.MeshStandardMaterial({color:0x68472f,roughness:1});
  const leafMatA=new THREE.MeshStandardMaterial({color:0x356f42,roughness:1});
  const leafMatB=new THREE.MeshStandardMaterial({color:0x4f8750,roughness:1});
  const pineMat=new THREE.MeshStandardMaterial({color:0x2d633b,roughness:1});

  function fillInstances(items,type){
    const trunk=new THREE.InstancedMesh(trunkGeo,trunkMat,items.length);
    const crownA=new THREE.InstancedMesh(type==='deciduous'?crownGeo:coneGeo,type==='deciduous'?leafMatA:pineMat,items.length);
    const crownB=type==='deciduous'?new THREE.InstancedMesh(crown2Geo,leafMatB,items.length):null;
    const dummy=new THREE.Object3D();
    items.forEach((p,i)=>{
      dummy.rotation.set(0,p.rot,0);
      dummy.scale.setScalar(p.scale);
      dummy.position.set(p.x,2.35*p.scale-.42,p.z);
      dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
      if(type==='deciduous'){
        dummy.position.set(p.x-.18*p.scale,5.45*p.scale-.42,p.z+.08*p.scale);
        dummy.updateMatrix();crownA.setMatrixAt(i,dummy.matrix);
        dummy.position.set(p.x+.55*p.scale,6.15*p.scale-.42,p.z-.22*p.scale);
        dummy.updateMatrix();crownB.setMatrixAt(i,dummy.matrix);
      }else{
        dummy.position.set(p.x,6.15*p.scale-.42,p.z);
        dummy.updateMatrix();crownA.setMatrixAt(i,dummy.matrix);
      }
    });
    const meshes=crownB?[trunk,crownA,crownB]:[trunk,crownA];
    for(const mesh of meshes){
      mesh.receiveShadow=true;
      mesh.castShadow=false;
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
  }
  fillInstances(deciduous,'deciduous');
  fillInstances(conifers,'conifer');

  root.userData.treeCount=deciduous.length+conifers.length;
  root.userData.houseCount=houseSites.length;

  window.__DALOC_V79={
    ready:true,version:79,group:root,
    treeCount:root.userData.treeCount,
    houseCount:root.userData.houseCount,
    boundaryPoints:boundary.length
  };

  console.info('[DaLoc] V79 ultra-dense exterior forest installed',{
    trees:root.userData.treeCount,
    houses:root.userData.houseCount,
    boundaryPoints:boundary.length
  });

  return {
    ready:true,version:78,group:root,
    treeCount:root.userData.treeCount,
    houseCount:root.userData.houseCount
  };
}
