import * as THREE from 'three';

// V133 — smooth tactical FPS hands.
// Purpose-built for a first-person overlay: tapered sleeves, slim wrists,
// flattened palms and individually curved/tapered fingers.

function mesh(geometry,material,name){
  const m=new THREE.Mesh(geometry,material);
  m.name=name;
  m.frustumCulled=false;
  m.castShadow=false;
  m.receiveShadow=false;
  return m;
}

function segmentBetween(a,b,r0,r1,material,name,radial=16){
  const A=new THREE.Vector3(...a);
  const B=new THREE.Vector3(...b);
  const d=B.clone().sub(A);
  const len=Math.max(.001,d.length());
  const g=new THREE.CylinderGeometry(r1,r0,len,radial,2,false);
  const m=mesh(g,material,name);
  m.position.copy(A).lerp(B,.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  return m;
}

function curvedTube(points,radii,material,name,radial=10){
  const pts=points.map(p=>new THREE.Vector3(...p));
  const rings=pts.length;
  const pos=[];
  const idx=[];

  for(let i=0;i<rings;i++){
    const prev=pts[Math.max(0,i-1)];
    const next=pts[Math.min(rings-1,i+1)];
    const tangent=next.clone().sub(prev).normalize();
    const ref=Math.abs(tangent.y)<.88
      ?new THREE.Vector3(0,1,0)
      :new THREE.Vector3(1,0,0);
    const normal=new THREE.Vector3().crossVectors(tangent,ref).normalize();
    const binormal=new THREE.Vector3().crossVectors(tangent,normal).normalize();
    const r=radii[i];

    for(let j=0;j<radial;j++){
      const a=j/radial*Math.PI*2;
      const v=pts[i].clone()
        .addScaledVector(normal,Math.cos(a)*r)
        .addScaledVector(binormal,Math.sin(a)*r);
      pos.push(v.x,v.y,v.z);
    }
  }

  for(let i=0;i<rings-1;i++){
    for(let j=0;j<radial;j++){
      const n=(j+1)%radial;
      const a=i*radial+j;
      const b=i*radial+n;
      const c=(i+1)*radial+j;
      const d=(i+1)*radial+n;
      idx.push(a,c,b,b,c,d);
    }
  }

  // End cap at fingertip.
  const tipIndex=pos.length/3;
  const tip=pts[rings-1];
  pos.push(tip.x,tip.y,tip.z);
  const last=(rings-1)*radial;
  for(let j=0;j<radial;j++){
    const n=(j+1)%radial;
    idx.push(last+j,tipIndex,last+n);
  }

  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return mesh(g,material,name);
}

function makeHand(side,materials){
  const hand=new THREE.Group();
  hand.name=side<0?'FPS_LEFT_HAND_V133':'FPS_RIGHT_HAND_V133';

  // Hand centers sit much closer together than the old Kenney blocks.
  hand.position.set(side*.175,-.025,0);
  hand.rotation.set(-.055,side*.105,-side*.045);

  const palmGeo=new THREE.SphereGeometry(1,24,16);
  const palm=mesh(palmGeo,materials.glove,'FPS_GLOVE_PALM_V133');
  palm.scale.set(.073,.040,.092);
  palm.position.set(0,0,0);
  hand.add(palm);

  // Soft tactical back plate, embedded into the glove instead of floating.
  const plate=mesh(
    new THREE.SphereGeometry(1,20,12),
    materials.pad,
    'FPS_GLOVE_BACK_PLATE_V133'
  );
  plate.scale.set(.056,.011,.054);
  plate.position.set(0,.037,-.010);
  hand.add(plate);

  // Four fingers: index/middle/ring/pinky with natural length differences.
  const fingerX=[-.046,-.015,.016,.046];
  const fingerLen=[.112,.123,.116,.096];
  const fingerR=[.0148,.0154,.0150,.0137];

  for(let i=0;i<4;i++){
    const x=fingerX[i];
    const L=fingerLen[i];
    const r=fingerR[i];
    const spread=(i-1.5)*.004;
    const pts=[
      [x,-.006,-.060],
      [x+spread*.20,-.008,-.060-L*.25],
      [x+spread*.55,-.013,-.060-L*.52],
      [x+spread*.85,-.023,-.060-L*.76],
      [x+spread,-.038,-.060-L]
    ];
    const radii=[r,r*.97,r*.90,r*.80,r*.64];
    hand.add(curvedTube(
      pts,
      radii,
      materials.glove,
      'FPS_FINGER_'+i+'_V133',
      10
    ));
  }

  // Thumb folds naturally toward the center, not straight at the camera.
  const thumbSide=-side;
  const tx=thumbSide*.060;
  const thumbPts=[
    [tx,-.010,.005],
    [thumbSide*.079,-.018,-.020],
    [thumbSide*.090,-.030,-.052],
    [thumbSide*.084,-.043,-.082]
  ];
  hand.add(curvedTube(
    thumbPts,
    [.017,.016,.014,.0105],
    materials.glove,
    'FPS_THUMB_V133',
    10
  ));

  return hand;
}

function makeArm(side,materials){
  const arm=new THREE.Group();
  arm.name=side<0?'FPS_LEFT_ARM_V133':'FPS_RIGHT_ARM_V133';

  const forearmStart=[side*.405,-.355,.325];
  const forearmEnd=[side*.195,-.050,.092];

  // Slim tapered sleeve rather than the oversized rectangular V132 forearm.
  arm.add(segmentBetween(
    forearmStart,
    forearmEnd,
    .074,
    .052,
    materials.sleeve,
    'FPS_FOREARM_SLEEVE_V133',
    18
  ));

  // Subtle fabric panel adds depth without turning the arm into a block.
  const panel=segmentBetween(
    [side*.385,-.330,.304],
    [side*.210,-.070,.108],
    .060,
    .043,
    materials.sleeveDark,
    'FPS_FOREARM_PANEL_V133',
    16
  );
  panel.scale.set(.82,1,.72);
  arm.add(panel);

  // Glove cuff bridges sleeve to hand.
  arm.add(segmentBetween(
    forearmEnd,
    [side*.177,-.030,.060],
    .053,
    .049,
    materials.cuff,
    'FPS_GLOVE_CUFF_V133',
    16
  ));

  arm.add(makeHand(side,materials));
  return arm;
}

export function createTacticalFpsArmsV133(){
  const root=new THREE.Group();
  root.name='FPS_TACTICAL_ARMS_V133';

  const materials={
    sleeve:new THREE.MeshStandardMaterial({
      color:0x355d49,
      roughness:.92,
      metalness:0,
      side:THREE.DoubleSide,
      fog:false
    }),
    sleeveDark:new THREE.MeshStandardMaterial({
      color:0x274638,
      roughness:.95,
      metalness:0,
      side:THREE.DoubleSide,
      fog:false
    }),
    cuff:new THREE.MeshStandardMaterial({
      color:0x202825,
      roughness:.91,
      metalness:.01,
      side:THREE.DoubleSide,
      fog:false
    }),
    glove:new THREE.MeshStandardMaterial({
      color:0x2a302d,
      roughness:.82,
      metalness:.015,
      side:THREE.DoubleSide,
      fog:false
    }),
    pad:new THREE.MeshStandardMaterial({
      color:0x424945,
      roughness:.74,
      metalness:.025,
      side:THREE.DoubleSide,
      fog:false
    })
  };

  root.add(makeArm(-1,materials),makeArm(1,materials));

  let triangles=0;
  root.traverse(o=>{
    if(!o.isMesh)return;
    o.frustumCulled=false;
    const g=o.geometry;
    triangles+=g.index?g.index.count/3:(g.attributes.position?.count||0)/3;
  });

  root.userData.ignoreFpsCollision=true;
  root.userData.triangles=triangles;
  root.userData.source='smooth-tactical-procedural-v133';
  return root;
}
