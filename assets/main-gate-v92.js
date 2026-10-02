import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// V92: main entrance gate inspired by the supplied Da Loc gate rendering.
// Placement is source-locked to the southern end of raw CAD road 77505.
export async function installEntranceGateV92({
  world,mapPx,metersPerPixel,frameSignature,camera,controls
}){
  if(!world||typeof mapPx!=='function')throw new Error('V92 gate requires world + mapPx');

  const response=await fetch(new URL('./cad-source-v72.json',import.meta.url));
  if(!response.ok)throw new Error('V92 gate CAD source HTTP '+response.status);
  const cad=await response.json();
  if(cad.frameSignature!==frameSignature)throw new Error('V92 gate coordinate frame mismatch');

  const road=cad.roads?.find(r=>r.handle==='77505');
  if(!road?.pointsPx?.length||road.pointsPx.length<2)throw new Error('V92 gate road 77505 missing');

  const end=road.pointsPx.at(-1);
  const prev=road.pointsPx.at(-2);
  const dxIn=prev[0]-end[0],dyIn=prev[1]-end[1],lenPx=Math.hypot(dxIn,dyIn)||1;
  const uxPx=dxIn/lenPx,uyPx=dyIn/lenPx;

  // Keep the gate just inside the project boundary while preserving a clear outside approach.
  const insetPx=18;
  const centerPx=[end[0]+uxPx*insetPx,end[1]+uyPx*insetPx];
  const c=mapPx(centerPx[0],centerPx[1]);

  // local +Z points inward along the road; local X runs across the road.
  const rotationY=Math.atan2(uxPx,uyPx);

  const group=new THREE.Group();
  group.name='DA_LOC_MAIN_GATE_V92';
  group.position.set(c.x,.02,c.z);
  group.rotation.y=rotationY;
  group.userData={
    version:104,
    source:'reference gate image + raw CAD road 77505',
    siteFrameSignature:frameSignature,
    roadHandle:'77505',
    masterplanPx:{x:centerPx[0],y:centerPx[1]},
    roadEndpointPx:{x:end[0],y:end[1]},
    rotationY
  };
  world.add(group);

  function makeMarbleTexture(){
    const cv=document.createElement('canvas');cv.width=cv.height=384;
    const ctx=cv.getContext('2d');
    ctx.fillStyle='#eee7dc';ctx.fillRect(0,0,cv.width,cv.height);
    let seed=92311;
    const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<34;i++){
      const y=rnd()*cv.height;
      ctx.beginPath();
      ctx.moveTo(-30,y);
      for(let x=-30;x<cv.width+40;x+=22){
        const yy=y+Math.sin(x*.035+i)*9+(rnd()-.5)*14;
        ctx.lineTo(x,yy);
      }
      ctx.strokeStyle=i%3===0?'rgba(139,126,118,.20)':'rgba(181,165,151,.18)';
      ctx.lineWidth=i%4===0?2.0:.85;
      ctx.stroke();
    }
    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(1.5,2.2);
    tex.anisotropy=4;
    return tex;
  }

  const VI_FONT_STACK='Tahoma, "Arial Unicode MS", Arial, "DejaVu Sans", sans-serif';

  function makeTextTexture(lines,{
    width=2048,height=512,
    titleSize=150,subSize=66,
    titleColor='#b32622',subColor='#9a2522',
    stroke='rgba(255,245,232,.70)'
  }={}){
    const cv=document.createElement('canvas');cv.width=width;cv.height=height;
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,width,height);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='rgba(65,28,20,.30)';ctx.shadowBlur=6;ctx.shadowOffsetY=3;

    const entries=(Array.isArray(lines)?lines:[lines]).map(v=>String(v).normalize('NFC'));
    if(entries.length===1){
      ctx.font='800 '+titleSize+'px '+VI_FONT_STACK;
      ctx.lineWidth=7;ctx.strokeStyle=stroke;ctx.strokeText(entries[0],width/2,height/2);
      ctx.fillStyle=titleColor;ctx.fillText(entries[0],width/2,height/2);
    }else{
      ctx.font='800 '+titleSize+'px '+VI_FONT_STACK;
      ctx.lineWidth=6;ctx.strokeStyle=stroke;ctx.strokeText(entries[0],width/2,height*.34);
      ctx.fillStyle=titleColor;ctx.fillText(entries[0],width/2,height*.34);
      ctx.font='700 '+subSize+'px '+VI_FONT_STACK;
      ctx.lineWidth=4;ctx.strokeStyle=stroke;ctx.strokeText(entries[1],width/2,height*.69);
      ctx.fillStyle=subColor;ctx.fillText(entries[1],width/2,height*.69);
      if(entries[2]){
        ctx.font='800 '+Math.round(subSize*1.08)+'px '+VI_FONT_STACK;
        ctx.strokeText(entries[2],width/2,height*.86);
        ctx.fillText(entries[2],width/2,height*.86);
      }
    }
    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=4;
    return tex;
  }

  function roundedRect(ctx,x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  function makeLogoTexture(){
    const cv=document.createElement('canvas');cv.width=640;cv.height=520;
    const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);
    ctx.lineCap='round';ctx.lineJoin='round';
    const green=['#1f6848','#2a7651','#3a8760'];
    for(let i=0;i<3;i++){
      ctx.strokeStyle=green[i];ctx.lineWidth=34-i*5;
      roundedRect(ctx,180+i*34,78+i*29,230-i*68,190-i*58,28);
      ctx.stroke();
    }
    ctx.fillStyle='#b52b26';
    ctx.font='800 88px '+VI_FONT_STACK;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='rgba(80,30,20,.20)';ctx.shadowBlur=4;
    ctx.fillText('HAPLAST',320,390);
    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    return tex;
  }

  const marbleTex=makeMarbleTexture();
  const marbleMat=new THREE.MeshStandardMaterial({map:marbleTex,color:0xf4eee5,roughness:.72});
  const marbleLight=new THREE.MeshStandardMaterial({map:marbleTex,color:0xfffaf2,roughness:.68});
  const darkStone=new THREE.MeshStandardMaterial({color:0x5c6970,roughness:.52,metalness:.04});
  const undersideMat=new THREE.MeshStandardMaterial({color:0x4c4742,roughness:.66});
  const plinthMat=new THREE.MeshStandardMaterial({color:0xd9d4ca,roughness:.90});
  const redMat=new THREE.MeshStandardMaterial({color:0xb62c27,roughness:.56});

  const rawRoadWidth=(road.widthCad||20)*(cad.pxPerCadUnit||1.20434303125)*metersPerPixel;
  const clearSpan=Math.max(28.5,rawRoadWidth+9.5);
  const pylonDepth=2.5;
  const pylonOuter=6.4;
  const towerH=15.4;
  const beamBottom=9.7;
  const beamH=2.05;
  const beamDepth=1.85;

  function pylonGeometry(){
    const sh=new THREE.Shape();
    sh.moveTo(0,0);
    sh.lineTo(pylonOuter,0);
    sh.lineTo(pylonOuter,towerH);
    sh.lineTo(4.05,towerH);
    sh.lineTo(2.75,12.25);
    sh.lineTo(1.45,7.1);
    sh.lineTo(.55,2.4);
    sh.closePath();
    const g=new THREE.ExtrudeGeometry(sh,{depth:pylonDepth,bevelEnabled:false});
    g.translate(0,0,-pylonDepth/2);
    g.computeVertexNormals();
    return g;
  }

  const pylonGeo=pylonGeometry();
  function addPylon(side){
    const m=new THREE.Mesh(pylonGeo,marbleMat);
    m.position.x=side*clearSpan/2;
    m.scale.x=side;
    m.castShadow=true;m.receiveShadow=true;
    group.add(m);

    // grey stone inset follows the diagonal inner face seen in the reference.
    const sh=new THREE.Shape();
    sh.moveTo(.78,3.0);sh.lineTo(1.70,7.25);sh.lineTo(2.88,11.85);sh.lineTo(3.34,13.0);
    sh.lineTo(2.75,12.28);sh.lineTo(1.40,7.0);sh.closePath();
    const g=new THREE.ExtrudeGeometry(sh,{depth:.16,bevelEnabled:false});
    g.translate(0,0,-.08);
    for(const front of [-1,1]){
      const stripe=new THREE.Mesh(g,darkStone);
      stripe.position.set(side*clearSpan/2,0,front*(pylonDepth/2+.10));
      stripe.scale.x=side;
      group.add(stripe);
    }

    const base=new THREE.Mesh(new RoundedBoxGeometry(7.7,.52,5.8,2,.12),plinthMat);
    base.position.set(side*(clearSpan/2+pylonOuter*.45),.26,0);
    base.castShadow=true;base.receiveShadow=true;group.add(base);

    // Outer vertical return wall gives the monumental "portal" silhouette.
    const returnWall=new THREE.Mesh(new RoundedBoxGeometry(2.15,10.4,2.25,3,.16),marbleLight);
    returnWall.position.set(side*(clearSpan/2+pylonOuter+1.0),5.2,.05);
    returnWall.castShadow=true;returnWall.receiveShadow=true;group.add(returnWall);

    const sideBeam=new THREE.Mesh(new RoundedBoxGeometry(6.2,1.25,1.95,3,.12),marbleLight);
    sideBeam.position.set(side*(clearSpan/2+pylonOuter+3.0),9.95,.05);
    sideBeam.castShadow=true;group.add(sideBeam);
  }
  addPylon(-1);addPylon(1);

  const beam=new THREE.Mesh(new RoundedBoxGeometry(clearSpan+8.1,beamH,beamDepth,3,.14),marbleLight);
  beam.position.set(0,beamBottom+beamH/2,0);
  beam.castShadow=true;beam.receiveShadow=true;group.add(beam);

  const underBeam=new THREE.Mesh(new RoundedBoxGeometry(clearSpan+6.7,.42,beamDepth+.16,2,.08),undersideMat);
  underBeam.position.set(0,beamBottom-.18,0);
  underBeam.castShadow=true;group.add(underBeam);

  // Thin red cap line references the red lettering/trim in the supplied gate rendering.
  const redCap=new THREE.Mesh(new THREE.BoxGeometry(clearSpan+5.2,.12,beamDepth+.10),redMat);
  redCap.position.set(0,beamBottom+beamH+.07,0);group.add(redCap);

  function addPanel(tex,w,h,y,z,front=true){
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.FrontSide,depthWrite:false});
    const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
    p.position.set(0,y,z);
    if(!front)p.rotation.y=Math.PI;
    p.renderOrder=30;
    group.add(p);
    return p;
  }

  const titleTex=makeTextTexture('CỤM CÔNG NGHIỆP ĐA LỘC',{width:2400,height:430,titleSize:148});
  const subTex=makeTextTexture(['CÔNG TY CỔ PHẦN','HAPLAST'],{width:1300,height:430,titleSize:68,subSize:72});
  const zFront=-beamDepth/2-.035,zBack=beamDepth/2+.035;

  // Outside-facing signage.
  addPanel(titleTex,22.8,4.05,12.65,zFront,false);
  addPanel(subTex,9.5,3.05,10.95,zFront,false);
  // Inside-facing duplicate so the gate reads correctly from both directions.
  addPanel(titleTex,22.8,4.05,12.65,zBack,true);
  addPanel(subTex,9.5,3.05,10.95,zBack,true);

  const logoTex=makeLogoTexture();
  function addLogo(side,z,front){
    const mat=new THREE.MeshBasicMaterial({map:logoTex,transparent:true,side:THREE.FrontSide,depthWrite:false});
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(4.2,3.3),mat);
    plane.position.set(side*(clearSpan/2+pylonOuter*.58),7.45,z);
    if(!front)plane.rotation.y=Math.PI;
    plane.renderOrder=31;group.add(plane);
  }
  for(const side of [-1,1]){
    addLogo(side,zFront-.035,false);
    addLogo(side,zBack+.035,true);
  }

  // Foundation lighting accents.
  const warm=new THREE.MeshStandardMaterial({color:0xffd08a,emissive:0xffa844,emissiveIntensity:1.6,roughness:.5});
  for(const side of [-1,1])for(const x of [-1.8,1.8]){
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(.42,.16,.34),warm);
    lamp.position.set(side*(clearSpan/2+pylonOuter*.46)+x,.42,-2.25);
    group.add(lamp);
  }

  group.traverse(o=>{
    if(o.isMesh && !o.material?.transparent){
      o.castShadow=true;o.receiveShadow=true;
    }
  });
  group.updateMatrixWorld(true);

  function nearGatePylonWorld(worldPoint){
    const local=group.worldToLocal(worldPoint.clone());
    return Math.abs(local.z)<5.4 &&
      Math.abs(Math.abs(local.x)-(clearSpan/2+pylonOuter*.45))<5.4;
  }

  // Clear large source trees that would physically intersect the two gate pylons/plinths.
  let hiddenTrees=0;
  const tmp=new THREE.Vector3();
  world.traverse(o=>{
    if(!o.userData?.isTreeGroup)return;
    o.getWorldPosition(tmp);
    if(nearGatePylonWorld(tmp)){
      o.userData.hiddenByMainGateV92=true;
      o.visible=false;hiddenTrees++;
    }
  });

  // Also remove instanced greenbelt trees/shrubs/lamps right under the pylon foundations.
  // Instances away from the gate remain untouched.
  let clearedInstances=0;
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
    for(let i=0;i<o.count;i++){
      o.getMatrixAt(i,im);
      const wp=new THREE.Vector3().setFromMatrixPosition(im).applyMatrix4(o.matrixWorld);
      if(nearGatePylonWorld(wp)){
        o.setMatrixAt(i,zero);
        clearedInstances++;
      }
    }
    o.instanceMatrix.needsUpdate=true;
    o.computeBoundingSphere();
  });

  const updateVisibility=()=>{
    if(!camera||!controls)return;
    group.visible=camera.position.distanceTo(controls.target)<2800;
  };
  controls?.addEventListener('change',updateVisibility);
  updateVisibility();

  window.__DALOC_MAIN_GATE_V92={
    ready:true,version:92,group,
    roadHandle:'77505',
    centerPx,
    clearSpan,
    rawRoadWidth,
    hiddenTrees,
    clearedInstances
  };

  console.info('[DaLoc] V92 main gate installed',{
    centerPx,clearSpan,rawRoadWidth,hiddenTrees,clearedInstances,
    source:'supplied reference rendering'
  });

  return {ready:true,version:92,group,centerPx,clearSpan,rawRoadWidth,hiddenTrees,clearedInstances};
}
