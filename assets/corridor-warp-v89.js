// V89 shared corridor warp: move V53's central-spine corridor onto raw CAD road 77505.
// CAD remains authoritative; V53 supplies the detailed curb/sidewalk/greenbelt geometry.
export function buildCadCorridorWarpV89({
  circulation,cad,
  pathId='central-spine',
  roadHandle='77505',
  innerRadiusPx=40,
  outerRadiusPx=86
}){
  const src=circulation.paths?.find(p=>p.id===pathId);
  const road=cad.roads?.find(r=>r.handle===roadHandle);
  if(!src?.pointsPx?.length||!road?.pointsPx?.length){
    throw new Error('V89 corridor warp source missing');
  }

  const srcPts=src.pointsPx.map(p=>[p[0],p[1]]);
  let dstPts=road.pointsPx.map(p=>[p[0],p[1]]);

  function d2(a,b){const x=a[0]-b[0],y=a[1]-b[1];return x*x+y*y;}
  const same=d2(srcPts[0],dstPts[0])+d2(srcPts.at(-1),dstPts.at(-1));
  const rev=d2(srcPts[0],dstPts.at(-1))+d2(srcPts.at(-1),dstPts[0]);
  if(rev<same)dstPts=dstPts.slice().reverse();

  function info(pts){
    const cumulative=[0];
    let total=0;
    for(let i=1;i<pts.length;i++){
      total+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
      cumulative.push(total);
    }
    return {pts,cumulative,total};
  }
  const srcInfo=info(srcPts),dstInfo=info(dstPts);

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
    return {
      x:a[0]+(b[0]-a[0])*t,
      y:a[1]+(b[1]-a[1])*t,
      tx,ty
    };
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
        best={
          x:qx,y:qy,
          tx:vx/len,ty:vy/len,
          s:poly.cumulative[i-1]+len*t,
          dist:Math.sqrt(dd)
        };
      }
    }
    return best;
  }

  const sourceHalf=(src.widthPx||22)*.5;
  const targetWidthPx=(road.widthCad||20)*(cad.pxPerCadUnit||1.20434303125);
  const targetHalf=targetWidthPx*.5;

  function smoothstep01(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}

  function warpPx(x,y){
    const n=nearest(srcInfo,x,y);
    if(!n||n.dist>=outerRadiusPx)return {x,y,weight:0,u:0,dist:n?.dist??Infinity};

    const u=srcInfo.total? n.s/srcInfo.total:0;
    const target=sample(dstInfo,u*dstInfo.total);
    const srcNx=-n.ty,srcNy=n.tx;
    const dstNx=-target.ty,dstNy=target.tx;
    const signed=(x-n.x)*srcNx+(y-n.y)*srcNy;
    const abs=Math.abs(signed);

    // Preserve all offsets outside the asphalt edge while making the asphalt width itself
    // respect CAD's real width.
    let targetSigned;
    if(abs<=sourceHalf){
      targetSigned=signed*(targetHalf/Math.max(.001,sourceHalf));
    }else{
      targetSigned=Math.sign(signed)*(targetHalf+(abs-sourceHalf));
    }

    const full={x:target.x+dstNx*targetSigned,y:target.y+dstNy*targetSigned};
    let w=1;
    if(n.dist>innerRadiusPx){
      w=1-smoothstep01((n.dist-innerRadiusPx)/Math.max(.001,outerRadiusPx-innerRadiusPx));
    }
    return {
      x:x+(full.x-x)*w,
      y:y+(full.y-y)*w,
      weight:w,u,dist:n.dist,
      targetX:full.x,targetY:full.y
    };
  }

  return {
    version:89,pathId,roadHandle,
    sourcePointsPx:srcPts,targetPointsPx:dstPts,
    sourceWidthPx:src.widthPx||22,targetWidthPx,
    innerRadiusPx,outerRadiusPx,
    warpPx
  };
}
