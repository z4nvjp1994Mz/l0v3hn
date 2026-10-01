import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// V102 — cinematic / diorama visual-quality pass.
// No masterplan geometry is changed here. This module only improves rendering,
// atmosphere, shadows, material response and optional miniature tilt-shift.
export function installVisualQualityV102({
  scene,camera,renderer,controls,sun,world,ground
}){
  if(!scene||!camera||!renderer||!controls||!sun)throw new Error('V102 visual quality requires scene/camera/renderer/controls/sun');

  // ---------- Renderer / color pipeline ----------
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=true;

  // ---------- Physically plausible reflection environment ----------
  const pmrem=new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader?.();
  const room=new RoomEnvironment();
  const envRT=pmrem.fromScene(room,0.035);
  scene.environment=envRT.texture;
  room.dispose?.();

  // ---------- Softer cinematic sky ----------
  scene.background=new THREE.Color(0xb9cee0);
  scene.fog=new THREE.Fog(0xc4d5df,900,3000);

  const skyGeo=new THREE.SphereGeometry(3100,32,16);
  const skyMat=new THREE.ShaderMaterial({
    side:THREE.BackSide,
    depthWrite:false,
    uniforms:{
      topColor:{value:new THREE.Color(0x8eb9d8)},
      horizonColor:{value:new THREE.Color(0xd9e5e7)},
      groundColor:{value:new THREE.Color(0xb4c99a)},
      offset:{value:70.0},
      exponent:{value:0.72}
    },
    vertexShader:`
      varying vec3 vWorldPosition;
      void main(){
        vec4 wp=modelMatrix*vec4(position,1.0);
        vWorldPosition=wp.xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main(){
        float h=normalize(vWorldPosition+vec3(0.0,offset,0.0)).y;
        float sky=smoothstep(-0.02,0.72,h);
        vec3 c=mix(horizonColor,topColor,pow(max(h,0.0),exponent));
        c=mix(groundColor,c,sky);
        gl_FragColor=vec4(c,1.0);
      }
    `
  });
  const sky=new THREE.Mesh(skyGeo,skyMat);
  sky.name='V102_CINEMATIC_SKY';
  scene.add(sky);

  // ---------- Balanced key/fill lighting ----------
  // Existing hemisphere light was intentionally strong for debugging; reduce the
  // flat fill so contact shadows / forms become readable.
  scene.traverse(o=>{
    if(o.isHemisphereLight){
      o.intensity=Math.min(o.intensity,1.28);
      o.color.setHex(0xeaf5ff);
      o.groundColor.setHex(0x4d6345);
    }
  });

  sun.color.setHex(0xffe6c3);
  sun.intensity=4.35;
  sun.shadow.mapSize.set(4096,4096);
  sun.shadow.bias=-0.00008;
  sun.shadow.normalBias=.022;
  sun.shadow.radius=2.2;

  if(!sun.target.parent)scene.add(sun.target);

  const fill=new THREE.DirectionalLight(0x9fc8e8,.72);
  fill.name='V102_COOL_FILL';
  fill.position.set(650,520,-700);
  fill.castShadow=false;
  scene.add(fill);

  const warmRim=new THREE.DirectionalLight(0xffc98d,.42);
  warmRim.name='V102_WARM_RIM';
  warmRim.position.set(-450,240,-550);
  warmRim.castShadow=false;
  scene.add(warmRim);

  // ---------- Subtle terrain texture (breaks the flat green CG look) ----------
  let groundMap=null;
  if(ground?.material?.isMeshStandardMaterial){
    const c=document.createElement('canvas');
    c.width=c.height=512;
    const ctx=c.getContext('2d',{alpha:false});
    const img=ctx.createImageData(c.width,c.height);
    let seed=102031;
    const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const cells=[];
    for(let gy=0;gy<17;gy++)for(let gx=0;gx<17;gx++)cells.push(rnd());
    const sample=(x,y)=>{
      const fx=x/512*16,fy=y/512*16;
      const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(16,x0+1),y1=Math.min(16,y0+1);
      const tx=fx-x0,ty=fy-y0;
      const a=cells[y0*17+x0]*(1-tx)+cells[y0*17+x1]*tx;
      const b=cells[y1*17+x0]*(1-tx)+cells[y1*17+x1]*tx;
      return a*(1-ty)+b*ty;
    };
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){
      const i=(y*512+x)*4;
      const n=sample(x,y)*.68+rnd()*.32;
      const base=[145,173,121];
      img.data[i]=Math.max(0,Math.min(255,base[0]+(n-.5)*20));
      img.data[i+1]=Math.max(0,Math.min(255,base[1]+(n-.5)*22));
      img.data[i+2]=Math.max(0,Math.min(255,base[2]+(n-.5)*16));
      img.data[i+3]=255;
    }
    ctx.putImageData(img,0,0);
    groundMap=new THREE.CanvasTexture(c);
    groundMap.colorSpace=THREE.SRGBColorSpace;
    groundMap.wrapS=groundMap.wrapT=THREE.RepeatWrapping;
    groundMap.repeat.set(18,18);
    groundMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    ground.material.map=groundMap;
    ground.material.color.setHex(0xffffff);
    ground.material.roughness=.98;
    ground.material.needsUpdate=true;
  }

  // ---------- Material response enhancement ----------
  function refreshMaterials(){
    world?.traverse(o=>{
      if(!o.isMesh)return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      mats.forEach(m=>{
        if(!m?.isMeshStandardMaterial&&!m?.isMeshPhysicalMaterial)return;
        if('envMapIntensity' in m){
          const name=(o.name||'').toLowerCase();
          if(name.includes('water')||name.includes('glass'))m.envMapIntensity=1.05;
          else if(name.includes('solar'))m.envMapIntensity=.82;
          else m.envMapIntensity=.42;
        }
        // keep authored material identity; only avoid perfectly flat extremes
        if(Number.isFinite(m.roughness))m.roughness=THREE.MathUtils.clamp(m.roughness,.18,1);
        if(Number.isFinite(m.metalness))m.metalness=THREE.MathUtils.clamp(m.metalness,0,.82);
        m.needsUpdate=true;
      });
    });
  }
  refreshMaterials();

  // ---------- Post processing ----------
  const composer=new EffectComposer(renderer);
  const renderPass=new RenderPass(scene,camera);
  composer.addPass(renderPass);

  const ssao=new SSAOPass(scene,camera,innerWidth,innerHeight);
  ssao.kernelRadius=13;
  ssao.minDistance=.0022;
  ssao.maxDistance=.13;
  composer.addPass(ssao);

  const hTilt=new ShaderPass(HorizontalTiltShiftShader);
  const vTilt=new ShaderPass(VerticalTiltShiftShader);
  hTilt.uniforms.r.value=.50;
  vTilt.uniforms.r.value=.50;
  composer.addPass(hTilt);
  composer.addPass(vTilt);

  const vignette=new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value=.92;
  vignette.uniforms.darkness.value=1.16;
  composer.addPass(vignette);

  const smaa=new SMAAPass(innerWidth*renderer.getPixelRatio(),innerHeight*renderer.getPixelRatio());
  composer.addPass(smaa);
  composer.addPass(new OutputPass());

  let enabled=true;
  let mode='perspective';

  function updateTilt(){
    const pr=renderer.getPixelRatio();
    const w=Math.max(1,innerWidth*pr),h=Math.max(1,innerHeight*pr);
    const active=enabled&&mode!=='top';
    hTilt.enabled=active;
    vTilt.enabled=active;
    // Detail view gets the strongest miniature/lens feel.
    const strength=mode==='detail'?1.38:1.0;
    hTilt.uniforms.h.value=active?strength/w:0;
    vTilt.uniforms.v.value=active?strength/h:0;
    hTilt.uniforms.r.value=mode==='detail'?.49:.515;
    vTilt.uniforms.r.value=mode==='detail'?.49:.515;
    vignette.enabled=enabled&&mode!=='top';
    ssao.enabled=enabled;
    smaa.enabled=enabled;
  }

  function fitSunShadow(){
    const target=controls.target;
    const d=camera.position.distanceTo(target);
    const extent=THREE.MathUtils.clamp(d*.52,145,980);
    const cam=sun.shadow.camera;
    const changed=Math.abs(cam.right-extent)>8;
    if(changed){
      cam.left=-extent;cam.right=extent;cam.top=extent;cam.bottom=-extent;
      cam.near=30;cam.far=2600;
      cam.updateProjectionMatrix();
      sun.shadow.needsUpdate=true;
    }
    sun.target.position.copy(target);
    sun.position.set(target.x-720,target.y+1100,target.z+620);
    sun.target.updateMatrixWorld();
  }

  let shadowTick=0;
  function update(){
    shadowTick++;
    if(shadowTick%12===0)fitSunShadow();
  }

  function setMode(next){
    mode=next||'perspective';
    updateTilt();
  }

  function setEnabled(v){
    enabled=!!v;
    updateTilt();
  }

  function resize(w=innerWidth,h=innerHeight){
    composer.setSize(w,h);
    ssao.setSize?.(w,h);
    updateTilt();
  }

  function render(){
    if(enabled)composer.render();
    else renderer.render(scene,camera);
  }

  updateTilt();
  fitSunShadow();

  // Async modules keep adding objects for a few seconds. Refresh material response
  // after those late assets have arrived.
  setTimeout(refreshMaterials,1800);
  setTimeout(refreshMaterials,4200);

  const controller={
    ready:true,
    version:102,
    composer,
    ssao,
    setEnabled,
    setMode,
    resize,
    render,
    update,
    refreshMaterials,
    get enabled(){return enabled;},
    get mode(){return mode;}
  };
  window.__DALOC_VISUAL_V102=controller;
  console.info('[DaLoc] V102 cinematic diorama visual pipeline installed');
  return controller;
}
