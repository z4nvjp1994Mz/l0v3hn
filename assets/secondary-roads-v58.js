import * as THREE from 'three';

// V58 — block-level secondary concrete road network.
// Ground truth: the user's red markup represents the SMALL ROADS that run
// in front of factory rows and feed into the V53 asphalt roads.
// This deliberately replaces V57's per-building auto frontage logic.

const footprintFactor=(s)=>s<18?2.35:s<26?1.9:s<38?1.52:1.30;

const BLOCKS=[
  {id:'NORTH_5',members:[0,1,4,2,3],frontSign: 1,collectorEnd:-1},
  {id:'MIDWEST_5',members:[21,26,28,34,35],frontSign:-1,collectorEnd: 1},
  {id:'CENTER_3',members:[27,24,20],frontSign: 1,collectorEnd:-1},
  {id:'WEST_4',members:[5,6,11,7],frontSign: 1,collectorEnd: 1},
  {id:'WEST_PAIR',members:[18,17],frontSign: 1,collectorEnd: 1},
  {id:'SOUTH_A',members:[16,8,9],frontSign:-1,collectorEnd:-1},
  {id:'SOUTH_B',members:[10,12,15],frontSign: 1,collectorEnd:-1},
  {id:'SOUTH_TIP',members:[31,32,30,33],frontSign: 1,collectorEnd:-1},
  {id:'EAST_NORTH',members:[19,22],frontSign: 1,collectorEnd:-1},
  {id:'EAST_SOUTH',members:[23,25],frontSign: 1,collectorEnd: 1},
  {id:'SINGLE_NW',members:[14],frontSign: 1,collectorEnd: 1},
  {id:'SINGLE_NE',members:[13],frontSign: 1,collectorEnd:-1},
  {id:'SINGLE_W',members:[29],frontSign: 1,collectorEnd: 1},
  {id:'SINGLE_SW',members:[36],frontSign: 1,collectorEnd: 1}
];

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
      if(!best||hit.d<best.hit.d)best={hit,path};
    }
  }
  return best;
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
function avgAngle(roofs,members){
  let sx=0,sy=0;
  for(const i of members){
    const a=THREE.MathUtils.degToRad(roofs[i][4]);
    sx+=Math.cos(2*a);sy+=Math.sin(2*a);
  }
  return .5*Math.atan2(sy,sx);
}
function linePoint(base,u,t){return [base[0]+u[0]*t,base[1]+u[1]*t];}

export function computeSecondaryRoadsV58(roofs,paths){
  const out=[];
  for(const block of BLOCKS){
    const rows=block.members.map(i=>({i,r:roofs[i]})).filter(x=>x.r);
    if(!rows.length)continue;

    const ang=avgAngle(roofs,block.members),u=[Math.cos(ang),Math.sin(ang)],v=[-Math.sin(ang),Math.cos(ang)];
    const laneWidth=8.6;
    const rowData=[];

    for(const {i,r} of rows){
      const [cx,cy,Lpx,Spx]=r,Dpx=Spx*footprintFactor(Spx);
      const gap=Math.max(4.0,Math.min(7.0,Dpx*.10));
      const offset=Dpx/2+gap+laneWidth/2;
      const c=[cx+v[0]*offset*block.frontSign,cy+v[1]*offset*block.frontSign];
      const half=Lpx*.47;
      const a=linePoint(c,u,-half),b=linePoint(c,u,half);
      rowData.push({i,Lpx,Dpx,c,a,b,half});
    }

    // All branch roads terminate on ONE collector, producing the comb/grid shape
    // visible in the 2D plan and in the user's red markup.
    const selectedEnds=rowData.map(x=>block.collectorEnd<0?x.a:x.b);
    const collectorU=selectedEnds.reduce((s,p)=>s+p[0]*u[0]+p[1]*u[1],0)/selectedEnds.length;
    const vValues=selectedEnds.map(p=>p[0]*v[0]+p[1]*v[1]);
    const minV=Math.min(...vValues)-laneWidth*.85,maxV=Math.max(...vValues)+laneWidth*.85;
    const collectorA=[u[0]*collectorU+v[0]*minV,u[1]*collectorU+v[1]*minV];
    const collectorB=[u[0]*collectorU+v[0]*maxV,u[1]*collectorU+v[1]*maxV];

    const polygons=[],centerlines=[];
    for(const row of rowData){
      const lane=rectAlong(row.a,row.b,laneWidth,1.4,1.4);
      if(lane){polygons.push(lane);centerlines.push([row.a,row.b]);}

      const end=block.collectorEnd<0?row.a:row.b;
      const endV=end[0]*v[0]+end[1]*v[1];
      const onCollector=[u[0]*collectorU+v[0]*endV,u[1]*collectorU+v[1]*endV];
      const branch=rectAlong(end,onCollector,laneWidth,1.0,1.0);
      if(branch){polygons.push(branch);centerlines.push([end,onCollector]);}
    }

    const collector=rectAlong(collectorA,collectorB,laneWidth,1.4,1.4);
    if(collector){polygons.push(collector);centerlines.push([collectorA,collectorB]);}

    // One feeder from the collector to the nearest V53 main asphalt route.
    const candidates=[collectorA,collectorB,[(collectorA[0]+collectorB[0])/2,(collectorA[1]+collectorB[1])/2]];
    let feed=null;
    for(const p of candidates){
      const n=nearestToPaths(p,paths);
      if(n&&(!feed||n.hit.d<feed.near.hit.d))feed={start:p,near:n};
    }
    if(feed){
      const q=feed.near.hit.q;
      let dx=q[0]-feed.start[0],dy=q[1]-feed.start[1],d=Math.hypot(dx,dy);
      if(d>1){
        dx/=d;dy/=d;
        const roadEdge=[
          q[0]-dx*Math.max(0,feed.near.path.widthPx/2-1),
          q[1]-dy*Math.max(0,feed.near.path.widthPx/2-1)
        ];
        const feeder=rectAlong(feed.start,roadEdge,laneWidth,1.0,1.2);
        if(feeder){polygons.push(feeder);centerlines.push([feed.start,roadEdge]);}
      }
    }

    out.push({
      id:block.id,
      members:block.members,
      widthPx:laneWidth,
      polygons,
      centerlines,
      noPlantPolygons:polygons
    });
  }
  return out;
}

function makeConcreteTexture(renderer){
  const c=document.createElement('canvas');c.width=c.height=256;
  const ctx=c.getContext('2d'),img=ctx.createImageData(256,256),d=img.data;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    let h=Math.imul(x+43,374761393)^Math.imul(y+71,668265263);
    h=Math.imul(h^(h>>>13),1274126177);
    const n=((h^(h>>>16))>>>0)/4294967295-.5;
    const base=205+n*8,k=(y*256+x)*4;
    d[k]=base+2;d[k+1]=base+2;d[k+2]=base;d[k+3]=255;
  }
  ctx.putImageData(img,0,0);
  ctx.strokeStyle='rgba(92,96,92,.15)';ctx.lineWidth=1;
  for(let p=0;p<=256;p+=74){ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,256);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return t;
}

export async function installSecondaryRoadsV58({world,roofs,mapPx,metersPerPixel,frameSignature,renderer}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V58 circulation data HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V58 coordinate frame mismatch');

  const blocks=computeSecondaryRoadsV58(roofs,data.paths||[]);
  const root=new THREE.Group();root.name='SECONDARY_ROADS_V58';
  root.userData={version:58,siteFrameSignature:frameSignature,blocks:blocks.length};
  world.add(root);

  const tex=makeConcreteTexture(renderer);
  const roadMat=new THREE.MeshStandardMaterial({map:tex,color:0xd0cec5,roughness:.97});
  const curbMat=new THREE.MeshStandardMaterial({color:0xaaaDA8,roughness:.95});
  const drainMat=new THREE.MeshStandardMaterial({color:0x5f6765,roughness:.80,metalness:.10});

  const shapes=[];
  blocks.forEach(b=>b.polygons.forEach(poly=>shapes.push(polygonShape(poly,mapPx))));
  if(shapes.length){
    const geom=new THREE.ExtrudeGeometry(shapes,{depth:.08,bevelEnabled:false,steps:1,curveSegments:1});
    geom.rotateX(-Math.PI/2);
    const pos=geom.attributes.position,uv=new Float32Array(pos.count*2);
    for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i)/8;uv[i*2+1]=pos.getZ(i)/8;}
    geom.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(geom,roadMat);
    mesh.position.y=.23;mesh.receiveShadow=true;
    mesh.name='V58_SECONDARY_CONCRETE_NETWORK';
    mesh.userData={walkable:true,driveable:true,siteFrameSignature:frameSignature};
    root.add(mesh);
  }

  // Trench drains at branch/collector junctions make the smaller roads readable at walking distance.
  for(const block of blocks){
    for(const [a,b] of block.centerlines){
      const pa=mapPx(a[0],a[1]),pb=mapPx(b[0],b[1]),dx=pb.x-pa.x,dz=pb.z-pa.z,len=Math.hypot(dx,dz);
      if(len<8)continue;
      const rot=Math.atan2(dx,dz);
      const drain=new THREE.Mesh(new THREE.BoxGeometry(block.widthPx*metersPerPixel*.72,.025,.20),drainMat);
      drain.position.set(pa.x,.34,pa.z);drain.rotation.y=rot;root.add(drain);
    }
  }

  const button=document.createElement('button');
  button.textContent='Secondary roads: On';button.className='active';button.id='secondaryRoadsV58';
  button.onclick=()=>{root.visible=!root.visible;button.classList.toggle('active',root.visible);button.textContent='Secondary roads: '+(root.visible?'On':'Off');};
  document.querySelector('.controls')?.appendChild(button);

  window.__DALOC_V58={ready:true,version:58,frameSignature,blocks,count:blocks.length};
  console.info('[DaLoc] V58 secondary concrete roads installed',blocks.length);
  return {group:root,blocks,count:blocks.length};
}
