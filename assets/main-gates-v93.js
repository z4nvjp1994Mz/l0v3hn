import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { installEntranceGateV92 } from './main-gate-v92.js?v=1695';

// V93 dual-gate system.
// - Existing V92 reference gate is moved to the FAR/opposite endpoint of raw CAD road 77505.
// - New modern curved HAPLAST gate, based on the newly supplied rendering, is placed at
//   the FRONT/start endpoint (southern approach) of the same raw CAD road.
// Both gates are source-locked to the road endpoints and road tangent.
export async function installDualEntranceGatesV93({
  world,mapPx,metersPerPixel,frameSignature,camera,controls
}){
  if(!world||typeof mapPx!=='function')throw new Error('V93 gates require world + mapPx');

  const response=await fetch(new URL('./cad-source-v72.json',import.meta.url));
  if(!response.ok)throw new Error('V93 gate CAD source HTTP '+response.status);
  const cad=await response.json();
  if(cad.frameSignature!==frameSignature)throw new Error('V93 gate coordinate frame mismatch');

  const road=cad.roads?.find(r=>r.handle==='77505');
  if(!road?.pointsPx?.length||road.pointsPx.length<2)throw new Error('V93 gate road 77505 missing');

  const root=new THREE.Group();
  root.name='DA_LOC_DUAL_GATES_V93';
  root.userData={version:104,roadHandle:'77505',source:'two supplied HAPLAST gate references'};
  world.add(root);

  function endpointPlacement(endpoint,neighbor,insetPx=18){
    const dx=neighbor[0]-endpoint[0],dy=neighbor[1]-endpoint[1];
    const len=Math.hypot(dx,dy)||1;
    const ux=dx/len,uy=dy/len;
    const centerPx=[endpoint[0]+ux*insetPx,endpoint[1]+uy*insetPx];
    const p=mapPx(centerPx[0],centerPx[1]);
    return {
      endpoint:[endpoint[0],endpoint[1]],
      centerPx,
      x:p.x,z:p.z,
      rotationY:Math.atan2(ux,uy),
      inwardPx:[ux,uy]
    };
  }

  // User correction: the previously built V92 gate belongs at the opposite/FAR end.
  const farPlacement=endpointPlacement(road.pointsPx[0],road.pointsPx[1],18);
  const frontPlacement=endpointPlacement(road.pointsPx.at(-1),road.pointsPx.at(-2),18);

  // Reuse the detailed V92 gate, then relocate it from the front endpoint to the far endpoint.
  const oldResult=await installEntranceGateV92({
    world,mapPx,metersPerPixel,frameSignature,camera,controls
  });
  const farGate=oldResult.group;
  root.add(farGate);
  farGate.name='DA_LOC_FAR_GATE_V93_REFERENCE_1';
  farGate.position.set(farPlacement.x,.02,farPlacement.z);
  farGate.rotation.y=farPlacement.rotationY;
  farGate.userData={
    ...farGate.userData,
    version:93,
    role:'far-end-gate',
    masterplanPx:{x:farPlacement.centerPx[0],y:farPlacement.centerPx[1]},
    roadEndpointPx:{x:farPlacement.endpoint[0],y:farPlacement.endpoint[1]},
    rotationY:farPlacement.rotationY
  };
  farGate.updateMatrixWorld(true);

  // ---------------- New FRONT gate from the latest supplied rendering ----------------
  const frontGate=new THREE.Group();
  frontGate.name='DA_LOC_FRONT_GATE_V93_REFERENCE_2';
  frontGate.position.set(frontPlacement.x,.02,frontPlacement.z);
  frontGate.rotation.y=frontPlacement.rotationY;
  frontGate.userData={
    version:93,
    role:'front-start-gate',
    source:'latest supplied curved HAPLAST gate rendering',
    roadHandle:'77505',
    masterplanPx:{x:frontPlacement.centerPx[0],y:frontPlacement.centerPx[1]},
    roadEndpointPx:{x:frontPlacement.endpoint[0],y:frontPlacement.endpoint[1]},
    rotationY:frontPlacement.rotationY
  };
  root.add(frontGate);

  function marbleTexture(){
    const cv=document.createElement('canvas');cv.width=cv.height=384;
    const ctx=cv.getContext('2d');
    ctx.fillStyle='#eee9e1';ctx.fillRect(0,0,384,384);
    let seed=93017;
    const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<42;i++){
      const y=rnd()*384;
      ctx.beginPath();ctx.moveTo(-20,y);
      for(let x=-20;x<420;x+=18){
        ctx.lineTo(x,y+Math.sin(x*.028+i*.7)*8+(rnd()-.5)*12);
      }
      ctx.strokeStyle=i%5===0?'rgba(120,112,108,.22)':'rgba(177,166,157,.16)';
      ctx.lineWidth=i%6===0?2.1:.8;ctx.stroke();
    }
    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(1.4,2.4);
    tex.anisotropy=4;
    return tex;
  }

  function roundedRect(ctx,x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
  }

  const VI_FONT_STACK='Tahoma, "Arial Unicode MS", Arial, "DejaVu Sans", sans-serif';

  function logoTexture(){
    const cv=document.createElement('canvas');cv.width=900;cv.height=520;
    const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);
    ctx.lineCap='round';ctx.lineJoin='round';
    const greens=['#245f42','#2e7652','#3d8b62'];
    for(let i=0;i<3;i++){
      ctx.strokeStyle=greens[i];ctx.lineWidth=42-i*6;
      roundedRect(ctx,250+i*38,58+i*32,260-i*76,205-i*64,26);
      ctx.stroke();
    }
    ctx.fillStyle='#b62f29';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='800 96px '+VI_FONT_STACK;
    ctx.fillText('HAPLAST',450,354);
    ctx.fillStyle='#544c43';
    ctx.font='600 26px '+VI_FONT_STACK;
    ctx.fillText('Green Packaging For Green Future',450,425);
    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    return tex;
  }

  function textTexture(text,{w=1800,h=420,size=120,color='#b62f29'}={}){
    const safeText=String(text).normalize('NFC');
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;
    const ctx=cv.getContext('2d');ctx.clearRect(0,0,w,h);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='800 '+size+'px '+VI_FONT_STACK;
    ctx.fontKerning='normal';
    ctx.lineWidth=5;ctx.strokeStyle='rgba(255,247,236,.72)';
    ctx.strokeText(safeText,w/2,h/2);
    ctx.fillStyle=color;ctx.fillText(safeText,w/2,h/2);
    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    return tex;
  }

  function multilineTexture(lines,{w=1000,h=460,size=72,color='#a72d28'}={}){
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;
    const ctx=cv.getContext('2d');ctx.clearRect(0,0,w,h);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=color;ctx.strokeStyle='rgba(255,247,236,.72)';ctx.lineWidth=4;
    lines.forEach((line,i)=>{
      const safeLine=String(line).normalize('NFC');
      const fs=i===lines.length-1?Math.round(size*1.08):size;
      ctx.font='800 '+fs+'px '+VI_FONT_STACK;
      ctx.fontKerning='normal';
      const y=h*(.30+i*.36);
      ctx.strokeText(safeLine,w/2,y);ctx.fillText(safeLine,w/2,y);
    });
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    return tex;
  }

  const marble=marbleTexture();
  const marbleMat=new THREE.MeshStandardMaterial({map:marble,color:0xf7f1e8,roughness:.68});
  const beamMat=new THREE.MeshStandardMaterial({color:0xead9c7,roughness:.70});
  const darkUnder=new THREE.MeshStandardMaterial({color:0x4e4944,roughness:.72});
  const woodMat=new THREE.MeshStandardMaterial({color:0xa94f1e,roughness:.70});
  const woodDark=new THREE.MeshStandardMaterial({color:0x743315,roughness:.78});
  const concrete=new THREE.MeshStandardMaterial({color:0xd7d2c8,roughness:.92});

  const roadWidth=(road.widthCad||20)*(cad.pxPerCadUnit||1.20434303125)*metersPerPixel;
  const clearSpan=Math.max(30.5,roadWidth+11.5);
  const pylonX=clearSpan/2+1.2;
  const depth=2.65;
  const towerH=16.4;
  const beamBottom=10.7;
  const beamH=2.25;

  // Tall marble hook, matching the white curved vertical elements in the supplied image.
  function marbleHookGeometry(){
    const sh=new THREE.Shape();
    sh.moveTo(0,0);
    sh.lineTo(3.15,0);
    sh.lineTo(3.15,12.9);
    sh.quadraticCurveTo(3.15,16.3,6.45,16.3);
    sh.lineTo(8.25,16.3);
    sh.lineTo(8.25,13.65);
    sh.lineTo(6.30,13.65);
    sh.quadraticCurveTo(5.15,13.65,5.15,12.45);
    sh.lineTo(5.15,9.45);
    sh.lineTo(0,9.45);
    sh.closePath();
    const g=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:false});
    g.translate(0,0,-depth/2);g.computeVertexNormals();return g;
  }

  function woodHookGeometry(){
    const sh=new THREE.Shape();
    sh.moveTo(0,0);sh.lineTo(2.15,0);sh.lineTo(2.15,6.9);
    sh.quadraticCurveTo(2.15,9.65,4.85,9.65);
    sh.lineTo(8.15,9.65);sh.lineTo(8.15,7.55);sh.lineTo(5.0,7.55);
    sh.quadraticCurveTo(4.30,7.55,4.30,6.85);
    sh.lineTo(4.30,0);sh.closePath();
    const g=new THREE.ExtrudeGeometry(sh,{depth:1.85,bevelEnabled:false});
    g.translate(0,0,-.925);g.computeVertexNormals();return g;
  }

  const marbleHookGeo=marbleHookGeometry();
  const woodHookGeo=woodHookGeometry();

  for(const side of [-1,1]){
    const pylon=new THREE.Mesh(marbleHookGeo,marbleMat);
    pylon.position.set(side*pylonX,0,0);pylon.scale.x=side;
    pylon.castShadow=true;pylon.receiveShadow=true;frontGate.add(pylon);

    const wood=new THREE.Mesh(woodHookGeo,side<0?woodMat:woodDark);
    wood.position.set(side*(pylonX+4.0),0,.04);wood.scale.x=side;
    wood.castShadow=true;wood.receiveShadow=true;frontGate.add(wood);

    const plinth=new THREE.Mesh(new RoundedBoxGeometry(9.2,.48,6.4,2,.12),concrete);
    plinth.position.set(side*(pylonX+3.0),.24,0);
    plinth.castShadow=true;plinth.receiveShadow=true;frontGate.add(plinth);
  }

  // Main horizontal beam.
  const beamW=clearSpan+13.0;
  const beam=new THREE.Mesh(new RoundedBoxGeometry(beamW,beamH,2.25,3,.14),beamMat);
  beam.position.set(0,beamBottom+beamH/2,0);
  beam.castShadow=true;beam.receiveShadow=true;frontGate.add(beam);

  const under=new THREE.Mesh(new RoundedBoxGeometry(beamW-1.0,.38,2.38,2,.08),darkUnder);
  under.position.set(0,beamBottom-.15,0);under.castShadow=true;frontGate.add(under);

  // Slight end blocks behind the marble hooks, as visible in the architectural rendering.
  for(const side of [-1,1]){
    const endBlock=new THREE.Mesh(new RoundedBoxGeometry(5.6,beamH+1.2,2.45,3,.14),beamMat);
    endBlock.position.set(side*(beamW/2-2.0),beamBottom+beamH/2-.25,.05);
    endBlock.castShadow=true;frontGate.add(endBlock);
  }

  function addPanel(tex,w,h,x,y,z,back=false){
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.FrontSide});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
    m.position.set(x,y,z);
    if(back)m.rotation.y=Math.PI;
    m.renderOrder=35;frontGate.add(m);
  }

  const title=textTexture('CỤM CÔNG NGHIỆP ĐA LỘC',{w:2200,h:410,size:126});
  const company=multilineTexture(['CÔNG TY CỔ PHẦN','HAPLAST'],{w:920,h:420,size:62});
  const logo=logoTexture();
  const zF=-1.17,zB=1.17;

  // Match the second reference: title centered/high, logo centered below, company text on right.
  for(const back of [false,true]){
    const z=back?zB:zF;
    addPanel(title,23.8,3.65,0,13.45,z,back);
    addPanel(logo,8.0,4.45,-1.0,10.95,z+(back?.02:-.02),back);
    addPanel(company,8.1,3.6,10.2,11.15,z+(back?.02:-.02),back);
  }

  // Low curved-landscape suggestion on both outside corners.
  for(const side of [-1,1]){
    const wall=new THREE.Mesh(new THREE.BoxGeometry(8.5,1.15,3.4),concrete);
    wall.position.set(side*(pylonX+8.1),.58,-2.2);wall.castShadow=true;wall.receiveShadow=true;frontGate.add(wall);
  }

  frontGate.traverse(o=>{
    if(o.isMesh&&!o.material?.transparent){o.castShadow=true;o.receiveShadow=true;}
  });
  frontGate.updateMatrixWorld(true);

  function clearGateArea(gate,{clearSpan,outer=11,depth=7,tag}){
    gate.updateMatrixWorld(true);
    const tmp=new THREE.Vector3();
    let hiddenTrees=0,clearedInstances=0;
    function occupied(wp){
      const local=gate.worldToLocal(wp.clone());
      const x=Math.abs(local.x);
      const pylonBand=x>clearSpan/2-3.5 && x<clearSpan/2+outer;
      return Math.abs(local.z)<depth && pylonBand;
    }

    world.traverse(o=>{
      if(!o.userData?.isTreeGroup)return;
      o.getWorldPosition(tmp);
      if(occupied(tmp)){
        o.userData.hiddenByGateV93=tag;
        o.visible=false;hiddenTrees++;
      }
    });

    const im=new THREE.Matrix4(),zero=new THREE.Matrix4().makeScale(0,0,0);
    world.traverse(o=>{
      if(!o.isInstancedMesh)return;
      let parent=o.parent,eligible=false;
      while(parent){
        if(parent.name==='CIRCULATION_V53'||parent.name==='V54_ROAD_FURNITURE'){eligible=true;break;}
        parent=parent.parent;
      }
      if(!eligible)return;
      o.updateWorldMatrix(true,false);
      let touched=false;
      for(let i=0;i<o.count;i++){
        o.getMatrixAt(i,im);
        const wp=new THREE.Vector3().setFromMatrixPosition(im).applyMatrix4(o.matrixWorld);
        if(occupied(wp)){
          o.setMatrixAt(i,zero);clearedInstances++;touched=true;
        }
      }
      if(touched){o.instanceMatrix.needsUpdate=true;o.computeBoundingSphere();}
    });
    return {hiddenTrees,clearedInstances};
  }

  // V92 already cleared the front endpoint before relocation; keep that useful clearance
  // for the new front gate. Now clear the newly occupied far endpoint for the moved gate.
  const farClear=clearGateArea(farGate,{
    clearSpan:oldResult.clearSpan||clearSpan,
    outer:11,depth:7,tag:'far'
  });
  const frontClear=clearGateArea(frontGate,{
    clearSpan,outer:12.5,depth:7.5,tag:'front'
  });

  const updateVisibility=()=>{
    if(!camera||!controls)return;
    root.visible=camera.position.distanceTo(controls.target)<3000;
  };
  controls?.addEventListener('change',updateVisibility);
  updateVisibility();

  window.__DALOC_DUAL_GATES_V93={
    ready:true,version:93,group:root,farGate,frontGate,
    farPlacement,frontPlacement,
    farClear,frontClear,
    styles:{
      far:'V92 original supplied gate',
      front:'V93 latest curved HAPLAST reference'
    }
  };

  console.info('[DaLoc] V93 dual gates installed',{
    farEndpoint:farPlacement.endpoint,
    frontEndpoint:frontPlacement.endpoint,
    farClear,frontClear
  });

  return {
    ready:true,version:93,group:root,farGate,frontGate,
    farPlacement,frontPlacement,farClear,frontClear,
    gateCount:2
  };
}
