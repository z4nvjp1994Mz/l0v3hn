import * as THREE from 'three';

// V55: auxiliary buildings measured from non-blue building footprints on the
// 1616x2048 source masterplan. All positions stay in source-image pixels and
// are converted only through the permanent mapPx() transform supplied by index.html.
export function installSupportStructuresV55({
  group, mapPx, metersPerPixel, frameSignature, controls, camera
}) {
  if (!group) throw new Error('V55: verifiedSupportGroup is required');
  if (typeof mapPx !== 'function') throw new Error('V55: mapPx is required');

  group.clear();
  group.name = 'verifiedSupportGroup';
  group.userData = { version:55, siteFrameSignature:frameSignature, source:'masterplan-hires.jpg' };

  const S = metersPerPixel;
  const mats = {
    wall:new THREE.MeshStandardMaterial({color:0xeeeae0,roughness:.78}),
    wallSide:new THREE.MeshStandardMaterial({color:0xd8d8d1,roughness:.84}),
    peach:new THREE.MeshStandardMaterial({color:0xe8c9bf,roughness:.72}),
    brown:new THREE.MeshStandardMaterial({color:0x9d6a58,roughness:.68}),
    parapet:new THREE.MeshStandardMaterial({color:0xf1eee7,roughness:.82}),
    glass:new THREE.MeshStandardMaterial({color:0x7399a5,roughness:.20,metalness:.04}),
    door:new THREE.MeshStandardMaterial({color:0x525b5b,roughness:.68}),
    concrete:new THREE.MeshStandardMaterial({color:0xc9cac4,roughness:.98}),
    metal:new THREE.MeshStandardMaterial({color:0x87908f,roughness:.50,metalness:.22}),
    green:new THREE.MeshStandardMaterial({color:0x2d5e4c,roughness:.80})
  };

  // center x/y, long side px, short side px, image angle deg, height m, class.
  // Measurements are from visible peach/brown building footprints.
  // Two tiny red-boundary detections were explicitly excluded.
  const footprints = [
    [1031.8,296.1,103.0,49.8,36.7,5.8,'service'],
    [904.1,444.8,45.7,30.3,35.0,4.4,'service'],
    [864.0,514.0,68.0,55.0,-56.0,4.8,'service'],

    [1277.1,546.3,32.7,18.8,84.0,4.0,'utility'],
    [1304.0,538.3,39.7,17.7,80.8,4.0,'utility'],

    [772.3,634.0,48.6,20.7,32.3,4.2,'annex'],
    [834.0,681.5,48.6,20.8,36.9,4.2,'annex'],
    [889.7,722.4,52.4,19.3,-52.3,4.2,'service'],
    [922.1,746.5,52.0,20.0,-54.0,4.2,'service'],

    [497.3,877.1,41.4,19.7,-52.7,4.0,'service'],
    [910.4,884.1,49.3,25.0,36.0,6.8,'admin'],
    [1022.8,911.1,60.4,29.4,35.5,4.8,'service'],
    [982.7,965.1,61.6,30.3,37.6,4.8,'service'],

    [461.0,1117.9,61.4,18.3,36.6,4.0,'annex'],
    [515.8,1158.4,55.4,17.3,37.6,4.0,'annex'],
    [775.5,1319.4,49.7,17.9,38.4,4.0,'annex'],
    [362.7,1325.2,103.5,31.4,37.7,4.8,'service'],

    [456.0,1570.1,48.7,20.3,35.0,4.0,'service'],
    [502.8,1605.7,47.3,19.8,37.6,4.0,'service'],
    [547.9,1640.1,48.4,20.0,38.7,4.0,'service']
  ];

  function addWindowBand(g,L,D,H,front=true){
    const z=(front?1:-1)*(D/2+.055);
    const band=new THREE.Mesh(new THREE.BoxGeometry(Math.max(2.4,L*.55),Math.min(1.25,H*.26),.08),mats.glass);
    band.position.set(0,H*.62,z);g.add(band);
  }

  function addAuxBuilding(rec,idx){
    const [cx,cy,Lpx,Dpx,angleDeg,H,kind]=rec;
    const p=mapPx(cx,cy),L=Lpx*S,D=Dpx*S;
    const g=new THREE.Group();
    g.name='V55_AUX_'+String(idx+1).padStart(2,'0');
    g.position.set(p.x,.16,p.z);
    g.rotation.y=THREE.MathUtils.degToRad(-angleDeg);
    g.userData={collider:true,type:'auxiliary-building',kind,id:g.name,masterplanPx:{x:cx,y:cy},footprintPx:{L:Lpx,D:Dpx,angle:angleDeg}};
    group.add(g);

    const slab=new THREE.Mesh(new THREE.BoxGeometry(L+.18,.12,D+.18),mats.concrete);
    slab.position.y=.06;slab.receiveShadow=true;g.add(slab);

    const wallMat=kind==='admin'?mats.wall:mats.wallSide;
    const body=new THREE.Mesh(new THREE.BoxGeometry(L,H,D),wallMat);
    body.position.y=H/2+.12;body.castShadow=true;body.receiveShadow=true;g.add(body);

    const roofMat=kind==='admin'?mats.brown:mats.peach;
    const roof=new THREE.Mesh(new THREE.BoxGeometry(L+.22,.26,D+.22),roofMat);
    roof.position.y=H+.25;roof.castShadow=true;g.add(roof);

    const parapetH=.38,t=.16;
    for(const z of [-D/2,D/2]){
      const m=new THREE.Mesh(new THREE.BoxGeometry(L+.30,parapetH,t),mats.parapet);
      m.position.set(0,H+.48,z);g.add(m);
    }
    for(const x of [-L/2,L/2]){
      const m=new THREE.Mesh(new THREE.BoxGeometry(t,parapetH,D+.30),mats.parapet);
      m.position.set(x,H+.48,0);g.add(m);
    }

    addWindowBand(g,L,D,H,true);
    if(L>24) addWindowBand(g,L,D,H,false);

    const doorCount=L>45?2:1;
    for(let i=0;i<doorCount;i++){
      const x=doorCount===1?0:(i===0?-L*.27:L*.27);
      const door=new THREE.Mesh(new THREE.BoxGeometry(1.35,2.35,.10),mats.door);
      door.position.set(x,1.30,D/2+.07);g.add(door);
      const canopy=new THREE.Mesh(new THREE.BoxGeometry(2.6,.14,1.35),mats.green);
      canopy.position.set(x,2.85,D/2+.62);g.add(canopy);
    }

    if(L*D>260){
      const units=Math.max(1,Math.min(3,Math.round(L/28)));
      for(let i=0;i<units;i++){
        const x=(-.28+(i+.5)/units*.56)*L;
        const u=new THREE.Mesh(new THREE.BoxGeometry(1.7,.62,1.25),mats.metal);
        u.position.set(x,H+.72,0);u.castShadow=true;g.add(u);
      }
    }
    return g;
  }

  footprints.forEach(addAuxBuilding);

  const updateVisibility=()=>{
    if(!camera||!controls) return;
    group.visible=camera.position.distanceTo(controls.target)<2300;
  };
  controls?.addEventListener('change',updateVisibility);
  updateVisibility();

  window.__DALOC_V55={
    ready:true,version:55,frameSignature,count:footprints.length,
    footprints:footprints.map((r,i)=>({id:'V55_AUX_'+String(i+1).padStart(2,'0'),cx:r[0],cy:r[1],Lpx:r[2],Dpx:r[3],angle:r[4],kind:r[6]}))
  };
  console.info('[DaLoc] V55 support structures installed:',footprints.length);
  return {group,count:footprints.length,footprints};
}
