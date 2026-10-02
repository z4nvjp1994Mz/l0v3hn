import * as THREE from 'three';

// V145.1 - GTA-style player vehicle controller for all live traffic classes.
// Supported: passenger car, supercar, cargo truck, container truck, motorcycle.
// Taking a vehicle sets agent.manualControl=true so traffic AI cannot snap it
// back to its authored route. Parked stolen vehicles remain where the player left them.
export function createPlayerVehicleControllerV145({
  getAgents=()=>[],
  collisionTest=null
}={}){
  let activeAgent=null;
  let active=false;
  let speed=0;
  let steer=0;
  let distanceDriven=0;
  let wheelMeshes=[];

  const candidate=new THREE.Vector3();
  const forward=new THREE.Vector3();
  const right=new THREE.Vector3();
  const exitPos=new THREE.Vector3();
  const entryPos=new THREE.Vector3();

  const TYPE_CONFIG={
    car:{
      maxForward:29.0,maxReverse:9.0,accel:11.5,reverseAccel:7.0,brake:18.0,
      steerResponse:6.5,steerGain:.070,entryX:-1.48,entryZ:.15,exitX:-1.75,exitZ:-.15
    },
    supercar:{
      maxForward:36.0,maxReverse:10.0,accel:15.5,reverseAccel:8.0,brake:21.0,
      steerResponse:7.4,steerGain:.074,entryX:-1.52,entryZ:.05,exitX:-1.82,exitZ:-.12
    },
    cargo:{
      maxForward:20.0,maxReverse:6.0,accel:7.0,reverseAccel:4.5,brake:15.0,
      steerResponse:4.2,steerGain:.042,entryX:-1.62,entryZ:2.35,exitX:-1.95,exitZ:2.20
    },
    container:{
      maxForward:17.0,maxReverse:5.0,accel:5.5,reverseAccel:3.7,brake:13.0,
      steerResponse:3.5,steerGain:.032,entryX:-1.68,entryZ:4.75,exitX:-2.05,exitZ:4.55
    },
    motorcycle:{
      maxForward:31.0,maxReverse:5.5,accel:14.0,reverseAccel:5.0,brake:20.0,
      steerResponse:8.5,steerGain:.095,entryX:-.88,entryZ:.05,exitX:-1.12,exitZ:-.05
    }
  };

  const COAST_DRAG=1.55;
  const HANDBRAKE_DRAG=8.0;
  const MAX_STEER=1.0;

  function agents(){
    const list=typeof getAgents==='function'?getAgents():[];
    return Array.isArray(list)?list:[];
  }

  function configFor(agent){
    return TYPE_CONFIG[agent?.type]||TYPE_CONFIG.car;
  }

  function isDrivable(agent){
    if(!agent?.vehicle||!TYPE_CONFIG[agent.type])return false;

    // Do not steal a freight vehicle while it is physically docking/loading.
    // Cruise-state freight vehicles remain fully stealable on the road.
    if(agent.service&&agent.service.phase!=='cruise')return false;
    return true;
  }

  function localOffsetToWorld(vehicle,lx,lz,out){
    const yaw=vehicle?.rotation?.y||0;
    const c=Math.cos(yaw),sn=Math.sin(yaw);
    out.set(
      vehicle.position.x+lx*c+lz*sn,
      0,
      vehicle.position.z-lx*sn+lz*c
    );
    return out;
  }

  function nearest(point,maxDistance=4.6){
    if(!point)return null;
    let best=null;
    let bestDist=Math.max(.1,Number(maxDistance)||4.6);

    for(const agent of agents()){
      if(!isDrivable(agent))continue;
      const vehicle=agent.vehicle;
      if(vehicle.visible===false)continue;

      const cfg=configFor(agent);
      localOffsetToWorld(vehicle,cfg.entryX,cfg.entryZ,entryPos);
      const dx=point.x-entryPos.x;
      const dz=point.z-entryPos.z;
      const dist=Math.hypot(dx,dz);

      if(dist<bestDist){
        bestDist=dist;
        best={
          agent,
          vehicle,
          distance:dist,
          entryPoint:entryPos.clone()
        };
      }
    }
    return best;
  }

  function findWheels(vehicle){
    const found=[];
    vehicle?.traverse?.(obj=>{
      if(!obj?.isMesh)return;
      const p=obj.position;
      if(
        obj.geometry?.type==='CylinderGeometry' &&
        p &&
        Math.abs(p.x)>.72 &&
        p.y>=.20 &&
        p.y<.80
      )found.push(obj);
    });
    return found;
  }

  function motorcycleRider(vehicle){
    return vehicle?.children?.find?.(o=>/^V91_RIDER_/.test(o.name||''))||null;
  }

  function enter(agent){
    if(!isDrivable(agent))return false;

    if(activeAgent&&activeAgent!==agent){
      park();
    }

    activeAgent=agent;
    active=true;
    activeAgent.manualControl=true;
    activeAgent.playerControlled=true;

    const cfg=configFor(agent);

    // Preserve a little incoming motion so hijacking a moving vehicle is smooth.
    speed=THREE.MathUtils.clamp(
      Number(agent.speed)||0,
      -Math.min(2.5,cfg.maxReverse),
      Math.min(8.0,cfg.maxForward)
    );
    activeAgent.speed=Math.abs(speed);
    steer=0;
    distanceDriven=0;
    wheelMeshes=findWheels(activeAgent.vehicle);

    activeAgent.vehicle.userData.playerDrivableV145=true;
    activeAgent.vehicle.userData.playerControlledV145=true;
    activeAgent.vehicle.userData.ignoreFpsBullet=false;

    // The traffic motorcycle already carries a seated rider mesh. During manual
    // control it acts as the visible rider proxy for the local player.
    const rider=motorcycleRider(activeAgent.vehicle);
    if(rider)rider.visible=true;

    return true;
  }

  function park(){
    if(!activeAgent)return null;

    const parked=activeAgent;
    const vehicle=parked.vehicle;
    const yaw=vehicle?.rotation?.y||0;
    const cfg=configFor(parked);

    parked.manualControl=true;
    parked.playerControlled=false;
    parked.speed=0;

    if(vehicle){
      vehicle.userData.playerControlledV145=false;
      localOffsetToWorld(vehicle,cfg.exitX,cfg.exitZ,exitPos);

      // Once the player gets off a stolen motorcycle, leave it visibly parked
      // rather than leaving the original AI rider sitting on it.
      const rider=motorcycleRider(vehicle);
      if(rider&&parked.type==='motorcycle')rider.visible=false;
    }else{
      exitPos.set(0,0,0);
    }

    const result={
      agent:parked,
      vehicle,
      position:exitPos.clone(),
      yaw,
      speed,
      type:parked.type
    };

    activeAgent=null;
    active=false;
    speed=0;
    steer=0;
    wheelMeshes=[];
    return result;
  }

  function update(dt,{keys=null}={}){
    if(!active||!activeAgent?.vehicle)return null;
    if(!Number.isFinite(dt)||dt<=0)return state();

    dt=Math.min(.05,dt);
    const cfg=configFor(activeAgent);
    const has=code=>!!keys?.has?.(code);
    const throttle=has('KeyW');
    const reverse=has('KeyS');
    const left=has('KeyA');
    const turnRight=has('KeyD');
    const handbrake=has('Space');

    if(throttle&&!reverse){
      speed+=((speed<0)?cfg.brake:cfg.accel)*dt;
    }else if(reverse&&!throttle){
      speed-=((speed>0)?cfg.brake:cfg.reverseAccel)*dt;
    }else{
      speed*=Math.exp(-COAST_DRAG*dt);
      if(Math.abs(speed)<.035)speed=0;
    }

    if(handbrake){
      speed*=Math.exp(-HANDBRAKE_DRAG*dt);
      if(Math.abs(speed)<.08)speed=0;
    }

    speed=THREE.MathUtils.clamp(speed,-cfg.maxReverse,cfg.maxForward);

    // V145.1 steering fix: A must turn LEFT and D must turn RIGHT in the
    // project's +Z-forward Three.js vehicle convention.
    const steerInput=(left?1:0)-(turnRight?1:0);
    const steerTarget=steerInput*MAX_STEER;
    steer+=(steerTarget-steer)*Math.min(1,dt*cfg.steerResponse);

    const vehicle=activeAgent.vehicle;
    let yaw=vehicle.rotation.y;

    const speedAbs=Math.abs(speed);
    const steeringAuthority=THREE.MathUtils.clamp(speedAbs/2.2,0,1);
    if(steeringAuthority>.001){
      yaw+=steer*Math.sign(speed||1)*Math.min(speedAbs,20)*cfg.steerGain*dt*steeringAuthority;
    }

    forward.set(Math.sin(yaw),0,Math.cos(yaw));
    candidate.copy(vehicle.position).addScaledVector(forward,speed*dt);

    const blocked=typeof collisionTest==='function'
      ?!!collisionTest(candidate,yaw,activeAgent)
      :false;

    if(blocked){
      speed*=-.12;
      if(Math.abs(speed)<.35)speed=0;
    }else{
      const moved=vehicle.position.distanceTo(candidate);
      vehicle.position.copy(candidate);
      vehicle.rotation.y=yaw;
      distanceDriven+=moved;

      const roll=speed*dt/.35;
      for(const wheel of wheelMeshes){
        wheel.rotateY(-roll);
      }
    }

    activeAgent.speed=Math.abs(speed);
    return state();
  }

  function state(){
    return {
      active,
      agent:activeAgent,
      vehicle:activeAgent?.vehicle||null,
      type:activeAgent?.type||null,
      index:activeAgent?.index??null,
      speed,
      speedKmh:speed*3.6,
      steer,
      distanceDriven
    };
  }

  function cancel(){
    return park();
  }

  return {
    version:145.1,
    nearest,
    enter,
    park,
    cancel,
    update,
    state,
    get active(){return active;},
    get agent(){return activeAgent;},
    get vehicle(){return activeAgent?.vehicle||null;},
    get speed(){return speed;},
    get speedKmh(){return speed*3.6;},
    get steer(){return steer;},
    get distanceDriven(){return distanceDriven;}
  };
}
