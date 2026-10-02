import * as THREE from 'three';

// V136 — low-profile FPS glove viewmodel.
// Deliberately avoids full procedural finger anatomy. Each hand is a single
// smooth mitten-like glove volume, positioned low in the frame like real FPS games.

function mesh(geometry,material,name){
  const m=new THREE.Mesh(geometry,material);
  m.name=name;
  m.frustumCulled=false;
  m.castShadow=false;
  m.receiveShadow=false;
  return m;
}

function segmentBetween(a,b,r0,r1,material,name,radial=20){
  const A=new THREE.Vector3(...a);
  const B=new THREE.Vector3(...b);
  const dir=B.clone().sub(A);
  const len=Math.max(.001,dir.length());
  const g=new THREE.CylinderGeometry(r1,r0,len,radial,2,false);
  const m=mesh(g,material,name);
  m.position.copy(A).lerp(B,.5);
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0,1,0),
    dir.normalize()
  );
  return m;
}

function makeMitten(side,materials){
  const hand=new THREE.Group();
  hand.name=side<0?'FPS_LEFT_MITTEN_V136':'FPS_RIGHT_MITTEN_V136';

  // Keep hands low and outward so only a natural upper glove silhouette is visible.
  hand.position.set(side*.292,-.195,-.060);
  hand.rotation.set(-.18,side*.12,-side*.12);

  // Main glove: one continuous capsule, oriented into the scene.
  const glove=mesh(
    new THREE.CapsuleGeometry(.034,.050,8,16),
    materials.glove,
    'FPS_MITTEN_MAIN_V136'
  );
  glove.rotation.x=Math.PI/2;
  glove.scale.set(1.12,.78,1.06);
  hand.add(glove);

  // Slightly flattened back-of-hand pad gives tactical depth without finger bumps.
  const pad=mesh(
    new THREE.SphereGeometry(1,20,12),
    materials.pad,
    'FPS_MITTEN_PAD_V136'
  );
  pad.scale.set(.037,.007,.031);
  pad.position.set(0,.031,-.006);
  hand.add(pad);

  // Short wrist bell blends into cuff.
  const wrist=mesh(
    new THREE.CylinderGeometry(.038,.043,.050,18,1,false),
    materials.glove,
    'FPS_MITTEN_WRIST_V136'
  );
  wrist.rotation.x=Math.PI/2;
  wrist.position.z=.050;
  hand.add(wrist);

  return hand;
}

function makeArm(side,materials){
  const arm=new THREE.Group();
  arm.name=side<0?'FPS_LEFT_LOW_ARM_V136':'FPS_RIGHT_LOW_ARM_V136';

  // Shorter, lower forearms: most of the limb starts off-screen.
  const sleeveStart=[side*.455,-.395,.215];
  const sleeveEnd=[side*.315,-.225,.005];

  arm.add(segmentBetween(
    sleeveStart,
    sleeveEnd,
    .064,
    .048,
    materials.sleeve,
    'FPS_LOW_SLEEVE_V136',
    20
  ));

  const underside=segmentBetween(
    [side*.447,-.388,.205],
    [side*.322,-.234,.010],
    .050,
    .039,
    materials.sleeveDark,
    'FPS_LOW_SLEEVE_UNDERSIDE_V136',
    18
  );
  underside.scale.set(.86,1,.80);
  arm.add(underside);

  arm.add(segmentBetween(
    sleeveEnd,
    [side*.298,-.202,-.035],
    .047,
    .042,
    materials.cuff,
    'FPS_LOW_CUFF_V136',
    18
  ));

  arm.add(makeMitten(side,materials));
  return arm;
}

export function createLowProfileFpsArmsV136(){
  const root=new THREE.Group();
  root.name='FPS_LOW_PROFILE_ARMS_V136';

  const materials={
    sleeve:new THREE.MeshStandardMaterial({
      color:0x355f4a,
      roughness:.91,
      metalness:0,
      side:THREE.DoubleSide,
      fog:false
    }),
    sleeveDark:new THREE.MeshStandardMaterial({
      color:0x294a3b,
      roughness:.95,
      metalness:0,
      side:THREE.DoubleSide,
      fog:false
    }),
    cuff:new THREE.MeshStandardMaterial({
      color:0x252d29,
      roughness:.90,
      metalness:.01,
      side:THREE.DoubleSide,
      fog:false
    }),
    glove:new THREE.MeshStandardMaterial({
      color:0x303633,
      roughness:.82,
      metalness:.01,
      side:THREE.DoubleSide,
      fog:false
    }),
    pad:new THREE.MeshStandardMaterial({
      color:0x454b48,
      roughness:.76,
      metalness:.015,
      side:THREE.DoubleSide,
      fog:false
    })
  };

  root.add(
    makeArm(-1,materials),
    makeArm(1,materials)
  );

  let triangles=0;
  root.traverse(o=>{
    if(!o.isMesh)return;
    o.frustumCulled=false;
    const g=o.geometry;
    triangles+=g.index
      ?g.index.count/3
      :(g.attributes.position?.count||0)/3;
  });

  root.userData.ignoreFpsCollision=true;
  root.userData.triangles=triangles;
  root.userData.source='low-profile-mitten-v136';
  return root;
}
