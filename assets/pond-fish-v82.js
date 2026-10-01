import * as THREE from 'three';

// V82 animated fish for the Vietnamese lotus pond.
// Fish remain inside the exact source-locked pond ellipse and swim near the surface
// so they remain visible below the lotus canopy.
export function installPondFishV82({world,mapPx,metersPerPixel}){
  const root=new THREE.Group();
  root.name='POND_FISH_V82';
  root.userData={version:82,type:'animated lotus pond fish'};
  world.add(root);

  const centerPx={x:1053.34,y:850.71};
  const c=mapPx(centerPx.x,centerPx.y);
  const rx=33.5*metersPerPixel;
  const rz=23.5*metersPerPixel;
  const pondRot=THREE.MathUtils.degToRad(-8);

  let seed=821027;
  function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function rr(a,b){return a+(b-a)*rnd();}

  const fishCount=120;
  const materials=[
    new THREE.MeshStandardMaterial({color:0xe66c22,roughness:.46,metalness:.04}),
    new THREE.MeshStandardMaterial({color:0xd43e32,roughness:.44,metalness:.05}),
    new THREE.MeshStandardMaterial({color:0xf0d36a,roughness:.48,metalness:.04}),
    new THREE.MeshStandardMaterial({color:0xf3efe3,roughness:.44,metalness:.04}),
    new THREE.MeshStandardMaterial({color:0x7a4c2d,roughness:.50,metalness:.03})
  ];
  const tailMats=materials;

  const bodyGeo=new THREE.SphereGeometry(1,10,7);
  const tailGeo=new THREE.ConeGeometry(.46,.95,3);
  tailGeo.rotateX(Math.PI/2);

  const groups=materials.map((mat,i)=>({
    body:new THREE.InstancedMesh(bodyGeo,mat,0),
    tail:new THREE.InstancedMesh(tailGeo,tailMats[i],0),
    fish:[]
  }));

  const fish=[];
  for(let i=0;i<fishCount;i++){
    const color=i%materials.length;
    const school=i%7;
    const agent={
      index:i,color,school,
      phase:rr(0,Math.PI*2),
      speed:rr(.24,.52)*(i%2===0?1:-1),
      radiusX:rr(.20,.82),
      radiusZ:rr(.20,.82),
      wobble:rr(.06,.18),
      wobbleSpeed:rr(.65,1.35),
      scale:rr(.38,.72),
      depth:rr(.365,.435),
      phase2:rr(0,Math.PI*2)
    };
    fish.push(agent);
    groups[color].fish.push(agent);
  }

  // Rebuild instanced meshes with final counts.
  groups.forEach((g,i)=>{
    const body=new THREE.InstancedMesh(bodyGeo,materials[i],g.fish.length);
    const tail=new THREE.InstancedMesh(tailGeo,tailMats[i],g.fish.length);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    body.name='V82_FISH_BODY_'+i;
    tail.name='V82_FISH_TAIL_'+i;
    root.add(body,tail);
    g.body=body;g.tail=tail;
  });

  function localEllipse(agent,time){
    const a=agent.phase+time*agent.speed;
    const schoolOffset=(agent.school-3)*.012;
    const rX=rx*(agent.radiusX+schoolOffset);
    const rZ=rz*(agent.radiusZ+schoolOffset);
    const wob=Math.sin(time*agent.wobbleSpeed+agent.phase2)*agent.wobble;
    const x=Math.cos(a)*rX*(1+wob*.12);
    const z=Math.sin(a)*rZ*(1-wob*.10);

    // Tangent in local pond coordinates.
    const dx=-Math.sin(a)*rX*agent.speed;
    const dz=Math.cos(a)*rZ*agent.speed;

    const ca=Math.cos(pondRot),sa=Math.sin(pondRot);
    return {
      x:c.x+x*ca-z*sa,
      z:c.z+x*sa+z*ca,
      tx:dx*ca-dz*sa,
      tz:dx*sa+dz*ca
    };
  }

  const dummy=new THREE.Object3D();
  let time=0,enabled=true;

  function update(dt){
    if(!enabled||!Number.isFinite(dt)||dt<=0)return;
    time+=Math.min(dt,.05);

    for(const g of groups){
      g.fish.forEach((f,i)=>{
        const p=localEllipse(f,time);
        const heading=Math.atan2(p.tx,p.tz);
        const s=f.scale;

        dummy.position.set(p.x,f.depth,p.z);
        dummy.rotation.set(0,heading,0);
        dummy.scale.set(.54*s,.28*s,1.08*s);
        dummy.updateMatrix();
        g.body.setMatrixAt(i,dummy.matrix);

        const back=.94*s;
        const tailX=p.x-Math.sin(heading)*back;
        const tailZ=p.z-Math.cos(heading)*back;
        dummy.position.set(tailX,f.depth,p.z+(tailZ-p.z));
        dummy.rotation.set(Math.PI/2,heading,Math.sin(time*8+f.phase2)*.34);
        dummy.scale.set(.62*s,.62*s,.62*s);
        dummy.updateMatrix();
        g.tail.setMatrixAt(i,dummy.matrix);
      });
      g.body.instanceMatrix.needsUpdate=true;
      g.tail.instanceMatrix.needsUpdate=true;
    }
  }

  // Prime matrices so fish are visible before first animation frame.
  update(.016);

  function setEnabled(v){
    enabled=!!v;
    root.visible=enabled;
  }

  window.__DALOC_FISH_V82={
    ready:true,version:82,group:root,fishCount,update,setEnabled
  };

  console.info('[DaLoc] V82 pond fish installed',{fish:fishCount});

  return {ready:true,version:82,group:root,fishCount,update,setEnabled};
}
