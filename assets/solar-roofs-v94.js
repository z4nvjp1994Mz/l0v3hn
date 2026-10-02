import * as THREE from 'three';

// V147 solar-roof pilot zone + two-storey industrial architecture.
// A compact cluster of three adjacent factories receives realistic photovoltaic tables.
// Geometry stays attached to each factory local frame, so it follows the verified roof footprint.
export function installSolarRoofZoneV94({
  buildings,
  selectedIndices=[0,1,4]
}){
  if(!Array.isArray(buildings)||!buildings.length)throw new Error('V94 solar roofs require buildings');

  const panelRoots=[];
  const twoStoreyRoots=[];
  let tableCount=0;
  let moduleEquivalent=0;

  function makePanelTexture(){
    const cv=document.createElement('canvas');
    cv.width=512;cv.height=256;
    const ctx=cv.getContext('2d');
    const g=ctx.createLinearGradient(0,0,512,256);
    g.addColorStop(0,'#0b2747');
    g.addColorStop(.45,'#123b67');
    g.addColorStop(1,'#071e38');
    ctx.fillStyle=g;ctx.fillRect(0,0,512,256);

    // 4 x 2 visible PV-module grid per table.
    ctx.strokeStyle='rgba(210,227,236,.72)';
    ctx.lineWidth=3;
    for(let x=0;x<=4;x++){
      const xx=x*128;
      ctx.beginPath();ctx.moveTo(xx,0);ctx.lineTo(xx,256);ctx.stroke();
    }
    for(let y=0;y<=2;y++){
      const yy=y*128;
      ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(512,yy);ctx.stroke();
    }

    // Fine cell pattern.
    ctx.strokeStyle='rgba(120,166,200,.25)';
    ctx.lineWidth=1;
    for(let x=16;x<512;x+=16){
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,256);ctx.stroke();
    }
    for(let y=16;y<256;y+=16){
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();
    }

    // Glass highlight.
    const shine=ctx.createLinearGradient(0,0,512,0);
    shine.addColorStop(0,'rgba(255,255,255,.02)');
    shine.addColorStop(.48,'rgba(255,255,255,.16)');
    shine.addColorStop(.58,'rgba(255,255,255,.04)');
    shine.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=shine;ctx.fillRect(0,0,512,256);

    const tex=new THREE.CanvasTexture(cv);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=4;
    return tex;
  }

  const panelTex=makePanelTexture();
  const panelMat=new THREE.MeshStandardMaterial({
    map:panelTex,
    color:0xffffff,
    roughness:.24,
    metalness:.28
  });
  const frameMat=new THREE.MeshStandardMaterial({
    color:0xaab5ba,
    roughness:.36,
    metalness:.72
  });
  const railMat=new THREE.MeshStandardMaterial({
    color:0x69777d,
    roughness:.48,
    metalness:.62
  });
  const inverterMat=new THREE.MeshStandardMaterial({
    color:0xe5e8e4,
    roughness:.68,
    metalness:.12
  });
  const cableMat=new THREE.MeshStandardMaterial({
    color:0x353c3f,
    roughness:.72
  });
  const floorBandMat=new THREE.MeshStandardMaterial({color:0x2e6658,roughness:.66,metalness:.08});
  const solarGlassMat=new THREE.MeshStandardMaterial({
    color:0x7096a6,roughness:.16,metalness:.06,transparent:true,opacity:.82
  });
  const balconyMat=new THREE.MeshStandardMaterial({color:0x667674,roughness:.48,metalness:.34});
  const stairMat=new THREE.MeshStandardMaterial({color:0x778481,roughness:.55,metalness:.30});
  const sunshadeMat=new THREE.MeshStandardMaterial({color:0xd8ded8,roughness:.72});
  const parapetMat=new THREE.MeshStandardMaterial({color:0xe8ece7,roughness:.78});

  const tableW=4.65;
  const tableD=2.35;
  const panelW=4.42;
  const panelD=2.12;
  const stepX=5.05;
  const stepZ=2.78;
  const tilt=THREE.MathUtils.degToRad(6.5);

  function bodyFor(g){
    return g.children.find(o=>
      o.isMesh &&
      o.geometry?.type==='BoxGeometry' &&
      o.geometry?.parameters?.height>4 &&
      o.geometry?.parameters?.width>10 &&
      o.geometry?.parameters?.depth>8
    );
  }

  function factoryObstacles(L,D){
    const obs=[];

    const unitCount=Math.max(3,Math.min(10,Math.round((L*D)/1500)));
    for(let i=0;i<unitCount;i++){
      const t=(i+1)/(unitCount+1);
      const x=(-.38+t*.76)*L;
      const z=(i%2?-.18:.18)*D;
      obs.push({x,z,rx:3.2,rz:2.7});
    }

    const stackCount=Math.max(2,Math.min(6,Math.round(L/28)));
    for(let i=0;i<stackCount;i++){
      const x=(-.32+i/Math.max(1,stackCount-1)*.64)*L;
      obs.push({x,z:-D*.28,rx:1.8,rz:2.0});
    }

    const techN=Math.max(2,Math.min(6,Math.round(L/25)));
    for(let i=0;i<techN;i++){
      const x=(-.32+i/Math.max(1,techN-1)*.64)*L;
      obs.push({x,z:D*.22,rx:3.4,rz:3.0});
    }

    // central skylight ribbon
    obs.push({x:0,z:0,rx:L*.46,rz:2.25});
    return obs;
  }

  function clearOfObstacles(x,z,obstacles){
    return !obstacles.some(o=>
      Math.abs(x-o.x)<o.rx+tableW*.52 &&
      Math.abs(z-o.z)<o.rz+tableD*.52
    );
  }

  function markArchitecturalDetail(o,factoryIndex){
    o.userData=o.userData||{};
    o.userData.fpsNonSolid=true;
    o.userData.solarTwoStoreyV147=true;
    o.userData.factoryIndex=factoryIndex;
    return o;
  }

  function addTwoStoreyArchitecture(g,factoryIndex,L,D,H){
    const root=new THREE.Group();
    root.name='V147_SOLAR_TWO_STOREY_FACTORY_'+String(factoryIndex+1).padStart(2,'0');
    root.userData={
      version:147,
      factoryIndex,
      role:'two-storey-solar-industrial-building',
      floors:2,
      fpsNonSolid:true
    };
    g.add(root);
    twoStoreyRoots.push(root);

    // A strong horizontal datum makes the two floors legible without changing
    // the verified building shell or its FPS collision.
    const splitY=Math.max(3.6,Math.min(H*.50,5.15));
    const band=new THREE.Mesh(new THREE.BoxGeometry(L*.94,.28,.16),floorBandMat);
    band.position.set(0,splitY,D/2+.10);
    markArchitecturalDetail(band,factoryIndex);root.add(band);

    // Two separate glazing levels on the public/front facade.
    const margin=Math.max(6,L*.10);
    const glassSpan=Math.max(8,L-margin*2);
    const lowerY=Math.max(2.15,splitY*.55);
    const upperY=Math.min(H-1.55,splitY+(H-splitY)*.48);
    for(const y of [lowerY,upperY]){
      const glass=new THREE.Mesh(new THREE.BoxGeometry(glassSpan,1.42,.10),solarGlassMat);
      glass.position.set(0,y,D/2+.115);
      markArchitecturalDetail(glass,factoryIndex);root.add(glass);

      const mullions=Math.max(5,Math.min(18,Math.round(glassSpan/5.2)));
      for(let i=0;i<=mullions;i++){
        const x=-glassSpan/2+i/mullions*glassSpan;
        const m=new THREE.Mesh(new THREE.BoxGeometry(.075,1.56,.12),balconyMat);
        m.position.set(x,y,D/2+.18);
        markArchitecturalDetail(m,factoryIndex);root.add(m);
      }
    }

    // Corner entrance tower changes side by building so the three solar blocks
    // are related but not identical.
    const side=factoryIndex%2===0?-1:1;
    const towerX=side*(L*.5-3.9);
    const towerW=Math.min(6.2,Math.max(4.8,L*.075));
    const tower=new THREE.Mesh(new THREE.BoxGeometry(towerW,H*.82,.34),solarGlassMat);
    tower.position.set(towerX,H*.45,D/2+.20);
    markArchitecturalDetail(tower,factoryIndex);root.add(tower);

    // Second-floor balcony / maintenance terrace.
    const balconyW=Math.min(18,Math.max(10,L*.20));
    const balcony=new THREE.Mesh(new THREE.BoxGeometry(balconyW,.20,2.25),balconyMat);
    balcony.position.set(-side*L*.18,splitY+.18,D/2+1.15);
    markArchitecturalDetail(balcony,factoryIndex);root.add(balcony);

    const railH=1.05;
    const railTop=new THREE.Mesh(new THREE.BoxGeometry(balconyW,.08,.08),balconyMat);
    railTop.position.set(-side*L*.18,splitY+railH,D/2+2.20);
    markArchitecturalDetail(railTop,factoryIndex);root.add(railTop);
    const railPosts=Math.max(5,Math.round(balconyW/2.6));
    for(let i=0;i<=railPosts;i++){
      const x=-side*L*.18-balconyW/2+i/railPosts*balconyW;
      const post=new THREE.Mesh(new THREE.BoxGeometry(.07,railH,.07),balconyMat);
      post.position.set(x,splitY+railH*.52,D/2+2.20);
      markArchitecturalDetail(post,factoryIndex);root.add(post);
    }

    // External maintenance stair to make the upper floor physically readable.
    const stairX=side*(L*.5-2.0);
    const stairZ=D/2+2.10;
    const steps=12;
    for(let i=0;i<steps;i++){
      const t=(i+.5)/steps;
      const step=new THREE.Mesh(new THREE.BoxGeometry(2.0,.16,.55),stairMat);
      step.position.set(
        stairX,
        .45+t*(splitY-.55),
        stairZ+(t-.5)*5.4
      );
      markArchitecturalDetail(step,factoryIndex);root.add(step);
    }
    for(const xOff of [-1.02,1.02]){
      const stringer=new THREE.Mesh(new THREE.BoxGeometry(.09,splitY*.92,.09),stairMat);
      stringer.position.set(stairX+xOff,splitY*.48,stairZ);
      stringer.rotation.x=THREE.MathUtils.degToRad(32);
      markArchitecturalDetail(stringer,factoryIndex);root.add(stringer);
    }

    // Vertical sunshades give the second floor a distinct administrative facade.
    const shadeN=Math.max(6,Math.min(16,Math.round(L/8)));
    for(let i=0;i<shadeN;i++){
      const x=(-.34+i/Math.max(1,shadeN-1)*.68)*L;
      const shade=new THREE.Mesh(new THREE.BoxGeometry(.14,2.15,.62),sunshadeMat);
      shade.position.set(x,upperY,D/2+.48);
      markArchitecturalDetail(shade,factoryIndex);root.add(shade);
    }

    // Roof parapet around the solar field. It stays low enough to preserve the
    // PV silhouette and never becomes an FPS wall.
    const parapetH=.48,t=.14,py=H+.70;
    for(const z of [-D/2,D/2]){
      const p=new THREE.Mesh(new THREE.BoxGeometry(L+.40,parapetH,t),parapetMat);
      p.position.set(0,py,z);
      markArchitecturalDetail(p,factoryIndex);root.add(p);
    }
    for(const x of [-L/2,L/2]){
      const p=new THREE.Mesh(new THREE.BoxGeometry(t,parapetH,D+.40),parapetMat);
      p.position.set(x,py,0);
      markArchitecturalDetail(p,factoryIndex);root.add(p);
    }

    // Simple floor labels as geometry bands, not camera-facing sprites.
    const level1=new THREE.Mesh(new THREE.BoxGeometry(3.8,.18,.12),floorBandMat);
    level1.position.set(-side*L*.30,1.0,D/2+.18);
    markArchitecturalDetail(level1,factoryIndex);root.add(level1);
    const level2=level1.clone();
    level2.position.y=splitY+1.0;
    markArchitecturalDetail(level2,factoryIndex);root.add(level2);

    return root;
  }

  for(const factoryIndex of selectedIndices){
    const g=buildings[factoryIndex];
    const body=bodyFor(g);
    if(!g||!body)continue;

    const {width:L,height:H,depth:D}=body.geometry.parameters;
    addTwoStoreyArchitecture(g,factoryIndex,L,D,H);
    const obstacles=factoryObstacles(L,D);
    const placements=[];

    const xMin=-L/2+5.5;
    const xMax=L/2-5.5;
    const zMin=-D/2+4.0;
    const zMax=D/2-4.0;

    let row=0;
    for(let z=zMin;z<=zMax;z+=stepZ,row++){
      // Maintenance aisle every fifth row.
      if(row%5===4)continue;

      let col=0;
      for(let x=xMin;x<=xMax;x+=stepX,col++){
        // Narrow vertical maintenance lane near the middle of very long roofs.
        if(L>100 && Math.abs(x)<3.8)continue;
        if(!clearOfObstacles(x,z,obstacles))continue;

        // Alternate tilt direction by roof half while keeping arrays visually ordered.
        const rx=z>=0?-tilt:tilt;
        placements.push({x,z,rx});
      }
    }
    if(!placements.length)continue;

    const solarRoot=new THREE.Group();
    solarRoot.name='V94_SOLAR_FACTORY_'+String(factoryIndex+1).padStart(2,'0');
    solarRoot.userData={
      version:147,
      factoryIndex,
      role:'solar-roof-pilot-two-storey',
      tableCount:placements.length
    };
    g.add(solarRoot);
    panelRoots.push(solarRoot);

    const frameGeo=new THREE.BoxGeometry(tableW,.105,tableD);
    const panelGeo=new THREE.BoxGeometry(panelW,.055,panelD);
    const railGeo=new THREE.BoxGeometry(tableW+.28,.08,.10);

    const frames=new THREE.InstancedMesh(frameGeo,frameMat,placements.length);
    const panels=new THREE.InstancedMesh(panelGeo,panelMat,placements.length);
    const rails=new THREE.InstancedMesh(railGeo,railMat,placements.length*2);
    frames.name='V94_SOLAR_FRAMES_'+factoryIndex;
    panels.name='V94_SOLAR_GLASS_'+factoryIndex;
    rails.name='V94_SOLAR_RAILS_'+factoryIndex;
    frames.castShadow=panels.castShadow=true;
    frames.receiveShadow=panels.receiveShadow=true;

    const m=new THREE.Matrix4();
    const q=new THREE.Quaternion();
    const pos=new THREE.Vector3();
    const scale=new THREE.Vector3(1,1,1);
    let ri=0;

    placements.forEach((p,i)=>{
      q.setFromEuler(new THREE.Euler(p.rx,0,0));
      pos.set(p.x,H+.94,p.z);
      m.compose(pos,q,scale);
      frames.setMatrixAt(i,m);

      pos.set(p.x,H+1.02,p.z);
      m.compose(pos,q,scale);
      panels.setMatrixAt(i,m);

      for(const rz of [-tableD*.43,tableD*.43]){
        const dy=Math.sin(p.rx)*rz;
        const dz=Math.cos(p.rx)*rz;
        pos.set(p.x,H+.83+dy,p.z+dz);
        m.compose(pos,q,scale);
        rails.setMatrixAt(ri++,m);
      }
    });

    frames.instanceMatrix.needsUpdate=true;
    panels.instanceMatrix.needsUpdate=true;
    rails.instanceMatrix.needsUpdate=true;
    frames.computeBoundingSphere();
    panels.computeBoundingSphere();
    rails.computeBoundingSphere();
    solarRoot.add(frames,rails,panels);

    // One inverter / combiner bank on the service edge of each solar factory.
    const inverterBank=new THREE.Group();
    inverterBank.name='V94_SOLAR_INVERTER_BANK_'+factoryIndex;
    for(let i=0;i<3;i++){
      const inv=new THREE.Mesh(new THREE.BoxGeometry(.95,1.25,.42),inverterMat);
      inv.position.set(-1.15+i*1.15,H+.86,-D/2+2.0);
      inv.castShadow=true;inverterBank.add(inv);
      const cable=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.70,8),cableMat);
      cable.position.set(-1.15+i*1.15,H+.32,-D/2+2.0);
      inverterBank.add(cable);
    }
    solarRoot.add(inverterBank);

    tableCount+=placements.length;
    moduleEquivalent+=placements.length*8;
  }

  function setVisible(on){
    panelRoots.forEach(r=>r.visible=!!on);
  }

  const controller={
    ready:true,
    version:147,
    selectedIndices:selectedIndices.slice(),
    factoryCount:panelRoots.length,
    twoStoreyFactoryCount:twoStoreyRoots.length,
    floors:2,
    tableCount,
    moduleEquivalent,
    roots:panelRoots,
    architectureRoots:twoStoreyRoots,
    setVisible
  };

  window.__DALOC_SOLAR_ROOFS_V94=controller;
  console.info('[DaLoc] V147 two-storey solar industrial zone installed',{
    factories:controller.factoryCount,
    tables:tableCount,
    moduleEquivalent
  });
  return controller;
}
