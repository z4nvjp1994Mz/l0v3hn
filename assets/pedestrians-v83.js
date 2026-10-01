import * as THREE from 'three';

// V83 pedestrian agents.
// 50 workers in green shirts walk along source-locked sidewalk corridors.
export async function installPedestriansV83({
  world,mapPx,frameSignature,metersPerPixel
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V83 pedestrian routes HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V83 pedestrian coordinate frame mismatch');

  const root=new THREE.Group();
  root.name='PEDESTRIANS_V83';
  root.userData={version:83,count:50,shirt:'green'};
  world.add(root);

  const routeIds=new Set(['central-spine','north-cross','south-cross','north-east-local']);
  const routes=(data.paths||[]).filter(p=>routeIds.has(p.id)).map(path=>{
    const points=path.pointsPx.map(([x,y])=>{
      const p=mapPx(x,y);
      return new THREE.Vector3(p.x,.08,p.z);
    });
    const cumulative=[0];
    let total=0;
    for(let i=1;i<points.length;i++){
      total+=points[i].distanceTo(points[i-1]);
      cumulative.push(total);
    }
    return {
      id:path.id,
      widthPx:path.widthPx||12,
      points,cumulative,total
    };
  });
  if(!routes.length)throw new Error('V83 pedestrian routes missing');

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

  const shirtMat=new THREE.MeshStandardMaterial({color:0x2f8b57,roughness:.78});
  const shirtDarkMat=new THREE.MeshStandardMaterial({color:0x267449,roughness:.80});
  const skinMats=[
    0xd7a07b,0xc98b67,0xe0ad86,0xb97b5b
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.82}));
  const pantsMats=[
    0x263746,0x2d3135,0x3e4d55,0x443d38
  ].map(color=>new THREE.MeshStandardMaterial({color,roughness:.86}));
  const shoeMat=new THREE.MeshStandardMaterial({color:0x242424,roughness:.90});
  const hairMat=new THREE.MeshStandardMaterial({color:0x26201c,roughness:.86});

  function buildWalker(index){
    const person=new THREE.Group();
    person.name='V83_WALKER_'+index;

    const torso=new THREE.Mesh(
      new THREE.BoxGeometry(.48,.66,.30),
      index%3===0?shirtDarkMat:shirtMat
    );
    torso.position.y=1.16;
    person.add(torso);

    const neck=new THREE.Mesh(
      new THREE.CylinderGeometry(.065,.075,.12,7),
      skinMats[index%skinMats.length]
    );
    neck.position.y=1.56;
    person.add(neck);

    const head=new THREE.Mesh(
      new THREE.SphereGeometry(.19,9,7),
      skinMats[index%skinMats.length]
    );
    head.position.y=1.76;
    person.add(head);

    const hair=new THREE.Mesh(
      new THREE.SphereGeometry(.198,9,6,0,Math.PI*2,0,Math.PI*.52),
      hairMat
    );
    hair.position.y=1.83;
    person.add(hair);

    const leftArm=new THREE.Group();
    leftArm.position.set(-.29,1.43,0);
    const la=new THREE.Mesh(
      new THREE.CylinderGeometry(.055,.065,.62,7),
      index%3===0?shirtDarkMat:shirtMat
    );
    la.position.y=-.28;
    leftArm.add(la);
    person.add(leftArm);

    const rightArm=new THREE.Group();
    rightArm.position.set(.29,1.43,0);
    const ra=new THREE.Mesh(
      new THREE.CylinderGeometry(.055,.065,.62,7),
      index%3===0?shirtDarkMat:shirtMat
    );
    ra.position.y=-.28;
    rightArm.add(ra);
    person.add(rightArm);

    const leftLeg=new THREE.Group();
    leftLeg.position.set(-.13,.84,0);
    const ll=new THREE.Mesh(
      new THREE.CylinderGeometry(.07,.08,.72,7),
      pantsMats[index%pantsMats.length]
    );
    ll.position.y=-.34;
    leftLeg.add(ll);
    const ls=new THREE.Mesh(new THREE.BoxGeometry(.18,.10,.32),shoeMat);
    ls.position.set(0,-.72,.09);
    leftLeg.add(ls);
    person.add(leftLeg);

    const rightLeg=new THREE.Group();
    rightLeg.position.set(.13,.84,0);
    const rl=new THREE.Mesh(
      new THREE.CylinderGeometry(.07,.08,.72,7),
      pantsMats[index%pantsMats.length]
    );
    rl.position.y=-.34;
    rightLeg.add(rl);
    const rs=new THREE.Mesh(new THREE.BoxGeometry(.18,.10,.32),shoeMat);
    rs.position.set(0,-.72,.09);
    rightLeg.add(rs);
    person.add(rightLeg);

    person.scale.setScalar(.94+(index%7)*.018);
    person.userData.limbs={leftArm,rightArm,leftLeg,rightLeg};
    return person;
  }

  let seed=830319;
  function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function rr(a,b){return a+(b-a)*rnd();}

  const walkers=[];
  for(let i=0;i<50;i++){
    const route=routes[i%routes.length];
    const person=buildWalker(i);
    root.add(person);

    const side=i%2===0?1:-1;
    const roadHalf=route.widthPx*metersPerPixel*.5;
    walkers.push({
      index:i,
      person,route,
      s:route.total*(.02+((i*.61803398875)%1)*.95),
      dir:(i%3===0?-1:1),
      speed:rr(.82,1.48),
      side,
      baseOffset:roadHalf+rr(2.2,3.8),
      wanderAmp:rr(.18,.62),
      wanderSpeed:rr(.28,.65),
      phase:rr(0,Math.PI*2),
      stepPhase:rr(0,Math.PI*2)
    });
  }

  let simTime=0;
  function placeWalker(w){
    const sample=sampleRoute(w.route,w.s);
    const travel=sample.tangent.clone().multiplyScalar(w.dir);
    const right=new THREE.Vector3(travel.z,0,-travel.x).normalize();
    const wander=Math.sin(simTime*w.wanderSpeed+w.phase)*w.wanderAmp;
    const lateral=w.side*(w.baseOffset+wander);
    const pos=sample.pos.clone().addScaledVector(right,lateral);

    w.person.position.set(pos.x,.08,pos.z);
    w.person.rotation.y=Math.atan2(travel.x,travel.z);

    const swing=Math.sin(simTime*w.speed*4.5+w.stepPhase)*.58;
    const limbs=w.person.userData.limbs;
    limbs.leftArm.rotation.x=swing;
    limbs.rightArm.rotation.x=-swing;
    limbs.leftLeg.rotation.x=-swing*.80;
    limbs.rightLeg.rotation.x=swing*.80;
  }
  walkers.forEach(placeWalker);

  let enabled=true;
  function setEnabled(v){enabled=!!v;root.visible=enabled;}

  function update(dt){
    if(!enabled||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.05);
    simTime+=dt;
    for(const w of walkers){
      w.s+=w.dir*w.speed*dt;
      if(w.s>w.route.total){
        w.s=w.route.total-(w.s-w.route.total);
        w.dir=-1;
      }else if(w.s<0){
        w.s=-w.s;
        w.dir=1;
      }
      placeWalker(w);
    }
  }

  window.__DALOC_PEDESTRIANS_V83={
    ready:true,version:83,group:root,walkers,count:walkers.length,update,setEnabled
  };

  console.info('[DaLoc] V83 green-shirt pedestrians installed',{count:walkers.length});

  return {
    ready:true,version:83,group:root,count:walkers.length,update,setEnabled
  };
}
