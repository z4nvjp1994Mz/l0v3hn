import * as THREE from 'three';
import { buildCadCorridorWarpV91 } from './corridor-warp-v91.js?v=91';

// V100 mixed traffic + factory logistics.
// Existing road traffic is preserved, while cargo/container trucks can leave the
// main road, enter a factory service yard, reverse to a loading dock, wait for
// loading, then return to the road and continue their route.
export async function installTrafficAIV91({world,mapPx,frameSignature,factoryAccess=null}){
  const [response,cadResponse]=await Promise.all([
    fetch(new URL('./circulation-v53.json',import.meta.url)),
    fetch(new URL('./cad-source-v72.json',import.meta.url))
  ]);
  if(!response.ok)throw new Error('V91 traffic routes HTTP '+response.status);
  if(!cadResponse.ok)throw new Error('V91 CAD routes HTTP '+cadResponse.status);
  const data=await response.json();
  const cadData=await cadResponse.json();
  if(data.frameSignature!==frameSignature||cadData.frameSignature!==frameSignature)throw new Error('V91 traffic coordinate frame mismatch');
  const corridorWarpV91=buildCadCorridorWarpV91({circulation:data,cad:cadData});

  const root=new THREE.Group();
  root.name='AI_TRAFFIC_V100';
  root.userData={
    version:100,
    cars:4,cargoTrucks:10,containerTrucks:6,motorcycles:24,supercars:6,
    factoryLogistics:true
  };
  world.add(root);

  const routeIds=new Set(['central-spine','north-cross','south-cross']);
  const routes=(data.paths||[]).filter(p=>routeIds.has(p.id)).map(path=>{
    const pts=path.pointsPx.map(([x,y])=>{
      const q=corridorWarpV91.warpPx(x,y);
      const p=mapPx(q.x,q.y);
      return new THREE.Vector3(p.x,.42,p.z);
    });
    const cumulative=[0];
    let total=0;
    for(let i=1;i<pts.length;i++){
      total+=pts[i].distanceTo(pts[i-1]);
      cumulative.push(total);
    }
    return {id:path.id,points:pts,cumulative,total};
  });
  if(!routes.length)throw new Error('V91 traffic routes missing');

  // V91: derive real conflict points from the three source-locked route polylines.
  // Vehicles from different routes now share an exclusive reservation for each junction,
  // so trucks/cars cannot physically occupy the same crossing at the same time.
  function segmentIntersectionXZ(a,b,c,d){
    const rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z;
    const den=rx*sz-rz*sx;
    if(Math.abs(den)<1e-8)return null;
    const qx=c.x-a.x,qz=c.z-a.z;
    const ta=(qx*sz-qz*sx)/den;
    const tb=(qx*rz-qz*rx)/den;
    if(ta<0||ta>1||tb<0||tb>1)return null;
    return {ta,tb,x:a.x+ta*rx,z:a.z+ta*rz};
  }

  const junctions=[];
  for(let i=0;i<routes.length;i++){
    for(let j=i+1;j<routes.length;j++){
      const ra=routes[i],rb=routes[j];
      for(let ai=1;ai<ra.points.length;ai++){
        for(let bi=1;bi<rb.points.length;bi++){
          const hit=segmentIntersectionXZ(ra.points[ai-1],ra.points[ai],rb.points[bi-1],rb.points[bi]);
          if(!hit)continue;
          const p=new THREE.Vector3(hit.x,.42,hit.z);
          if(junctions.some(q=>q.point.distanceTo(p)<2.0))continue;
          const aSeg=ra.points[ai].distanceTo(ra.points[ai-1]);
          const bSeg=rb.points[bi].distanceTo(rb.points[bi-1]);
          junctions.push({
            id:'J'+junctions.length,
            point:p,
            routeS:{
              [ra.id]:ra.cumulative[ai-1]+aSeg*hit.ta,
              [rb.id]:rb.cumulative[bi-1]+bSeg*hit.tb
            },
            routes:[ra.id,rb.id],
            owner:null
          });
        }
      }
    }
  }

  function junctionPolicy(agent){
    if(agent.type==='container')return {lookahead:44,claim:19,stopGap:14,release:18};
    if(agent.type==='cargo')return {lookahead:36,claim:16,stopGap:11,release:15};
    if(agent.type==='supercar')return {lookahead:30,claim:13,stopGap:9,release:12};
    if(agent.type==='motorcycle')return {lookahead:19,claim:8,stopGap:5,release:8};
    return {lookahead:28,claim:12,stopGap:8,release:11};
  }

  function sampleRoute(route,s){
    s=THREE.MathUtils.clamp(s,0,route.total);
    let lo=0,hi=route.cumulative.length-1;
    while(lo<hi-1){
      const mid=(lo+hi)>>1;
      if(route.cumulative[mid]<=s)lo=mid;else hi=mid;
    }
    const bi=Math.min(lo+1,route.points.length-1);
    const a=route.points[lo],b=route.points[bi];
    const seg=Math.max(.0001,route.cumulative[bi]-route.cumulative[lo]);
    const t=THREE.MathUtils.clamp((s-route.cumulative[lo])/seg,0,1);
    return {pos:a.clone().lerp(b,t),tangent:b.clone().sub(a).normalize()};
  }

  function projectRouteS(route,point){
    let best={d:Infinity,s:0,point:route.points[0].clone(),tangent:new THREE.Vector3(0,0,1)};
    for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i];
      const vx=b.x-a.x,vz=b.z-a.z,wx=point.x-a.x,wz=point.z-a.z;
      const vv=vx*vx+vz*vz;
      const t=vv?THREE.MathUtils.clamp((wx*vx+wz*vz)/vv,0,1):0;
      const x=a.x+vx*t,z=a.z+vz*t;
      const d=Math.hypot(point.x-x,point.z-z);
      if(d<best.d){
        const segLen=Math.sqrt(vv);
        best={
          d,
          s:route.cumulative[i-1]+segLen*t,
          point:new THREE.Vector3(x,.42,z),
          tangent:new THREE.Vector3(vx,0,vz).normalize()
        };
      }
    }
    return best;
  }

  function makePolyline(points){
    const clean=[];
    for(const p of points){
      const q=p.clone();q.y=.42;
      if(!clean.length||clean.at(-1).distanceTo(q)>.35)clean.push(q);
    }
    if(clean.length<2)clean.push(clean[0].clone().add(new THREE.Vector3(0,0,.5)));
    const cumulative=[0];
    let total=0;
    for(let i=1;i<clean.length;i++){
      total+=clean[i].distanceTo(clean[i-1]);
      cumulative.push(total);
    }
    return {points:clean,cumulative,total};
  }

  function samplePolyline(path,s){
    s=THREE.MathUtils.clamp(s,0,path.total);
    let lo=0,hi=path.cumulative.length-1;
    while(lo<hi-1){
      const mid=(lo+hi)>>1;
      if(path.cumulative[mid]<=s)lo=mid;else hi=mid;
    }
    const bi=Math.min(lo+1,path.points.length-1);
    const a=path.points[lo],b=path.points[bi];
    const seg=Math.max(.0001,path.cumulative[bi]-path.cumulative[lo]);
    const t=THREE.MathUtils.clamp((s-path.cumulative[lo])/seg,0,1);
    return {pos:a.clone().lerp(b,t),tangent:b.clone().sub(a).normalize()};
  }

  const tireMat=new THREE.MeshStandardMaterial({color:0x202322,roughness:.90});
  const chassisMat=new THREE.MeshStandardMaterial({color:0x383d3b,roughness:.72,metalness:.18});
  const glassMat=new THREE.MeshStandardMaterial({color:0x6f8995,roughness:.12,metalness:.18});
  const lightMat=new THREE.MeshStandardMaterial({color:0xf4edc9,roughness:.32,emissive:0x5b542a,emissiveIntensity:.35});
  const rearMat=new THREE.MeshStandardMaterial({color:0xa52e2c,roughness:.4,emissive:0x5a1110,emissiveIntensity:.22});

  const carMats=[
    0xe9ecef,0x315f8c,0xb84a43,0xd1b44b
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.10}));
  const truckCabMats=[
    0xf1f2ef,0x2f628c,0xb64e42,0x4e755c,0xe0b84d
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.08}));
  const cargoBoxMats=[
    0xd9ddd9,0xc8d4db,0xe2ded3,0xbfc9c1
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.72}));
  const containerMats=[
    0xb84d3e,0x315f7e,0x4d7355,0xb78638,0x71777a,0x7a4b3b
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.74}));
  const superMats=[
    0xe53935,0x111111,0xf4c430,0x1565c0,0xffffff,0xff6f00
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.28,metalness:.22}));
  const bikeMats=[
    0x232323,0xc62828,0x1565c0,0xeeeeee,0xffb300,0x2e7d32
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.12}));
  const riderSkinMat=new THREE.MeshStandardMaterial({color:0xd9a07a,roughness:.78});
  const riderPantsMat=new THREE.MeshStandardMaterial({color:0x28323a,roughness:.82});
  const riderShirtMats=[
    0x24435a,0x5a6570,0x364f3d,0x7d4b3f,0x4f536d,0x3b3b3b
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.78}));
  const helmetMats=[
    0x1f1f1f,0xf1f1ed,0xb83232,0x2f628c,0xd6a42d
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.12}));

  function addWheel(group,x,z,r=.34,w=.22){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(r,r,w,12),tireMat);
    wheel.rotation.z=Math.PI/2;
    wheel.position.set(x,r,z);
    group.add(wheel);
  }
  function addLights(group,width,frontZ,rearZ,y){
    for(const sx of [-width*.28,width*.28]){
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.32,.18,.08),lightMat);
      lamp.position.set(sx,y,frontZ);group.add(lamp);
      const rear=new THREE.Mesh(new THREE.BoxGeometry(.32,.18,.08),rearMat);
      rear.position.set(sx,y,rearZ);group.add(rear);
    }
  }

  function buildCar(index){
    const g=new THREE.Group(),mat=carMats[index%carMats.length];
    g.name='V91_CAR_'+index;
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.82,.58,4.25),mat);
    body.position.y=.55;g.add(body);
    const hood=new THREE.Mesh(new THREE.BoxGeometry(1.74,.34,1.10),mat);
    hood.position.set(0,.78,1.35);g.add(hood);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.55,.72,1.90),glassMat);
    cabin.position.set(0,1.05,-.20);g.add(cabin);
    for(const sx of [-.98,.98])for(const sz of [-1.30,1.28])addWheel(g,sx,sz,.34,.22);
    addLights(g,1.82,2.16,-2.16,.66);
    return g;
  }

  function buildCargoTruck(index){
    const g=new THREE.Group(),cabMat=truckCabMats[index%truckCabMats.length],boxMat=cargoBoxMats[index%cargoBoxMats.length];
    g.name='V91_CARGO_TRUCK_'+index;
    const chassis=new THREE.Mesh(new THREE.BoxGeometry(2.18,.26,7.75),chassisMat);chassis.position.y=.58;g.add(chassis);
    const cargo=new THREE.Mesh(new THREE.BoxGeometry(2.26,2.55,4.85),boxMat);cargo.position.set(0,1.88,-1.05);g.add(cargo);
    const cab=new THREE.Mesh(new THREE.BoxGeometry(2.18,2.15,2.35),cabMat);cab.position.set(0,1.58,2.35);g.add(cab);
    const windshield=new THREE.Mesh(new THREE.BoxGeometry(1.72,.76,.08),glassMat);windshield.position.set(0,1.94,3.56);g.add(windshield);
    for(const sx of [-1.20,1.20]){
      addWheel(g,sx,2.20,.43,.28);addWheel(g,sx,-.75,.43,.28);addWheel(g,sx,-2.48,.43,.28);
    }
    addLights(g,2.18,3.64,-3.93,1.02);
    return g;
  }

  function buildContainerTruck(index){
    const g=new THREE.Group(),cabMat=truckCabMats[(index+2)%truckCabMats.length],contMat=containerMats[index%containerMats.length];
    g.name='V91_CONTAINER_TRUCK_'+index;
    const chassis=new THREE.Mesh(new THREE.BoxGeometry(2.32,.28,13.5),chassisMat);chassis.position.y=.58;g.add(chassis);
    const container=new THREE.Mesh(new THREE.BoxGeometry(2.46,2.65,7.55),contMat);container.position.set(0,2.02,-2.65);g.add(container);
    const cab=new THREE.Mesh(new THREE.BoxGeometry(2.24,2.35,2.65),cabMat);cab.position.set(0,1.65,4.72);g.add(cab);
    const windshield=new THREE.Mesh(new THREE.BoxGeometry(1.78,.82,.08),glassMat);windshield.position.set(0,2.04,6.08);g.add(windshield);
    for(const sx of [-1.22,1.22]){
      addWheel(g,sx,4.68,.46,.30);addWheel(g,sx,1.40,.46,.30);addWheel(g,sx,-4.65,.46,.30);addWheel(g,sx,-5.82,.46,.30);
    }
    addLights(g,2.24,6.13,-6.70,1.10);
    return g;
  }

  function buildMotorcycle(index){
    const g=new THREE.Group(),mat=bikeMats[index%bikeMats.length];
    g.name='V91_MOTORCYCLE_'+index;
    const frame=new THREE.Mesh(new THREE.BoxGeometry(.42,.34,1.35),mat);frame.position.y=.62;g.add(frame);
    const seat=new THREE.Mesh(new THREE.BoxGeometry(.38,.16,.62),new THREE.MeshStandardMaterial({color:0x2a2a2a,roughness:.8}));
    seat.position.set(0,.88,-.18);g.add(seat);
    const tank=new THREE.Mesh(new THREE.SphereGeometry(.28,10,7),mat);tank.scale.set(1,.7,1.15);tank.position.set(0,.90,.30);g.add(tank);
    for(const z of [-.70,.72]){
      const w=new THREE.Mesh(new THREE.TorusGeometry(.30,.08,6,12),tireMat);
      w.rotation.y=Math.PI/2;w.position.set(0,.34,z);g.add(w);
    }
    const fork=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.75,6),chassisMat);
    fork.rotation.x=.16;fork.position.set(0,.63,.58);g.add(fork);
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.78,.05,.05),chassisMat);
    handle.position.set(0,1.18,.56);g.add(handle);

    // Seated 3D rider: torso, head/helmet, arms on handlebars and legs on the bike.
    const rider=new THREE.Group();
    rider.name='V91_RIDER_'+index;
    rider.rotation.x=-.08;

    const torso=new THREE.Mesh(new THREE.BoxGeometry(.50,.68,.34),riderShirtMats[index%riderShirtMats.length]);
    torso.position.set(0,1.47,-.08);
    torso.rotation.x=-.18;
    rider.add(torso);

    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.075,.085,.13,8),riderSkinMat);
    neck.position.set(0,1.84,-.02);rider.add(neck);

    const head=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),riderSkinMat);
    head.position.set(0,2.03,.02);rider.add(head);

    const helmet=new THREE.Mesh(new THREE.SphereGeometry(.245,10,8),helmetMats[index%helmetMats.length]);
    helmet.scale.set(1,0.72,1);
    helmet.position.set(0,2.11,.005);
    rider.add(helmet);

    for(const sx of [-1,1]){
      const upperArm=new THREE.Mesh(new THREE.CylinderGeometry(.055,.065,.60,7),riderSkinMat);
      upperArm.position.set(.19*sx,1.52,.23);
      upperArm.rotation.x=-.88;
      upperArm.rotation.z=.18*sx;
      rider.add(upperArm);

      const forearm=new THREE.Mesh(new THREE.CylinderGeometry(.05,.055,.50,7),riderSkinMat);
      forearm.position.set(.29*sx,1.30,.48);
      forearm.rotation.x=-1.05;
      forearm.rotation.z=.10*sx;
      rider.add(forearm);

      const thigh=new THREE.Mesh(new THREE.CylinderGeometry(.075,.085,.66,7),riderPantsMat);
      thigh.position.set(.17*sx,1.12,-.12);
      thigh.rotation.x=.62;
      thigh.rotation.z=.05*sx;
      rider.add(thigh);

      const shin=new THREE.Mesh(new THREE.CylinderGeometry(.06,.07,.62,7),riderPantsMat);
      shin.position.set(.20*sx,.78,.08);
      shin.rotation.x=-.46;
      shin.rotation.z=.04*sx;
      rider.add(shin);
    }
    g.add(rider);
    return g;
  }

  function buildSupercar(index){
    const g=new THREE.Group(),mat=superMats[index%superMats.length];
    g.name='V91_SUPERCAR_'+index;
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.98,.42,4.55),mat);
    body.position.y=.46;g.add(body);
    const nose=new THREE.Mesh(new THREE.BoxGeometry(1.88,.24,1.28),mat);
    nose.position.set(0,.57,1.55);g.add(nose);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.45,.55,1.75),glassMat);
    cabin.position.set(0,.86,-.25);g.add(cabin);
    const rearDeck=new THREE.Mesh(new THREE.BoxGeometry(1.82,.18,.85),mat);
    rearDeck.position.set(0,.64,-1.62);g.add(rearDeck);
    const spoiler=new THREE.Mesh(new THREE.BoxGeometry(1.62,.07,.28),chassisMat);
    spoiler.position.set(0,.98,-2.02);g.add(spoiler);
    for(const sx of [-1.02,1.02])for(const sz of [-1.38,1.38])addWheel(g,sx,sz,.36,.24);
    addLights(g,1.98,2.32,-2.32,.60);
    return g;
  }

  const configs=[
    // Existing 4 cars
    {type:'car',route:'central-spine',progress:.10,dir:1,speed:7.3,lane:2.65},
    {type:'car',route:'central-spine',progress:.58,dir:-1,speed:6.8,lane:2.65},
    {type:'car',route:'north-cross',progress:.18,dir:1,speed:6.4,lane:2.25},
    {type:'car',route:'south-cross',progress:.76,dir:-1,speed:6.1,lane:2.30},

    // Existing 10 cargo trucks
    {type:'cargo',route:'central-spine',progress:.18,dir:1,speed:5.0,lane:2.75},
    {type:'cargo',route:'central-spine',progress:.32,dir:-1,speed:4.7,lane:2.75},
    {type:'cargo',route:'central-spine',progress:.68,dir:1,speed:4.9,lane:2.75},
    {type:'cargo',route:'central-spine',progress:.84,dir:-1,speed:4.5,lane:2.75},
    {type:'cargo',route:'north-cross',progress:.12,dir:-1,speed:4.6,lane:2.35},
    {type:'cargo',route:'north-cross',progress:.39,dir:1,speed:4.8,lane:2.35},
    {type:'cargo',route:'north-cross',progress:.64,dir:-1,speed:4.5,lane:2.35},
    {type:'cargo',route:'north-cross',progress:.88,dir:1,speed:4.7,lane:2.35},
    {type:'cargo',route:'south-cross',progress:.27,dir:1,speed:4.3,lane:2.35},
    {type:'cargo',route:'south-cross',progress:.59,dir:-1,speed:4.2,lane:2.35},

    // Existing 6 container trucks
    {type:'container',route:'central-spine',progress:.25,dir:-1,speed:4.0,lane:2.90},
    {type:'container',route:'central-spine',progress:.44,dir:1,speed:4.2,lane:2.90},
    {type:'container',route:'central-spine',progress:.74,dir:-1,speed:3.9,lane:2.90},
    {type:'container',route:'central-spine',progress:.93,dir:1,speed:4.1,lane:2.90},
    {type:'container',route:'north-cross',progress:.27,dir:-1,speed:3.8,lane:2.48},
    {type:'container',route:'north-cross',progress:.76,dir:1,speed:4.0,lane:2.48}
  ];

  // 24 motorcycles: golden-ratio progress spacing + multiple micro-lanes.
  // They no longer form a rigid single-file queue.
  const motorcycleRoutes=['central-spine','north-cross','south-cross'];
  const microLaneOffsets=[-.62,-.28,.12,.46,.76];
  for(let i=0;i<24;i++){
    const route=motorcycleRoutes[i%3];
    const baseLane=route==='central-spine'?1.70:1.55;
    configs.push({
      type:'motorcycle',
      route,
      progress:.035+((i*.61803398875)%1)*.90,
      dir:i%2===0?1:-1,
      speed:6.7+(i%7)*.31,
      lane:baseLane+microLaneOffsets[i%microLaneOffsets.length],
      weaveAmp:.10+(i%4)*.055,
      weaveSpeed:.46+(i%5)*.07,
      weavePhase:(i*.91)%(Math.PI*2)
    });
  }

  // 6 supercars - faster but still traffic-aware.
  [
    ['central-spine',.14,1,9.3,2.35],
    ['central-spine',.47,-1,8.9,2.35],
    ['central-spine',.82,1,9.6,2.35],
    ['north-cross',.23,-1,8.7,2.05],
    ['north-cross',.61,1,9.1,2.05],
    ['south-cross',.43,-1,8.5,2.05]
  ].forEach(([route,progress,dir,speed,lane])=>configs.push({type:'supercar',route,progress,dir,speed,lane}));

  const specs={
    car:{length:4.25,minGap:5.0,sense:25,response:3.25},
    cargo:{length:7.75,minGap:8.0,sense:36,response:2.15},
    container:{length:13.5,minGap:11.0,sense:48,response:1.65},
    motorcycle:{length:2.05,minGap:2.3,sense:13,response:4.1},
    supercar:{length:4.55,minGap:5.5,sense:27,response:3.6}
  };

  const counters={car:0,cargo:0,container:0,motorcycle:0,supercar:0};
  const agents=configs.map((cfg,index)=>{
    const route=routes.find(r=>r.id===cfg.route);
    if(!route)throw new Error('V100 missing route '+cfg.route);
    const local=counters[cfg.type]++;
    let vehicle;
    if(cfg.type==='car')vehicle=buildCar(local);
    else if(cfg.type==='cargo')vehicle=buildCargoTruck(local);
    else if(cfg.type==='container')vehicle=buildContainerTruck(local);
    else if(cfg.type==='motorcycle')vehicle=buildMotorcycle(local);
    else vehicle=buildSupercar(local);
    root.add(vehicle);
    const sp=specs[cfg.type];
    return {
      index,type:cfg.type,vehicle,route,
      s:route.total*cfg.progress,dir:cfg.dir,baseSpeed:cfg.speed,speed:cfg.speed*.72,lane:cfg.lane,
      weaveAmp:cfg.weaveAmp||0,weaveSpeed:cfg.weaveSpeed||0,weavePhase:cfg.weavePhase||0,
      length:sp.length,minGap:sp.minGap,sense:sp.sense,response:sp.response,
      service:null
    };
  });

  // V100: convert V99 driveway metadata into logistics destinations tied to
  // the same three traffic routes used by cargo/container vehicles.
  const serviceTargets=(factoryAccess?.driveways||[])
    .filter(d=>d.side==='service'&&routeIds.has(d.routeId)&&d.roadEdgeWorld&&d.yardWorld&&d.dockWallWorld&&d.outwardWorld)
    .map(d=>{
      const route=routes.find(r=>r.id===d.routeId);
      if(!route)return null;
      const roadEdge=new THREE.Vector3(d.roadEdgeWorld.x,.42,d.roadEdgeWorld.z);
      const projection=projectRouteS(route,roadEdge);
      return {
        ...d,
        route,
        roadEdge,
        yard:new THREE.Vector3(d.yardWorld.x,.42,d.yardWorld.z),
        dockWall:new THREE.Vector3(d.dockWallWorld.x,.42,d.dockWallWorld.z),
        outward:new THREE.Vector3(d.outwardWorld.x,0,d.outwardWorld.z).normalize(),
        mergeS:projection.s,
        mergePoint:projection.point,
        mergeDistance:projection.d
      };
    })
    .filter(Boolean)
    .filter(t=>t.mergeDistance<35);

  const serviceTargetsByRoute=new Map();
  for(const target of serviceTargets){
    if(!serviceTargetsByRoute.has(target.route.id))serviceTargetsByRoute.set(target.route.id,[]);
    serviceTargetsByRoute.get(target.route.id).push(target);
  }
  for(const list of serviceTargetsByRoute.values())list.sort((a,b)=>a.mergeS-b.mergeS);

  const serviceSlots=new Map(serviceTargets.map(t=>[t.factoryIndex,null]));
  const freightAgents=agents.filter(a=>a.type==='cargo'||a.type==='container');
  let serviceAgentCount=0;
  freightAgents.forEach((agent,fi)=>{
    const compatible=serviceTargetsByRoute.get(agent.route.id)||[];
    if(!compatible.length)return;

    // Pick a dock that lies ahead of the truck's current travel direction where
    // possible, so factory logistics becomes visible shortly after page load.
    const ahead=compatible
      .map(t=>({target:t,signed:(t.mergeS-agent.s)*agent.dir}))
      .filter(x=>x.signed>6)
      .sort((a,b)=>a.signed-b.signed);
    const target=ahead.length
      ? ahead[(fi+agent.index)%Math.min(ahead.length,3)].target
      : compatible.reduce((best,t)=>Math.abs(t.mergeS-agent.s)<Math.abs(best.mergeS-agent.s)?t:best,compatible[0]);

    agent.service={
      target,
      phase:'cruise',
      nextAt:4+fi*2.8,
      path:null,
      pathS:0,
      loadRemaining:0,
      resumeS:target.mergeS,
      completedLoads:0
    };
    agent.vehicle.userData.factoryLogisticsV100={
      enabled:true,
      factoryIndex:target.factoryIndex,
      phase:'cruise'
    };
    serviceAgentCount++;
  });

  const serviceStats={
    assignedAgents:serviceAgentCount,
    targetFactories:new Set(serviceTargets.map(t=>t.factoryIndex)).size,
    completedLoads:0,
    activeLoads:0
  };
  let logisticsEnabled=true;

  let simTime=0;
  function currentLane(agent){
    if(agent.type!=='motorcycle')return agent.lane;
    return agent.lane+Math.sin(simTime*agent.weaveSpeed+agent.weavePhase)*agent.weaveAmp;
  }
  function roadLanePose(agent,s=agent.s){
    const sample=sampleRoute(agent.route,s);
    const travel=sample.tangent.clone().multiplyScalar(agent.dir);
    const right=new THREE.Vector3(travel.z,0,-travel.x).normalize();
    const pos=sample.pos.clone().addScaledVector(right,currentLane(agent));
    return {pos,travel};
  }
  function placeAgent(agent){
    const pose=roadLanePose(agent,agent.s);
    agent.vehicle.position.copy(pose.pos);
    agent.vehicle.rotation.y=Math.atan2(pose.travel.x,pose.travel.z);
  }

  function serviceSlotFree(agent){
    const svc=agent.service;
    if(!svc?.target)return false;
    const owner=serviceSlots.get(svc.target.factoryIndex);
    return !owner||owner===agent;
  }

  function setServicePhase(agent,phase){
    if(!agent.service)return;
    agent.service.phase=phase;
    if(agent.vehicle.userData.factoryLogisticsV100){
      agent.vehicle.userData.factoryLogisticsV100.phase=phase;
      agent.vehicle.userData.factoryLogisticsV100.factoryIndex=agent.service.target?.factoryIndex;
    }
  }

  function beginService(agent){
    const svc=agent.service,target=svc?.target;
    if(!svc||!target||!serviceSlotFree(agent))return false;
    serviceSlots.set(target.factoryIndex,agent);
    serviceStats.activeLoads++;
    for(const junction of junctions)if(junction.owner===agent)junction.owner=null;

    const current=agent.vehicle.position.clone();current.y=.42;
    const edge=target.roadEdge.clone();
    const yard=target.yard.clone();
    const rearClear=agent.length*.5+(agent.type==='container'?1.15:.95);
    const dockCenter=target.dockWall.clone().addScaledVector(target.outward,rearClear);
    dockCenter.y=.42;

    svc.dockCenter=dockCenter;
    svc.path=makePolyline([current,edge,yard]);
    svc.pathS=0;
    svc.speed=0;
    setServicePhase(agent,'inbound');
    return true;
  }

  function nextServiceTarget(agent){
    const list=serviceTargetsByRoute.get(agent.route.id)||[];
    if(!list.length)return agent.service?.target||null;
    const current=agent.service?.target;
    const at=Math.max(0,list.indexOf(current));
    return list[(at+1+agent.index)%list.length];
  }

  function routeMergeClear(agent){
    const svc=agent.service;
    if(!svc)return true;
    const mergeS=svc.resumeS;
    for(const other of agents){
      if(other===agent||other.route!==agent.route)continue;
      if(other.service&&other.service.phase!=='cruise')continue;
      const gap=Math.abs(other.s-mergeS);
      const need=agent.type==='container'?24:18;
      if(gap<need)return false;
    }
    return true;
  }

  function finishService(agent){
    const svc=agent.service;
    if(!svc)return;
    serviceSlots.set(svc.target.factoryIndex,null);
    serviceStats.activeLoads=Math.max(0,serviceStats.activeLoads-1);
    serviceStats.completedLoads++;
    svc.completedLoads++;
    svc.target=nextServiceTarget(agent);
    svc.nextAt=simTime+72+(agent.index%6)*9;
    svc.path=null;
    svc.pathS=0;
    agent.s=THREE.MathUtils.clamp(svc.resumeS,0,agent.route.total);
    agent.speed=Math.min(agent.baseSpeed,2.8);
    setServicePhase(agent,'cruise');
    placeAgent(agent);
  }

  function updateServiceAgent(agent,dt){
    const svc=agent.service;
    if(!svc||svc.phase==='cruise')return;

    if(svc.phase==='loading'){
      svc.loadRemaining-=dt;
      agent.speed=0;
      if(svc.loadRemaining<=0){
        const roadPose=roadLanePose(agent,svc.resumeS);
        svc.path=makePolyline([
          svc.dockCenter,
          svc.target.yard,
          svc.target.roadEdge,
          roadPose.pos
        ]);
        svc.pathS=0;
        svc.speed=0;
        setServicePhase(agent,'outbound');
      }
      return;
    }

    const reverse=svc.phase==='reverse-to-dock';
    const targetSpeed=
      svc.phase==='inbound' ? (agent.type==='container'?2.15:2.65) :
      reverse ? (agent.type==='container'?1.25:1.55) :
      (agent.type==='container'?2.25:2.80);

    svc.speed=THREE.MathUtils.lerp(svc.speed||0,targetSpeed,1-Math.exp(-2.4*dt));
    let move=svc.speed*dt;

    if(svc.phase==='outbound'){
      const remain=Math.max(0,svc.path.total-svc.pathS);
      if(remain<6&&!routeMergeClear(agent))move=0;
    }

    svc.pathS=Math.min(svc.path.total,svc.pathS+move);
    const pose=samplePolyline(svc.path,svc.pathS);
    const facing=reverse?pose.tangent.clone().multiplyScalar(-1):pose.tangent;
    agent.vehicle.position.copy(pose.pos);
    agent.vehicle.rotation.y=Math.atan2(facing.x,facing.z);
    agent.speed=svc.speed;

    if(svc.pathS<svc.path.total-.04)return;

    if(svc.phase==='inbound'){
      svc.path=makePolyline([svc.target.yard,svc.dockCenter]);
      svc.pathS=0;
      svc.speed=0;
      setServicePhase(agent,'reverse-to-dock');
    }else if(svc.phase==='reverse-to-dock'){
      svc.loadRemaining=(agent.type==='container'?11.5:8.0)+(agent.index%4)*1.15;
      svc.speed=0;
      agent.speed=0;
      setServicePhase(agent,'loading');
    }else if(svc.phase==='outbound'){
      finishService(agent);
    }
  }

  agents.forEach(placeAgent);

  let enabled=true;
  function setEnabled(v){enabled=!!v;root.visible=enabled;}
  function setLogisticsEnabled(v){logisticsEnabled=!!v;}

  function update(dt){
    if(!enabled||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.05);
    simTime+=dt;

    // Release a junction only after the owner's rear has fully cleared the conflict zone.
    for(const junction of junctions){
      if(junction.owner){
        const owner=junction.owner;
        if(owner.service&&owner.service.phase!=='cruise'){
          junction.owner=null;
          continue;
        }
        const js=junction.routeS[owner.route.id];
        if(js===undefined){
          junction.owner=null;
        }else{
          const signed=(js-owner.s)*owner.dir;
          const policy=junctionPolicy(owner);
          if(signed < -policy.release || signed > policy.lookahead*2.5){
            junction.owner=null;
          }
        }
      }

      // If free, grant it to the nearest vehicle that is already at the claim zone.
      if(!junction.owner){
        let winner=null,best=Infinity;
        for(const candidate of agents){
          if(candidate.service&&candidate.service.phase!=='cruise')continue;
          const js=junction.routeS[candidate.route.id];
          if(js===undefined)continue;
          const signed=(js-candidate.s)*candidate.dir;
          const policy=junctionPolicy(candidate);
          if(signed < -policy.stopGap || signed > policy.claim)continue;
          const score=Math.abs(signed);
          if(score<best){best=score;winner=candidate;}
        }
        junction.owner=winner;
      }
    }

    for(const agent of agents){
      if(agent.service&&agent.service.phase!=='cruise'){
        updateServiceAgent(agent,dt);
        continue;
      }

      let desired=agent.baseSpeed;
      let junctionStopDistance=Infinity;
      let serviceStopDistance=Infinity;
      for(const other of agents){
        if(other===agent||other.route!==agent.route||other.dir!==agent.dir)continue;
        if(other.service&&other.service.phase!=='cruise')continue;

        // Motorcycles only react to traffic occupying nearly the same micro-lane.
        // This prevents the visual "single-file train" while still avoiding overlap.
        if(agent.type==='motorcycle'){
          const lateralGap=Math.abs(currentLane(agent)-currentLane(other));
          if(lateralGap>.58)continue;
        }

        const centerGap=(other.s-agent.s)*agent.dir;
        if(centerGap<=0)continue;
        const bumperGap=centerGap-(agent.length+other.length)*.5;
        if(bumperGap<agent.sense){
          const follow=THREE.MathUtils.clamp(
            (bumperGap-agent.minGap)/Math.max(1,agent.sense-agent.minGap),
            .03,1
          );
          desired=Math.min(desired,agent.baseSpeed*follow);
        }
      }
      // Cross-route junction safety. Non-owner vehicles brake before the stop line,
      // with movement clamped so easing cannot overshoot into the intersection.
      for(const junction of junctions){
        const js=junction.routeS[agent.route.id];
        if(js===undefined)continue;
        const signed=(js-agent.s)*agent.dir;
        const policy=junctionPolicy(agent);
        if(signed>0 && signed<policy.lookahead && junction.owner!==agent){
          const remaining=Math.max(0,signed-policy.stopGap);
          junctionStopDistance=Math.min(junctionStopDistance,remaining);
          const slow=THREE.MathUtils.clamp(
            remaining/Math.max(1,policy.lookahead-policy.stopGap),
            0,1
          );
          desired=Math.min(desired,agent.baseSpeed*slow);
        }
      }

      const svc=agent.service;
      if(logisticsEnabled&&svc?.target&&simTime>=svc.nextAt&&serviceSlotFree(agent)){
        const signed=(svc.target.mergeS-agent.s)*agent.dir;
        if(signed>0&&signed<22){
          serviceStopDistance=signed;
          const slow=THREE.MathUtils.clamp(signed/18,.20,1);
          desired=Math.min(desired,agent.baseSpeed*slow);
        }
      }

      agent.speed=THREE.MathUtils.lerp(agent.speed,desired,1-Math.exp(-agent.response*dt));
      let move=agent.speed*dt;
      if(junctionStopDistance<move){
        move=Math.max(0,junctionStopDistance);
        agent.speed=dt>0?move/dt:0;
      }

      if(serviceStopDistance<=move+.15){
        agent.s=svc.target.mergeS;
        svc.resumeS=THREE.MathUtils.clamp(
          svc.target.mergeS+agent.dir*(agent.type==='container'?4.5:3.5),
          0,agent.route.total
        );
        placeAgent(agent);
        if(beginService(agent))continue;
      }

      agent.s+=agent.dir*move;
      if(agent.s>agent.route.total){agent.s=agent.route.total-(agent.s-agent.route.total);agent.dir=-1;}
      else if(agent.s<0){agent.s=-agent.s;agent.dir=1;}
      placeAgent(agent);
    }
  }

  const counts={
    cars:agents.filter(a=>a.type==='car').length,
    cargoTrucks:agents.filter(a=>a.type==='cargo').length,
    containerTrucks:agents.filter(a=>a.type==='container').length,
    motorcycles:agents.filter(a=>a.type==='motorcycle').length,
    supercars:agents.filter(a=>a.type==='supercar').length
  };
  counts.total=Object.values(counts).reduce((a,b)=>a+b,0);

  window.__DALOC_TRAFFIC_V91={
    ready:true,version:100,group:root,agents,counts,junctions,
    serviceTargets,serviceStats,update,setEnabled,setLogisticsEnabled
  };

  console.info('[DaLoc] V100 factory-logistics traffic installed',{
    ...counts,
    serviceAgents:serviceAgentCount,
    serviceTargets:serviceTargets.length,
    serviceFactories:serviceStats.targetFactories,
    junctions:junctions.map(j=>({id:j.id,routes:j.routes})),
    corridorWarp:'raw CAD 77505'
  });

  return {
    ready:true,version:100,group:root,counts,junctions,
    carCount:counts.cars,cargoTruckCount:counts.cargoTrucks,
    containerTruckCount:counts.containerTrucks,motorcycleCount:counts.motorcycles,
    supercarCount:counts.supercars,totalCount:counts.total,
    serviceTruckCount:serviceAgentCount,
    serviceTargetCount:serviceTargets.length,
    serviceFactoryCount:serviceStats.targetFactories,
    serviceStats,
    update,setEnabled,setLogisticsEnabled
  };
}
