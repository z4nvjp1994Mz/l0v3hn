import * as THREE from 'three';
import { computeSecondaryRoadsV58 } from './secondary-roads-v58.js';

// V63 — GLOBAL RIGID SOURCE-FIT secondary roads.
// Important change from V59: NEVER flood-fill the whole light-grey factory parcel.
// V58 supplies only topology. Each secondary-road segment is globally fitted as ONE
// straight rigid strip against the 2D masterplan: offset, tiny rotation and width.

const IMG_W=1616,IMG_H=2048;

function idx(x,y){return y*IMG_W+x;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function footprintFactor(s){return s<18?2.35:s<26?1.9:s<38?1.52:1.30;}

function drawRotRect(ctx,cx,cy,w,h,deg,fill='#fff'){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(deg*Math.PI/180);
  ctx.fillStyle=fill;ctx.fillRect(-w/2,-h/2,w,h);ctx.restore();
}
function drawPath(ctx,pts,width,stroke='#fff'){
  if(!pts||pts.length<2)return;
  ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();
}
function sampleSegment(a,b,step=9){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<1)return [a,b];
  const n=Math.max(2,Math.ceil(len/step)),out=[];
  for(let i=0;i<=n;i++){const t=i/n;out.push([a[0]+dx*t,a[1]+dy*t]);}
  return out;
}
function smoothPolyline(points){
  if(points.length<4)return points;
  let p=points.map(v=>v.slice());
  for(let pass=0;pass<2;pass++){
    const q=p.map(v=>v.slice());
    for(let i=1;i<p.length-1;i++){
      q[i][0]=p[i-1][0]*.22+p[i][0]*.56+p[i+1][0]*.22;
      q[i][1]=p[i-1][1]*.22+p[i][1]*.56+p[i+1][1]*.22;
    }
    p=q;
  }
  return p;
}
function pxRGB(data,x,y){
  x=clamp(Math.round(x),0,IMG_W-1);y=clamp(Math.round(y),0,IMG_H-1);
  const p=(y*IMG_W+x)*4;return [data[p],data[p+1],data[p+2]];
}
function sourceScore(data,x,y,ux,uy){
  // Road/service-lane pixels in this plan are neutral light grey/beige.
  // Score along the line direction as well so text, dots and isolated hatch marks lose.
  let total=0;
  for(const t of [-6,-3,0,3,6]){
    const [r,g,b]=pxRGB(data,x+ux*t,y+uy*t);
    const lum=.299*r+.587*g+.114*b;
    const chroma=Math.max(r,g,b)-Math.min(r,g,b);
    const greenPenalty=Math.max(0,g-r)*3.0;
    const bluePenalty=Math.max(0,b-r)*2.5;
    const whitePenalty=Math.max(0,lum-238)*2.8;
    const darkPenalty=Math.max(0,145-lum)*2.2;
    total+=chroma*2.2+greenPenalty+bluePenalty+whitePenalty+darkPenalty+Math.abs(lum-204)*.12;
  }
  return total/5;
}
function localLineContrast(data,x,y,nx,ny){
  // Reward a narrow corridor that has visible boundaries on both sides.
  const c=pxRGB(data,x,y),a=pxRGB(data,x+nx*7,y+ny*7),b=pxRGB(data,x-nx*7,y-ny*7);
  const lc=.299*c[0]+.587*c[1]+.114*c[2];
  const la=.299*a[0]+.587*a[1]+.114*a[2],lb=.299*b[0]+.587*b[1]+.114*b[2];
  return Math.abs(lc-la)+Math.abs(lc-lb);
}
function buildBlocked(roofs,paths){
  const c=document.createElement('canvas');c.width=IMG_W;c.height=IMG_H;
  const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,IMG_W,IMG_H);
  // Factory masses are forbidden.
  for(const r of roofs){
    const [cx,cy,L,S,a]=r,D=S*footprintFactor(S);
    drawRotRect(ctx,cx,cy,L+5,D+6,a,'#fff');
  }
  // Do not paint concrete over the asphalt body; allow the secondary road to meet its edge.
  for(const p of paths)drawPath(ctx,p.pointsPx,Math.max(2,(p.widthPx||12)-2),'#fff');
  return ctx.getImageData(0,0,IMG_W,IMG_H).data;
}
function isBlocked(blocked,x,y){
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=IMG_W||y>=IMG_H)return true;
  return blocked[(y*IMG_W+x)*4]>128;
}

function sampleInfo(data,x,y){
  const [r,g,b]=pxRGB(data,x,y);
  const lum=.299*r+.587*g+.114*b;
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  return {r,g,b,lum,chroma};
}
function colorDistance(a,b){
  const dr=a.r-b.r,dg=a.g-b.g,db=a.b-b.b;
  return Math.sqrt(dr*dr+dg*dg+db*db);
}
function roadInteriorPenalty(c){
  // Secondary roads in the masterplan are pale neutral concrete.
  // Penalise vegetation (green cast), blue roofs, dark linework and blank white paper.
  const green=Math.max(0,c.g-Math.max(c.r,c.b));
  const blue=Math.max(0,c.b-Math.max(c.r,c.g));
  const dark=Math.max(0,145-c.lum);
  const paper=Math.max(0,c.lum-244);
  return c.chroma*1.45 + green*3.4 + blue*3.0 + dark*2.0 + paper*2.6;
}
function edgeStrength(data,x,y,nx,ny,edgeOffset,sign){
  let best=0;
  for(let d=-2.5;d<=2.5;d+=1){
    const a=sampleInfo(data,x+nx*sign*(edgeOffset+d-1.2),y+ny*sign*(edgeOffset+d-1.2));
    const b=sampleInfo(data,x+nx*sign*(edgeOffset+d+1.2),y+ny*sign*(edgeOffset+d+1.2));
    best=Math.max(best,colorDistance(a,b));
  }
  return best;
}
function evaluateRigidRoad(line,pixels,blocked,widthPx,offsetPx,deltaRad){
  const a=line[0],b=line[1];
  const mx=(a[0]+b[0])*.5,my=(a[1]+b[1])*.5;
  const baseAng=Math.atan2(b[1]-a[1],b[0]-a[0]);
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const ang=baseAng+deltaRad;
  const ux=Math.cos(ang),uy=Math.sin(ang),nx=-uy,ny=ux;
  const half=widthPx*.5;

  let total=0,goodEdges=0,samples=0,blockedHits=0;
  // Ignore the extreme endpoints because they intentionally overlap collectors/junctions.
  for(let k=0;k<13;k++){
    const f=-.43 + .86*(k/12);
    const x=mx+ux*len*f+nx*offsetPx;
    const y=my+uy*len*f+ny*offsetPx;

    if(isBlocked(blocked,x,y)){blockedHits++;continue;}

    const c0=sampleInfo(pixels,x,y);
    const c1=sampleInfo(pixels,x+nx*half*.48,y+ny*half*.48);
    const c2=sampleInfo(pixels,x-nx*half*.48,y-ny*half*.48);
    const interior=(roadInteriorPenalty(c0)+roadInteriorPenalty(c1)+roadInteriorPenalty(c2))/3;

    const e1=edgeStrength(pixels,x,y,nx,ny,half,1);
    const e2=edgeStrength(pixels,x,y,nx,ny,half,-1);
    const edge=Math.min(e1,e2)*.72 + Math.max(e1,e2)*.28;
    if(e1>8&&e2>8)goodEdges++;

    // A real lane should have two readable, roughly symmetric boundaries.
    const asym=Math.abs(e1-e2)*.12;
    total+=interior - Math.min(edge,72)*.72 + asym;
    samples++;
  }

  if(samples<7 || blockedHits>5)return 1e9;
  const edgeRatio=goodEdges/samples;
  return total/samples + (1-edgeRatio)*15;
}

function rigidEndpoints(line,offsetPx,deltaRad){
  const a=line[0],b=line[1];
  const mx=(a[0]+b[0])*.5,my=(a[1]+b[1])*.5;
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const baseAng=Math.atan2(b[1]-a[1],b[0]-a[0]);
  const ang=baseAng+deltaRad,ux=Math.cos(ang),uy=Math.sin(ang),nx=-uy,ny=ux;
  return [
    [mx-ux*len*.5+nx*offsetPx,my-uy*len*.5+ny*offsetPx],
    [mx+ux*len*.5+nx*offsetPx,my+uy*len*.5+ny*offsetPx]
  ];
}

function fitExactStraightRoad(line,pixels,blocked,seedWidthPx){
  let best={score:1e9,offset:0,delta:0,width:seedWidthPx};

  // Coarse global search: every candidate is one rigid straight strip.
  for(let deg=-3;deg<=3;deg+=1){
    const d=deg*Math.PI/180;
    for(let off=-38;off<=38;off+=3){
      for(let w=Math.max(6,seedWidthPx-4);w<=Math.min(15,seedWidthPx+5);w+=2){
        const score=evaluateRigidRoad(line,pixels,blocked,w,off,d);
        if(score<best.score)best={score,offset:off,delta:d,width:w};
      }
    }
  }

  // Fine search around the best whole-line transform.
  const coarse={...best};
  for(let deg=-.9;deg<=.9;deg+=.3){
    const d=coarse.delta+deg*Math.PI/180;
    for(let off=-3;off<=3;off+=.75){
      for(let dw=-1.5;dw<=1.5;dw+=.5){
        const w=clamp(coarse.width+dw,5.8,15.5);
        const o=coarse.offset+off;
        const score=evaluateRigidRoad(line,pixels,blocked,w,o,d);
        if(score<best.score)best={score,offset:o,delta:d,width:w};
      }
    }
  }

  const pts=rigidEndpoints(line,best.offset,best.delta);
  return {
    pts,
    widthPx:best.width,
    score:best.score,
    offset:best.offset,
    angleDeg:best.delta*180/Math.PI
  };
}

async function loadSource(){
  const img=new Image();img.decoding='async';img.src='/assets/masterplan-hires.jpg?v=24';
  await img.decode();return img;
}

function makeRoadMasks(img,roofs,paths,blocks){
  const src=document.createElement('canvas');src.width=IMG_W;src.height=IMG_H;
  const sctx=src.getContext('2d',{willReadFrequently:true});sctx.drawImage(img,0,0,IMG_W,IMG_H);
  const pixels=sctx.getImageData(0,0,IMG_W,IMG_H).data;
  const blocked=buildBlocked(roofs,paths);

  const snapped=[];
  for(const block of blocks){
    for(const line of block.centerlines){
      const fit=fitExactStraightRoad(line,pixels,blocked,block.widthPx||8.6);
      snapped.push({
        id:block.id,
        pts:fit.pts,
        widthPx:fit.widthPx,
        score:fit.score,
        offset:fit.offset,
        angleDeg:fit.angleDeg
      });
    }
  }

  const outer=document.createElement('canvas');outer.width=IMG_W;outer.height=IMG_H;
  const octx=outer.getContext('2d');octx.clearRect(0,0,IMG_W,IMG_H);
  const inner=document.createElement('canvas');inner.width=IMG_W;inner.height=IMG_H;
  const ictx=inner.getContext('2d');ictx.clearRect(0,0,IMG_W,IMG_H);

  for(const s of snapped){
    // 1.6–2 px border each side = concrete curb/edge strip, not a giant paved parcel.
    drawPath(octx,s.pts,s.widthPx+3.4,'#fff');
    drawPath(ictx,s.pts,s.widthPx,'#fff');
  }

  // Erase building masses and most of the main asphalt from both masks.
  const erase=document.createElement('canvas');erase.width=IMG_W;erase.height=IMG_H;
  const ectx=erase.getContext('2d');ectx.putImageData(new ImageData(new Uint8ClampedArray(blocked),IMG_W,IMG_H),0,0);
  for(const ctx of [octx,ictx]){
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.drawImage(erase,0,0);ctx.restore();
  }

  return {inner,outer,snapped};
}

function makeConcreteTexture(renderer){
  const c=document.createElement('canvas');c.width=c.height=512;
  const ctx=c.getContext('2d'),im=ctx.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    let h=Math.imul(x+47,374761393)^Math.imul(y+79,668265263);
    h=Math.imul(h^(h>>>13),1274126177);
    const n=((h^(h>>>16))>>>0)/4294967295-.5;
    const base=202+n*8,k=(y*512+x)*4;
    im.data[k]=base+5;im.data[k+1]=base+5;im.data[k+2]=base+3;im.data[k+3]=255;
  }
  ctx.putImageData(im,0,0);
  ctx.strokeStyle='rgba(110,112,108,.11)';ctx.lineWidth=1;
  for(let p=0;p<=512;p+=112){ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,512);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(40,52);
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}

function alphaTexture(canvas,renderer){
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.NoColorSpace;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}

function makeBlueprintCutoutMask(roadMask){
  const c=document.createElement('canvas');c.width=IMG_W;c.height=IMG_H;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  const src=roadMask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,IMG_W,IMG_H).data;
  const out=ctx.createImageData(IMG_W,IMG_H);
  for(let i=0;i<IMG_W*IMG_H;i++){
    const a=src[i*4+3];
    const v=a>20?0:255;
    const p=i*4;out.data[p]=v;out.data[p+1]=v;out.data[p+2]=v;out.data[p+3]=255;
  }
  ctx.putImageData(out,0,0);
  return c;
}

export async function installSecondaryRoadsV63({
  world,roofs,mapPx,metersPerPixel,frameSignature,renderer,blueprintMat=null
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V63 circulation data HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V63 coordinate frame mismatch');

  const blocks=computeSecondaryRoadsV58(roofs,data.paths||[]);
  const img=await loadSource();
  const masks=makeRoadMasks(img,roofs,data.paths||[],blocks);

  const root=new THREE.Group();root.name='SECONDARY_ROADS_V63_GLOBAL_EXACT_FIT';
  root.userData={version:61,siteFrameSignature:frameSignature,lines:masks.snapped.length};
  world.add(root);

  // V63.3: render REAL geometry instead of one full-sheet plane + alpha mask.
  // This guarantees the Secondary roads toggle changes actual meshes in the scene.
  const concreteTex=makeConcreteTexture(renderer);
  concreteTex.repeat.set(3,3);
  const roadMat=new THREE.MeshStandardMaterial({
    map:concreteTex,
    color:0xc9c7bf,
    roughness:.96,
    metalness:0
  });
  const curbMat=new THREE.MeshStandardMaterial({
    color:0xb0b2ad,
    roughness:.94,
    metalness:0
  });

  const roadMeshes=[];
  const curbMeshes=[];
  const jointMeshes=[];

  function addRaisedStrip(pointsPx,widthPx){
    if(!pointsPx||pointsPx.length<2)return;
    const widthM=Math.max(3.8,widthPx*metersPerPixel);
    const curbW=.24;
    const yRoad=.30;
    const yCurb=.37;

    for(let i=1;i<pointsPx.length;i++){
      const a=mapPx(pointsPx[i-1][0],pointsPx[i-1][1]);
      const b=mapPx(pointsPx[i][0],pointsPx[i][1]);
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(len<.15)continue;

      const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      const rot=Math.atan2(dx,dz);

      const road=new THREE.Mesh(
        new THREE.BoxGeometry(widthM,.10,len+.10),
        roadMat
      );
      road.position.set(mx,yRoad,mz);
      road.rotation.y=rot;
      road.receiveShadow=true;
      road.name='V63_SECONDARY_ROAD_SEGMENT';
      road.userData={walkable:true,driveable:true,siteFrameSignature:frameSignature};
      root.add(road);
      roadMeshes.push(road);

      const nx=-dz/len,nz=dx/len;
      for(const side of [-1,1]){
        const curb=new THREE.Mesh(
          new THREE.BoxGeometry(curbW,.16,len+.14),
          curbMat
        );
        const off=side*(widthM/2+curbW/2);
        curb.position.set(mx+nx*off,yCurb,mz+nz*off);
        curb.rotation.y=rot;
        curb.castShadow=true;
        curb.receiveShadow=true;
        curb.name='V63_SECONDARY_CURB';
        root.add(curb);
        curbMeshes.push(curb);
      }
    }

    // No intermediate round pads: each V63 line remains one architecturally
    // straight segment. Intersections are handled by overlapping straight strips.
  }

  for(const s of masks.snapped)addRaisedStrip(s.pts,s.widthPx);

  // Keep the source-derived mask only for diagnostics/comparison; it is no longer
  // responsible for drawing the visible road surface.
  const originalBlueprintAlphaMap=blueprintMat?.alphaMap||null;
  const blueprintCutoutCanvas=makeBlueprintCutoutMask(masks.outer);
  const blueprintCutoutTex=alphaTexture(blueprintCutoutCanvas,renderer);
  for(const oldName of ['SECONDARY_ROADS_V58','SECONDARY_ROADS_V59_SOURCE_DERIVED']){
    const old=world.getObjectByName(oldName);if(old)old.visible=false;
  }
  document.getElementById('secondaryRoadsV58')?.remove();
  document.getElementById('secondaryRoadsV59')?.remove();
  document.getElementById('secondaryRoadsV60')?.remove();

  // The masterplan image already contains the same secondary roads.
  // Keep those exact pixels cut out of the blueprint while this module is active.
  // ON  = real 3D concrete road meshes fill the cutout.
  // OFF = meshes disappear and the cutout remains empty, so the change is unmistakable.
  if(blueprintMat){
    blueprintMat.alphaMap=blueprintCutoutTex;
    blueprintMat.alphaTest=.01;
    blueprintMat.transparent=true;
    blueprintMat.needsUpdate=true;
  }
  let enabled=true;
  let stateBadge=document.getElementById('secondaryRoadState');
  if(!stateBadge){
    stateBadge=document.createElement('div');
    stateBadge.id='secondaryRoadState';
    Object.assign(stateBadge.style,{
      position:'fixed',left:'16px',bottom:'112px',zIndex:'40',
      padding:'7px 10px',borderRadius:'9px',
      font:'700 10px Arial',
      background:'rgba(7,18,12,.94)',color:'#bfe7cd',
      border:'1px solid rgba(255,255,255,.12)',
      pointerEvents:'none'
    });
    document.body.appendChild(stateBadge);
  }

  const setEnabled=(on)=>{
    enabled=!!on;
    root.visible=enabled;

    // Explicitly sync every road object too. This is redundant with root.visible,
    // but prevents any later scene utility from leaving child meshes visible.
    for(const m of [...roadMeshes,...curbMeshes,...jointMeshes])m.visible=enabled;

    button.classList.toggle('active',enabled);
    button.textContent='Secondary roads: '+(enabled?'On':'Off');
    button.setAttribute('aria-pressed',enabled?'true':'false');
    button.style.background=enabled?'#effff5':'#7a2323';
    button.style.color=enabled?'#092217':'#ffffff';
    button.title=enabled?'3D secondary roads visible':'3D secondary roads hidden';
    stateBadge.textContent='SECONDARY ROAD LAYER: '+(enabled?'VISIBLE':'HIDDEN')+
      ' · '+roadMeshes.length+' rigid-fit segments · '+curbMeshes.length+' curbs';

    // The main animation loop redraws every frame; no out-of-scope camera reference here.
  };

  const button=document.createElement('button');
  button.className='active';button.id='secondaryRoadsV63';
  button.onclick=()=>setEnabled(!enabled);
  document.querySelector('.controls')?.appendChild(button);
  setEnabled(true);

  window.__DALOC_V63={
    ready:true,version:63,frameSignature,lines:masks.snapped.length,
    source:'masterplan-hires.jpg',mode:'global rigid source fit: offset + tiny rotation + fitted width',
    setEnabled,
    restoreBlueprintRoads(){
      if(blueprintMat){
        blueprintMat.alphaMap=originalBlueprintAlphaMap;
        blueprintMat.alphaTest=0;
        blueprintMat.needsUpdate=true;
      }
    },
    cutoutBlueprintRoads(){
      if(blueprintMat){
        blueprintMat.alphaMap=blueprintCutoutTex;
        blueprintMat.alphaTest=.01;
        blueprintMat.needsUpdate=true;
      }
    },
    get enabled(){return enabled;}
  };
  console.info('[DaLoc] V63 true-toggle secondary roads installed',window.__DALOC_V63);
  return {group:root,count:blocks.length,lines:masks.snapped.length};
}
