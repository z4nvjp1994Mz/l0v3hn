import * as THREE from 'three';

// V84 factory interior pass.
// Adds production-floor detail to every source-locked factory footprint and exports
// pedestrian-safe portals/yard patrol points. Detail View can switch the shell to cutaway.
export function installFactoryInteriorsV84({world,buildings}){
  const controller=new THREE.Group();
  controller.name='FACTORY_INTERIORS_V84';
  controller.userData={version:84,factoryCount:buildings.length};
  world.add(controller);

  const floorMat=new THREE.MeshStandardMaterial({color:0xbfc5c0,roughness:.92});
  const aisleMat=new THREE.MeshStandardMaterial({color:0x3f8758,roughness:.82});
  const safetyMat=new THREE.MeshStandardMaterial({color:0xe4c64f,roughness:.78});
  const columnMat=new THREE.MeshStandardMaterial({color:0xc7ccca,roughness:.76,metalness:.08});
  const machineMat=new THREE.MeshStandardMaterial({color:0x78928b,roughness:.62,metalness:.16});
  const machineDarkMat=new THREE.MeshStandardMaterial({color:0x455752,roughness:.58,metalness:.22});
  const conveyorMat=new THREE.MeshStandardMaterial({color:0x687672,roughness:.66,metalness:.18});
  const rackMat=new THREE.MeshStandardMaterial({color:0x62727a,roughness:.68,metalness:.20});
  const palletMat=new THREE.MeshStandardMaterial({color:0xa8794d,roughness:.90});
  const officeMat=new THREE.MeshStandardMaterial({color:0xd9dedb,roughness:.76});
  const officeGlassMat=new THREE.MeshStandardMaterial({color:0x7ea5b0,roughness:.12,metalness:.04,transparent:true,opacity:.68});
  const lightMat=new THREE.MeshStandardMaterial({color:0xfff1b2,emissive:0xffe595,emissiveIntensity:.72,roughness:.38});
  const doorMat=new THREE.MeshStandardMaterial({color:0x263f42,roughness:.48,metalness:.18});
  const doorGlassMat=new THREE.MeshStandardMaterial({color:0x79a7b0,roughness:.12,transparent:true,opacity:.72});
  const forkliftMat=new THREE.MeshStandardMaterial({color:0xe0ad2f,roughness:.62});
  const tireMat=new THREE.MeshStandardMaterial({color:0x242626,roughness:.92});

  const interiors=[];
  const portals=[];
  const shellMeshes=[];

  function localToWorld(g,v){
    g.updateWorldMatrix(true,false);
    return g.localToWorld(v.clone());
  }

  function addForklift(group,x,z,rot=0){
    const fg=new THREE.Group();
    fg.position.set(x,.26,z);fg.rotation.y=rot;
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.25,.72,1.70),forkliftMat);
    body.position.y=.58;fg.add(body);
    const mast=new THREE.Mesh(new THREE.BoxGeometry(.16,1.75,.16),machineDarkMat);
    mast.position.set(0,1.05,.92);fg.add(mast);
    const fork1=new THREE.Mesh(new THREE.BoxGeometry(.12,.10,1.05),machineDarkMat);
    fork1.position.set(-.28,.16,1.35);fg.add(fork1);
    const fork2=fork1.clone();fork2.position.x=.28;fg.add(fork2);
    for(const sx of [-.66,.66])for(const sz of [-.56,.56]){
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.16,10),tireMat);
      wheel.rotation.z=Math.PI/2;wheel.position.set(sx,.24,sz);fg.add(wheel);
    }
    group.add(fg);
  }

  buildings.forEach((g,idx)=>{
    const body=g.children.find(o=>o.isMesh&&o.geometry?.type==='BoxGeometry'&&o.position.y>1);
    if(!body)return;
    const {width:L,height:H,depth:D}=body.geometry.parameters;

    // Clone shell materials so V84 cutaway does not mutate other shared materials.
    body.material=body.material.clone();
    const roofCandidates=g.children.filter(o=>o.isMesh&&o.geometry?.type==='BoxGeometry'&&o.position.y>H);
    roofCandidates.forEach(m=>{m.material=m.material.clone();});
    shellMeshes.push({body,roofs:roofCandidates});

    const interior=new THREE.Group();
    interior.name='V84_FACTORY_INTERIOR_'+idx;
    interior.userData={factoryIndex:idx,L,D,H};
    g.add(interior);
    interiors.push(interior);

    const floor=new THREE.Mesh(new THREE.BoxGeometry(L*.94,.12,D*.88),floorMat);
    floor.position.y=.31;floor.receiveShadow=true;interior.add(floor);

    // Two green pedestrian aisles and yellow safety edge strips.
    for(const z of [-D*.24,D*.24]){
      const aisle=new THREE.Mesh(new THREE.BoxGeometry(L*.88,.035,1.65),aisleMat);
      aisle.position.set(0,.39,z);interior.add(aisle);
      for(const dz of [-.92,.92]){
        const edge=new THREE.Mesh(new THREE.BoxGeometry(L*.88,.04,.08),safetyMat);
        edge.position.set(0,.415,z+dz);interior.add(edge);
      }
    }

    // Structural columns in a readable regular grid.
    const xN=Math.max(4,Math.min(12,Math.round(L/15)));
    const zRows=D>24?3:2;
    const columnGeo=new THREE.CylinderGeometry(.22,.28,H*.86,8);
    const columns=new THREE.InstancedMesh(columnGeo,columnMat,xN*zRows);
    const dummy=new THREE.Object3D();
    let ci=0;
    for(let xi=0;xi<xN;xi++){
      const x=THREE.MathUtils.lerp(-L*.40,L*.40,xi/Math.max(1,xN-1));
      for(let zi=0;zi<zRows;zi++){
        const z=THREE.MathUtils.lerp(-D*.32,D*.32,zi/Math.max(1,zRows-1));
        dummy.position.set(x,H*.43+.36,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();
        columns.setMatrixAt(ci++,dummy.matrix);
      }
    }
    columns.instanceMatrix.needsUpdate=true;interior.add(columns);

    // Production machines: two lines with control boxes.
    const machineN=Math.max(4,Math.min(12,Math.round(L/13)));
    const machineGeo=new THREE.BoxGeometry(3.8,2.15,2.3);
    const machines=new THREE.InstancedMesh(machineGeo,machineMat,machineN*2);
    const controlGeo=new THREE.BoxGeometry(.52,.85,.38);
    const controls=new THREE.InstancedMesh(controlGeo,machineDarkMat,machineN*2);
    let mi=0;
    for(let row=0;row<2;row++){
      const z=row===0?-D*.13:D*.13;
      for(let i=0;i<machineN;i++){
        const x=THREE.MathUtils.lerp(-L*.38,L*.38,(i+.5)/machineN);
        dummy.position.set(x,1.45,z);dummy.rotation.set(0,0,0);dummy.updateMatrix();machines.setMatrixAt(mi,dummy.matrix);
        dummy.position.set(x+1.72,1.05,z+1.22);dummy.updateMatrix();controls.setMatrixAt(mi,dummy.matrix);
        mi++;
      }
    }
    machines.instanceMatrix.needsUpdate=true;controls.instanceMatrix.needsUpdate=true;
    interior.add(machines,controls);

    // Long conveyors between machine banks.
    for(const z of [-D*.13,D*.13]){
      const conv=new THREE.Mesh(new THREE.BoxGeometry(L*.76,.48,.72),conveyorMat);
      conv.position.set(0,.70,z+(z<0?1.65:-1.65));interior.add(conv);
    }

    // Rear warehouse racks and pallet blocks.
    const rackN=Math.max(3,Math.min(9,Math.round(L/18)));
    const rackGeo=new THREE.BoxGeometry(3.4,3.5,1.4);
    const racks=new THREE.InstancedMesh(rackGeo,rackMat,rackN);
    const pallets=new THREE.InstancedMesh(new THREE.BoxGeometry(2.4,.55,1.15),palletMat,rackN*2);
    for(let i=0;i<rackN;i++){
      const x=THREE.MathUtils.lerp(-L*.35,L*.35,(i+.5)/rackN);
      dummy.position.set(x,2.08,-D*.34);dummy.updateMatrix();racks.setMatrixAt(i,dummy.matrix);
      dummy.position.set(x,.68,-D*.27);dummy.updateMatrix();pallets.setMatrixAt(i*2,dummy.matrix);
      dummy.position.set(x,.68,-D*.41);dummy.updateMatrix();pallets.setMatrixAt(i*2+1,dummy.matrix);
    }
    racks.instanceMatrix.needsUpdate=true;pallets.instanceMatrix.needsUpdate=true;interior.add(racks,pallets);

    // Interior office/control room at front corner.
    const officeW=Math.min(9,L*.16),officeD=Math.min(6,D*.20);
    const office=new THREE.Mesh(new THREE.BoxGeometry(officeW,3.1,officeD),officeMat);
    office.position.set(-L*.36,1.86,D*.31);interior.add(office);
    const officeGlass=new THREE.Mesh(new THREE.BoxGeometry(officeW*.72,1.25,.08),officeGlassMat);
    officeGlass.position.set(-L*.36,2.10,D*.31-officeD/2-.06);interior.add(officeGlass);

    // Overhead lights, emissive only (no costly point lights).
    const lightN=Math.max(5,Math.min(16,Math.round(L/10)));
    for(let i=0;i<lightN;i++){
      const x=THREE.MathUtils.lerp(-L*.42,L*.42,(i+.5)/lightN);
      for(const z of [-D*.20,D*.20]){
        const lm=new THREE.Mesh(new THREE.BoxGeometry(2.6,.10,.32),lightMat);
        lm.position.set(x,H*.78,z);interior.add(lm);
      }
    }

    if(idx%2===0)addForklift(interior,L*.22,D*.05,Math.PI/2);
    if(idx%5===0)addForklift(interior,-L*.18,-D*.24,-Math.PI/2);

    // Main personnel entrance on the service-yard facade.
    const door=new THREE.Mesh(new THREE.BoxGeometry(2.6,3.25,.12),doorMat);
    door.position.set(0,1.90,D/2+.13);g.add(door);
    const dg=new THREE.Mesh(new THREE.BoxGeometry(1.85,2.30,.05),doorGlassMat);
    dg.position.set(0,1.95,D/2+.205);g.add(dg);
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(4.2,.18,1.6),machineDarkMat);
    canopy.position.set(0,3.62,D/2+.75);g.add(canopy);

    const entranceLocal=new THREE.Vector3(0,.10,D/2+1.15);
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
      index,
      building:g,
      L,D,H,
      entranceWorld:localToWorld(g,entranceLocal),
      yardWorld:localToWorld(g,yardLocal),
      insideNearWorld:localToWorld(g,insideNearLocal),
      insideMidWorld:localToWorld(g,insideMidLocal),
      insideFarWorld:localToWorld(g,insideFarLocal),
      patrolWorld:patrolLocal.map(v=>localToWorld(g,v))
    };
    portals.push(portal);
    g.userData.factoryV84=portal;
  });

  let cutaway=false;
  let visible=true;
  function setVisible(v){
    visible=!!v;
    interiors.forEach(g=>g.visible=visible);
  }
  function setCutaway(v){
    cutaway=!!v;
    shellMeshes.forEach(({body,roofs})=>{
      body.material.transparent=cutaway;
      body.material.opacity=cutaway ? .20 : 1;
      body.material.depthWrite=!cutaway;
      roofs.forEach((m,i)=>{
        m.material.transparent=cutaway;
        m.material.opacity=cutaway ? (i===0 ? .08 : .11) : 1;
        m.material.depthWrite=!cutaway;
      });
    });
  }

  window.__DALOC_FACTORY_INTERIORS_V84={
    ready:true,version:84,controller,interiors,portals,
    factoryCount:interiors.length,setVisible,setCutaway
  };

  console.info('[DaLoc] V84 factory interiors installed',{
    factories:interiors.length,portals:portals.length
  });

  return {
    ready:true,version:84,controller,interiors,portals,
    factoryCount:interiors.length,setVisible,setCutaway,
    get cutaway(){return cutaway;}
  };
}
