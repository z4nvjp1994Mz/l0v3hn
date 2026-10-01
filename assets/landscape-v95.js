import * as THREE from 'three';
import { loadKenneyTreeAssets, createStaticInstancedAsset } from './real-assets-v105.js?v=1051';

// V95 — high-detail landscape pass for the lotus pond and ornamental parks.
// All placement uses the same 1616x2048 masterplan pixel coordinate system.
export function installLandscapeV95({world,mapPx,metersPerPixel}){
  if(!world||typeof mapPx!=='function')throw new Error('V95 landscape requires world + mapPx');

  const root=new THREE.Group();
  root.name='LANDSCAPE_V95';
  root.userData={version:97,type:'pond + dense ornamental parks',promenadeFix:true,redBloomPark:true};
  world.add(root);

  const pondGroup=new THREE.Group();
  pondGroup.name='V95_POND_LANDSCAPE';
  const parkGroup=new THREE.Group();
  parkGroup.name='V95_DENSE_PARKS';
  root.add(pondGroup,parkGroup);

  const S=metersPerPixel;
  const POND_CENTER=[1053.34,850.71];
  const POND_RX=33.5, POND_RZ=23.5;
  const POND_ROT=THREE.MathUtils.degToRad(-8);
  const POND_GARDEN=[[1000,817],[1051,805],[1108,831],[1114,873],[1075,903],[1019,894],[986,859]];
  const PARK_MAIN=[[1203,584],[1149,646],[1166,726],[1140,666],[1063,758],[1230,734]];
  const PARK_SECONDARY=[[1120,888],[1262,900],[1325,982],[1218,1028],[1154,958]];
  const PARK_CENTER=[1164,690];

  let seed=950117;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const rr=(a,b)=>a+(b-a)*rnd();

  function pointInPoly(x,y,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
      const hit=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi+1e-9)+xi);
      if(hit)inside=!inside;
    }
    return inside;
  }
  function distPointSeg(x,y,a,b){
    const vx=b[0]-a[0],vy=b[1]-a[1],wx=x-a[0],wy=y-a[1],vv=vx*vx+vy*vy;
    const t=vv?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
    return Math.hypot(x-(a[0]+vx*t),y-(a[1]+vy*t));
  }
  function wp(px,py,y=.3){
    const p=mapPx(px,py);
    return new THREE.Vector3(p.x,y,p.z);
  }
  function ellipsePx(a,r=1){
    const ca=Math.cos(POND_ROT),sa=Math.sin(POND_ROT);
    const x=Math.cos(a)*POND_RX*r,z=Math.sin(a)*POND_RZ*r;
    return [POND_CENTER[0]+x*ca-z*sa,POND_CENTER[1]+x*sa+z*ca];
  }

  // V96: true constant-distance offset from the pond ellipse.
  // The old V95 promenade used RingGeometry + non-uniform scale, which made the
  // walkway look like an oversized racetrack and gave it different apparent widths.
  function ellipseOffsetPx(a,offsetM){
    const ca=Math.cos(POND_ROT),sa=Math.sin(POND_ROT);
    const bx=Math.cos(a)*POND_RX;
    const bz=Math.sin(a)*POND_RZ;
    let nx=Math.cos(a)/POND_RX;
    let nz=Math.sin(a)/POND_RZ;
    const nl=Math.hypot(nx,nz)||1;nx/=nl;nz/=nl;
    const offPx=offsetM/S;
    const lx=bx+nx*offPx,lz=bz+nz*offPx;
    return [
      POND_CENTER[0]+lx*ca-lz*sa,
      POND_CENTER[1]+lx*sa+lz*ca
    ];
  }

  function makeEllipseBandGeometry(innerOffsetM,outerOffsetM,segments=128,y=0){
    const positions=[];
    const indices=[];
    for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2;
      const inn=ellipseOffsetPx(a,innerOffsetM);
      const out=ellipseOffsetPx(a,outerOffsetM);
      const pi=mapPx(inn[0],inn[1]);
      const po=mapPx(out[0],out[1]);
      positions.push(pi.x,y,pi.z, po.x,y,po.z);
      if(i<segments){
        const k=i*2;
        indices.push(k,k+2,k+1, k+1,k+2,k+3);
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Materials.
  const stoneMat=new THREE.MeshStandardMaterial({color:0xd8d3c8,roughness:.96});
  const stoneDarkMat=new THREE.MeshStandardMaterial({color:0x9d9a90,roughness:.96});
  const timberMat=new THREE.MeshStandardMaterial({color:0x8a5a36,roughness:.88});
  const metalMat=new THREE.MeshStandardMaterial({color:0x3f4848,roughness:.52,metalness:.45});
  const lightMat=new THREE.MeshStandardMaterial({color:0xfff3c9,emissive:0xffd67a,emissiveIntensity:.48,roughness:.38});
  const shrubMats=[
    new THREE.MeshStandardMaterial({color:0x3e7d49,roughness:1}),
    new THREE.MeshStandardMaterial({color:0x568f50,roughness:1}),
    new THREE.MeshStandardMaterial({color:0x2f6f40,roughness:1})
  ];
  const flowerMats=[
    new THREE.MeshStandardMaterial({color:0xd56f86,roughness:.92}),
    new THREE.MeshStandardMaterial({color:0xf0b05f,roughness:.92}),
    new THREE.MeshStandardMaterial({color:0xc6535f,roughness:.92}),
    new THREE.MeshStandardMaterial({color:0xf0d9db,roughness:.92})
  ];
  // V97: red-dominant ornamental flower palette matching the supplied 2D/render reference.
  const redFlowerMats=[
    new THREE.MeshStandardMaterial({color:0xb91f2f,roughness:.88}),
    new THREE.MeshStandardMaterial({color:0xd12f3f,roughness:.88}),
    new THREE.MeshStandardMaterial({color:0xe24b4d,roughness:.88}),
    new THREE.MeshStandardMaterial({color:0xc62839,roughness:.88}),
    new THREE.MeshStandardMaterial({color:0xf1d7d9,roughness:.90})
  ];
  const hedgeMat=new THREE.MeshStandardMaterial({color:0x477943,roughness:1});
  const grassMat=new THREE.MeshStandardMaterial({color:0x6e9a55,roughness:1});
  const trunkMat=new THREE.MeshStandardMaterial({color:0x6c4a32,roughness:1});
  const canopyMats=[
    new THREE.MeshStandardMaterial({color:0x376f43,roughness:1}),
    new THREE.MeshStandardMaterial({color:0x4e8650,roughness:1}),
    new THREE.MeshStandardMaterial({color:0x5b9657,roughness:1})
  ];
  const pergolaMat=new THREE.MeshStandardMaterial({color:0x9d6537,roughness:.83});

  // V104 asset-first batching. Benches, lamps and park trees are queued and
  // emitted as shared-geometry InstancedMesh batches instead of many small Groups.
  const benchQueue=[],lampQueue=[],treeQueue=[];
  const fallbackParkTreeMeshes=[];
  function addBench(group,px,py,rotation=0,scale=1){
    benchQueue.push({group,px,py,rotation,scale});
  }
  function addLamp(group,px,py,h=4.4){
    lampQueue.push({group,px,py,h});
  }
  function addTree(group,px,py,scale=1){
    treeQueue.push({group,px,py,scale,variant:Math.floor(rnd()*canopyMats.length)});
  }

  function flushAssetQueue(){
    const byGroup=(items)=>new Map(
      [...new Set(items.map(i=>i.group))].map(g=>[g,items.filter(i=>i.group===g)])
    );
    const d=new THREE.Object3D();

    const benchSeatGeo=new THREE.BoxGeometry(3.0,.18,.72);
    const benchBackGeo=new THREE.BoxGeometry(3.0,.16,.58);
    const benchLegGeo=new THREE.BoxGeometry(.15,.72,.15);
    for(const [group,items] of byGroup(benchQueue)){
      const seat=new THREE.InstancedMesh(benchSeatGeo,timberMat,items.length);
      const back=new THREE.InstancedMesh(benchBackGeo,timberMat,items.length);
      const legs=new THREE.InstancedMesh(benchLegGeo,metalMat,items.length*2);
      items.forEach((b,i)=>{
        const p=wp(b.px,b.py,.32),s=b.scale;
        d.position.set(p.x,p.y+.72*s,p.z);d.rotation.set(0,b.rotation,0);d.scale.setScalar(s);d.updateMatrix();seat.setMatrixAt(i,d.matrix);
        d.position.set(p.x,p.y+1.20*s,p.z);d.rotation.set(-.18,b.rotation,0);d.scale.setScalar(s);d.translateZ(.31);d.updateMatrix();back.setMatrixAt(i,d.matrix);
        for(const [li,sx] of [-1,1].entries()){
          d.position.set(p.x,p.y+.36*s,p.z);d.rotation.set(0,b.rotation,0);d.scale.setScalar(s);d.translateX(sx*1.0);d.updateMatrix();legs.setMatrixAt(i*2+li,d.matrix);
        }
      });
      for(const m of [seat,back,legs]){m.instanceMatrix.needsUpdate=true;m.castShadow=true;m.receiveShadow=true;m.computeBoundingSphere();group.add(m);}
    }

    const lampPoleGeo=new THREE.CylinderGeometry(.055,.075,1,8);
    const lampCapGeo=new THREE.CylinderGeometry(.26,.31,.18,12);
    const lampBulbGeo=new THREE.SphereGeometry(.21,10,7);
    for(const [group,items] of byGroup(lampQueue)){
      const poles=new THREE.InstancedMesh(lampPoleGeo,metalMat,items.length);
      const caps=new THREE.InstancedMesh(lampCapGeo,metalMat,items.length);
      const bulbs=new THREE.InstancedMesh(lampBulbGeo,lightMat,items.length);
      items.forEach((l,i)=>{
        const p=wp(l.px,l.py,.20),h=l.h;
        d.position.set(p.x,p.y+h/2,p.z);d.rotation.set(0,0,0);d.scale.set(1,h,1);d.updateMatrix();poles.setMatrixAt(i,d.matrix);
        d.position.set(p.x,p.y+h+.04,p.z);d.scale.set(1,1,1);d.updateMatrix();caps.setMatrixAt(i,d.matrix);
        d.position.set(p.x,p.y+h+.15,p.z);d.updateMatrix();bulbs.setMatrixAt(i,d.matrix);
      });
      for(const m of [poles,caps,bulbs]){m.instanceMatrix.needsUpdate=true;m.castShadow=true;m.computeBoundingSphere();group.add(m);}
    }

    const treeTrunkGeo=new THREE.CylinderGeometry(.18,.29,3.9,8);
    const treeCrownGeo=new THREE.DodecahedronGeometry(1.22,1);
    const treeCrown2Geo=new THREE.DodecahedronGeometry(.94,1);
    const treeCrown3Geo=new THREE.DodecahedronGeometry(.72,1);
    for(const [group,items] of byGroup(treeQueue)){
      const trunks=new THREE.InstancedMesh(treeTrunkGeo,trunkMat,items.length);
      const crownBuckets=canopyMats.map(()=>[]);
      items.forEach((t,i)=>crownBuckets[t.variant].push({t,i}));
      items.forEach((t,i)=>{
        const p=wp(t.px,t.py,.15),sc=t.scale;
        d.position.set(p.x,p.y+1.95*sc,p.z);d.rotation.set(0,0,0);d.scale.setScalar(sc);d.updateMatrix();trunks.setMatrixAt(i,d.matrix);
      });
      trunks.instanceMatrix.needsUpdate=true;trunks.castShadow=true;trunks.computeBoundingSphere();group.add(trunks);
      fallbackParkTreeMeshes.push(trunks);

      for(let mi=0;mi<canopyMats.length;mi++){
        const bucket=crownBuckets[mi];if(!bucket.length)continue;
        const a=new THREE.InstancedMesh(treeCrownGeo,canopyMats[mi],bucket.length);
        const b=new THREE.InstancedMesh(treeCrown2Geo,canopyMats[(mi+1)%canopyMats.length],bucket.length);
        const c=new THREE.InstancedMesh(treeCrown3Geo,canopyMats[(mi+2)%canopyMats.length],bucket.length);
        bucket.forEach(({t},j)=>{
          const p=wp(t.px,t.py,.15),sc=t.scale;
          d.position.set(p.x-.18*sc,p.y+4.45*sc,p.z+.08*sc);d.scale.setScalar(sc);d.updateMatrix();a.setMatrixAt(j,d.matrix);
          d.position.set(p.x+.48*sc,p.y+5.12*sc,p.z-.14*sc);d.scale.setScalar(sc*.94);d.updateMatrix();b.setMatrixAt(j,d.matrix);
          d.position.set(p.x-.50*sc,p.y+5.28*sc,p.z-.20*sc);d.scale.setScalar(sc*.80);d.updateMatrix();c.setMatrixAt(j,d.matrix);
        });
        for(const m of [a,b,c]){
          m.instanceMatrix.needsUpdate=true;m.castShadow=true;m.computeBoundingSphere();group.add(m);
          fallbackParkTreeMeshes.push(m);
        }
      }
    }
  }

  function addPergola(group,px,py,rotation=0,scale=1){
    const g=new THREE.Group();g.position.copy(wp(px,py,.20));g.rotation.y=rotation;
    const w=6.3*scale,d=3.2*scale,h=3.2*scale;
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2]){
      const post=new THREE.Mesh(new THREE.BoxGeometry(.20*scale,h,.20*scale),pergolaMat);
      post.position.set(x,h/2,z);post.castShadow=true;g.add(post);
    }
    for(let i=0;i<7;i++){
      const x=-w/2+i*w/6;
      const slat=new THREE.Mesh(new THREE.BoxGeometry(.16*scale,.16*scale,d+.55*scale),pergolaMat);
      slat.position.set(x,h,0);slat.castShadow=true;g.add(slat);
    }
    for(const z of [-d/2,d/2]){
      const beam=new THREE.Mesh(new THREE.BoxGeometry(w+.5*scale,.22*scale,.24*scale),pergolaMat);
      beam.position.set(0,h-.12*scale,z);g.add(beam);
    }
    group.add(g);
  }

  function addRock(group,px,py,scale=1){
    const rock=new THREE.Mesh(
      new THREE.DodecahedronGeometry(.50*scale,0),
      stoneDarkMat
    );
    rock.position.copy(wp(px,py,.28*scale));
    rock.scale.set(1.4,.68,1.0);
    rock.rotation.y=rr(0,Math.PI*2);
    rock.castShadow=true;group.add(rock);
  }

  function instancedPlants(group,items,flower=false){
    if(!items.length)return;
    const geo=flower?new THREE.IcosahedronGeometry(.20,1):new THREE.IcosahedronGeometry(.42,1);
    const mats=flower?flowerMats:shrubMats;
    const buckets=mats.map(()=>[]);
    items.forEach((p,i)=>buckets[i%mats.length].push(p));
    const d=new THREE.Object3D();
    buckets.forEach((bucket,mi)=>{
      if(!bucket.length)return;
      const mesh=new THREE.InstancedMesh(geo,mats[mi],bucket.length);
      bucket.forEach((p,i)=>{
        const v=wp(p.x,p.y,flower?.28:.42);
        d.position.copy(v);
        d.rotation.set(0,rr(0,Math.PI*2),0);
        const s=p.s||1;
        d.scale.set(flower?s*.82:s,flower?s*.65:s*.72,flower?s*.82:s);
        d.updateMatrix();mesh.setMatrixAt(i,d.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.castShadow=true;
      group.add(mesh);
    });
  }

  function instancedRedFlowerBeds(group,items){
    if(!items.length)return;
    // Larger/denser than generic flowers so red beds read clearly from Top View.
    const geo=new THREE.IcosahedronGeometry(.245,1);
    const buckets=redFlowerMats.map(()=>[]);
    items.forEach((p,i)=>{
      // ~80% red tones, ~20% pale accent.
      const mod=i%10;
      const mi=mod<8?(mod%4):4;
      buckets[mi].push(p);
    });
    const d=new THREE.Object3D();
    buckets.forEach((bucket,mi)=>{
      if(!bucket.length)return;
      const mesh=new THREE.InstancedMesh(geo,redFlowerMats[mi],bucket.length);
      mesh.name='V97_RED_FLOWER_BED_'+mi;
      bucket.forEach((p,i)=>{
        const v=wp(p.x,p.y,.31);
        d.position.copy(v);
        d.rotation.set(rr(-.10,.10),rr(0,Math.PI*2),rr(-.10,.10));
        const sc=p.s||1;
        d.scale.set(sc,sc*.72,sc);
        d.updateMatrix();
        mesh.setMatrixAt(i,d.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.castShadow=true;
      group.add(mesh);
    });
  }

  function instancedLowHedges(group,items){
    if(!items.length)return;
    const geo=new THREE.IcosahedronGeometry(.34,1);
    const mesh=new THREE.InstancedMesh(geo,hedgeMat,items.length);
    mesh.name='V97_FLOWER_BED_HEDGES';
    const d=new THREE.Object3D();
    items.forEach((p,i)=>{
      const v=wp(p.x,p.y,.34);
      d.position.copy(v);
      d.rotation.set(0,rr(0,Math.PI*2),0);
      const sc=p.s||1;
      d.scale.set(sc,sc*.62,sc);
      d.updateMatrix();mesh.setMatrixAt(i,d.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.castShadow=true;
    group.add(mesh);
  }

  // ---------------- Pond landscape ----------------
  const pondCenterW=wp(POND_CENTER[0],POND_CENTER[1],.49);

  // V96 corrected pedestrian promenade:
  // 2.8 m constant width, with a 2.6 m planted buffer between pond edge and walkway.
  // This replaces the old non-uniformly scaled RingGeometry/TorusGeometry pair.
  const pondWalk=new THREE.Mesh(
    makeEllipseBandGeometry(2.6,5.4,144,.50),
    stoneMat
  );
  pondWalk.name='V96_POND_PROMENADE_CORRECT';
  pondWalk.receiveShadow=true;
  pondGroup.add(pondWalk);

  // Narrow outer kerb, also generated as a true constant-distance ellipse band.
  const pondKerb=new THREE.Mesh(
    makeEllipseBandGeometry(5.40,5.68,144,.555),
    stoneDarkMat
  );
  pondKerb.name='V96_POND_PROMENADE_KERB';
  pondKerb.receiveShadow=true;
  pondGroup.add(pondKerb);

  // V96: benches and lights now hug the real promenade instead of using
  // multiplicative ellipse radii that pushed furniture far away.
  for(let i=0;i<10;i++){
    const a=i*Math.PI*2/10+.16;
    const [x,y]=ellipseOffsetPx(a,7.0);
    if(pointInPoly(x,y,POND_GARDEN)){
      addBench(pondGroup,x,y,-a+POND_ROT+.08,.86);
    }
  }
  for(let i=0;i<16;i++){
    const a=i*Math.PI*2/16+.05;
    const [x,y]=ellipseOffsetPx(a,6.25);
    if(pointInPoly(x,y,POND_GARDEN))addLamp(pondGroup,x,y,3.8);
  }

  const pondShrubs=[],pondFlowers=[],pondGrasses=[];
  for(let i=0;i<180;i++){
    const a=rr(0,Math.PI*2),off=rr(6.2,10.5);
    const [x,y]=ellipseOffsetPx(a,off);
    if(!pointInPoly(x,y,POND_GARDEN))continue;
    if(i%3===0)pondFlowers.push({x,y,s:rr(.7,1.15)});
    else pondShrubs.push({x,y,s:rr(.72,1.16)});
  }
  for(let i=0;i<70;i++){
    const a=rr(0,Math.PI*2),off=rr(.9,2.25);
    const [x,y]=ellipseOffsetPx(a,off);
    if(pointInPoly(x,y,POND_GARDEN))pondGrasses.push({x,y,s:rr(.65,1.25)});
  }
  instancedPlants(pondGroup,pondShrubs,false);
  instancedPlants(pondGroup,pondFlowers,true);

  // Ornamental grass blades in low clumps.
  const grassGeo=new THREE.ConeGeometry(.14,.85,5);
  const grassMesh=new THREE.InstancedMesh(grassGeo,grassMat,pondGrasses.length);
  const gd=new THREE.Object3D();
  pondGrasses.forEach((p,i)=>{
    gd.position.copy(wp(p.x,p.y,.44));
    gd.rotation.set(0,rr(0,Math.PI*2),rr(-.18,.18));
    gd.scale.set(p.s,p.s,p.s);gd.updateMatrix();grassMesh.setMatrixAt(i,gd.matrix);
  });
  grassMesh.instanceMatrix.needsUpdate=true;grassMesh.castShadow=true;pondGroup.add(grassMesh);

  // Rock clusters and shade trees form an outer garden belt beyond the promenade.
  for(let i=0;i<18;i++){
    const a=i*Math.PI*2/18+.12;
    const [x,y]=ellipseOffsetPx(a,9.2);
    if(pointInPoly(x,y,POND_GARDEN))addRock(pondGroup,x,y,rr(.65,1.25));
  }
  for(const a of [.55,2.20,3.55,5.35]){
    const [x,y]=ellipseOffsetPx(a,11.0);
    if(pointInPoly(x,y,POND_GARDEN))addTree(pondGroup,x,y,.86);
  }

  // ---------------- Main ornamental park ----------------
  const mainCenterW=wp(PARK_CENTER[0],PARK_CENTER[1],.44);
  const planter=new THREE.Mesh(new THREE.CylinderGeometry(8.5*S,9.1*S,.72,48),stoneMat);
  planter.position.copy(mainCenterW);planter.position.y=.38;planter.receiveShadow=true;parkGroup.add(planter);
  const innerPlant=new THREE.Mesh(new THREE.CylinderGeometry(6.9*S,6.9*S,.82,48),grassMat);
  innerPlant.position.copy(mainCenterW);innerPlant.position.y=.56;innerPlant.receiveShadow=true;parkGroup.add(innerPlant);

  for(let i=0;i<8;i++){
    const a=i*Math.PI*2/8;
    const x=PARK_CENTER[0]+Math.cos(a)*29;
    const y=PARK_CENTER[1]+Math.sin(a)*29;
    addBench(parkGroup,x,y,-a+.08,.90);
  }
  for(let i=0;i<16;i++){
    const a=i*Math.PI*2/16;
    const x=PARK_CENTER[0]+Math.cos(a)*41;
    const y=PARK_CENTER[1]+Math.sin(a)*41;
    if(pointInPoly(x,y,PARK_MAIN))addLamp(parkGroup,x,y,4.1);
  }

  // Central specimen trees.
  addTree(parkGroup,PARK_CENTER[0]-5,PARK_CENTER[1]+1,1.15);
  addTree(parkGroup,PARK_CENTER[0]+5,PARK_CENTER[1]-2,1.10);
  addTree(parkGroup,PARK_CENTER[0],PARK_CENTER[1]+7,1.00);

  // Pergola pairs make the park read as a finished amenity zone.
  addPergola(parkGroup,1122,708,THREE.MathUtils.degToRad(22),1.0);
  addPergola(parkGroup,1205,653,THREE.MathUtils.degToRad(-32),1.0);

  const mainShrubs=[],mainFlowers=[];
  const mx=PARK_MAIN.map(p=>p[0]),my=PARK_MAIN.map(p=>p[1]);
  for(let i=0;i<520;i++){
    const x=rr(Math.min(...mx),Math.max(...mx));
    const y=rr(Math.min(...my),Math.max(...my));
    if(!pointInPoly(x,y,PARK_MAIN))continue;
    const d=Math.hypot(x-PARK_CENTER[0],y-PARK_CENTER[1]);
    if(d<18||d>63)continue;
    let onPath=false;
    for(let k=0;k<8;k++){
      const a=k*Math.PI/4;
      const a0=[PARK_CENTER[0]+Math.cos(a)*17,PARK_CENTER[1]+Math.sin(a)*17];
      const a1=[PARK_CENTER[0]+Math.cos(a)*49,PARK_CENTER[1]+Math.sin(a)*49];
      if(distPointSeg(x,y,a0,a1)<3.0){onPath=true;break;}
    }
    if(onPath)continue;
    // Generic planting becomes background only; V97 flower beds carry the visual identity.
    (i%5===0?mainFlowers:mainShrubs).push({x,y,s:rr(.62,1.02)});
  }
  instancedPlants(parkGroup,mainShrubs,false);
  instancedPlants(parkGroup,mainFlowers,true);

  // V97 structured red-flower composition:
  // concentric red ribbons + fan-shaped beds between the eight radial paths.
  const redMainBeds=[];
  const redMainHedges=[];
  const spokeAngles=Array.from({length:8},(_,k)=>k*Math.PI/4);

  function awayFromRadialPaths(x,y,clearance=3.6){
    for(const a of spokeAngles){
      const a0=[PARK_CENTER[0]+Math.cos(a)*15,PARK_CENTER[1]+Math.sin(a)*15];
      const a1=[PARK_CENTER[0]+Math.cos(a)*54,PARK_CENTER[1]+Math.sin(a)*54];
      if(distPointSeg(x,y,a0,a1)<clearance)return false;
    }
    return true;
  }

  // Dense concentric ribbons like the supplied ornamental garden reference.
  for(const band of [
    {r0:20,r1:25,count:420},
    {r0:30,r1:36,count:560},
    {r0:42,r1:49,count:620}
  ]){
    for(let i=0;i<band.count;i++){
      const a=rr(0,Math.PI*2);
      const r=Math.sqrt(rr(band.r0*band.r0,band.r1*band.r1));
      const x=PARK_CENTER[0]+Math.cos(a)*r;
      const y=PARK_CENTER[1]+Math.sin(a)*r;
      if(!pointInPoly(x,y,PARK_MAIN)||!awayFromRadialPaths(x,y,3.4))continue;
      redMainBeds.push({x,y,s:rr(.72,1.10)});
    }
  }

  // Wedge beds between spokes: these create the strong red fan pattern visible in the 2D/render.
  for(let sector=0;sector<8;sector++){
    const centerA=(sector+.5)*Math.PI/4;
    for(let i=0;i<170;i++){
      const r=rr(24,53);
      const a=centerA+rr(-.22,.22);
      const x=PARK_CENTER[0]+Math.cos(a)*r;
      const y=PARK_CENTER[1]+Math.sin(a)*r;
      if(!pointInPoly(x,y,PARK_MAIN)||!awayFromRadialPaths(x,y,3.0))continue;
      redMainBeds.push({x,y,s:rr(.68,1.06)});
    }
  }

  // Low clipped hedge rings visually frame the red flower beds.
  for(const r of [18.8,27.7,39.3,51.2]){
    const n=Math.max(40,Math.round(r*2.8));
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2;
      const x=PARK_CENTER[0]+Math.cos(a)*r;
      const y=PARK_CENTER[1]+Math.sin(a)*r;
      if(pointInPoly(x,y,PARK_MAIN)&&awayFromRadialPaths(x,y,2.4)){
        redMainHedges.push({x,y,s:.72});
      }
    }
  }
  instancedLowHedges(parkGroup,redMainHedges);
  instancedRedFlowerBeds(parkGroup,redMainBeds);

  // Denser canopy around perimeter, never on the radial walking paths.
  let treeAdded=0;
  for(let tries=0;tries<250&&treeAdded<28;tries++){
    const x=rr(Math.min(...mx),Math.max(...mx));
    const y=rr(Math.min(...my),Math.max(...my));
    if(!pointInPoly(x,y,PARK_MAIN))continue;
    const d=Math.hypot(x-PARK_CENTER[0],y-PARK_CENTER[1]);
    if(d<37||d>67)continue;
    addTree(parkGroup,x,y,rr(.72,1.04));treeAdded++;
  }

  // ---------------- Secondary park ----------------
  const sx=PARK_SECONDARY.map(p=>p[0]),sy=PARK_SECONDARY.map(p=>p[1]);
  const secondaryShrubs=[],secondaryFlowers=[],secondaryRedBeds=[];
  const pathA=[[1160,918],[1265,972]],pathB=[[1200,900],[1218,1013]];

  for(let i=0;i<650;i++){
    const x=rr(Math.min(...sx),Math.max(...sx));
    const y=rr(Math.min(...sy),Math.max(...sy));
    if(!pointInPoly(x,y,PARK_SECONDARY))continue;
    if(distPointSeg(x,y,...pathA)<3.2||distPointSeg(x,y,...pathB)<3.0)continue;
    (i%6===0?secondaryFlowers:secondaryShrubs).push({x,y,s:rr(.62,1.06)});
  }
  instancedPlants(parkGroup,secondaryShrubs,false);
  instancedPlants(parkGroup,secondaryFlowers,true);

  // Dense red drifts in the secondary park while preserving the crossing paths.
  for(let i=0;i<1100;i++){
    const x=rr(Math.min(...sx),Math.max(...sx));
    const y=rr(Math.min(...sy),Math.max(...sy));
    if(!pointInPoly(x,y,PARK_SECONDARY))continue;
    if(distPointSeg(x,y,...pathA)<4.8||distPointSeg(x,y,...pathB)<4.4)continue;
    // cluster bias toward two broad red gardens rather than uniform noise
    const d1=Math.hypot(x-1192,y-950);
    const d2=Math.hypot(x-1264,y-971);
    if(Math.min(d1,d2)>56&&rnd()>.28)continue;
    secondaryRedBeds.push({x,y,s:rr(.68,1.08)});
  }
  instancedRedFlowerBeds(parkGroup,secondaryRedBeds);

  let secTrees=0;
  for(let tries=0;tries<300&&secTrees<32;tries++){
    const x=rr(Math.min(...sx),Math.max(...sx));
    const y=rr(Math.min(...sy),Math.max(...sy));
    if(!pointInPoly(x,y,PARK_SECONDARY))continue;
    if(distPointSeg(x,y,...pathA)<6||distPointSeg(x,y,...pathB)<6)continue;
    addTree(parkGroup,x,y,rr(.70,1.02));secTrees++;
  }

  for(const [x,y,r] of [
    [1175,930,.2],[1208,945,.8],[1241,960,1.15],[1275,976,1.6],
    [1194,987,.0],[1236,1001,.6],[1290,952,1.2]
  ]) addBench(parkGroup,x,y,r,.86);

  for(const [x,y] of [[1165,916],[1192,936],[1220,952],[1250,968],[1280,985],[1190,1000],[1230,1015],[1270,993]]){
    if(pointInPoly(x,y,PARK_SECONDARY))addLamp(parkGroup,x,y,4.0);
  }
  addPergola(parkGroup,1260,940,THREE.MathUtils.degToRad(28),.92);

  flushAssetQueue();

  // V105: asynchronously replace the park/pond procedural tree batches with
  // genuine Kenney Nature Kit GLB mesh parts. Placement stays exactly the same.
  // The GLB mesh parts are still InstancedMesh batches, so the visual upgrade
  // does not turn every individual tree into its own draw call.
  let parkTreeAssetMode='loading-kenney-glb';
  const parkTreeUpgradePromise=loadKenneyTreeAssets()
    .then(assets=>{
      const byGroup=new Map(
        [...new Set(treeQueue.map(t=>t.group))].map(g=>[g,treeQueue.filter(t=>t.group===g)])
      );
      for(const [group,items] of byGroup){
        const oak=[],pine=[];
        items.forEach((t,i)=>{
          const p=wp(t.px,t.py,.15);
          const placement={
            position:new THREE.Vector3(p.x,p.y,p.z),
            rotationY:(i*.61803398875%1)*Math.PI*2,
            scale:t.scale*(i%9===0?.92:1.0)
          };
          (i%9===0?pine:oak).push(placement);
        });
        createStaticInstancedAsset(group,assets.oak,oak,{
          name:'V105_PARK_OAKS',castShadow:true,receiveShadow:true
        });
        createStaticInstancedAsset(group,assets.pine,pine,{
          name:'V105_PARK_PINES',castShadow:true,receiveShadow:true
        });
      }
      fallbackParkTreeMeshes.forEach(m=>m.visible=false);
      parkTreeAssetMode='kenney-glb-instanced';
      root.userData.parkTreeAssetMode=parkTreeAssetMode;
      console.info('[DaLoc] V105 real Kenney park trees installed',{trees:treeQueue.length});
      return parkTreeAssetMode;
    })
    .catch(error=>{
      parkTreeAssetMode='procedural-fallback';
      root.userData.parkTreeAssetMode=parkTreeAssetMode;
      console.error('[DaLoc] V105 real park-tree fallback',error);
      return parkTreeAssetMode;
    });

  const stats={
    pondShrubs:pondShrubs.length,
    pondFlowers:pondFlowers.length,
    pondGrasses:pondGrasses.length,
    mainShrubs:mainShrubs.length,
    mainFlowers:mainFlowers.length,
    redMainFlowers:redMainBeds.length,
    redMainHedges:redMainHedges.length,
    secondaryShrubs:secondaryShrubs.length,
    secondaryFlowers:secondaryFlowers.length,
    secondaryRedFlowers:secondaryRedBeds.length,
    mainTrees:treeAdded+3,
    secondaryTrees:secTrees
  };
  root.userData.stats=stats;
  root.userData.parkTreeAssetMode=parkTreeAssetMode;

  function setVisible(v){root.visible=!!v;}
  const controller={
    ready:true,version:105,group:root,pondGroup,parkGroup,stats,setVisible,
    parkTreeUpgradePromise,
    get parkTreeAssetMode(){return parkTreeAssetMode;}
  };
  window.__DALOC_LANDSCAPE_V95=controller;
  console.info('[DaLoc] V105 park landscape started',{...stats,parkTreeAssetMode});
  return controller;
}
