import * as THREE from 'three';

export function createThirdPersonPlayerV144(){
  const root=new THREE.Group();
  root.name='FPS_LOCAL_THIRD_PERSON_V144';
  root.visible=false;
  root.userData={
    thirdPersonLocalRoot:true,
    ignoreFpsCollision:true,
    ignoreFpsBullet:true
  };

  const mats={
    shirt:new THREE.MeshStandardMaterial({color:0x315f48,roughness:.90}),
    shirtDark:new THREE.MeshStandardMaterial({color:0x244838,roughness:.94}),
    skin:new THREE.MeshStandardMaterial({color:0xc68f70,roughness:.88}),
    pants:new THREE.MeshStandardMaterial({color:0x263b48,roughness:.90}),
    shoe:new THREE.MeshStandardMaterial({color:0x191d20,roughness:.90}),
    glove:new THREE.MeshStandardMaterial({color:0x242b29,roughness:.86}),
    weapon:new THREE.MeshStandardMaterial({color:0x26302e,roughness:.55,metalness:.22}),
    metal:new THREE.MeshStandardMaterial({color:0x48504f,roughness:.44,metalness:.42}),
    lens:new THREE.MeshStandardMaterial({color:0x274c57,roughness:.20,metalness:.18})
  };

  function mark(obj){
    obj.userData.ignoreFpsCollision=true;
    obj.userData.ignoreFpsBullet=true;
    obj.userData.thirdPersonLocal=true;
    return obj;
  }

  const torso=mark(new THREE.Mesh(new THREE.BoxGeometry(.54,.78,.31),mats.shirt));
  torso.position.y=1.22;
  root.add(torso);

  const chest=mark(new THREE.Mesh(new THREE.BoxGeometry(.43,.18,.335),mats.shirtDark));
  chest.position.set(0,1.43,-.01);
  root.add(chest);

  const neck=mark(new THREE.Mesh(new THREE.CylinderGeometry(.085,.09,.15,10),mats.skin));
  neck.position.y=1.58;
  root.add(neck);

  const headPivot=new THREE.Group();
  headPivot.position.y=1.80;
  root.add(headPivot);
  const head=mark(new THREE.Mesh(new THREE.SphereGeometry(.205,14,10),mats.skin));
  headPivot.add(head);

  const leftArm=new THREE.Group();
  const rightArm=new THREE.Group();
  leftArm.position.set(-.31,1.46,-.02);
  rightArm.position.set(.31,1.46,-.02);
  root.add(leftArm,rightArm);

  for(const [arm,side] of [[leftArm,-1],[rightArm,1]]){
    const upper=mark(new THREE.Mesh(new THREE.BoxGeometry(.15,.36,.17),mats.shirtDark));
    upper.position.set(-side*.035,-.14,-.055);
    upper.rotation.set(-.58,0,side*.16);
    arm.add(upper);

    const fore=mark(new THREE.Mesh(new THREE.BoxGeometry(.135,.34,.15),mats.shirt));
    fore.position.set(-side*.115,-.31,-.245);
    fore.rotation.set(-1.02,0,-side*.18);
    arm.add(fore);

    const hand=mark(new THREE.Mesh(new THREE.SphereGeometry(.09,12,9),mats.glove));
    hand.position.set(-side*.18,-.34,-.405);
    hand.scale.set(.82,.70,1.05);
    arm.add(hand);
  }

  const leftLeg=new THREE.Group();
  const rightLeg=new THREE.Group();
  leftLeg.position.set(-.15,.93,0);
  rightLeg.position.set(.15,.93,0);
  root.add(leftLeg,rightLeg);

  for(const leg of [leftLeg,rightLeg]){
    const thigh=mark(new THREE.Mesh(new THREE.BoxGeometry(.20,.48,.22),mats.pants));
    thigh.position.y=-.25;
    leg.add(thigh);

    const knee=new THREE.Group();
    knee.position.y=-.49;
    leg.add(knee);

    const shin=mark(new THREE.Mesh(new THREE.BoxGeometry(.18,.44,.19),mats.pants));
    shin.position.y=-.215;
    knee.add(shin);

    const shoe=mark(new THREE.Mesh(new THREE.BoxGeometry(.20,.13,.34),mats.shoe));
    shoe.position.set(0,-.46,-.075);
    knee.add(shoe);

    leg.userData.knee=knee;
  }

  const rifle=new THREE.Group();
  rifle.name='FPS_LOCAL_SNIPER_V144';
  rifle.position.set(.10,1.19,-.34);
  rifle.rotation.set(-.08,0,-.08);
  root.add(rifle);

  const receiver=mark(new THREE.Mesh(new THREE.BoxGeometry(.14,.10,.58),mats.weapon));
  receiver.position.z=-.18;
  rifle.add(receiver);

  const stock=mark(new THREE.Mesh(new THREE.BoxGeometry(.16,.12,.30),mats.weapon));
  stock.position.set(.02,-.01,.25);
  rifle.add(stock);

  const barrel=mark(new THREE.Mesh(new THREE.CylinderGeometry(.018,.020,.72,10),mats.metal));
  barrel.rotation.x=Math.PI/2;
  barrel.position.z=-.80;
  rifle.add(barrel);

  const muzzle=mark(new THREE.Mesh(new THREE.CylinderGeometry(.028,.024,.10,10),mats.weapon));
  muzzle.rotation.x=Math.PI/2;
  muzzle.position.z=-1.20;
  rifle.add(muzzle);

  const scope=mark(new THREE.Mesh(new THREE.CylinderGeometry(.038,.038,.30,12),mats.weapon));
  scope.rotation.x=Math.PI/2;
  scope.position.set(0,.105,-.26);
  rifle.add(scope);

  const scopeFront=mark(new THREE.Mesh(new THREE.CylinderGeometry(.050,.043,.07,12),mats.weapon));
  scopeFront.rotation.x=Math.PI/2;
  scopeFront.position.set(0,.105,-.44);
  rifle.add(scopeFront);

  const lens=mark(new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.006,12),mats.lens));
  lens.rotation.x=Math.PI/2;
  lens.position.set(0,.105,-.478);
  rifle.add(lens);

  let phase=0;
  let locomotion=0;

  function update(dt,{
    x=0,y=0,z=0,
    yaw=0,pitch=0,
    crouch=0,aim=0,
    moving=false,running=false,
    alive=true
  }={}){
    root.position.set(x,y,z);
    root.rotation.y=yaw;

    const targetMove=moving?1:0;
    locomotion+=(targetMove-locomotion)*Math.min(1,dt*10);
    if(moving)phase+=dt*(running?10.8:7.2);

    const stride=Math.sin(phase)*(running?.62:.48)*locomotion;
    const crouchY=.34*crouch;

    torso.position.y=1.22-crouchY;
    chest.position.y=1.43-crouchY;
    neck.position.y=1.58-.45*crouch;
    headPivot.position.y=1.80-.50*crouch;
    headPivot.rotation.x=THREE.MathUtils.clamp(pitch*.32,-.35,.30);

    leftArm.position.y=1.46-crouchY;
    rightArm.position.y=1.46-crouchY;
    leftLeg.position.y=.93-.16*crouch;
    rightLeg.position.y=.93-.16*crouch;

    leftLeg.rotation.x=stride;
    rightLeg.rotation.x=-stride;
    leftLeg.userData.knee.rotation.x=.18*crouch+Math.max(0,-stride)*.22;
    rightLeg.userData.knee.rotation.x=.18*crouch+Math.max(0,stride)*.22;

    const armBob=moving?Math.sin(phase*2)*.025:0;
    leftArm.rotation.x=armBob-aim*.035;
    rightArm.rotation.x=-armBob-aim*.035;

    rifle.position.y=1.19-crouchY+aim*.10;
    rifle.rotation.x=-.08-aim*.12;

    const deathTarget=alive?0:-Math.PI*.48;
    root.rotation.z+=(deathTarget-root.rotation.z)*Math.min(1,dt*7);
    rifle.visible=alive;
  }

  function dispose(){
    root.traverse(o=>{
      if(o.isMesh)o.geometry?.dispose?.();
    });
    for(const m of Object.values(mats))m.dispose?.();
  }

  return {
    root,
    update,
    dispose,
    parts:{torso,headPivot,leftArm,rightArm,leftLeg,rightLeg,rifle}
  };
}
