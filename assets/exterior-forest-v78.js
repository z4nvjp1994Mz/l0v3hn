import * as THREE from 'three';

export async function installExteriorForestV78({
  scene,mapPx,metersPerPixel,frameSignature,renderer
}){
  const [response,circulationResponse]=await Promise.all([
    fetch(new URL('./cad-source-v72.json',import.meta.url)),
    fetch(new URL('./circulation-v53.json',import.meta.url))
  ]);
  if(!response.ok)throw new Error('V89 exterior source HTTP '+response.status);
  if(!circulationResponse.ok)throw new Error('V183 circulation source HTTP '+circulationResponse.status);
  const data=await response.json();
  const circulation=await circulationResponse.json();
  if(data.frameSignature!==frameSignature||circulation.frameSignature!==frameSignature){
    throw new Error('V183 coordinate frame mismatch');
  }

  const root=new THREE.Group();
  const doors=[];
  const doorTmpWorld=new THREE.Vector3();

  function localToWorld(building,local){
    building.updateWorldMatrix(true,false);
    doorTmpWorld.copy(local);
    return building.localToWorld(doorTmpWorld.clone());
  }

  root.name='EXTERIOR_SCENERY_V188';
  const forestMode='scenic-v188';

  root.userData={
    version:188,
    source:data.source,
    boundaryLayer:data.boundaryLayer,
    forestMode,
    purpose:'V188 three-branch fork moved to the entrance actually visible in Top View: first CAD endpoint of 77505'
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

  // V183 REFERENCE-STYLE ROAD NETWORK
  // The east side now follows the supplied reference image:
  // 1) one major north-south arterial immediately outside the project,
  // 2) three project access branches at clearly separated vertical levels,
  // 3) a southern through boulevard crossing the arterial,
  // 4) no diagonal expressway slicing across the three-gateway area.

  function roadWorldPoints(handle){
    const road=(data.roads||[]).find(r=>r.handle===handle);
    if(!road)return [];
    return (road.pointsPx||[]).map(([x,y])=>{
      const p=mapPx(x,y);
      return {x:p.x,z:p.z};
    });
  }

  function circulationWorldPoints(id){
    const path=(circulation.paths||[]).find(p=>p.id===id);
    if(!path)return [];
    return (path.pointsPx||[]).map(([x,y])=>{
      const p=mapPx(x,y);
      return {x:p.x,z:p.z};
    });
  }

  function normalize2(x,z){
    const l=Math.hypot(x,z)||1;
    return {x:x/l,z:z/l};
  }

  function smoothPath(controlPoints,density=18){
    const pts=controlPoints.filter(Boolean);
    if(pts.length<2)return pts;
    const curve=new THREE.CatmullRomCurve3(
      pts.map(p=>new THREE.Vector3(p.x,0,p.z)),
      false,
      'centripetal',
      .32
    );
    const segments=Math.max(28,(pts.length-1)*density);
    return curve.getPoints(segments).map(v=>({x:v.x,z:v.z}));
  }

  function closestPointOnPolyline(p,line){
    let bestPoint=null,bestD=Infinity,bestTangent={x:1,z:0};
    for(let i=1;i<line.length;i++){
      const a=line[i-1],b=line[i];
      const vx=b.x-a.x,vz=b.z-a.z;
      const wx=p.x-a.x,wz=p.z-a.z;
      const vv=vx*vx+vz*vz;
      const t=vv?Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)):0;
      const q={x:a.x+t*vx,z:a.z+t*vz};
      const d=Math.hypot(q.x-p.x,q.z-p.z);
      if(d<bestD){
        bestD=d;
        bestPoint=q;
        bestTangent=normalize2(vx,vz);
      }
    }
    return {point:bestPoint,distance:bestD,tangent:bestTangent};
  }

  const highwaySpecs=[];
  const primaryHighways=[];

  function addSmoothHighway(name,controlPoints,width,kind='main',density=18){
    const points=smoothPath(controlPoints,density);
    if(points.length<2)return null;
    const spec={name,points,width,kind};
    highwaySpecs.push(spec);
    if(kind==='main'||kind==='bypass')primaryHighways.push(spec);
    return spec;
  }

  // ---------------------------------------------------------------------------
  // EAST ARTERIAL — placed close to the right project edge like the reference.
  // ---------------------------------------------------------------------------
  const eastArterialX=maxX+64;
  const eastArterial=addSmoothHighway(
    'V183_EAST_ARTERIAL',
    [
      {x:eastArterialX+10,z:box.minZ},
      {x:eastArterialX-3,z:minZ-260},
      {x:eastArterialX+2,z:minZ-70},
      {x:eastArterialX-2,z:-350},
      {x:eastArterialX+1,z:-120},
      {x:eastArterialX-1,z:120},
      {x:eastArterialX+3,z:maxZ+210},
      {x:eastArterialX+8,z:box.maxZ}
    ],
    34,
    'main',
    22
  );

  // ---------------------------------------------------------------------------
  // NORTH THROUGH ROAD — stays well north of the three-gateway zone.
  // This replaces the old V181 diagonal road that visibly cut across the project.
  // ---------------------------------------------------------------------------
  addSmoothHighway(
    'V183_NORTH_BYPASS',
    [
      {x:box.minX,z:minZ-205},
      {x:minX-190,z:minZ-175},
      {x:minX+90,z:minZ-205},
      {x:(minX+maxX)*.48,z:minZ-225},
      {x:maxX+115,z:minZ-205},
      {x:box.maxX,z:minZ-160}
    ],
    28,
    'bypass',
    20
  );

  // ---------------------------------------------------------------------------
  // SOUTH THROUGH BOULEVARD — visually mirrors the broad road along the bottom
  // of the reference image and crosses the east arterial cleanly.
  // ---------------------------------------------------------------------------
  addSmoothHighway(
    'V183_SOUTH_BOULEVARD',
    [
      {x:box.minX,z:maxZ+185},
      {x:minX-170,z:maxZ+165},
      {x:minX+120,z:maxZ+178},
      {x:(minX+maxX)*.48,z:maxZ+195},
      {x:eastArterialX,z:maxZ+175},
      {x:maxX+255,z:maxZ+155},
      {x:box.maxX,z:maxZ+135}
    ],
    32,
    'main',
    20
  );

  // Keep the west CAD-authored radial because it already follows real source
  // geometry and does not interfere with the east reference layout.
  const ec=roadWorldPoints('774EC');
  const ea=roadWorldPoints('774EA');
  if(ec.length>=2&&ea.length>=2){
    const a0=ec[1],a1=ec[0],a2=ea[0],a3=ea[1];
    const dir0=normalize2(a0.x-a1.x,a0.z-a1.z);
    const dir3=normalize2(a3.x-a2.x,a3.z-a2.z);
    addSmoothHighway(
      'V183_WEST_RADIAL',
      [
        {x:box.minX,z:THREE.MathUtils.clamp(a0.z+dir0.z*210,box.minZ,box.maxZ)},
        a0,a1,a2,a3,
        {
          x:THREE.MathUtils.clamp(a3.x+dir3.x*260,box.minX,box.maxX),
          z:THREE.MathUtils.clamp(a3.z+dir3.z*260,box.minZ,box.maxZ)
        }
      ],
      29,
      'main',
      20
    );
  }

  // ---------------------------------------------------------------------------
  // V186: ONLY at the real main gate 77505.
  const gateRoad=roadWorldPoints('77505');
  if(gateRoad.length<2)throw new Error('V186 gate road missing');
  // V188 correction: use the visible project entrance shown in Top View.
  // In V93 this is the first CAD endpoint (the detailed FAR/V92 gate), not
  // road.pointsPx.at(-1), which is the opposite entrance.
  const gateEnd=gateRoad[0];
  const gatePrev=gateRoad[1];
  const gateIn=normalize2(gatePrev.x-gateEnd.x,gatePrev.z-gateEnd.z);

  const gateCenter={x:gateEnd.x+gateIn.x*14,z:gateEnd.z+gateIn.z*14};
  const forkNode={x:gateCenter.x+gateIn.x*18,z:gateCenter.z+gateIn.z*18};

  const centralSpine=circulationWorldPoints('central-spine');
  const center0=centralSpine[centralSpine.length-1]||{
    x:forkNode.x+gateIn.x*24,
    z:forkNode.z+gateIn.z*24
  };
  const center1=centralSpine[centralSpine.length-2]||{
    x:center0.x+gateIn.x*55,
    z:center0.z+gateIn.z*55
  };
  const centerJoin={
    x:THREE.MathUtils.lerp(center0.x,center1.x,.34),
    z:THREE.MathUtils.lerp(center0.z,center1.z,.34)
  };

  function rotateXZ(v,a){
    const c=Math.cos(a),q=Math.sin(a);
    return {x:v.x*c-v.z*q,z:v.x*q+v.z*c};
  }
  const leftDir=rotateXZ(gateIn,.76);
  const rightDir=rotateXZ(gateIn,-.76);
  const leftJoin={x:forkNode.x+leftDir.x*78,z:forkNode.z+leftDir.z*78};
  const rightJoin={x:forkNode.x+rightDir.x*78,z:forkNode.z+rightDir.z*78};
  const trunkStart={x:gateEnd.x-gateIn.x*24,z:gateEnd.z-gateIn.z*24};

  const referenceForkSpecs=[];
  function addReferenceForkRoad(name,controls,width,kind){
    const spec=addSmoothHighway(name,controls,width,kind,22);
    if(spec)referenceForkSpecs.push(spec);
    return spec;
  }
  const referenceForkTrunk=addReferenceForkRoad(
    'V188_GATE_FORK_TRUNK',[trunkStart,gateEnd,gateCenter,forkNode],20.5,'fork-trunk'
  );
  const referenceForkLeft=addReferenceForkRoad(
    'V188_GATE_FORK_LEFT',[forkNode,{x:forkNode.x+leftDir.x*28,z:forkNode.z+leftDir.z*28},leftJoin],17.0,'fork'
  );
  const referenceForkCenter=addReferenceForkRoad(
    'V188_GATE_FORK_CENTER',[forkNode,center0,centerJoin],18.5,'fork'
  );
  const referenceForkRight=addReferenceForkRoad(
    'V188_GATE_FORK_RIGHT',[forkNode,{x:forkNode.x+rightDir.x*28,z:forkNode.z+rightDir.z*28},rightJoin],17.0,'fork'
  );

  function pointAlongPolyline(points,distance){
    let remain=distance;
    for(let i=1;i<points.length;i++){
      const p0=points[i-1],p1=points[i];
      const len=Math.hypot(p1.x-p0.x,p1.z-p0.z);
      if(len<1e-6)continue;
      if(remain<=len){
        const t=remain/len;
        return {x:THREE.MathUtils.lerp(p0.x,p1.x,t),z:THREE.MathUtils.lerp(p0.z,p1.z,t)};
      }
      remain-=len;
    }
    return points[points.length-1]||forkNode;
  }

  const forkIslandPolygons=[];
  function addForkIsland(x,y){
    if(!x||!y)return;
    const a0=pointAlongPolyline(x.points,10),b0=pointAlongPolyline(y.points,10);
    const a1=pointAlongPolyline(x.points,33),b1=pointAlongPolyline(y.points,33);
    const n={x:(a0.x+b0.x)/2,z:(a0.z+b0.z)/2};
    const f={x:(a1.x+b1.x)/2,z:(a1.z+b1.z)/2};
    forkIslandPolygons.push([
      {x:THREE.MathUtils.lerp(a0.x,n.x,.56),z:THREE.MathUtils.lerp(a0.z,n.z,.56)},
      {x:THREE.MathUtils.lerp(a1.x,f.x,.43),z:THREE.MathUtils.lerp(a1.z,f.z,.43)},
      {x:THREE.MathUtils.lerp(b1.x,f.x,.43),z:THREE.MathUtils.lerp(b1.z,f.z,.43)},
      {x:THREE.MathUtils.lerp(b0.x,n.x,.56),z:THREE.MathUtils.lerp(b0.z,n.z,.56)}
    ]);
  }
  addForkIsland(referenceForkLeft,referenceForkCenter);
  addForkIsland(referenceForkCenter,referenceForkRight);

  // V186: no extra 77505 merge/ramp.

  // All road centerlines clear generated forest/village/fields.
  const referenceForkCorridors=[];
  for(const spec of highwaySpecs){
    for(let i=1;i<spec.points.length;i++){
      const isFork=spec.kind==='fork'||spec.kind==='fork-trunk';
      const corridor={
        a:spec.points[i-1],
        b:spec.points[i],
        radius:spec.width*.5+(isFork?3:(spec.kind==='gateway'?4.5:spec.kind==='ramp'?5:8)),
        highwayV188:true
      };
      roadCorridors.push(corridor);
      if(isFork)referenceForkCorridors.push(corridor);
    }
  }

  // Prevent original roadside trees from standing in the new fork.
  const forkTreeWorld=new THREE.Vector3();
  scene.traverse(o=>{
    if(!o.userData?.isTreeGroup)return;
    o.getWorldPosition(forkTreeWorld);
    if(referenceForkCorridors.some(c=>
      distanceToSegment(forkTreeWorld.x,forkTreeWorld.z,c.a,c.b)<=c.radius+1.2
    )){
      o.userData.hiddenByReferenceForkV188=true;
      o.visible=false;
    }
  });

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
  floor.name='V181_SCENIC_GROUND';
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
  // V179 NATURAL SCENIC EXTERIOR
  // Dense clustered forest, irregular visible lakes and rolling terrain ridges.
  // Exterior scenery remains static, shadow-free and heavily instanced.
  // -------------------------------------------------------------------------
  const sceneryRoot=new THREE.Group();
  sceneryRoot.name='V181_SCENIC_LANDSCAPE';
  sceneryRoot.userData={fpsNonSolid:true,optimizedExterior:true};
  root.add(sceneryRoot);

  const terrainRoot=new THREE.Group();
  terrainRoot.name='V181_TERRAIN';
  sceneryRoot.add(terrainRoot);

  const waterRoot=new THREE.Group();
  waterRoot.name='V181_WATER';
  sceneryRoot.add(waterRoot);

  const highwayRoot=new THREE.Group();
  highwayRoot.name='V188_EXPRESSWAY_NETWORK';
  highwayRoot.userData={fpsNonSolid:true,walkable:true};
  sceneryRoot.add(highwayRoot);

  const forestRoot=new THREE.Group();
  forestRoot.name='V181_CLUSTERED_FOREST';
  sceneryRoot.add(forestRoot);

  const villageBackdropRoot=new THREE.Group();
  villageBackdropRoot.name='V181_VILLAGE_BACKDROP';
  sceneryRoot.add(villageBackdropRoot);

  function makeRoadRibbon(points,width,y=.20,offset=0){
    const positions=[];
    const indices=[];
    for(let i=0;i<points.length;i++){
      const a=points[Math.max(0,i-1)];
      const b=points[Math.min(points.length-1,i+1)];
      let dx=b.x-a.x,dz=b.z-a.z;
      const len=Math.hypot(dx,dz)||1;
      dx/=len;dz/=len;
      const nx=-dz,nz=dx;
      const cx=points[i].x+nx*offset;
      const cz=points[i].z+nz*offset;
      positions.push(
        cx+nx*width*.5,y,cz+nz*width*.5,
        cx-nx*width*.5,y,cz-nz*width*.5
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

  const highwayShoulderMat=new THREE.MeshLambertMaterial({color:0x858985});
  const highwayAsphaltMat=new THREE.MeshLambertMaterial({color:0x4a4d4d});
  const forkShoulderMat=new THREE.MeshLambertMaterial({color:0xb6b8b1});
  const forkAsphaltMat=new THREE.MeshLambertMaterial({color:0x6c716f});
  const highwayMedianMat=new THREE.MeshLambertMaterial({color:0x657a56});
  const highwayWhiteMat=new THREE.MeshBasicMaterial({color:0xf4f2e5});
  const highwayYellowMat=new THREE.MeshBasicMaterial({color:0xe4c449});

  const dashGeo=new THREE.BoxGeometry(.22,.025,4.8);
  const dashMatrices=[];
  const dashDummy=new THREE.Object3D();

  function collectLaneDashes(spec,offset){
    const pts=spec.points;
    let carry=0;
    const spacing=11.0;

    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i];
      const dx=b.x-a.x,dz=b.z-a.z;
      const len=Math.hypot(dx,dz);
      if(len<.01)continue;
      const tx=dx/len,tz=dz/len;
      const nx=-tz,nz=tx;
      const yaw=Math.atan2(tx,tz);

      let s=spacing-carry;
      while(s<len){
        const t=s/len;
        const dashY=(spec.kind==='fork'||spec.kind==='fork-trunk')?.515:.262;
        dashDummy.position.set(
          THREE.MathUtils.lerp(a.x,b.x,t)+nx*offset,
          dashY,
          THREE.MathUtils.lerp(a.z,b.z,t)+nz*offset
        );
        dashDummy.rotation.set(0,yaw,0);
        dashDummy.scale.set(1,1,1);
        dashDummy.updateMatrix();
        dashMatrices.push(dashDummy.matrix.clone());
        s+=spacing;
      }
      carry=(carry+len)%spacing;
    }
  }

  let highwaySurfaceCount=0;
  let highwayMainCount=0;
  let highwayRampCount=0;

  for(const spec of highwaySpecs){
    const isRamp=spec.kind==='ramp';
    const isGateway=spec.kind==='gateway';
    const isFork=spec.kind==='fork'||spec.kind==='fork-trunk';

    const shoulderY=isFork?.425:.185;
    const asphaltY=isFork?.455:.215;
    const edgeY=isFork?.492:.248;

    const shoulder=new THREE.Mesh(
      makeRoadRibbon(spec.points,spec.width+(isFork?3:(isRamp?3.5:6)),shoulderY),
      isFork?forkShoulderMat:highwayShoulderMat
    );
    shoulder.name=spec.name+'_SHOULDER';
    shoulder.userData={fpsNonSolid:true,walkable:true,highwayV188:true};
    shoulder.castShadow=false;
    shoulder.receiveShadow=false;
    if(isFork)shoulder.renderOrder=120;
    highwayRoot.add(shoulder);

    const asphalt=new THREE.Mesh(
      makeRoadRibbon(spec.points,spec.width,asphaltY),
      isFork?forkAsphaltMat:highwayAsphaltMat
    );
    asphalt.name=spec.name+'_ASPHALT';
    asphalt.userData={
      fpsNonSolid:true,
      walkable:true,
      highwayV188:true,
      layer:'carriageway'
    };
    asphalt.castShadow=false;
    asphalt.receiveShadow=false;
    if(isFork)asphalt.renderOrder=121;
    highwayRoot.add(asphalt);

    if(!isRamp&&!isFork){
      const medianWidth=isGateway?1.6:(spec.width>=30?3.8:3.0);
      const median=new THREE.Mesh(
        makeRoadRibbon(spec.points,medianWidth,.238),
        highwayMedianMat
      );
      median.name=spec.name+'_MEDIAN';
      median.userData={fpsNonSolid:true,highwayV188:true};
      highwayRoot.add(median);
    }

    const edgeOffset=Math.max(2.0,spec.width*.5-.95);
    for(const side of [-1,1]){
      const edge=new THREE.Mesh(
        makeRoadRibbon(spec.points,.30,edgeY,side*edgeOffset),
        highwayWhiteMat
      );
      edge.name=spec.name+'_EDGE_'+(side<0?'L':'R');
      edge.userData={fpsNonSolid:true,highwayV188:true};
      if(isFork)edge.renderOrder=123;
      highwayRoot.add(edge);
    }

    if(isRamp){
      collectLaneDashes(spec,0);
      highwayRampCount++;
    }else if(isFork){
      // Internal fork uses a simple center separator, not freeway styling.
      collectLaneDashes(spec,0);
      highwayMainCount++;
    }else{
      const laneOffset=Math.max(4.2,spec.width*.27);
      collectLaneDashes(spec,-laneOffset);
      collectLaneDashes(spec,laneOffset);

      const centerLine=new THREE.Mesh(
        makeRoadRibbon(spec.points,.16,.250),
        highwayYellowMat
      );
      centerLine.name=spec.name+'_CENTER';
      centerLine.userData={fpsNonSolid:true,highwayV188:true};
      highwayRoot.add(centerLine);
      highwayMainCount++;
    }

    highwaySurfaceCount++;
  }

  // V187 visible hub: keeps the 3-way split readable above the CAD road.
  const forkHub=new THREE.Mesh(
    new THREE.CylinderGeometry(13.5,13.5,.05,40),
    forkAsphaltMat
  );
  forkHub.name='V188_GATE_FORK_HUB';
  forkHub.position.set(forkNode.x,.463,forkNode.z);
  forkHub.renderOrder=122;
  forkHub.userData={fpsNonSolid:true,walkable:true,referenceForkV188:true,layer:'carriageway'};
  highwayRoot.add(forkHub);

  // Two landscaped wedge islands between the three branch roads.
  const forkIslandCurbMat=new THREE.MeshLambertMaterial({color:0xc6c7c1});
  const forkIslandGreenMat=new THREE.MeshLambertMaterial({color:0x6e9658});

  function forkPolygonShape(points){
    const vec=points.map(p=>new THREE.Vector2(p.x,-p.z));
    if(THREE.ShapeUtils.isClockWise(vec))vec.reverse();
    return new THREE.Shape(vec);
  }

  forkIslandPolygons.forEach((poly,i)=>{
    if(poly.length<3)return;
    const curb=new THREE.Mesh(
      new THREE.ShapeGeometry(forkPolygonShape(poly)),
      forkIslandCurbMat
    );
    curb.name='V188_FORK_ISLAND_CURB_'+i;
    curb.rotation.x=-Math.PI/2;
    curb.position.y=.505;
    curb.userData={fpsNonSolid:true,referenceForkV188:true};
    highwayRoot.add(curb);

    const cx=poly.reduce((s,p)=>s+p.x,0)/poly.length;
    const cz=poly.reduce((s,p)=>s+p.z,0)/poly.length;
    const inner=poly.map(p=>({
      x:THREE.MathUtils.lerp(p.x,cx,.13),
      z:THREE.MathUtils.lerp(p.z,cz,.13)
    }));
    const green=new THREE.Mesh(
      new THREE.ShapeGeometry(forkPolygonShape(inner)),
      forkIslandGreenMat
    );
    green.name='V188_FORK_ISLAND_GREEN_'+i;
    green.rotation.x=-Math.PI/2;
    green.position.y=.518;
    green.userData={fpsNonSolid:true,referenceForkV188:true};
    highwayRoot.add(green);
  });

  if(dashMatrices.length){
    const dashBatch=new THREE.InstancedMesh(dashGeo,highwayWhiteMat,dashMatrices.length);
    dashBatch.name='V188_HIGHWAY_LANE_DASHES';
    dashMatrices.forEach((m,i)=>dashBatch.setMatrixAt(i,m));
    dashBatch.instanceMatrix.needsUpdate=true;
    dashBatch.computeBoundingSphere();
    dashBatch.castShadow=false;
    dashBatch.receiveShadow=false;
    dashBatch.userData={fpsNonSolid:true,highwayV188:true};
    highwayRoot.add(dashBatch);
  }

  const siteW=maxX-minX;
  const siteD=maxZ-minZ;
  const siteCx=(minX+maxX)*.5;
  const siteCz=(minZ+maxZ)*.5;

  // Agricultural mosaic outside the project: larger contiguous plots with
  // alternating tones, so Top View reads as countryside rather than empty lawn.
  const fieldMats=[
    new THREE.MeshLambertMaterial({color:0x86a968}),
    new THREE.MeshLambertMaterial({color:0xa5ba79}),
    new THREE.MeshLambertMaterial({color:0x76955b}),
    new THREE.MeshLambertMaterial({color:0xb6b87d}),
    new THREE.MeshLambertMaterial({color:0x94a96b})
  ];
  const fieldPatches=[];
  const fixedFields=[
    [minX-150,minZ+siteD*.18,145,72,-.12],
    [minX-130,minZ+siteD*.76,130,66,.18],
    [maxX+145,minZ+siteD*.24,150,78,.10],
    [maxX+125,minZ+siteD*.72,138,70,-.16],
    [minX+siteW*.18,maxZ+135,150,72,.08],
    [minX+siteW*.55,maxZ+145,165,76,-.08],
    [minX+siteW*.78,minZ-135,145,74,.12],
    [minX+siteW*.36,minZ-145,155,78,-.10]
  ];
  fixedFields.forEach((f,i)=>fieldPatches.push({
    x:f[0],z:f[1],w:f[2],h:f[3],rot:f[4],mat:fieldMats[i%fieldMats.length]
  }));
  let fieldGuard=0;
  while(fieldPatches.length<20&&fieldGuard++<9000){
    const x=rr(box.minX+55,box.maxX-55),z=rr(box.minZ+55,box.maxZ-55);
    if(pointInPolygon(x,z,boundary))continue;
    const d=distanceToBoundary(x,z);
    if(d<70||d>385)continue;
    if(inRoadCorridor(x,z,10))continue;
    if(nearHouse(x,z,12))continue;
    if(fieldPatches.some(p=>Math.hypot(p.x-x,p.z-z)<85))continue;
    fieldPatches.push({
      x,z,w:rr(72,138),h:rr(48,86),rot:rr(-.28,.28),
      mat:fieldMats[fieldPatches.length%fieldMats.length]
    });
  }
  for(let i=0;i<fieldPatches.length;i++){
    const p=fieldPatches[i];
    const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),p.mat);
    m.name='V181_FIELD_'+i;
    m.rotation.x=-Math.PI/2;
    m.rotation.z=p.rot;
    m.scale.set(p.w,p.h,1);
    m.position.set(p.x,-.452,p.z);
    m.castShadow=false;
    m.receiveShadow=false;
    m.userData.fpsNonSolid=true;
    terrainRoot.add(m);
  }

  function makeIrregularLakeGeometry(rx,rz,phase=0,scale=1){
    const shape=new THREE.Shape();
    const count=64;
    for(let i=0;i<count;i++){
      const a=i/count*Math.PI*2;
      const wobble=
        1+
        .075*Math.sin(a*3+phase)+
        .045*Math.sin(a*5-phase*.7)+
        .025*Math.cos(a*8+phase*.4);
      const x=Math.cos(a)*rx*wobble*scale;
      const y=Math.sin(a)*rz*wobble*scale;
      if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
    }
    shape.closePath();
    const g=new THREE.ShapeGeometry(shape,48);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  // Deterministic large water bodies placed just outside three sides of the site,
  // so they are guaranteed to be visible from normal Top View.
  const waterSites=[
    {x:minX-112,z:minZ+siteD*.34,rx:82,rz:48,rot:-.18,phase:.7},
    {x:maxX+118,z:minZ+siteD*.62,rx:94,rz:54,rot:.14,phase:2.1},
    {x:minX+siteW*.52,z:maxZ+112,rx:76,rz:42,rot:-.08,phase:4.0}
  ];

  const bankMat=new THREE.MeshLambertMaterial({color:0x9aaa79});
  const waterMat=new THREE.MeshPhongMaterial({
    color:0x4d9eb9,
    specular:0xaedce8,
    shininess:58,
    transparent:true,
    opacity:.94,
    side:THREE.DoubleSide
  });
  const shallowMat=new THREE.MeshLambertMaterial({
    color:0x79b5b9,
    transparent:true,
    opacity:.55,
    side:THREE.DoubleSide
  });

  for(let i=0;i<waterSites.length;i++){
    const p=waterSites[i];

    const bank=new THREE.Mesh(
      makeIrregularLakeGeometry(p.rx,p.rz,p.phase,1.16),
      bankMat
    );
    bank.name='V181_LAKE_BANK_'+i;
    bank.rotation.x=-Math.PI/2;
    bank.rotation.z=p.rot;
    bank.position.set(p.x,-.447,p.z);
    bank.castShadow=false;
    bank.receiveShadow=false;
    bank.userData.fpsNonSolid=true;
    waterRoot.add(bank);

    const shallow=new THREE.Mesh(
      makeIrregularLakeGeometry(p.rx,p.rz,p.phase+.3,1.05),
      shallowMat
    );
    shallow.name='V181_LAKE_SHALLOW_'+i;
    shallow.rotation.x=-Math.PI/2;
    shallow.rotation.z=p.rot;
    shallow.position.set(p.x,-.428,p.z);
    shallow.castShadow=false;
    shallow.receiveShadow=false;
    shallow.userData.fpsNonSolid=true;
    waterRoot.add(shallow);

    const lake=new THREE.Mesh(
      makeIrregularLakeGeometry(p.rx,p.rz,p.phase,1),
      waterMat
    );
    lake.name='V181_LAKE_'+i;
    lake.rotation.x=-Math.PI/2;
    lake.rotation.z=p.rot;
    lake.position.set(p.x,-.405,p.z);
    lake.castShadow=false;
    lake.receiveShadow=false;
    lake.userData.fpsNonSolid=true;
    waterRoot.add(lake);
  }

  function nearWater(x,z,pad=0){
    return waterSites.some(w=>{
      const nx=(x-w.x)/(w.rx+pad);
      const nz=(z-w.z)/(w.rz+pad);
      return nx*nx+nz*nz<1.35;
    });
  }

  // Reed rings make lakes obvious from both top view and walking view with only
  // two instanced draw calls.
  const reedSites=[];
  for(let wi=0;wi<waterSites.length;wi++){
    const w=waterSites[wi];
    for(let i=0;i<42;i++){
      const a=i/42*Math.PI*2+wi*.37;
      const rrim=1.04+.055*Math.sin(i*2.2+wi);
      reedSites.push({
        x:w.x+Math.cos(a)*w.rx*rrim,
        z:w.z+Math.sin(a)*w.rz*rrim,
        s:.72+(i%5)*.08
      });
    }
  }
  const reedGeo=new THREE.ConeGeometry(.16,1.45,5);
  const reedMat=new THREE.MeshLambertMaterial({color:0x607d45});
  const reedBatch=new THREE.InstancedMesh(reedGeo,reedMat,reedSites.length);
  const reedDummy=new THREE.Object3D();
  reedSites.forEach((p,i)=>{
    reedDummy.position.set(p.x,.28,p.z);
    reedDummy.rotation.set(0,(i*.91)%Math.PI,0);
    reedDummy.scale.set(p.s,p.s,p.s);
    reedDummy.updateMatrix();
    reedBatch.setMatrixAt(i,reedDummy.matrix);
  });
  reedBatch.instanceMatrix.needsUpdate=true;
  reedBatch.computeBoundingSphere();
  reedBatch.castShadow=false;
  reedBatch.receiveShadow=false;
  reedBatch.userData.fpsNonSolid=true;
  waterRoot.add(reedBatch);

  function makeStripGeometry(points,width,y=-.414){
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
        points[i].x+nx*width*.5,y,points[i].z+nz*width*.5,
        points[i].x-nx*width*.5,y,points[i].z-nz*width*.5
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

  // Visible canal along the far side, wide enough to read from Top View.
  const canalPoints=[];
  const canalZ=maxZ+185;
  const canalSpan=siteW+360;
  const canalStart=minX-180;
  for(let i=0;i<=24;i++){
    const t=i/24;
    canalPoints.push({
      x:canalStart+canalSpan*t,
      z:canalZ+Math.sin(t*Math.PI*3.1)*24+Math.sin(t*Math.PI*6.6)*7
    });
  }
  const canalBank=new THREE.Mesh(makeStripGeometry(canalPoints,34,-.438),bankMat);
  canalBank.name='V181_CANAL_BANK';
  canalBank.userData.fpsNonSolid=true;
  waterRoot.add(canalBank);

  const canal=new THREE.Mesh(makeStripGeometry(canalPoints,21,-.402),waterMat);
  canal.name='V181_CANAL';
  canal.userData.fpsNonSolid=true;
  waterRoot.add(canal);

  // V180: hills/mountains removed at user request.
  const mountainCount=0;

  // Background village is grouped into three actual settlements rather than
  // random isolated houses scattered across the map.
  const villageClusters=[
    {x:minX-118,z:minZ+siteD*.72,rx:74,rz:54,count:18},
    {x:maxX+126,z:minZ+siteD*.28,rx:82,rz:58,count:18},
    {x:minX+siteW*.73,z:maxZ+112,rx:88,rz:48,count:18}
  ];
  const backdropHouseSites=[];
  villageClusters.forEach((vc,ci)=>{
    let made=0,guard=0;
    while(made<vc.count&&guard++<2500){
      const a=rnd()*Math.PI*2;
      const r=Math.sqrt(rnd());
      const x=vc.x+Math.cos(a)*vc.rx*r;
      const z=vc.z+Math.sin(a)*vc.rz*r;
      if(pointInPolygon(x,z,boundary))continue;
      if(inRoadCorridor(x,z,5))continue;
      if(nearWater(x,z,10))continue;
      if(backdropHouseSites.some(p=>Math.hypot(p.x-x,p.z-z)<13))continue;
      backdropHouseSites.push({
        x,z,rot:rr(-.45,.45)+(ci===1?Math.PI*.5:0),
        w:rr(6.2,10.4),d:rr(5.0,8.0),h:rr(3.8,6.2),
        colorIndex:(made+ci)%3
      });
      made++;
    }
  });

  const bgWallMats=[
    new THREE.MeshLambertMaterial({color:0xeadcc7}),
    new THREE.MeshLambertMaterial({color:0xd9e0d1}),
    new THREE.MeshLambertMaterial({color:0xe1cfbc})
  ];
  const bgRoofMats=[
    new THREE.MeshLambertMaterial({color:0x9a4a3d}),
    new THREE.MeshLambertMaterial({color:0x714d3e}),
    new THREE.MeshLambertMaterial({color:0x53675d})
  ];
  const bgBodyGeo=new THREE.BoxGeometry(1,1,1);
  const bgRoofGeo=new THREE.ConeGeometry(1,1,4);
  const bgDummy=new THREE.Object3D();

  for(let ci=0;ci<3;ci++){
    const houses=backdropHouseSites.filter(h=>h.colorIndex===ci);
    if(!houses.length)continue;
    const bodyBatch=new THREE.InstancedMesh(bgBodyGeo,bgWallMats[ci],houses.length);
    bodyBatch.name='V181_BG_HOUSE_BODY_'+ci;
    const roofBatch=new THREE.InstancedMesh(bgRoofGeo,bgRoofMats[ci],houses.length);
    roofBatch.name='V181_BG_HOUSE_ROOF_'+ci;

    houses.forEach((h,i)=>{
      bgDummy.position.set(h.x,h.h*.5-.38,h.z);
      bgDummy.rotation.set(0,h.rot,0);
      bgDummy.scale.set(h.w,h.h,h.d);
      bgDummy.updateMatrix();
      bodyBatch.setMatrixAt(i,bgDummy.matrix);

      bgDummy.position.set(h.x,h.h+1.15-.38,h.z);
      bgDummy.rotation.set(0,h.rot+Math.PI/4,0);
      bgDummy.scale.set(Math.max(h.w,h.d)*.74,2.25,Math.max(h.w,h.d)*.74);
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

  // Dense forest CLUSTERS rather than even scatter. 3.2K low-poly trees still
  // render in only a handful of draw calls, but read as actual forest masses.
  const forestClusters=[
    {x:minX-115,z:minZ+siteD*.18,rx:115,rz:82},
    {x:minX-130,z:minZ+siteD*.48,rx:125,rz:94},
    {x:minX-110,z:minZ+siteD*.86,rx:108,rz:80},
    {x:maxX+118,z:minZ+siteD*.16,rx:112,rz:82},
    {x:maxX+128,z:minZ+siteD*.46,rx:128,rz:94},
    {x:maxX+112,z:minZ+siteD*.84,rx:115,rz:82},
    {x:minX+siteW*.18,z:maxZ+118,rx:118,rz:84},
    {x:minX+siteW*.48,z:maxZ+135,rx:132,rz:90},
    {x:minX+siteW*.80,z:maxZ+110,rx:112,rz:80},
    {x:minX+siteW*.22,z:minZ-120,rx:118,rz:82},
    {x:minX+siteW*.55,z:minZ-132,rx:132,rz:88},
    {x:minX+siteW*.84,z:minZ-110,rx:110,rz:78}
  ];

  const treeSites=[];
  let treeGuard=0;
  const targetTreeCount=3200;
  while(treeSites.length<targetTreeCount&&treeGuard++<320000){
    const cluster=forestClusters[Math.floor(rnd()*forestClusters.length)];
    const a=rnd()*Math.PI*2;
    const r=Math.pow(rnd(),.62);
    const x=cluster.x+Math.cos(a)*cluster.rx*r+rr(-8,8);
    const z=cluster.z+Math.sin(a)*cluster.rz*r+rr(-8,8);

    if(x<box.minX+10||x>box.maxX-10||z<box.minZ+10||z>box.maxZ-10)continue;
    if(pointInPolygon(x,z,boundary))continue;
    const bd=distanceToBoundary(x,z);
    if(bd<36||bd>415)continue;
    if(inRoadCorridor(x,z,5))continue;
    if(nearHouse(x,z,5)||nearWater(x,z,3))continue;

    treeSites.push({
      x,z,
      scale:rr(.82,1.34),
      rot:rr(-Math.PI,Math.PI),
      kind:rnd()<.18?'pine':'broad',
      shade:Math.floor(rnd()*4),
      lobe:rr(-.7,.7)
    });
  }

  const trunkGeo=new THREE.CylinderGeometry(.18,.30,5.0,6);
  const crownGeo=new THREE.DodecahedronGeometry(1,0);
  const pineGeo=new THREE.ConeGeometry(1,1,8);
  const shrubGeo=new THREE.DodecahedronGeometry(1,0);
  const trunkMat=new THREE.MeshLambertMaterial({color:0x63462f});
  const broadMats=[
    new THREE.MeshLambertMaterial({color:0x356f3c}),
    new THREE.MeshLambertMaterial({color:0x478244}),
    new THREE.MeshLambertMaterial({color:0x5b934d}),
    new THREE.MeshLambertMaterial({color:0x6a9d55})
  ];
  const pineMat=new THREE.MeshLambertMaterial({color:0x2d5b39});
  const shrubMat=new THREE.MeshLambertMaterial({color:0x496f3d});

  const trunkBatch=new THREE.InstancedMesh(trunkGeo,trunkMat,treeSites.length);
  trunkBatch.name='V181_FOREST_TRUNKS';
  const broadUpper=[[],[],[],[]];
  const broadLower=[[],[],[],[]];
  const pineMatrices=[];
  const shrubMatrices=[];
  const treeDummy=new THREE.Object3D();

  treeSites.forEach((t,i)=>{
    const s=t.scale;

    treeDummy.position.set(t.x,2.05*s-.43,t.z);
    treeDummy.rotation.set(0,t.rot,0);
    treeDummy.scale.set(s,s,s);
    treeDummy.updateMatrix();
    trunkBatch.setMatrixAt(i,treeDummy.matrix);

    if(t.kind==='pine'){
      treeDummy.position.set(t.x,6.35*s-.43,t.z);
      treeDummy.rotation.set(0,t.rot,0);
      treeDummy.scale.set(2.2*s,7.0*s,2.2*s);
      treeDummy.updateMatrix();
      pineMatrices.push(treeDummy.matrix.clone());
    }else{
      const ox=Math.cos(t.rot)*t.lobe*s;
      const oz=Math.sin(t.rot)*t.lobe*s;

      treeDummy.position.set(t.x+ox,6.55*s-.43,t.z+oz);
      treeDummy.rotation.set(0,t.rot,0);
      treeDummy.scale.set(3.25*s,2.35*s,3.05*s);
      treeDummy.updateMatrix();
      broadUpper[t.shade].push(treeDummy.matrix.clone());

      treeDummy.position.set(t.x-ox*.70,5.45*s-.43,t.z-oz*.70);
      treeDummy.rotation.set(0,t.rot+.7,0);
      treeDummy.scale.set(2.65*s,1.90*s,2.50*s);
      treeDummy.updateMatrix();
      broadLower[t.shade].push(treeDummy.matrix.clone());
    }

    if((i%5)===0){
      treeDummy.position.set(t.x+rr(-3.0,3.0),.42,t.z+rr(-3.0,3.0));
      treeDummy.rotation.set(0,t.rot,0);
      treeDummy.scale.set(1.25*s,.78*s,1.15*s);
      treeDummy.updateMatrix();
      shrubMatrices.push(treeDummy.matrix.clone());
    }
  });

  trunkBatch.instanceMatrix.needsUpdate=true;
  trunkBatch.computeBoundingSphere();
  trunkBatch.castShadow=false;
  trunkBatch.receiveShadow=false;
  trunkBatch.userData.fpsNonSolid=true;
  forestRoot.add(trunkBatch);

  function addForestBatch(name,geo,mat,matrices){
    if(!matrices.length)return;
    const batch=new THREE.InstancedMesh(geo,mat,matrices.length);
    batch.name=name;
    matrices.forEach((m,i)=>batch.setMatrixAt(i,m));
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingSphere();
    batch.castShadow=false;
    batch.receiveShadow=false;
    batch.userData.fpsNonSolid=true;
    forestRoot.add(batch);
  }

  for(let i=0;i<4;i++){
    addForestBatch('V181_FOREST_UPPER_'+i,crownGeo,broadMats[i],broadUpper[i]);
    addForestBatch('V181_FOREST_LOWER_'+i,crownGeo,broadMats[i],broadLower[i]);
  }
  addForestBatch('V181_FOREST_PINE',pineGeo,pineMat,pineMatrices);
  addForestBatch('V181_FOREST_SHRUBS',shrubGeo,shrubMat,shrubMatrices);

  const deciduous=treeSites.filter(t=>t.kind==='broad');
  const conifers=treeSites.filter(t=>t.kind==='pine');
  const treeAssetMode='v179-dense-clustered-lowpoly-instanced';
  const treeDrawMeshes=forestRoot.children.length;
  const treeChunkCount=forestClusters.length;
  const canopyBlanketPatchCount=0;
  const canopyBlanketChunkCount=0;
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
  root.userData.highwayCount=highwaySpecs.length;
  root.userData.highwaySurfaceCount=highwaySurfaceCount;
  root.userData.highwayMainCount=highwayMainCount;
  root.userData.highwayRampCount=highwayRampCount;
  root.userData.referenceForkBranchCount=3;
  root.userData.referenceForkNode={x:forkNode.x,z:forkNode.z};
  root.userData.referenceForkMode='visible-east-gate-first-endpoint';

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
    ready:true,version:188,group:root,treeAssetMode,forestMode,
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
    highwayCount:highwaySpecs.length,
    highwaySurfaceCount,
    highwayMainCount,
    highwayRampCount,
    referenceForkBranchCount:3,
    referenceForkNode:{x:forkNode.x,z:forkNode.z},
    referenceForkMode:'visible-east-gate-first-endpoint',
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
  window.__DALOC_EXTERIOR_V179=api;
  window.__DALOC_EXTERIOR_V180=api;
  window.__DALOC_EXTERIOR_V181=api;
  window.__DALOC_EXTERIOR_V182=api;
  window.__DALOC_EXTERIOR_V183=api;
  window.__DALOC_EXTERIOR_V184=api;
  window.__DALOC_EXTERIOR_V185=api;
  window.__DALOC_EXTERIOR_V186=api;
  window.__DALOC_EXTERIOR_V187=api;
  window.__DALOC_EXTERIOR_V188=api;

  console.info('[DaLoc] V188 three-branch fork installed at visible east entrance',{
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
    highways:highwaySpecs.length,
    highwayMains:highwayMainCount,
    highwayRamps:highwayRampCount,
    referenceForkBranches:3,
    highwaySurfaces:highwaySurfaceCount,
    doors:doors.length,
    boundaryPoints:boundary.length
  });

  return api;
}
