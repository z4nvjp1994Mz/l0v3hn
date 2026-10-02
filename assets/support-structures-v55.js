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
  const doors=[];
  const doorTmpWorld=new THREE.Vector3();

  function localToWorld(building,local){
    building.updateWorldMatrix(true,false);
    doorTmpWorld.copy(local);
    return building.localToWorld(doorTmpWorld.clone());
  }

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

  function addShellBox(g,size,pos,mat,name){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);
    mesh.position.set(...pos);
    mesh.name=name;
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.userData.collider=true;
    mesh.userData.type='support-wall';
    g.add(mesh);
    return mesh;
  }

  function buildDoorWallShell(g,L,D,H,wallMat,doorXs,doorWidth,doorHeight,idx){
    const t=.22;
    const y=.12+H*.5;
    addShellBox(g,[t,H,D],[-L*.5+t*.5,y,0],wallMat,'V168_AUX_SIDE_L_'+idx);
    addShellBox(g,[t,H,D],[ L*.5-t*.5,y,0],wallMat,'V168_AUX_SIDE_R_'+idx);
    addShellBox(g,[L-2*t,H,t],[0,y,-D*.5+t*.5],wallMat,'V168_AUX_REAR_'+idx);

    const pad=.08;
    const openings=doorXs
      .map(x=>({a:x-doorWidth*.5-pad,b:x+doorWidth*.5+pad,x}))
      .sort((a,b)=>a.a-b.a);

    let cursor=-L*.5+t;
    for(let i=0;i<openings.length;i++){
      const op=openings[i];
      if(op.a>cursor+.04){
        const w=op.a-cursor;
        addShellBox(
          g,[w,H,t],[cursor+w*.5,y,D*.5-t*.5],wallMat,
          'V168_AUX_FRONT_SEG_'+idx+'_'+i
        );
      }
      const lintelH=Math.max(.18,H-doorHeight-.12);
      addShellBox(
        g,[doorWidth+pad*2,lintelH,t],
        [op.x,.12+doorHeight+lintelH*.5,D*.5-t*.5],
        wallMat,'V168_AUX_FRONT_LINTEL_'+idx+'_'+i
      );
      cursor=Math.max(cursor,op.b);
    }
    const end=L*.5-t;
    if(end>cursor+.04){
      const w=end-cursor;
      addShellBox(
        g,[w,H,t],[cursor+w*.5,y,D*.5-t*.5],wallMat,
        'V168_AUX_FRONT_SEG_'+idx+'_END'
      );
    }
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
    slab.position.y=.06;
    slab.receiveShadow=true;
    slab.name='V168_AUX_WALKABLE_SLAB_'+idx;
    slab.userData={walkable:true,fpsNonSolid:true};
    g.add(slab);

    const wallMat=kind==='admin'?mats.wall:mats.wallSide;
    const doorCount=L>45?2:1;
    const doorXs=doorCount===1?[0]:[-L*.27,L*.27];
    const doorWidth=1.35,doorHeight=2.35;

    // Keep an invisible reference box for modules that still inspect the
    // original support footprint, but render/collide using a real wall shell
    // with doorway gaps.
    const body=new THREE.Mesh(new THREE.BoxGeometry(L,H,D),wallMat);
    body.position.y=H/2+.12;
    body.visible=false;
    body.name='V168_AUX_BODY_REFERENCE_'+idx;
    body.userData.fpsNonSolid=true;
    g.add(body);

    buildDoorWallShell(g,L,D,H,wallMat,doorXs,doorWidth,doorHeight,idx);
    g.userData.fpsDoorShell={L,D,H,doorXs:[...doorXs],doorWidth,doorHeight};

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

    for(let i=0;i<doorCount;i++){
      const x=doorXs[i];
      const pivot=new THREE.Group();
      pivot.name='V168_AUX_DOOR_PIVOT_'+idx+'_'+i;
      pivot.position.set(x-doorWidth*.5,0,D*.5+.075);
      pivot.userData={fpsInteractiveDoor:true,ignoreFpsCollision:true};
      g.add(pivot);

      const panel=new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth,doorHeight,.10),
        mats.door
      );
      panel.name='V168_AUX_DOOR_PANEL_'+idx+'_'+i;
      panel.position.set(doorWidth*.5,.12+doorHeight*.5,0);
      panel.userData={fpsInteractiveDoor:true,fpsNonSolid:true};
      pivot.add(panel);

      const canopy=new THREE.Mesh(new THREE.BoxGeometry(2.6,.14,1.35),mats.green);
      canopy.position.set(x,2.85,D/2+.62);
      canopy.userData.fpsNonSolid=true;
      g.add(canopy);

      doors.push({
        index:doors.length,
        source:'support',
        buildingIndex:idx,
        building:g,
        pivot,
        panel,
        width:doorWidth,
        height:doorHeight,
        L,D,H,
        kind,
        swingSign:(idx+i)%2===0?-1:1,
        openAmount:0,
        targetOpen:0,
        isOpen:false,
        centerLocal:new THREE.Vector3(x,.12+doorHeight*.5,D*.5+.075),
        outsideLocal:new THREE.Vector3(x,.12,D*.5+1.4),
        insideLocal:new THREE.Vector3(x,.12,D*.5-1.4),
        displayName:'nhà phụ '+kind+' '+(idx+1)
      });
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

  function setDoorOpen(index,v){
    const d=doors[index];
    if(!d)return false;
    d.targetOpen=v?1:0;
    d.isOpen=!!v;
    return true;
  }

  function toggleDoor(index){
    const d=doors[index];
    if(!d)return false;
    return setDoorOpen(index,!d.isOpen);
  }

  function update(dt){
    const k=Math.min(1,Math.max(0,dt)*8.5);
    for(const d of doors){
      d.openAmount+=(d.targetOpen-d.openAmount)*k;
      if(Math.abs(d.targetOpen-d.openAmount)<.002)d.openAmount=d.targetOpen;
      d.pivot.rotation.y=d.swingSign*d.openAmount*Math.PI*.49;
    }
  }

  function doorWorldInfo(index){
    const d=doors[index];
    if(!d)return null;
    return {
      center:localToWorld(d.building,d.centerLocal),
      outside:localToWorld(d.building,d.outsideLocal),
      inside:localToWorld(d.building,d.insideLocal),
      openAmount:d.openAmount,
      isOpen:d.isOpen,
      width:d.width,
      source:d.source,
      displayName:d.displayName
    };
  }

  const updateVisibility=()=>{
    if(!camera||!controls) return;
    group.visible=camera.position.distanceTo(controls.target)<2300;
  };
  controls?.addEventListener('change',updateVisibility);
  updateVisibility();

  const api={
    ready:true,version:168,frameSignature,group,count:footprints.length,
    footprints,
    doors,
    setDoorOpen,
    toggleDoor,
    update,
    doorWorldInfo
  };
  window.__DALOC_V55=api;
  console.info('[DaLoc] V168 support structures + interactive doors installed:',{
    buildings:footprints.length,doors:doors.length
  });
  return api;
}
