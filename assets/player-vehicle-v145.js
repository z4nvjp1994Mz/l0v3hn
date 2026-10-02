import * as THREE from 'three';

// V145 - lightweight GTA-style player vehicle controller.
// This controller does not own traffic AI. It temporarily takes manual control
// of an existing car/supercar agent by setting agent.manualControl=true.
// The traffic module skips manual agents, so the stolen vehicle never snaps back
// to its route while the player is driving or after it is parked.
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

  const MAX_FORWARD=29.0;
  const MAX_REVERSE=9.0;
  const ACCEL=11.5;
  const REVERSE_ACCEL=7.0;
  const BRAKE=18.0;
  const COAST_DRAG=1.55;
  const HANDBRAKE_DRAG=8.0;
  const STEER_RESPONSE=6.5;
  const MAX_STEER=1.0;

  function agents(){
    const list=typeof getAgents==='function'?getAgents():[];
    return Array.isArray(list)?list:[];
  }

  function isDrivable(agent){
    return !!(
      agent?.vehicle &&
      (agent.type==='car'||agent.type==='supercar')
    );
  }

  function nearest(point,maxDistance=4.6){
    if(!point)return null;
    let best=null;
    let bestDist=Math.max(.1,Number(maxDistance)||4.6);
    for(const agent of agents()){
      if(!isDrivable(agent))continue;
      const vehicle=agent.vehicle;
      if(vehicle.visible===false)continue;
      const dx=point.x-vehicle.position.x;
      const dz=point.z-vehicle.position.z;
      const dist=Math.hypot(dx,dz);
      if(dist<bestDist){
        bestDist=dist;
        best={agent,vehicle,distance:dist};
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
        p.y<.75
      )found.push(obj);
    });
    return found;
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
    activeAgent.speed=0;

    // Preserve a little of the traffic vehicle's incoming momentum without
    // inheriting an excessive AI speed on the first manual frame.
    speed=THREE.MathUtils.clamp(Number(agent.speed)||0,-2.5,8.0);
    steer=0;
    distanceDriven=0;
    wheelMeshes=findWheels(activeAgent.vehicle);

    activeAgent.vehicle.userData.playerDrivableV145=true;
    activeAgent.vehicle.userData.playerControlledV145=true;
    activeAgent.vehicle.userData.ignoreFpsBullet=false;

    return true;
  }

  function park(){
    if(!activeAgent)return null;

    const parked=activeAgent;
    const vehicle=parked.vehicle;
    const yaw=vehicle?.rotation?.y||0;

    parked.manualControl=true;
    parked.playerControlled=false;
    parked.speed=0;
    if(vehicle){
      vehicle.userData.playerControlledV145=false;
      forward.set(Math.sin(yaw),0,Math.cos(yaw));
      right.set(Math.cos(yaw),0,-Math.sin(yaw));
      exitPos.copy(vehicle.position)
        .addScaledVector(right,-1.75)
        .addScaledVector(forward,-.25);
      exitPos.y=0;
    }else{
      exitPos.set(0,0,0);
    }

    const result={
      agent:parked,
      vehicle,
      position:exitPos.clone(),
      yaw,
      speed
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
    const has=code=>!!keys?.has?.(code);
    const throttle=has('KeyW');
    const reverse=has('KeyS');
    const left=has('KeyA');
    const turnRight=has('KeyD');
    const handbrake=has('Space');

    if(throttle&&!reverse){
      speed+=((speed<0)?BRAKE:ACCEL)*dt;
    }else if(reverse&&!throttle){
      speed-=((speed>0)?BRAKE:REVERSE_ACCEL)*dt;
    }else{
      speed*=Math.exp(-COAST_DRAG*dt);
      if(Math.abs(speed)<.035)speed=0;
    }

    if(handbrake){
      speed*=Math.exp(-HANDBRAKE_DRAG*dt);
      if(Math.abs(speed)<.08)speed=0;
    }

    speed=THREE.MathUtils.clamp(speed,-MAX_REVERSE,MAX_FORWARD);

    const steerInput=(turnRight?1:0)-(left?1:0);
    const steerTarget=steerInput*MAX_STEER;
    steer+=(steerTarget-steer)*Math.min(1,dt*STEER_RESPONSE);

    const vehicle=activeAgent.vehicle;
    let yaw=vehicle.rotation.y;

    // Steering authority fades near zero speed and reverses naturally while backing.
    const speedAbs=Math.abs(speed);
    const steeringAuthority=THREE.MathUtils.clamp(speedAbs/2.2,0,1);
    if(steeringAuthority>.001){
      yaw+=steer*Math.sign(speed||1)*Math.min(speedAbs,20)*.070*dt*steeringAuthority;
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

      // Wheels share geometry but are independent meshes. Rotate around each
      // wheel's local axle without creating any per-frame geometry/material.
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
    version:145,
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
