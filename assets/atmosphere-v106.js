import * as THREE from 'three';

// V106 — lightweight sky atmosphere.
// Goal: many visible clouds + many moving bird flocks WITHOUT post-processing.
// Clouds and birds are rendered with a handful of InstancedMesh draw calls.
export function installAtmosphereV106({
  scene,
  centerX=0,
  centerZ=0,
  spanX=1900,
  spanZ=2300,
  cloudCount=40,
  flockCount=18
}={}){
  if(!scene)throw new Error('V106 atmosphere requires scene');

  const root=new THREE.Group();
  root.name='ATMOSPHERE_V106';
  root.userData={version:106,cloudCount,flockCount};
  scene.add(root);

  let seed=1061001;
  function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function rr(a,b){return a+(b-a)*rnd();}

  // ---------------------------------------------------------------------------
  // CLOUDS — 40 cloud clusters, each made from 6–9 soft low-poly puffs.
  // Two InstancedMesh batches = main white mass + slightly darker underside.
  // ---------------------------------------------------------------------------
  const cloudMat=new THREE.MeshStandardMaterial({
    color:0xf6f7f4,
    roughness:1,
    metalness:0,
    transparent:true,
    opacity:.90,
    depthWrite:false
  });
  const cloudShadeMat=new THREE.MeshStandardMaterial({
    color:0xd9dfd7,
    roughness:1,
    metalness:0,
    transparent:true,
    opacity:.68,
    depthWrite:false
  });
  const cloudGeo=new THREE.SphereGeometry(1,10,7);

  const clouds=[];
  const puffRecords=[];
  const shadeRecords=[];
  let totalPuffs=0;
  for(let ci=0;ci<cloudCount;ci++){
    const cloud={
      x:centerX+rr(-spanX*.72,spanX*.72),
      z:centerZ+rr(-spanZ*.72,spanZ*.72),
      y:rr(285,540),
      scale:rr(.78,1.48),
      heading:rr(-.22,.22),
      speed:rr(4.5,10.5),
      bobPhase:rr(0,Math.PI*2),
      bobSpeed:rr(.025,.070)
    };
    clouds.push(cloud);

    const puffCount=6+Math.floor(rnd()*4);
    totalPuffs+=puffCount;
    for(let pi=0;pi<puffCount;pi++){
      const side=pi===0?0:rr(-1,1);
      puffRecords.push({
        cloudIndex:ci,
        ox:side*rr(14,44),
        oy:rr(-4,13),
        oz:rr(-16,16),
        sx:rr(18,34),
        sy:rr(9,18),
        sz:rr(15,30)
      });
    }

    // A few lower grey lobes give depth without SSAO/post FX.
    const shadeCount=3+Math.floor(rnd()*2);
    for(let pi=0;pi<shadeCount;pi++){
      shadeRecords.push({
        cloudIndex:ci,
        ox:rr(-31,31),
        oy:rr(-8,-2),
        oz:rr(-12,12),
        sx:rr(17,31),
        sy:rr(6,11),
        sz:rr(14,27)
      });
    }
  }

  const cloudMesh=new THREE.InstancedMesh(cloudGeo,cloudMat,puffRecords.length);
  cloudMesh.name='V106_CLOUD_PUFFS';
  cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cloudMesh.castShadow=false;
  cloudMesh.receiveShadow=false;
  cloudMesh.frustumCulled=false;
  cloudMesh.renderOrder=-2;
  root.add(cloudMesh);

  const cloudShadeMesh=new THREE.InstancedMesh(cloudGeo,cloudShadeMat,shadeRecords.length);
  cloudShadeMesh.name='V106_CLOUD_UNDERSIDES';
  cloudShadeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cloudShadeMesh.castShadow=false;
  cloudShadeMesh.receiveShadow=false;
  cloudShadeMesh.frustumCulled=false;
  cloudShadeMesh.renderOrder=-1;
  root.add(cloudShadeMesh);

  // ---------------------------------------------------------------------------
  // BIRDS — 18 independent flocks, around 9–14 birds per flock.
  // Three InstancedMesh batches total: body + left wing + right wing.
  // ---------------------------------------------------------------------------
  const birdMat=new THREE.MeshBasicMaterial({
    color:0x25302d,
    side:THREE.DoubleSide,
    toneMapped:false
  });
  const bodyGeo=new THREE.SphereGeometry(1,7,5);
  const wingGeo=new THREE.BufferGeometry();
  wingGeo.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0,
    1.55,0,.12,
    .32,0,-.72
  ],3));
  wingGeo.computeVertexNormals();

  const flocks=[];
  const birds=[];
  let birdCount=0;
  for(let fi=0;fi<flockCount;fi++){
    const count=9+Math.floor(rnd()*6);
    const heading=rr(0,Math.PI*2);
    const flock={
      x:centerX+rr(-spanX*.58,spanX*.58),
      z:centerZ+rr(-spanZ*.58,spanZ*.58),
      y:rr(95,245),
      heading,
      speed:rr(10,20),
      wavePhase:rr(0,Math.PI*2),
      waveSpeed:rr(.24,.52),
      count
    };
    flocks.push(flock);
    for(let bi=0;bi<count;bi++){
      const row=Math.ceil((bi+1)/2);
      const side=bi===0?0:(bi%2===0?1:-1);
      birds.push({
        flockIndex:fi,
        ox:side*row*rr(2.6,3.8),
        oy:rr(-2.2,2.2),
        oz:row*rr(2.0,3.1)+rr(-1.3,1.3),
        phase:rr(0,Math.PI*2),
        scale:rr(.85,1.34)
      });
    }
    birdCount+=count;
  }

  const bodyMesh=new THREE.InstancedMesh(bodyGeo,birdMat,birdCount);
  bodyMesh.name='V106_BIRD_BODIES';
  bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bodyMesh.frustumCulled=false;
  root.add(bodyMesh);

  const leftWingMesh=new THREE.InstancedMesh(wingGeo,birdMat,birdCount);
  leftWingMesh.name='V106_BIRD_LEFT_WINGS';
  leftWingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  leftWingMesh.frustumCulled=false;
  root.add(leftWingMesh);

  const rightWingMesh=new THREE.InstancedMesh(wingGeo,birdMat,birdCount);
  rightWingMesh.name='V106_BIRD_RIGHT_WINGS';
  rightWingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rightWingMesh.frustumCulled=false;
  root.add(rightWingMesh);

  let elapsed=0;
  let enabled=true;
  let cloudFrame=0;
  const matrix=new THREE.Matrix4();
  const quaternion=new THREE.Quaternion();
  const euler=new THREE.Euler();
  const position=new THREE.Vector3();
  const scale=new THREE.Vector3();

  function composeAt(mesh,index,x,y,z,rx,ry,rz,sx,sy,sz){
    position.set(x,y,z);
    euler.set(rx,ry,rz);
    quaternion.setFromEuler(euler);
    scale.set(sx,sy,sz);
    matrix.compose(position,quaternion,scale);
    mesh.setMatrixAt(index,matrix);
  }

  function updateCloudInstances(){
    let i=0;
    for(const p of puffRecords){
      const c=clouds[p.cloudIndex];
      const bob=Math.sin(elapsed*c.bobSpeed+c.bobPhase)*3.8;
      const cs=c.scale;
      composeAt(
        cloudMesh,i++,
        c.x+p.ox*cs,
        c.y+p.oy*cs+bob,
        c.z+p.oz*cs,
        0,c.heading*.15,0,
        p.sx*cs,p.sy*cs,p.sz*cs
      );
    }
    cloudMesh.instanceMatrix.needsUpdate=true;

    i=0;
    for(const p of shadeRecords){
      const c=clouds[p.cloudIndex];
      const bob=Math.sin(elapsed*c.bobSpeed+c.bobPhase)*3.8;
      const cs=c.scale;
      composeAt(
        cloudShadeMesh,i++,
        c.x+p.ox*cs,
        c.y+p.oy*cs+bob,
        c.z+p.oz*cs,
        0,c.heading*.15,0,
        p.sx*cs,p.sy*cs,p.sz*cs
      );
    }
    cloudShadeMesh.instanceMatrix.needsUpdate=true;
  }

  function updateBirdInstances(){
    let index=0;
    for(const b of birds){
      const f=flocks[b.flockIndex];
      const ch=Math.cos(f.heading),sh=Math.sin(f.heading);
      const localX=b.ox;
      const localZ=b.oz;
      const x=f.x+localX*ch-localZ*sh;
      const z=f.z+localX*sh+localZ*ch;
      const y=f.y+b.oy+Math.sin(elapsed*f.waveSpeed+f.wavePhase+b.phase)*2.4;
      const wing=Math.sin(elapsed*8.4+b.phase)*.62;
      const s=b.scale;

      // Body is stretched along local forward Z.
      composeAt(bodyMesh,index,x,y,z,0,f.heading,0,.24*s,.18*s,.78*s);

      // Wing geometry extends along local +X; mirror X for the left wing.
      composeAt(leftWingMesh,index,x,y,z,0,f.heading,wing,-1.55*s,1.0*s,1.0*s);
      composeAt(rightWingMesh,index,x,y,z,0,f.heading,-wing,1.55*s,1.0*s,1.0*s);
      index++;
    }
    bodyMesh.instanceMatrix.needsUpdate=true;
    leftWingMesh.instanceMatrix.needsUpdate=true;
    rightWingMesh.instanceMatrix.needsUpdate=true;
  }

  function update(dt){
    if(!enabled||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.05);
    elapsed+=dt;

    // Cloud positions are slow, so matrices are refreshed every 3rd frame.
    for(const c of clouds){
      c.x+=Math.cos(c.heading)*c.speed*dt;
      c.z+=Math.sin(c.heading)*c.speed*dt;
      const padX=spanX*.86,padZ=spanZ*.86;
      if(c.x>centerX+padX)c.x=centerX-padX;
      else if(c.x<centerX-padX)c.x=centerX+padX;
      if(c.z>centerZ+padZ)c.z=centerZ-padZ;
      else if(c.z<centerZ-padZ)c.z=centerZ+padZ;
    }
    cloudFrame=(cloudFrame+1)%3;
    if(cloudFrame===0)updateCloudInstances();

    for(const f of flocks){
      const sway=Math.sin(elapsed*.11+f.wavePhase)*.08;
      const heading=f.heading+sway;
      f.x+=Math.sin(heading)*f.speed*dt;
      f.z+=Math.cos(heading)*f.speed*dt;
      const padX=spanX*.72,padZ=spanZ*.72;
      if(f.x>centerX+padX)f.x=centerX-padX;
      else if(f.x<centerX-padX)f.x=centerX+padX;
      if(f.z>centerZ+padZ)f.z=centerZ-padZ;
      else if(f.z<centerZ-padZ)f.z=centerZ+padZ;
    }
    updateBirdInstances();
  }

  function setEnabled(v){
    enabled=!!v;
    root.visible=enabled;
  }

  updateCloudInstances();
  updateBirdInstances();

  const stats={
    cloudClusters:cloudCount,
    cloudPuffs:totalPuffs,
    flockCount,
    birdCount,
    drawCalls:5
  };
  root.userData.stats=stats;

  const controller={ready:true,version:106,group:root,stats,update,setEnabled};
  window.__DALOC_ATMOSPHERE_V106=controller;
  console.info('[DaLoc] V106 lightweight clouds + bird flocks installed',stats);
  return controller;
}
