import * as THREE from 'three';

// V70 — CAD-LOCKED HYBRID.
// Major-road alignment is anchored by DXF calibration. Secondary/service roads are
// explicit vectors frozen in the same 1616x2048 masterplan frame. No runtime pixel scan.

function segmentDistance2D(px,pz,a,b){
  const vx=b.x-a.x,vz=b.z-a.z,wx=px-a.x,wz=pz-a.z;
  const vv=vx*vx+vz*vz;
  const t=vv?Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv)):0;
  const qx=a.x+vx*t,qz=a.z+vz*t;
  return Math.hypot(px-qx,pz-qz);
}

export async function installCadHybridV70({
  world,mapPx,metersPerPixel,frameSignature,renderer
}){
  const [roadsRes,calRes,cadRes]=await Promise.all([
    fetch(new URL('./hybrid-v70-secondary-roads.json',import.meta.url)),
    fetch(new URL('./cad-v70-calibration.json',import.meta.url)),
    fetch(new URL('./cad-v70-daloc-core.json',import.meta.url))
  ]);
  if(!roadsRes.ok)throw new Error('V70 roads HTTP '+roadsRes.status);
  if(!calRes.ok)throw new Error('V70 calibration HTTP '+calRes.status);
  if(!cadRes.ok)throw new Error('V70 CAD core HTTP '+cadRes.status);

  const roads=await roadsRes.json();
  const calibration=await calRes.json();
  const cad=await cadRes.json();
  if(roads.frameSignature!==frameSignature){
    throw new Error('V70 coordinate frame mismatch');
  }

  const root=new THREE.Group();
  root.name='CAD_HYBRID_V70';
  root.userData={
    version:70,
    frameSignature,
    source:'DXF + frozen masterplan vectors',
    runtimeInference:false
  };
  world.add(root);

  const mats={
    concrete:new THREE.MeshStandardMaterial({color:0xc7c6bf,roughness:.96,metalness:0}),
    crossing:new THREE.MeshStandardMaterial({color:0xc3c2ba,roughness:.94,metalness:0}),
    curb:new THREE.MeshStandardMaterial({color:0xe8e6dc,roughness:1}),
    joint:new THREE.MeshStandardMaterial({color:0xaaa9a1,roughness:1}),
    cad:new THREE.LineBasicMaterial({color:0x00d89d,transparent:true,opacity:.9,depthTest:false})
  };

  const roadMeshes=[];
  const curbMeshes=[];
  const corridors=[];

  function addSegment(seg){
    const aPx=seg.pointsPx[0],bPx=seg.pointsPx[1];
    const a=mapPx(aPx[0],aPx[1]),b=mapPx(bPx[0],bPx[1]);
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(len<.05)return;

    const width=Math.max(3.1,Math.min(9.0,seg.widthPx*metersPerPixel));
    const crossing=seg.kind==='main-crossing';
    const y=crossing?.43:.36;

    const road=new THREE.Mesh(
      new THREE.BoxGeometry(width,.16,len+.18),
      crossing?mats.crossing:mats.concrete
    );
    road.name='V70_'+seg.kind.toUpperCase()+'_'+seg.id;
    road.position.set((a.x+b.x)/2,y,(a.z+b.z)/2);
    road.rotation.y=Math.atan2(dx,dz);
    road.receiveShadow=true;
    road.castShadow=false;
    road.userData={...seg,siteFrameSignature:frameSignature,walkable:true};
    root.add(road);roadMeshes.push(road);

    corridors.push({a,b,radius:width*.5+1.15,kind:seg.kind});

    // Curbs belong to the service lane itself, never across the mouth of a junction.
    if(!crossing){
      const nx=-dz/len,nz=dx/len;
      for(const side of [-1,1]){
        const curb=new THREE.Mesh(
          new THREE.BoxGeometry(.24,.20,len+.10),
          mats.curb
        );
        curb.position.set(
          (a.x+b.x)/2+nx*side*(width*.5+.12),
          .42,
          (a.z+b.z)/2+nz*side*(width*.5+.12)
        );
        curb.rotation.y=road.rotation.y;
        curb.receiveShadow=true;
        root.add(curb);curbMeshes.push(curb);
      }
    }

    // Subtle slab joints make the concrete read as a real service road rather than a flat ribbon.
    if(!crossing && len>16){
      const ux=dx/len,uz=dz/len;
      for(let d=10;d<len-5;d+=12){
        const joint=new THREE.Mesh(new THREE.BoxGeometry(width*.92,.018,.07),mats.joint);
        joint.position.set(a.x+ux*d,.452,a.z+uz*d);
        joint.rotation.y=road.rotation.y;
        root.add(joint);
      }
    }
  }

  for(const seg of roads.segments||[])addSegment(seg);

  // ----- CAD calibration overlay: hidden by default, available as a verification layer.
  const cadGroup=new THREE.Group();
  cadGroup.name='V70_CAD_LOCK_OVERLAY';
  cadGroup.visible=false;
  cadGroup.renderOrder=50;
  root.add(cadGroup);

  const m=calibration.cadToPixel.matrix;
  const origin=cad.originCad||[0,0];
  function cadLocalToPx(p){
    const x=origin[0]+p[0],y=origin[1]+p[1];
    return [
      m[0][0]*x+m[0][1]*y+m[0][2],
      m[1][0]*x+m[1][1]*y+m[1][2]
    ];
  }
  function addCadPolyline(ent,closed=false){
    const src=ent.points||[];
    if(src.length<2)return;
    const pts=src.map(p=>{
      const px=cadLocalToPx(p),w=mapPx(px[0],px[1]);
      return new THREE.Vector3(w.x,.72,w.z);
    });
    if(closed&&pts.length>2)pts.push(pts[0].clone());
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    const line=new THREE.Line(geo,mats.cad);
    line.frustumCulled=false;
    cadGroup.add(line);
  }
  for(const ent of cad.layers?.ENTPLINETUYEN||[])addCadPolyline(ent,false);
  for(const ent of cad.layers?.DUONG_NHUA||[])addCadPolyline(ent,false);
  for(const ent of cad.layers?.RG_NUT||[])addCadPolyline(ent,true);

  // ----- Remove planting exactly where frozen road corridors pass.
  function inCorridor(x,z){
    for(const c of corridors){
      if(segmentDistance2D(x,z,c.a,c.b)<=c.radius)return true;
    }
    return false;
  }

  function cullTreeGroups(){
    let hidden=0;
    world.traverse(o=>{
      if(!o.userData?.isTreeGroup||!o.visible)return;
      const p=new THREE.Vector3();
      o.getWorldPosition(p);
      if(inCorridor(p.x,p.z)){o.visible=false;hidden++;}
    });
    return hidden;
  }

  function cullInstancedPlanting(group){
    if(!group)return 0;
    let hidden=0;
    group.updateWorldMatrix(true,true);
    group.traverse(o=>{
      if(!o.isInstancedMesh)return;
      const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
      o.updateWorldMatrix(true,false);
      let changed=false;
      for(let i=0;i<o.count;i++){
        o.getMatrixAt(i,matrix);
        matrix.decompose(pos,q,sc);
        const wp=pos.clone().applyMatrix4(o.matrixWorld);
        if(!inCorridor(wp.x,wp.z))continue;
        sc.setScalar(.0001);
        matrix.compose(pos,q,sc);
        o.setMatrixAt(i,matrix);
        hidden++;changed=true;
      }
      if(changed){
        o.instanceMatrix.needsUpdate=true;
        o.computeBoundingSphere?.();
      }
    });
    return hidden;
  }

  function clearVegetation(){
    let hidden=cullTreeGroups();
    hidden+=cullInstancedPlanting(world.getObjectByName('CIRCULATION_V53'));
    return hidden;
  }
  clearVegetation();

  let enabled=true;
  function setEnabled(v){
    enabled=!!v;
    for(const o of root.children){
      if(o===cadGroup)continue;
      o.visible=enabled;
    }
    button.classList.toggle('active',enabled);
    button.textContent=enabled?'Secondary roads: On':'Secondary roads: Off';
  }

  const controls=document.querySelector('.controls');
  const button=document.createElement('button');
  button.id='secondaryRoadsV70';
  button.className='active';
  button.textContent='Secondary roads: On';
  button.onclick=()=>setEnabled(!enabled);
  controls?.appendChild(button);

  const cadButton=document.createElement('button');
  cadButton.id='cadLockV70';
  cadButton.textContent='CAD lock: Off';
  cadButton.onclick=()=>{
    cadGroup.visible=!cadGroup.visible;
    cadButton.classList.toggle('active',cadGroup.visible);
    cadButton.textContent=cadGroup.visible?'CAD lock: On':'CAD lock: Off';
  };
  controls?.appendChild(cadButton);

  window.__DALOC_V70={
    ready:true,
    version:70,
    group:root,
    cadGroup,
    segments:roads.segments,
    setEnabled,
    clearVegetation,
    showCad(v=true){
      cadGroup.visible=!!v;
      cadButton.classList.toggle('active',cadGroup.visible);
      cadButton.textContent=cadGroup.visible?'CAD lock: On':'CAD lock: Off';
    }
  };

  console.info('[DaLoc] V70 CAD-locked hybrid installed',{
    segments:roads.segments?.length||0,
    runtimeInference:false,
    calibration
  });

  return {
    ready:true,
    version:70,
    lines:roads.segments?.length||0,
    cadLocked:true,
    runtimeInference:false
  };
}
