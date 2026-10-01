import * as THREE from 'three';

// V80 mixed industrial traffic:
// 4 passenger cars + 10 cargo trucks + 6 container trucks.
// Agents follow the source-locked road paths, use right-hand lanes,
// keep type-aware following distances, and reverse at route endpoints.
export async function installTrafficAIV80({
  world,mapPx,frameSignature
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V80 traffic routes HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V80 traffic coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='AI_TRAFFIC_V80';
  root.userData={
    version:80,
    type:'mixed rule-based autonomous industrial traffic',
    cars:4,
    cargoTrucks:10,
    containerTrucks:6
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
    return {id:path.id,points:pts,cumulative,total,roadWidthPx:path.widthPx};
  });
  if(!routes.length)throw new Error('V80 traffic routes missing');

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
    return {
      pos:a.clone().lerp(b,t),
      tangent:b.clone().sub(a).normalize()
    };
  }

  const carMats=[
    new THREE.MeshStandardMaterial({color:0xe9ecef,roughness:.42,metalness:.10}),
    new THREE.MeshStandardMaterial({color:0x315f8c,roughness:.40,metalness:.12}),
    new THREE.MeshStandardMaterial({color:0xb84a43,roughness:.42,metalness:.10}),
    new THREE.MeshStandardMaterial({color:0xd1b44b,roughness:.46,metalness:.08})
  ];
  const truckCabMats=[
    new THREE.MeshStandardMaterial({color:0xf1f2ef,roughness:.48,metalness:.08}),
    new THREE.MeshStandardMaterial({color:0x2f628c,roughness:.45,metalness:.10}),
    new THREE.MeshStandardMaterial({color:0xb64e42,roughness:.47,metalness:.08}),
    new THREE.MeshStandardMaterial({color:0x4e755c,roughness:.48,metalness:.08}),
    new THREE.MeshStandardMaterial({color:0xe0b84d,roughness:.50,metalness:.06})
  ];
  const cargoBoxMats=[
    new THREE.MeshStandardMaterial({color:0xd9ddd9,roughness:.72}),
    new THREE.MeshStandardMaterial({color:0xc8d4db,roughness:.70}),
    new THREE.MeshStandardMaterial({color:0xe2ded3,roughness:.74}),
    new THREE.MeshStandardMaterial({color:0xbfc9c1,roughness:.72})
  ];
  const containerMats=[
    new THREE.MeshStandardMaterial({color:0xb84d3e,roughness:.74}),
    new THREE.MeshStandardMaterial({color:0x315f7e,roughness:.72}),
    new THREE.MeshStandardMaterial({color:0x4d7355,roughness:.74}),
    new THREE.MeshStandardMaterial({color:0xb78638,roughness:.74}),
    new THREE.MeshStandardMaterial({color:0x71777a,roughness:.72}),
    new THREE.MeshStandardMaterial({color:0x7a4b3b,roughness:.74})
  ];
  const glassMat=new THREE.MeshStandardMaterial({color:0x6f8995,roughness:.12,metalness:.18});
  const tireMat=new THREE.MeshStandardMaterial({color:0x202322,roughness:.90});
  const chassisMat=new THREE.MeshStandardMaterial({color:0x383d3b,roughness:.72,metalness:.18});
  const lightMat=new THREE.MeshStandardMaterial({
    color:0xf4edc9,roughness:.32,emissive:0x5b542a,emissiveIntensity:.35
  });
  const rearMat=new THREE.MeshStandardMaterial({
    color:0xa52e2c,roughness:.4,emissive:0x5a1110,emissiveIntensity:.22
  });

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
    const g=new THREE.Group();
    g.name='V80_CAR_'+index;
    const mat=carMats[index%carMats.length];

    const body=new THREE.Mesh(new THREE.BoxGeometry(1.82,.58,4.25),mat);
    body.position.y=.55;body.castShadow=true;g.add(body);

    const hood=new THREE.Mesh(new THREE.BoxGeometry(1.74,.34,1.10),mat);
    hood.position.set(0,.78,1.35);hood.castShadow=true;g.add(hood);

    const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.55,.72,1.90),glassMat);
    cabin.position.set(0,1.05,-.20);cabin.castShadow=true;g.add(cabin);

    for(const sx of [-.98,.98])for(const sz of [-1.30,1.28])addWheel(g,sx,sz,.34,.22);
    addLights(g,1.82,2.16,-2.16,.66);
    return g;
  }

  function buildCargoTruck(index){
    const g=new THREE.Group();
    g.name='V80_CARGO_TRUCK_'+index;
    const cabMat=truckCabMats[index%truckCabMats.length];
    const boxMat=cargoBoxMats[index%cargoBoxMats.length];

    const chassis=new THREE.Mesh(new THREE.BoxGeometry(2.18,.26,7.75),chassisMat);
    chassis.position.y=.58;g.add(chassis);

    const cargo=new THREE.Mesh(new THREE.BoxGeometry(2.26,2.55,4.85),boxMat);
    cargo.position.set(0,1.88,-1.05);cargo.castShadow=true;g.add(cargo);

    const cab=new THREE.Mesh(new THREE.BoxGeometry(2.18,2.15,2.35),cabMat);
    cab.position.set(0,1.58,2.35);cab.castShadow=true;g.add(cab);

    const windshield=new THREE.Mesh(new THREE.BoxGeometry(1.72,.76,.08),glassMat);
    windshield.position.set(0,1.94,3.56);g.add(windshield);

    for(const sx of [-1.20,1.20]){
      addWheel(g,sx,2.20,.43,.28);
      addWheel(g,sx,-.75,.43,.28);
      addWheel(g,sx,-2.48,.43,.28);
    }
    addLights(g,2.18,3.64,-3.93,1.02);
    return g;
  }

  function addContainerRibs(group,length,height,mat){
    const ribMat=new THREE.MeshStandardMaterial({
      color:mat.color.clone().multiplyScalar(.78),roughness:.76
    });
    const n=11;
    for(let i=0;i<n;i++){
      const z=THREE.MathUtils.lerp(-length*.43,length*.43,i/(n-1));
      const rib=new THREE.Mesh(new THREE.BoxGeometry(2.46,.05,.06),ribMat);
      rib.position.set(0,height*.96,z);
      group.add(rib);
    }
  }

  function buildContainerTruck(index){
    const g=new THREE.Group();
    g.name='V80_CONTAINER_TRUCK_'+index;
    const cabMat=truckCabMats[(index+2)%truckCabMats.length];
    const contMat=containerMats[index%containerMats.length];

    const chassis=new THREE.Mesh(new THREE.BoxGeometry(2.32,.28,13.5),chassisMat);
    chassis.position.y=.58;g.add(chassis);

    const trailer=new THREE.Group();
    trailer.position.z=-2.65;
    const container=new THREE.Mesh(new THREE.BoxGeometry(2.46,2.65,7.55),contMat);
    container.position.y=2.02;container.castShadow=true;trailer.add(container);
    addContainerRibs(trailer,7.55,2.65,contMat);
    g.add(trailer);

    const cab=new THREE.Mesh(new THREE.BoxGeometry(2.24,2.35,2.65),cabMat);
    cab.position.set(0,1.65,4.72);cab.castShadow=true;g.add(cab);

    const windshield=new THREE.Mesh(new THREE.BoxGeometry(1.78,.82,.08),glassMat);
    windshield.position.set(0,2.04,6.08);g.add(windshield);

    for(const sx of [-1.22,1.22]){
      addWheel(g,sx,4.68,.46,.30);
      addWheel(g,sx,1.40,.46,.30);
      addWheel(g,sx,-4.65,.46,.30);
      addWheel(g,sx,-5.82,.46,.30);
    }
    addLights(g,2.24,6.13,-6.70,1.10);
    return g;
  }

  const configs=[
    // 4 passenger cars
    {type:'car',route:'central-spine',progress:.10,dir:1,speed:7.3,lane:2.65},
    {type:'car',route:'central-spine',progress:.58,dir:-1,speed:6.8,lane:2.65},
    {type:'car',route:'north-cross',progress:.18,dir:1,speed:6.4,lane:2.25},
    {type:'car',route:'south-cross',progress:.76,dir:-1,speed:6.1,lane:2.30},

    // 10 cargo trucks
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

    // 6 container trucks - restricted to the two larger corridors
    {type:'container',route:'central-spine',progress:.25,dir:-1,speed:4.0,lane:2.90},
    {type:'container',route:'central-spine',progress:.44,dir:1,speed:4.2,lane:2.90},
    {type:'container',route:'central-spine',progress:.74,dir:-1,speed:3.9,lane:2.90},
    {type:'container',route:'central-spine',progress:.93,dir:1,speed:4.1,lane:2.90},
    {type:'container',route:'north-cross',progress:.27,dir:-1,speed:3.8,lane:2.48},
    {type:'container',route:'north-cross',progress:.76,dir:1,speed:4.0,lane:2.48}
  ];

  const typeSpecs={
    car:{length:4.25,minGap:5.0,sense:25.0},
    cargo:{length:7.75,minGap:8.0,sense:36.0},
    container:{length:13.50,minGap:11.0,sense:48.0}
  };

  const typeIndex={car:0,cargo:0,container:0};
  const agents=configs.map((cfg,index)=>{
    const route=routes.find(r=>r.id===cfg.route);
    if(!route)throw new Error('V80 missing route '+cfg.route);

    const localIndex=typeIndex[cfg.type]++;
    const vehicle=cfg.type==='car'
      ?buildCar(localIndex)
      :cfg.type==='cargo'
        ?buildCargoTruck(localIndex)
        :buildContainerTruck(localIndex);

    root.add(vehicle);
    const spec=typeSpecs[cfg.type];
    return {
      index,type:cfg.type,vehicle,route,
      s:route.total*cfg.progress,
      dir:cfg.dir,
      baseSpeed:cfg.speed,
      speed:cfg.speed*.70,
      lane:cfg.lane,
      length:spec.length,
      minGap:spec.minGap,
      senseDistance:spec.sense
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
  function setEnabled(v){
    enabled=!!v;
    root.visible=enabled;
  }

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
        if(bumperGap<agent.senseDistance){
          const follow=THREE.MathUtils.clamp(
            (bumperGap-agent.minGap)/Math.max(1,agent.senseDistance-agent.minGap),
            .04,1
          );
          desired=Math.min(desired,agent.baseSpeed*follow);
        }
      }

      // Heavy vehicles accelerate/decelerate more gradually.
      const response=agent.type==='container'?1.65:agent.type==='cargo'?2.15:3.25;
      agent.speed=THREE.MathUtils.lerp(agent.speed,desired,1-Math.exp(-response*dt));
      agent.s+=agent.dir*agent.speed*dt;

      if(agent.s>agent.route.total){
        agent.s=agent.route.total-(agent.s-agent.route.total);
        agent.dir=-1;
      }else if(agent.s<0){
        agent.s=-agent.s;
        agent.dir=1;
      }
      placeAgent(agent);
    }
  }

  const counts={
    cars:agents.filter(a=>a.type==='car').length,
    cargoTrucks:agents.filter(a=>a.type==='cargo').length,
    containerTrucks:agents.filter(a=>a.type==='container').length
  };
  counts.total=counts.cars+counts.cargoTrucks+counts.containerTrucks;

  window.__DALOC_TRAFFIC_V80={
    ready:true,version:80,group:root,agents,counts,
    carCount:counts.cars,
    cargoTruckCount:counts.cargoTrucks,
    containerTruckCount:counts.containerTrucks,
    totalCount:counts.total,
    update,setEnabled
  };

  console.info('[DaLoc] V80 mixed industrial traffic installed',{
    ...counts,
    routes:routes.map(r=>r.id)
  });

  return {
    ready:true,version:80,group:root,counts,
    carCount:counts.cars,
    cargoTruckCount:counts.cargoTrucks,
    containerTruckCount:counts.containerTrucks,
    totalCount:counts.total,
    update,setEnabled
  };
}
