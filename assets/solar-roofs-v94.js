import * as THREE from 'three';

// V147.1 solar-roof pilot zone + ACTUAL two-storey industrial architecture.
// A compact cluster of three adjacent factories receives realistic photovoltaic tables.
// Geometry stays attached to each factory local frame, so it follows the verified roof footprint.
export function installSolarRoofZoneV94({
  buildings,
  selectedIndices=[0,1,4]
}){
  if(!Array.isArray(buildings)||!buildings.length)throw new Error('V94 solar roofs require buildings');

  const panelRoots=[];
  const twoStoreyRoots=[];
  const stairWalkSurfaces=[];
  const walkLocalPoint=new THREE.Vector3();
  const walkFeetPoint=new THREE.Vector3();
  const walkWorldPoint=new THREE.Vector3();
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
  const floorSlabMat=new THREE.MeshStandardMaterial({color:0xc7cdca,roughness:.88});
  const stairWallMat=new THREE.MeshStandardMaterial({color:0xdce2de,roughness:.82});

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
    root.name='V1471_SOLAR_TWO_STOREY_FACTORY_'+String(factoryIndex+1).padStart(2,'0');
    root.userData={
      version:149,
      factoryIndex,
      role:'actual-two-storey-solar-industrial-building',
      floors:2,
      fpsNonSolid:true
    };
    g.add(root);
    twoStoreyRoots.push(root);

    const splitY=Math.max(3.9,Math.min(H*.50,5.15));
    const lowerY=Math.max(2.05,splitY*.53);
    const upperY=Math.min(H-1.55,splitY+(H-splitY)*.48);
    const wallOffset=.13;

    const addDetail=(mesh,name)=>{
      mesh.name=name;
      markArchitecturalDetail(mesh,factoryIndex);
      root.add(mesh);
      return mesh;
    };

    // ---------------------------------------------------------------------
    // REAL SECOND-FLOOR SLAB
    // ---------------------------------------------------------------------
    // Use four slab segments so the internal stair core has a real opening.
    // This remains decorative/non-solid for FPS until stair-walking is added,
    // but it is actual level geometry visible from inside the building.
    const stairSide=factoryIndex%2===0?-1:1;
    const stairCoreW=Math.min(9.2,Math.max(7.6,L*.09));
    const stairCoreD=Math.min(12.5,Math.max(10.0,D*.30));
    const stairCoreX=stairSide*(L*.5-stairCoreW*.62-1.2);
    const stairCoreZ=D*.20;

    // V147.3: derive the slab opening from the ACTUAL stair footprint rather
    // than the much larger architectural stairCoreD. The old opening extended
    // several metres beyond the final upper step, producing the visible void.
    const flightSteps=10;
    const totalSteps=flightSteps*2;
    const stairW=Math.min(3.8,Math.max(3.2,stairCoreW*.42));
    const run=Math.min(5.8,Math.max(4.8,stairCoreD*.45));
    const stepD=run/flightSteps;
    const rise=splitY/totalSteps;
    const flightOffset=stairW*.58;
    const landingDepth=Math.max(3.35,stairW*1.18);
    const topLandingDepth=Math.max(2.85,stairW*.96);
    const holeHalfW=flightOffset+stairW*.68;
    const holeRear=run*.5+landingDepth*.58;
    const holeFront=run*.5+topLandingDepth;

    const slabT=.26;
    const leftEdge=-L*.46,rightEdge=L*.46;
    const backEdge=-D*.44,frontEdge=D*.44;
    const holeX0=stairCoreX-holeHalfW;
    const holeX1=stairCoreX+holeHalfW;
    const holeZ0=stairCoreZ-holeRear;
    const holeZ1=stairCoreZ+holeFront;

    const slabParts=[
      {x:(leftEdge+holeX0)/2,z:0,w:Math.max(.2,holeX0-leftEdge),d:frontEdge-backEdge},
      {x:(holeX1+rightEdge)/2,z:0,w:Math.max(.2,rightEdge-holeX1),d:frontEdge-backEdge},
      {x:stairCoreX,z:(backEdge+holeZ0)/2,w:Math.max(.2,holeX1-holeX0),d:Math.max(.2,holeZ0-backEdge)},
      {x:stairCoreX,z:(holeZ1+frontEdge)/2,w:Math.max(.2,holeX1-holeX0),d:Math.max(.2,frontEdge-holeZ1)}
    ];
    for(const [i,p] of slabParts.entries()){
      if(p.w<.3||p.d<.3)continue;
      const slab=new THREE.Mesh(
        new THREE.BoxGeometry(p.w,slabT,p.d),
        floorSlabMat
      );
      slab.position.set(p.x,splitY,p.z);
      addDetail(
        slab,
        'V1471_SECOND_FLOOR_SLAB_'+factoryIndex+'_'+i
      );
    }

    // Strong slab edge / floor line on ALL FOUR facades.
    for(const z of [-D/2-wallOffset,D/2+wallOffset]){
      const band=new THREE.Mesh(new THREE.BoxGeometry(L*.96,.30,.18),floorBandMat);
      band.position.set(0,splitY,z);
      addDetail(band,'V1471_FLOOR_BAND_LONG_'+factoryIndex);
    }
    for(const x of [-L/2-wallOffset,L/2+wallOffset]){
      const band=new THREE.Mesh(new THREE.BoxGeometry(.18,.30,D*.96),floorBandMat);
      band.position.set(x,splitY,0);
      addDetail(band,'V1471_FLOOR_BAND_END_'+factoryIndex);
    }

    // ---------------------------------------------------------------------
    // TWO ROWS OF WINDOWS ON ALL FOUR SIDES
    // ---------------------------------------------------------------------
    const longMargin=Math.max(6,L*.09);
    const longSpan=Math.max(8,L-longMargin*2);
    const endMargin=Math.max(3,D*.12);
    const endSpan=Math.max(5,D-endMargin*2);

    function addLongFacade(z,tag){
      for(const [level,y] of [['L1',lowerY],['L2',upperY]]){
        const glass=new THREE.Mesh(new THREE.BoxGeometry(longSpan,1.46,.10),solarGlassMat);
        glass.position.set(0,y,z);
        addDetail(glass,'V1471_'+tag+'_GLASS_'+level+'_'+factoryIndex);

        const mullions=Math.max(6,Math.min(20,Math.round(longSpan/5.0)));
        for(let i=0;i<=mullions;i++){
          const x=-longSpan/2+i/mullions*longSpan;
          const m=new THREE.Mesh(new THREE.BoxGeometry(.075,1.60,.13),balconyMat);
          m.position.set(x,y,z+(z>0?.06:-.06));
          addDetail(m,'V1471_'+tag+'_MULLION_'+level+'_'+factoryIndex+'_'+i);
        }
      }
    }

    function addEndFacade(x,tag){
      for(const [level,y] of [['L1',lowerY],['L2',upperY]]){
        const glass=new THREE.Mesh(new THREE.BoxGeometry(.10,1.46,endSpan),solarGlassMat);
        glass.position.set(x,y,0);
        addDetail(glass,'V1471_'+tag+'_GLASS_'+level+'_'+factoryIndex);

        const mullions=Math.max(4,Math.min(12,Math.round(endSpan/4.2)));
        for(let i=0;i<=mullions;i++){
          const z=-endSpan/2+i/mullions*endSpan;
          const m=new THREE.Mesh(new THREE.BoxGeometry(.13,1.60,.075),balconyMat);
          m.position.set(x+(x>0?.06:-.06),y,z);
          addDetail(m,'V1471_'+tag+'_MULLION_'+level+'_'+factoryIndex+'_'+i);
        }
      }
    }

    addLongFacade(D/2+wallOffset,'FRONT');
    addLongFacade(-D/2-wallOffset,'REAR');
    addEndFacade(L/2+wallOffset,'RIGHT');
    addEndFacade(-L/2-wallOffset,'LEFT');

    // ---------------------------------------------------------------------
    // INTERNAL U-SHAPED STAIR — ENTIRELY INSIDE THE VERIFIED FOOTPRINT
    // ---------------------------------------------------------------------
    const stairRoot=new THREE.Group();
    stairRoot.name='V1471_INTERNAL_STAIR_'+factoryIndex;
    stairRoot.position.set(stairCoreX,0,stairCoreZ);
    stairRoot.userData={
      fpsNonSolid:true,
      solarTwoStoreyV147:true,
      factoryIndex,
      internal:true
    };
    root.add(stairRoot);

    // Flight geometry uses the same dimensions that define the slab opening,
    // so the visual stair and walkable surface cannot drift apart.

    // V147.5 CLOSED FLIGHT 1:
    // Each tread is now a solid stepped block from the ground up to its tread
    // elevation. Adjacent boxes overlap slightly in Z so there are no visible
    // gaps/open risers between steps.
    for(let i=0;i<flightSteps;i++){
      const treadTop=(i+1)*rise;
      const blockH=Math.max(.18,treadTop);
      const step=new THREE.Mesh(
        new THREE.BoxGeometry(stairW,blockH,stepD+.08),
        stairMat
      );
      step.position.set(
        -flightOffset,
        blockH*.5,
        run*.50-(i+.5)*stepD
      );
      markArchitecturalDetail(step,factoryIndex);
      stairRoot.add(step);
    }

    // Enlarged half landing: wide enough for a natural 180-degree turn and
    // visibly connects both flights instead of reading as a tiny shelf.
    const landingThickness=.22;
    const landing=new THREE.Mesh(
      new THREE.BoxGeometry(
        flightOffset*2+stairW*1.18,
        landingThickness,
        landingDepth
      ),
      floorSlabMat
    );
    landing.position.set(
      0,
      splitY*.50-landingThickness*.5,
      -run*.50
    );
    markArchitecturalDetail(landing,factoryIndex);
    stairRoot.add(landing);

    // V147.5 CLOSED FLIGHT 2:
    // Solid blocks start at the half-landing elevation and rise continuously
    // toward level 2. This removes the floating-tread appearance completely.
    for(let i=0;i<flightSteps;i++){
      const riseAboveLanding=(i+1)*rise;
      const blockH=Math.max(.18,riseAboveLanding);
      const step=new THREE.Mesh(
        new THREE.BoxGeometry(stairW,blockH,stepD+.08),
        stairMat
      );
      step.position.set(
        flightOffset,
        splitY*.50+blockH*.5,
        -run*.50+(i+.5)*stepD
      );
      markArchitecturalDetail(step,factoryIndex);
      stairRoot.add(step);
    }

    // Solid side cheeks close the staircase silhouette even when viewed from
    // oblique third-person angles.
    const cheekT=.12;
    for(const sideMul of [-1,1]){
      const cheek1=new THREE.Mesh(
        new THREE.BoxGeometry(
          cheekT,
          splitY*.50,
          run+.12
        ),
        stairWallMat
      );
      cheek1.position.set(
        -flightOffset+sideMul*(stairW*.5+cheekT*.5),
        splitY*.25,
        0
      );
      markArchitecturalDetail(cheek1,factoryIndex);
      stairRoot.add(cheek1);

      const cheek2=new THREE.Mesh(
        new THREE.BoxGeometry(
          cheekT,
          splitY*.50,
          run+.12
        ),
        stairWallMat
      );
      cheek2.position.set(
        flightOffset+sideMul*(stairW*.5+cheekT*.5),
        splitY*.75,
        0
      );
      markArchitecturalDetail(cheek2,factoryIndex);
      stairRoot.add(cheek2);
    }

    // Full-size upper landing bridges the last step directly into the
    // second-floor slab. This closes the multi-metre void visible in V147.2.
    const topLandingThickness=.22;
    const topLanding=new THREE.Mesh(
      new THREE.BoxGeometry(stairW*1.34,topLandingThickness,topLandingDepth+.18),
      floorSlabMat
    );
    topLanding.position.set(
      flightOffset,
      splitY+.14-topLandingThickness*.5,
      run*.50+topLandingDepth*.50-.05
    );
    markArchitecturalDetail(topLanding,factoryIndex);
    stairRoot.add(topLanding);

    // V149 MASSIVE CLOSED STAIR INFILL:
    // Close every void that previously made the stair read as a hollow frame.
    const totalStairW=flightOffset*2+stairW;

    const midLandingPedestal=new THREE.Mesh(
      new THREE.BoxGeometry(
        totalStairW+.30,
        splitY*.50,
        landingDepth
      ),
      stairWallMat
    );
    midLandingPedestal.position.set(
      0,
      splitY*.25,
      -run*.50
    );
    markArchitecturalDetail(midLandingPedestal,factoryIndex);
    stairRoot.add(midLandingPedestal);

    const upperFlightBase=new THREE.Mesh(
      new THREE.BoxGeometry(
        stairW,
        splitY*.50,
        run+.18
      ),
      stairWallMat
    );
    upperFlightBase.position.set(
      flightOffset,
      splitY*.25,
      0
    );
    markArchitecturalDetail(upperFlightBase,factoryIndex);
    stairRoot.add(upperFlightBase);

    const topLandingPedestal=new THREE.Mesh(
      new THREE.BoxGeometry(
        stairW*1.46,
        splitY,
        topLandingDepth+.24
      ),
      stairWallMat
    );
    topLandingPedestal.position.set(
      flightOffset,
      splitY*.50,
      run*.50+topLandingDepth*.50-.05
    );
    markArchitecturalDetail(topLandingPedestal,factoryIndex);
    stairRoot.add(topLandingPedestal);

    // Solid central spine closes the slot between the two flights.
    const centerSpine=new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(.34,flightOffset*2-stairW+.22),
        splitY,
        run+landingDepth*.78
      ),
      stairWallMat
    );
    centerSpine.position.set(
      0,
      splitY*.50,
      -landingDepth*.14
    );
    markArchitecturalDetail(centerSpine,factoryIndex);
    stairRoot.add(centerSpine);

    // Broad side plinths close the visible outer seams at ground level.
    for(const x of [
      -flightOffset-stairW*.54,
      flightOffset+stairW*.54
    ]){
      const plinth=new THREE.Mesh(
        new THREE.BoxGeometry(
          .22,
          splitY,
          run+landingDepth+topLandingDepth
        ),
        stairWallMat
      );
      plinth.position.set(
        x,
        splitY*.50,
        (topLandingDepth-landingDepth)*.22
      );
      markArchitecturalDetail(plinth,factoryIndex);
      stairRoot.add(plinth);
    }

    // Side guard at the open edge of the upper landing.
    for(const xOff of [-stairW*.70,stairW*.70]){
      const upperRail=new THREE.Mesh(
        new THREE.BoxGeometry(.08,1.02,topLandingDepth+.06),
        balconyMat
      );
      upperRail.position.set(
        flightOffset+xOff,
        splitY+.62,
        run*.50+topLandingDepth*.50-.05
      );
      markArchitecturalDetail(upperRail,factoryIndex);
      stairRoot.add(upperRail);
    }

    // Internal stair guard walls / rails stay inside the stair core.
    for(const x of [-stairW*1.22,stairW*1.22]){
      const rail=new THREE.Mesh(
        new THREE.BoxGeometry(.09,splitY*.88,.09),
        balconyMat
      );
      rail.position.set(x,splitY*.48,0);
      markArchitecturalDetail(rail,factoryIndex);
      stairRoot.add(rail);
    }

    // Stair core walls stop below ceiling and remain fully inside footprint.
    for(const x of [-stairCoreW*.52,stairCoreW*.52]){
      const wall=new THREE.Mesh(
        new THREE.BoxGeometry(.10,splitY*.90,stairCoreD*.92),
        stairWallMat
      );
      wall.position.set(x,splitY*.45,0);
      markArchitecturalDetail(wall,factoryIndex);
      stairRoot.add(wall);
    }

    // Export a lightweight gameplay descriptor. FPS uses this as two smooth
    // walkable ramps + landing + second-floor slab instead of 16 hard step
    // colliders, so climbing stays stable at normal/run speeds.
    stairWalkSurfaces.push({
      factoryIndex,
      building:g,
      splitY,
      stairCoreX,
      stairCoreZ,
      stairCoreW,
      stairCoreD,
      stairW,
      flightOffset,
      totalStairW,
      run,
      stepD,
      landingDepth,
      topLandingDepth,
      leftEdge,
      rightEdge,
      backEdge,
      frontEdge,
      holeX0,
      holeX1,
      holeZ0,
      holeZ1
    });

    // Ground-floor entrance canopy. No external stairs or balcony.
    const entranceX=-stairSide*L*.22;
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(5.2,.18,1.65),sunshadeMat);
    canopy.position.set(entranceX,3.05,D/2+.78);
    addDetail(canopy,'V1471_ENTRANCE_CANOPY_'+factoryIndex);

    // Upper floor gets a denser sunshade rhythm so the second level is readable.
    const shadeN=Math.max(8,Math.min(20,Math.round(L/7.5)));
    for(let i=0;i<shadeN;i++){
      const x=(-.38+i/Math.max(1,shadeN-1)*.76)*L;
      const shade=new THREE.Mesh(new THREE.BoxGeometry(.12,2.05,.50),sunshadeMat);
      shade.position.set(x,upperY,D/2+.42);
      addDetail(shade,'V1471_UPPER_SUNSHADE_'+factoryIndex+'_'+i);
    }

    // Roof parapet around the PV field.
    const parapetH=.48,t=.14,py=H+.70;
    for(const z of [-D/2,D/2]){
      const p=new THREE.Mesh(new THREE.BoxGeometry(L+.40,parapetH,t),parapetMat);
      p.position.set(0,py,z);
      addDetail(p,'V1471_PARAPET_LONG_'+factoryIndex);
    }
    for(const x of [-L/2,L/2]){
      const p=new THREE.Mesh(new THREE.BoxGeometry(t,parapetH,D+.40),parapetMat);
      p.position.set(x,py,0);
      addDetail(p,'V1471_PARAPET_END_'+factoryIndex);
    }

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
      version:149,
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

  function walkableHeightAt(worldPosition,currentFeetY=0,{
    maxStepUp=.72,
    maxDrop=1.35
  }={}){
    if(!worldPosition)return null;
    let best=null;
    let bestDelta=Infinity;

    for(const stair of stairWalkSurfaces){
      const building=stair.building;
      if(!building?.visible)continue;

      building.updateWorldMatrix(true,false);

      walkLocalPoint.copy(worldPosition);
      building.worldToLocal(walkLocalPoint);

      walkFeetPoint.set(worldPosition.x,currentFeetY,worldPosition.z);
      building.worldToLocal(walkFeetPoint);
      const currentLocalY=walkFeetPoint.y;

      const lx=walkLocalPoint.x-stair.stairCoreX;
      const lz=walkLocalPoint.z-stair.stairCoreZ;
      const flightOffset=stair.flightOffset||stair.stairW*.58;
      const halfW=stair.stairW*.68+.28;
      const runHalf=stair.run*.5;

      // V147.4 continuity model:
      // - transition zones deliberately overlap by more than one player radius;
      // - every matching surface becomes a candidate;
      // - the candidate closest to the current feet height wins.
      // This prevents a single frame from selecting "no floor" at flight/landing joins.
      const transitionMargin=Math.max(.62,(stair.stepD||stair.run/8)*1.55);
      const candidates=[];

      function addCandidate(localHeight,surface,priority=0){
        const delta=localHeight-currentLocalY;
        if(delta>maxStepUp||delta<-maxDrop)return;
        candidates.push({
          localHeight,
          surface,
          delta,
          score:Math.abs(delta)+priority
        });
      }

      // V149 broad entry catch: approaching the staircase head-on must
      // acquire the lower flight before the camera/player can pass through the
      // decorative solid geometry. This covers the complete visible stair width.
      const entryDepth=Math.max(1.45,stair.stepD*2.4);
      if(
        Math.abs(lx)<=stair.totalStairW*.56 &&
        lz>=runHalf-entryDepth &&
        lz<=runHalf+entryDepth
      ){
        const t=THREE.MathUtils.clamp(
          (runHalf-lz)/Math.max(.01,stair.run),
          0,
          1
        );
        addCandidate(
          t*stair.splitY*.5,
          'flight-1-entry',
          -.01
        );
      }

      // Flight 1: front -> rear, 0 -> half-floor.
      if(
        Math.abs(lx+stair.flightOffset)<=halfW+transitionMargin*.90 &&
        lz>=-runHalf-transitionMargin &&
        lz<= runHalf+transitionMargin
      ){
        const t=THREE.MathUtils.clamp(
          (runHalf-lz)/Math.max(.01,stair.run),
          0,1
        );
        addCandidate(t*stair.splitY*.5,'flight-1');
      }

      // Enlarged half landing overlaps both flight corridors.
      if(
        Math.abs(lx)<=stair.totalStairW*.52+transitionMargin*.55 &&
        Math.abs(lz+runHalf)<=stair.landingDepth*.52+transitionMargin
      ){
        addCandidate(stair.splitY*.5,'landing',.005);
      }

      // Flight 2: rear -> front, half-floor -> second floor.
      if(
        Math.abs(lx-stair.flightOffset)<=halfW+transitionMargin*.90 &&
        lz>=-runHalf-transitionMargin &&
        lz<= runHalf+transitionMargin
      ){
        const t=THREE.MathUtils.clamp(
          (lz+runHalf)/Math.max(.01,stair.run),
          0,1
        );
        addCandidate(
          stair.splitY*.5+t*stair.splitY*.5,
          'flight-2'
        );
      }

      // Upper landing overlaps the last metres of flight 2 and the slab edge.
      if(
        Math.abs(lx-stair.flightOffset)<=stair.stairW*.96+transitionMargin*.45 &&
        lz>=runHalf-transitionMargin &&
        lz<=runHalf+stair.topLandingDepth+transitionMargin &&
        currentLocalY>=stair.splitY-1.05
      ){
        addCandidate(stair.splitY+.14,'top-landing',.004);
      }

      // Actual second-floor slab. Only acquire it near upper-floor height.
      const inFloorRect=
        walkLocalPoint.x>=stair.leftEdge &&
        walkLocalPoint.x<=stair.rightEdge &&
        walkLocalPoint.z>=stair.backEdge &&
        walkLocalPoint.z<=stair.frontEdge;
      const inStairHole=
        walkLocalPoint.x>=stair.holeX0 &&
        walkLocalPoint.x<=stair.holeX1 &&
        walkLocalPoint.z>=stair.holeZ0 &&
        walkLocalPoint.z<=stair.holeZ1;
      if(
        inFloorRect &&
        !inStairHole &&
        currentLocalY>=stair.splitY-1.05
      ){
        addCandidate(stair.splitY+.14,'level-2',.006);
      }

      if(!candidates.length)continue;
      candidates.sort((a,b)=>a.score-b.score);
      const chosen=candidates[0];
      const localHeight=chosen.localHeight;
      const surface=chosen.surface;

      walkWorldPoint.set(
        walkLocalPoint.x,
        localHeight,
        walkLocalPoint.z
      );
      building.localToWorld(walkWorldPoint);

      if(chosen.score<bestDelta){
        bestDelta=chosen.score;
        best={
          height:walkWorldPoint.y,
          factoryIndex:stair.factoryIndex,
          surface,
          localHeight,
          transitionMargin
        };
      }
    }

    return best;
  }

  function setVisible(on){
    const visible=!!on;
    panelRoots.forEach(r=>r.visible=visible);
    twoStoreyRoots.forEach(r=>r.visible=visible);
  }

  const controller={
    ready:true,
    version:149,
    selectedIndices:selectedIndices.slice(),
    factoryCount:panelRoots.length,
    twoStoreyFactoryCount:twoStoreyRoots.length,
    floors:2,
    tableCount,
    moduleEquivalent,
    roots:panelRoots,
    architectureRoots:twoStoreyRoots,
    stairWalkSurfaces,
    walkableHeightAt,
    setVisible
  };

  window.__DALOC_SOLAR_ROOFS_V94=controller;
  console.info('[DaLoc] V149 massive closed walkable stair installed',{
    factories:controller.factoryCount,
    tables:tableCount,
    moduleEquivalent
  });
  return controller;
}
