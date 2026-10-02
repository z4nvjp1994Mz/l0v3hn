import * as THREE from 'three';

// V135 — clean FPS glove silhouette.
// No separate fingers or raised knuckle bumps. Each hand is a compact,
// continuous relaxed fist made from overlapping smooth glove volumes.

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

function ellipsoid(scale,position,material,name,segments=28){
  const m=mesh(
    new THREE.SphereGeometry(1,segments,Math.max(14,Math.floor(segments*.65))),
    material,
    name
  );
  m.scale.set(...scale);
  m.position.set(...position);
  return m;
}

function makeCleanFist(side,materials){
  const hand=new THREE.Group();
  hand.name=side<0?'FPS_LEFT_CLEAN_FIST_V135':'FPS_RIGHT_CLEAN_FIST_V135';

  // Compact back-of-glove pose: smaller and less rotated than V134.
  hand.position.set(side*.205,-.108,-.044);
  hand.rotation.set(-.085,side*.145,-side*.070);

  // Main palm: slightly flattened vertically and narrowed horizontally.
  hand.add(ellipsoid(
    [.058,.039,.066],
    [0,0,0],
    materials.glove,
    'FPS_PALM_V135'
  ));

  // Curled fingers read as ONE continuous front volume, not four separate digits.
  hand.add(ellipsoid(
    [.054,.032,.046],
    [0,-.010,-.057],
    materials.glove,
    'FPS_CURLED_FINGER_BLOCK_V135'
  ));

  // Subtle top pad shapes the back of the glove without individual knuckle bumps.
  hand.add(ellipsoid(
    [.044,.009,.037],
    [0,.036,-.021],
    materials.pad,
    'FPS_GLOVE_TOP_PAD_V135',
    22
  ));

  // Tucked thumb: one small smooth volume hugging the inside edge.
  const thumbX=-side*.047;
  const thumb=ellipsoid(
    [.017,.020,.037],
    [thumbX,-.013,-.018],
    materials.glove,
    'FPS_TUCKED_THUMB_V135',
    22
  );
  thumb.rotation.set(.18,0,-side*.48);
  hand.add(thumb);

  // Wrist transition hidden into cuff.
  hand.add(ellipsoid(
    [.043,.035,.030],
    [0,-.002,.050],
    materials.glove,
    'FPS_WRIST_TRANSITION_V135',
    22
  ));

  return hand;
}

function makeCompactArm(side,materials){
  const arm=new THREE.Group();
  arm.name=side<0?'FPS_LEFT_ARM_V135':'FPS_RIGHT_ARM_V135';

  // Preserve V134 short forearm proportions.
  const sleeveStart=[side*.405,-.335,.185];
  const sleeveEnd=[side*.245,-.145,.015];

  arm.add(segmentBetween(
    sleeveStart,
    sleeveEnd,
    .066,
    .050,
    materials.sleeve,
    'FPS_SHORT_SLEEVE_V135',
    20
  ));

  // Soft underside shading with a thinner secondary sleeve.
  const underside=segmentBetween(
    [side*.397,-.328,.177],
    [side*.255,-.153,.020],
    .052,
    .041,
    materials.sleeveDark,
    'FPS_SLEEVE_UNDERSIDE_V135',
    18
  );
  underside.scale.set(.86,1,.80);
  arm.add(underside);

  // Smaller cuff makes the wrist transition cleaner.
  arm.add(segmentBetween(
    sleeveEnd,
    [side*.213,-.112,-.020],
    .049,
    .044,
    materials.cuff,
    'FPS_CUFF_V135',
    18
  ));

  arm.add(makeCleanFist(side,materials));
  return arm;
}

export function createCleanFpsArmsV135(){
  const root=new THREE.Group();
  root.name='FPS_CLEAN_ARMS_V135';

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
    makeCompactArm(-1,materials),
    makeCompactArm(1,materials)
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
  root.userData.source='clean-continuous-fists-v135';
  return root;
}
