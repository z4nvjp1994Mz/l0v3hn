import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildCadCorridorWarpV91 } from './corridor-warp-v91.js?v=91';

export async function installSiteDetailV54({
  world, buildings, mapPx, frameSignature, renderer, camera, controls
}) {
  if (!Array.isArray(buildings) || !buildings.length) throw new Error('V54: no verified factories');
  const [response,cadResponse] = await Promise.all([
    fetch(new URL('./circulation-v53.json', import.meta.url)),
    fetch(new URL('./cad-source-v72.json', import.meta.url))
  ]);
  if (!response.ok) throw new Error('V90 circulation data HTTP '+response.status);
  if (!cadResponse.ok) throw new Error('V90 CAD source HTTP '+cadResponse.status);
  const circulation = await response.json();
  const cadData = await cadResponse.json();
  if (circulation.frameSignature !== frameSignature || cadData.frameSignature !== frameSignature) throw new Error('V90 coordinate frame mismatch');
  const corridorWarpV91=buildCadCorridorWarpV91({circulation,cad:cadData});

  const root = new THREE.Group();
  root.name = 'SITE_DETAIL_V90';
  root.userData = { version:91, siteFrameSignature:frameSignature, cadMiniLandscapeLock:true, networkCorridorLock:true };
  world.add(root);

  const factoryGroup = new THREE.Group(); factoryGroup.name='V54_FACTORY_MICRODETAIL';
  const roadGroup = new THREE.Group(); roadGroup.name='V54_ROAD_FURNITURE';
  const landscapeGroup = new THREE.Group(); landscapeGroup.name='V54_LANDSCAPE_DETAIL';
  root.add(factoryGroup, roadGroup, landscapeGroup);

  const mats = {
    dark:new THREE.MeshStandardMaterial({color:0x303737,roughness:.78}),
    steel:new THREE.MeshStandardMaterial({color:0x8d9998,roughness:.48,metalness:.22}),
    glass:new THREE.MeshStandardMaterial({color:0x6f9dac,roughness:.16,metalness:.04,transparent:true,opacity:.88}),
    glassDark:new THREE.MeshStandardMaterial({color:0x426774,roughness:.20,metalness:.06}),
    dockDoor:new THREE.MeshStandardMaterial({color:0x71807f,roughness:.66,metalness:.15}),
    cladding:new THREE.MeshStandardMaterial({color:0xdfe3df,roughness:.82}),
    concrete:new THREE.MeshStandardMaterial({color:0xc8cbc5,roughness:.96}),
    white:new THREE.MeshStandardMaterial({color:0xeff1ec,roughness:.78}),
    yellow:new THREE.MeshStandardMaterial({color:0xe0be35,roughness:.76}),
    red:new THREE.MeshStandardMaterial({color:0xb8453e,roughness:.72}),
    green:new THREE.MeshStandardMaterial({color:0x2f6550,roughness:.82}),
    roadPaint:new THREE.MeshStandardMaterial({
      color:0xf3f0df,roughness:.78,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4
    }),
    shrubA:new THREE.MeshStandardMaterial({color:0x4c7c43,roughness:1}),
    shrubB:new THREE.MeshStandardMaterial({color:0x6a9553,roughness:1}),
    flower:new THREE.MeshStandardMaterial({color:0xb66e7f,roughness:1})
  };

  const geo = {
    camera:new THREE.BoxGeometry(.32,.24,.50),
    roofFanBase:new THREE.CylinderGeometry(.54,.62,.34,14),
    roofFanCap:new THREE.CylinderGeometry(.66,.50,.20,14),
    ladderRung:new THREE.BoxGeometry(.72,.045,.06),
    lampPole:new THREE.CylinderGeometry(.055,.085,7.2,10),
    lampArm:new THREE.BoxGeometry(.78,.07,.08),
    lampHead:new RoundedBoxGeometry(.78,.18,.38,2,.045),
    dockDoor:new RoundedBoxGeometry(3.25,3.35,.10,2,.035),
    hydrant:new THREE.CylinderGeometry(.18,.22,.86,10),
    bollard:new THREE.CylinderGeometry(.08,.11,.90,8),
    shrub:new THREE.IcosahedronGeometry(.58,1),
    curbStop:new THREE.BoxGeometry(1.65,.22,.34)
  };

  // ---------- factory-attached detail: never changes the verified footprint ----------
  const detailStats={factories:0,cameras:0,roofFans:0,ladders:0,utilityBoxes:0,dockDoors:0,facadeBands:0,roadDashes:0,edgeLines:0,lamps:0,shrubs:0,hydrants:0};

  buildings.forEach((g,idx)=>{
    const body=g.children.find(o=>o.geometry?.type==='BoxGeometry' && o.position.y>1);
    if(!body) return;
    const {width:L,height:H,depth:D}=body.geometry.parameters;
    const local=new THREE.Group();
    local.name='V54_FACTORY_'+String(idx+1).padStart(2,'0');
    g.add(local);
    detailStats.factories++;

    // Corner security cameras, mounted on the building itself.
    for(const sx of [-1,1]){
      for(const sz of [-1,1]){
        const mount=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.42),mats.steel);
        mount.position.set(sx*(L/2-.8),H*.78,sz*(D/2+.26));
        mount.rotation.y = sz>0 ? 0 : Math.PI;
        local.add(mount);
        const cam=new THREE.Mesh(geo.camera,mats.dark);
        cam.position.set(sx*(L/2-.8),H*.78,sz*(D/2+.56));
        cam.rotation.y = sz>0 ? 0 : Math.PI;
        local.add(cam); detailStats.cameras++;
      }
    }

    // Roof ridge ventilators / fan housings.
    const fanCount=Math.max(2,Math.min(8,Math.round(L/24)));
    for(let i=0;i<fanCount;i++){
      const x=(-.36+(i+.5)/fanCount*.72)*L;
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.54,.62,.34,14),mats.steel);
      base.position.set(x,H+1.15,(i%2?-.22:.22)*D); local.add(base);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(.66,.50,.20,14),mats.dark);
      cap.position.set(x,H+1.42,(i%2?-.22:.22)*D); local.add(cap);
      detailStats.roofFans++;
    }

    // One roof access ladder at the rear corner.
    const ladderX=L/2-.9, ladderZ=-D/2-.20;
    for(let y=.8;y<H-.4;y+=.58){
      const rung=new THREE.Mesh(new THREE.BoxGeometry(.72,.045,.06),mats.steel);
      rung.position.set(ladderX,y,ladderZ); local.add(rung);
    }
    for(const dx of [-.34,.34]){
      const rail=new THREE.Mesh(new THREE.BoxGeometry(.055,H-.8,.055),mats.steel);
      rail.position.set(ladderX+dx,(H-.8)/2+.4,ladderZ); local.add(rail);
    }
    detailStats.ladders++;

    // Utility cabinet + transformer-style technical box attached to rear service side.
    const util=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.65,.75),mats.steel);
    util.position.set(-L*.40,.92,-D/2-.48); local.add(util);
    const utilDoor=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.28,.04),mats.dark);
    utilDoor.position.set(-L*.40,.92,-D/2-.875); local.add(utilDoor);
    detailStats.utilityBoxes++;

    // Industrial entrance composition at one end: glazing, canopy and steps.
    const glass=new THREE.Mesh(new THREE.BoxGeometry(Math.min(7,L*.12),2.8,.08),mats.glass);
    glass.position.set(L*.38,2.25,-D/2-.08); local.add(glass);
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(Math.min(8,L*.14),.18,2.4),mats.green);
    canopy.position.set(L*.38,3.9,-D/2-1.08); local.add(canopy);
    for(let s=0;s<3;s++){
      const step=new THREE.Mesh(new THREE.BoxGeometry(Math.min(5.5,L*.10),.14,1.0+s*.42),mats.concrete);
      step.position.set(L*.38,.07+s*.07,-D/2-1.0-s*.22); local.add(step);
    }

    // V103 asset-first facade: a long glazed ribbon on the office/service side.
    if(L>32 && D>14){
      const bandW=Math.min(L*.72,82);
      const glassBand=new THREE.Mesh(new THREE.BoxGeometry(bandW,1.18,.07),mats.glassDark);
      glassBand.position.set(-L*.04,H*.61,-D/2-.075);
      local.add(glassBand);
      detailStats.facadeBands++;

      // Slim cladding rail above/below the glazing gives the factory a more
      // architectural silhouette without adding heavy geometry.
      for(const dy of [-.76,.76]){
        const rail=new THREE.Mesh(new THREE.BoxGeometry(bandW+.5,.10,.09),mats.cladding);
        rail.position.set(-L*.04,H*.61+dy,-D/2-.09);
        local.add(rail);
      }
    }

    // Dock lights + real dock doors + numbered bay signs.
    if(L>45 && D>18){
      const bays=Math.max(3,Math.min(8,Math.round(L/16)));
      const doorInst=new THREE.InstancedMesh(geo.dockDoor,mats.dockDoor,bays);
      const doorDummy=new THREE.Object3D();
      for(let i=0;i<bays;i++){
        const x=(-.38+i/(bays-1)*.76)*L;
        doorDummy.position.set(x,1.92,D/2+.075);
        doorDummy.updateMatrix();
        doorInst.setMatrixAt(i,doorDummy.matrix);

        const light=new THREE.Mesh(new THREE.BoxGeometry(.48,.18,.28),mats.white);
        light.position.set(x,4.65,D/2+.18); local.add(light);
        const plate=new THREE.Mesh(new THREE.BoxGeometry(.72,.36,.04),mats.green);
        plate.position.set(x,4.22,D/2+.13); local.add(plate);
        for(const bx of [x-1.75,x+1.75]){
          const bollard=new THREE.Mesh(geo.bollard,mats.yellow);
          bollard.position.set(bx,.46,D/2+2.05); local.add(bollard);
        }
      }
      doorInst.instanceMatrix.needsUpdate=true;
      doorInst.castShadow=true;
      doorInst.receiveShadow=true;
      local.add(doorInst);
      detailStats.dockDoors+=bays;
    }

    // Fire-hose / hydrant cabinet on every third factory for readable scale.
    if(idx%3===0){
      const cabinet=new THREE.Mesh(new THREE.BoxGeometry(.70,.92,.12),mats.red);
      cabinet.position.set(-L*.24,1.45,-D/2-.10); local.add(cabinet);
      const hyd=new THREE.Mesh(geo.hydrant,mats.red);
      hyd.position.set(-L/2+2.4,.45,-D/2-2.15); local.add(hyd);
      detailStats.hydrants++;
    }
  });

  // ---------- exact V53 road paths: markings and furniture stay on the verified geometry ----------
  const paths=circulation.paths||[];

  function warpPointPx(x,y){
    const q=corridorWarpV91.warpPx(x,y);
    return [q.x,q.y];
  }
  function warpRotationPx(x,y,dx,dy){
    const len=Math.hypot(dx,dy)||1;
    const q1=corridorWarpV91.warpPx(x,y);
    const q2=corridorWarpV91.warpPx(x+dx/len*2,y+dy/len*2);
    return Math.atan2(q2.x-q1.x,q2.y-q1.y);
  }

  function addSegmentBox(a,b,width,height,mat,y,name){
    const wa=warpPointPx(a[0],a[1]),wb=warpPointPx(b[0],b[1]);
    const p1=mapPx(wa[0],wa[1]),p2=mapPx(wb[0],wb[1]);
    const dx=p2.x-p1.x,dz=p2.z-p1.z,len=Math.hypot(dx,dz);
    if(len<.05) return null;
    const m=new THREE.Mesh(new THREE.BoxGeometry(width,height,len),mat);
    m.name=name||'V54_SEGMENT';
    m.position.set((p1.x+p2.x)/2,y,(p1.z+p2.z)/2);
    m.rotation.y=Math.atan2(dx,dz);
    roadGroup.add(m);
    return {mesh:m,len,rot:m.rotation.y,p1,p2};
  }

  // dashed center line on primary roads; short local paths get edge lines only.
  for(const path of paths){
    const pts=path.pointsPx;
    if(!pts?.length) continue;
    const primary=path.widthPx>=14;
    let carried=0;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],wa=warpPointPx(a[0],a[1]),wb=warpPointPx(b[0],b[1]);
      const pa=mapPx(wa[0],wa[1]),pb=mapPx(wb[0],wb[1]);
      const dx=pb.x-pa.x,dz=pb.z-pa.z,len=Math.hypot(dx,dz);
      if(len<.15) continue;
      const ux=dx/len,uz=dz/len;
      const nx=-uz,nz=ux;

      if(primary){
        const dash=4.2,gap=4.0,period=dash+gap;
        for(let d=period-carried;d<len;d+=period){
          const seg=Math.min(dash,len-d);
          if(seg<=.2) continue;
          const cx=pa.x+ux*(d+seg/2),cz=pa.z+uz*(d+seg/2);
          const m=new THREE.Mesh(new THREE.BoxGeometry(.16,.025,seg),mats.roadPaint);
          m.position.set(cx,.125,cz);m.rotation.y=Math.atan2(dx,dz);roadGroup.add(m);detailStats.roadDashes++;
        }
        carried=(carried+len)%period;
      }

      // clean solid edge lines just inside the asphalt boundary.
      const half=path.widthPx*.782/2-.38;
      if(half>.8 && len>2){
        for(const side of [-1,1]){
          const m=new THREE.Mesh(new THREE.BoxGeometry(.11,.022,len),mats.roadPaint);
          m.position.set((pa.x+pb.x)/2+nx*half,.124,(pa.z+pb.z)/2+nz*half);
          m.rotation.y=Math.atan2(dx,dz);roadGroup.add(m);detailStats.edgeLines++;
        }
      }
    }
  }

  // polygon containment for planting / furniture checks.
  function insideRing(x,y,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }
  const green=circulation.layers.greenbelt||[];
  const inGreen=(x,y)=>green.some(p=>insideRing(x,y,p.outer)&&!(p.holes||[]).some(h=>insideRing(x,y,h)));

  // Streetlights and shrubs sampled along verified road geometry, only where the green belt accepts the point.
  const lightPositions=[], shrubPositions=[];
  for(const path of paths){
    if(path.widthPx<14) continue;
    const pts=path.pointsPx; let walked=0, nextLight=36, nextShrub=12;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
      if(!len) continue;
      const nx=-dy/len,ny=dx/len;
      while(walked+len>=Math.min(nextLight,nextShrub)){
        const target=Math.min(nextLight,nextShrub), t=(target-walked)/len;
        if(t<0||t>1) break;
        const side=((Math.floor(target/36)%2)?1:-1);
        if(target===nextLight){
          const off=path.widthPx/2+7.0;
          const x=a[0]+dx*t+nx*off*side,y=a[1]+dy*t+ny*off*side;
          if(inGreen(x,y)){
            const q=warpPointPx(x,y);
            lightPositions.push([q[0],q[1],warpRotationPx(x,y,dx,dy)]);
          }
          nextLight+=36;
        }
        if(target===nextShrub){
          const off=path.widthPx/2+4.4;
          for(const side2 of [-1,1]){
            const x=a[0]+dx*t+nx*off*side2,y=a[1]+dy*t+ny*off*side2;
            if(inGreen(x,y)){
              const q=warpPointPx(x,y);
              shrubPositions.push([q[0],q[1],(Math.floor(target/12)+side2)%7===0]);
            }
          }
          nextShrub+=12;
        }
      }
      walked+=len;
    }
  }

  if(lightPositions.length){
    const pole=new THREE.InstancedMesh(geo.lampPole,mats.dark,lightPositions.length);
    const arm=new THREE.InstancedMesh(geo.lampArm,mats.dark,lightPositions.length);
    const head=new THREE.InstancedMesh(geo.lampHead,mats.white,lightPositions.length);
    const dummy=new THREE.Object3D();
    lightPositions.forEach(([x,y,rot],i)=>{
      const p=mapPx(x,y);
      dummy.position.set(p.x,3.72,p.z);dummy.rotation.set(0,rot,0);dummy.updateMatrix();pole.setMatrixAt(i,dummy.matrix);
      dummy.position.set(p.x,7.14,p.z);dummy.rotation.set(0,rot,0);dummy.translateZ(.31);dummy.updateMatrix();arm.setMatrixAt(i,dummy.matrix);
      dummy.position.set(p.x,7.24,p.z);dummy.rotation.set(0,rot,0);dummy.translateZ(.70);dummy.rotation.x=-.10;dummy.updateMatrix();head.setMatrixAt(i,dummy.matrix);
    });
    for(const m of [pole,arm,head]){
      m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();
      m.castShadow=true;m.receiveShadow=true;
    }
    roadGroup.add(pole,arm,head);detailStats.lamps=lightPositions.length;
  }

  if(shrubPositions.length){
    const aCount=shrubPositions.filter(x=>!x[2]).length,bCount=shrubPositions.length-aCount;
    const shrubA=new THREE.InstancedMesh(geo.shrub,mats.shrubA,aCount);
    const shrubB=new THREE.InstancedMesh(geo.shrub,mats.flower,bCount);
    const dummy=new THREE.Object3D();let ai=0,bi=0;
    shrubPositions.forEach(([x,y,flower])=>{
      const p=mapPx(x,y),sc=flower ? .72 : .88;
      dummy.position.set(p.x,.62*sc,p.z);dummy.scale.set(sc,sc,sc);dummy.rotation.set(0,(x+y)*.013,0);dummy.updateMatrix();
      (flower?shrubB:shrubA).setMatrixAt(flower?bi++:ai++,dummy.matrix);
    });
    shrubA.instanceMatrix.needsUpdate=true;shrubB.instanceMatrix.needsUpdate=true;
    shrubA.computeBoundingSphere();shrubB.computeBoundingSphere();
    shrubA.castShadow=shrubB.castShadow=true;roadGroup.add(shrubA,shrubB);
    detailStats.shrubs=shrubPositions.length;
  }

  // Small safety bollards at V53 path ends that fall inside the site context.
  const endpointBollards=[];
  for(const path of paths){
    if(path.widthPx<14||path.pointsPx.length<2) continue;
    for(const end of [path.pointsPx[0],path.pointsPx[path.pointsPx.length-1]]){
      endpointBollards.push(end);
    }
  }
  if(endpointBollards.length){
    const inst=new THREE.InstancedMesh(geo.bollard,mats.yellow,endpointBollards.length);
    const dummy=new THREE.Object3D();
    endpointBollards.forEach(([x,y],i)=>{const q=warpPointPx(x,y),p=mapPx(q[0],q[1]);dummy.position.set(p.x,.48,p.z);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});
    inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();inst.castShadow=true;roadGroup.add(inst);
  }

  // LOD-like visibility: micro detail is meant for walking/detail distance.
  const updateDetailVisibility=()=>{
    const d=camera.position.distanceTo(controls.target);
    factoryGroup.visible=d<1150;
    roadGroup.visible=d<1450;
    landscapeGroup.visible=d<1300;
  };
  controls.addEventListener('change',updateDetailVisibility);
  updateDetailVisibility();

  window.__DALOC_V54={
    ready:true,version:104,frameSignature,stats:detailStats,
    group:root,cadMiniLandscapeLock:true
  };
  console.info('[DaLoc] V103 asset-first factory/road micro detail ready',detailStats);
  return {group:root,stats:detailStats};
}
