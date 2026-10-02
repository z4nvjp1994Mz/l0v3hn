import * as THREE from 'three';

const APP_ID='dalociz-netlify-v1431-2026-10';
const DISCOVERY_SETTLE_MS=1200;

const STRATEGIES=[
  {
    key:'nostr',
    label:'Nostr',
    urls:[
      'https://esm.sh/trystero@0.25.4?bundle',
      'https://esm.run/trystero',
      'https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm'
    ]
  },
  {
    key:'mqtt',
    label:'MQTT',
    urls:[
      'https://esm.sh/@trystero-p2p/mqtt@0.25.4?bundle',
      'https://cdn.jsdelivr.net/npm/@trystero-p2p/mqtt@0.25.4/+esm'
    ]
  },
  {
    key:'torrent',
    label:'Torrent',
    urls:[
      'https://esm.sh/@trystero-p2p/torrent@0.25.4?bundle',
      'https://cdn.jsdelivr.net/npm/@trystero-p2p/torrent@0.25.4/+esm'
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
    metal:new THREE.MeshStandardMaterial({color:0x48504f,roughness:.44,metalness:.42}),
    axeYellow:new THREE.MeshStandardMaterial({color:0xe0a91b,roughness:.48,metalness:.18}),
    axeHandle:new THREE.MeshStandardMaterial({color:0x5a4026,roughness:.78,metalness:.02})
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

  // V143.3: compact weapon-holding arm pose.
  // Previous hands sat around y=.57 and looked like an extra pair of feet.
  const leftArm=new THREE.Group();
  const rightArm=new THREE.Group();
  leftArm.position.set(-.31,1.46,-.02);
  rightArm.position.set(.31,1.46,-.02);
  root.add(leftArm,rightArm);

  for(const [arm,side] of [[leftArm,-1],[rightArm,1]]){
    const upper=new THREE.Mesh(new THREE.BoxGeometry(.15,.36,.17),mats.shirtDark);
    upper.position.set(-side*.035,-.14,-.055);
    upper.rotation.set(-.58,0,side*.16);
    arm.add(upper);

    // Forearm bends inward toward the rifle instead of hanging down.
    const fore=new THREE.Mesh(new THREE.BoxGeometry(.135,.34,.15),mats.shirt);
    fore.position.set(-side*.115,-.31,-.245);
    fore.rotation.set(-1.02,0,-side*.18);
    arm.add(fore);

    // Small flattened glove around the weapon grip/fore-end.
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.09,12,9),mats.glove);
    hand.position.set(-side*.18,-.34,-.405);
    hand.scale.set(.82,.70,1.05);
    hand.name='V1433_REMOTE_GLOVE_'+(side<0?'L':'R');
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

  const gatling=new THREE.Group();
  gatling.name='V152_REMOTE_GATLING_'+peerId.slice(0,8);
  gatling.position.set(.11,1.17,-.31);
  gatling.rotation.set(-.07,0,-.07);
  gatling.visible=false;

  const gReceiver=new THREE.Mesh(new THREE.BoxGeometry(.22,.16,.44),mats.weapon);
  gReceiver.position.z=-.08;
  gatling.add(gReceiver);

  const gDrum=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.16,14),mats.weapon);
  gDrum.rotation.z=Math.PI/2;
  gDrum.position.set(-.16,-.05,-.04);
  gatling.add(gDrum);

  const gCluster=new THREE.Group();
  gCluster.name='V152_REMOTE_GATLING_BARRELS';
  gCluster.position.set(0,.015,-.30);
  gatling.add(gCluster);
  for(let i=0;i<6;i++){
    const a=i*Math.PI*2/6;
    const b=new THREE.Mesh(new THREE.CylinderGeometry(.013,.014,.72,8),mats.metal);
    b.rotation.x=Math.PI/2;
    b.position.set(Math.cos(a)*.065,Math.sin(a)*.065,-.36);
    gCluster.add(b);
  }
  const gMuzzle=new THREE.Mesh(new THREE.CylinderGeometry(.05,.045,.10,12),mats.weapon);
  gMuzzle.rotation.x=Math.PI/2;
  gMuzzle.position.set(0,.015,-1.05);
  gatling.add(gMuzzle);
  root.add(gatling);

  const axe=new THREE.Group();
  axe.name='V154_REMOTE_AXE_'+peerId.slice(0,8);
  axe.position.set(.12,1.16,-.22);
  axe.rotation.set(.10,-.10,-.28);
  axe.visible=false;

  const axeHandle=new THREE.Mesh(
    new THREE.CylinderGeometry(.032,.040,.92,10),
    mats.axeHandle
  );
  axeHandle.rotation.x=Math.PI/2;
  axeHandle.position.set(0,0,-.36);
  axe.add(axeHandle);

  const axeHeadRoot=new THREE.Group();
  axeHeadRoot.position.set(0,.015,-.82);
  axeHeadRoot.rotation.z=-.50;
  axe.add(axeHeadRoot);

  const axeHead=new THREE.Mesh(
    new THREE.BoxGeometry(.20,.17,.25),
    mats.axeYellow
  );
  axeHeadRoot.add(axeHead);

  const axeBlade=new THREE.Mesh(
    new THREE.BoxGeometry(.36,.22,.075),
    mats.metal
  );
  axeBlade.position.set(-.22,-.015,-.01);
  axeBlade.rotation.z=.12;
  axeHeadRoot.add(axeBlade);

  const axeWedge=new THREE.Mesh(
    new THREE.BoxGeometry(.20,.12,.11),
    mats.axeYellow
  );
  axeWedge.position.set(.17,.015,.015);
  axeHeadRoot.add(axeWedge);

  const axeUpperGripLocal=new THREE.Vector3(0,-.01,-.30);
  const axeLowerGripLocal=new THREE.Vector3(0,-.01,.10);
  const axeGripWorld=new THREE.Vector3();
  const axeGripRoot=new THREE.Vector3();

  function placeRemoteArmHandOnAxeGrip(arm,side,localGrip){
    root.updateMatrixWorld(true);
    axe.updateMatrixWorld(true);

    axeGripWorld.copy(localGrip);
    axe.localToWorld(axeGripWorld);
    axeGripRoot.copy(axeGripWorld);
    root.worldToLocal(axeGripRoot);

    // Remote hand local coordinates are also (-side*.18,-.34,-.405).
    arm.position.set(
      axeGripRoot.x+side*.18,
      axeGripRoot.y+.34,
      axeGripRoot.z+.405
    );
  }

  root.add(axe);

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
    peerId,root,torso,head,leftArm,rightArm,leftLeg,rightLeg,rifle,gatling,gCluster,axe,axeHeadRoot,tag,
    targetPos:new THREE.Vector3(),
    targetYaw:0,
    targetPitch:0,
    targetCrouch:0,
    targetAim:0,
    targetWeapon:'sniper',
    targetMeleeSeq:0,
    meleeSeqSeen:0,
    meleeType:'none',
    meleeTime:0,
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
  root.userData.multiplayerRoot=true;
  root.userData.ignoreFpsBullet=true;
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
  let activeStrategy='none';
  let discoveryCandidates=[];
  let discoverySelectTimer=null;
  let joinGeneration=0;
  let lastSendAt=0;
  let localStateCache=null;
  let lastError=null;
  const receivedDamageIds=new Set();
  const hitRay=new THREE.Ray();
  const hitStart=new THREE.Vector3();
  const hitEnd=new THREE.Vector3();
  const hitDir=new THREE.Vector3();
  const hitCenter=new THREE.Vector3();
  const hitPoint=new THREE.Vector3();
  const hitSphere=new THREE.Sphere();

  const status=(message,kind='info')=>{
    onStatus?.({
      message,
      kind,
      roomId,
      peerCount:remotes.size,
      connected,
      strategy:activeStrategy,
      discovery:discoveryCandidates.map(c=>({
        key:c.strategy.key,
        label:c.strategy.label,
        loaded:!!c.mod,
        peerCount:c.peerIds?.size||0,
        error:c.error?.message||null
      }))
    });
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

  function closeDiscoveryRooms(exceptRoom=null){
    if(discoverySelectTimer){
      clearTimeout(discoverySelectTimer);
      discoverySelectTimer=null;
    }
    for(const candidate of discoveryCandidates){
      if(!candidate?.room||candidate.room===exceptRoom)continue;
      try{candidate.room.leave();}catch{}
      candidate.room=null;
    }
  }

  function currentRoomPeers(){
    try{
      return Object.keys(room?.getPeers?.()||{});
    }catch{
      return [];
    }
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
      remote.targetWeapon=
        data.weapon==='axe'
          ?'axe'
          :(data.weapon==='gatling'?'gatling':'sniper');

      const meleeSeq=Math.max(0,Number(data.mseq)||0);
      if(meleeSeq&&meleeSeq!==remote.meleeSeqSeen){
        remote.meleeSeqSeen=meleeSeq;
        remote.meleeType=data.mtype==='strong'?'strong':'normal';
        remote.meleeTime=0;
      }

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

    // Trystero replays active peers when assigning onPeerJoin, but explicitly
    // replay once as well so a peer found during discovery is never missed.
    for(const peerId of currentRoomPeers()){
      ensureRemote(peerId);
      helloAction.send({v:143,id:localSelfId},{target:peerId}).catch(()=>{});
      if(localStateCache)stateAction.send(localStateCache,{target:peerId}).catch(()=>{});
    }
  }

  function scheduleTransportSelection(generation){
    if(discoverySelectTimer||generation!==joinGeneration)return;
    discoverySelectTimer=setTimeout(()=>{
      discoverySelectTimer=null;
      if(generation!==joinGeneration||room)return;

      const chosen=STRATEGIES
        .map(strategy=>discoveryCandidates.find(c=>c.strategy.key===strategy.key))
        .find(candidate=>candidate?.room&&candidate.peerIds?.size>0);

      if(!chosen)return;

      room=chosen.room;
      localSelfId=chosen.selfId;
      activeStrategy=chosen.strategy.key;
      connected=true;

      closeDiscoveryRooms(room);
      wireActions();
      status(
        'Đã ghép P2 qua '+chosen.strategy.label+
        ' · peer '+[...chosen.peerIds][0]?.slice(0,6),
        'connected'
      );
    },DISCOVERY_SETTLE_MS);
  }

  async function openDiscoveryCandidate(strategy,generation){
    const candidate={
      strategy,
      mod:null,
      url:'',
      room:null,
      selfId:'',
      peerIds:new Set(),
      error:null
    };
    discoveryCandidates.push(candidate);

    try{
      const loaded=await loadStrategy(strategy);
      if(generation!==joinGeneration)return candidate;

      candidate.mod=loaded.mod;
      candidate.url=loaded.url;
      candidate.selfId=loaded.mod.selfId||(
        strategy.key+'-'+Math.random().toString(36).slice(2,10)
      );

      candidate.room=loaded.mod.joinRoom(
        {
          appId:APP_ID,
          trickleIce:true,
          rtcConfig:RTC_CONFIG,
          relayConfig:{
            redundancy:3,
            warnOnRelayFailure:false
          }
        },
        roomId,
        {
          onJoinError:details=>{
            const error=details?.error||details;
            candidate.error=error instanceof Error?error:new Error(String(error));
            lastError=candidate.error;
            status(
              strategy.label+' signaling: '+
              (candidate.error?.message||String(candidate.error)),
              'waiting'
            );
          }
        }
      );

      candidate.room.onPeerJoin=peerId=>{
        if(generation!==joinGeneration||room)return;
        candidate.peerIds.add(peerId);
        status(
          'Đã tìm thấy P2 qua '+strategy.label+' · đang chốt kết nối...',
          'connecting'
        );
        scheduleTransportSelection(generation);
      };

      candidate.room.onPeerLeave=peerId=>{
        candidate.peerIds.delete(peerId);
      };

      status(
        'Đang tìm P2 · Nostr + MQTT + Torrent · room '+roomId,
        'waiting'
      );
    }catch(error){
      candidate.error=error;
      lastError=error;
      status(
        strategy.label+' không khả dụng, tiếp tục transport khác',
        'waiting'
      );
    }

    return candidate;
  }

  async function join(nextRoomId){
    const clean=String(nextRoomId||'').trim().replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40);
    if(!clean)throw new Error('Room code trống');
    leave();

    const generation=++joinGeneration;
    roomId=clean;
    lastError=null;
    activeStrategy='discovering';
    connected=true;
    discoveryCandidates=[];

    status(
      'Đang tìm P2 qua 3 mạng signaling: Nostr + MQTT + Torrent',
      'connecting'
    );

    const results=await Promise.allSettled(
      STRATEGIES.map(strategy=>openDiscoveryCandidate(strategy,generation))
    );

    if(generation!==joinGeneration)return false;

    const available=discoveryCandidates.filter(c=>c.room);
    if(!available.length){
      connected=false;
      activeStrategy='none';
      const errors=results
        .filter(r=>r.status==='rejected')
        .map(r=>r.reason?.message||String(r.reason));
      lastError=new Error(errors.join(' | ')||'Không mở được signaling transport');
      status('Không mở được signaling transport','error');
      return false;
    }

    status(
      'Room '+roomId+' · 1/2 · đang chờ P2 qua '+
      available.map(c=>c.strategy.label).join(' + '),
      'waiting'
    );
    return true;
  }

  function leave(){
    joinGeneration++;
    closeDiscoveryRooms();
    if(room){
      try{room.leave();}catch{}
    }
    room=null;
    discoveryCandidates=[];
    activeStrategy='none';
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
      weapon:
        state.weapon==='axe'
          ?'axe'
          :(state.weapon==='gatling'?'gatling':'sniper'),
      mseq:Math.max(0,Number(state.meleeSeq)||0),
      mtype:state.meleeType==='strong'?'strong':'normal'
    };
    localStateCache=packet;

    const now=performance.now();
    if(now-lastSendAt<SEND_INTERVAL_MS)return;
    lastSendAt=now;
    stateAction.send(packet).catch(error=>{
      lastError=error;
    });
  }

  function sendShot({origin,dir,aim=0,weapon='sniper'}={}){
    if(!connected||!shotAction||!Array.isArray(origin)||!Array.isArray(dir))return;
    shotAction.send({
      v:152,
      o:origin,
      d:dir,
      aim:clamp(aim,0,1),
      weapon:weapon==='gatling'?'gatling':'sniper'
    }).catch(error=>{
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
    remote.leftArm.position.y=1.46-.34*crouch;
    remote.rightArm.position.y=1.46-.34*crouch;
    remote.leftLeg.position.y=.93-.16*crouch;
    remote.rightLeg.position.y=.93-.16*crouch;
    remote.torso.rotation.set(0,0,0);

    const moving=remote.targetPos.distanceToSquared(remote.root.position)>.0025||speed>.15;
    if(moving)remote.phase+=dt*7.5;
    const stride=Math.sin(remote.phase)*(moving?.48:0);
    remote.leftLeg.rotation.x=stride;
    remote.rightLeg.rotation.x=-stride;
    // Weapon-holding arms stay around the rifle; only a tiny locomotion bob remains.
    const armBob=moving?Math.sin(remote.phase*2)*.025:0;
    remote.leftArm.rotation.x=armBob-remote.targetAim*.035;
    remote.rightArm.rotation.x=-armBob-remote.targetAim*.035;

    remote.rifle.rotation.x=-.08-remote.targetAim*.12;
    remote.rifle.position.y=1.18-.34*crouch+remote.targetAim*.12;
    remote.gatling.position.y=1.17-.34*crouch;

    const gatlingActive=remote.targetWeapon==='gatling';
    const axeActive=remote.targetWeapon==='axe';
    if(gatlingActive)remote.gCluster.rotation.z+=dt*8.5;

    remote.axe.position.set(.12,1.16-.34*crouch,-.22);
    remote.axe.rotation.set(.10,-.10,-.28);

    if(axeActive&&remote.meleeType!=='none'){
      remote.meleeTime+=dt;
      const duration=remote.meleeType==='strong'?.88:.56;
      const mp=clamp(remote.meleeTime/duration,0,1);
      const easeOut=t=>1-Math.pow(1-clamp(t,0,1),3);
      const easeIn=t=>Math.pow(clamp(t,0,1),3);
      const smooth=t=>{
        t=clamp(t,0,1);
        return t*t*(3-2*t);
      };

      if(remote.meleeType==='strong'){
        if(mp<.34){
          const t=easeOut(mp/.34);
          remote.axe.rotation.x=THREE.MathUtils.lerp(.10,1.30,t);
          remote.axe.rotation.y=THREE.MathUtils.lerp(-.10,-.02,t);
          remote.axe.rotation.z=THREE.MathUtils.lerp(-.28,.02,t);
          remote.axe.position.y=THREE.MathUtils.lerp(1.16-.34*crouch,1.48-.34*crouch,t);
          remote.axe.position.z=THREE.MathUtils.lerp(-.22,-.08,t);
          remote.torso.rotation.x=THREE.MathUtils.lerp(0,-.10,t);
          remote.leftArm.rotation.x-=THREE.MathUtils.lerp(0,.72,t);
          remote.rightArm.rotation.x-=THREE.MathUtils.lerp(0,.82,t);
        }else if(mp<.72){
          const t=easeIn((mp-.34)/.38);
          remote.axe.rotation.x=THREE.MathUtils.lerp(1.30,-1.08,t);
          remote.axe.rotation.y=THREE.MathUtils.lerp(-.02,.03,t);
          remote.axe.rotation.z=THREE.MathUtils.lerp(.02,-.18,t);
          remote.axe.position.y=THREE.MathUtils.lerp(1.48-.34*crouch,.91-.34*crouch,t);
          remote.axe.position.z=THREE.MathUtils.lerp(-.08,-.34,t);
          remote.torso.rotation.x=THREE.MathUtils.lerp(-.10,.15,t);
          remote.leftArm.rotation.x-=THREE.MathUtils.lerp(.72,.98,t);
          remote.rightArm.rotation.x-=THREE.MathUtils.lerp(.82,1.08,t);
        }else{
          const t=smooth((mp-.72)/.28);
          remote.axe.rotation.x=THREE.MathUtils.lerp(-1.08,.10,t);
          remote.axe.rotation.y=THREE.MathUtils.lerp(.03,-.10,t);
          remote.axe.rotation.z=THREE.MathUtils.lerp(-.18,-.28,t);
          remote.axe.position.y=THREE.MathUtils.lerp(.91-.34*crouch,1.16-.34*crouch,t);
          remote.axe.position.z=THREE.MathUtils.lerp(-.34,-.22,t);
          remote.torso.rotation.x=THREE.MathUtils.lerp(.15,0,t);
          remote.leftArm.rotation.x-=THREE.MathUtils.lerp(.98,0,t);
          remote.rightArm.rotation.x-=THREE.MathUtils.lerp(1.08,0,t);
        }
      }else{
        if(mp<.26){
          const t=easeOut(mp/.26);
          remote.axe.rotation.x=THREE.MathUtils.lerp(.10,.72,t);
          remote.axe.rotation.y=THREE.MathUtils.lerp(-.10,-.66,t);
          remote.axe.rotation.z=THREE.MathUtils.lerp(-.28,-.64,t);
          remote.axe.position.x=THREE.MathUtils.lerp(.12,.34,t);
          remote.axe.position.y=THREE.MathUtils.lerp(1.16-.34*crouch,1.36-.34*crouch,t);
          remote.torso.rotation.y=THREE.MathUtils.lerp(0,-.18,t);
          remote.torso.rotation.z=THREE.MathUtils.lerp(0,-.05,t);
          remote.leftArm.rotation.x-=THREE.MathUtils.lerp(0,.26,t);
          remote.rightArm.rotation.x-=THREE.MathUtils.lerp(0,.48,t);
        }else if(mp<.66){
          const t=easeIn((mp-.26)/.40);
          remote.axe.rotation.x=THREE.MathUtils.lerp(.72,-.58,t);
          remote.axe.rotation.y=THREE.MathUtils.lerp(-.66,.68,t);
          remote.axe.rotation.z=THREE.MathUtils.lerp(-.64,.28,t);
          remote.axe.position.x=THREE.MathUtils.lerp(.34,-.22,t);
          remote.axe.position.y=THREE.MathUtils.lerp(1.36-.34*crouch,.91-.34*crouch,t);
          remote.torso.rotation.y=THREE.MathUtils.lerp(-.18,.24,t);
          remote.torso.rotation.z=THREE.MathUtils.lerp(-.05,.07,t);
          remote.leftArm.rotation.x-=THREE.MathUtils.lerp(.26,.44,t);
          remote.rightArm.rotation.x-=THREE.MathUtils.lerp(.48,.68,t);
        }else{
          const t=smooth((mp-.66)/.34);
          remote.axe.rotation.x=THREE.MathUtils.lerp(-.58,.10,t);
          remote.axe.rotation.y=THREE.MathUtils.lerp(.68,-.10,t);
          remote.axe.rotation.z=THREE.MathUtils.lerp(.28,-.28,t);
          remote.axe.position.x=THREE.MathUtils.lerp(-.22,.12,t);
          remote.axe.position.y=THREE.MathUtils.lerp(.91-.34*crouch,1.16-.34*crouch,t);
          remote.torso.rotation.y=THREE.MathUtils.lerp(.24,0,t);
          remote.torso.rotation.z=THREE.MathUtils.lerp(.07,0,t);
          remote.leftArm.rotation.x-=THREE.MathUtils.lerp(.44,0,t);
          remote.rightArm.rotation.x-=THREE.MathUtils.lerp(.68,0,t);
        }
      }

      if(mp>=1){
        remote.meleeType='none';
        remote.meleeTime=0;
      }
    }

    if(axeActive){
      placeRemoteArmHandOnAxeGrip(leftArm,-1,axeUpperGripLocal);
      placeRemoteArmHandOnAxeGrip(rightArm,1,axeLowerGripLocal);
    }else{
      leftArm.position.x=-.31;
      leftArm.position.z=-.02;
      rightArm.position.x=.31;
      rightArm.position.z=-.02;
    }

    // V143 death pose: remote remains visible but collapses sideways until respawn.
    const deathTarget=alive?0:-Math.PI*.48;
    remote.root.rotation.z+= (deathTarget-remote.root.rotation.z)*Math.min(1,dt*7);
    remote.rifle.visible=alive&&!gatlingActive&&!axeActive;
    remote.gatling.visible=alive&&gatlingActive;
    remote.axe.visible=alive&&axeActive;
  }

  function raycastRemoteSegment(start,end){
    if(!start||!end)return null;
    hitStart.fromArray(start);
    hitEnd.fromArray(end);
    hitDir.copy(hitEnd).sub(hitStart);
    const segmentLength=hitDir.length();
    if(segmentLength<=.0001)return null;
    hitDir.multiplyScalar(1/segmentLength);
    hitRay.set(hitStart,hitDir);

    let best=null;

    for(const remote of remotes.values()){
      if(!remote?.root?.visible||remote.targetAlive===false||!remote.active)continue;

      const crouch=clamp(remote.targetCrouch||0,0,1);
      const base=remote.root.position;

      // Head sphere.
      hitCenter.set(
        base.x,
        base.y+1.82-.52*crouch,
        base.z
      );
      hitSphere.center.copy(hitCenter);
      hitSphere.radius=.24;
      const headHit=hitRay.intersectSphere(hitSphere,hitPoint);
      if(headHit){
        const distance=hitStart.distanceTo(headHit);
        if(distance<=segmentLength&&(!best||distance<best.distance)){
          best={
            peerId:remote.peerId,
            distance,
            point:[headHit.x,headHit.y,headHit.z],
            zone:'head'
          };
        }
      }

      // Torso/body approximated as overlapping spheres, avoiding any mesh matrix access.
      const torsoY=base.y+1.22-.34*crouch;
      for(const [dy,radius,zone] of [
        [.20,.34,'upper-torso'],
        [-.16,.36,'torso'],
        [-.48,.30,'lower-body']
      ]){
        hitCenter.set(base.x,torsoY+dy,base.z);
        hitSphere.center.copy(hitCenter);
        hitSphere.radius=radius;
        const bodyHit=hitRay.intersectSphere(hitSphere,hitPoint);
        if(!bodyHit)continue;
        const distance=hitStart.distanceTo(bodyHit);
        if(distance<=segmentLength&&(!best||distance<best.distance)){
          best={
            peerId:remote.peerId,
            distance,
            point:[bodyHit.x,bodyHit.y,bodyHit.z],
            zone
          };
        }
      }
    }

    return best;
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
    version:163,
    get selfId(){return localSelfId;},
    join,
    leave,
    update,
    updateLocal,
    sendShot,
    sendDamage,
    raycastRemoteSegment,
    get connected(){return connected;},
    get roomId(){return roomId;},
    get peerCount(){return remotes.size;},
    get lastError(){return lastError;},
    get transportSource(){return activeStrategy;},
    get discoveryStatus(){
      return discoveryCandidates.map(c=>({
        strategy:c.strategy.label,
        loaded:!!c.mod,
        peerCount:c.peerIds?.size||0,
        error:c.error?.message||null
      }));
    },
    get remoteStatus(){
      const remote=remotes.values().next().value;
      return remote?{
        peerId:remote.peerId,
        hp:remote.targetHp,
        alive:remote.targetAlive,
        active:remote.active,
        weapon:remote.targetWeapon,
        meleeType:remote.meleeType,
        meleeSeq:remote.meleeSeqSeen
      }:null;
    },
    get remoteIds(){return [...remotes.keys()];}
  };
}
