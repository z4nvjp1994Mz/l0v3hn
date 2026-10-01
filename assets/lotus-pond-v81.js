import * as THREE from 'three';

// V81 — Vietnamese lotus pond.
// Source-locked to the existing central pond ellipse: center 1053.34,850.71,
// radii 33.5 x 23.5 source pixels, rotated -8 degrees.
export function installLotusPondV81({world,mapPx,metersPerPixel}){
  const root=new THREE.Group();
  root.name='LOTUS_POND_V81';
  root.userData={version:81,type:'Vietnamese lotus pond'};
  world.add(root);

  const centerPx={x:1053.34,y:850.71};
  const pondCenter=mapPx(centerPx.x,centerPx.y);
  const rx=33.5*metersPerPixel;
  const rz=23.5*metersPerPixel;
  const pondAngle=THREE.MathUtils.degToRad(-8);

  let seed=8101987;
  function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function rr(a,b){return a+(b-a)*rnd();}

  function ellipsePoint(edgeBias=1){
    // sqrt(r) gives visually even coverage; edgeBias<1 biases slightly outward.
    const a=rr(0,Math.PI*2);
    const r=Math.pow(rnd(),edgeBias*.5)*.90;
    let x=Math.cos(a)*rx*r;
    let z=Math.sin(a)*rz*r;
    const ca=Math.cos(pondAngle),sa=Math.sin(pondAngle);
    return {
      x:pondCenter.x+x*ca-z*sa,
      z:pondCenter.z+x*sa+z*ca,
      radial:r,
      a
    };
  }

  // Materials.
  const leafMats=[
    new THREE.MeshStandardMaterial({color:0x4f8f4f,roughness:.88,side:THREE.DoubleSide}),
    new THREE.MeshStandardMaterial({color:0x5d9e55,roughness:.88,side:THREE.DoubleSide}),
    new THREE.MeshStandardMaterial({color:0x3f7f47,roughness:.90,side:THREE.DoubleSide})
  ];
  const pinkOuterMat=new THREE.MeshStandardMaterial({color:0xf09bad,roughness:.62,side:THREE.DoubleSide});
  const pinkInnerMat=new THREE.MeshStandardMaterial({color:0xf8c1cd,roughness:.58,side:THREE.DoubleSide});
  const whiteOuterMat=new THREE.MeshStandardMaterial({color:0xf4eee8,roughness:.62,side:THREE.DoubleSide});
  const whiteInnerMat=new THREE.MeshStandardMaterial({color:0xfffbf7,roughness:.58,side:THREE.DoubleSide});
  const seedMat=new THREE.MeshStandardMaterial({color:0xd7b84e,roughness:.70});
  const stemMat=new THREE.MeshStandardMaterial({color:0x537f48,roughness:.92});
  const budPinkMat=new THREE.MeshStandardMaterial({color:0xd97f97,roughness:.65});
  const budWhiteMat=new THREE.MeshStandardMaterial({color:0xeee7df,roughness:.65});

  // Lotus leaf shape with a small V-notch.
  const leafShape=new THREE.Shape();
  const leafSegments=36;
  const start=.30,end=Math.PI*2-.30;
  leafShape.moveTo(0,0);
  for(let i=0;i<=leafSegments;i++){
    const a=THREE.MathUtils.lerp(start,end,i/leafSegments);
    leafShape.lineTo(Math.cos(a),Math.sin(a));
  }
  leafShape.closePath();
  const leafGeo=new THREE.ShapeGeometry(leafShape);

  const leafCount=220;
  const leavesByMat=[[],[],[]];
  for(let i=0;i<leafCount;i++){
    const p=ellipsePoint(.88);
    const edgeScale=.78+.28*(1-p.radial);
    leavesByMat[i%3].push({
      ...p,
      scale:rr(.80,1.65)*edgeScale,
      rot:rr(0,Math.PI*2),
      y:.52+rr(-.015,.025)
    });
  }

  function fillLeaves(items,mat){
    const mesh=new THREE.InstancedMesh(leafGeo,mat,items.length);
    const dummy=new THREE.Object3D();
    items.forEach((p,i)=>{
      dummy.position.set(p.x,p.y,p.z);
      dummy.rotation.set(-Math.PI/2,0,p.rot);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.receiveShadow=true;
    mesh.name='V81_LOTUS_LEAVES';
    root.add(mesh);
  }
  leavesByMat.forEach((items,i)=>fillLeaves(items,leafMats[i]));

  const flowerCount=78;
  const budCount=36;
  const flowerData=[];
  for(let i=0;i<flowerCount;i++){
    const p=ellipsePoint(.92);
    flowerData.push({
      ...p,
      white:i%8===0,
      scale:rr(.88,1.22),
      height:rr(.86,1.65),
      rot:rr(0,Math.PI*2)
    });
  }

  // Shared petal geometry. Instances are arranged into two flower layers.
  const petalGeo=new THREE.SphereGeometry(.34,8,6);
  const outerPink=[],innerPink=[],outerWhite=[],innerWhite=[];
  const stems=[];
  const centers=[];

  for(const f of flowerData){
    stems.push(f);
    centers.push(f);

    const outer=f.white?outerWhite:outerPink;
    const inner=f.white?innerWhite:innerPink;

    for(let k=0;k<10;k++){
      const a=f.rot+k*Math.PI*2/10;
      outer.push({
        x:f.x+Math.cos(a)*.48*f.scale,
        y:.54+f.height,
        z:f.z+Math.sin(a)*.48*f.scale,
        a,
        scale:f.scale
      });
    }
    for(let k=0;k<7;k++){
      const a=f.rot+.22+k*Math.PI*2/7;
      inner.push({
        x:f.x+Math.cos(a)*.27*f.scale,
        y:.62+f.height,
        z:f.z+Math.sin(a)*.27*f.scale,
        a,
        scale:f.scale*.84
      });
    }
  }

  function fillPetals(items,mat,inner=false){
    const mesh=new THREE.InstancedMesh(petalGeo,mat,items.length);
    const dummy=new THREE.Object3D();
    items.forEach((p,i)=>{
      dummy.position.set(p.x,p.y,p.z);
      dummy.rotation.set(inner?-.48:-.30,p.a,0);
      dummy.scale.set(.62*p.scale,.22*p.scale,1.42*p.scale);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.castShadow=true;
    mesh.name='V81_LOTUS_PETALS';
    root.add(mesh);
  }
  fillPetals(outerPink,pinkOuterMat,false);
  fillPetals(innerPink,pinkInnerMat,true);
  fillPetals(outerWhite,whiteOuterMat,false);
  fillPetals(innerWhite,whiteInnerMat,true);

  // Flower stems.
  const stemGeo=new THREE.CylinderGeometry(.055,.075,1,6);
  const stemMesh=new THREE.InstancedMesh(stemGeo,stemMat,stems.length);
  const sd=new THREE.Object3D();
  stems.forEach((f,i)=>{
    const h=f.height+.16;
    sd.position.set(f.x,.50+h*.5,f.z);
    sd.rotation.set(0,0,0);
    sd.scale.set(1,h,1);
    sd.updateMatrix();stemMesh.setMatrixAt(i,sd.matrix);
  });
  stemMesh.instanceMatrix.needsUpdate=true;
  root.add(stemMesh);

  // Yellow lotus seed heads.
  const seedGeo=new THREE.CylinderGeometry(.18,.24,.18,10);
  const seedMesh=new THREE.InstancedMesh(seedGeo,seedMat,centers.length);
  const cd=new THREE.Object3D();
  centers.forEach((f,i)=>{
    cd.position.set(f.x,.74+f.height,f.z);
    cd.rotation.set(0,f.rot,0);
    cd.scale.setScalar(f.scale);
    cd.updateMatrix();seedMesh.setMatrixAt(i,cd.matrix);
  });
  seedMesh.instanceMatrix.needsUpdate=true;
  seedMesh.castShadow=true;
  root.add(seedMesh);

  // Buds.
  const budsPink=[],budsWhite=[];
  for(let i=0;i<budCount;i++){
    const p=ellipsePoint(.90);
    const item={...p,height:rr(1.0,1.9),scale:rr(.82,1.16)};
    (i%7===0?budsWhite:budsPink).push(item);
  }

  const budGeo=new THREE.SphereGeometry(.28,8,6);
  function fillBuds(items,mat){
    const mesh=new THREE.InstancedMesh(budGeo,mat,items.length);
    const stem=new THREE.InstancedMesh(stemGeo,stemMat,items.length);
    const d=new THREE.Object3D();
    items.forEach((p,i)=>{
      d.position.set(p.x,.62+p.height,p.z);
      d.rotation.set(0,rr(0,Math.PI*2),0);
      d.scale.set(.72*p.scale,1.38*p.scale,.72*p.scale);
      d.updateMatrix();mesh.setMatrixAt(i,d.matrix);

      const h=p.height+.20;
      d.position.set(p.x,.50+h*.5,p.z);
      d.rotation.set(0,0,0);
      d.scale.set(1,h,1);
      d.updateMatrix();stem.setMatrixAt(i,d.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    stem.instanceMatrix.needsUpdate=true;
    mesh.castShadow=true;
    root.add(stem,mesh);
  }
  fillBuds(budsPink,budPinkMat);
  fillBuds(budsWhite,budWhiteMat);

  root.userData.leafCount=leafCount;
  root.userData.flowerCount=flowerCount;
  root.userData.budCount=budCount;

  window.__DALOC_LOTUS_V81={
    ready:true,version:81,group:root,
    leafCount,flowerCount,budCount
  };

  console.info('[DaLoc] V81 Vietnamese lotus pond installed',{
    leaves:leafCount,flowers:flowerCount,buds:budCount
  });

  return {ready:true,version:81,group:root,leafCount,flowerCount,budCount};
}
