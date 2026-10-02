import * as THREE from 'three';

// V103 — lightweight visual baseline.
// Asset quality is the priority. No EffectComposer, SSAO, SMAA, vignette,
// tilt-shift or multi-pass full-screen effects are used here.
export function installVisualQualityV102({
  scene,camera,renderer,controls,sun,world,ground
}){
  if(!scene||!camera||!renderer||!controls||!sun)throw new Error('V103 visual baseline requires scene/camera/renderer/controls/sun');

  // Direct renderer only: one scene render per frame.
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.06;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=true;

  // Cheap atmosphere: solid sky + linear fog. No postprocess.
  scene.background=new THREE.Color(0xb8cddd);
  scene.fog=new THREE.Fog(0xc7d4d9,1050,3100);

  // Keep lighting dimensional but inexpensive.
  scene.traverse(o=>{
    if(o.isHemisphereLight){
      o.intensity=Math.min(o.intensity,1.45);
      o.color.setHex(0xeaf4ff);
      o.groundColor.setHex(0x53644a);
    }
  });
  sun.color.setHex(0xffe8c9);
  sun.intensity=3.65;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.bias=-0.0001;
  sun.shadow.normalBias=.026;
  sun.shadow.radius=1.35;
  if(!sun.target.parent)scene.add(sun.target);

  // One subtle fill light only.
  const fill=new THREE.DirectionalLight(0xa9c9df,.42);
  fill.name='V103_LIGHT_FILL';
  fill.position.set(620,430,-720);
  fill.castShadow=false;
  scene.add(fill);

  // Lightweight procedural lawn texture so the ground is not a flat color.
  let groundMap=null;
  if(ground?.material?.isMeshStandardMaterial){
    const c=document.createElement('canvas');
    c.width=c.height=256;
    const ctx=c.getContext('2d',{alpha:false});
    const img=ctx.createImageData(256,256);
    let seed=10317;
    const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const i=(y*256+x)*4;
      const wave=Math.sin(x*.073)+Math.cos(y*.057)+Math.sin((x+y)*.031);
      const n=(wave/6)+(rnd()-.5)*.18;
      img.data[i]=Math.max(0,Math.min(255,145+n*18));
      img.data[i+1]=Math.max(0,Math.min(255,174+n*20));
      img.data[i+2]=Math.max(0,Math.min(255,121+n*14));
      img.data[i+3]=255;
    }
    ctx.putImageData(img,0,0);
    groundMap=new THREE.CanvasTexture(c);
    groundMap.colorSpace=THREE.SRGBColorSpace;
    groundMap.wrapS=groundMap.wrapT=THREE.RepeatWrapping;
    groundMap.repeat.set(20,20);
    groundMap.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    ground.material.map=groundMap;
    ground.material.color.setHex(0xffffff);
    ground.material.roughness=1;
    ground.material.needsUpdate=true;
  }

  let mode='perspective';
  let renderCamera=camera;
  let tick=0;
  function fitShadow(){
    const target=controls.target;
    const d=camera.position.distanceTo(target);
    const extent=THREE.MathUtils.clamp(d*.58,190,1080);
    const cam=sun.shadow.camera;
    if(Math.abs(cam.right-extent)>20){
      cam.left=-extent;cam.right=extent;cam.top=extent;cam.bottom=-extent;
      cam.near=35;cam.far=2700;
      cam.updateProjectionMatrix();
      sun.shadow.needsUpdate=true;
    }
    sun.target.position.copy(target);
    sun.position.set(target.x-690,target.y+1080,target.z+610);
    sun.target.updateMatrixWorld();
  }

  function update(){
    if((tick++%24)===0)fitShadow();
  }
  function setMode(next){mode=next||'perspective';}
  function setEnabled(){/* retained for API compatibility; direct render is always used */ }
  function resize(){/* renderer size is managed by index.html */ }
  function render(){renderer.render(scene,renderCamera||camera);}
  function setRenderCamera(nextCamera){
    renderCamera=nextCamera?.isCamera?nextCamera:camera;
  }
  function refreshMaterials(){/* asset modules own their materials in V103 */ }

  fitShadow();

  const controller={
    ready:true,
    version:103,
    render,
    update,
    setMode,
    setEnabled,
    resize,
    setRenderCamera,
    refreshMaterials,
    get enabled(){return true;},
    get mode(){return mode;},
    get renderCamera(){return renderCamera;}
  };
  window.__DALOC_VISUAL_V102=controller;
  console.info('[DaLoc] V103 lightweight direct-render visual baseline installed');
  return controller;
}
