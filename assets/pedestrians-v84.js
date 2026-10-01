import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildCadCorridorWarpV91 } from './corridor-warp-v91.js?v=91';
import { loadKenneyCharacterAssets, createDynamicInstancedAsset } from './real-assets-v105.js?v=105';

// V84 pedestrian behavior:
// - 24 workers enter/exit factories through V84 personnel portals
// - 14 workers patrol factory yards / external apron areas
// - 12 workers stay on the actual V53 sidewalk polygon boundary
// No pedestrian route is derived from road centerlines.
export async function installPedestriansV84({
  world,mapPx,frameSignature,factoryPortals=[],buildings=[]
}){
  const [response,cadResponse]=await Promise.all([
    fetch(new URL('./circulation-v53.json',import.meta.url)),
    fetch(new URL('./cad-source-v72.json',import.meta.url))
  ]);
  if(!response.ok)throw new Error('V89 pedestrian source HTTP '+response.status);
  if(!cadResponse.ok)throw new Error('V89 pedestrian CAD source HTTP '+cadResponse.status);
  const data=await response.json();
  const cadData=await cadResponse.json();
  if(data.frameSignature!==frameSignature||cadData.frameSignature!==frameSignature)throw new Error('V89 pedestrian coordinate frame mismatch');
  const corridorWarpV91=buildCadCorridorWarpV91({circulation:data,cad:cadData});
  const characterAssets=await loadKenneyCharacterAssets().catch(error=>{
    console.error('[DaLoc] V105 real character assets failed; using fallback walkers',error);
    return null;
  });
  const realCharacterAssets=!!(
    characterAssets?.male && characterAssets?.female &&
    !characterAssets.male.hasSkinnedMesh && !characterAssets.female.hasSkinnedMesh
  );

  const root=new THREE.Group();
  root.name='PEDESTRIANS_V105_REAL_ASSET';
  root.userData={
    version:'105',
    count:50,
    source:'CAD-network-warped V53 sidewalks + V84 factory portals + building-derived fallback portals'
  };
  world.add(root);

  const shirtMat=new THREE.MeshStandardMaterial({color:0x2f8b57,roughness:.78});
  const skinMat=new THREE.MeshStandardMaterial({color:0xd6a07b,roughness:.82});
  const pantsMat=new THREE.MeshStandardMaterial({color:0x303b43,roughness:.86});
  const shoeMat=new THREE.MeshStandardMaterial({color:0x242424,roughness:.90});
  const helmetMat=new THREE.MeshStandardMaterial({color:0xf0c43a,roughness:.55,metalness:.04});
  const safetyGreenMat=new THREE.MeshStandardMaterial({color:0x2f9656,roughness:.70});

  // Fallback geometry is now rounded/capsule-based, never box-people.
  const fallbackGeo={
    torso:new THREE.CapsuleGeometry(.23,.44,5,9),
    head:new THREE.SphereGeometry(.19,12,9),
    arm:new THREE.CapsuleGeometry(.055,.48,4,7),
    leg:new THREE.CapsuleGeometry(.07,.58,4,7),
    shoe:new RoundedBoxGeometry(.18,.10,.32,2,.025)
  };

  function buildFallbackWalker(index){
    const person=new THREE.Group();
    const torso=new THREE.Mesh(fallbackGeo.torso,shirtMat);torso.position.y=1.18;person.add(torso);
    const head=new THREE.Mesh(fallbackGeo.head,skinMat);head.position.y=1.72;person.add(head);

    const leftArm=new THREE.Group();leftArm.position.set(-.28,1.39,0);
    const la=new THREE.Mesh(fallbackGeo.arm,shirtMat);la.position.y=-.22;leftArm.add(la);person.add(leftArm);
    const rightArm=new THREE.Group();rightArm.position.set(.28,1.39,0);
    const ra=new THREE.Mesh(fallbackGeo.arm,shirtMat);ra.position.y=-.22;rightArm.add(ra);person.add(rightArm);

    const leftLeg=new THREE.Group();leftLeg.position.set(-.12,.82,0);
    const ll=new THREE.Mesh(fallbackGeo.leg,pantsMat);ll.position.y=-.28;leftLeg.add(ll);
    const ls=new THREE.Mesh(fallbackGeo.shoe,shoeMat);ls.position.set(0,-.63,.08);leftLeg.add(ls);person.add(leftLeg);
    const rightLeg=new THREE.Group();rightLeg.position.set(.12,.82,0);
    const rl=new THREE.Mesh(fallbackGeo.leg,pantsMat);rl.position.y=-.28;rightLeg.add(rl);
    const rs=new THREE.Mesh(fallbackGeo.shoe,shoeMat);rs.position.set(0,-.63,.08);rightLeg.add(rs);person.add(rightLeg);

    person.userData.limbs={leftArm,rightArm,leftLeg,rightLeg};
    person.userData.realAssetV105=false;
    person.scale.setScalar(1.00+(index%7)*.015);
    return person;
  }

  // Real walkers are empty transform anchors. Their visible geometry is rendered
  // by two Kenney GLB InstancedMesh batches (male/female), plus a smooth green
  // safety-vest overlay. This keeps the 50 workers detailed without 50x draw calls.
  function buildWalker(index){
    if(!realCharacterAssets)return buildFallbackWalker(index);
    const person=new THREE.Object3D();
    person.name='V105_REAL_WALKER_'+index;
    person.userData.realAssetV105=true;
    person.userData.assetKind=index%2===0?'male':'female';
    person.scale.setScalar(.98+(index%7)*.014);
    return person;
  }

  let seed=840417;
  function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function rr(a,b){return a+(b-a)*rnd();}

  function animateWalker(agent,dt){
    agent.stepTime+=dt*agent.speed;
    const swing=Math.sin(agent.stepTime*4.7+agent.phase);
    if(agent.person.userData.realAssetV105){
      // Whole-body micro motion only; the visible GLB itself remains a real asset.
      agent.person.position.y=.14+Math.abs(swing)*.025;
      agent.person.rotation.z=swing*.018;
      return;
    }
    const limbs=agent.person.userData.limbs;
    if(!limbs)return;
    limbs.leftArm.rotation.x=swing*.58;
    limbs.rightArm.rotation.x=-swing*.58;
    limbs.leftLeg.rotation.x=-swing*.46;
    limbs.rightLeg.rotation.x=swing*.46;
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

  // Actual V53 sidewalk polygons. This replaces the old "road width + offset"
  // approximation that could place workers on asphalt.
  const sidewalkPolys=data.layers?.sidewalk||[];

  function pointInRingWorld(x,z,ring){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];
      if((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    }
    return inside;
  }

  const sidewalkPolysWorld=sidewalkPolys.map(poly=>({
    outer:poly.outer.map(([x,y])=>{const q=corridorWarpV91.warpPx(x,y),p=mapPx(q.x,q.y);return new THREE.Vector3(p.x,.10,p.z);}),
    holes:(poly.holes||[]).map(h=>h.map(([x,y])=>{const q=corridorWarpV91.warpPx(x,y),p=mapPx(q.x,q.y);return new THREE.Vector3(p.x,.10,p.z);}))
  }));

  function insideSidewalk(x,z){
    return sidewalkPolysWorld.some(poly=>
      pointInRingWorld(x,z,poly.outer) &&
      !poly.holes.some(h=>pointInRingWorld(x,z,h))
    );
  }

  // Move each boundary vertex about 0.9 m toward whichever local normal actually
  // lies inside the sidewalk polygon. That keeps a full human body off the asphalt.
  function insetRing(ring){
    const out=[];
    const amount=.90;
    for(let i=0;i<ring.length;i++){
      const prev=ring[(i-1+ring.length)%ring.length];
      const cur=ring[i];
      const next=ring[(i+1)%ring.length];
      const tangent=next.clone().sub(prev);tangent.y=0;
      if(tangent.lengthSq()<1e-8){out.push(cur.clone());continue;}
      tangent.normalize();
      const n1=new THREE.Vector3(-tangent.z,0,tangent.x);
      const n2=n1.clone().multiplyScalar(-1);
      const c1=cur.clone().addScaledVector(n1,amount);
      const c2=cur.clone().addScaledVector(n2,amount);
      if(insideSidewalk(c1.x,c1.z))out.push(c1);
      else if(insideSidewalk(c2.x,c2.z))out.push(c2);
      else out.push(cur.clone());
    }
    return out;
  }

  const sidewalkPaths=[];
  for(const poly of sidewalkPolysWorld){
    for(const ring of [poly.outer,...poly.holes]){
      if(!ring||ring.length<3)continue;
      sidewalkPaths.push(makePath(insetRing(ring),true));
    }
  }
  if(!sidewalkPaths.length)throw new Error('V84 sidewalk polygon unavailable');

  // Normalize interior-generated portals into the local coordinate space of "world".
  // V84 interior portals were authored with localToWorld(), so using them directly under
  // a child of "world" can become wrong if world ever carries a transform.
  world.updateWorldMatrix(true,false);
  function toWorldLocalPoint(p){
    return world.worldToLocal(p.clone());
  }
  function normalizePortal(portal){
    if(!portal?.entranceWorld||!portal?.patrolWorld?.length)return null;
    return {
      ...portal,
      entranceWorld:toWorldLocalPoint(portal.entranceWorld),
      yardWorld:toWorldLocalPoint(portal.yardWorld),
      insideNearWorld:toWorldLocalPoint(portal.insideNearWorld),
      insideMidWorld:toWorldLocalPoint(portal.insideMidWorld),
      insideFarWorld:toWorldLocalPoint(portal.insideFarWorld),
      patrolWorld:portal.patrolWorld.map(toWorldLocalPoint)
    };
  }

  // Guaranteed fallback portals derived directly from the actual factory body geometry.
  // This means pedestrians never collapse to count=0 just because the interior pass failed.
  function derivePortalFromBuilding(g,index){
    if(!g)return null;
    const body=g.children.find(o=>
      o.isMesh &&
      o.geometry?.type==='BoxGeometry' &&
      o.geometry?.parameters?.height>4 &&
      o.geometry?.parameters?.width>10 &&
      o.geometry?.parameters?.depth>8
    );
    if(!body)return null;
    const {width:L,height:H,depth:D}=body.geometry.parameters;

    g.updateWorldMatrix(true,false);
    const local=(x,y,z)=>{
      const scenePoint=g.localToWorld(new THREE.Vector3(x,y,z));
      return world.worldToLocal(scenePoint);
    };
    return {
      index,
      building:g,
      L,D,H,
      derivedFallback:true,
      entranceWorld:local(0,.10,D/2+1.25),
      yardWorld:local(0,.10,D/2+5.4),
      insideNearWorld:local(0,.10,D/2-2.6),
      insideMidWorld:local(L*.10,.10,0),
      insideFarWorld:local(-L*.12,.10,-D*.22),
      patrolWorld:[
        local(-L*.30,.10,D/2+3.8),
        local(L*.30,.10,D/2+3.8),
        local(L*.30,.10,D/2+7.0),
        local(-L*.30,.10,D/2+7.0)
      ]
    };
  }

  const effectivePortals=[];
  const covered=new Set();
  for(const raw of factoryPortals){
    const p=normalizePortal(raw);
    if(!p)continue;
    effectivePortals.push(p);
    if(Number.isFinite(p.index))covered.add(p.index);
  }
  buildings.forEach((g,index)=>{
    if(covered.has(index))return;
    const p=derivePortalFromBuilding(g,index);
    if(p)effectivePortals.push(p);
  });

  const factoryPaths=[];
  const yardPaths=[];
  for(const portal of effectivePortals){
    if(!portal?.entranceWorld||!portal?.patrolWorld?.length)continue;
    const p=portal;
    const left=p.patrolWorld[0].clone();
    const right=p.patrolWorld[1].clone();

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

  const agents=[];
  let globalIndex=0;

  // Keep the intended 24/14/12 distribution when factory paths exist.
  // If they do not, reassign the missing workers to actual sidewalks instead of creating 0 people.
  const factoryTarget=factoryPaths.length?24:0;
  const yardTarget=yardPaths.length?14:0;
  const sidewalkTarget=50-factoryTarget-yardTarget;

  for(let i=0;i<factoryTarget;i++){
    const fp=factoryPaths[(i*7)%factoryPaths.length];
    const person=buildWalker(globalIndex++);
    person.userData.mode='factory';
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

  for(let i=0;i<yardTarget;i++){
    const yp=yardPaths[(i*5+3)%yardPaths.length];
    const person=buildWalker(globalIndex++);
    person.userData.mode='yard';
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

  for(let i=0;i<sidewalkTarget;i++){
    const path=sidewalkPaths[i%sidewalkPaths.length];
    const person=buildWalker(globalIndex++);
    person.userData.mode='sidewalk';
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

  let realBatches=null;
  if(realCharacterAssets){
    const maleAgents=agents.filter(a=>a.person.userData.assetKind==='male');
    const femaleAgents=agents.filter(a=>a.person.userData.assetKind==='female');

    const maleBatch=createDynamicInstancedAsset(root,characterAssets.male,maleAgents.length,{
      name:'V105_KENNEY_MALE',castShadow:true,receiveShadow:true
    });
    const femaleBatch=createDynamicInstancedAsset(root,characterAssets.female,femaleAgents.length,{
      name:'V105_KENNEY_FEMALE',castShadow:true,receiveShadow:true
    });

    maleAgents.forEach((a,i)=>{a.realBatch=maleBatch;a.realIndex=i;});
    femaleAgents.forEach((a,i)=>{a.realBatch=femaleBatch;a.realIndex=i;});

    // Green shirts / factory identity as smooth instanced safety vests.
    const vestGeo=new THREE.CapsuleGeometry(.235,.34,5,9);
    const vestBatch=new THREE.InstancedMesh(vestGeo,safetyGreenMat,agents.length);
    vestBatch.name='V105_GREEN_SAFETY_VESTS';
    vestBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    vestBatch.castShadow=true;vestBatch.receiveShadow=true;root.add(vestBatch);

    const helmetGeo=new THREE.SphereGeometry(.215,12,8,0,Math.PI*2,0,Math.PI*.60);
    const helmetBatch=new THREE.InstancedMesh(helmetGeo,helmetMat,38);
    helmetBatch.name='V105_FACTORY_HELMETS';
    helmetBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    helmetBatch.castShadow=true;root.add(helmetBatch);

    realBatches={maleBatch,femaleBatch,vestBatch,helmetBatch};
  }

  const tempMatrix=new THREE.Matrix4();
  const localVest=new THREE.Matrix4().compose(
    new THREE.Vector3(0,1.12,0),
    new THREE.Quaternion(),
    new THREE.Vector3(1.05,.90,.68)
  );
  const localHelmet=new THREE.Matrix4().makeTranslation(0,1.83,0);

  function updateRealCharacterInstances(){
    if(!realBatches)return;
    let helmetIndex=0;
    agents.forEach((agent,i)=>{
      agent.person.updateMatrix();
      agent.realBatch?.setMatrixAt(agent.realIndex,agent.person.matrix);

      tempMatrix.multiplyMatrices(agent.person.matrix,localVest);
      realBatches.vestBatch.setMatrixAt(i,tempMatrix);

      if(i<38){
        tempMatrix.multiplyMatrices(agent.person.matrix,localHelmet);
        realBatches.helmetBatch.setMatrixAt(helmetIndex++,tempMatrix);
      }
    });
    realBatches.maleBatch?.commit();
    realBatches.femaleBatch?.commit();
    realBatches.vestBatch.instanceMatrix.needsUpdate=true;
    realBatches.helmetBatch.instanceMatrix.needsUpdate=true;
  }

  let simTime=0;
  function placeAgent(agent){
    const sample=samplePath(agent.path,agent.s);
    const travel=sample.tangent.clone().multiplyScalar(agent.dir);
    agent.person.position.copy(sample.pos);
    agent.person.position.y=.14;
    agent.person.rotation.y=Math.atan2(travel.x,travel.z);
  }
  agents.forEach(placeAgent);
  updateRealCharacterInstances();

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
      animateWalker(agent,dt);

      // Natural short pauses around doors and work areas.
      if(agent.mode==='factory' && rnd()<dt*.035){
        agent.pause=rr(.25,.85);
      }
    }
    updateRealCharacterInstances();
  }

  const counts={
    factory:agents.filter(a=>a.mode==='factory').length,
    yard:agents.filter(a=>a.mode==='yard').length,
    sidewalk:agents.filter(a=>a.mode==='sidewalk').length
  };
  counts.total=agents.length;

  root.userData.counts=counts;
  root.userData.effectivePortalCount=effectivePortals.length;

  window.__DALOC_PEDESTRIANS_V84={
    ready:true,version:'105',group:root,agents,counts,
    effectivePortalCount:effectivePortals.length,
    update,setEnabled
  };

  console.info('[DaLoc] V105 real Kenney GLB pedestrians installed',{
    ...counts,
    assetMode:realCharacterAssets?'kenney-glb-instanced':'capsule-fallback',
    effectivePortals:effectivePortals.length,
    suppliedPortals:factoryPortals.length,
    buildings:buildings.length
  });

  return {
    ready:true,version:'105',group:root,count:counts.total,counts,
    effectivePortalCount:effectivePortals.length,
    update,setEnabled
  };
}
