import * as THREE from 'three';

const APP_ID='dalociz-netlify-v1431-2026-10';
const DISCOVERY_SETTLE_MS=1200;

const STRATEGIES=[
  {
    key:'nostr',
    label:'Nostr',
    urls:[
      'https://esm.sh/trystero@0.25.0?bundle',
      'https://esm.run/trystero',
      'https://cdn.jsdelivr.net/npm/trystero@0.25.0/+esm'
    ]
  },
  {
    key:'mqtt',
    label:'MQTT',
    urls:[
      'https://esm.sh/@trystero-p2p/mqtt@0.25.0?bundle',
      'https://cdn.jsdelivr.net/npm/@trystero-p2p/mqtt@0.25.0/+esm'
    ]
  },
  {
    key:'torrent',
    label:'Torrent',
    urls:[
      'https://esm.sh/@trystero-p2p/torrent@0.25.0?bundle',
      'https://cdn.jsdelivr.net/npm/@trystero-p2p/torrent@0.25.0/+esm'
    ]
  }
];

const strategyLoads=new Map();

async function loadStrategy(strategy){
  if(strategyLoads.has(strategy.key))return strategyLoads.get(strategy.key);

  const promise=(async()=>{
    const errors=[];
    for(const url of strategy.urls){
      try{
        const mod=await import(url);
        if(typeof mod?.joinRoom!=='function')throw new Error('joinRoom export missing');
        return {mod,url,strategy};
      }catch(error){
        errors.push(url+' -> '+(error?.message||String(error)));
      }
    }
    throw new Error(strategy.label+' load failed: '+errors.join(' | '));
  })();

  strategyLoads.set(strategy.key,promise);
  try{
    return await promise;
  }catch(error){
    strategyLoads.delete(strategy.key);
    throw error;
  }
}

const RTC_CONFIG={
  iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'},
    {urls:'stun:stun.cloudflare.com:3478'}
  ],
  iceCandidatePoolSize:6
};

const MAX_REMOTE_PLAYERS=1;
const SEND_INTERVAL_MS=70;
const REMOTE_TIMEOUT_MS=6500;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function makeLabelSprite(text){
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(7,24,16,.88)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='rgba(130,237,178,.75)';
  ctx.lineWidth=3;
  ctx.strokeRect(2,2,canvas.width-4,canvas.height-4);
  ctx.fillStyle='#effff5';
  ctx.font='700 26px Arial';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(text,canvas.width/2,canvas.height/2);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({
    map:texture,transparent:true,depthWrite:false
  });
  const sprite=new THREE.Sprite(material);
  sprite.scale.set(2.6,.65,1);
  sprite.userData.ignoreFpsBullet=true;
  sprite.userData.disposeMultiplayer=()=>{
    texture.dispose();
    material.dispose();
  };
  return sprite;
}

function makeRemotePlayer(peerId){
  const root=new THREE.Group();
  root.name='V142_REMOTE_PLAYER_'+peerId.slice(0,8);
  root.userData={
    multiplayerRemote:true,
    peerId,
    ignoreFpsCollision:true
  };

  const mats={
    shirt:new THREE.MeshStandardMaterial({color:0x315f48,roughness:.90}),
    shirtDark:new THREE.MeshStandardMaterial({color:0x244838,roughness:.94}),
    skin:new THREE.MeshStandardMaterial({color:0xc68f70,roughness:.88}),
    pants:new THREE.MeshStandardMaterial({color:0x263b48,roughness:.90}),
    shoe:new THREE.MeshStandardMaterial({color:0x191d20,roughness:.90}),
    glove:new THREE.MeshStandardMaterial({color:0x242b29,roughness:.86}),
    weapon:new THREE.MeshStandardMaterial({color:0x26302e,roughness:.55,metalness:.22}),
    metal:new THREE.MeshStandardMaterial({color:0x48504f,roughness:.44,metalness:.42})
  };

  const torso=new THREE.Mesh(new THREE.BoxGeometry(.52,.76,.30),mats.shirt);
  torso.position.y=1.22;
  root.add(torso);

  const head=new THREE.Mesh(new THREE.SphereGeometry(.20,14,10),mats.skin);
  head.position.y=1.82;
  root.add(head);

  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.085,.09,.16,10),mats.skin);
  neck.position.y=1.58;
  root.add(neck);

  const leftArm=new THREE.Group();
  const rightArm=new THREE.Group();
  leftArm.position.set(-.34,1.45,-.03);
  rightArm.position.set(.34,1.45,-.03);
  root.add(leftArm,rightArm);

  for(const [arm,side] of [[leftArm,-1],[rightArm,1]]){
    const upper=new THREE.Mesh(new THREE.BoxGeometry(.16,.52,.18),mats.shirtDark);
    upper.position.y=-.25;
    arm.add(upper);
    const fore=new THREE.Mesh(new THREE.BoxGeometry(.14,.46,.16),mats.shirt);
    fore.position.set(side*.05,-.64,-.10);
    fore.rotation.x=-.46;
    arm.add(fore);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.105,10,8),mats.glove);
    hand.position.set(side*.05,-.88,-.20);
    arm.add(hand);
  }

  const leftLeg=new THREE.Group();
  const rightLeg=new THREE.Group();
  leftLeg.position.set(-.15,.93,0);
  rightLeg.position.set(.15,.93,0);
  root.add(leftLeg,rightLeg);

  for(const leg of [leftLeg,rightLeg]){
    const thigh=new THREE.Mesh(new THREE.BoxGeometry(.20,.48,.22),mats.pants);
    thigh.position.y=-.25;
    leg.add(thigh);
    const shin=new THREE.Mesh(new THREE.BoxGeometry(.18,.44,.19),mats.pants);
    shin.position.y=-.70;
    leg.add(shin);
    const shoe=new THREE.Mesh(new THREE.BoxGeometry(.20,.13,.34),mats.shoe);
    shoe.position.set(0,-.95,-.07);
    leg.add(shoe);
  }

  const rifle=new THREE.Group();
  rifle.position.set(.12,1.18,-.34);
  rifle.rotation.set(-.08,0,-.08);
  const receiver=new THREE.Mesh(new THREE.BoxGeometry(.13,.10,.58),mats.weapon);
  receiver.position.z=-.18;
  rifle.add(receiver);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.018,.020,.72,10),mats.metal);
  barrel.rotation.x=Math.PI/2;
  barrel.position.z=-.80;
  rifle.add(barrel);
  const scope=new THREE.Mesh(new THREE.CylinderGeometry(.038,.038,.30,12),mats.weapon);
  scope.rotation.x=Math.PI/2;
  scope.position.set(0,.105,-.26);
  rifle.add(scope);
  root.add(rifle);

  const tag=makeLabelSprite('P2 · '+peerId.slice(0,5).toUpperCase());
  tag.position.set(0,2.28,0);
  root.add(tag);

  root.traverse(o=>{
    if(o.isMesh){
      o.castShadow=false;
      o.receiveShadow=false;
      o.userData.ignoreFpsCollision=true;
      o.userData.multiplayerRemote=true;
    }
  });

  return {
    peerId,root,torso,head,leftArm,rightArm,leftLeg,rightLeg,rifle,tag,
    targetPos:new THREE.Vector3(),
    targetYaw:0,
    targetPitch:0,
    targetCrouch:0,
    targetAim:0,
    targetHp:100,
    targetAlive:true,
    lastPacketAt:performance.now(),
    previousPos:new THREE.Vector3(),
    velocity:new THREE.Vector3(),
    phase:0,
    initialized:false,
    active:false,
    mats
  };
}

function disposeRemotePlayer(remote){
  remote.root.parent?.remove(remote.root);
  remote.root.traverse(o=>{
    if(o.userData?.disposeMultiplayer)o.userData.disposeMultiplayer();
    if(o.isMesh){
      o.geometry?.dispose?.();
    }
  });
  for(const m of Object.values(remote.mats||{}))m?.dispose?.();
}

function makeRemoteTracer(scene,origin,dir){
  const a=new THREE.Vector3(...origin);
  const d=new THREE.Vector3(...dir).normalize();
  const b=a.clone().addScaledVector(d,120);
  const geo=new THREE.BufferGeometry().setFromPoints([a,b]);
  const mat=new THREE.LineBasicMaterial({
    color:0xffefbd,transparent:true,opacity:.84,depthWrite:false
  });
  const line=new THREE.Line(geo,mat);
  line.name='V142_REMOTE_SHOT_TRACER';
  line.userData={multiplayerFx:true,life:.14,maxLife:.14};
  scene.add(line);
  return line;
}

export function installMultiplayerV142({scene,world,onStatus,onDamage}={}){
  const root=new THREE.Group();
  root.name='MULTIPLAYER_V142';
  root.userData.ignoreFpsCollision=true;
  world.add(root);

  const remotes=new Map();
  const effects=[];
  let room=null;
  let roomId='';
  let localSelfId='loading';
  let stateAction=null;
  let shotAction=null;
  let damageAction=null;
  let helloAction=null;
  let connected=false;
  let lastSendAt=0;
  let localStateCache=null;
  let lastError=null;
  const receivedDamageIds=new Set();

  const status=(message,kind='info')=>{
    onStatus?.({message,kind,roomId,peerCount:remotes.size,connected});
  };

  function ensureRemote(peerId){
    if(remotes.has(peerId))return remotes.get(peerId);
    if(remotes.size>=MAX_REMOTE_PLAYERS)return null;
    const remote=makeRemotePlayer(peerId);
    remote.root.visible=false;
    root.add(remote.root);
    remotes.set(peerId,remote);
    status('Đã kết nối người chơi thứ 2','connected');
    return remote;
  }

  function removeRemote(peerId){
    const remote=remotes.get(peerId);
    if(!remote)return;
    disposeRemotePlayer(remote);
    remotes.delete(peerId);
    status(remotes.size?'Đang kết nối':'Đang chờ người chơi thứ 2',remotes.size?'connected':'waiting');
  }

  function wireActions(){
    stateAction=room.makeAction('fps-state');
    shotAction=room.makeAction('fps-shot');
    damageAction=room.makeAction('fps-damage');
    helloAction=room.makeAction('hello');

    stateAction.onMessage=(data,{peerId})=>{
      if(!data||peerId===localSelfId)return;
      const remote=ensureRemote(peerId);
      if(!remote)return;
      if(!Array.isArray(data.p)||data.p.length!==3)return;

      remote.targetPos.set(Number(data.p[0])||0,Number(data.p[1])||0,Number(data.p[2])||0);
      remote.targetYaw=Number(data.yaw)||0;
      remote.targetPitch=Number(data.pitch)||0;
      remote.targetCrouch=clamp(Number(data.crouch)||0,0,1);
      remote.targetAim=clamp(Number(data.aim)||0,0,1);
      remote.targetHp=clamp(Number.isFinite(Number(data.hp))?Number(data.hp):100,0,100);
      remote.targetAlive=data.alive!==false;
      remote.active=!!data.active;
      remote.lastPacketAt=performance.now();

      if(!remote.initialized){
        remote.root.position.copy(remote.targetPos);
        remote.previousPos.copy(remote.targetPos);
        remote.root.rotation.y=remote.targetYaw;
        remote.initialized=true;
      }
    };

    shotAction.onMessage=(data,{peerId})=>{
      if(!data||peerId===localSelfId)return;
      if(!Array.isArray(data.o)||!Array.isArray(data.d))return;
      const fx=makeRemoteTracer(scene,data.o,data.d);
      effects.push(fx);
    };

    damageAction.onMessage=(data,{peerId})=>{
      if(!data||peerId===localSelfId)return;
      if(data.target&&data.target!==localSelfId)return;
      const amount=clamp(Number(data.amount)||0,0,100);
      if(amount<=0)return;
      const shotId=String(data.shotId||peerId+'-'+performance.now());
      const dedupeKey=peerId+'::'+shotId;
      if(receivedDamageIds.has(dedupeKey))return;
      receivedDamageIds.add(dedupeKey);
      if(receivedDamageIds.size>128){
        const first=receivedDamageIds.values().next().value;
        if(first)receivedDamageIds.delete(first);
      }
      onDamage?.({
        amount,
        sourcePeerId:peerId,
        shotId,
        receivedAt:performance.now()
      });
    };

    helloAction.onMessage=(data,{peerId})=>{
      ensureRemote(peerId);
      if(localStateCache)stateAction.send(localStateCache,{target:peerId}).catch(()=>{});
    };

    room.onPeerJoin=peerId=>{
      ensureRemote(peerId);
      helloAction.send({v:143,id:localSelfId},{target:peerId}).catch(()=>{});
      if(localStateCache)stateAction.send(localStateCache,{target:peerId}).catch(()=>{});
    };

    room.onPeerLeave=peerId=>removeRemote(peerId);
  }

  async function join(nextRoomId){
    const clean=String(nextRoomId||'').trim().replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40);
    if(!clean)throw new Error('Room code trống');
    leave();

    roomId=clean;
    lastError=null;
    status('Đang tải multiplayer...','connecting');

    try{
      const trystero=await loadTrystero();
      localSelfId=trystero.selfId||('local-'+Math.random().toString(36).slice(2,10));
      status('Đang kết nối room '+roomId+' qua '+trysteroSource,'connecting');

      room=trystero.joinRoom(
        {
          appId:APP_ID,
          trickleIce:true,
          relayConfig:{redundancy:3}
        },
        roomId,
        {
          onJoinError:details=>{
            const error=details?.error||details;
            lastError=error;
            status(
              'P2P join error: '+(error?.message||String(error))+
              ' · Nếu 2 mạng không kết nối trực tiếp được thì cần TURN.',
              'error'
            );
          }
        }
      );
      connected=true;
      wireActions();
      status('Đang chờ người chơi thứ 2','waiting');
      return true;
    }catch(error){
      lastError=error;
      connected=false;
      room=null;
      status('Lỗi multiplayer: '+(error?.message||String(error)),'error');
      return false;
    }
  }

  function leave(){
    if(room){
      try{room.leave();}catch{}
    }
    room=null;
    stateAction=null;
    shotAction=null;
    damageAction=null;
    helloAction=null;
    connected=false;
    for(const remote of remotes.values())disposeRemotePlayer(remote);
    remotes.clear();
    roomId='';
    status('Multiplayer: Off','off');
  }

  function updateLocal(state){
    if(!connected||!stateAction||!state)return;
    const packet={
      v:143,
      active:!!state.active,
      p:[state.x||0,state.y||0,state.z||0],
      yaw:state.yaw||0,
      pitch:state.pitch||0,
      crouch:clamp(state.crouch||0,0,1),
      aim:clamp(state.aim||0,0,1),
      hp:clamp(Number(state.hp??100),0,100),
      alive:state.alive!==false,
      weapon:'sniper'
    };
    localStateCache=packet;

    const now=performance.now();
    if(now-lastSendAt<SEND_INTERVAL_MS)return;
    lastSendAt=now;
    stateAction.send(packet).catch(error=>{
      lastError=error;
    });
  }

  function sendShot({origin,dir,aim=0}={}){
    if(!connected||!shotAction||!Array.isArray(origin)||!Array.isArray(dir))return;
    shotAction.send({v:143,o:origin,d:dir,aim:clamp(aim,0,1)}).catch(error=>{
      lastError=error;
    });
  }

  function sendDamage(targetPeerId,amount=50,shotId=''){
    if(!connected||!damageAction||!targetPeerId)return false;
    const packet={
      v:143,
      target:targetPeerId,
      amount:clamp(Number(amount)||0,0,100),
      shotId:String(shotId||('shot-'+performance.now()))
    };
    damageAction.send(packet,{target:targetPeerId}).catch(error=>{
      lastError=error;
    });
    return true;
  }

  function updateRemote(remote,dt){
    const age=performance.now()-remote.lastPacketAt;
    remote.root.visible=remote.active&&age<REMOTE_TIMEOUT_MS;
    if(!remote.root.visible)return;

    remote.velocity.copy(remote.targetPos).sub(remote.previousPos);
    const speed=remote.velocity.length()/Math.max(.001,dt);
    remote.previousPos.copy(remote.root.position);

    const posAlpha=1-Math.exp(-dt*13);
    remote.root.position.lerp(remote.targetPos,posAlpha);

    let dyaw=remote.targetYaw-remote.root.rotation.y;
    while(dyaw>Math.PI)dyaw-=Math.PI*2;
    while(dyaw<-Math.PI)dyaw+=Math.PI*2;
    remote.root.rotation.y+=dyaw*Math.min(1,dt*12);

    const crouch=remote.targetCrouch;
    const alive=remote.targetAlive!==false;
    remote.torso.position.y=1.22-.34*crouch;
    remote.head.position.y=1.82-.52*crouch;
    remote.tag.position.y=2.28-.52*crouch;
    remote.leftArm.position.y=1.45-.34*crouch;
    remote.rightArm.position.y=1.45-.34*crouch;
    remote.leftLeg.position.y=.93-.16*crouch;
    remote.rightLeg.position.y=.93-.16*crouch;

    const moving=remote.targetPos.distanceToSquared(remote.root.position)>.0025||speed>.15;
    if(moving)remote.phase+=dt*7.5;
    const stride=Math.sin(remote.phase)*(moving?.48:0);
    remote.leftLeg.rotation.x=stride;
    remote.rightLeg.rotation.x=-stride;
    remote.leftArm.rotation.x=-stride*.35;
    remote.rightArm.rotation.x=stride*.35;

    remote.rifle.rotation.x=-.08-remote.targetAim*.12;
    remote.rifle.position.y=1.18-.34*crouch+remote.targetAim*.12;

    // V143 death pose: remote remains visible but collapses sideways until respawn.
    const deathTarget=alive?0:-Math.PI*.48;
    remote.root.rotation.z+= (deathTarget-remote.root.rotation.z)*Math.min(1,dt*7);
    remote.rifle.visible=alive;
  }

  function update(dt){
    for(const remote of remotes.values())updateRemote(remote,dt);

    for(let i=effects.length-1;i>=0;i--){
      const fx=effects[i];
      fx.userData.life-=dt;
      const t=Math.max(0,fx.userData.life/fx.userData.maxLife);
      fx.material.opacity=t*.84;
      if(fx.userData.life<=0){
        scene.remove(fx);
        fx.geometry?.dispose?.();
        fx.material?.dispose?.();
        effects.splice(i,1);
      }
    }
  }

  return {
    ready:true,
    version:143,
    get selfId(){return localSelfId;},
    join,
    leave,
    update,
    updateLocal,
    sendShot,
    sendDamage,
    get connected(){return connected;},
    get roomId(){return roomId;},
    get peerCount(){return remotes.size;},
    get lastError(){return lastError;},
    get transportSource(){return trysteroSource;},
    get remoteStatus(){
      const remote=remotes.values().next().value;
      return remote?{
        peerId:remote.peerId,
        hp:remote.targetHp,
        alive:remote.targetAlive,
        active:remote.active
      }:null;
    },
    get remoteIds(){return [...remotes.keys()];}
  };
}
