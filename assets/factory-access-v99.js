import * as THREE from 'three';
import { buildCadCorridorWarpV91 } from './corridor-warp-v91.js?v=91';

// V99 — restore the missing paved links from factory service yards to the
// authoritative internal road network. V76 only cut holes in the green belt;
// where the ground below was grass those openings still looked green.
export async function installFactoryAccessV99({
  world,
  buildings,
  supportGroup,
  mapPx,
  metersPerPixel,
  frameSignature
}){
  if(!world||typeof mapPx!=='function')throw new Error('V99 requires world + mapPx');

  const [circulationResponse,accessResponse,cadResponse]=await Promise.all([
    fetch(new URL('./circulation-v53.json',import.meta.url)),
    fetch(new URL('./cad-access-v75.json',import.meta.url)),
    fetch(new URL('./cad-source-v72.json',import.meta.url))
  ]);
  if(!circulationResponse.ok)throw new Error('V99 circulation HTTP '+circulationResponse.status);
  if(!accessResponse.ok)throw new Error('V99 CAD access HTTP '+accessResponse.status);
  if(!cadResponse.ok)throw new Error('V99 CAD source HTTP '+cadResponse.status);

  const circulation=await circulationResponse.json();
  const accessData=await accessResponse.json();
  const cad=await cadResponse.json();
  if(circulation.frameSignature!==frameSignature||cad.frameSignature!==frameSignature){
    throw new Error('V99 coordinate frame mismatch');
  }

  const S=metersPerPixel;
  const warp=buildCadCorridorWarpV91({circulation,cad});
  const root=new THREE.Group();
  root.name='FACTORY_ACCESS_V99';
  root.userData={
    version:99,
    source2D:'masterplan-hires.jpg',
    cadAccessSource:accessData.source,
    purpose:'paved factory-to-road access'
  };
  world.add(root);

  const asphaltMat=new THREE.MeshStandardMaterial({
    color:0x737877,
    roughness:.97,
    polygonOffset:true,
    polygonOffsetFactor:-3,
    polygonOffsetUnits:-3
  });
  const apronMat=new THREE.MeshStandardMaterial({
    color:0x858a87,
    roughness:.96,
    polygonOffset:true,
    polygonOffsetFactor:-3,
    polygonOffsetUnits:-3
  });
  const edgeMat=new THREE.MeshStandardMaterial({
    color:0xc8cbc4,
    roughness:.98,
    polygonOffset:true,
    polygonOffsetFactor:-2,
    polygonOffsetUnits:-2
  });

  function shapeFromPx(points,material,y=.30,name='V99_ACCESS_PAD'){
    const pts=points.map(([x,py])=>{
      const p=mapPx(x,py);
      return new THREE.Vector2(p.x,-p.z);
    });
    if(THREE.ShapeUtils.isClockWise(pts))pts.reverse();
    const shape=new THREE.Shape(pts);
    const geo=new THREE.ShapeGeometry(shape);
    const mesh=new THREE.Mesh(geo,material);
    mesh.rotation.x=-Math.PI/2;
    mesh.position.y=y;
    mesh.receiveShadow=true;
    mesh.name=name;
    root.add(mesh);
    return mesh;
  }

  // Exact CAD openings plus a slightly deeper paved apron.
  // The deeper apron is what visually closes the grass gap between lot and road.
  const accessCorridors=[];
  (accessData.accesses||[]).forEach((a,i)=>{
    shapeFromPx(a.polygonPx,asphaltMat,.315,'V99_CAD_ACCESS_'+String(i).padStart(2,'0'));

    const [cx,cy]=a.centerPx;
    let [ax,ay]=a.along;
    const al=Math.hypot(ax,ay)||1;ax/=al;ay/=al;
    const nx=-ay,ny=ax;
    const halfW=Math.max(5.0,a.openingWidthPx*.5);
    const halfD=Math.max(17.0,a.crossDepthPx*.5+5.0);
    const poly=[
      [cx-ax*halfW-nx*halfD,cy-ay*halfW-ny*halfD],
      [cx+ax*halfW-nx*halfD,cy+ay*halfW-ny*halfD],
      [cx+ax*halfW+nx*halfD,cy+ay*halfW+ny*halfD],
      [cx-ax*halfW+nx*halfD,cy-ay*halfW+ny*halfD]
    ];
    shapeFromPx(poly,apronMat,.304,'V99_CAD_ACCESS_EXT_'+String(i).padStart(2,'0'));

    const wc=mapPx(cx,cy);
    const wa=mapPx(cx+ax,cy+ay);
    let ux=wa.x-wc.x,uz=wa.z-wc.z;
    const ul=Math.hypot(ux,uz)||1;ux/=ul;uz/=ul;
    accessCorridors.push({
      cx:wc.x,cz:wc.z,
      ux,uz,nx:-uz,nz:ux,
      halfLen:halfW*S+1.2,
      halfW:halfD*S+1.2
    });
  });

  function nearestOnSegment(px,pz,a,b){
    const vx=b.x-a.x,vz=b.z-a.z,wx=px-a.x,wz=pz-a.z,vv=vx*vx+vz*vz;
    const t=vv?Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)):0;
    return {x:a.x+t*vx,z:a.z+t*vz,t,d:Math.hypot(px-(a.x+t*vx),pz-(a.z+t*vz))};
  }

  // Build the same road centerline geometry that V53 uses after CAD registration.
  const roadSegments=[];
  for(const [pathIndex,path] of (circulation.paths||[]).entries()){
    const pts=(path.pointsPx||[]).map(([x,y])=>{
      const q=warp.warpPx(x,y),p=mapPx(q.x,q.y);
      return {x:p.x,z:p.z,px:q.x,py:q.y};
    });
    const widthM=Math.max(5,path.widthPx*S);
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i];
      if(Math.hypot(b.x-a.x,b.z-a.z)<.1)continue;
      roadSegments.push({a,b,widthM,pathIndex,segIndex:i-1});
    }
  }

  function bodyInfo(g){
    let best=null,bestArea=-1;
    for(const o of g?.children||[]){
      if(o.geometry?.type!=='BoxGeometry')continue;
      const p=o.geometry.parameters;
      if(!p||p.height<4)continue;
      const area=p.width*p.depth;
      if(area>bestArea){best=o;bestArea=area;}
    }
    if(!best)return null;
    const p=best.geometry.parameters;
    return {body:best,L:p.width,D:p.depth,H:p.height};
  }

  const infos=(buildings||[]).map((g,i)=>{
    const bi=bodyInfo(g);
    if(!bi)return null;
    g.updateWorldMatrix(true,true);
    return {i,g,...bi};
  });

  function worldAnchor(info,x,z){
    return info.g.localToWorld(new THREE.Vector3(x,.30,z));
  }

  function pointInsideOtherBuilding(x,z,selfIndex,pad=1.6){
    const w=new THREE.Vector3(x,.4,z);
    for(const info of infos){
      if(!info||info.i===selfIndex)continue;
      const q=info.g.worldToLocal(w.clone());
      if(Math.abs(q.x)<=info.L/2+pad&&Math.abs(q.z)<=info.D/2+pad)return true;
    }
    for(const g of supportGroup?.children||[]){
      const fp=g.userData?.footprintPx;
      if(!fp)continue;
      const q=g.worldToLocal(w.clone());
      if(Math.abs(q.x)<=fp.L*S/2+pad&&Math.abs(q.z)<=fp.D*S/2+pad)return true;
    }
    return false;
  }

  function segmentClear(start,end,selfIndex,width){
    const dx=end.x-start.x,dz=end.z-start.z,len=Math.hypot(dx,dz);
    if(len<1)return true;
    const steps=Math.max(2,Math.ceil(len/3));
    for(let i=1;i<steps;i++){
      const t=i/steps;
      // Skip a few metres at both ends: one end intentionally overlaps the yard,
      // the other intentionally overlaps the road.
      if(t*len<3||(1-t)*len<3)continue;
      const x=start.x+dx*t,z=start.z+dz*t;
      if(pointInsideOtherBuilding(x,z,selfIndex,width*.42))return false;
    }
    return true;
  }

  function makeDriveway(start,end,width,index){
    const dx=end.x-start.x,dz=end.z-start.z,len=Math.hypot(dx,dz);
    if(len<1.25)return null;
    const rot=Math.atan2(dx,dz);
    const g=new THREE.Group();
    g.name='V99_FACTORY_DRIVEWAY_'+String(index).padStart(2,'0');

    // pale concrete shoulder, then road surface slightly above it
    const shoulder=new THREE.Mesh(new THREE.BoxGeometry(width+1.0,.08,len+2.2),edgeMat);
    shoulder.position.y=.265;
    shoulder.rotation.y=rot;
    shoulder.position.x=(start.x+end.x)/2;
    shoulder.position.z=(start.z+end.z)/2;
    shoulder.receiveShadow=true;

    const road=new THREE.Mesh(new THREE.BoxGeometry(width,.10,len+2.5),asphaltMat);
    road.position.y=.325;
    road.rotation.y=rot;
    road.position.x=(start.x+end.x)/2;
    road.position.z=(start.z+end.z)/2;
    road.receiveShadow=true;
    road.userData={factoryIndex:index,walkable:true,driveable:true};

    root.add(shoulder,road);

    // Short wider apron at factory side so the connector visibly meets the
    // existing parking/service slab instead of ending as a thin strip.
    const apron=new THREE.Mesh(new THREE.BoxGeometry(width*1.32,.09,3.8),apronMat);
    apron.position.set(start.x,.32,start.z);
    apron.rotation.y=rot;
    apron.receiveShadow=true;
    root.add(apron);

    return {road,shoulder,apron,len,rot};
  }

  const drivewayCorridors=[];
  const driveways=[];
  const skipped=[];

  for(const info of infos){
    if(!info)continue;
    const {i,L,D}=info;
    const yardDepth=Math.max(10,Math.min(20,D*.42));

    // Prefer the service-yard side, but keep the rear pedestrian/service side
    // as a fallback where the road lies on the opposite side of the factory.
    const anchorDefs=[];
    for(const xf of [-.34,0,.34]){
      anchorDefs.push({
        side:'service',
        localX:L*xf,
        p:worldAnchor(info,L*xf,D/2+yardDepth+1.8),
        penalty:0
      });
      anchorDefs.push({
        side:'rear',
        localX:L*xf,
        p:worldAnchor(info,L*xf,-D/2-2.5),
        penalty:4.5
      });
    }

    const candidates=[];
    for(const a of anchorDefs){
      for(const seg of roadSegments){
        const n=nearestOnSegment(a.p.x,a.p.z,seg.a,seg.b);
        const vx=n.x-a.p.x,vz=n.z-a.p.z,centerDist=Math.hypot(vx,vz);
        if(centerDist<.5)continue;
        const ux=vx/centerDist,uz=vz/centerDist;
        const roadHalf=seg.widthM*.5;
        const edgeInset=Math.max(0,roadHalf-.55);
        const end={
          x:n.x-ux*edgeInset,
          z:n.z-uz*edgeInset
        };
        const gap=Math.hypot(end.x-a.p.x,end.z-a.p.z);
        if(gap<.8||gap>190)continue;
        candidates.push({
          start:{x:a.p.x,z:a.p.z},
          end,
          gap,
          score:gap+a.penalty,
          side:a.side,
          localX:a.localX,
          pathIndex:seg.pathIndex,
          segIndex:seg.segIndex
        });
      }
    }
    candidates.sort((a,b)=>a.score-b.score);

    const width=Math.max(6.0,Math.min(8.2,D*.18));
    let chosen=null;
    for(const c of candidates){
      if(segmentClear(c.start,c.end,i,width)){chosen=c;break;}
    }
    if(!chosen&&candidates.length)chosen=candidates[0];
    if(!chosen){
      skipped.push(i);
      continue;
    }

    const made=makeDriveway(chosen.start,chosen.end,width,i);
    if(!made){
      skipped.push(i);
      continue;
    }
    const cx=(chosen.start.x+chosen.end.x)/2,cz=(chosen.start.z+chosen.end.z)/2;
    const dx=chosen.end.x-chosen.start.x,dz=chosen.end.z-chosen.start.z;
    const len=Math.hypot(dx,dz),ux=dx/(len||1),uz=dz/(len||1);
    drivewayCorridors.push({
      cx,cz,ux,uz,nx:-uz,nz:ux,
      halfLen:len/2+2.0,
      halfW:width/2+1.15
    });
    const routeId=circulation.paths?.[chosen.pathIndex]?.id||null;
    let dockWallWorld=null;
    let outwardWorld=null;
    if(chosen.side==='service'){
      const wall=worldAnchor(info,chosen.localX,D/2+.55);
      const outside=worldAnchor(info,chosen.localX,D/2+10.55);
      const ox=outside.x-wall.x,oz=outside.z-wall.z,ol=Math.hypot(ox,oz)||1;
      dockWallWorld={x:wall.x,z:wall.z};
      outwardWorld={x:ox/ol,z:oz/ol};
    }
    driveways.push({
      factoryIndex:i,
      side:chosen.side,
      routeId,
      pathIndex:chosen.pathIndex,
      segIndex:chosen.segIndex,
      localX:chosen.localX,
      lengthM:Number(made.len.toFixed(2)),
      widthM:Number(width.toFixed(2)),
      roadEdgeWorld:{x:chosen.end.x,z:chosen.end.z},
      yardWorld:{x:chosen.start.x,z:chosen.start.z},
      dockWallWorld,
      outwardWorld
    });
  }

  function insideRectCorridor(x,z,c,pad=0){
    const dx=x-c.cx,dz=z-c.cz;
    return Math.abs(dx*c.ux+dz*c.uz)<=c.halfLen+pad&&
           Math.abs(dx*c.nx+dz*c.nz)<=c.halfW+pad;
  }
  function inAnyAccess(x,z,pad=0){
    return accessCorridors.some(c=>insideRectCorridor(x,z,c,pad))||
           drivewayCorridors.some(c=>insideRectCorridor(x,z,c,pad));
  }

  // V139.3: expose the exact same authored access corridors to FPS collision.
  // These are already the source used to clear vegetation/props from real
  // factory approaches, so FPS and visible access geometry now share one truth.
  const fpsAccessCorridors=[
    ...accessCorridors.map((c,i)=>({...c,type:'cad-access',index:i})),
    ...drivewayCorridors.map((c,i)=>({...c,type:'factory-driveway',index:i}))
  ];

  function fpsAccessSafeInfo(x,z,pad=.35){
    let best=null;
    for(const c of fpsAccessCorridors){
      const dx=x-c.cx,dz=z-c.cz;
      const along=dx*c.ux+dz*c.uz;
      const across=dx*c.nx+dz*c.nz;
      const alongOver=Math.max(0,Math.abs(along)-(c.halfLen+pad));
      const acrossOver=Math.max(0,Math.abs(across)-(c.halfW+pad));
      if(alongOver>0||acrossOver>0)continue;
      const centerDistance=Math.abs(across);
      if(!best||centerDistance<best.centerDistance){
        best={
          type:c.type,
          index:c.index,
          centerDistance,
          halfWidth:c.halfW,
          halfLength:c.halfLen
        };
      }
    }
    return best;
  }

  function isInFpsSafeAccess(x,z,pad=.35){
    return !!fpsAccessSafeInfo(x,z,pad);
  }

  // Vegetation and small roadside props must not survive on the newly paved links.
  let hiddenTrees=0,hiddenSemantic=0,clearedInstances=0;
  const tmp=new THREE.Vector3();
  world.traverse(o=>{
    if(o.userData?.isTreeGroup){
      o.getWorldPosition(tmp);
      if(inAnyAccess(tmp.x,tmp.z,1.0)){
        o.userData.hiddenByFactoryAccessV99=true;
        o.visible=false;
        hiddenTrees++;
      }
      return;
    }
    let p=o.parent,semantic=false;
    while(p){if(p.name==='semantic2D3D'){semantic=true;break;}p=p.parent;}
    if(semantic&&o.isMesh&&o.geometry?.type==='IcosahedronGeometry'){
      o.getWorldPosition(tmp);
      if(inAnyAccess(tmp.x,tmp.z,.7)){
        o.userData.hiddenByFactoryAccessV99=true;
        o.visible=false;
        hiddenSemantic++;
      }
    }
  });

  const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
  const zero=new THREE.Matrix4().makeScale(0,0,0);
  world.traverse(o=>{
    if(!o.isInstancedMesh)return;
    let p=o.parent,eligible=false;
    while(p){
      if(
        p.name==='CIRCULATION_V53'||
        p.name==='V54_ROAD_FURNITURE'||
        p.name==='LANDSCAPE_V95'||
        p.name==='V95_DENSE_PARKS'||
        p.name==='V95_POND_LANDSCAPE'
      ){eligible=true;break;}
      p=p.parent;
    }
    if(!eligible)return;

    o.updateWorldMatrix(true,false);
    let touched=false;
    for(let i=0;i<o.count;i++){
      o.getMatrixAt(i,matrix);
      matrix.decompose(pos,quat,scale);
      if(scale.lengthSq()<1e-8)continue;
      pos.applyMatrix4(o.matrixWorld);
      if(!inAnyAccess(pos.x,pos.z,.65))continue;
      o.setMatrixAt(i,zero);
      clearedInstances++;
      touched=true;
    }
    if(touched){
      o.instanceMatrix.needsUpdate=true;
      o.computeBoundingSphere();
      o.userData.clearedByFactoryAccessV99=true;
    }
  });

  const result={
    ready:true,
    version:139.3,
    group:root,
    cadAccessPads:(accessData.accesses||[]).length,
    drivewayCount:driveways.length,
    driveways,
    skippedFactories:skipped,
    hiddenTrees,
    hiddenSemantic,
    clearedInstances,
    fpsAccessCorridors,
    fpsAccessSafeInfo,
    isInFpsSafeAccess,
    setVisible(v){root.visible=!!v;}
  };
  window.__DALOC_FACTORY_ACCESS_V99=result;
  console.info('[DaLoc] V139.3 factory access roads + FPS safe corridors installed',result);
  return result;
}
