import * as THREE from 'three';

// Source pixels determine positions, not visible material colours.
export async function installCirculationV53({world,mapPx,frameSignature,renderer,camera,controls}) {
  const response=await fetch(new URL('./circulation-v53.json',import.meta.url));
  if(!response.ok) throw new Error('Circulation data: HTTP '+response.status);
  const data=await response.json();
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
  const existing=world.children.filter(o=>o.userData.isTreeGroup).map(o=>o.position),planting=[];
  // Supplementary planting belongs ONLY to the green belt. Existing tree positions never move.
  for(const path of data.paths){
    let accumulated=0;
    for(let i=1;i<path.pointsPx.length;i++){
      const a=path.pointsPx[i-1],b=path.pointsPx[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;
      for(let t=14-accumulated;t<len;t+=14)for(const side of [-1,1]){
        const off=path.widthPx/2+1.93/.782+3.7;
        const x=a[0]+dx*t/len-side*dy/len*off,y=a[1]+dy*t/len+side*dx/len*off,v=mapPx(x,y);
        if(!inGreen(x,y)||existing.some(p=>Math.hypot(p.x-v.x,p.z-v.z)<4.5))continue;
        let safe=true;for(let k=0;k<8;k++)if(!inGreen(x+Math.cos(k*Math.PI/4)*2,y+Math.sin(k*Math.PI/4)*2))safe=false;
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
  world.add(group);
  const button=document.createElement('button');button.textContent='Road layer: On';button.className='active';button.id='roadLayerV53';
  button.onclick=()=>{group.visible=!group.visible;button.classList.toggle('active',group.visible);button.textContent='Road layer: '+(group.visible?'On':'Off');};
  document.querySelector('.controls').appendChild(button);
  const review=document.createElement('button');review.textContent='Compare 2D';review.onclick=()=>window.open('./road-review-v53.html','_blank','noopener');document.querySelector('.controls').appendChild(review);
  window.__DALOC_V53={ready:true,version:53,frameSignature,areasPx2:data.areasPx2,layers:Object.keys(data.layers),newGreenbeltTrees:planting.length,
    focus:(px,py,height=450)=>{const p=mapPx(px,py);controls.target.set(p.x,0,p.z);camera.position.set(p.x+height*.22,height,p.z+height*.30);controls.update();}};
  return {group,plantingCount:planting.length};
}
