import * as THREE from 'three';
import { computeSecondaryRoadsV58 } from './secondary-roads-v58.js';

// V59 — source-derived secondary concrete roads.
// V58 generated road geometry from building groups. V59 only uses those lines as
// SEARCH SEEDS, then reads the actual masterplan pixels and keeps the connected
// low-saturation concrete/paved surfaces from the 2D drawing. The visible shape
// therefore comes from the source plan, not from guessed rectangles.

const IMG_W=1616,IMG_H=2048;

function footprintFactor(s){return s<18?2.35:s<26?1.9:s<38?1.52:1.30;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function idx(x,y){return y*IMG_W+x;}

function roadScore(r,g,b){
  const lum=.299*r+.587*g+.114*b;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),ch=mx-mn;
  // Concrete/service roads on the source plan are light neutral grey/beige.
  // Penalise green landscaping, blue roofs and near-white background.
  return ch*4 + Math.max(0,g-r)*3.2 + Math.max(0,b-r)*2.2 + Math.abs(lum-205)*.18;
}
function broadRoadLike(r,g,b){
  const lum=.299*r+.587*g+.114*b;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),ch=mx-mn;
  return lum>142&&lum<244&&ch<43&&(g-r)<25&&(b-r)<30;
}
function drawRotRect(ctx,cx,cy,w,h,deg,fill='#fff'){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(deg*Math.PI/180);
  ctx.fillStyle=fill;ctx.fillRect(-w/2,-h/2,w,h);ctx.restore();
}
function drawPath(ctx,pts,width,stroke='#fff'){
  if(!pts?.length)return;
  ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();
}
function sampleLine(a,b,step=15){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),out=[];
  const n=Math.max(1,Math.ceil(len/step));
  for(let i=0;i<=n;i++){const t=i/n;out.push([a[0]+dx*t,a[1]+dy*t]);}
  return out;
}

async function loadSource(){
  const img=new Image();img.decoding='async';img.src='/assets/masterplan-hires.jpg?v=23';
  await img.decode();return img;
}

function makeMaskCanvas(img,roofs,paths,approxBlocks){
  const src=document.createElement('canvas');src.width=IMG_W;src.height=IMG_H;
  const sctx=src.getContext('2d',{willReadFrequently:true});
  sctx.drawImage(img,0,0,IMG_W,IMG_H);
  const pixels=sctx.getImageData(0,0,IMG_W,IMG_H).data;

  // Allowed zone: expanded factory plots + broad corridors around approximate V58 lines.
  // This is ONLY a search window; it does not define the rendered road edge.
  const allow=document.createElement('canvas');allow.width=IMG_W;allow.height=IMG_H;
  const actx=allow.getContext('2d');actx.fillStyle='#000';actx.fillRect(0,0,IMG_W,IMG_H);
  for(const r of roofs){
    const [cx,cy,L,S,a]=r,D=S*footprintFactor(S);
    drawRotRect(actx,cx,cy,L+72,D+94,a,'#fff');
  }
  actx.strokeStyle='#fff';actx.lineCap='round';actx.lineJoin='round';
  for(const b of approxBlocks)for(const line of b.centerlines)drawPath(actx,line,86,'#fff');
  const allowA=actx.getImageData(0,0,IMG_W,IMG_H).data;

  // Block roofs/buildings and the V53 asphalt road polygons BEFORE region growing.
  const blocked=document.createElement('canvas');blocked.width=IMG_W;blocked.height=IMG_H;
  const bctx=blocked.getContext('2d');bctx.fillStyle='#000';bctx.fillRect(0,0,IMG_W,IMG_H);
  for(const r of roofs){
    const [cx,cy,L,S,a]=r,D=S*footprintFactor(S);
    drawRotRect(bctx,cx,cy,L+7,D+8,a,'#fff');
  }
  for(const p of paths)drawPath(bctx,p.pointsPx,(p.widthPx||12)+7,'#fff');
  const blockedA=bctx.getImageData(0,0,IMG_W,IMG_H).data;

  const N=IMG_W*IMG_H,candidate=new Uint8Array(N);
  for(let y=1;y<IMG_H-1;y++){
    let k=y*IMG_W+1,pi=(k*4);
    for(let x=1;x<IMG_W-1;x++,k++,pi+=4){
      if(allowA[pi+3]<128||blockedA[pi+3]>128)continue;
      const r=pixels[pi],g=pixels[pi+1],b=pixels[pi+2];
      if(broadRoadLike(r,g,b)&&roadScore(r,g,b)<95)candidate[k]=1;
    }
  }

  // V58 is used only to place search seeds close to the real road. Each seed then
  // snaps to the best source-plan road pixel in a local radius.
  const rawSeeds=[];
  for(const block of approxBlocks)for(const line of block.centerlines)rawSeeds.push(...sampleLine(line[0],line[1],18));
  const seeds=[];
  for(const [sx0,sy0] of rawSeeds){
    const sx=Math.round(sx0),sy=Math.round(sy0);
    let best=null;
    for(let dy=-18;dy<=18;dy+=2)for(let dx=-18;dx<=18;dx+=2){
      const x=sx+dx,y=sy+dy;if(x<2||y<2||x>=IMG_W-2||y>=IMG_H-2)continue;
      const k=idx(x,y),pi=k*4;
      if(!candidate[k])continue;
      const sc=roadScore(pixels[pi],pixels[pi+1],pixels[pi+2])+.06*(dx*dx+dy*dy);
      if(!best||sc<best.sc)best={x,y,sc};
    }
    if(best)seeds.push([best.x,best.y]);
  }

  const visited=new Uint8Array(N),queue=new Int32Array(N);
  let head=0,tail=0;
  for(const [x,y] of seeds){
    const k=idx(x,y);if(candidate[k]&&!visited[k]){visited[k]=1;queue[tail++]=k;}
  }
  const n1=[-1,1,-IMG_W,IMG_W,-IMG_W-1,-IMG_W+1,IMG_W-1,IMG_W+1];
  const n2=[-2,2,-IMG_W*2,IMG_W*2];
  while(head<tail){
    const k=queue[head++],x=k%IMG_W,y=(k/IMG_W)|0;
    for(const d of n1){
      const q=k+d;if(q<=0||q>=N-1||visited[q]||!candidate[q])continue;
      const qx=q%IMG_W,qy=(q/IMG_W)|0;if(Math.abs(qx-x)>2||Math.abs(qy-y)>2)continue;
      visited[q]=1;queue[tail++]=q;
    }
    // bridge a one-pixel drafting line/gap without widening the final road footprint
    for(const d of n2){
      const q=k+d;if(q<=0||q>=N-1||visited[q]||!candidate[q])continue;
      const qx=q%IMG_W,qy=(q/IMG_W)|0;if(Math.abs(qx-x)>2||Math.abs(qy-y)>2)continue;
      visited[q]=1;queue[tail++]=q;
    }
  }

  // Small single-pass hole closure for hatch/text interruptions inside concrete.
  const closed=visited.slice();
  for(let y=2;y<IMG_H-2;y++)for(let x=2;x<IMG_W-2;x++){
    const k=idx(x,y);if(closed[k]||blockedA[k*4+3]>128||allowA[k*4+3]<128)continue;
    let c=0;for(const d of n1)c+=visited[k+d]?1:0;
    if(c>=5)closed[k]=1;
  }

  const mask=document.createElement('canvas');mask.width=IMG_W;mask.height=IMG_H;
  const mctx=mask.getContext('2d'),out=mctx.createImageData(IMG_W,IMG_H);
  let count=0;
  for(let k=0;k<N;k++)if(closed[k]){
    const p=k*4;out.data[p]=255;out.data[p+1]=255;out.data[p+2]=255;out.data[p+3]=255;count++;
  }
  mctx.putImageData(out,0,0);

  // One-pixel outer curb/reference edge derived from the exact mask.
  const edge=document.createElement('canvas');edge.width=IMG_W;edge.height=IMG_H;
  const ectx=edge.getContext('2d'),eo=ectx.createImageData(IMG_W,IMG_H);
  for(let y=1;y<IMG_H-1;y++)for(let x=1;x<IMG_W-1;x++){
    const k=idx(x,y);if(!closed[k])continue;
    if(!closed[k-1]||!closed[k+1]||!closed[k-IMG_W]||!closed[k+IMG_W]){
      const p=k*4;eo.data[p]=255;eo.data[p+1]=255;eo.data[p+2]=255;eo.data[p+3]=255;
    }
  }
  ectx.putImageData(eo,0,0);
  return {mask,edge,pixelCount:count,seedCount:seeds.length};
}

function makeConcreteTexture(renderer){
  const c=document.createElement('canvas');c.width=c.height=512;
  const ctx=c.getContext('2d'),im=ctx.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    let h=Math.imul(x+47,374761393)^Math.imul(y+79,668265263);
    h=Math.imul(h^(h>>>13),1274126177);
    const n=((h^(h>>>16))>>>0)/4294967295-.5;
    const base=201+n*11,k=(y*512+x)*4;
    im.data[k]=base+4;im.data[k+1]=base+4;im.data[k+2]=base+1;im.data[k+3]=255;
  }
  ctx.putImageData(im,0,0);
  ctx.strokeStyle='rgba(105,108,103,.16)';ctx.lineWidth=1;
  for(let p=0;p<=512;p+=96){ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,512);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(42,54);
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}

export async function installSecondaryRoadsV59({
  world,roofs,mapPx,metersPerPixel,frameSignature,renderer
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V59 circulation data HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V59 coordinate frame mismatch');

  const img=await loadSource();
  const approxBlocks=computeSecondaryRoadsV58(roofs,data.paths||[]);
  const derived=makeMaskCanvas(img,roofs,data.paths||[],approxBlocks);

  const root=new THREE.Group();root.name='SECONDARY_ROADS_V59_SOURCE_DERIVED';
  root.userData={version:59,siteFrameSignature:frameSignature,pixelCount:derived.pixelCount,seedCount:derived.seedCount};
  world.add(root);

  const center=mapPx(IMG_W/2,IMG_H/2),planeW=IMG_W*metersPerPixel,planeH=IMG_H*metersPerPixel;
  const alpha=new THREE.CanvasTexture(derived.mask);alpha.colorSpace=THREE.NoColorSpace;
  alpha.minFilter=THREE.LinearMipmapLinearFilter;alpha.magFilter=THREE.LinearFilter;
  alpha.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());

  const concrete=makeConcreteTexture(renderer);
  const mat=new THREE.MeshStandardMaterial({
    map:concrete,alphaMap:alpha,transparent:true,alphaTest:.22,
    color:0xd7d4cb,roughness:.96,metalness:0,depthWrite:true
  });
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(planeW,planeH),mat);
  surface.rotation.x=-Math.PI/2;surface.position.set(center.x,.255,center.z);
  surface.receiveShadow=true;surface.name='V59_EXACT_SECONDARY_CONCRETE';
  surface.userData={walkable:true,driveable:true,siteFrameSignature:frameSignature};
  root.add(surface);

  const edgeTex=new THREE.CanvasTexture(derived.edge);edgeTex.colorSpace=THREE.NoColorSpace;
  edgeTex.minFilter=THREE.LinearMipmapLinearFilter;edgeTex.magFilter=THREE.LinearFilter;
  const curbMat=new THREE.MeshStandardMaterial({
    alphaMap:edgeTex,transparent:true,alphaTest:.18,color:0xb8bab4,roughness:.95,depthWrite:true
  });
  const edgeMesh=new THREE.Mesh(new THREE.PlaneGeometry(planeW,planeH),curbMat);
  edgeMesh.rotation.x=-Math.PI/2;edgeMesh.position.set(center.x,.305,center.z);
  edgeMesh.name='V59_SOURCE_EDGE_CURB';root.add(edgeMesh);

  // Hide the old V58 visual layer if this file is hot-reloaded over a cached page.
  const old=world.getObjectByName('SECONDARY_ROADS_V58');if(old)old.visible=false;

  const oldBtn=document.getElementById('secondaryRoadsV58');if(oldBtn)oldBtn.remove();
  const button=document.createElement('button');button.textContent='Secondary roads: On';
  button.className='active';button.id='secondaryRoadsV59';
  button.onclick=()=>{root.visible=!root.visible;button.classList.toggle('active',root.visible);button.textContent='Secondary roads: '+(root.visible?'On':'Off');};
  document.querySelector('.controls')?.appendChild(button);

  window.__DALOC_V59={
    ready:true,version:59,frameSignature,pixelCount:derived.pixelCount,seedCount:derived.seedCount,
    source:'masterplan-hires.jpg',mode:'source-derived connected concrete mask'
  };
  console.info('[DaLoc] V59 source-derived secondary roads installed',window.__DALOC_V59);
  return {group:root,count:approxBlocks.length,pixelCount:derived.pixelCount,seedCount:derived.seedCount};
}
