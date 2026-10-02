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
    version:169.1,
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
  // V169.1: the old manual postPx values are kept only as side hints. Final pole
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

  function roadFreeAt(x,z,radius=.85){
    if(typeof roadSafeInfo!=='function')return true;
    const probes=[[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]];
    return probes.every(([ox,oz])=>!roadSafeInfo(x+ox,z+oz));
  }

  function findRoadsideSignPosition(post){
    const junction=worldAt(post.junctionPx[0],post.junctionPx[1]);
    const targetPx=post.blades?.[0]?.targetPx;
    if(!targetPx){
      return {position:junction,offsetM:0,directionMode:'junction-fallback',roadWidthPx:null,roadSafeAfter:null};
    }

    const target=worldAt(targetPx[0],targetPx[1]);
    let tx=target.x-junction.x,tz=target.z-junction.z;
    let tLen=Math.hypot(tx,tz)||1;
    tx/=tLen;tz/=tLen;
    let nx=-tz,nz=tx;

    // Preserve only the intended corner/side from V169; never reuse its final position.
    const hintPx=post.sideHintPx||post.junctionPx;
    const hint=worldAt(hintPx[0],hintPx[1]);
    let hx=hint.x-junction.x,hz=hint.z-junction.z;
    const hLen=Math.hypot(hx,hz);
    if(hLen>.001){hx/=hLen;hz/=hLen;}
    if(hLen>.001 && hx*nx+hz*nz<0){nx=-nx;nz=-nz;}

    // Measure local cross-road scale after CAD warp. This captures corridor width
    // expansion/contraction better than assuming the original 0.782 m/px everywhere.
    const rdx=targetPx[0]-post.junctionPx[0],rdy=targetPx[1]-post.junctionPx[1];
    const rLen=Math.hypot(rdx,rdy)||1;
    const rawNx=-rdy/rLen,rawNy=rdx/rLen;
    const samplePx=[post.junctionPx[0]+rawNx*4,post.junctionPx[1]+rawNy*4];
    const sample=worldAt(samplePx[0],samplePx[1]);
    const localWorldPerPx=Math.max(.1,Math.hypot(sample.x-junction.x,sample.z-junction.z)/4);

    // At a junction fpsRoadSafeInfo() returns the nearest corridor. Probe the nearby
    // junction area and use the widest touching primary road so the pole clears the
    // full carriageway, not only the narrower safe center corridor.
    let roadInfo=null;
    if(typeof roadSafeInfo==='function'){
      const probeRadius=5.5;
      const probes=[[0,0]];
      for(let k=0;k<12;k++){
        const a=k*Math.PI*2/12;
        probes.push([Math.cos(a)*probeRadius,Math.sin(a)*probeRadius]);
      }
      for(const [ox,oz] of probes){
        const info=roadSafeInfo(junction.x+ox,junction.z+oz);
        if(info && (!roadInfo||(info.widthPx||0)>(roadInfo.widthPx||0)))roadInfo=info;
      }
    }

    const roadWidthPx=roadInfo?.widthPx||18;
    const halfRoadM=Math.max(roadWidthPx*localWorldPerPx*.5,roadInfo?.halfSafe||0);
    const baseOffset=Math.max(6,halfRoadM+2.4,(roadInfo?.halfSafe||0)+2.0);

    const dirs=[{x:nx,z:nz,mode:'road-normal'}];
    if(hLen>.001){
      let bx=nx*.72+hx*.28,bz=nz*.72+hz*.28;
      const bLen=Math.hypot(bx,bz)||1;bx/=bLen;bz/=bLen;
      if(Math.abs(bx*nx+bz*nz)>.45)dirs.push({x:bx,z:bz,mode:'normal-corner-bias'});
      dirs.push({x:hx,z:hz,mode:'side-hint-fallback'});
    }

    let best=null;
    dirs.forEach((dir,dirIndex)=>{
      for(let step=0;step<=36;step++){
        const offset=baseOffset+step*.75;
        const x=junction.x+dir.x*offset,z=junction.z+dir.z*offset;
        if(!roadFreeAt(x,z,.85))continue;
        const score=offset+dirIndex*1.35;
        if(!best||score<best.score)best={x,z,offset,score,mode:dir.mode};
        break;
      }
    });

    if(!best){
      best={x:junction.x+nx*(baseOffset+30),z:junction.z+nz*(baseOffset+30),offset:baseOffset+30,mode:'forced-road-normal'};
    }

    return {
      position:{x:best.x,y:.04,z:best.z},
      offsetM:Number(best.offset.toFixed(2)),
      directionMode:best.mode,
      roadWidthPx,
      localWorldPerPx:Number(localWorldPerPx.toFixed(4)),
      halfRoadM:Number(halfRoadM.toFixed(2)),
      roadSafeBefore:typeof roadSafeInfo==='function'?!!roadSafeInfo(junction.x,junction.z):null,
      roadSafeAfter:typeof roadSafeInfo==='function'?roadSafeInfo(best.x,best.z):null
    };
  }

  function signTexture(label){
    if(textureCache.has(label))return textureCache.get(label);

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
    ctx.font='900 106px Arial, sans-serif';
    ctx.fillText(label,canvas.width/2,canvas.height/2+4);

    const tex=new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=Math.min(8,renderer?.capabilities?.getMaxAnisotropy?.()||4);
    tex.needsUpdate=true;
    textureCache.set(label,tex);
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
        offsetM:placement.offsetM,
        directionMode:placement.directionMode,
        roadWidthPx:placement.roadWidthPx,
        localWorldPerPx:placement.localWorldPerPx,
        halfRoadM:placement.halfRoadM,
        roadSafeBefore:placement.roadSafeBefore,
        roadSafeAfter:placement.roadSafeAfter
      }
    };
    root.add(g);

    const base=new THREE.Mesh(new THREE.CylinderGeometry(.30,.36,.18,12),mats.base);
    base.position.y=.09;
    base.receiveShadow=true;
    base.userData.fpsNonSolid=true;
    g.add(base);

    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.085,.11,5.10,12),mats.pole);
    pole.position.y=2.64;
    pole.castShadow=true;
    pole.userData.fpsNonSolid=true;
    g.add(pole);

    const heights=[2.48,3.12,3.76,4.40];
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
    version:169.1,
    group:root,
    routes,
    posts,
    postGroups,
    placements,
    setVisible(v){root.visible=!!v;},
    get visible(){return root.visible;}
  };

  window.__DALOC_ROAD_SIGNS_V169=api;
  console.info('[DaLoc] V169.1 road-safe named-road wayfinding signs installed',{
    routes:routes.map(r=>r.name),
    posts:postGroups.length,
    placements,
    frameSignature
  });
  return api;
}
