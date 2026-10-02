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

function makeDynamicSegment(r0,r1,material,name,radial=18){
  const g=new THREE.CylinderGeometry(r1,r0,1,radial,2,false);
  const m=mesh(g,material,name);
  m.userData.dynamicArmSegment=true;
  return m;
}

const _segA=new THREE.Vector3();
const _segB=new THREE.Vector3();
const _segDir=new THREE.Vector3();
const _segMid=new THREE.Vector3();
const _segUp=new THREE.Vector3(0,1,0);

function placeDynamicSegment(m,a,b){
  _segA.copy(a);
  _segB.copy(b);
  _segDir.copy(_segB).sub(_segA);
  const len=Math.max(.001,_segDir.length());
  _segMid.copy(_segA).lerp(_segB,.5);

  m.position.copy(_segMid);
  m.quaternion.setFromUnitVectors(
    _segUp,
    _segDir.normalize()
  );
  m.scale.set(1,len,1);
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
  hand.position.set(side*.315,-.240,.060);
  hand.rotation.set(-.145,side*.095,-side*.060);

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

function makeSniper(materials){
  const rifle=new THREE.Group();
  rifle.name='FPS_SNIPER_V140';
  rifle.position.set(.055,-.245,.035);
  rifle.rotation.set(-.025,.012,.010);
  rifle.userData={fpsWeapon:true,ignoreFpsCollision:true,type:'sniper-viewmodel'};

  const addBox=(size,pos,mat,name,rot=[0,0,0])=>{
    const m=mesh(new THREE.BoxGeometry(...size),mat,name);
    m.position.set(...pos);
    m.rotation.set(...rot);
    rifle.add(m);
    return m;
  };
  const addTube=(rTop,rBottom,len,pos,mat,name,rot=[Math.PI/2,0,0],radial=16)=>{
    const m=mesh(new THREE.CylinderGeometry(rTop,rBottom,len,radial),mat,name);
    m.position.set(...pos);
    m.rotation.set(...rot);
    rifle.add(m);
    return m;
  };

  // Compact first-person sniper silhouette: stock -> receiver -> fore-end -> barrel.
  addBox([.155,.105,.275],[.018,-.005,.175],materials.weaponStock,'FPS_SNIPER_STOCK_V140',[.02,0,0]);
  addBox([.180,.125,.055],[.018,-.006,.330],materials.weaponDark,'FPS_SNIPER_BUTT_V140');
  addBox([.150,.110,.300],[.018,.008,-.105],materials.weaponBody,'FPS_SNIPER_RECEIVER_V140');
  addBox([.112,.078,.305],[.018,.010,-.390],materials.weaponBody,'FPS_SNIPER_FOREEND_V140');

  // Barrel and muzzle point into the scene (-Z).
  addTube(.018,.020,.590,[.018,.025,-.735],materials.weaponMetal,'FPS_SNIPER_BARREL_V140');
  addTube(.028,.024,.090,[.018,.025,-1.065],materials.weaponDark,'FPS_SNIPER_MUZZLE_V140');

  // Scope assembly.
  addBox([.095,.028,.310],[.018,.105,-.165],materials.weaponMetal,'FPS_SNIPER_SCOPE_RAIL_V140');
  addTube(.038,.038,.305,[.018,.148,-.175],materials.weaponDark,'FPS_SNIPER_SCOPE_TUBE_V140');
  addTube(.050,.042,.070,[.018,.148,-.345],materials.weaponDark,'FPS_SNIPER_SCOPE_FRONT_V140');
  addTube(.044,.040,.060,[.018,.148,.000],materials.weaponDark,'FPS_SNIPER_SCOPE_REAR_V140');
  addTube(.033,.033,.006,[.018,.148,-.382],materials.scopeLens,'FPS_SNIPER_SCOPE_LENS_V140');

  // Grip and bolt handle make the silhouette readable without adding gameplay logic.
  addBox([.060,.145,.080],[.075,-.105,.000],materials.weaponDark,'FPS_SNIPER_GRIP_V140',[-.24,0,-.06]);
  addTube(.010,.010,.090,[.102,.055,-.040],materials.weaponMetal,'FPS_SNIPER_BOLT_V140',[0,0,Math.PI/2],10);
  const boltKnob=mesh(new THREE.SphereGeometry(.018,10,7),materials.weaponDark,'FPS_SNIPER_BOLT_KNOB_V140');
  boltKnob.position.set(.148,.055,-.040);
  rifle.add(boltKnob);

  return rifle;
}

function makeGatling(materials){
  const gun=new THREE.Group();
  gun.name='FPS_GATLING_V152';
  gun.position.set(.045,-.245,.025);
  gun.rotation.set(-.020,.010,.008);
  gun.visible=false;
  gun.userData={
    fpsWeapon:true,
    ignoreFpsCollision:true,
    type:'gatling-viewmodel'
  };

  const addBox=(size,pos,mat,name,rot=[0,0,0])=>{
    const m=mesh(new THREE.BoxGeometry(...size),mat,name);
    m.position.set(...pos);
    m.rotation.set(...rot);
    gun.add(m);
    return m;
  };
  const addTube=(rTop,rBottom,len,pos,mat,name,rot=[Math.PI/2,0,0],radial=14,parent=gun)=>{
    const m=mesh(new THREE.CylinderGeometry(rTop,rBottom,len,radial),mat,name);
    m.position.set(...pos);
    m.rotation.set(...rot);
    parent.add(m);
    return m;
  };

  // Receiver / rear housing.
  addBox([.205,.145,.330],[.020,.000,.115],materials.weaponBody,'FPS_GATLING_RECEIVER_V152');
  addBox([.230,.175,.115],[.020,-.010,.305],materials.weaponDark,'FPS_GATLING_REAR_HOUSING_V152');
  addBox([.135,.185,.100],[.105,-.110,.090],materials.weaponDark,'FPS_GATLING_GRIP_V152',[-.18,0,-.05]);
  addBox([.110,.070,.245],[-.055,-.055,-.150],materials.weaponMetal,'FPS_GATLING_MOTOR_HOUSING_V152');

  // Barrel cluster rotates around local Z.
  const cluster=new THREE.Group();
  cluster.name='FPS_GATLING_BARREL_CLUSTER_V152';
  cluster.position.set(.020,.022,-.340);
  cluster.userData.ignoreFpsCollision=true;
  gun.add(cluster);

  const barrelRadius=.052;
  const barrelLength=.640;
  for(let i=0;i<6;i++){
    const a=i*Math.PI*2/6;
    const x=Math.cos(a)*barrelRadius;
    const y=Math.sin(a)*barrelRadius;
    addTube(
      .010,.012,barrelLength,
      [x,y,-barrelLength*.50],
      materials.weaponMetal,
      'FPS_GATLING_BARREL_V152_'+i,
      [Math.PI/2,0,0],
      10,
      cluster
    );
  }

  // Front/rear barrel cages.
  addTube(.078,.078,.050,[.020,.022,-.385],materials.weaponDark,'FPS_GATLING_CAGE_REAR_V152',[Math.PI/2,0,0],16);
  addTube(.074,.074,.060,[.020,.022,-.995],materials.weaponDark,'FPS_GATLING_CAGE_FRONT_V152',[Math.PI/2,0,0],16);

  // Central axle + compact muzzle.
  addTube(.012,.012,.690,[.020,.022,-.665],materials.weaponDark,'FPS_GATLING_AXLE_V152',[Math.PI/2,0,0],10);
  addTube(.042,.036,.085,[.020,.022,-1.065],materials.weaponDark,'FPS_GATLING_MUZZLE_V152',[Math.PI/2,0,0],14);

  // Top carry rail and ammo drum suggest a heavier automatic weapon.
  addBox([.120,.030,.300],[.020,.118,-.180],materials.weaponMetal,'FPS_GATLING_TOP_RAIL_V152');
  addTube(.105,.105,.115,[-.120,-.055,-.105],materials.weaponDark,'FPS_GATLING_AMMO_DRUM_V152',[0,0,Math.PI/2],18);

  gun.userData.barrelCluster=cluster;
  return gun;
}

function makeAxeGripArm(side,materials,gripZ){
  const arm=new THREE.Group();
  arm.name=side<0?'FPS_AXE_LEFT_IK_ARM_V158':'FPS_AXE_RIGHT_IK_ARM_V158';
  arm.visible=false;

  const upper=makeDynamicSegment(
    .070,.057,
    materials.sleeve,
    'FPS_AXE_IK_UPPER_V158',
    18
  );
  const fore=makeDynamicSegment(
    .057,.047,
    materials.sleeve,
    'FPS_AXE_IK_FOREARM_V158',
    18
  );
  const cuff=makeDynamicSegment(
    .052,.045,
    materials.cuff,
    'FPS_AXE_IK_CUFF_V157',
    14
  );
  arm.add(upper,fore,cuff);

  // Rounded root cap prevents any flat/cut sleeve end from becoming visible
  // during a fast slash.
  const shoulderCap=mesh(
    new THREE.SphereGeometry(.070,14,10),
    materials.sleeve,
    'FPS_AXE_IK_SHOULDER_CAP_V158'
  );
  shoulderCap.scale.set(1.0,.78,1.0);
  arm.add(shoulderCap);

  const hand=makeHand(side,materials);
  hand.name=side<0?'FPS_AXE_LEFT_IK_HAND_V158':'FPS_AXE_RIGHT_IK_HAND_V158';
  hand.scale.set(1.05,1.05,1.05);
  arm.add(hand);

  const baseHandQ=new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      -1.48,
      side*.08,
      side<0?.18:-.18,
      'XYZ'
    )
  );

  // Shoulder anchors stay fixed near the lower corners of the camera-space
  // rig. Only elbow/wrist solve toward the animated axe handle.
  const shoulder=new THREE.Vector3(
    .26+side*.20,
    -.740,
    .520
  );
  const targetLocal=new THREE.Vector3(
    .020,
    -.010,
    gripZ
  );

  arm.userData={
    side,
    gripZ,
    upper,
    fore,
    cuff,
    hand,
    shoulderCap,
    shoulder,
    targetLocal,
    baseHandQ
  };
  return arm;
}

function makeAxe(materials){
  const axe=new THREE.Group();
  axe.name='FPS_AXE_V154';
  axe.visible=false;
  axe.position.set(.12,-.16,-.20);
  axe.rotation.set(.18,-.12,-.24);
  axe.userData={
    fpsWeapon:true,
    ignoreFpsCollision:true,
    type:'axe-viewmodel'
  };

  const handle=mesh(
    new THREE.CylinderGeometry(.032,.040,.88,10),
    materials.axeHandle,
    'FPS_AXE_HANDLE_V154'
  );
  handle.rotation.x=Math.PI/2;
  handle.position.set(.02,-.01,-.34);
  axe.add(handle);

  const grip=mesh(
    new THREE.CylinderGeometry(.044,.048,.28,10),
    materials.weaponDark,
    'FPS_AXE_GRIP_V154'
  );
  grip.rotation.x=Math.PI/2;
  grip.position.set(.02,-.01,.10);
  axe.add(grip);

  const headRoot=new THREE.Group();
  headRoot.name='FPS_AXE_HEAD_ROOT_V162';
  headRoot.position.set(.02,.015,-.80);

  // V164: head stays neutral; whole weapon root makes local-Z handle vertical.
  // The handle/grip/IK hands keep their existing lower-right pose.
  headRoot.rotation.z=0;
  axe.add(headRoot);

  const headBody=mesh(
    new THREE.BoxGeometry(.18,.16,.24),
    materials.axeYellow,
    'FPS_AXE_HEAD_BODY_V154'
  );
  headBody.position.set(0,0,0);
  headRoot.add(headBody);

  const blade=mesh(
    new THREE.BoxGeometry(.34,.20,.075),
    materials.axeBlade,
    'FPS_AXE_BLADE_V154'
  );
  blade.position.set(-.20,-.015,-.015);
  blade.rotation.z=.12;
  headRoot.add(blade);

  const wedge=mesh(
    new THREE.BoxGeometry(.20,.12,.11),
    materials.axeYellow,
    'FPS_AXE_WEDGE_V154'
  );
  wedge.position.set(.17,.015,.015);
  headRoot.add(wedge);

  const bolt=mesh(
    new THREE.CylinderGeometry(.025,.025,.20,10),
    materials.weaponMetal,
    'FPS_AXE_HEAD_BOLT_V154'
  );
  bolt.rotation.z=Math.PI/2;
  headRoot.add(bolt);

  axe.userData.head=headRoot;
  return axe;
}

function makeArm(side,materials){
  const arm=new THREE.Group();
  arm.name=side<0?'FPS_LEFT_ARM_V138':'FPS_RIGHT_ARM_V138';

  // V138.4: strongly retract the whole visible arm chain toward the player and lower it in frame.
  // The hand topology stays unchanged from V137.
  const sleeveStart=[side*.445,-.465,.300];
  const sleeveEnd=[side*.340,-.285,.120];

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
    [side*.438,-.456,.290],
    [side*.346,-.292,.126],
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
    [side*.320,-.250,.085],
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
    }),
    weaponBody:new THREE.MeshStandardMaterial({
      color:0x273330,
      roughness:.58,
      metalness:.22,
      side:THREE.DoubleSide,
      fog:false
    }),
    weaponStock:new THREE.MeshStandardMaterial({
      color:0x31483c,
      roughness:.78,
      metalness:.03,
      side:THREE.DoubleSide,
      fog:false
    }),
    weaponDark:new THREE.MeshStandardMaterial({
      color:0x171d1c,
      roughness:.52,
      metalness:.30,
      side:THREE.DoubleSide,
      fog:false
    }),
    weaponMetal:new THREE.MeshStandardMaterial({
      color:0x46504e,
      roughness:.42,
      metalness:.48,
      side:THREE.DoubleSide,
      fog:false
    }),
    scopeLens:new THREE.MeshStandardMaterial({
      color:0x24444d,
      emissive:0x10262d,
      emissiveIntensity:.20,
      roughness:.18,
      metalness:.12,
      side:THREE.DoubleSide,
      fog:false
    }),
    axeYellow:new THREE.MeshStandardMaterial({
      color:0xe0a91b,
      roughness:.48,
      metalness:.18,
      side:THREE.DoubleSide,
      fog:false
    }),
    axeBlade:new THREE.MeshStandardMaterial({
      color:0x4b514e,
      roughness:.34,
      metalness:.62,
      side:THREE.DoubleSide,
      fog:false
    }),
    axeHandle:new THREE.MeshStandardMaterial({
      color:0x5a4026,
      roughness:.78,
      metalness:.02,
      side:THREE.DoubleSide,
      fog:false
    })
  };

  const sniper=makeSniper(materials);
  const gatling=makeGatling(materials);
  const axe=makeAxe(materials);
  const leftArm=makeArm(-1,materials);
  const rightArm=makeArm(1,materials);
  const axeRightArm=makeAxeGripArm(1,materials,.105);
  const axeLeftArm=makeAxeGripArm(-1,materials,-.300);
  root.add(
    leftArm,
    rightArm,
    axeLeftArm,
    axeRightArm,
    sniper,
    gatling,
    axe
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
  const gripWorld=new THREE.Vector3();
  const gripRoot=new THREE.Vector3();
  const elbow=new THREE.Vector3();
  const cuffStart=new THREE.Vector3();
  const foreDir=new THREE.Vector3();
  const axeQ=new THREE.Quaternion();

  function solveAxeIkArm(arm){
    const d=arm.userData;
    if(!d)return;

    root.updateMatrixWorld(true);
    axe.updateMatrixWorld(true);

    gripWorld.copy(d.targetLocal);
    axe.localToWorld(gripWorld);
    gripRoot.copy(gripWorld);
    root.worldToLocal(gripRoot);

    // Bend the elbow outward and slightly down. The shoulder remains fixed,
    // so no "arm stump" can be dragged through the center of the screen.
    elbow.copy(d.shoulder).lerp(gripRoot,.82);
    elbow.x+=d.side*.020;
    elbow.y-=.024;
    elbow.z+=.070;

    foreDir.copy(gripRoot).sub(elbow).normalize();
    cuffStart.copy(gripRoot).addScaledVector(foreDir,-.078);

    placeDynamicSegment(d.upper,d.shoulder,elbow);
    placeDynamicSegment(d.fore,elbow,cuffStart);
    placeDynamicSegment(d.cuff,cuffStart,gripRoot);

    d.shoulderCap.position.copy(d.shoulder);
    d.hand.position.copy(gripRoot);

    // Hand follows the live axe orientation while the arm chain itself is
    // solved from a fixed camera-space shoulder.
    axe.getWorldQuaternion(axeQ);
    if(root.parent){
      const parentQ=new THREE.Quaternion();
      root.getWorldQuaternion(parentQ);
      parentQ.invert();
      axeQ.premultiply(parentQ);
    }
    d.hand.quaternion.copy(axeQ).multiply(d.baseHandQ);
  }

  root.userData.source='v162-sniper+gatling+axe-head-perpendicular-ik';
  root.userData.weapon='sniper';
  root.userData.sniper=sniper;
  root.userData.gatling=gatling;
  root.userData.gatlingBarrel=gatling.userData.barrelCluster;
  root.userData.axe=axe;
  root.userData.leftArm=leftArm;
  root.userData.rightArm=rightArm;
  root.userData.axeLeftGripArm=axeLeftArm;
  root.userData.axeRightGripArm=axeRightArm;
  root.userData.updateAxeGripPose=()=>{
    solveAxeIkArm(axeLeftArm);
    solveAxeIkArm(axeRightArm);
  };
  return root;
}
