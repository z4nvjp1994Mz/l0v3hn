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
    lens:new THREE.MeshStandardMaterial({color:0x274c57,roughness:.20,metalness:.18}),
    axeYellow:new THREE.MeshStandardMaterial({color:0xe0a91b,roughness:.48,metalness:.18}),
    axeHandle:new THREE.MeshStandardMaterial({color:0x5a4026,roughness:.78,metalness:.02})
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

  const gatling=new THREE.Group();
  gatling.name='FPS_LOCAL_GATLING_V152';
  gatling.position.set(.10,1.18,-.31);
  gatling.rotation.set(-.07,0,-.07);
  gatling.visible=false;
  root.add(gatling);

  const gatlingReceiver=mark(new THREE.Mesh(new THREE.BoxGeometry(.22,.16,.44),mats.weapon));
  gatlingReceiver.position.z=-.08;
  gatling.add(gatlingReceiver);

  const gatlingDrum=mark(new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.16,14),mats.weapon));
  gatlingDrum.rotation.z=Math.PI/2;
  gatlingDrum.position.set(-.16,-.05,-.04);
  gatling.add(gatlingDrum);

  const gatlingCluster=new THREE.Group();
  gatlingCluster.name='FPS_LOCAL_GATLING_BARRELS_V152';
  gatlingCluster.position.set(0,.015,-.30);
  gatling.add(gatlingCluster);
  for(let i=0;i<6;i++){
    const a=i*Math.PI*2/6;
    const b=mark(new THREE.Mesh(new THREE.CylinderGeometry(.013,.014,.72,8),mats.metal));
    b.rotation.x=Math.PI/2;
    b.position.set(Math.cos(a)*.065,Math.sin(a)*.065,-.36);
    gatlingCluster.add(b);
  }
  const gatlingMuzzle=mark(new THREE.Mesh(new THREE.CylinderGeometry(.05,.045,.10,12),mats.weapon));
  gatlingMuzzle.rotation.x=Math.PI/2;
  gatlingMuzzle.position.set(0,.015,-1.05);
  gatling.add(gatlingMuzzle);

  const axe=new THREE.Group();
  axe.name='FPS_LOCAL_AXE_V154';
  axe.position.set(.12,1.16,-.22);
  axe.rotation.set(1.42,-.03,-.08);
  axe.visible=false;
  root.add(axe);

  const axeHandle=mark(new THREE.Mesh(
    new THREE.CylinderGeometry(.032,.040,.92,10),
    mats.axeHandle
  ));
  axeHandle.rotation.x=Math.PI/2;
  axeHandle.position.set(0,0,-.36);
  axe.add(axeHandle);

  const axeHeadRoot=new THREE.Group();
  axeHeadRoot.position.set(0,.015,-.82);
  axeHeadRoot.rotation.z=0;
  axe.add(axeHeadRoot);

  const axeHead=mark(new THREE.Mesh(
    new THREE.BoxGeometry(.20,.17,.25),
    mats.axeYellow
  ));
  axeHeadRoot.add(axeHead);

  const axeBlade=mark(new THREE.Mesh(
    new THREE.BoxGeometry(.36,.22,.075),
    mats.metal
  ));
  axeBlade.position.set(-.22,-.015,-.01);
  axeBlade.rotation.z=.12;
  axeHeadRoot.add(axeBlade);

  const axeWedge=mark(new THREE.Mesh(
    new THREE.BoxGeometry(.20,.12,.11),
    mats.axeYellow
  ));
  axeWedge.position.set(.17,.015,.015);
  axeHeadRoot.add(axeWedge);

  // Grip anchors are defined in AXE-LOCAL space and converted back into the
  // player root every frame. Hands therefore follow the animated axe exactly.
  const axeUpperGripLocal=new THREE.Vector3(0,-.01,-.30);
  const axeLowerGripLocal=new THREE.Vector3(0,-.01,.10);
  const axeGripWorld=new THREE.Vector3();
  const axeGripRoot=new THREE.Vector3();

  function placeArmHandOnAxeGrip(arm,side,localGrip){
    root.updateMatrixWorld(true);
    axe.updateMatrixWorld(true);

    axeGripWorld.copy(localGrip);
    axe.localToWorld(axeGripWorld);
    axeGripRoot.copy(axeGripWorld);
    root.worldToLocal(axeGripRoot);

    // Hand local coordinates in the arm are (-side*.18,-.34,-.405).
    arm.position.set(
      axeGripRoot.x+side*.18,
      axeGripRoot.y+.34,
      axeGripRoot.z+.405
    );
  }

  let phase=0;
  let locomotion=0;
  let gatlingSpin=0;

  function update(dt,{
    x=0,y=0,z=0,
    yaw=0,pitch=0,
    crouch=0,aim=0,
    moving=false,running=false,
    alive=true,
    weapon='sniper',
    firing=false,
    meleeType='none',
    meleeProgress=0
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
    gatling.position.y=1.18-crouchY;
    gatling.rotation.x=-.07;

    const gatlingActive=weapon==='gatling';
    const axeActive=weapon==='axe';
    gatlingSpin+=(firing&&gatlingActive?18:3)*dt;
    gatlingCluster.rotation.z=gatlingSpin;

    // V155: anatomically clearer axe motion.
    // Normal = upper-right -> lower-left diagonal cut.
    // Strong = true overhead raise -> vertical downward chop.
    const mp=THREE.MathUtils.clamp(meleeProgress||0,0,1);
    const easeOut=t=>1-Math.pow(1-THREE.MathUtils.clamp(t,0,1),3);
    const easeIn=t=>Math.pow(THREE.MathUtils.clamp(t,0,1),3);
    const smooth=t=>{
      t=THREE.MathUtils.clamp(t,0,1);
      return t*t*(3-2*t);
    };

    axe.position.set(.12,1.16-crouchY,-.22);
    axe.rotation.set(1.42,-.03,-.08);
    torso.rotation.set(0,0,0);
    chest.rotation.set(0,0,0);

    if(axeActive&&mp>0){
      if(meleeType==='strong'){
        if(mp<.34){
          const t=easeOut(mp/.34);
          axe.rotation.x=THREE.MathUtils.lerp(1.42,1.90,t);
          axe.rotation.y=THREE.MathUtils.lerp(-.03,0,t);
          axe.rotation.z=THREE.MathUtils.lerp(-.08,.03,t);
          axe.position.y=THREE.MathUtils.lerp(1.16-crouchY,1.48-crouchY,t);
          axe.position.z=THREE.MathUtils.lerp(-.22,-.08,t);
          torso.rotation.x=THREE.MathUtils.lerp(0,-.10,t);
          leftArm.rotation.x-=THREE.MathUtils.lerp(0,.72,t);
          rightArm.rotation.x-=THREE.MathUtils.lerp(0,.82,t);
        }else if(mp<.72){
          const t=easeIn((mp-.34)/.38);
          axe.rotation.x=THREE.MathUtils.lerp(1.90,.18,t);
          axe.rotation.y=THREE.MathUtils.lerp(-.02,.03,t);
          axe.rotation.z=THREE.MathUtils.lerp(.02,-.18,t);
          axe.position.y=THREE.MathUtils.lerp(1.48-crouchY,.91-crouchY,t);
          axe.position.z=THREE.MathUtils.lerp(-.08,-.34,t);
          torso.rotation.x=THREE.MathUtils.lerp(-.10,.15,t);
          leftArm.rotation.x-=THREE.MathUtils.lerp(.72,.98,t);
          rightArm.rotation.x-=THREE.MathUtils.lerp(.82,1.08,t);
        }else{
          const t=smooth((mp-.72)/.28);
          axe.rotation.x=THREE.MathUtils.lerp(.18,1.42,t);
          axe.rotation.y=THREE.MathUtils.lerp(.03,-.03,t);
          axe.rotation.z=THREE.MathUtils.lerp(-.18,-.08,t);
          axe.position.y=THREE.MathUtils.lerp(.91-crouchY,1.16-crouchY,t);
          axe.position.z=THREE.MathUtils.lerp(-.34,-.22,t);
          torso.rotation.x=THREE.MathUtils.lerp(.15,0,t);
          leftArm.rotation.x-=THREE.MathUtils.lerp(.98,0,t);
          rightArm.rotation.x-=THREE.MathUtils.lerp(1.08,0,t);
        }
      }else{
        if(mp<.26){
          const t=easeOut(mp/.26);
          axe.rotation.x=THREE.MathUtils.lerp(1.42,1.65,t);
          axe.rotation.y=THREE.MathUtils.lerp(-.03,-.60,t);
          axe.rotation.z=THREE.MathUtils.lerp(-.08,-.50,t);
          axe.position.x=THREE.MathUtils.lerp(.12,.34,t);
          axe.position.y=THREE.MathUtils.lerp(1.16-crouchY,1.36-crouchY,t);
          torso.rotation.y=THREE.MathUtils.lerp(0,-.18,t);
          chest.rotation.z=THREE.MathUtils.lerp(0,-.06,t);
          leftArm.rotation.x-=THREE.MathUtils.lerp(0,.26,t);
          rightArm.rotation.x-=THREE.MathUtils.lerp(0,.48,t);
        }else if(mp<.66){
          const t=easeIn((mp-.26)/.40);
          axe.rotation.x=THREE.MathUtils.lerp(1.65,.50,t);
          axe.rotation.y=THREE.MathUtils.lerp(-.66,.68,t);
          axe.rotation.z=THREE.MathUtils.lerp(-.64,.28,t);
          axe.position.x=THREE.MathUtils.lerp(.34,-.22,t);
          axe.position.y=THREE.MathUtils.lerp(1.36-crouchY,.91-crouchY,t);
          torso.rotation.y=THREE.MathUtils.lerp(-.18,.24,t);
          chest.rotation.z=THREE.MathUtils.lerp(-.06,.08,t);
          leftArm.rotation.x-=THREE.MathUtils.lerp(.26,.44,t);
          rightArm.rotation.x-=THREE.MathUtils.lerp(.48,.68,t);
        }else{
          const t=smooth((mp-.66)/.34);
          axe.rotation.x=THREE.MathUtils.lerp(.50,1.42,t);
          axe.rotation.y=THREE.MathUtils.lerp(.68,-.03,t);
          axe.rotation.z=THREE.MathUtils.lerp(.28,-.08,t);
          axe.position.x=THREE.MathUtils.lerp(-.22,.12,t);
          axe.position.y=THREE.MathUtils.lerp(.91-crouchY,1.16-crouchY,t);
          torso.rotation.y=THREE.MathUtils.lerp(.24,0,t);
          chest.rotation.z=THREE.MathUtils.lerp(.08,0,t);
          leftArm.rotation.x-=THREE.MathUtils.lerp(.44,0,t);
          rightArm.rotation.x-=THREE.MathUtils.lerp(.68,0,t);
        }
      }
    }

    if(axeActive){
      // Left hand grips high on the wooden shaft; right hand grips the lower
      // black/wood section. Both positions inherit the axe's live animation.
      placeArmHandOnAxeGrip(leftArm,-1,axeUpperGripLocal);
      placeArmHandOnAxeGrip(rightArm,1,axeLowerGripLocal);
    }else{
      leftArm.position.x=-.31;
      leftArm.position.z=-.02;
      rightArm.position.x=.31;
      rightArm.position.z=-.02;
    }

    const deathTarget=alive?0:-Math.PI*.48;
    root.rotation.z+=(deathTarget-root.rotation.z)*Math.min(1,dt*7);
    rifle.visible=alive&&!gatlingActive&&!axeActive;
    gatling.visible=alive&&gatlingActive;
    axe.visible=alive&&axeActive;
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
    parts:{torso,headPivot,leftArm,rightArm,leftLeg,rightLeg,rifle,gatling,gatlingCluster,axe,axeHeadRoot}
  };
}
