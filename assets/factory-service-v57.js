import * as THREE from 'three';

// V57 — factory frontage/service roads.
// Unlike V56, this does NOT draw one perpendicular driveway from every factory
// straight to the asphalt. Each factory gets a concrete frontage lane running
// along the selected long facade, then that lane exits from one end toward the
// nearest compatible V53 asphalt route. Everything stays in 1616x2048 source pixels.

const footprintFactor=(s)=>s<18?2.35:s<26?1.9:s<38?1.52:1.30;

function nearestOnSegment(p,a,b){
  const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1];
  const vv=vx*vx+vy*vy;
  const t=vv?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
  const q=[a[0]+vx*t,a[1]+vy*t];
  return {q,t,d:Math.hypot(p[0]-q[0],p[1]-q[1])};
}
function nearestToPaths(p,paths){
  let best=null;
  for(const path of paths){
    const pts=path.pointsPx||[];
    for(let i=1;i<pts.length;i++){
      const hit=nearestOnSegment(p,pts[i-1],pts[i]);
      if(!best||hit.d<best.hit.d)best={hit,path,seg:[pts[i-1],pts[i]]};
    }
  }
  return best;
}
function rectCentered(cx,cy,ux,uy,lengthPx,widthPx){
  const vx=-uy,vy=ux,hl=lengthPx/2,hw=widthPx/2;
  return [
    [cx-ux*hl+vx*hw,cy-uy*hl+vy*hw],
    [cx+ux*hl+vx*hw,cy+uy*hl+vy*hw],
    [cx+ux*hl-vx*hw,cy+uy*hl-vy*hw],
    [cx-ux*hl-vx*hw,cy-uy*hl-vy*hw],
    [cx-ux*hl+vx*hw,cy-uy*hl+vy*hw]
  ];
}
function rectAlong(a,b,widthPx,extendStart=0,extendEnd=0){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<.001)return null;
  const ux=dx/len,uy=dy/len,nx=-uy,ny=ux,h=widthPx/2;
  const s=[a[0]-ux*extendStart,a[1]-uy*extendStart];
  const e=[b[0]+ux*extendEnd,b[1]+uy*extendEnd];
  return [
    [s[0]+nx*h,s[1]+ny*h],
    [e[0]+nx*h,e[1]+ny*h],
    [e[0]-nx*h,e[1]-ny*h],
    [s[0]-nx*h,s[1]-ny*h],
    [s[0]+nx*h,s[1]+ny*h]
  ];
}
function polygonShape(points,mapPx){
  const vs=points.slice(0,-1).map(([x,y])=>{const p=mapPx(x,y);return new THREE.Vector2(p.x,-p.z);});
  if(!THREE.ShapeUtils.isClockWise(vs))vs.reverse();
  return new THREE.Shape(vs);
}

function chooseFrontFacade(cx,cy,Lpx,Dpx,aDeg,paths){
  const a=THREE.MathUtils.degToRad(aDeg);
  const u=[Math.cos(a),Math.sin(a)];
  const v=[-Math.sin(a),Math.cos(a)];
  const candidates=[
    {sign: 1,mid:[cx+v[0]*Dpx/2,cy+v[1]*Dpx/2]},
    {sign:-1,mid:[cx-v[0]*Dpx/2,cy-v[1]*Dpx/2]}
  ];
  for(const c of candidates)c.near=nearestToPaths(c.mid,paths);
  candidates.sort((A,B)=>(A.near?.hit.d??1e9)-(B.near?.hit.d??1e9));
  return {u,v,...candidates[0]};
}

function chooseLaneExit(endpoints,u,paths){
  const opts=[];
  endpoints.forEach((end,ei)=>{
    const dir=ei===0?[-u[0],-u[1]]:[u[0],u[1]];
    for(const path of paths){
      const pts=path.pointsPx||[];
      for(let i=1;i<pts.length;i++){
        const hit=nearestOnSegment(end,pts[i-1],pts[i]);
        const vx=hit.q[0]-end[0],vy=hit.q[1]-end[1];
        const forward=vx*dir[0]+vy*dir[1];
        const lateral=Math.abs(vx*dir[1]-vy*dir[0]);
        // Strongly prefer roads reached by continuing from the end of the frontage lane.
        const backwards=forward<0?Math.abs(forward)*8:0;
        const score=Math.max(0,forward)+lateral*4+backwards+(path.widthPx<12?8:0);
        opts.push({score,end,dir,hit,path,lateral,forward});
      }
    }
  });
  opts.sort((a,b)=>a.score-b.score);
  let best=opts.find(o=>o.forward>-8&&o.lateral<55);
  if(!best)best=opts[0];
  return best;
}

export function computeFactoryServiceV57(roofs,paths){
  const services=[];
  if(!Array.isArray(roofs)||!Array.isArray(paths))return services;

  roofs.forEach((r,index)=>{
    const [cx,cy,Lpx,Spx,aDeg]=r;
    const Dpx=Spx*footprintFactor(Spx);
    const front=chooseFrontFacade(cx,cy,Lpx,Dpx,aDeg,paths);
    if(!front.near)return;

    const {u,v,sign}=front;
    // Measured-plan interpretation: concrete lane runs ALONG the long facade.
    const laneWidthPx=Math.max(7.2,Math.min(10.5,Dpx*.17));
    const facadeGapPx=Math.max(3.0,Math.min(5.5,Dpx*.09));
    const laneLengthPx=Lpx*.90;
    const offset=Dpx/2+facadeGapPx+laneWidthPx/2;
    const laneCx=cx+v[0]*offset*sign;
    const laneCy=cy+v[1]*offset*sign;

    const frontage=rectCentered(laneCx,laneCy,u[0],u[1],laneLengthPx,laneWidthPx);

    // Apron is the loading/yard slab BETWEEN building frontage and service lane.
    const apronDepthPx=facadeGapPx+1.6;
    const apronOffset=Dpx/2+apronDepthPx/2;
    const apronCx=cx+v[0]*apronOffset*sign;
    const apronCy=cy+v[1]*apronOffset*sign;
    const apron=rectCentered(apronCx,apronCy,u[0],u[1],Lpx*.78,apronDepthPx);

    const half=laneLengthPx/2;
    const endA=[laneCx-u[0]*half,laneCy-u[1]*half];
    const endB=[laneCx+u[0]*half,laneCy+u[1]*half];
    const exit=chooseLaneExit([endA,endB],u,paths);
    if(!exit)return;

    const q=exit.hit.q;
    let dx=q[0]-exit.end[0],dy=q[1]-exit.end[1],d=Math.hypot(dx,dy);
    if(d<1.5)return;
    dx/=d;dy/=d;
    const roadEdge=[
      q[0]-dx*Math.max(0,exit.path.widthPx/2-1.0),
      q[1]-dy*Math.max(0,exit.path.widthPx/2-1.0)
    ];
    const connectorWidthPx=Math.max(7.0,Math.min(10.0,laneWidthPx*.92));
    const connector=rectAlong(exit.end,roadEdge,connectorWidthPx,laneWidthPx*.22,1.0);
    if(!connector)return;

    services.push({
      id:'V57_SERVICE_'+String(index+1).padStart(2,'0'),
      factoryIndex:index,
      roadId:exit.path.id,
      sideSign:sign,
      laneWidthPx,
      frontage,
      apron,
      connector,
      centerline:[exit.end,roadEdge],
      noPlantPolygons:[frontage,apron,connector]
    });
  });
  return services;
}

function makeConcreteTexture(renderer){
  const c=document.createElement('canvas');c.width=c.height=256;
  const ctx=c.getContext('2d'),img=ctx.createImageData(256,256),d=img.data;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    let h=Math.imul(x+31,374761393)^Math.imul(y+67,668265263);
    h=Math.imul(h^(h>>>13),1274126177);
    const n=((h^(h>>>16))>>>0)/4294967295-.5;
    const base=202+n*9,k=(y*256+x)*4;
    d[k]=base+2;d[k+1]=base+2;d[k+2]=base;d[k+3]=255;
  }
  ctx.putImageData(img,0,0);
  ctx.strokeStyle='rgba(100,104,100,.18)';ctx.lineWidth=1;
  for(let p=0;p<=256;p+=72){ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,256);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return t;
}

export async function installFactoryServiceV57({
  world,roofs,mapPx,metersPerPixel,frameSignature,renderer,camera,controls
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V57 circulation data HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V57 coordinate frame mismatch');

  const services=computeFactoryServiceV57(roofs,data.paths||[]);
  const root=new THREE.Group();root.name='FACTORY_SERVICE_V57';
  root.userData={version:57,siteFrameSignature:frameSignature,count:services.length};
  world.add(root);

  const tex=makeConcreteTexture(renderer);
  const concreteMat=new THREE.MeshStandardMaterial({map:tex,color:0xd7d5cd,roughness:.97});
  const curbMat=new THREE.MeshStandardMaterial({color:0xb7bab4,roughness:.96});
  const drainMat=new THREE.MeshStandardMaterial({color:0x656c6a,roughness:.78,metalness:.10});

  const shapes=[];
  for(const s of services)for(const poly of [s.frontage,s.apron,s.connector])shapes.push(polygonShape(poly,mapPx));
  if(shapes.length){
    const geom=new THREE.ExtrudeGeometry(shapes,{depth:.09,bevelEnabled:false,steps:1,curveSegments:1});
    geom.rotateX(-Math.PI/2);
    const pos=geom.attributes.position,uv=new Float32Array(pos.count*2);
    for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i)/8;uv[i*2+1]=pos.getZ(i)/8;}
    geom.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(geom,concreteMat);
    mesh.name='V57_FACTORY_SERVICE_SURFACES';mesh.position.y=.235;mesh.receiveShadow=true;
    mesh.userData={walkable:true,driveable:true,siteFrameSignature:frameSignature};
    root.add(mesh);
  }

  // Subtle curbs and trench drains help the service road read as a real factory access road.
  for(const s of services){
    const [a,b]=s.centerline,pa=mapPx(a[0],a[1]),pb=mapPx(b[0],b[1]);
    const dx=pb.x-pa.x,dz=pb.z-pa.z,len=Math.hypot(dx,dz);
    if(len<.5)continue;
    const rot=Math.atan2(dx,dz);

    const drain=new THREE.Mesh(new THREE.BoxGeometry(s.laneWidthPx*metersPerPixel*.82,.035,.28),drainMat);
    drain.position.set(pa.x,.35,pa.z);drain.rotation.y=rot;root.add(drain);

    const lane=s.frontage;
    const p0=mapPx(lane[0][0],lane[0][1]),p1=mapPx(lane[1][0],lane[1][1]);
    const lx=p1.x-p0.x,lz=p1.z-p0.z,ll=Math.hypot(lx,lz);
    if(ll>.5){
      const laneRot=Math.atan2(lx,lz);
      const w=s.laneWidthPx*metersPerPixel;
      const nx=-lz/ll,nz=lx/ll;
      const cx=(p0.x+p1.x)/2,cz=(p0.z+p1.z)/2;
      for(const side of [-1,1]){
        const curb=new THREE.Mesh(new THREE.BoxGeometry(.22,.12,ll),curbMat);
        curb.position.set(cx+nx*(w/2+.09)*side,.33,cz+nz*(w/2+.09)*side);
        curb.rotation.y=laneRot;root.add(curb);
      }
    }
  }

  const button=document.createElement('button');
  button.textContent='Factory service: On';button.className='active';button.id='factoryServiceV57';
  button.onclick=()=>{root.visible=!root.visible;button.classList.toggle('active',root.visible);button.textContent='Factory service: '+(root.visible?'On':'Off');};
  document.querySelector('.controls')?.appendChild(button);

  window.__DALOC_V57={
    ready:true,version:57,frameSignature,count:services.length,services,
    focus:(i=0,height=150)=>{
      const s=services[Math.max(0,Math.min(services.length-1,i))];if(!s)return;
      const c=s.frontage[0],p=mapPx(c[0],c[1]);
      controls.target.set(p.x,0,p.z);camera.position.set(p.x+height*.20,height,p.z+height*.25);controls.update();
    }
  };
  console.info('[DaLoc] V57 frontage service roads installed',services.length);
  return {group:root,count:services.length,services};
}
