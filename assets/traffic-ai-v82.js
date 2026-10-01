import * as THREE from 'three';

// V82 mixed traffic:
// existing industrial traffic + 24 motorcycles + 6 supercars.
// 4 cars + 10 cargo trucks + 6 container trucks are preserved from V80.
export async function installTrafficAIV82({world,mapPx,frameSignature}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V82 traffic routes HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V82 traffic coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='AI_TRAFFIC_V82';
  root.userData={
    version:82,
    cars:4,cargoTrucks:10,containerTrucks:6,motorcycles:24,supercars:6
  };
  world.add(root);

  const routeIds=new Set(['central-spine','north-cross','south-cross']);
  const routes=(data.paths||[]).filter(p=>routeIds.has(p.id)).map(path=>{
    const pts=path.pointsPx.map(([x,y])=>{
      const p=mapPx(x,y);
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
  if(!routes.length)throw new Error('V82 traffic routes missing');

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
    g.name='V82_CAR_'+index;
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
    g.name='V82_CARGO_TRUCK_'+index;
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
    g.name='V82_CONTAINER_TRUCK_'+index;
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
    g.name='V82_MOTORCYCLE_'+index;
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
    return g;
  }

  function buildSupercar(index){
    const g=new THREE.Group(),mat=superMats[index%superMats.length];
    g.name='V82_SUPERCAR_'+index;
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

  // 24 motorcycles distributed across all three routes.
  const motorcycleRoutes=['central-spine','north-cross','south-cross'];
  for(let i=0;i<24;i++){
    const route=motorcycleRoutes[i%3];
    configs.push({
      type:'motorcycle',
      route,
      progress:(.05+(i*.137)% .88),
      dir:i%2===0?1:-1,
      speed:7.0+(i%5)*.35,
      lane:route==='central-spine'?1.70:1.55
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
    if(!route)throw new Error('V82 missing route '+cfg.route);
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
      length:sp.length,minGap:sp.minGap,sense:sp.sense,response:sp.response
    };
  });

  function placeAgent(agent){
    const sample=sampleRoute(agent.route,agent.s);
    const travel=sample.tangent.clone().multiplyScalar(agent.dir);
    const right=new THREE.Vector3(travel.z,0,-travel.x).normalize();
    const pos=sample.pos.clone().addScaledVector(right,agent.lane);
    agent.vehicle.position.copy(pos);
    agent.vehicle.rotation.y=Math.atan2(travel.x,travel.z);
  }
  agents.forEach(placeAgent);

  let enabled=true;
  function setEnabled(v){enabled=!!v;root.visible=enabled;}

  function update(dt){
    if(!enabled||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.05);
    for(const agent of agents){
      let desired=agent.baseSpeed;
      for(const other of agents){
        if(other===agent||other.route!==agent.route||other.dir!==agent.dir)continue;
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
      agent.speed=THREE.MathUtils.lerp(agent.speed,desired,1-Math.exp(-agent.response*dt));
      agent.s+=agent.dir*agent.speed*dt;
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

  window.__DALOC_TRAFFIC_V82={ready:true,version:82,group:root,agents,counts,update,setEnabled};

  console.info('[DaLoc] V82 mixed traffic installed',counts);

  return {
    ready:true,version:82,group:root,counts,
    carCount:counts.cars,cargoTruckCount:counts.cargoTrucks,
    containerTruckCount:counts.containerTrucks,motorcycleCount:counts.motorcycles,
    supercarCount:counts.supercars,totalCount:counts.total,
    update,setEnabled
  };
}
