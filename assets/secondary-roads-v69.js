import * as THREE from 'three';
// V69 — ONE-FRONTAGE + VERIFIED BRANCH NETWORK.
// Deliberately returns to the V66 one-frontage model because the V67 four-side scan
// created false beige strips around warehouses. V69 keeps only the selected frontage
// road for each block, narrows it to the true service-road scale, and adds collectors/
// feeders only when the 2D masterplan pixels support them.

const IMG_W=1616,IMG_H=2048;

function idx(x,y){return y*IMG_W+x;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function footprintFactor(s){return s<18?2.35:s<26?1.9:s<38?1.52:1.30;}

const BLOCKS_V69=[
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

function nearestOnSegmentV69(p,a,b){
  const vx=b[0]-a[0],vy=b[1]-a[1],wx=p[0]-a[0],wy=p[1]-a[1];
  const vv=vx*vx+vy*vy;
  const t=vv?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
  const q=[a[0]+vx*t,a[1]+vy*t];
  return {q,t,d:Math.hypot(p[0]-q[0],p[1]-q[1])};
}
function nearestToPathsV69(p,paths){
  let best=null;
  for(const path of paths){
    const pts=path.pointsPx||[];
    for(let i=1;i<pts.length;i++){
      const hit=nearestOnSegmentV69(p,pts[i-1],pts[i]);
      if(!best||hit.d<best.hit.d)best={hit,path};
    }
  }
  return best;
}
function avgAngleV69(roofs,members){
  let sx=0,sy=0;
  for(const i of members){
    const a=THREE.MathUtils.degToRad(roofs[i][4]);
    sx+=Math.cos(2*a);sy+=Math.sin(2*a);
  }
  return .5*Math.atan2(sy,sx);
}
function medianV69(values){
  if(!values.length)return 0;
  const a=[...values].sort((x,y)=>x-y),m=a.length>>1;
  return a.length%2?a[m]:(a[m-1]+a[m])*.5;
}
function madV69(values){
  if(!values.length)return 999;
  const m=medianV69(values);
  return medianV69(values.map(v=>Math.abs(v-m)));
}
function pxRGBV69(data,x,y){
  x=clamp(Math.round(x),0,IMG_W-1);y=clamp(Math.round(y),0,IMG_H-1);
  const p=(y*IMG_W+x)*4;return [data[p],data[p+1],data[p+2]];
}
function colorDistV69(a,b){
  const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2];
  return Math.sqrt(dr*dr+dg*dg+db*db);
}
function gradV69(data,x,y,nx,ny,d){
  const a=pxRGBV69(data,x+nx*(d-1.35),y+ny*(d-1.35));
  const b=pxRGBV69(data,x+nx*(d+1.35),y+ny*(d+1.35));
  return colorDistV69(a,b);
}
function neutralV69(rgb){
  const [r,g,b]=rgb,lum=.299*r+.587*g+.114*b;
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const green=Math.max(0,g-Math.max(r,b));
  const blue=Math.max(0,b-Math.max(r,g));
  const dark=Math.max(0,150-lum);
  const paper=Math.max(0,lum-244);
  return chroma*1.25+green*4.2+blue*3.8+dark*2.5+paper*3.2;
}
function blockedAtV69(blocked,x,y){
  x=clamp(Math.round(x),0,IMG_W-1);y=clamp(Math.round(y),0,IMG_H-1);
  return blocked[y*IMG_W+x]>20;
}

// Scan OUTWARD from the actual warehouse footprint. This is the critical change:
// the first pale strip directly at the façade is treated as loading apron and ignored.
// A valid secondary road must have a two-edge band farther outside that apron.
function scanRoadBandV69(roof,side,pixels,blocked){
  const [cx,cy,Lpx,Spx,aDeg]=roof;
  const ang=THREE.MathUtils.degToRad(aDeg);
  const u=[Math.cos(ang),Math.sin(ang)],v=[-Math.sin(ang),Math.cos(ang)];
  const Dpx=Spx*footprintFactor(Spx);
  const facade=Dpx/2;
  const hits=[];

  for(let k=0;k<15;k++){
    const along=(-.36+.72*(k/14))*Lpx;
    const bx=cx+u[0]*along,by=cy+u[1]*along;
    let best=null;

    // Do not allow the search to fall back onto the loading apron.
    for(let centerD=facade+14;centerD<=facade+62;centerD+=1){
      for(let w=5.0;w<=11.0;w+=.50){
        const inner=centerD-w*.5;
        if(inner<facade+11)continue;

        const x=bx+v[0]*side*centerD;
        const y=by+v[1]*side*centerD;
        if(blockedAtV69(blocked,x,y))continue;

        const nx=v[0]*side,ny=v[1]*side;
        const e1=gradV69(pixels,x,y,nx,ny,-w*.5);
        const e2=gradV69(pixels,x,y,nx,ny, w*.5);
        if(e1<7.2||e2<7.2)continue;

        const c0=pxRGBV69(pixels,x,y);
        const c1=pxRGBV69(pixels,x+nx*w*.28,y+ny*w*.28);
        const c2=pxRGBV69(pixels,x-nx*w*.28,y-ny*w*.28);
        const interior=(neutralV69(c0)+neutralV69(c1)+neutralV69(c2))/3;
        const both=Math.min(e1,e2),asym=Math.abs(e1-e2);

        // Prefer a crisp double boundary and penalise overly distant unrelated linework.
        const score=interior-both*2.7-(e1+e2)*.24+asym*.30+(centerD-(facade+26))*.035;
        if(!best||score<best.score)best={score,centerD,w,e1,e2};
      }
    }
    if(best)hits.push(best);
  }

  if(hits.length<8)return null;
  const dMed=medianV69(hits.map(h=>h.centerD));
  const wMed=medianV69(hits.map(h=>h.w));
  let stable=hits.filter(h=>Math.abs(h.centerD-dMed)<=5.5&&Math.abs(h.w-wMed)<=3.2);
  if(stable.length<7)stable=hits;

  const d=medianV69(stable.map(h=>h.centerD));
  const width=clamp(medianV69(stable.map(h=>h.w)),5.0,11.0);
  const edge=medianV69(stable.map(h=>Math.min(h.e1,h.e2)));
  const spread=madV69(stable.map(h=>h.centerD));
  return {side,d,width,edge,spread,count:stable.length,u,v,Dpx,Lpx,cx,cy};
}

function lineForBandV69(band){
  const {u,v,side,d,Lpx,cx,cy}=band;
  const c=[cx+v[0]*side*d,cy+v[1]*side*d];
  const ext=1.75;
  return [
    [c[0]-u[0]*(Lpx*.5+ext),c[1]-u[1]*(Lpx*.5+ext)],
    [c[0]+u[0]*(Lpx*.5+ext),c[1]+u[1]*(Lpx*.5+ext)]
  ];
}

function sourceRoadSupportV69(a,b,width,pixels,blocked,allowMainTail=false){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<3)return false;
  const ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
  let total=0,good=0;
  const start=4,end=Math.max(start+1,len-(allowMainTail?10:4));
  for(let d=start;d<end;d+=5){
    const x=a[0]+ux*d,y=a[1]+uy*d;
    if(blockedAtV69(blocked,x,y))continue;
    total++;
    let best=null;
    for(let w=Math.max(4.5,width-2);w<=Math.min(12,width+2);w+=.75){
      const c=crossSectionCandidate(pixels,blocked,x,y,nx,ny,0,w);
      if(!c)continue;
      if(!best||c.score<best.score)best=c;
    }
    if(best && best.eL>5.7 && best.eR>5.7)good++;
  }
  if(total<2)return false;
  return good/total >= (allowMainTail?.28:.38);
}

function lockLineV69(line,width,pixels,blocked){
  const fit=fitEdgeLockedRoad(line,pixels,blocked,width);
  if(fit && fit.confidence>=.30){
    return {pts:fit.pts,widthPx:clamp(fit.widthPx,5.0,11.0),confidence:fit.confidence};
  }
  return {pts:line,widthPx:clamp(width,5.0,11.0),confidence:0};
}

function buildCollectorV69(rows,block,roofs,pixels,blocked,endSign){
  if(!rows.length)return null;
  const ang=avgAngleV69(roofs,rows.map(r=>r.i));
  const u=[Math.cos(ang),Math.sin(ang)],v=[-Math.sin(ang),Math.cos(ang)];
  const ends=rows.map(r=>endSign<0?r.line[0]:r.line[1]);
  const collectorU=medianV69(ends.map(p=>p[0]*u[0]+p[1]*u[1]));
  const vv=ends.map(p=>p[0]*v[0]+p[1]*v[1]);
  const widthPx=clamp(medianV69(rows.map(r=>r.band.width)),5.0,10.0);
  const minV=Math.min(...vv)-widthPx*.30,maxV=Math.max(...vv)+widthPx*.30;
  let ca=[u[0]*collectorU+v[0]*minV,u[1]*collectorU+v[1]*minV];
  let cb=[u[0]*collectorU+v[0]*maxV,u[1]*collectorU+v[1]*maxV];
  const fit=lockLineV69([ca,cb],widthPx,pixels,blocked);
  ca=fit.pts[0];cb=fit.pts[1];
  const valid=rows.length===1
    ? sourceRoadSupportV69(ca,cb,fit.widthPx,pixels,blocked,false)
    : sourceRoadSupportV69(ca,cb,fit.widthPx,pixels,blocked,false);
  if(!valid)return null;
  return {a:ca,b:cb,widthPx:fit.widthPx,u,v,collectorU};
}

function nearestMainStopV69(p,paths,maxD=105){
  const n=nearestToPathsV69(p,paths);
  if(!n||n.hit.d>maxD)return null;
  const q=n.hit.q;
  let dx=q[0]-p[0],dy=q[1]-p[1],d=Math.hypot(dx,dy);
  if(d<2)return null;
  dx/=d;dy/=d;
  const half=(n.path.widthPx||12)*.5;
  // Enter the main asphalt by ~2 px so the secondary road fully cuts the green belt.
  return {
    p:[q[0]-dx*Math.max(0,half-2.0),q[1]-dy*Math.max(0,half-2.0)],
    path:n.path,
    d
  };
}

function computeSecondaryRoadsV69(roofs,paths,pixels,blocked){
  const out=[];
  for(const block of BLOCKS_V69){
    const rows=[];

    // ONE selected frontage side only. This is the key correction from V67.
    for(const i of block.members){
      const r=roofs[i]; if(!r)continue;
      let band=scanRoadBandV69(r,block.frontSign,pixels,blocked);
      // Only fall back to the opposite side when the intended frontage is genuinely absent.
      if(!band)band=scanRoadBandV69(r,-block.frontSign,pixels,blocked);
      if(!band)continue;

      const base=lineForBandV69(band);
      const locked=lockLineV69(base,band.width,pixels,blocked);
      rows.push({
        i,
        band:{...band,width:locked.widthPx},
        line:locked.pts
      });
    }
    if(!rows.length)continue;

    const roads=rows.map(r=>({
      pts:r.line,
      widthPx:clamp(r.band.width,5.0,11.0),
      kind:'frontage',
      roof:r.i
    }));

    // Primary collector = the side defined by the block topology.
    const primary=buildCollectorV69(rows,block,roofs,pixels,blocked,block.collectorEnd);
    // Opposite collector is added ONLY if source pixels confirm a real road there.
    const secondary=buildCollectorV69(rows,block,roofs,pixels,blocked,-block.collectorEnd);

    for(const col of [primary,secondary]){
      if(!col)continue;
      roads.push({pts:[col.a,col.b],widthPx:col.widthPx,kind:'collector'});

      // Connect every frontage line to this collector, but only if the little branch is
      // actually present in the 2D source.
      for(const row of rows){
        const end=block.collectorEnd<0
          ? (col===primary?row.line[0]:row.line[1])
          : (col===primary?row.line[1]:row.line[0]);
        const endV=end[0]*col.v[0]+end[1]*col.v[1];
        const q=[col.u[0]*col.collectorU+col.v[0]*endV,
                 col.u[1]*col.collectorU+col.v[1]*endV];
        if(Math.hypot(end[0]-q[0],end[1]-q[1])<1.2)continue;
        const w=Math.min(col.widthPx,row.band.width);
        if(sourceRoadSupportV69(end,q,w,pixels,blocked,false)){
          roads.push({pts:[end,q],widthPx:w,kind:'crosslink',roof:row.i});
        }
      }

      // Feed BOTH collector ends to the main asphalt when the masterplan supports it.
      for(const p of [col.a,col.b]){
        const stop=nearestMainStopV69(p,paths,115);
        if(!stop)continue;
        if(sourceRoadSupportV69(p,stop.p,col.widthPx,pixels,blocked,true)){
          roads.push({pts:[p,stop.p],widthPx:col.widthPx,kind:'main-crossing'});
        }
      }
    }

    // Some rows meet the main road directly without a full-height collector.
    // Recover these short branches from both frontage ends, source-verified only.
    for(const row of rows){
      for(const p of row.line){
        const stop=nearestMainStopV69(p,paths,72);
        if(!stop)continue;
        const dx=stop.p[0]-p[0],dy=stop.p[1]-p[1],d=Math.hypot(dx,dy);
        if(d<3)continue;
        if(sourceRoadSupportV69(p,stop.p,row.band.width,pixels,blocked,true)){
          roads.push({pts:[p,stop.p],widthPx:row.band.width,kind:'main-crossing',roof:row.i});
        }
      }
    }

    // De-duplicate practically identical segments.
    const unique=[],keys=new Set();
    for(const r of roads){
      const a=r.pts[0],b=r.pts[r.pts.length-1];
      const k1=[Math.round(a[0]/2),Math.round(a[1]/2),Math.round(b[0]/2),Math.round(b[1]/2)].join(':');
      const k2=[Math.round(b[0]/2),Math.round(b[1]/2),Math.round(a[0]/2),Math.round(a[1]/2)].join(':');
      if(keys.has(k1)||keys.has(k2))continue;
      keys.add(k1);unique.push(r);
    }

    out.push({id:block.id,members:rows.map(r=>r.i),roads:unique});
  }
  return out;
}

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
  const score=interior - bothEdges*2.60 - (eL+eR)*.30 + asym*.34 + Math.abs(off)*.22;
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

    for(let off=-9;off<=9;off+=.75){
      for(let w=5.0;w<=11.0;w+=.50){
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
    return {pts:[a,b],widthPx:seedWidthPx,confidence:hits.length/17,offset:0,angleDeg:0};
  }

  // Reject isolated linework/text hits using robust medians.
  const medOff=median(hits.map(h=>h.off));
  const medW=median(hits.map(h=>h.width));
  let stable=hits.filter(h=>Math.abs(h.off-medOff)<=6 && Math.abs(h.width-medW)<=4);
  if(stable.length<6)stable=hits;

  const offset=robustMedian(stable.map(h=>h.off),5);
  const width=clamp(robustMedian(stable.map(h=>h.width),2.4),5.0,11.0);

  // Parcel road is straight and parallel/perpendicular to its factory row.
  // Do NOT rotate it from noisy raster linework; only apply the robust lateral correction.
  const pa=[a[0]+nx*offset,a[1]+ny*offset];
  const pb=[b[0]+nx*offset,b[1]+ny*offset];
  const angleDeg=0;

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

function makeRoadMasks(img,roofs,paths){
  const src=document.createElement('canvas');src.width=IMG_W;src.height=IMG_H;
  const sctx=src.getContext('2d',{willReadFrequently:true});sctx.drawImage(img,0,0,IMG_W,IMG_H);
  const pixels=sctx.getImageData(0,0,IMG_W,IMG_H).data;
  const blocked=buildBlocked(roofs,paths);
  const blocks=computeSecondaryRoadsV69(roofs,paths,pixels,blocked);

  const snapped=[];
  for(const block of blocks){
    for(const road of block.roads){
      snapped.push({id:block.id,pts:road.pts,widthPx:road.widthPx,kind:road.kind,roof:road.roof??null});
    }
  }

  const outer=document.createElement('canvas');outer.width=IMG_W;outer.height=IMG_H;
  const octx=outer.getContext('2d');octx.clearRect(0,0,IMG_W,IMG_H);
  const inner=document.createElement('canvas');inner.width=IMG_W;inner.height=IMG_H;
  const ictx=inner.getContext('2d');ictx.clearRect(0,0,IMG_W,IMG_H);
  for(const road of snapped){
    drawPath(octx,road.pts,road.widthPx+3.0,'#fff');
    drawPath(ictx,road.pts,road.widthPx,'#fff');
  }

  const erase=document.createElement('canvas');erase.width=IMG_W;erase.height=IMG_H;
  const ectx=erase.getContext('2d');ectx.putImageData(new ImageData(new Uint8ClampedArray(blocked),IMG_W,IMG_H),0,0);
  for(const ctx of [octx,ictx]){
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.drawImage(erase,0,0);ctx.restore();
  }

  return {inner,outer,snapped,blocks};
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

export async function installSecondaryRoadsV69({
  world,roofs,mapPx,metersPerPixel,frameSignature,renderer,blueprintMat=null
}){
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok)throw new Error('V69 circulation data HTTP '+response.status);
  const data=await response.json();
  if(data.frameSignature!==frameSignature)throw new Error('V69 coordinate frame mismatch');

  const img=await loadSource();
  const masks=makeRoadMasks(img,roofs,data.paths||[]);
  const blocks=masks.blocks;

  const root=new THREE.Group();root.name='SECONDARY_ROADS_V69_VERIFIED_FRONTAGE';
  root.userData={version:69,siteFrameSignature:frameSignature,lines:masks.snapped.length,mode:'one-frontage + verified branches'};
  world.add(root);

  // V69.3: render REAL geometry instead of one full-sheet plane + alpha mask.
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

  function addRaisedStrip(pointsPx,widthPx,kind='secondary'){
    if(!pointsPx||pointsPx.length<2)return;
    const widthM=Math.max(3.2,Math.min(8.7,widthPx*metersPerPixel));
    const curbW=.24;
    const yRoad=(kind==='main-crossing'? .355 : .30);
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
      road.name='V69_SECONDARY_ROAD_SEGMENT';
      road.userData={walkable:true,driveable:true,siteFrameSignature:frameSignature};
      root.add(road);
      roadMeshes.push(road);

      const nx=-dz/len,nz=dx/len;
      const noCurbs=(kind==='main-crossing'||kind==='crosslink');
      if(!noCurbs)for(const side of [-1,1]){
        const curb=new THREE.Mesh(
          new THREE.BoxGeometry(curbW,.16,len+.14),
          curbMat
        );
        const off=side*(widthM/2+curbW/2);
        curb.position.set(mx+nx*off,yCurb,mz+nz*off);
        curb.rotation.y=rot;
        curb.castShadow=true;
        curb.receiveShadow=true;
        curb.name='V69_SECONDARY_CURB';
        root.add(curb);
        curbMeshes.push(curb);
      }
    }

    // No intermediate round pads: each V69 line remains one architecturally
    // straight segment. Intersections are handled by overlapping straight strips.
  }

  for(const s of masks.snapped)addRaisedStrip(s.pts,s.widthPx,s.kind);

  // Remove tree/shrub instances that physically sit on V69 road corridors,
  // especially where a branch crosses the planted green belt into the main road.
  const roadCorridors=[];
  for(const seg of masks.snapped){
    for(let i=1;i<seg.pts.length;i++){
      const a=mapPx(seg.pts[i-1][0],seg.pts[i-1][1]);
      const b=mapPx(seg.pts[i][0],seg.pts[i][1]);
      roadCorridors.push({
        ax:a.x,az:a.z,bx:b.x,bz:b.z,
        radius:Math.max(2.2,Math.min(5.2,seg.widthPx*metersPerPixel*.5+1.0))
      });
    }
  }
  function inRoadCorridorWorldV69(x,z){
    for(const c of roadCorridors){
      const vx=c.bx-c.ax,vz=c.bz-c.az,wx=x-c.ax,wz=z-c.az;
      const vv=vx*vx+vz*vz;
      const t=vv?clamp((wx*vx+wz*vz)/vv,0,1):0;
      const qx=c.ax+vx*t,qz=c.az+vz*t;
      if(Math.hypot(x-qx,z-qz)<=c.radius)return true;
    }
    return false;
  }
  function cullInstancedV69(group,onlyIco=false){
    if(!group)return 0;
    let hidden=0;
    group.updateWorldMatrix(true,true);
    group.traverse(o=>{
      if(!o.isInstancedMesh)return;
      if(onlyIco && o.geometry?.type!=='IcosahedronGeometry')return;
      const m=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
      o.updateWorldMatrix(true,false);
      let changed=false;
      for(let i=0;i<o.count;i++){
        o.getMatrixAt(i,m);m.decompose(pos,q,sc);
        const wp=pos.clone().applyMatrix4(o.matrixWorld);
        if(!inRoadCorridorWorldV69(wp.x,wp.z))continue;
        sc.setScalar(.0001);m.compose(pos,q,sc);o.setMatrixAt(i,m);
        hidden++;changed=true;
      }
      if(changed)o.instanceMatrix.needsUpdate=true;
    });
    return hidden;
  }
  const clearVegetation=()=>{
    let count=0;
    count+=cullInstancedV69(world.getObjectByName('CIRCULATION_V53'),false);
    const detail=world.getObjectByName('SITE_DETAIL_V54');
    count+=cullInstancedV69(detail?.getObjectByName('V54_ROAD_FURNITURE'),true);
    return count;
  };
  clearVegetation();

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
      ' · '+roadMeshes.length+' source-band segments · '+curbMeshes.length+' curbs';

    // The main animation loop redraws every frame; no out-of-scope camera reference here.
  };

  const button=document.createElement('button');
  button.className='active';button.id='secondaryRoadsV69';
  button.onclick=()=>setEnabled(!enabled);
  document.querySelector('.controls')?.appendChild(button);
  setEnabled(true);

  window.__DALOC_V69={
    ready:true,version:69,frameSignature,lines:masks.snapped.length,
    source:'masterplan-hires.jpg',mode:'direct warehouse-outward scan of 2D secondary-road edge bands',
    setEnabled,
    clearVegetation,
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
  console.info('[DaLoc] V69 direct-band secondary roads installed',window.__DALOC_V69);
  return {group:root,count:blocks.length,lines:masks.snapped.length};
}
