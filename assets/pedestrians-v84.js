import * as THREE from 'three';

// V84 pedestrian behavior:
// - 24 workers enter/exit factories through V84 personnel portals
// - 14 workers patrol factory yards / external apron areas
// - 12 workers stay on the actual V53 sidewalk polygon boundary
// No pedestrian route is derived from road centerlines.
export async function installPedestriansV84({
  world,mapPx,frameSignature,factoryPortals=[]
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V84 pedestrian source HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V84 pedestrian coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='PEDESTRIANS_V84';
  root.userData={
    version:84,
    count:50,
    factoryWalkers:24,
    yardWalkers:14,
    sidewalkWalkers:12,
    source:'V53 sidewalk polygons + V84 factory portals'
  };
  world.add(root);

  const shirtMat=new THREE.MeshStandardMaterial({color:0x2f8b57,roughness:.78});
  const shirtDarkMat=new THREE.MeshStandardMaterial({color:0x267449,roughness:.80});
  const skinMats=[0xd7a07b,0xc98b67,0xe0ad86,0xb97b5b].map(color=>
    new THREE.MeshStandardMaterial({color,roughness:.82})
  );
  const pantsMats=[0x263746,0x2d3135,0x3e4d55,0x443d38].map(color=>
    new THREE.MeshStandardMaterial({color,roughness:.86})
  );
  const shoeMat=new THREE.MeshStandardMaterial({color:0x242424,roughness:.90});
  const hairMat=new THREE.MeshStandardMaterial({color:0x26201c,roughness:.86});

  function buildWalker(index){
    const person=new THREE.Group();
    person.name='V84_WALKER_'+index;

    const shirt=index%4===0?shirtDarkMat:shirtMat;
    const skin=skinMats[index%skinMats.length];
    const pants=pantsMats[index%pantsMats.length];

    const torso=new THREE.Mesh(new THREE.BoxGeometry(.48,.66,.30),shirt);
    torso.position.y=1.16;person.add(torso);

    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.065,.075,.12,7),skin);
    neck.position.y=1.56;person.add(neck);

    const head=new THREE.Mesh(new THREE.SphereGeometry(.19,9,7),skin);
    head.position.y=1.76;person.add(head);

    const hair=new THREE.Mesh(new THREE.SphereGeometry(.198,9,6,0,Math.PI*2,0,Math.PI*.52),hairMat);
    hair.position.y=1.83;person.add(hair);

    const leftArm=new THREE.Group();leftArm.position.set(-.29,1.43,0);
    const la=new THREE.Mesh(new THREE.CylinderGeometry(.055,.065,.62,7),shirt);la.position.y=-.28;leftArm.add(la);person.add(leftArm);

    const rightArm=new THREE.Group();rightArm.position.set(.29,1.43,0);
    const ra=new THREE.Mesh(new THREE.CylinderGeometry(.055,.065,.62,7),shirt);ra.position.y=-.28;rightArm.add(ra);person.add(rightArm);

    const leftLeg=new THREE.Group();leftLeg.position.set(-.13,.84,0);
    const ll=new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.72,7),pants);ll.position.y=-.34;leftLeg.add(ll);
    const ls=new THREE.Mesh(new THREE.BoxGeometry(.18,.10,.32),shoeMat);ls.position.set(0,-.72,.09);leftLeg.add(ls);person.add(leftLeg);

    const rightLeg=new THREE.Group();rightLeg.position.set(.13,.84,0);
    const rl=new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.72,7),pants);rl.position.y=-.34;rightLeg.add(rl);
    const rs=new THREE.Mesh(new THREE.BoxGeometry(.18,.10,.32),shoeMat);rs.position.set(0,-.72,.09);rightLeg.add(rs);person.add(rightLeg);

    person.scale.setScalar(.94+(index%7)*.018);
    person.userData.limbs={leftArm,rightArm,leftLeg,rightLeg};
    return person;
  }

  let seed=840417;
  function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function rr(a,b){return a+(b-a)*rnd();}

  function animateLimbs(agent,dt){
    agent.stepTime+=dt*agent.speed;
    const swing=Math.sin(agent.stepTime*4.7+agent.phase)*.58;
    const limbs=agent.person.userData.limbs;
    limbs.leftArm.rotation.x=swing;
    limbs.rightArm.rotation.x=-swing;
    limbs.leftLeg.rotation.x=-swing*.80;
    limbs.rightLeg.rotation.x=swing*.80;
  }

  function makePath(points,closed=false){
    const pts=points.map(p=>p.clone());
    if(closed && pts.length>2)pts.push(pts[0].clone());
    const cumulative=[0];
    let total=0;
    for(let i=1;i<pts.length;i++){
      total+=pts[i].distanceTo(pts[i-1]);
      cumulative.push(total);
    }
    return {points:pts,cumulative,total,closed};
  }

  function samplePath(path,s){
    if(path.total<=.001)return {pos:path.points[0].clone(),tangent:new THREE.Vector3(0,0,1)};
    if(path.closed){
      s=((s%path.total)+path.total)%path.total;
    }else{
      s=THREE.MathUtils.clamp(s,0,path.total);
    }
    let lo=0,hi=path.cumulative.length-1;
    while(lo<hi-1){
      const mid=(lo+hi)>>1;
      if(path.cumulative[mid]<=s)lo=mid;else hi=mid;
    }
    const bi=Math.min(lo+1,path.points.length-1);
    const a=path.points[lo],b=path.points[bi];
    const len=Math.max(.0001,path.cumulative[bi]-path.cumulative[lo]);
    const t=THREE.MathUtils.clamp((s-path.cumulative[lo])/len,0,1);
    return {pos:a.clone().lerp(b,t),tangent:b.clone().sub(a).normalize(),segment:lo};
  }

  // Actual V53 sidewalk polygon boundaries. This replaces the old "road width + offset"
  // approximation that could place workers on asphalt.
  const sidewalkPolys=data.layers?.sidewalk||[];
  const sidewalkPaths=[];
  for(const poly of sidewalkPolys){
    for(const ring of [poly.outer,...(poly.holes||[])]){
      if(!ring||ring.length<3)continue;
      const pts=ring.map(([x,y])=>{
        const p=mapPx(x,y);
        return new THREE.Vector3(p.x,.10,p.z);
      });
      sidewalkPaths.push(makePath(pts,true));
    }
  }
  if(!sidewalkPaths.length)throw new Error('V84 sidewalk polygon unavailable');

  const factoryPaths=[];
  const yardPaths=[];
  for(const portal of factoryPortals){
    if(!portal?.entranceWorld||!portal?.patrolWorld?.length)continue;

    const p=portal;
    const left=p.patrolWorld[0].clone();
    const right=p.patrolWorld[1].clone();

    // Complete commute cycle: external apron -> door -> production floor -> door -> apron.
    factoryPaths.push({
      portal,
      path:makePath([
        left,
        p.yardWorld,
        p.entranceWorld,
        p.insideNearWorld,
        p.insideMidWorld,
        p.insideFarWorld,
        p.insideMidWorld,
        p.insideNearWorld,
        p.entranceWorld,
        p.yardWorld,
        right
      ],false)
    });

    yardPaths.push({
      portal,
      path:makePath(p.patrolWorld,true)
    });
  }
  if(!factoryPaths.length)throw new Error('V84 factory portals unavailable');

  const agents=[];
  let globalIndex=0;

  // 24 workers actually entering/exiting buildings.
  for(let i=0;i<24;i++){
    const fp=factoryPaths[(i*7)%factoryPaths.length];
    const person=buildWalker(globalIndex++);
    root.add(person);
    agents.push({
      mode:'factory',
      person,
      path:fp.path,
      portalIndex:fp.portal.index,
      s:fp.path.total*(.02+((i*.41421356)%1)*.94),
      dir:i%2===0?1:-1,
      speed:rr(.85,1.28),
      phase:rr(0,Math.PI*2),
      stepTime:rr(0,10),
      pause:0
    });
  }

  // 14 workers walking randomly around external factory yards/aprons.
  for(let i=0;i<14;i++){
    const yp=yardPaths[(i*5+3)%yardPaths.length];
    const person=buildWalker(globalIndex++);
    root.add(person);
    agents.push({
      mode:'yard',
      person,
      path:yp.path,
      portalIndex:yp.portal.index,
      s:yp.path.total*((i*.61803398875)%1),
      dir:i%3===0?-1:1,
      speed:rr(.72,1.18),
      phase:rr(0,Math.PI*2),
      stepTime:rr(0,10),
      pause:0
    });
  }

  // 12 sidewalk-only workers, constrained to the true sidewalk polygon edge.
  for(let i=0;i<12;i++){
    const path=sidewalkPaths[i%sidewalkPaths.length];
    const person=buildWalker(globalIndex++);
    root.add(person);
    agents.push({
      mode:'sidewalk',
      person,
      path,
      s:path.total*((i*.754877666)%1),
      dir:i%2===0?1:-1,
      speed:rr(.78,1.36),
      phase:rr(0,Math.PI*2),
      stepTime:rr(0,10),
      pause:0
    });
  }

  let simTime=0;
  function placeAgent(agent){
    const sample=samplePath(agent.path,agent.s);
    const travel=sample.tangent.clone().multiplyScalar(agent.dir);
    agent.person.position.copy(sample.pos);
    agent.person.position.y=.10;
    agent.person.rotation.y=Math.atan2(travel.x,travel.z);
  }
  agents.forEach(placeAgent);

  let enabled=true;
  function setEnabled(v){enabled=!!v;root.visible=enabled;}

  function update(dt){
    if(!enabled||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.05);
    simTime+=dt;

    for(const agent of agents){
      if(agent.pause>0){
        agent.pause=Math.max(0,agent.pause-dt);
        continue;
      }

      agent.s+=agent.dir*agent.speed*dt;

      if(agent.path.closed){
        if(agent.s>agent.path.total)agent.s-=agent.path.total;
        if(agent.s<0)agent.s+=agent.path.total;
      }else{
        if(agent.s>=agent.path.total){
          agent.s=agent.path.total;
          agent.dir=-1;
          agent.pause=rr(.3,1.4);
        }else if(agent.s<=0){
          agent.s=0;
          agent.dir=1;
          agent.pause=rr(.3,1.4);
        }
      }

      placeAgent(agent);
      animateLimbs(agent,dt);

      // Natural short pauses around doors and work areas.
      if(agent.mode==='factory' && rnd()<dt*.035){
        agent.pause=rr(.25,.85);
      }
    }
  }

  const counts={
    factory:agents.filter(a=>a.mode==='factory').length,
    yard:agents.filter(a=>a.mode==='yard').length,
    sidewalk:agents.filter(a=>a.mode==='sidewalk').length
  };
  counts.total=agents.length;

  window.__DALOC_PEDESTRIANS_V84={
    ready:true,version:84,group:root,agents,counts,update,setEnabled
  };

  console.info('[DaLoc] V84 pedestrian navigation installed',counts);

  return {
    ready:true,version:84,group:root,count:counts.total,counts,update,setEnabled
  };
}
