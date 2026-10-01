import * as THREE from 'three';

// V79 traffic agents: lightweight rule-based autonomous cars.
// They follow source-locked circulation paths, keep to the right-hand lane,
// slow for a vehicle ahead, and reverse direction at route endpoints.
export async function installTrafficAIV79({
  world,mapPx,frameSignature
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V79 traffic routes HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V79 traffic coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='AI_TRAFFIC_V79';
  root.userData={version:79,type:'rule-based autonomous traffic agents'};
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
    return {
      id:path.id,
      points:pts,
      cumulative,
      total,
      roadWidthPx:path.widthPx
    };
  });
  if(!routes.length)throw new Error('V79 traffic routes missing');

  function sampleRoute(route,s){
    s=THREE.MathUtils.clamp(s,0,route.total);
    let lo=0,hi=route.cumulative.length-1;
    while(lo<hi-1){
      const mid=(lo+hi)>>1;
      if(route.cumulative[mid]<=s)lo=mid;else hi=mid;
    }
    const a=route.points[lo],b=route.points[Math.min(lo+1,route.points.length-1)];
    const seg=Math.max(.0001,route.cumulative[Math.min(lo+1,route.cumulative.length-1)]-route.cumulative[lo]);
    const t=THREE.MathUtils.clamp((s-route.cumulative[lo])/seg,0,1);
    const pos=a.clone().lerp(b,t);
    const tangent=b.clone().sub(a).normalize();
    return {pos,tangent};
  }

  const bodyMats=[
    new THREE.MeshStandardMaterial({color:0xe9ecef,roughness:.42,metalness:.10}),
    new THREE.MeshStandardMaterial({color:0x315f8c,roughness:.40,metalness:.12}),
    new THREE.MeshStandardMaterial({color:0xb84a43,roughness:.42,metalness:.10}),
    new THREE.MeshStandardMaterial({color:0x52585b,roughness:.38,metalness:.16}),
    new THREE.MeshStandardMaterial({color:0xd1b44b,roughness:.46,metalness:.08}),
    new THREE.MeshStandardMaterial({color:0x47735b,roughness:.43,metalness:.10})
  ];
  const glassMat=new THREE.MeshStandardMaterial({color:0x6f8995,roughness:.12,metalness:.18});
  const tireMat=new THREE.MeshStandardMaterial({color:0x242625,roughness:.88});
  const lightMat=new THREE.MeshStandardMaterial({color:0xf4edc9,roughness:.32,emissive:0x5b542a,emissiveIntensity:.35});
  const rearMat=new THREE.MeshStandardMaterial({color:0xa52e2c,roughness:.4,emissive:0x5a1110,emissiveIntensity:.22});

  function buildCar(index){
    const g=new THREE.Group();
    g.name='V79_AI_CAR_'+index;

    const body=new THREE.Mesh(new THREE.BoxGeometry(1.82,.58,4.25),bodyMats[index%bodyMats.length]);
    body.position.y=.55;
    body.castShadow=true;
    g.add(body);

    const hood=new THREE.Mesh(new THREE.BoxGeometry(1.74,.34,1.10),bodyMats[index%bodyMats.length]);
    hood.position.set(0,.78,-1.35);
    hood.castShadow=true;
    g.add(hood);

    const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.55,.72,1.90),glassMat);
    cabin.position.set(0,1.05,.20);
    cabin.castShadow=true;
    g.add(cabin);

    const wheelGeo=new THREE.CylinderGeometry(.34,.34,.22,12);
    for(const sx of [-.98,.98]){
      for(const sz of [-1.30,1.28]){
        const wheel=new THREE.Mesh(wheelGeo,tireMat);
        wheel.rotation.z=Math.PI/2;
        wheel.position.set(sx,.34,sz);
        g.add(wheel);
      }
    }

    for(const sx of [-.55,.55]){
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.34,.18,.08),lightMat);
      lamp.position.set(sx,.66,2.16);
      g.add(lamp);
      const rear=new THREE.Mesh(new THREE.BoxGeometry(.34,.18,.08),rearMat);
      rear.position.set(sx,.66,-2.16);
      g.add(rear);
    }
    return g;
  }

  const configs=[
    {route:'central-spine',progress:.12,dir:1,speed:7.4,lane:2.6},
    {route:'central-spine',progress:.55,dir:-1,speed:6.7,lane:2.6},
    {route:'north-cross',progress:.18,dir:1,speed:6.2,lane:2.2},
    {route:'north-cross',progress:.69,dir:-1,speed:6.8,lane:2.2},
    {route:'south-cross',progress:.22,dir:1,speed:5.8,lane:2.2},
    {route:'south-cross',progress:.76,dir:-1,speed:6.4,lane:2.2}
  ];

  const agents=configs.map((cfg,index)=>{
    const route=routes.find(r=>r.id===cfg.route);
    if(!route)throw new Error('V79 missing route '+cfg.route);
    const car=buildCar(index);
    root.add(car);
    return {
      index,car,route,
      s:route.total*cfg.progress,
      dir:cfg.dir,
      baseSpeed:cfg.speed,
      speed:cfg.speed*.75,
      lane:cfg.lane
    };
  });

  function placeAgent(agent){
    const sample=sampleRoute(agent.route,agent.s);
    const travel=sample.tangent.clone().multiplyScalar(agent.dir);
    const right=new THREE.Vector3(travel.z,0,-travel.x).normalize();
    const pos=sample.pos.clone().addScaledVector(right,agent.lane);
    agent.car.position.copy(pos);
    agent.car.rotation.y=Math.atan2(travel.x,travel.z);
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

      // Simple traffic awareness: only consider cars on the same route travelling
      // in the same direction. Slow progressively inside a 28 m following window.
      for(const other of agents){
        if(other===agent||other.route!==agent.route||other.dir!==agent.dir)continue;
        const gap=(other.s-agent.s)*agent.dir;
        if(gap>0 && gap<28){
          const follow=THREE.MathUtils.clamp((gap-6)/20,.08,1);
          desired=Math.min(desired,agent.baseSpeed*follow);
        }
      }

      // Ease rather than jump between speeds.
      agent.speed=THREE.MathUtils.lerp(agent.speed,desired,1-Math.exp(-3.2*dt));
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

  window.__DALOC_TRAFFIC_V79={
    ready:true,version:79,group:root,agents,
    carCount:agents.length,
    update,setEnabled
  };

  console.info('[DaLoc] V79 AI traffic installed',{
    cars:agents.length,
    routes:routes.map(r=>r.id)
  });

  return {
    ready:true,version:79,group:root,
    carCount:agents.length,
    update,setEnabled
  };
}
