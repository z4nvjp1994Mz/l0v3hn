// V91 shared multi-corridor warp.
// CAD is authoritative. Major V53 road corridors are mapped onto the corresponding
// raw CAD roads so asphalt, greenbelt, large roadside trees, shrubs, lamps, traffic
// and sidewalk pedestrians all share the same road geometry.
export function buildCadCorridorWarpV91({circulation,cad}){
  const specs=[
    {pathId:'central-spine',roadHandles:['77505'],innerRadiusPx:42,outerRadiusPx:92},
    {pathId:'south-cross',roadHandles:['7754C'],innerRadiusPx:34,outerRadiusPx:76},
    {pathId:'north-cross',roadHandles:['77536','77537'],innerRadiusPx:34,outerRadiusPx:78}
  ];

  function d2(a,b){const x=a[0]-b[0],y=a[1]-b[1];return x*x+y*y;}

  function info(pts){
    const cumulative=[0];
    let total=0;
    for(let i=1;i<pts.length;i++){
      total+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
      cumulative.push(total);
    }
    return {pts,cumulative,total};
  }

  function sample(poly,s){
    s=Math.max(0,Math.min(poly.total,s));
    let lo=0,hi=poly.cumulative.length-1;
    while(lo<hi-1){
      const mid=(lo+hi)>>1;
      if(poly.cumulative[mid]<=s)lo=mid;else hi=mid;
    }
    const bi=Math.min(lo+1,poly.pts.length-1);
    const a=poly.pts[lo],b=poly.pts[bi];
    const seg=Math.max(1e-9,poly.cumulative[bi]-poly.cumulative[lo]);
    const t=Math.max(0,Math.min(1,(s-poly.cumulative[lo])/seg));
    let tx=b[0]-a[0],ty=b[1]-a[1],len=Math.hypot(tx,ty)||1;
    tx/=len;ty/=len;
    return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,tx,ty};
  }

  function nearest(poly,x,y){
    let best=null,bestD2=Infinity;
    for(let i=1;i<poly.pts.length;i++){
      const a=poly.pts[i-1],b=poly.pts[i];
      const vx=b[0]-a[0],vy=b[1]-a[1],vv=vx*vx+vy*vy;
      const t=vv?Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/vv)):0;
      const qx=a[0]+vx*t,qy=a[1]+vy*t;
      const dx=x-qx,dy=y-qy,dd=dx*dx+dy*dy;
      if(dd<bestD2){
        const len=Math.sqrt(vv)||1;
        bestD2=dd;
        best={x:qx,y:qy,tx:vx/len,ty:vy/len,s:poly.cumulative[i-1]+len*t,dist:Math.sqrt(dd)};
      }
    }
    return best;
  }

  function orientTarget(srcPts,dstPts){
    const same=d2(srcPts[0],dstPts[0])+d2(srcPts.at(-1),dstPts.at(-1));
    const rev=d2(srcPts[0],dstPts.at(-1))+d2(srcPts.at(-1),dstPts[0]);
    return rev<same?dstPts.slice().reverse():dstPts.slice();
  }

  function connectRoads(handles){
    const roads=handles.map(h=>cad.roads?.find(r=>r.handle===h)).filter(Boolean);
    if(!roads.length)return [];
    let out=roads[0].pointsPx.map(p=>[p[0],p[1]]);
    for(let i=1;i<roads.length;i++){
      let pts=roads[i].pointsPx.map(p=>[p[0],p[1]]);
      const end=out.at(-1);
      if(d2(end,pts.at(-1))<d2(end,pts[0]))pts=pts.reverse();
      const first=pts[0];
      if(Math.sqrt(d2(end,first))<8)out.push(...pts.slice(1));
      else out.push(...pts);
    }
    return out;
  }

  const corridors=[];
  for(const spec of specs){
    const src=circulation.paths?.find(p=>p.id===spec.pathId);
    if(!src?.pointsPx?.length)continue;
    const srcPts=src.pointsPx.map(p=>[p[0],p[1]]);
    const rawTarget=connectRoads(spec.roadHandles);
    if(rawTarget.length<2)continue;
    const dstPts=orientTarget(srcPts,rawTarget);
    const widths=spec.roadHandles
      .map(h=>cad.roads?.find(r=>r.handle===h))
      .filter(Boolean)
      .map(r=>(r.widthCad||12)*(cad.pxPerCadUnit||1.20434303125));
    const targetWidthPx=widths.length?widths.reduce((a,b)=>a+b,0)/widths.length:(src.widthPx||16);
    corridors.push({
      ...spec,
      src,
      srcInfo:info(srcPts),
      dstInfo:info(dstPts),
      sourceWidthPx:src.widthPx||16,
      targetWidthPx,
      sourcePointsPx:srcPts,
      targetPointsPx:dstPts
    });
  }
  if(!corridors.length)throw new Error('V91 corridor network source missing');

  function smoothstep01(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}

  function warpOnCorridor(c,x,y,n){
    const u=c.srcInfo.total?n.s/c.srcInfo.total:0;
    const target=sample(c.dstInfo,u*c.dstInfo.total);
    const srcNx=-n.ty,srcNy=n.tx;
    const dstNx=-target.ty,dstNy=target.tx;
    const signed=(x-n.x)*srcNx+(y-n.y)*srcNy;
    const abs=Math.abs(signed);
    const sourceHalf=c.sourceWidthPx*.5;
    const targetHalf=c.targetWidthPx*.5;
    let targetSigned;
    if(abs<=sourceHalf){
      targetSigned=signed*(targetHalf/Math.max(.001,sourceHalf));
    }else{
      targetSigned=Math.sign(signed)*(targetHalf+(abs-sourceHalf));
    }
    const full={x:target.x+dstNx*targetSigned,y:target.y+dstNy*targetSigned};
    let w=1;
    if(n.dist>c.innerRadiusPx){
      w=1-smoothstep01((n.dist-c.innerRadiusPx)/Math.max(.001,c.outerRadiusPx-c.innerRadiusPx));
    }
    return {
      x:x+(full.x-x)*w,
      y:y+(full.y-y)*w,
      weight:w,u,dist:n.dist,
      targetX:full.x,targetY:full.y,
      corridorId:c.pathId,
      roadHandles:c.roadHandles
    };
  }

  function warpPx(x,y){
    let winner=null;
    for(const c of corridors){
      const n=nearest(c.srcInfo,x,y);
      if(!n||n.dist>=c.outerRadiusPx)continue;
      // Prefer the corridor that is closest relative to its own capture radius.
      const score=n.dist/c.outerRadiusPx;
      if(!winner||score<winner.score){
        winner={c,n,score};
      }
    }
    if(!winner)return {x,y,weight:0,u:0,dist:Infinity,corridorId:null};
    return warpOnCorridor(winner.c,x,y,winner.n);
  }

  return {
    version:91,
    cadAuthoritative:true,
    corridors:corridors.map(c=>({
      pathId:c.pathId,
      roadHandles:c.roadHandles,
      sourceWidthPx:c.sourceWidthPx,
      targetWidthPx:c.targetWidthPx,
      innerRadiusPx:c.innerRadiusPx,
      outerRadiusPx:c.outerRadiusPx,
      sourcePointsPx:c.sourcePointsPx,
      targetPointsPx:c.targetPointsPx
    })),
    warpPx
  };
}
