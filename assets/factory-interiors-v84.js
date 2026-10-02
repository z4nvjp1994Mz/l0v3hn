import * as THREE from 'three';

// V139 factory interior + interaction pass.
// Keeps source-locked factory footprints, adds six deterministic interior archetypes,
// interactive personnel doors, dense but lightweight detail, and FPS-safe metadata.
export function installFactoryInteriorsV84({world,buildings}){
  const controller=new THREE.Group();
  controller.name='FACTORY_INTERIORS_V139';
  controller.userData={version:139,factoryCount:buildings.length};
  world.add(controller);

  const mats={
    floor:new THREE.MeshStandardMaterial({color:0xbfc5c0,roughness:.92}),
    aisle:new THREE.MeshStandardMaterial({color:0x3f8758,roughness:.82}),
    safety:new THREE.MeshStandardMaterial({color:0xe4c64f,roughness:.78}),
    column:new THREE.MeshStandardMaterial({color:0xc7ccca,roughness:.76,metalness:.08}),
    machine:new THREE.MeshStandardMaterial({color:0x78928b,roughness:.62,metalness:.16}),
    machine2:new THREE.MeshStandardMaterial({color:0x557772,roughness:.58,metalness:.18}),
    dark:new THREE.MeshStandardMaterial({color:0x455752,roughness:.58,metalness:.22}),
    conveyor:new THREE.MeshStandardMaterial({color:0x687672,roughness:.66,metalness:.18}),
    rack:new THREE.MeshStandardMaterial({color:0x62727a,roughness:.68,metalness:.20}),
    pallet:new THREE.MeshStandardMaterial({color:0xa8794d,roughness:.90}),
    carton:new THREE.MeshStandardMaterial({color:0xb98b5e,roughness:.94}),
    office:new THREE.MeshStandardMaterial({color:0xd9dedb,roughness:.76}),
    glass:new THREE.MeshStandardMaterial({color:0x7ea5b0,roughness:.12,metalness:.04,transparent:true,opacity:.68}),
    light:new THREE.MeshStandardMaterial({color:0xfff1b2,emissive:0xffe595,emissiveIntensity:.72,roughness:.38}),
    door:new THREE.MeshStandardMaterial({color:0x263f42,roughness:.48,metalness:.18}),
    doorGlass:new THREE.MeshStandardMaterial({color:0x79a7b0,roughness:.12,transparent:true,opacity:.72}),
    forklift:new THREE.MeshStandardMaterial({color:0xe0ad2f,roughness:.62}),
    tire:new THREE.MeshStandardMaterial({color:0x242626,roughness:.92}),
    roll:new THREE.MeshStandardMaterial({color:0xe9ece8,roughness:.72}),
    rollCore:new THREE.MeshStandardMaterial({color:0x9a744f,roughness:.84}),
    pipe:new THREE.MeshStandardMaterial({color:0x8b9795,roughness:.48,metalness:.25}),
    blue:new THREE.MeshStandardMaterial({color:0x537a9c,roughness:.58,metalness:.15}),
    red:new THREE.MeshStandardMaterial({color:0xa84b43,roughness:.70}),
    yellow:new THREE.MeshStandardMaterial({color:0xd4ac38,roughness:.72}),
    drum:new THREE.MeshStandardMaterial({color:0x52738b,roughness:.67,metalness:.10}),
    bin:new THREE.MeshStandardMaterial({color:0x60796a,roughness:.80}),
    cable:new THREE.MeshStandardMaterial({color:0x4f5554,roughness:.70,metalness:.12})
  };

  const archetypes=[
    'film-blown-extrusion',
    'bag-converting',
    'printing-lamination',
    'warehouse-logistics',
    'recycling-compounding',
    'qc-packing'
  ];

  const interiors=[];
  const portals=[];
  const shellMeshes=[];
  const doors=[];
  const failedFactories=[];
  const factoryProfiles=[];

  function markNonSolid(o){
    o.userData=o.userData||{};
    o.userData.fpsNonSolid=true;
    return o;
  }
  function markWalkable(o){
    o.userData=o.userData||{};
    o.userData.walkable=true;
    o.userData.fpsNonSolid=true;
    return o;
  }
  function localToWorld(g,v){
    g.updateWorldMatrix(true,false);
    return g.localToWorld(v.clone());
  }
  function cloneMaterialSafe(material){
    if(Array.isArray(material))return material.map(m=>m?.clone?.()||m);
    return material?.clone?.()||material;
  }
  function addBox(group,size,pos,mat,name,{solid=true,rotY=0}={}){
    const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);
    m.position.set(...pos);
    m.rotation.y=rotY;
    m.name=name;
    if(!solid)markNonSolid(m);
    group.add(m);
    return m;
  }
  function addCylinder(group,rTop,rBottom,h,pos,mat,name,{solid=true,radial=14,rotZ=0,rotX=0}={}){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,radial),mat);
    m.position.set(...pos);
    m.rotation.x=rotX;
    m.rotation.z=rotZ;
    m.name=name;
    if(!solid)markNonSolid(m);
    group.add(m);
    return m;
  }
  function addForklift(group,x,z,rot=0,tag=''){
    const fg=new THREE.Group();
    fg.name='V139_FORKLIFT_'+tag;
    fg.position.set(x,.26,z);fg.rotation.y=rot;
    const body=addBox(fg,[1.25,.72,1.70],[0,.58,0],mats.forklift,'FORKLIFT_BODY');
    const mast=addBox(fg,[.16,1.75,.16],[0,1.05,.92],mats.dark,'FORKLIFT_MAST');
    addBox(fg,[.12,.10,1.05],[-.28,.16,1.35],mats.dark,'FORKLIFT_FORK_L');
    addBox(fg,[.12,.10,1.05],[.28,.16,1.35],mats.dark,'FORKLIFT_FORK_R');
    for(const sx of [-.66,.66])for(const sz of [-.56,.56]){
      addCylinder(fg,.22,.22,.16,[sx,.24,sz],mats.tire,'FORKLIFT_WHEEL',{radial:10,rotZ:Math.PI/2});
    }
    group.add(fg);
    return fg;
  }
  function addRollStand(group,x,z,rot=0,scale=1){
    const rg=new THREE.Group();rg.position.set(x,.3,z);rg.rotation.y=rot;rg.name='V139_ROLL_STAND';
    addBox(rg,[1.5*scale,.14,.70*scale],[0,.12,0],mats.dark,'ROLL_FRAME');
    const roll=addCylinder(rg,.62*scale,.62*scale,1.22*scale,[0,.78,0],mats.roll,'MATERIAL_ROLL',{radial:20,rotZ:Math.PI/2});
    addCylinder(rg,.16*scale,.16*scale,1.28*scale,[0,.78,0],mats.rollCore,'ROLL_CORE',{radial:12,rotZ:Math.PI/2});
    group.add(rg);return rg;
  }
  function addWorktable(group,x,z,w=2.4,d=1.0){
    const g=new THREE.Group();g.position.set(x,0,z);g.name='V139_WORKTABLE';
    addBox(g,[w,.10,d],[0,.92,0],mats.machine2,'TABLE_TOP');
    for(const sx of [-w*.42,w*.42])for(const sz of [-d*.36,d*.36]){
      addBox(g,[.08,.88,.08],[sx,.44,sz],mats.dark,'TABLE_LEG');
    }
    group.add(g);return g;
  }
  function addPalletStack(group,x,z,levels=2,scale=1){
    const g=new THREE.Group();g.position.set(x,0,z);g.name='V139_PALLET_STACK';
    for(let i=0;i<levels;i++){
      addBox(g,[2.2*scale,.18,1.15*scale],[0,.16+i*.74,0],mats.pallet,'PALLET');
      addBox(g,[1.95*scale,.52,1.02*scale],[0,.50+i*.74,0],mats.carton,'CARTON_BLOCK');
    }
    group.add(g);return g;
  }
  function addOverheadUtility(group,L,D,H,idx){
    const z=((idx%3)-1)*D*.18;
    const tray=addBox(group,[L*.72,.10,.42],[0,H*.67,z],mats.cable,'V139_CABLE_TRAY',{solid:false});
    for(let i=0;i<Math.max(3,Math.floor(L/22));i++){
      const x=THREE.MathUtils.lerp(-L*.32,L*.32,(i+.5)/Math.max(3,Math.floor(L/22)));
      addCylinder(group,.11,.11,D*.42,[x,H*.62,0],mats.pipe,'V139_OVERHEAD_PIPE',{solid:false,radial:10,rotX:Math.PI/2});
    }
  }
  function addCommonStructure(interior,L,D,H,idx){
    const floor=addBox(interior,[L*.94,.12,D*.88],[0,.31,0],mats.floor,'V139_INTERIOR_FLOOR',{solid:false});
    markWalkable(floor);

    const aisleCount=D>28?3:2;
    for(let i=0;i<aisleCount;i++){
      const z=THREE.MathUtils.lerp(-D*.26,D*.26,(i+.5)/aisleCount);
      const aisle=addBox(interior,[L*.88,.035,1.55],[0,.39,z],mats.aisle,'V139_PEDESTRIAN_AISLE',{solid:false});
      markWalkable(aisle);
      for(const dz of [-.86,.86]){
        addBox(interior,[L*.88,.04,.07],[0,.415,z+dz],mats.safety,'V139_SAFETY_STRIPE',{solid:false});
      }
    }

    const xN=Math.max(4,Math.min(12,Math.round(L/15)));
    const zRows=D>24?3:2;
    const columnGeo=new THREE.CylinderGeometry(.22,.28,H*.86,8);
    const columns=new THREE.InstancedMesh(columnGeo,mats.column,xN*zRows);
    columns.name='V139_STRUCTURE_COLUMNS';
    const dummy=new THREE.Object3D();let ci=0;
    for(let xi=0;xi<xN;xi++){
      const x=THREE.MathUtils.lerp(-L*.40,L*.40,xi/Math.max(1,xN-1));
      for(let zi=0;zi<zRows;zi++){
        const z=THREE.MathUtils.lerp(-D*.32,D*.32,zi/Math.max(1,zRows-1));
        dummy.position.set(x,H*.43+.36,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();
        columns.setMatrixAt(ci++,dummy.matrix);
      }
    }
    columns.instanceMatrix.needsUpdate=true;interior.add(columns);

    const lightN=Math.max(6,Math.min(18,Math.round(L/9)));
    for(let i=0;i<lightN;i++){
      const x=THREE.MathUtils.lerp(-L*.42,L*.42,(i+.5)/lightN);
      for(const z of [-D*.22,0,D*.22]){
        addBox(interior,[2.4,.08,.28],[x,H*.78,z],mats.light,'V139_OVERHEAD_LIGHT',{solid:false});
      }
    }
    addOverheadUtility(interior,L,D,H,idx);

    const officeW=Math.min(9,L*.16),officeD=Math.min(6,D*.20);
    addBox(interior,[officeW,3.1,officeD],[-L*.36,1.86,D*.31],mats.office,'V139_CONTROL_OFFICE');
    addBox(interior,[officeW*.72,1.25,.08],[-L*.36,2.10,D*.31-officeD/2-.06],mats.glass,'V139_OFFICE_GLASS',{solid:false});
  }

  function buildFilmBlown(interior,L,D,H,idx){
    const n=Math.max(4,Math.min(10,Math.round(L/14)));
    for(let i=0;i<n;i++){
      const x=THREE.MathUtils.lerp(-L*.34,L*.34,(i+.5)/n);
      const z=(i%2?-.14:.14)*D;
      addBox(interior,[2.6,2.2,2.4],[x,1.45,z],mats.machine,'EXTRUDER_BASE');
      addCylinder(interior,.82,.60,2.7,[x,3.75,z],mats.machine2,'EXTRUDER_TOWER',{radial:16});
      addCylinder(interior,.78,.22,1.4,[x,5.70,z],mats.blue,'RESIN_HOPPER',{radial:16});
      addRollStand(interior,x,z+(z<0?3.2:-3.2),0,.92);
    }
    for(const z of [-D*.06,D*.06]) addBox(interior,[L*.70,.46,.70],[0,.72,z],mats.conveyor,'EXTRUSION_CONVEYOR');
  }
  function buildConverting(interior,L,D,H,idx){
    const n=Math.max(5,Math.min(13,Math.round(L/11)));
    for(let row=0;row<2;row++){
      const z=row===0?-D*.13:D*.13;
      for(let i=0;i<n;i++){
        const x=THREE.MathUtils.lerp(-L*.37,L*.37,(i+.5)/n);
        addBox(interior,[3.4,1.75,2.15],[x,1.20,z],i%3===0?mats.blue:mats.machine,'CONVERTING_MACHINE');
        addBox(interior,[.48,.82,.36],[x+1.48,.95,z+1.15],mats.dark,'CONTROL_PANEL');
        if(i%2===0)addRollStand(interior,x-1.0,z+(row?2.8:-2.8),Math.PI/2,.70);
      }
    }
    addBox(interior,[L*.78,.42,.62],[0,.68,0],mats.conveyor,'PACKING_CONVEYOR');
  }
  function buildPrinting(interior,L,D,H,idx){
    const lineN=D>28?3:2;
    for(let r=0;r<lineN;r++){
      const z=THREE.MathUtils.lerp(-D*.25,D*.25,(r+.5)/lineN);
      addBox(interior,[L*.60,2.30,3.0],[L*.03,1.50,z],r%2?mats.blue:mats.machine2,'PRINT_LAMINATION_LINE');
      const cylN=Math.max(4,Math.min(10,Math.floor(L/12)));
      for(let i=0;i<cylN;i++){
        const x=THREE.MathUtils.lerp(-L*.25,L*.30,(i+.5)/cylN);
        addCylinder(interior,.42,.42,2.3,[x,1.55,z-1.52],mats.dark,'PRINT_CYLINDER',{radial:18,rotZ:Math.PI/2});
      }
      for(let i=0;i<4;i++){
        addCylinder(interior,.34,.34,.72,[-L*.32+i*.82,.72,z+2.35],mats.drum,'INK_DRUM',{radial:14});
      }
    }
    addWorktable(interior,-L*.24,D*.33,3.8,1.3);
    addWorktable(interior,-L*.10,D*.33,3.8,1.3);
  }
  function buildWarehouse(interior,L,D,H,idx){
    const rows=Math.max(3,Math.min(6,Math.floor(D/6)));
    const bays=Math.max(5,Math.min(14,Math.floor(L/7)));
    for(let r=0;r<rows;r++){
      const z=THREE.MathUtils.lerp(-D*.34,D*.14,(r+.5)/rows);
      for(let i=0;i<bays;i++){
        const x=THREE.MathUtils.lerp(-L*.38,L*.38,(i+.5)/bays);
        addBox(interior,[2.8,3.8,1.15],[x,2.20,z],mats.rack,'WAREHOUSE_RACK');
        if((i+r)%2===0)addPalletStack(interior,x,z+1.25,2,.82);
      }
    }
    addForklift(interior,L*.22,D*.27,Math.PI,'W1');
    addForklift(interior,-L*.20,D*.22,0,'W2');
  }
  function buildRecycling(interior,L,D,H,idx){
    const n=Math.max(4,Math.min(9,Math.floor(L/13)));
    for(let i=0;i<n;i++){
      const x=THREE.MathUtils.lerp(-L*.34,L*.34,(i+.5)/n);
      const z=(i%2?-.12:.12)*D;
      addBox(interior,[3.4,2.0,2.8],[x,1.30,z],mats.dark,'GRANULATOR');
      addCylinder(interior,1.05,.55,2.1,[x,3.30,z],mats.bin,'MATERIAL_HOPPER',{radial:16});
      if(i%2===0)addBox(interior,[2.2,1.25,2.0],[x+2.9,.95,z],mats.blue,'COMPOUNDING_UNIT');
    }
    for(let i=0;i<Math.max(5,Math.floor(L/11));i++){
      const x=THREE.MathUtils.lerp(-L*.36,L*.36,(i+.5)/Math.max(5,Math.floor(L/11)));
      addBox(interior,[1.5,1.25,1.5],[x,.95,-D*.31],mats.bin,'SORTING_BIN');
    }
    addForklift(interior,L*.25,D*.25,-Math.PI/2,'R1');
  }
  function buildQcPacking(interior,L,D,H,idx){
    const rows=3,cols=Math.max(4,Math.min(10,Math.floor(L/9)));
    for(let r=0;r<rows;r++){
      const z=THREE.MathUtils.lerp(-D*.24,D*.18,(r+.5)/rows);
      for(let i=0;i<cols;i++){
        const x=THREE.MathUtils.lerp(-L*.34,L*.34,(i+.5)/cols);
        addWorktable(interior,x,z,2.8,1.05);
        if((i+r)%2===0)addBox(interior,[.62,.48,.50],[x+.85,1.22,z],mats.blue,'QC_INSTRUMENT');
        if((i+r)%3===0)addPalletStack(interior,x,z+1.45,1,.62);
      }
    }
    addBox(interior,[L*.66,.42,.68],[0,.70,-D*.32],mats.conveyor,'FINAL_PACKING_CONVEYOR');
    for(let i=0;i<Math.max(4,Math.floor(L/13));i++){
      const x=THREE.MathUtils.lerp(-L*.30,L*.30,(i+.5)/Math.max(4,Math.floor(L/13)));
      addBox(interior,[2.4,2.8,1.0],[x,1.70,D*.32],mats.rack,'PACKAGING_SHELF');
    }
  }

  const builders=[
    buildFilmBlown,
    buildConverting,
    buildPrinting,
    buildWarehouse,
    buildRecycling,
    buildQcPacking
  ];

  function setMaterialAlpha(material,alpha){
    const list=Array.isArray(material)?material:[material];
    for(const m of list){
      if(!m)continue;
      m.visible=true;
      m.transparent=alpha<.999;
      m.opacity=alpha;
      m.depthWrite=alpha>=.999;
      m.needsUpdate=true;
    }
  }

  function hideSourceBodyMaterial(material){
    const list=Array.isArray(material)?material:[material];
    for(const m of list){
      if(!m)continue;
      m.visible=false;
      m.depthWrite=false;
      m.needsUpdate=true;
    }
  }

  function makeVisualFactoryShell(g,body,idx,L,D,H){
    const shell=new THREE.Group();
    shell.name='V1395_FACTORY_VISUAL_SHELL_'+idx;
    shell.position.copy(body.position);
    shell.quaternion.copy(body.quaternion);
    shell.scale.copy(body.scale);
    shell.userData={
      factoryVisualShell:true,
      factoryIndex:idx,
      fpsNonSolid:true
    };

    const wallMaterial=cloneMaterialSafe(body.material);
    const t=.28;
    const doorWidth=2.8;
    const doorHalf=doorWidth*.5;
    const doorOpeningH=3.62;
    const halfL=L*.5;
    const halfD=D*.5;

    const addWall=(size,pos,name)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(...size),wallMaterial);
      m.position.set(...pos);
      m.name=name;
      m.castShadow=true;
      m.receiveShadow=true;
      m.userData={fpsNonSolid:true,factoryVisualShell:true,factoryIndex:idx};
      shell.add(m);
      return m;
    };

    // Side and rear walls.
    addWall([t,H,D],[-halfL+t*.5,0,0],'V1395_SHELL_LEFT_'+idx);
    addWall([t,H,D],[halfL-t*.5,0,0],'V1395_SHELL_RIGHT_'+idx);
    addWall([Math.max(.2,L-2*t),H,t],[0,0,-halfD+t*.5],'V1395_SHELL_REAR_'+idx);

    // Front facade split around the real personnel doorway.
    const sideWidth=Math.max(.2,halfL-doorHalf-t);
    if(sideWidth>.21){
      const leftCenter=-(doorHalf+sideWidth*.5);
      const rightCenter=(doorHalf+sideWidth*.5);
      addWall([sideWidth,H,t],[leftCenter,0,halfD-t*.5],'V1395_SHELL_FRONT_L_'+idx);
      addWall([sideWidth,H,t],[rightCenter,0,halfD-t*.5],'V1395_SHELL_FRONT_R_'+idx);
    }

    // Header closes the facade above the doorway while leaving the opening below.
    const headerH=Math.max(.25,H-doorOpeningH);
    const headerY=-H*.5+doorOpeningH+headerH*.5;
    addWall([doorWidth,headerH,t],[0,headerY,halfD-t*.5],'V1395_SHELL_DOOR_HEADER_'+idx);

    g.add(shell);
    hideSourceBodyMaterial(body.material);

    return {group:shell,material:wallMaterial};
  }

  function makeInteractiveDoor(g,idx,L,D,H){
    const width=2.8,height=3.35;
    const pivot=new THREE.Group();
    pivot.name='V139_FACTORY_DOOR_PIVOT_'+idx;
    pivot.position.set(-width/2,0,D/2+.145);
    pivot.userData={fpsInteractiveDoor:true,ignoreFpsCollision:true,factoryIndex:idx};
    g.add(pivot);

    const panel=addBox(pivot,[width,height,.12],[width/2,1.92,0],mats.door,'V139_FACTORY_DOOR_PANEL_'+idx,{solid:false});
    panel.userData.fpsInteractiveDoor=true;
    addBox(pivot,[1.88,2.32,.05],[width/2,1.96,.07],mats.doorGlass,'V139_FACTORY_DOOR_GLASS_'+idx,{solid:false});
    addBox(g,[4.4,.18,1.65],[0,3.68,D/2+.78],mats.dark,'V139_FACTORY_DOOR_CANOPY',{solid:false});

    const door={
      index:doors.length,
      factoryIndex:idx,
      building:g,
      pivot,
      width,height,L,D,H,
      swingSign:idx%2===0?-1:1,
      openAmount:0,
      targetOpen:0,
      isOpen:false,
      outsideLocal:new THREE.Vector3(0,.10,D/2+1.55),
      insideLocal:new THREE.Vector3(0,.10,D/2-2.10),
      centerLocal:new THREE.Vector3(0,1.65,D/2+.15)
    };
    doors.push(door);
    return door;
  }

  buildings.forEach((g,idx)=>{
    try{
      const body=g.children.find(o=>
        o.isMesh &&
        o.geometry?.type==='BoxGeometry' &&
        o.geometry?.parameters?.height>4 &&
        o.geometry?.parameters?.width>10 &&
        o.geometry?.parameters?.depth>8
      );
      if(!body)return;
      const {width:L,height:H,depth:D}=body.geometry.parameters;

      body.material=cloneMaterialSafe(body.material);
      const visualShell=makeVisualFactoryShell(g,body,idx,L,D,H);
      const roofCandidates=g.children.filter(o=>
        o.isMesh &&
        o.geometry?.type==='BoxGeometry' &&
        o.geometry?.parameters?.height<1.0 &&
        o.geometry?.parameters?.width>L*.45 &&
        o.position.y>H
      );
      roofCandidates.forEach(m=>{m.material=cloneMaterialSafe(m.material);});

      const shellRecord={
        index:idx,
        body,
        visualShell,
        roofs:roofCandidates,
        bodyOpacity:1,
        doorReveal:false
      };
      shellMeshes.push(shellRecord);

      const interior=new THREE.Group();
      interior.name='V139_FACTORY_INTERIOR_'+idx;
      const archetypeIndex=idx%archetypes.length;
      interior.userData={
        factoryIndex:idx,L,D,H,
        archetype:archetypes[archetypeIndex],
        detailVariant:Math.floor(idx/archetypes.length)
      };
      g.add(interior);
      interiors.push(interior);

      addCommonStructure(interior,L,D,H,idx);
      builders[archetypeIndex](interior,L,D,H,idx);

      // Deterministic extra density so no two same-type factories are identical.
      const extra=2+(idx%4);
      for(let i=0;i<extra;i++){
        const x=THREE.MathUtils.lerp(-L*.27,L*.27,(i+.5)/extra);
        const z=((idx+i)%2?1:-1)*D*.36;
        if((idx+i)%3===0)addPalletStack(interior,x,z,1+(i%2),.72+(idx%3)*.05);
        else addBox(interior,[1.1,1.4,1.0],[x,.95,z],(i%2?mats.bin:mats.carton),'V139_VARIANT_PROP');
      }

      if(idx%2===0&&archetypeIndex!==3)addForklift(interior,L*.22,D*.05,Math.PI/2,'A'+idx);
      if(idx%5===0&&archetypeIndex!==3)addForklift(interior,-L*.18,-D*.24,-Math.PI/2,'B'+idx);

      const door=makeInteractiveDoor(g,idx,L,D,H);

      const entranceLocal=new THREE.Vector3(0,.10,D/2+1.55);
      const yardLocal=new THREE.Vector3(0,.10,D/2+5.2);
      const insideNearLocal=new THREE.Vector3(0,.10,D/2-2.4);
      const insideMidLocal=new THREE.Vector3(L*.10,.10,0);
      const insideFarLocal=new THREE.Vector3(-L*.12,.10,-D*.22);
      const patrolLocal=[
        new THREE.Vector3(-L*.30,.10,D/2+3.8),
        new THREE.Vector3(L*.30,.10,D/2+3.8),
        new THREE.Vector3(L*.30,.10,D/2+7.3),
        new THREE.Vector3(-L*.30,.10,D/2+7.3)
      ];

      const portal={
        index:idx,
        building:g,
        L,D,H,
        archetype:archetypes[archetypeIndex],
        doorIndex:door.index,
        entranceWorld:localToWorld(g,entranceLocal),
        yardWorld:localToWorld(g,yardLocal),
        insideNearWorld:localToWorld(g,insideNearLocal),
        insideMidWorld:localToWorld(g,insideMidLocal),
        insideFarWorld:localToWorld(g,insideFarLocal),
        patrolWorld:patrolLocal.map(v=>localToWorld(g,v))
      };
      portals.push(portal);
      g.userData.factoryV84=portal;
      g.userData.factoryInteriorArchetype=portal.archetype;
      factoryProfiles.push({
        index:idx,
        archetype:portal.archetype,
        L:Number(L.toFixed(1)),
        D:Number(D.toFixed(1)),
        H:Number(H.toFixed(1))
      });
    }catch(error){
      console.error('[DaLoc] V139 factory interior failed for building',idx,error);
      failedFactories.push({index:idx,message:error?.message||String(error)});
    }
  });

  let cutaway=false;
  let visible=true;

  function applyShellVisual(record){
    // V139.5: opening a door must never make the whole factory transparent.
    // The original solid body remains render-hidden for collision metadata, while
    // the replacement visual shell contains a physical doorway opening.
    hideSourceBodyMaterial(record.body.material);
    setMaterialAlpha(record.visualShell?.material,cutaway?.20:1);
    record.roofs.forEach((m,i)=>{
      const a=cutaway?(i===0?.08:.11):1;
      setMaterialAlpha(m.material,a);
    });
  }
  function setVisible(v){
    visible=!!v;
    interiors.forEach(g=>g.visible=visible);
  }
  function setCutaway(v){
    cutaway=!!v;
    shellMeshes.forEach(applyShellVisual);
  }
  function setFactoryReveal(factoryIndex,v){
    const rec=shellMeshes.find(x=>x.index===factoryIndex);
    if(!rec)return;
    // Compatibility state only. Door opening no longer alters wall opacity.
    rec.doorReveal=!!v;
  }
  function setDoorOpen(index,v){
    const d=doors[index];
    if(!d)return false;
    d.targetOpen=v?1:0;
    d.isOpen=!!v;
    setFactoryReveal(d.factoryIndex,d.isOpen);
    return true;
  }
  function toggleDoor(index){
    const d=doors[index];
    if(!d)return false;
    return setDoorOpen(index,!d.isOpen);
  }
  function update(dt){
    const k=Math.min(1,Math.max(0,dt)*7.5);
    for(const d of doors){
      d.openAmount+=(d.targetOpen-d.openAmount)*k;
      if(Math.abs(d.targetOpen-d.openAmount)<.002)d.openAmount=d.targetOpen;
      d.pivot.rotation.y=d.swingSign*d.openAmount*Math.PI*.48;
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
      factoryIndex:d.factoryIndex,
      width:d.width
    };
  }

  const api={
    ready:true,version:139.5,controller,interiors,portals,doors,failedFactories,
    factoryProfiles,
    factoryCount:interiors.length,
    archetypes,
    setVisible,setCutaway,setFactoryReveal,setDoorOpen,toggleDoor,update,doorWorldInfo,
    get cutaway(){return cutaway;}
  };
  window.__DALOC_FACTORY_INTERIORS_V84=api;

  console.info('[DaLoc] V139.5 opaque factory walls with real visual door openings installed',{
    factories:interiors.length,
    portals:portals.length,
    doors:doors.length,
    archetypes,
    failed:failedFactories.length
  });

  return api;
}
