import * as THREE from 'three';

// V147 - unique factory detail layer.
// Adds a deterministic, different visual layout to every verified factory while
// preserving the masterplan footprint, existing V139 collision shell and doors.
// New micro-detail is decorative/non-solid; the V139 machinery remains the
// authoritative FPS collision inside each factory.
export function installFactoryDetailV147({
  world,
  buildings,
  factoryInteriors,
  camera
}={}){
  if(!world||!Array.isArray(buildings)||!buildings.length){
    throw new Error('V147 factory detail requires world + buildings');
  }

  const root=new THREE.Group();
  root.name='FACTORY_UNIQUE_DETAIL_V147';
  root.userData={version:147,factoryCount:buildings.length};
  world.add(root);

  const mats={
    dark:new THREE.MeshStandardMaterial({color:0x354743,roughness:.62,metalness:.22}),
    steel:new THREE.MeshStandardMaterial({color:0x7f8d8a,roughness:.54,metalness:.30}),
    lightSteel:new THREE.MeshStandardMaterial({color:0xaab4b1,roughness:.58,metalness:.22}),
    glass:new THREE.MeshStandardMaterial({color:0x74a2ad,roughness:.14,metalness:.05,transparent:true,opacity:.72}),
    green:new THREE.MeshStandardMaterial({color:0x2d6650,roughness:.72}),
    blue:new THREE.MeshStandardMaterial({color:0x4f7897,roughness:.60,metalness:.12}),
    orange:new THREE.MeshStandardMaterial({color:0xc47a32,roughness:.70}),
    yellow:new THREE.MeshStandardMaterial({color:0xd6b13d,roughness:.74}),
    red:new THREE.MeshStandardMaterial({color:0xa7473f,roughness:.72}),
    white:new THREE.MeshStandardMaterial({color:0xe5e9e5,roughness:.76}),
    floorBlue:new THREE.MeshStandardMaterial({color:0x66899a,roughness:.92}),
    floorGreen:new THREE.MeshStandardMaterial({color:0x56866a,roughness:.92}),
    floorOrange:new THREE.MeshStandardMaterial({color:0xa57c50,roughness:.92}),
    pallet:new THREE.MeshStandardMaterial({color:0xa5784e,roughness:.92}),
    carton:new THREE.MeshStandardMaterial({color:0xb68b62,roughness:.94}),
    bag:new THREE.MeshStandardMaterial({color:0xe0e3dd,roughness:.88}),
    ink:new THREE.MeshStandardMaterial({color:0x5e6578,roughness:.70}),
    lab:new THREE.MeshStandardMaterial({color:0xd6dfdd,roughness:.68}),
    safety:new THREE.MeshStandardMaterial({color:0xe5c846,roughness:.72}),
    black:new THREE.MeshStandardMaterial({color:0x282d2c,roughness:.84})
  };

  const accentMats=[
    new THREE.MeshStandardMaterial({color:0x2e6b55,roughness:.68}),
    new THREE.MeshStandardMaterial({color:0x3e718d,roughness:.66}),
    new THREE.MeshStandardMaterial({color:0x8a684b,roughness:.70}),
    new THREE.MeshStandardMaterial({color:0x566b78,roughness:.68}),
    new THREE.MeshStandardMaterial({color:0x6b7552,roughness:.70}),
    new THREE.MeshStandardMaterial({color:0x765b6e,roughness:.70})
  ];

  const archetypes=factoryInteriors?.archetypes||[
    'film-blown-extrusion',
    'bag-converting',
    'printing-lamination',
    'warehouse-logistics',
    'recycling-compounding',
    'qc-packing'
  ];

  const records=[];
  let totalDetailMeshes=0;

  const shared={
    boxUnit:new THREE.BoxGeometry(1,1,1),
    cyl10:new THREE.CylinderGeometry(1,1,1,10),
    cyl16:new THREE.CylinderGeometry(1,1,1,16),
    pipe:new THREE.CylinderGeometry(1,1,1,8)
  };

  function profileFor(idx,g){
    const p=factoryInteriors?.factoryProfiles?.find?.(x=>x.index===idx);
    if(p)return p;
    const body=g.children.find(o=>
      o.isMesh&&o.geometry?.type==='BoxGeometry'&&
      o.geometry?.parameters?.height>4&&
      o.geometry?.parameters?.width>10&&
      o.geometry?.parameters?.depth>8
    );
    if(!body)return null;
    const prm=body.geometry.parameters;
    return {
      index:idx,
      archetype:archetypes[idx%archetypes.length],
      L:prm.width,D:prm.depth,H:prm.height
    };
  }

  function rngFor(idx){
    let seed=(147001+idx*104729)>>>0;
    return ()=>{
      seed=(seed*1664525+1013904223)>>>0;
      return seed/4294967296;
    };
  }

  function mark(o,idx,role='detail'){
    o.name=o.name||('V147_'+role.toUpperCase()+'_'+idx);
    o.userData=o.userData||{};
    o.userData.fpsNonSolid=true;
    o.userData.factoryDetailV147=true;
    o.userData.factoryIndex=idx;
    o.userData.role=role;
    return o;
  }

  function box(group,size,pos,mat,name,idx,rotY=0){
    const o=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);
    o.position.set(...pos);
    o.rotation.y=rotY;
    o.name=name;
    mark(o,idx,name);
    group.add(o);
    totalDetailMeshes++;
    return o;
  }

  function cylinder(group,r,h,pos,mat,name,idx,rotX=0,rotZ=0){
    const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),mat);
    o.position.set(...pos);
    o.rotation.x=rotX;
    o.rotation.z=rotZ;
    o.name=name;
    mark(o,idx,name);
    group.add(o);
    totalDetailMeshes++;
    return o;
  }

  function instancedBoxes(group,items,mat,name,idx){
    if(!items.length)return null;
    const mesh=new THREE.InstancedMesh(shared.boxUnit,mat,items.length);
    mesh.name=name;
    mesh.castShadow=false;
    mesh.receiveShadow=true;
    mesh.frustumCulled=true;
    mark(mesh,idx,name);
    const dummy=new THREE.Object3D();
    items.forEach((p,i)=>{
      dummy.position.set(p.x,p.y,p.z);
      dummy.rotation.set(0,p.rotY||0,0);
      dummy.scale.set(p.w,p.h,p.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    totalDetailMeshes++;
    return mesh;
  }

  function instancedCylinders(group,items,mat,name,idx,radial=10){
    if(!items.length)return null;
    const geo=radial===16?shared.cyl16:shared.cyl10;
    const mesh=new THREE.InstancedMesh(geo,mat,items.length);
    mesh.name=name;
    mesh.castShadow=false;
    mesh.receiveShadow=true;
    mesh.frustumCulled=true;
    mark(mesh,idx,name);
    const dummy=new THREE.Object3D();
    items.forEach((p,i)=>{
      dummy.position.set(p.x,p.y,p.z);
      dummy.rotation.set(p.rotX||0,p.rotY||0,p.rotZ||0);
      dummy.scale.set(p.r,p.h,p.r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    totalDetailMeshes++;
    return mesh;
  }

  function addFacadeSignature(exterior,idx,L,D,H,archetypeIndex,rnd){
    const accent=accentMats[archetypeIndex%accentMats.length];
    const side=idx%2===0?-1:1;
    const front=D/2+.19;

    // Every factory gets a different asymmetric accent composition.
    const stripeY=H*(.42+(idx%3)*.11);
    const stripeW=Math.min(L*.32,20+(idx%5)*3);
    box(exterior,[stripeW,.34,.16],[side*L*.23,stripeY,front],accent,'V147_FACADE_ACCENT',idx);

    const badgeW=4.6+(idx%4)*.7;
    box(exterior,[badgeW,1.25,.12],[-side*L*.30,H*.64,front+.03],mats.dark,'V147_WALL_BADGE',idx);
    box(exterior,[badgeW*.76,.16,.14],[-side*L*.30,H*.64,front+.12],accent,'V147_WALL_BADGE_BAR',idx);

    // Unique side utility rack - deliberately outside the central door/loading zone.
    const utilityX=side*(L/2+.75);
    const rackZ=((idx%5)-2)*Math.min(2.0,D*.08);
    const rackH=Math.min(4.4,H*.48);
    box(exterior,[1.2,rackH,4.2],[utilityX,rackH/2+.25,rackZ],mats.steel,'V147_SIDE_UTILITY_FRAME',idx);
    const pipeItems=[];
    for(let i=0;i<3+(idx%3);i++){
      pipeItems.push({
        x:utilityX+side*.72,
        y:1.0+i*.72,
        z:rackZ-1.55+i*.72,
        r:.07,h:3.4,rotX:Math.PI/2
      });
    }
    instancedCylinders(exterior,pipeItems,mats.lightSteel,'V147_SIDE_UTILITY_PIPES',idx);

    // Rooftop identity differs by archetype and factory index.
    const roofItems=[];
    const units=2+(idx%4);
    for(let i=0;i<units;i++){
      const x=(-.25+(i+.5)/units*.50)*L;
      const z=(side*.18+((i%2)*.12-.06))*D;
      roofItems.push({x,y:H+1.25,z,w:1.7+(i%2)*.4,h:.85,d:1.35+(idx%3)*.16});
    }
    instancedBoxes(exterior,roofItems,mats.steel,'V147_ROOF_TECH_UNITS',idx);

    // Corner exhaust/vent signature.
    const vents=[];
    for(let i=0;i<2+(idx%3);i++){
      vents.push({
        x:(-.30+i*.14)*L,
        y:H+1.6,
        z:-side*D*.27,
        r:.20+(i%2)*.04,
        h:1.8+(i%3)*.25
      });
    }
    instancedCylinders(exterior,vents,mats.dark,'V147_ROOF_VENTS',idx,16);
  }

  function addUniqueCommon(interior,idx,L,D,H,rnd){
    const sx=idx%2===0?-1:1;
    const sz=Math.floor(idx/2)%2===0?-1:1;
    const cornerX=sx*L*.31;
    const cornerZ=sz*D*.29;
    const mezzW=Math.min(12,L*.19);
    const mezzD=Math.min(7.5,D*.24);
    const mezzY=Math.min(4.0,H*.42);

    // Mezzanine/control deck in a different corner for every alternating factory.
    box(interior,[mezzW,.22,mezzD],[cornerX,mezzY,cornerZ],mats.lightSteel,'V147_MEZZANINE_DECK',idx);
    box(interior,[mezzW*.88,1.65,.08],[cornerX,mezzY+1.0,cornerZ-sz*mezzD*.5],mats.glass,'V147_MEZZANINE_GLASS',idx);
    const posts=[];
    for(const px of [-1,1])for(const pz of [-1,1]){
      posts.push({
        x:cornerX+px*mezzW*.43,y:mezzY*.5,z:cornerZ+pz*mezzD*.42,
        w:.10,h:mezzY,d:.10
      });
    }
    instancedBoxes(interior,posts,mats.dark,'V147_MEZZANINE_POSTS',idx);

    // Cross aisle location changes by index.
    const aisleX=(-.23+(idx%7)/6*.46)*L;
    box(interior,[1.45,.025,D*.72],[aisleX,.43,0],idx%2?mats.floorGreen:mats.floorBlue,'V147_CROSS_AISLE',idx);

    // Local maintenance cell.
    const maintX=-sx*L*.36;
    const maintZ=-sz*D*.29;
    box(interior,[5.2,.08,3.7],[maintX,.43,maintZ],mats.floorOrange,'V147_MAINTENANCE_PAD',idx);
    box(interior,[3.8,1.8,.55],[maintX,1.35,maintZ-sz*1.25],mats.dark,'V147_TOOL_WALL',idx);
    const tools=[];
    for(let i=0;i<6;i++){
      tools.push({
        x:maintX-1.45+i*.58,
        y:1.35+(i%2)*.38,
        z:maintZ-sz*1.58,
        w:.22,h:.42,d:.16
      });
    }
    instancedBoxes(interior,tools,i=>i,mats.orange,'V147_TOOL_MODULES',idx);

    // Fire/safety point placed deterministically away from the main door.
    const safeX=sx*L*.40;
    const safeZ=-sz*D*.36;
    box(interior,[1.35,1.85,.42],[safeX,1.25,safeZ],mats.red,'V147_FIRE_STATION',idx);
    box(interior,[1.55,.10,.62],[safeX,.46,safeZ],mats.safety,'V147_FIRE_ZONE',idx);

    // Overhead service bridge makes the ceiling read as an industrial system.
    const bridgeZ=((idx%5)-2)*D*.075;
    box(interior,[L*.58,.10,.72],[0,H*.64,bridgeZ],mats.steel,'V147_OVERHEAD_SERVICE_BRIDGE',idx);
  }

  function addFilmBlown(interior,idx,L,D,H,rnd){
    const side=idx%2===0?-1:1;
    const silos=[];
    const n=2+(idx%3);
    for(let i=0;i<n;i++){
      const x=(-.25+i/Math.max(1,n-1)*.50)*L;
      silos.push({x,y:2.2,z:side*D*.31,r:.72+(i%2)*.08,h:3.6});
    }
    instancedCylinders(interior,silos,mats.white,'V147_RESIN_DAY_SILOS',idx,16);

    const chillers=[];
    for(let i=0;i<2+(idx%2);i++){
      chillers.push({
        x:-side*L*.28+i*2.3,
        y:1.05,
        z:-side*D*.31,
        w:1.8,h:1.45,d:1.35
      });
    }
    instancedBoxes(interior,chillers,mats.blue,'V147_FILM_CHILLERS',idx);

    const rollStage=[];
    for(let i=0;i<4+(idx%4);i++){
      rollStage.push({
        x:THREE.MathUtils.lerp(-L*.22,L*.22,(i+.5)/(4+(idx%4))),
        y:.72,z:-side*D*.39,r:.56,h:1.1,rotZ:Math.PI/2
      });
    }
    instancedCylinders(interior,rollStage,mats.white,'V147_FILM_ROLL_STAGE',idx,16);
  }

  function addConverting(interior,idx,L,D,H,rnd){
    const side=idx%2===0?-1:1;
    const rollBins=[];
    const n=5+(idx%5);
    for(let i=0;i<n;i++){
      rollBins.push({
        x:THREE.MathUtils.lerp(-L*.32,L*.32,(i+.5)/n),
        y:.95,z:side*D*.36,w:1.6,h:1.55,d:1.25,rotY:(idx%3)*.08
      });
    }
    instancedBoxes(interior,rollBins,mats.lightSteel,'V147_CONVERTING_ROLL_RACKS',idx);

    const packing=[];
    for(let i=0;i<3+(idx%4);i++){
      packing.push({
        x:-side*L*.24+i*3.1,y:.88,z:-side*D*.31,w:2.4,h:1.10,d:1.05
      });
    }
    instancedBoxes(interior,packing,mats.green,'V147_PACKING_CELLS',idx);

    box(interior,[4.4,2.2,3.6],[side*L*.30,1.45,-side*D*.24],mats.lab,'V147_CONVERTING_QC_CELL',idx);
    box(interior,[3.4,1.1,.08],[side*L*.30,1.75,-side*D*.24-side*1.84],mats.glass,'V147_CONVERTING_QC_GLASS',idx);
  }

  function addPrinting(interior,idx,L,D,H,rnd){
    const side=idx%2===0?-1:1;
    box(interior,[7.5,2.9,5.1],[-side*L*.30,1.75,side*D*.28],mats.lab,'V147_INK_MIX_ROOM',idx);
    box(interior,[5.4,1.35,.08],[-side*L*.30,2.00,side*D*.28-side*2.58],mats.glass,'V147_INK_ROOM_GLASS',idx);

    const drums=[];
    for(let i=0;i<8+(idx%5);i++){
      drums.push({
        x:-side*L*.30-2.2+(i%4)*1.45,
        y:.60,
        z:side*D*.28-1.45+Math.floor(i/4)*1.45,
        r:.32,h:.82
      });
    }
    instancedCylinders(interior,drums,mats.ink,'V147_INK_DRUM_BANK',idx,16);

    // Cylinder rack orientation changes by factory.
    const rackItems=[];
    const n=6+(idx%4);
    for(let i=0;i<n;i++){
      rackItems.push({
        x:side*L*.30,
        y:1.0+(i%2)*.75,
        z:-D*.24+i/n*D*.48,
        w:2.6,h:.18,d:.34,
        rotY:Math.PI/2
      });
    }
    instancedBoxes(interior,rackItems,mats.dark,'V147_PRINT_CYLINDER_RACK',idx);

    box(interior,[L*.42,.18,.30],[0,H*.58,-side*D*.18],mats.steel,'V147_PRINT_EXHAUST_DUCT',idx);
  }

  function addWarehouse(interior,idx,L,D,H,rnd){
    const side=idx%2===0?-1:1;
    const staging=[];
    const rows=2+(idx%3);
    const cols=3+(idx%4);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      staging.push({
        x:side*L*.22+c*2.7-side*cols*1.35,
        y:.28,
        z:D*.26+r*1.8,
        w:2.15,h:.16,d:1.12
      });
    }
    instancedBoxes(interior,staging,mats.pallet,'V147_DISPATCH_PALLETS',idx);

    // Forklift charging / battery bay.
    const bayX=-side*L*.35;
    box(interior,[5.2,.08,4.1],[bayX,.43,-D*.32],mats.floorGreen,'V147_FORKLIFT_CHARGE_ZONE',idx);
    for(let i=0;i<3;i++){
      box(interior,[.72,1.45,.46],[bayX-1.6+i*1.6,1.20,-D*.39],mats.blue,'V147_CHARGER',idx);
    }

    const guards=[];
    for(let i=0;i<6+(idx%5);i++){
      guards.push({
        x:THREE.MathUtils.lerp(-L*.34,L*.34,(i+.5)/(6+(idx%5))),
        y:.72,z:-D*.28,w:.18,h:1.25,d:.18
      });
    }
    instancedBoxes(interior,guards,mats.safety,'V147_RACK_END_GUARDS',idx);
  }

  function addRecycling(interior,idx,L,D,H,rnd){
    const side=idx%2===0?-1:1;
    const bags=[];
    for(let i=0;i<5+(idx%4);i++){
      bags.push({
        x:THREE.MathUtils.lerp(-L*.28,L*.28,(i+.5)/(5+(idx%4))),
        y:.82,z:side*D*.37,w:1.25,h:1.5,d:1.25
      });
    }
    instancedBoxes(interior,bags,mats.bag,'V147_BIG_BAG_STAGE',idx);

    const tanks=[];
    for(let i=0;i<2+(idx%3);i++){
      tanks.push({
        x:-side*L*.28+i*2.6,
        y:1.45,z:-side*D*.27,r:.78,h:2.6
      });
    }
    instancedCylinders(interior,tanks,mats.blue,'V147_WASH_TANKS',idx,16);

    box(interior,[5.2,2.0,3.1],[side*L*.27,1.3,-side*D*.22],mats.dark,'V147_SHREDDER_FEED',idx);
    box(interior,[3.8,.48,1.25],[side*L*.20,.82,-side*D*.22],mats.steel,'V147_SORT_CONVEYOR',idx,(idx%2)*Math.PI/2);
  }

  function addQcPacking(interior,idx,L,D,H,rnd){
    const side=idx%2===0?-1:1;
    const labX=side*L*.28;
    const labZ=side*D*.27;
    box(interior,[9.0,3.0,5.8],[labX,1.8,labZ],mats.lab,'V147_QC_LAB_ROOM',idx);
    box(interior,[6.8,1.35,.08],[labX,2.02,labZ-side*2.94],mats.glass,'V147_QC_LAB_GLASS',idx);

    const pods=[];
    for(let i=0;i<4+(idx%4);i++){
      pods.push({
        x:-side*L*.22+i*3.0,
        y:.90,z:-side*D*.24,w:2.2,h:1.10,d:1.15
      });
    }
    instancedBoxes(interior,pods,mats.white,'V147_INSPECTION_PODS',idx);

    const finished=[];
    for(let i=0;i<4+(idx%5);i++){
      finished.push({
        x:THREE.MathUtils.lerp(-L*.28,L*.28,(i+.5)/(4+(idx%5))),
        y:.85,z:side*D*.38,w:1.9,h:1.45,d:1.05
      });
    }
    instancedBoxes(interior,finished,mats.carton,'V147_FINISHED_GOODS_STAGE',idx);
  }

  const archetypeBuilders=[
    addFilmBlown,
    addConverting,
    addPrinting,
    addWarehouse,
    addRecycling,
    addQcPacking
  ];

  for(let idx=0;idx<buildings.length;idx++){
    const building=buildings[idx];
    const profile=profileFor(idx,building);
    if(!profile)continue;

    const L=Number(profile.L),D=Number(profile.D),H=Number(profile.H);
    const archetypeIndex=Math.max(0,archetypes.indexOf(profile.archetype));
    const rnd=rngFor(idx);

    const exterior=new THREE.Group();
    exterior.name='V147_FACTORY_EXTERIOR_'+idx;
    exterior.userData={factoryIndex:idx,archetype:profile.archetype,layer:'exterior',fpsNonSolid:true};
    building.add(exterior);

    const interior=new THREE.Group();
    interior.name='V147_FACTORY_INTERIOR_DETAIL_'+idx;
    interior.userData={factoryIndex:idx,archetype:profile.archetype,layer:'interior',fpsNonSolid:true};
    building.add(interior);

    addFacadeSignature(exterior,idx,L,D,H,archetypeIndex,rnd);
    addUniqueCommon(interior,idx,L,D,H,rnd);
    archetypeBuilders[archetypeIndex]?.(interior,idx,L,D,H,rnd);

    // Each index gets a compact deterministic prop signature in a unique quadrant.
    const propSideX=idx%2===0?-1:1;
    const propSideZ=Math.floor(idx/2)%2===0?-1:1;
    const props=[];
    const propN=3+(idx%6);
    for(let i=0;i<propN;i++){
      props.push({
        x:propSideX*(L*.08+i*1.35),
        y:.70+(i%2)*.18,
        z:propSideZ*(D*.10+(i%3)*1.15),
        w:.82+(i%3)*.16,
        h:1.05+(i%2)*.35,
        d:.76+(idx%3)*.10,
        rotY:(idx%5)*.12
      });
    }
    instancedBoxes(interior,props,idx%2?mats.bin||mats.green:mats.carton,'V147_LAYOUT_SIGNATURE_PROPS',idx);

    const signature=[
      String(idx+1).padStart(2,'0'),
      profile.archetype,
      idx%2?'R':'L',
      Math.floor(idx/2)%2?'N':'S',
      'V'+(1+Math.floor(idx/archetypes.length))
    ].join('-');

    records.push({
      index:idx,
      archetype:profile.archetype,
      signature,
      L,D,H,
      exterior,
      interior
    });

    building.userData.factoryDetailV147={
      index:idx,
      archetype:profile.archetype,
      signature,
      version:147
    };
  }

  let enabled=true;
  let frame=0;

  function setVisible(v){
    enabled=!!v;
    root.visible=enabled;
    for(const rec of records){
      rec.exterior.visible=enabled;
      rec.interior.visible=enabled;
    }
  }

  function update(dt,{fpsMode=false,cutaway=false}={}){
    if(!enabled||!camera)return;
    if((frame++%8)!==0)return;

    for(const rec of records){
      rec.building?.updateWorldMatrix?.(true,false);
      const building=buildings[rec.index];
      const dx=camera.position.x-building.position.x;
      const dz=camera.position.z-building.position.z;
      const distSq=dx*dx+dz*dz;

      // Exterior architecture remains readable in normal 3D views.
      rec.exterior.visible=distSq<1200*1200;

      // Detailed interiors are expensive and invisible through opaque shells.
      // Render all only for explicit cutaway; otherwise keep the near factories.
      const interiorRange=fpsMode?300:cutaway?5000:520;
      rec.interior.visible=distSq<interiorRange*interiorRange;
    }
  }

  const stats={
    factories:records.length,
    detailMeshes:totalDetailMeshes,
    archetypes:archetypes.slice(),
    uniqueSignatures:records.map(r=>r.signature)
  };

  const api={
    ready:true,
    version:147,
    root,
    records,
    stats,
    update,
    setVisible,
    get factoryProfiles(){
      return records.map(r=>({
        index:r.index,
        archetype:r.archetype,
        signature:r.signature,
        L:Number(r.L.toFixed(1)),
        D:Number(r.D.toFixed(1)),
        H:Number(r.H.toFixed(1))
      }));
    }
  };

  window.__DALOC_FACTORY_DETAIL_V147=api;
  console.info('[DaLoc] V147 unique factory detail installed',stats);
  return api;
}
