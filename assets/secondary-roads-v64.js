import * as THREE from 'three';
import { computeSecondaryRoadsV58 } from './secondary-roads-v58.js';

// V64 — EDGE-LOCKED secondary roads.
// Important change from V59: NEVER flood-fill the whole light-grey factory parcel.
// V58 supplies only topology. Each segment is locked to the TWO visible drafted
// boundaries in the 2D masterplan, then rendered as one straight concrete strip.

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
function neutralPenalty(c){
  const green=Math.max(0,c.g-Math.max(c.r,c.b));
  const blue=Math.max(0,c.b-Math.max(c.r,c.g));
  const dark=Math.max(0,150-c.lum);
  const paper=Math.max(0,c.lum-246);
  return c.chroma*1.15 + green*4.0 + blue*3.5 + dark*2.4 + paper*3.2;
}
function gradientAcross(data,x,y,nx,ny,d){
  const a=sampleInfo(data,x+nx*(d-1.25),y+ny*(d-1.25));
  const b=sampleInfo(data,x+nx*(d+1.25),y+ny*(d+1.25));
  return colorDistance(a,b);
}
function crossSectionCandidate(data,blocked,x,y,nx,ny,off,width){
  const cx=x+nx*off,cy=y+ny*off,half=width*.5;
  // Reject candidates that run through a building or main asphalt.
  for(const k of [-.40,0,.40]){
    const px=cx+nx*half*k,py=cy+ny*half*k;
    if(isBlocked(blocked,px,py)) return null;
  }

  // The real 2D road is identified by TWO roughly parallel drafted boundaries.
  let eL=0,eR=0;
  for(let d=-1.5;d<=1.5;d+=.75){
    eL=Math.max(eL,gradientAcross(data,cx,cy,nx,ny,-half+d));
    eR=Math.max(eR,gradientAcross(data,cx,cy,nx,ny, half+d));
  }

  const c0=sampleInfo(data,cx,cy);
  const c1=sampleInfo(data,cx+nx*half*.45,cy+ny*half*.45);
  const c2=sampleInfo(data,cx-nx*half*.45,cy-ny*half*.45);
  const interior=(neutralPenalty(c0)+neutralPenalty(c1)+neutralPenalty(c2))/3;

  const bothEdges=Math.min(eL,eR);
  const asym=Math.abs(eL-eR);
  // Boundary evidence dominates fill color; this avoids snapping onto broad beige parcels.
  const score=interior - bothEdges*2.35 - (eL+eR)*.24 + asym*.30 + Math.abs(off)*.025;
  return {score,eL,eR,off,width};
}
function median(values){
  if(!values.length)return 0;
  const a=[...values].sort((x,y)=>x-y),m=a.length>>1;
  return a.length%2?a[m]:(a[m-1]+a[m])*.5;
}
function robustMedian(values,limit){
  if(!values.length)return 0;
  const m=median(values);
  const kept=values.filter(v=>Math.abs(v-m)<=limit);
  return median(kept.length?kept:values);
}
function fitEdgeLockedRoad(line,pixels,blocked,seedWidthPx){
  const a=line[0],b=line[1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<3)return {pts:[a,b],widthPx:seedWidthPx,confidence:0,offset:0,angleDeg:0};

  const ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
  const hits=[];

  // Detect left/right plan edges independently at many stations.
  for(let i=0;i<17;i++){
    const t=.08+.84*(i/16);
    const x=a[0]+dx*t,y=a[1]+dy*t;
    let best=null;

    for(let off=-46;off<=46;off+=1){
      for(let w=5.5;w<=20;w+=1){
        const c=crossSectionCandidate(pixels,blocked,x,y,nx,ny,off,w);
        if(!c)continue;
        // A valid road section needs two visible boundaries.
        if(c.eL<7.5||c.eR<7.5)continue;
        if(!best||c.score<best.score)best={...c,t};
      }
    }
    if(best)hits.push(best);
  }

  if(hits.length<7){
    // Better to omit a doubtful road than visibly misalign it.
    return {pts:null,widthPx:seedWidthPx,confidence:hits.length/17,offset:0,angleDeg:0};
  }

  // Reject isolated linework/text hits using robust medians.
  const medOff=median(hits.map(h=>h.off));
  const medW=median(hits.map(h=>h.width));
  let stable=hits.filter(h=>Math.abs(h.off-medOff)<=6 && Math.abs(h.width-medW)<=4);
  if(stable.length<6)stable=hits;

  const offset=robustMedian(stable.map(h=>h.off),5);
  const width=clamp(robustMedian(stable.map(h=>h.width),3),5.5,18);

  // Infer only a tiny whole-line angle correction from offset drift.
  // Geometry remains one straight strip.
  let sw=0,st=0,so=0,stt=0,sto=0;
  for(const h of stable){
    const wgt=Math.max(.15,Math.min(2,(Math.min(h.eL,h.eR)-6)/12));
    const tt=h.t-.5;
    sw+=wgt;st+=wgt*tt;so+=wgt*h.off;stt+=wgt*tt*tt;sto+=wgt*tt*h.off;
  }
  const den=sw*stt-st*st;
  let drift=Math.abs(den)>1e-6?(sw*sto-st*so)/den:0;
  drift=clamp(drift,-4.5,4.5);

  const offA=offset-drift*.5,offB=offset+drift*.5;
  const pa=[a[0]+nx*offA,a[1]+ny*offA];
  const pb=[b[0]+nx*offB,b[1]+ny*offB];
  const angleDeg=Math.atan2(drift,len)*180/Math.PI;

  return {
    pts:[pa,pb],
    widthPx:width,
    confidence:stable.length/17,
    offset,
    angleDeg
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
      const fit=fitEdgeLockedRoad(line,pixels,blocked,block.widthPx||8.6);
      if(!fit.pts)continue;
      snapped.push({
        id:block.id,
        pts:fit.pts,
        widthPx:fit.widthPx,
        confidence:fit.confidence,
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

export async function installSecondaryRoadsV64({
  world,roofs,mapPx,metersPerPixel,frameSignature,renderer,blueprintMat=null
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V64 circulation data HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V64 coordinate frame mismatch');

  const blocks=computeSecondaryRoadsV58(roofs,data.paths||[]);
  const img=await loadSource();
  const masks=makeRoadMasks(img,roofs,data.paths||[],blocks);

  const root=new THREE.Group();root.name='SECONDARY_ROADS_V64_EDGE_LOCKED';
  root.userData={version:64,siteFrameSignature:frameSignature,lines:masks.snapped.length};
  world.add(root);

  // V64.3: render REAL geometry instead of one full-sheet plane + alpha mask.
  // This guarantees the Secondary roads toggle changes actual meshes in the scene.
  const concreteTex=makeConcreteTexture(renderer);
  concreteTex.repeat.set(3,3);
  const roadMat=new THREE.MeshStandardMaterial({
    map:concreteTex,
    color:0xd3d2cc,
    roughness:.96,
    metalness:0
  });
  const curbMat=new THREE.MeshStandardMaterial({
    color:0xb9bbb7,
    roughness:.94,
    metalness:0
  });

  const roadMeshes=[];
  const curbMeshes=[];
  const jointMeshes=[];

  function addRaisedStrip(pointsPx,widthPx){
    if(!pointsPx||pointsPx.length<2)return;
    const widthM=Math.max(3.0,widthPx*metersPerPixel);
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
      road.name='V64_SECONDARY_ROAD_SEGMENT';
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
        curb.name='V64_SECONDARY_CURB';
        root.add(curb);
        curbMeshes.push(curb);
      }
    }

    // No intermediate round pads: each V64 line remains one architecturally
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
      ' · '+roadMeshes.length+' edge-locked segments · '+curbMeshes.length+' curbs';

    // The main animation loop redraws every frame; no out-of-scope camera reference here.
  };

  const button=document.createElement('button');
  button.className='active';button.id='secondaryRoadsV64';
  button.onclick=()=>setEnabled(!enabled);
  document.querySelector('.controls')?.appendChild(button);
  setEnabled(true);

  window.__DALOC_V64={
    ready:true,version:63,frameSignature,lines:masks.snapped.length,
    source:'masterplan-hires.jpg',mode:'dual-edge locked source fit: two 2D boundaries + straight strip',
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
  console.info('[DaLoc] V64 edge-locked secondary roads installed',window.__DALOC_V64);
  return {group:root,count:blocks.length,lines:masks.snapped.length};
}
