import * as THREE from 'three';

// V134 — compact unarmed FPS stance.
// Short visible forearms + smooth relaxed tactical fists. The hand silhouette is
// intentionally continuous: palm/finger mass/knuckles overlap like a real glove,
// avoiding the "separate tube fingers" look from V133.

function mesh(geometry,material,name){
  const m=new THREE.Mesh(geometry,material);
  m.name=name;
  m.frustumCulled=false;
  m.castShadow=false;
  m.receiveShadow=false;
  return m;
}

function segmentBetween(a,b,r0,r1,material,name,radial=18){
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

function ellipsoid(scale,position,material,name,segments=24){
  const m=mesh(
    new THREE.SphereGeometry(1,segments,Math.max(12,Math.floor(segments*.65))),
    material,
    name
  );
  m.scale.set(...scale);
  m.position.set(...position);
  return m;
}

function makeRelaxedFist(side,materials){
  const hand=new THREE.Group();
  hand.name=side<0?'FPS_LEFT_RELAXED_FIST_V134':'FPS_RIGHT_RELAXED_FIST_V134';

  // Small inward-facing fist, not a claw/open palm.
  hand.position.set(side*.205,-.105,-.040);
  hand.rotation.set(-.10,side*.18,-side*.10);

  // Palm body.
  hand.add(ellipsoid(
    [.068,.046,.078],
    [0,0,0],
    materials.glove,
    'FPS_PALM_V134'
  ));

  // Curled finger mass overlaps the palm to create one continuous fist silhouette.
  hand.add(ellipsoid(
    [.066,.040,.060],
    [0,-.010,-.066],
    materials.glove,
    'FPS_CURLED_FINGERS_MASS_V134'
  ));

  // Four small knuckle pads embedded into the upper/front surface.
  const xs=[-.041,-.014,.014,.041];
  const heights=[.026,.031,.031,.025];
  const sizes=[.016,.0175,.0175,.0155];
  for(let i=0;i<4;i++){
    const k=ellipsoid(
      [sizes[i],.010,.018],
      [xs[i],heights[i],-.060],
      materials.pad,
      'FPS_KNUCKLE_'+i+'_V134',
      16
    );
    hand.add(k);
  }

  // Thumb folded diagonally across the inside of the fist.
  const thumbStart=[-side*.050,-.002,-.010];
  const thumbEnd=[-side*.066,-.026,-.060];
  const thumb=segmentBetween(
    thumbStart,
    thumbEnd,
    .0155,
    .012,
    materials.glove,
    'FPS_THUMB_V134',
    14
  );
  hand.add(thumb);

  // Soft wrist transition hidden partially inside the cuff.
  hand.add(ellipsoid(
    [.049,.040,.038],
    [side*.002,-.002,.052],
    materials.glove,
    'FPS_WRIST_GLOVE_V134',
    20
  ));

  return hand;
}

function makeCompactArm(side,materials){
  const arm=new THREE.Group();
  arm.name=side<0?'FPS_LEFT_COMPACT_ARM_V134':'FPS_RIGHT_COMPACT_ARM_V134';

  // Only the lower third of each forearm is intended to remain visible.
  const sleeveStart=[side*.405,-.335,.185];
  const sleeveEnd=[side*.245,-.145,.015];

  arm.add(segmentBetween(
    sleeveStart,
    sleeveEnd,
    .069,
    .052,
    materials.sleeve,
    'FPS_SHORT_SLEEVE_V134',
    20
  ));

  // Slight darker underside gives shape without adding another bulky limb.
  const underside=segmentBetween(
    [side*.395,-.326,.175],
    [side*.255,-.153,.020],
    .056,
    .043,
    materials.sleeveDark,
    'FPS_SLEEVE_UNDERSIDE_V134',
    18
  );
  underside.scale.set(.86,1,.80);
  arm.add(underside);

  // Compact cuff at wrist.
  arm.add(segmentBetween(
    sleeveEnd,
    [side*.213,-.112,-.020],
    .052,
    .047,
    materials.cuff,
    'FPS_CUFF_V134',
    18
  ));

  arm.add(makeRelaxedFist(side,materials));
  return arm;
}

export function createCompactFpsArmsV134(){
  const root=new THREE.Group();
  root.name='FPS_COMPACT_ARMS_V134';

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
      roughness:.80,
      metalness:.015,
      side:THREE.DoubleSide,
      fog:false
    }),
    pad:new THREE.MeshStandardMaterial({
      color:0x464d49,
      roughness:.73,
      metalness:.02,
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
  root.userData.source='compact-relaxed-fists-v134';
  return root;
}
