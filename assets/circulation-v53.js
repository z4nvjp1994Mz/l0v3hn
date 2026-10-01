import * as THREE from 'three';

// Source pixels determine positions, not visible material colours.
export async function installCirculationV53({world,mapPx,frameSignature,renderer,camera,controls,showUI=true}) {
  const [response,accessResponse]=await Promise.all([
    fetch(new URL('./circulation-v53.json',import.meta.url)),
    fetch(new URL('./cad-access-v75.json',import.meta.url))
  ]);
  if(!response.ok) throw new Error('Circulation data: HTTP '+response.status);
  if(!accessResponse.ok) throw new Error('CAD access data: HTTP '+accessResponse.status);
  const data=await response.json();
  const accessData=await accessResponse.json();
  if(data.frameSignature!==frameSignature) throw new Error('Circulation coordinate frame mismatch');
  const group=new THREE.Group(); group.name='CIRCULATION_V53'; group.userData.source=data.source;
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  function texture(kind){
    const c=document.createElement('canvas');c.width=c.height=256;
    const ctx=c.getContext('2d'),img=ctx.createImageData(256,256);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      let h=Math.imul(x+13,374761393)^Math.imul(y+71,668265263);h=Math.imul(h^(h>>>13),1274126177);
      const noise=((h^(h>>>16))>>>0)/4294967295-.5,k=(y*256+x)*4;let rgb;
      if(kind==='asphalt')rgb=[108+noise*12,113+noise*12,112+noise*12];
      else if(kind==='height')rgb=[128+noise*45,128+noise*45,128+noise*45];
      else if(kind==='grass')rgb=[92+noise*13,137+noise*17,72+noise*10];
      else rgb=x%64<2||y%64<2?[170,173,167]:[199+noise*5,200+noise*5,192+noise*5];
      img.data[k]=rgb[0];img.data[k+1]=rgb[1];img.data[k+2]=rgb[2];img.data[k+3]=255;
    }
    ctx.putImageData(img,0,0);const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=kind==='height'?THREE.NoColorSpace:THREE.SRGBColorSpace;
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=anisotropy;return tex;
  }
  const materials={
    carriageway:new THREE.MeshStandardMaterial({map:texture('asphalt'),bumpMap:texture('height'),bumpScale:.005,roughness:.97}),
    curb:new THREE.MeshStandardMaterial({color:0xbfc2b8,roughness:.95}),
    sidewalk:new THREE.MeshStandardMaterial({map:texture('pavers'),roughness:.96}),
    greenbelt:new THREE.MeshStandardMaterial({map:texture('grass'),roughness:1})
  };
  const specs={carriageway:[0,.10,2],curb:[0,.28,2],sidewalk:[.10,.13,1.6],greenbelt:[0,.14,2]};

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
    const p=points.slice(0,-1).map(([x,y])=>{const v=mapPx(x,y);return new THREE.Vector2(v.x,-v.z);});
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
    if(inCadAccess(p.x,p.y)){
      o.userData.hiddenByCadAccess=true;
      o.visible=false;
    }
  });

  const existing=world.children.filter(o=>o.userData.isTreeGroup).map(o=>o.position),planting=[];
  // Supplementary planting belongs ONLY to the green belt. Existing tree positions never move.
  for(const path of data.paths){
    let accumulated=0;
    for(let i=1;i<path.pointsPx.length;i++){
      const a=path.pointsPx[i-1],b=path.pointsPx[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;
      for(let t=14-accumulated;t<len;t+=14)for(const side of [-1,1]){
        const off=path.widthPx/2+1.93/.782+3.7;
        const x=a[0]+dx*t/len-side*dy/len*off,y=a[1]+dy*t/len+side*dx/len*off,v=mapPx(x,y);
        if(!inGreen(x,y)||inCadAccess(x,y)||existing.some(p=>Math.hypot(p.x-v.x,p.z-v.z)<4.5))continue;
        let safe=true;for(let k=0;k<8;k++){const tx=x+Math.cos(k*Math.PI/4)*2,ty=y+Math.sin(k*Math.PI/4)*2;if(!inGreen(tx,ty)||inCadAccess(tx,ty))safe=false;}
        if(safe&&!planting.some(p=>Math.hypot(p.x-v.x,p.z-v.z)<7))planting.push(v);
      }accumulated=(accumulated+len)%14;
    }
  }
  if(planting.length){
    const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.20,2.8,6),new THREE.MeshStandardMaterial({color:0x79533b,roughness:1}),planting.length);
    const crown=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.25,1),new THREE.MeshStandardMaterial({color:0x4c8147,roughness:1}),planting.length);
    const tip=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.95,1),new THREE.MeshStandardMaterial({color:0x619653,roughness:1}),planting.length);
    const dummy=new THREE.Object3D();planting.forEach((p,i)=>{
      dummy.position.set(p.x,1.54,p.z);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
      dummy.position.y=3.1;dummy.updateMatrix();crown.setMatrixAt(i,dummy.matrix);
      dummy.position.y=4.05;dummy.updateMatrix();tip.setMatrixAt(i,dummy.matrix);
    });
    for(const mesh of [trunk,crown,tip]){mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
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
  window.__DALOC_V53={ready:true,version:76,frameSignature,areasPx2:data.areasPx2,layers:Object.keys(data.layers),newGreenbeltTrees:planting.length,cadAccessCount:(accessData.accesses||[]).length,
    focus:(px,py,height=450)=>{const p=mapPx(px,py);controls.target.set(p.x,0,p.z);camera.position.set(p.x+height*.22,height,p.z+height*.30);controls.update();}};
  return {group,plantingCount:planting.length,cadAccessCount:(accessData.accesses||[]).length};
}
