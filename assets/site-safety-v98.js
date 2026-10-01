import * as THREE from 'three';

// V98 safety pass:
// 1) remove trees/shrubs/furniture that land on authoritative CAD asphalt/junctions
// 2) push any reconstructed project building footprint fully inside the CAD site boundary
export async function installSiteSafetyV98({
  world,
  buildings,
  roofRecords,
  supportGroup,
  mapPx,
  metersPerPixel,
  frameSignature,
  siteAnchorPx=[1053.34,850.71]
}){
  if(!world||typeof mapPx!=='function')throw new Error('V98 requires world + mapPx');

  const response=await fetch(new URL('./cad-source-v72.json',import.meta.url));
  if(!response.ok)throw new Error('V98 CAD source HTTP '+response.status);
  const cad=await response.json();
  if(cad.frameSignature!==frameSignature)throw new Error('V98 coordinate frame mismatch');

  const S=metersPerPixel;
  const boundary=cad.siteBoundaryPx||[];
  if(boundary.length<3)throw new Error('V98 missing CAD site boundary');

  function pointInPoly(x,y,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if(((a[1]>y)!==(b[1]>y)) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1]+1e-9)+a[0])inside=!inside;
    }
    return inside;
  }

  function distSeg2D(x,y,a,b){
    const vx=b[0]-a[0],vy=b[1]-a[1],wx=x-a[0],wy=y-a[1],vv=vx*vx+vy*vy;
    const t=vv?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
    return Math.hypot(x-(a[0]+t*vx),y-(a[1]+t*vy));
  }

  function boundaryDistancePx(x,y){
    let best=Infinity;
    for(let i=0;i<boundary.length;i++){
      best=Math.min(best,distSeg2D(x,y,boundary[i],boundary[(i+1)%boundary.length]));
    }
    return best;
  }

  function rectCorners(cx,cy,L,D,angleDeg){
    const a=THREE.MathUtils.degToRad(angleDeg),c=Math.cos(a),s=Math.sin(a);
    return [[-L/2,-D/2],[L/2,-D/2],[L/2,D/2],[-L/2,D/2]].map(([x,y])=>[
      cx+x*c-y*s,
      cy+x*s+y*c
    ]);
  }

  function fitInsideBoundary(cx,cy,L,D,angleDeg,marginPx){
    const valid=(x,y)=>rectCorners(x,y,L,D,angleDeg).every(p=>
      pointInPoly(p[0],p[1],boundary)&&boundaryDistancePx(p[0],p[1])>=marginPx
    );
    if(valid(cx,cy))return {x:cx,y:cy,moved:false,deltaPx:0};

    const ax=siteAnchorPx[0],ay=siteAnchorPx[1];
    let hit=null,prev=0;
    for(let t=.0025;t<=1;t+=.0025){
      const x=THREE.MathUtils.lerp(cx,ax,t),y=THREE.MathUtils.lerp(cy,ay,t);
      if(valid(x,y)){hit=t;break;}
      prev=t;
    }
    if(hit===null)return {x:cx,y:cy,moved:false,failed:true,deltaPx:0};

    let lo=Math.max(0,prev-.0025),hi=hit;
    for(let i=0;i<24;i++){
      const mid=(lo+hi)/2;
      const x=THREE.MathUtils.lerp(cx,ax,mid),y=THREE.MathUtils.lerp(cy,ay,mid);
      if(valid(x,y))hi=mid;else lo=mid;
    }
    const x=THREE.MathUtils.lerp(cx,ax,hi),y=THREE.MathUtils.lerp(cy,ay,hi);
    return {x,y,moved:true,deltaPx:Math.hypot(x-cx,y-cy)};
  }

  // ---- Boundary-safe project buildings ----
  const movedMain=[];
  (roofRecords||[]).forEach((r,i)=>{
    const g=buildings?.[i];
    if(!g)return;
    const [cx,cy,Lpx,Spx,angleDeg]=r;
    const factor=Spx<18?2.35:Spx<26?1.9:Spx<38?1.52:1.30;
    const Dpx=Spx*factor;
    const fit=fitInsideBoundary(cx,cy,Lpx,Dpx,angleDeg,12);
    if(!fit.moved)return;
    const p=mapPx(fit.x,fit.y);
    g.position.x=p.x;g.position.z=p.z;
    g.userData={
      ...g.userData,
      boundaryCorrectedV98:true,
      sourceCenterPx:{x:cx,y:cy},
      correctedCenterPx:{x:fit.x,y:fit.y},
      correctionPx:fit.deltaPx
    };
    g.updateMatrixWorld(true);
    movedMain.push({index:i,from:[cx,cy],to:[fit.x,fit.y],deltaPx:fit.deltaPx});
  });

  const movedSupport=[];
  for(const g of supportGroup?.children||[]){
    const mp=g.userData?.masterplanPx,fp=g.userData?.footprintPx;
    if(!mp||!fp)continue;
    const fit=fitInsideBoundary(mp.x,mp.y,fp.L,fp.D,fp.angle,6);
    if(!fit.moved)continue;
    const p=mapPx(fit.x,fit.y);
    g.position.x=p.x;g.position.z=p.z;
    g.userData={
      ...g.userData,
      boundaryCorrectedV98:true,
      sourceCenterPx:{x:mp.x,y:mp.y},
      correctedCenterPx:{x:fit.x,y:fit.y},
      correctionPx:fit.deltaPx
    };
    g.updateMatrixWorld(true);
    movedSupport.push({id:g.name,from:[mp.x,mp.y],to:[fit.x,fit.y],deltaPx:fit.deltaPx});
  }

  // ---- Authoritative CAD asphalt corridors ----
  const roadCorridors=[];
  for(const road of cad.roads||[]){
    const pts=(road.pointsPx||[]).map(([x,y])=>{
      const p=mapPx(x,y);return [p.x,p.z];
    });
    const half=(road.widthCad||12)*(cad.pxPerCadUnit||1.20434303125)*S*.5;
    for(let i=1;i<pts.length;i++){
      roadCorridors.push({
        roadHandle:road.handle,
        a:pts[i-1],
        b:pts[i],
        half
      });
    }
  }

  function worldDistSeg(x,z,a,b){
    const vx=b[0]-a[0],vz=b[1]-a[1],wx=x-a[0],wz=z-a[1],vv=vx*vx+vz*vz;
    const t=vv?Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)):0;
    return Math.hypot(x-(a[0]+t*vx),z-(a[1]+t*vz));
  }

  function inCadAsphalt(x,z,pad=1.4){
    return roadCorridors.some(c=>worldDistSeg(x,z,c.a,c.b)<=c.half+pad);
  }

  // Pairwise road intersections get an extra turning envelope so no planting remains
  // in the center of junctions even where two segment meshes overlap/miter.
  function segmentIntersection(a,b,c,d){
    const rx=b[0]-a[0],rz=b[1]-a[1],sx=d[0]-c[0],sz=d[1]-c[1];
    const den=rx*sz-rz*sx;
    if(Math.abs(den)<1e-8)return null;
    const qx=c[0]-a[0],qz=c[1]-a[1];
    const ta=(qx*sz-qz*sx)/den,tb=(qx*rz-qz*rx)/den;
    if(ta<=.02||ta>=.98||tb<=.02||tb>=.98)return null;
    return [a[0]+ta*rx,a[1]+ta*rz];
  }

  const junctions=[];
  for(let i=0;i<roadCorridors.length;i++){
    for(let j=i+1;j<roadCorridors.length;j++){
      const A=roadCorridors[i],B=roadCorridors[j];
      if(A.roadHandle===B.roadHandle)continue;
      const p=segmentIntersection(A.a,A.b,B.a,B.b);
      if(!p)continue;
      if(junctions.some(q=>Math.hypot(q.x-p[0],q.z-p[1])<4))continue;
      junctions.push({x:p[0],z:p[1],radius:Math.max(A.half,B.half)+3.5});
    }
  }

  function inJunction(x,z){
    return junctions.some(j=>Math.hypot(x-j.x,z-j.z)<=j.radius);
  }
  function unsafePlant(x,z){
    return inCadAsphalt(x,z,1.4)||inJunction(x,z);
  }

  let hiddenTreeGroups=0;
  let hiddenSemanticPlants=0;
  const tmp=new THREE.Vector3();

  world.traverse(o=>{
    if(o.userData?.isTreeGroup){
      o.getWorldPosition(tmp);
      if(unsafePlant(tmp.x,tmp.z)){
        o.userData.hiddenByRoadV98=true;
        o.visible=false;
        hiddenTreeGroups++;
      }
      return;
    }

    // Legacy semantic bushes are standalone Icosahedron meshes.
    let p=o.parent,semantic=false;
    while(p){if(p.name==='semantic2D3D'){semantic=true;break;}p=p.parent;}
    if(semantic&&o.isMesh&&o.geometry?.type==='IcosahedronGeometry'){
      o.getWorldPosition(tmp);
      if(unsafePlant(tmp.x,tmp.z)){
        o.userData.hiddenByRoadV98=true;
        o.visible=false;
        hiddenSemanticPlants++;
      }
    }
  });

  // Clear instanced roadside vegetation / small landscape props that overlap asphalt.
  let clearedInstances=0;
  const m=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
  const zero=new THREE.Matrix4().makeScale(0,0,0);

  world.traverse(o=>{
    if(!o.isInstancedMesh)return;
    let p=o.parent,eligible=false;
    while(p){
      if(
        p.name==='CIRCULATION_V53'||
        p.name==='V54_ROAD_FURNITURE'||
        p.name==='LANDSCAPE_V95'||
        p.name==='V95_DENSE_PARKS'||
        p.name==='V95_POND_LANDSCAPE'
      ){eligible=true;break;}
      p=p.parent;
    }
    if(!eligible)return;

    o.updateWorldMatrix(true,false);
    let touched=false;
    for(let i=0;i<o.count;i++){
      o.getMatrixAt(i,m);
      m.decompose(pos,q,sc);
      if(sc.lengthSq()<1e-8)continue;
      pos.applyMatrix4(o.matrixWorld);
      if(!unsafePlant(pos.x,pos.z))continue;
      o.setMatrixAt(i,zero);
      clearedInstances++;
      touched=true;
    }
    if(touched){
      o.instanceMatrix.needsUpdate=true;
      o.computeBoundingSphere();
      o.userData.clearedByRoadV98=true;
    }
  });

  const result={
    ready:true,
    version:98,
    movedMain,
    movedSupport,
    hiddenTreeGroups,
    hiddenSemanticPlants,
    clearedInstances,
    junctionCount:junctions.length
  };
  window.__DALOC_SITE_SAFETY_V98=result;
  console.info('[DaLoc] V98 site safety pass',result);
  return result;
}
