import * as THREE from 'three';

// V138 — shaped FPS glove shell.
// One continuous custom hand mesh built from anatomical cross-sections:
// wrist -> palm -> knuckles -> curled fingertip. No sphere/mitten blob.

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

function makeGloveShellGeometry(){
  // Local hand points toward -Z.
  const sections=[
    {z:.055, w:.043, h:.026, y: .000}, // wrist
    {z:.020, w:.056, h:.032, y: .002}, // palm base
    {z:-.025,w:.066, h:.036, y: .004}, // palm
    {z:-.060,w:.072, h:.038, y: .004}, // knuckles
    {z:-.090,w:.066, h:.033, y: .000}, // curled fingers
    {z:-.116,w:.050, h:.025, y:-.006}, // fingertips
    {z:-.132,w:.030, h:.016, y:-.010}  // rounded front taper
  ];
  const radial=18;
  const pos=[];
  const idx=[];

  for(let s=0;s<sections.length;s++){
    const sec=sections[s];
    for(let j=0;j<radial;j++){
      const a=j/radial*Math.PI*2;
      const ca=Math.cos(a);
      const sa=Math.sin(a);

      // Slightly flatter underside and fuller back-of-hand.
      const vertical=sa>=0
        ?sa*sec.h*1.05
        :sa*sec.h*.82;

      // Mild squaring at knuckles without creating hard corners.
      const x=ca*sec.w*(1+.055*Math.cos(a*2));
      const y=sec.y+vertical;
      pos.push(x,y,sec.z);
    }
  }

  for(let s=0;s<sections.length-1;s++){
    const a0=s*radial;
    const b0=(s+1)*radial;
    for(let j=0;j<radial;j++){
      const n=(j+1)%radial;
      idx.push(
        a0+j,b0+j,a0+n,
        a0+n,b0+j,b0+n
      );
    }
  }

  // Wrist cap.
  const wristCenter=pos.length/3;
  pos.push(0,sections[0].y,sections[0].z);
  for(let j=0;j<radial;j++){
    const n=(j+1)%radial;
    idx.push(wristCenter,j,n);
  }

  // Fingertip cap.
  const last=(sections.length-1)*radial;
  const tipCenter=pos.length/3;
  const tip=sections[sections.length-1];
  pos.push(0,tip.y,tip.z-.004);
  for(let j=0;j<radial;j++){
    const n=(j+1)%radial;
    idx.push(last+j,tipCenter,last+n);
  }

  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function makeHand(side,materials){
  const hand=new THREE.Group();
  hand.name=side<0?'FPS_LEFT_HAND_V138':'FPS_RIGHT_HAND_V138';

  // Low-profile FPS placement; larger/flatter than V136 mitten.
  hand.position.set(side*.292,-.192,-.048);
  hand.rotation.set(-.075,side*.115,-side*.085);

  const shell=mesh(
    makeGloveShellGeometry(),
    materials.glove,
    'FPS_GLOVE_SHELL_V138'
  );
  hand.add(shell);

  // Subtle back-hand reinforcement following the shell, not floating above it.
  const pad=mesh(
    new THREE.SphereGeometry(1,22,14),
    materials.pad,
    'FPS_GLOVE_BACK_PAD_V138'
  );
  pad.scale.set(.046,.007,.043);
  pad.position.set(0,.037,-.030);
  hand.add(pad);

  // Tucked thumb on the inner edge.
  const inside=-side;
  const thumb=segmentBetween(
    [inside*.050,-.003,-.010],
    [inside*.068,-.021,-.056],
    .016,
    .012,
    materials.glove,
    'FPS_THUMB_V138',
    16
  );
  hand.add(thumb);

  const thumbTip=mesh(
    new THREE.SphereGeometry(.013,14,10),
    materials.glove,
    'FPS_THUMB_TIP_V138'
  );
  thumbTip.position.set(inside*.070,-.023,-.062);
  hand.add(thumbTip);

  return hand;
}

function makeArm(side,materials){
  const arm=new THREE.Group();
  arm.name=side<0?'FPS_LEFT_ARM_V138':'FPS_RIGHT_ARM_V138';

  // V138.2: keep V138 thickness but recess the visible forearm down/back toward the player.
  // The hand topology stays unchanged from V137.
  const sleeveStart=[side*.440,-.405,.225];
  const sleeveEnd=[side*.326,-.250,.040];

  arm.add(segmentBetween(
    sleeveStart,
    sleeveEnd,
    .083,
    .063,
    materials.sleeve,
    'FPS_LOW_SLEEVE_V138',
    20
  ));

  const underside=segmentBetween(
    [side*.433,-.398,.218],
    [side*.332,-.257,.045],
    .066,
    .051,
    materials.sleeveDark,
    'FPS_LOW_SLEEVE_UNDERSIDE_V138',
    18
  );
  underside.scale.set(.92,1,.88);
  arm.add(underside);

  arm.add(segmentBetween(
    sleeveEnd,
    [side*.304,-.213,-.020],
    .062,
    .055,
    materials.cuff,
    'FPS_LOW_CUFF_V138',
    18
  ));

  arm.add(makeHand(side,materials));
  return arm;
}

export function createThickerFpsArmsV138(){
  const root=new THREE.Group();
  root.name='FPS_THICKER_ARMS_V138';

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
      metalness:.01,
      side:THREE.DoubleSide,
      fog:false
    }),
    pad:new THREE.MeshStandardMaterial({
      color:0x454b48,
      roughness:.74,
      metalness:.015,
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
    triangles+=g.index
      ?g.index.count/3
      :(g.attributes.position?.count||0)/3;
  });

  root.userData.ignoreFpsCollision=true;
  root.userData.triangles=triangles;
  root.userData.source='shaped-glove-shell-v137';
  return root;
}
