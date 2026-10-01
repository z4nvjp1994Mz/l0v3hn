import * as THREE from 'three';

const footprintFactor=(s)=>s<18?2.35:s<26?1.9:s<38?1.52:1.30;

function nearestOnSegment(p,a,b){
  const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1];
  const vv=vx*vx+vy*vy;
  const t=vv?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
  const q=[a[0]+vx*t,a[1]+vy*t];
  return {q,t,d:Math.hypot(p[0]-q[0],p[1]-q[1])};
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

function facadeApron(cx,cy,aDeg,Lpx,Dpx,side,depthPx,widthPx){
  const a=THREE.MathUtils.degToRad(aDeg),u=[Math.cos(a),Math.sin(a)],v=[-Math.sin(a),Math.cos(a)];
  const axis=side.axis==='v'?v:u;
  const tangent=side.axis==='v'?u:v;
  const half=side.axis==='v'?Dpx/2:Lpx/2;
  const sign=side.sign;
  const edge=[cx+axis[0]*half*sign,cy+axis[1]*half*sign];
  const outer=[edge[0]+axis[0]*depthPx*sign,edge[1]+axis[1]*depthPx*sign];
  const hw=widthPx/2;
  return [
    [edge[0]+tangent[0]*hw,edge[1]+tangent[1]*hw],
    [outer[0]+tangent[0]*hw,outer[1]+tangent[1]*hw],
    [outer[0]-tangent[0]*hw,outer[1]-tangent[1]*hw],
    [edge[0]-tangent[0]*hw,edge[1]-tangent[1]*hw],
    [edge[0]+tangent[0]*hw,edge[1]+tangent[1]*hw]
  ];
}

export function computeFactoryAccessV56(roofs,paths){
  const accesses=[];
  if(!Array.isArray(roofs)||!Array.isArray(paths))return accesses;

  roofs.forEach((r,index)=>{
    const [cx,cy,Lpx,Spx,aDeg]=r;
    const Dpx=Spx*footprintFactor(Spx);
    const a=THREE.MathUtils.degToRad(aDeg),u=[Math.cos(a),Math.sin(a)],v=[-Math.sin(a),Math.cos(a)];

    // Long facades are preferred; end-wall access is allowed when it is clearly closer.
    const candidates=[
      {axis:'v',sign: 1,p:[cx+v[0]*Dpx/2,cy+v[1]*Dpx/2],penalty:0},
      {axis:'v',sign:-1,p:[cx-v[0]*Dpx/2,cy-v[1]*Dpx/2],penalty:0},
      {axis:'u',sign: 1,p:[cx+u[0]*Lpx/2,cy+u[1]*Lpx/2],penalty:12},
      {axis:'u',sign:-1,p:[cx-u[0]*Lpx/2,cy-u[1]*Lpx/2],penalty:12}
    ];

    let best=null;
    for(const side of candidates){
      for(const path of paths){
        const pts=path.pointsPx||[];
        for(let i=1;i<pts.length;i++){
          const hit=nearestOnSegment(side.p,pts[i-1],pts[i]);
          const score=hit.d+side.penalty+(path.widthPx<12?4:0);
          if(!best||score<best.score)best={score,hit,path,side,seg:[pts[i-1],pts[i]]};
        }
      }
    }
    if(!best||best.hit.d>118)return;

    const side=best.side,road=best.path,q=best.hit.q;
    const sx=side.p[0],sy=side.p[1];
    let dx=q[0]-sx,dy=q[1]-sy,d=Math.hypot(dx,dy);
    if(d<2)return;
    dx/=d;dy/=d;

    // The V53 width is the asphalt carriageway width in source pixels.
    // End a little inside asphalt so there is no visible grass seam.
    const roadEdge=[
      q[0]-dx*Math.max(0,road.widthPx/2-1.0),
      q[1]-dy*Math.max(0,road.widthPx/2-1.0)
    ];

    // Build a concrete loading apron immediately outside the selected factory facade,
    // then a narrower connector through the green belt/sidewalk to the asphalt edge.
    const apronDepth=Math.max(7,Math.min(13,Dpx*.22));
    const apronWidth=Math.max(20,Math.min(72,Lpx*.56));
    const apron=facadeApron(cx,cy,aDeg,Lpx,Dpx,side,apronDepth,apronWidth);

    const axis=side.axis==='v'?v:u;
    const apronOuter=[
      side.p[0]+axis[0]*apronDepth*side.sign,
      side.p[1]+axis[1]*apronDepth*side.sign
    ];

    const laneWidth=Math.max(7.0,Math.min(10.5,Lpx*.065));
    const driveway=rectAlong(apronOuter,roadEdge,laneWidth,0,1.2);
    if(!driveway)return;

    accesses.push({
      id:'V56_ACCESS_'+String(index+1).padStart(2,'0'),
      factoryIndex:index,
      roadId:road.id,
      side:{axis:side.axis,sign:side.sign},
      laneWidthPx:laneWidth,
      apron,
      driveway,
      centerline:[apronOuter,roadEdge]
    });
  });
  return accesses;
}

function polygonShape(points,mapPx){
  const vs=points.slice(0,-1).map(([x,y])=>{const p=mapPx(x,y);return new THREE.Vector2(p.x,-p.z);});
  if(THREE.ShapeUtils.isClockWise(vs)===false)vs.reverse();
  return new THREE.Shape(vs);
}

function makeConcreteTexture(renderer){
  const c=document.createElement('canvas');c.width=c.height=256;
  const ctx=c.getContext('2d'),img=ctx.createImageData(256,256),d=img.data;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    let h=Math.imul(x+29,374761393)^Math.imul(y+53,668265263);
    h=Math.imul(h^(h>>>13),1274126177);
    const n=((h^(h>>>16))>>>0)/4294967295-.5;
    const base=194+n*10,k=(y*256+x)*4;
    d[k]=base+3;d[k+1]=base+3;d[k+2]=base;d[k+3]=255;
  }
  ctx.putImageData(img,0,0);
  ctx.strokeStyle='rgba(108,112,108,.24)';ctx.lineWidth=1;
  for(let p=0;p<=256;p+=64){ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,256);ctx.stroke();ctx.beginPath();ctx.moveTo(0,p);ctx.lineTo(256,p);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());t.repeat.set(3.2,3.2);return t;
}

export async function installFactoryAccessV56({
  world,roofs,mapPx,metersPerPixel,frameSignature,renderer,camera,controls
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V56 circulation data HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V56 coordinate frame mismatch');

  const accesses=computeFactoryAccessV56(roofs,data.paths||[]);
  const root=new THREE.Group();root.name='FACTORY_ACCESS_V56';
  root.userData={version:56,siteFrameSignature:frameSignature,count:accesses.length};
  world.add(root);

  const concreteTex=makeConcreteTexture(renderer);
  const concreteMat=new THREE.MeshStandardMaterial({map:concreteTex,color:0xd3d1c8,roughness:.97,metalness:0});
  const edgeMat=new THREE.MeshStandardMaterial({color:0xaeb1ab,roughness:.96});
  const drainMat=new THREE.MeshStandardMaterial({color:0x656c6a,roughness:.78,metalness:.12});
  const jointMat=new THREE.MeshStandardMaterial({color:0x9ca09b,roughness:.92,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});

  const allShapes=[];
  for(const a of accesses){
    allShapes.push(polygonShape(a.apron,mapPx),polygonShape(a.driveway,mapPx));
  }
  if(allShapes.length){
    const geom=new THREE.ExtrudeGeometry(allShapes,{depth:.10,bevelEnabled:false,steps:1,curveSegments:1});
    geom.rotateX(-Math.PI/2);
    const pos=geom.attributes.position,uv=new Float32Array(pos.count*2);
    for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i)/7;uv[i*2+1]=pos.getZ(i)/7;}
    geom.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(geom,concreteMat);
    mesh.name='V56_CONCRETE_ACCESS_SURFACES';mesh.position.y=.235;mesh.receiveShadow=true;
    mesh.userData={walkable:true,driveable:true,siteFrameSignature:frameSignature};
    root.add(mesh);
  }

  // Dark trench drain at the factory end of each driveway plus subtle slab joints.
  for(const access of accesses){
    const [a,b]=access.centerline;
    const pa=mapPx(a[0],a[1]),pb=mapPx(b[0],b[1]);
    const dx=pb.x-pa.x,dz=pb.z-pa.z,len=Math.hypot(dx,dz);
    if(len<.5)continue;
    const rot=Math.atan2(dx,dz);
    const drain=new THREE.Mesh(new THREE.BoxGeometry(access.laneWidthPx*metersPerPixel*.88,.035,.32),drainMat);
    drain.position.set(pa.x,.355,pa.z);drain.rotation.y=rot;root.add(drain);

    const ux=dx/len,uz=dz/len;
    for(let d=5;d<len-2;d+=6){
      const j=new THREE.Mesh(new THREE.BoxGeometry(access.laneWidthPx*metersPerPixel*.90,.018,.045),jointMat);
      j.position.set(pa.x+ux*d,.347,pa.z+uz*d);j.rotation.y=rot;root.add(j);
    }
  }

  const button=document.createElement('button');
  button.textContent='Concrete access: On';button.className='active';button.id='factoryAccessV56';
  button.onclick=()=>{root.visible=!root.visible;button.classList.toggle('active',root.visible);button.textContent='Concrete access: '+(root.visible?'On':'Off');};
  document.querySelector('.controls')?.appendChild(button);

  const updateVisibility=()=>{
    if(!camera||!controls)return;
    root.visible=(button.classList.contains('active')) && camera.position.distanceTo(controls.target)<2500;
  };
  controls?.addEventListener('change',updateVisibility);

  window.__DALOC_V56={
    ready:true,version:56,frameSignature,count:accesses.length,accesses,
    focus:(i=0,height=150)=>{const a=accesses[Math.max(0,Math.min(accesses.length-1,i))];if(!a)return;const p=mapPx(a.centerline[0][0],a.centerline[0][1]);controls.target.set(p.x,0,p.z);camera.position.set(p.x+height*.20,height,p.z+height*.25);controls.update();}
  };
  console.info('[DaLoc] V56 concrete factory access installed',accesses.length);
  return {group:root,count:accesses.length,accesses};
}
