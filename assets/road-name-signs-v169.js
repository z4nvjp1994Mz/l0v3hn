import * as THREE from 'three';

// V169: Road-name wayfinding authored directly from the user's annotated
// 1616x2048 masterplan. Every coordinate below is source-image pixels.
// mapPx() remains the only world-coordinate transform.
export function installRoadNameSignsV169({
  world,
  mapPx,
  warpPx=null,
  frameSignature,
  renderer=null,
  roadSafeInfo=null
}){
  if(!world)throw new Error('V169 road signs: world required');
  if(typeof mapPx!=='function')throw new Error('V169 road signs: mapPx required');

  const root=new THREE.Group();
  root.name='ROAD_NAME_SIGNS_V169';
  root.userData={
    version:169.5,
    frameSignature,
    source:'user-annotated-masterplan-1616x2048'
  };
  world.add(root);

  const routes=[
    {
      id:'dai-phat-1',name:'ĐẠI PHÁT 1',sourceColor:'#ff3939',
      pointsPx:[[1077,775],[1378,732]]
    },
    {
      id:'dai-phat-2',name:'ĐẠI PHÁT 2',sourceColor:'#f0ff00',
      pointsPx:[[686,1052],[869,810],[1034,779]]
    },
    {
      id:'dai-phat-3',name:'ĐẠI PHÁT 3',sourceColor:'#18ff00',
      pointsPx:[[363,1476],[656,1088]]
    },
    {
      id:'lien-hoa-1',name:'LIÊN HOA 1',sourceColor:'#1200ff',
      pointsPx:[[758,568],[1002,742]]
    },
    {
      id:'lien-hoa-2',name:'LIÊN HOA 2',sourceColor:'#111111',
      pointsPx:[[1103,818],[1271,933],[1389,986]]
    },
    {
      id:'que-vien-1',name:'QUẾ VIÊN 1',sourceColor:'#c318c5',
      pointsPx:[[421,882],[640,1043]]
    },
    {
      id:'que-vien-2',name:'QUẾ VIÊN 2',sourceColor:'#00fff0',
      pointsPx:[[707,1093],[887,1225]]
    }
  ];
  const routeById=new Map(routes.map(r=>[r.id,r]));

  // Two verified junctions derived from the converging colored route endpoints.
  // V169.5: the old manual postPx values are kept only as side hints. Final pole
  // positions are solved after CAD warp from road tangent/normal + road width and
  // validated against the live FPS road-safe corridors.
  const posts=[
    {
      id:'junction-west',
      junctionPx:[672,1069],
      sideHintPx:[692,1049],
      blades:[
        {routeId:'que-vien-1',targetPx:[421,882]},
        {routeId:'dai-phat-2',targetPx:[1034,779]},
        {routeId:'que-vien-2',targetPx:[887,1225]},
        {routeId:'dai-phat-3',targetPx:[363,1476]}
      ]
    },
    {
      id:'junction-east',
      junctionPx:[1054,779],
      sideHintPx:[1064,757],
      blades:[
        {routeId:'lien-hoa-1',targetPx:[758,568]},
        {routeId:'dai-phat-1',targetPx:[1378,732]},
        {routeId:'lien-hoa-2',targetPx:[1389,986]},
        {routeId:'dai-phat-2',targetPx:[686,1052]}
      ]
    }
  ];

  const mats={
    pole:new THREE.MeshStandardMaterial({color:0x3e4743,roughness:.62,metalness:.40}),
    base:new THREE.MeshStandardMaterial({color:0xb9bcb5,roughness:.94}),
    sign:new THREE.MeshStandardMaterial({color:0x154f3c,roughness:.62,metalness:.03})
  };

  const textureCache=new Map();
  // V169.5: stable Vietnamese glyph coverage across Windows/macOS/Linux browsers.
  // NFC avoids detached combining marks on Đ/Ạ/Ế/Ộ/Ụ etc.
  const VI_FONT_STACK='Tahoma, "Arial Unicode MS", Arial, "DejaVu Sans", sans-serif';

  function warped(px,py){
    if(typeof warpPx==='function'){
      const q=warpPx(px,py);
      if(q&&Number.isFinite(q.x)&&Number.isFinite(q.y))return [q.x,q.y];
    }
    return [px,py];
  }

  function worldAt(px,py){
    const [x,y]=warped(px,py);
    return mapPx(x,y);
  }

  // V169.5 uses the actual rendered surfaces as authority. V72 CAD asphalt and
  // junction polygons are the same geometry the player/vehicles see, so a sign is
  // accepted only when its full safety footprint misses CAD road surfaces and its
  // base lands on a rendered sidewalk or greenbelt.
  const cadRoadSurface=world.getObjectByName('V72_CAD_ROAD_SURFACES');
  const sidewalkSurface=world.getObjectByName('V53_SIDEWALK');
  const greenbeltSurface=world.getObjectByName('V53_GREENBELT');
  const surfaceRay=new THREE.Raycaster();
  const rayOrigin=new THREE.Vector3();
  const rayDown=new THREE.Vector3(0,-1,0);
  surfaceRay.near=0;
  surfaceRay.far=100;
  world.updateMatrixWorld(true);

  function hitsSurface(object,x,z,recursive=false){
    if(!object)return false;
    rayOrigin.set(x,40,z);
    surfaceRay.set(rayOrigin,rayDown);
    return surfaceRay.intersectObject(object,recursive).length>0;
  }

  function roadsideSurfaceAt(x,z){
    if(hitsSurface(sidewalkSurface,x,z,false))return 'sidewalk';
    if(hitsSurface(greenbeltSurface,x,z,false))return 'greenbelt';
    return null;
  }

  function cadRoadBlockedAt(x,z,safetyRadius=2.2){
    if(!cadRoadSurface)return true;
    const probes=[[0,0]];
    for(let k=0;k<12;k++){
      const a=k*Math.PI*2/12;
      probes.push([Math.cos(a)*safetyRadius,Math.sin(a)*safetyRadius]);
    }
    return probes.some(([ox,oz])=>hitsSurface(cadRoadSurface,x+ox,z+oz,true));
  }

  function findRoadsideSignPosition(post){
    const junction=worldAt(post.junctionPx[0],post.junctionPx[1]);
    const hintPx=post.sideHintPx||post.junctionPx;
    let hx=hintPx[0]-post.junctionPx[0],hy=hintPx[1]-post.junctionPx[1];
    const hLen=Math.hypot(hx,hy)||1;hx/=hLen;hy/=hLen;
    const baseAngle=Math.atan2(hy,hx);

    // Search source-space around the intended corner, then CAD-warp each candidate
    // exactly as the V53 sidewalk/greenbelt was warped before rendering. Score in
    // world metres so strong V91 warps cannot accidentally choose a distant point.
    const angleSteps=[0,15,-15,30,-30,45,-45,60,-60,75,-75,90,-90,120,-120,150,-150,180];
    let best=null;
    for(let radiusPx=10;radiusPx<=100;radiusPx+=2){
      for(const deltaDeg of angleSteps){
        const a=baseAngle+deltaDeg*Math.PI/180;
        const sx=post.junctionPx[0]+Math.cos(a)*radiusPx;
        const sy=post.junctionPx[1]+Math.sin(a)*radiusPx;
        const p=worldAt(sx,sy);
        const support=roadsideSurfaceAt(p.x,p.z);
        if(!support)continue;
        if(cadRoadBlockedAt(p.x,p.z,2.2))continue;

        // Secondary invariant: if V53 also considers this point part of a protected
        // road corridor, reject it even though CAD is the primary visual authority.
        if(typeof roadSafeInfo==='function'&&roadSafeInfo(p.x,p.z))continue;

        const worldDistance=Math.hypot(p.x-junction.x,p.z-junction.z);
        const score=worldDistance+(support==='sidewalk'?0:.65)+Math.abs(deltaDeg)*.025;
        if(!best||score<best.score){
          best={
            x:p.x,z:p.z,score,support,
            sourcePx:[Number(sx.toFixed(2)),Number(sy.toFixed(2))],
            worldDistance:Number(worldDistance.toFixed(2)),
            deltaDeg
          };
        }
      }
      // Once a close, validated roadside candidate exists, no need to scan far away.
      if(best&&best.worldDistance<18&&radiusPx>=34)break;
    }

    if(!best){
      console.warn('[DaLoc] V169.5 no CAD-surface-safe roadside position for',post.id);
      return {
        position:{x:junction.x,y:.04,z:junction.z},valid:false,offsetM:0,
        directionMode:'hidden-no-cad-safe-position',supportSurface:null,
        sourcePx:null,cadSurfaceValidated:false,
        roadSafeBefore:typeof roadSafeInfo==='function'?!!roadSafeInfo(junction.x,junction.z):null,
        roadSafeAfter:null
      };
    }

    return {
      position:{x:best.x,y:.04,z:best.z},
      valid:true,
      offsetM:best.worldDistance,
      directionMode:'cad-surface-search',
      supportSurface:best.support,
      sourcePx:best.sourcePx,
      angleDeltaDeg:best.deltaDeg,
      cadSurfaceValidated:true,
      roadSafeBefore:typeof roadSafeInfo==='function'?!!roadSafeInfo(junction.x,junction.z):null,
      roadSafeAfter:typeof roadSafeInfo==='function'?roadSafeInfo(best.x,best.z):null
    };
  }

  function signTexture(label){
    const safeLabel=String(label).normalize('NFC');
    if(textureCache.has(safeLabel))return textureCache.get(safeLabel);

    const canvas=document.createElement('canvas');
    canvas.width=1024;
    canvas.height=256;
    const ctx=canvas.getContext('2d');

    ctx.fillStyle='#154f3c';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.strokeStyle='#ffffff';
    ctx.lineWidth=14;
    ctx.strokeRect(12,12,canvas.width-24,canvas.height-24);

    ctx.fillStyle='#ffffff';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.font='800 104px '+VI_FONT_STACK;
    ctx.fontKerning='normal';
    ctx.fillText(safeLabel,canvas.width/2,canvas.height/2+3);

    const tex=new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=Math.min(8,renderer?.capabilities?.getMaxAnisotropy?.()||4);
    tex.needsUpdate=true;
    textureCache.set(safeLabel,tex);
    return tex;
  }

  function makeTextFace(label,width,height,z,back=false){
    const mat=new THREE.MeshBasicMaterial({
      map:signTexture(label),
      transparent:false,
      side:THREE.FrontSide,
      toneMapped:false
    });
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(width-.10,height-.10),mat);
    plane.position.set(width*.5+.20,0,z);
    if(back)plane.rotation.y=Math.PI;
    plane.userData.fpsNonSolid=true;
    return plane;
  }

  function bladeWidth(label){
    return Math.max(3.35,Math.min(4.60,2.45+label.length*.135));
  }

  function makeBlade(label,height,angle,postIndex,bladeIndex){
    const g=new THREE.Group();
    g.name='V169_SIGN_BLADE_'+postIndex+'_'+bladeIndex;
    g.position.y=height;
    g.rotation.y=angle;
    g.userData.fpsNonSolid=true;

    const width=bladeWidth(label);
    const h=.62;
    const thickness=.14;

    const board=new THREE.Mesh(new THREE.BoxGeometry(width,h,thickness),mats.sign);
    board.position.x=width*.5+.20;
    board.castShadow=true;
    board.receiveShadow=true;
    board.userData.fpsNonSolid=true;
    g.add(board);

    const front=makeTextFace(label,width,h,thickness*.5+.004,false);
    const back=makeTextFace(label,width,h,-thickness*.5-.004,true);
    g.add(front,back);

    // Small reflective end-cap makes the pointing direction legible at night/far view.
    const cap=new THREE.Mesh(
      new THREE.BoxGeometry(.12,h*.78,thickness+.025),
      new THREE.MeshStandardMaterial({
        color:0xf4f6ee,roughness:.42,emissive:0x202820,emissiveIntensity:.08
      })
    );
    cap.position.x=width+.20;
    cap.userData.fpsNonSolid=true;
    g.add(cap);

    return g;
  }

  function directionAngle(fromPx,targetPx){
    const a=worldAt(fromPx[0],fromPx[1]);
    const b=worldAt(targetPx[0],targetPx[1]);
    const dx=b.x-a.x,dz=b.z-a.z;
    return Math.atan2(-dz,dx);
  }

  function makePost(post,postIndex){
    const placement=findRoadsideSignPosition(post);
    const p=placement.position;
    const g=new THREE.Group();
    g.name='V169_WAYFINDING_POST_'+postIndex;
    g.position.set(p.x,.04,p.z);
    g.userData={
      fpsNonSolid:true,
      roadWayfinding:true,
      postId:post.id,
      sourcePx:{junction:[...post.junctionPx],sideHint:[...(post.sideHintPx||post.junctionPx)]},
      resolvedWorld:{x:Number(p.x.toFixed(2)),z:Number(p.z.toFixed(2))},
      roadsidePlacement:{
        valid:placement.valid!==false,
        offsetM:placement.offsetM,
        directionMode:placement.directionMode,
        supportSurface:placement.supportSurface||null,
        sourcePx:placement.sourcePx||null,
        angleDeltaDeg:placement.angleDeltaDeg??null,
        cadSurfaceValidated:placement.cadSurfaceValidated===true,
        roadSafeBefore:placement.roadSafeBefore,
        roadSafeAfter:placement.roadSafeAfter
      }
    };
    g.visible=placement.valid!==false;
    root.add(g);

    const base=new THREE.Mesh(new THREE.CylinderGeometry(.30,.36,.18,12),mats.base);
    base.position.y=.09;
    base.receiveShadow=true;
    base.userData.fpsNonSolid=true;
    g.add(base);

    // V169.5: wayfinding must visually clear the V115 traffic signals.
    // Traffic signal housing tops out at ~5.46 m, so the LOWEST blade begins
    // at 6.35 m and the pole reaches ~9.05 m overall.
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.10,.13,9.00,12),mats.pole);
    pole.position.y=4.55;
    pole.castShadow=true;
    pole.userData.fpsNonSolid=true;
    g.add(pole);

    const heights=[6.35,7.05,7.75,8.45];
    post.blades.forEach((blade,i)=>{
      const route=routeById.get(blade.routeId);
      if(!route)return;
      const angle=directionAngle(post.junctionPx,blade.targetPx);
      const mesh=makeBlade(route.name,heights[i]||4.4,angle,postIndex,i);
      mesh.userData.routeId=route.id;
      mesh.userData.routeName=route.name;
      g.add(mesh);
    });

    return g;
  }

  const postGroups=posts.map(makePost);
  const placements=postGroups.map(g=>({postId:g.userData.postId,resolvedWorld:g.userData.resolvedWorld,...g.userData.roadsidePlacement}));

  const api={
    ready:true,
    version:169.5,
    group:root,
    routes,
    posts,
    postGroups,
    placements,
    setVisible(v){root.visible=!!v;},
    get visible(){return root.visible;}
  };

  window.__DALOC_ROAD_SIGNS_V169=api;
  console.info('[DaLoc] V169.5 road-safe named-road wayfinding signs installed',{
    routes:routes.map(r=>r.name),
    posts:postGroups.length,
    placements,
    frameSignature
  });
  return api;
}
