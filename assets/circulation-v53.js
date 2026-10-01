import * as THREE from 'three';
import { buildCadCorridorWarpV91 } from './corridor-warp-v91.js?v=91';
import { loadKenneyTreeAssets, createStaticInstancedAsset, createPrototypeGroup } from './real-assets-v105.js?v=1051';

// Source pixels determine positions, not visible material colours.
export async function installCirculationV53({world,mapPx,frameSignature,renderer,camera,controls,showUI=true}) {
  const [response,accessResponse,cadResponse]=await Promise.all([
    fetch(new URL('./circulation-v53.json',import.meta.url)),
    fetch(new URL('./cad-access-v75.json',import.meta.url)),
    fetch(new URL('./cad-source-v72.json',import.meta.url))
  ]);
  if(!response.ok) throw new Error('Circulation data: HTTP '+response.status);
  if(!accessResponse.ok) throw new Error('CAD access data: HTTP '+accessResponse.status);
  if(!cadResponse.ok) throw new Error('CAD source data: HTTP '+cadResponse.status);
  const data=await response.json();
  const accessData=await accessResponse.json();
  const cadData=await cadResponse.json();
  if(data.frameSignature!==frameSignature||cadData.frameSignature!==frameSignature) throw new Error('Circulation/CAD coordinate frame mismatch');
  const corridorWarpV91=buildCadCorridorWarpV91({circulation:data,cad:cadData});
  const group=new THREE.Group(); group.name='CIRCULATION_V53'; group.userData.source=data.source;
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  // V104 lightweight diorama surface library. These textures are generated once
  // at startup, tiled by UV, and add zero post-processing cost per frame.
  function texture(kind){
    const size=256;
    const c=document.createElement('canvas');c.width=c.height=size;
    const ctx=c.getContext('2d'),img=ctx.createImageData(size,size);
    const hash=(x,y)=>{
      let h=Math.imul(x+13,374761393)^Math.imul(y+71,668265263);
      h=Math.imul(h^(h>>>13),1274126177);
      return ((h^(h>>>16))>>>0)/4294967295;
    };
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const n=hash(x,y)-.5;
      const fine=hash(x*7+19,y*11+31)-.5;
      const k=(y*size+x)*4;
      let r,g,b;

      if(kind==='asphalt'||kind==='asphaltHeight'){
        // Fine aggregate + faint rolling tonal variation. No large visible repeat.
        const coarse=Math.sin(x*.031)+Math.cos(y*.027)+Math.sin((x+y)*.017);
        const speck=(hash(x*17,y*23)>.965)?-18:0;
        const v=n*11+fine*6+coarse*1.7+speck;
        if(kind==='asphaltHeight')r=g=b=128+v*2.3;
        else {r=91+v;g=96+v;b=95+v;}
      }else if(kind==='grass'){
        const wave=Math.sin(x*.047)+Math.cos(y*.039);
        r=90+n*12+wave*2;g=137+n*17+wave*3;b=72+n*10+wave*1.5;
      }else{
        // Staggered 0.8 x 0.4 m concrete pavers with darker recessed joints.
        const tileW=64,tileH=32;
        const row=Math.floor(y/tileH);
        const xx=(x+(row%2)*tileW/2)%tileW;
        const yy=y%tileH;
        const joint=xx<2||xx>tileW-3||yy<2||yy>tileH-3;
        const tileTone=((Math.floor((x+(row%2)*tileW/2)/tileW)+row)%4-1.5)*2.2;
        if(kind==='paverHeight'){
          r=g=b=joint?92:148+n*9;
        }else{
          const base=joint?164:202+tileTone+n*6;
          r=base+1;g=base;b=base-4;
        }
      }
      img.data[k]=Math.max(0,Math.min(255,r));
      img.data[k+1]=Math.max(0,Math.min(255,g));
      img.data[k+2]=Math.max(0,Math.min(255,b));
      img.data[k+3]=255;
    }
    ctx.putImageData(img,0,0);
    const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=(kind==='asphaltHeight'||kind==='paverHeight')?THREE.NoColorSpace:THREE.SRGBColorSpace;
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.anisotropy=anisotropy;
    return tex;
  }
  const materials={
    carriageway:new THREE.MeshStandardMaterial({
      map:texture('asphalt'),bumpMap:texture('asphaltHeight'),bumpScale:.018,
      color:0xffffff,roughness:.93,metalness:.015
    }),
    curb:new THREE.MeshStandardMaterial({color:0xc7c8c2,roughness:.90}),
    sidewalk:new THREE.MeshStandardMaterial({
      map:texture('pavers'),bumpMap:texture('paverHeight'),bumpScale:.022,
      color:0xffffff,roughness:.90
    }),
    greenbelt:new THREE.MeshStandardMaterial({map:texture('grass'),roughness:1})
  };
  const specs={carriageway:[0,.10,2.5],curb:[0,.28,2],sidewalk:[.10,.13,1.35],greenbelt:[0,.14,2]};

  // V76: cut grass at CAD-verified access openings. No overlay mesh is created.
  // The greenbelt shader discards only fragments inside CAD opening rectangles,
  // so the existing scene underneath is revealed directly.
  const accessCuts=(accessData.accesses||[]).map(access=>{
    const c=mapPx(access.centerPx[0],access.centerPx[1]);
    const ux=access.along[0],uz=access.along[1];
    const len=Math.hypot(ux,uz)||1;
    const ax=ux/len,az=uz/len;
    return {
      cx:c.x,cz:c.z,
      ax,az,nx:-az,nz:ax,
      halfW:access.openingWidthPx*.5*.782,
      halfD:access.crossDepthPx*.5*.782
    };
  });
  if(accessCuts.length){
    const cutTests=accessCuts.map((r,i)=>{
      const d='d'+i;
      return 'vec2 '+d+'=vCadCutXZ-vec2('+r.cx.toFixed(6)+','+r.cz.toFixed(6)+');'+
        'if(abs(dot('+d+',vec2('+r.ax.toFixed(9)+','+r.az.toFixed(9)+')))<= '+r.halfW.toFixed(6)+
        ' && abs(dot('+d+',vec2('+r.nx.toFixed(9)+','+r.nz.toFixed(9)+')))<= '+r.halfD.toFixed(6)+') discard;';
    }).join('\n');
    materials.greenbelt.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>','#include <common>\nvarying vec2 vCadCutXZ;')
        .replace('#include <project_vertex>','#include <project_vertex>\nvec4 cadCutWorld=modelMatrix*vec4(transformed,1.0);\nvCadCutXZ=cadCutWorld.xz;');
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>','#include <common>\nvarying vec2 vCadCutXZ;')
        .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+cutTests);
    };
    materials.greenbelt.customProgramCacheKey=()=>('V76_CAD_GRASS_CUTS_'+accessCuts.length);
    materials.greenbelt.needsUpdate=true;
  }

  function ring(points,clockwise){
    const p=points.slice(0,-1).map(([x,y])=>{
      const q=corridorWarpV91.warpPx(x,y);
      const v=mapPx(q.x,q.y);
      return new THREE.Vector2(v.x,-v.z);
    });
    if(THREE.ShapeUtils.isClockWise(p)!==clockwise)p.reverse();return p;
  }
  for(const name of ['greenbelt','sidewalk','curb','carriageway']){
    const polygons=data.layers[name];if(!polygons?.length)throw new Error('Empty circulation layer: '+name);
    const shapes=polygons.map(p=>{const shape=new THREE.Shape(ring(p.outer,true));shape.holes=p.holes.map(h=>new THREE.Path(ring(h,false)));return shape;});
    const [base,depth,tileMeters]=specs[name];
    const geometry=new THREE.ExtrudeGeometry(shapes,{depth,bevelEnabled:false,steps:1,curveSegments:1});geometry.rotateX(-Math.PI/2);
    const pos=geometry.attributes.position,uv=new Float32Array(pos.count*2);
    for(let i=0;i<pos.count;i++){uv[i*2]=pos.getX(i)/tileMeters;uv[i*2+1]=pos.getZ(i)/tileMeters;}
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(geometry,materials[name]);mesh.name='V53_'+name.toUpperCase();mesh.position.y=base;mesh.receiveShadow=true;
    // Four opaque, disjoint meshes. No flood-filled alpha mask or full-sheet asphalt plane.
    mesh.userData={layer:name,siteFrameSignature:frameSignature,walkable:name!=='greenbelt'};group.add(mesh);
  }
  function insideRing(x,y,points){
    let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }return inside;
  }
  const green=data.layers.greenbelt;
  const inGreen=(x,y)=>green.some(p=>insideRing(x,y,p.outer)&&!p.holes.some(h=>insideRing(x,y,h)));

  // V75: authoritative openings come from discontinuities in CAD layer HTKT_GT_HEDUONG.
  // These replace the old roof-derived V58 no-plant guesses.
  const cadAccessPolygons=(accessData.accesses||[]).map(a=>a.polygonPx);
  const inCadAccess=(x,y)=>cadAccessPolygons.some(poly=>insideRing(x,y,poly));


  // Existing masterplan trees must also respect the CAD openings.
  world.traverse(o=>{
    if(!o.userData?.isTreeGroup||!o.userData?.masterplanPx)return;
    const p=o.userData.masterplanPx;
    const q=corridorWarpV91.warpPx(p.x,p.y);
    if(q.weight>.001){
      const v=mapPx(q.x,q.y);
      o.position.x=v.x;
      o.position.z=v.z;
      o.userData.cadWarpV91={x:q.x,y:q.y,weight:q.weight};
    }
    if(inCadAccess(q.x,q.y)){
      o.userData.hiddenByCadAccess=true;
      o.visible=false;
    }
  });

  // V105: replace the old cylinder/icosahedron roadside tree Groups with actual
  // vendored Kenney Nature Kit GLBs. The wrapper Groups are preserved so all
  // later CAD-access/gate/road-safety visibility logic keeps working unchanged.
  const realTreeAssets=await loadKenneyTreeAssets().catch(error=>{
    console.error('[DaLoc] V105 roadside real-tree asset fallback',error);
    return null;
  });
  let upgradedLegacyTrees=0;
  if(realTreeAssets){
    const legacyTreeGroups=world.children.filter(o=>o.userData?.isTreeGroup);
    legacyTreeGroups.forEach((g,i)=>{
      let inferredScale=1;
      const oldTrunk=g.children.find(c=>c.geometry?.type==='CylinderGeometry'&&c.geometry?.parameters?.height);
      if(oldTrunk)inferredScale=Math.max(.72,Math.min(1.45,oldTrunk.geometry.parameters.height/4.2));
      g.clear();
      const usePine=i%7===0;
      const visual=createPrototypeGroup(usePine?realTreeAssets.pine:realTreeAssets.oak,{
        name:'V105_ROADSIDE_TREE_'+i,castShadow:true,receiveShadow:true
      });
      if(!visual)return;
      visual.scale.setScalar(inferredScale*(usePine?.90:1.0));
      g.add(visual);
      g.userData.realTreeAssetV105=usePine?'kenney-pine':'kenney-oak';
      upgradedLegacyTrees++;
    });
  }

  const existing=world.children.filter(o=>o.userData.isTreeGroup).map(o=>o.position),planting=[];
  // Supplementary planting belongs ONLY to the green belt. Existing tree positions never move.
  for(const path of data.paths){
    let accumulated=0;
    for(let i=1;i<path.pointsPx.length;i++){
      const a=path.pointsPx[i-1],b=path.pointsPx[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;
      for(let t=14-accumulated;t<len;t+=14)for(const side of [-1,1]){
        const off=path.widthPx/2+1.93/.782+3.7;
        const x=a[0]+dx*t/len-side*dy/len*off,y=a[1]+dy*t/len+side*dx/len*off;
        const q=corridorWarpV91.warpPx(x,y),v=mapPx(q.x,q.y);
        if(!inGreen(x,y)||inCadAccess(q.x,q.y)||existing.some(p=>Math.hypot(p.x-v.x,p.z-v.z)<4.5))continue;
        let safe=true;
        for(let k=0;k<8;k++){
          const tx=x+Math.cos(k*Math.PI/4)*2,ty=y+Math.sin(k*Math.PI/4)*2;
          const tq=corridorWarpV91.warpPx(tx,ty);
          if(!inGreen(tx,ty)||inCadAccess(tq.x,tq.y))safe=false;
        }
        if(safe&&!planting.some(p=>Math.hypot(p.x-v.x,p.z-v.z)<7))planting.push(v);
      }accumulated=(accumulated+len)%14;
    }
  }
  if(planting.length){
    if(realTreeAssets){
      const oak=[],pine=[];
      planting.forEach((p,i)=>{
        const item={
          position:new THREE.Vector3(p.x,.05,p.z),
          rotationY:(i*.61803398875%1)*Math.PI*2,
          scale:i%6===0?.64:.72
        };
        (i%6===0?pine:oak).push(item);
      });
      createStaticInstancedAsset(group,realTreeAssets.oak,oak,{
        name:'V105_GREENBELT_OAKS',castShadow:true,receiveShadow:true
      });
      createStaticInstancedAsset(group,realTreeAssets.pine,pine,{
        name:'V105_GREENBELT_PINES',castShadow:true,receiveShadow:true
      });
    }else{
      const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.20,2.8,8),new THREE.MeshStandardMaterial({color:0x79533b,roughness:1}),planting.length);
      const crown=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.25,1),new THREE.MeshStandardMaterial({color:0x4c8147,roughness:1}),planting.length);
      const dummy=new THREE.Object3D();planting.forEach((p,i)=>{
        dummy.position.set(p.x,1.54,p.z);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
        dummy.position.y=3.3;dummy.updateMatrix();crown.setMatrixAt(i,dummy.matrix);
      });
      for(const mesh of [trunk,crown]){mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
    }
  }
  // Clip legacy approximate park fills where they used to overhang the measured roads.
  // Trees, benches, materials and park areas away from the corridor remain unchanged.
  const semantic=world.getObjectByName('semantic2D3D');
  if(semantic)for(const clip of data.legacySurfaceClips||[]){
    const [x0,y0,x1,y1]=clip.boundsPx,lo=mapPx(x0,y1),hi=mapPx(x1,y0);
    const mesh=semantic.children.find(o=>{
      if(o.geometry?.type!=='ShapeGeometry')return false;
      o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
      return Math.abs(b.min.x-lo.x)<.05&&Math.abs(b.max.x-hi.x)<.05&&Math.abs(b.min.y+lo.z)<.05&&Math.abs(b.max.y+hi.z)<.05;
    });
    if(!mesh)continue;
    const shapes=clip.polygons.map(p=>{const shape=new THREE.Shape(ring(p.outer,true));shape.holes=p.holes.map(h=>new THREE.Path(ring(h,false)));return shape;});
    if(!shapes.length){mesh.visible=false;continue;}
    const old=mesh.geometry;mesh.geometry=new THREE.ShapeGeometry(shapes);old.dispose();
  }
  world.add(group);
  if(showUI){
    const button=document.createElement('button');button.textContent='Road layer: On';button.className='active';button.id='roadLayerV53';
    button.onclick=()=>{group.visible=!group.visible;button.classList.toggle('active',group.visible);button.textContent='Road layer: '+(group.visible?'On':'Off');};
    document.querySelector('.controls').appendChild(button);
    const review=document.createElement('button');review.id='compare2DV53';review.textContent='Compare 2D';review.onclick=()=>window.open('./road-review-v53.html','_blank','noopener');document.querySelector('.controls').appendChild(review);
  }
  window.__DALOC_V53={ready:true,version:105,frameSignature,areasPx2:data.areasPx2,layers:Object.keys(data.layers),newGreenbeltTrees:planting.length,cadAccessCount:(accessData.accesses||[]).length,cadCorridorWarp:corridorWarpV91,upgradedLegacyTrees,treeAssetMode:realTreeAssets?'kenney-glb':'fallback',
    focus:(px,py,height=450)=>{const p=mapPx(px,py);controls.target.set(p.x,0,p.z);camera.position.set(p.x+height*.22,height,p.z+height*.30);controls.update();}};
  return {group,plantingCount:planting.length,cadAccessCount:(accessData.accesses||[]).length};
}
