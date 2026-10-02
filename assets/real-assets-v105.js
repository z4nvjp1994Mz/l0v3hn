import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// V105 real-asset helper.
// The GLBs are vendored in this repository under assets/models/kenney/ (CC0).
// Static GLB mesh parts are converted to InstancedMesh batches so using real
// models does not mean one draw call per tree/person.
const loader=new GLTFLoader();
const cache=new Map();

async function loadGLTF(file){
  if(cache.has(file))return cache.get(file);
  const p=loader.loadAsync(new URL(file,import.meta.url));
  cache.set(file,p);
  return p;
}

function buildPrototype(gltf,targetHeight){
  const scene=gltf.scene;
  scene.updateMatrixWorld(true);
  const bbox=new THREE.Box3().setFromObject(scene);
  const size=bbox.getSize(new THREE.Vector3());
  const center=bbox.getCenter(new THREE.Vector3());
  const scale=targetHeight/Math.max(.001,size.y);

  // Root-normalization: center X/Z, feet at Y=0, and scale to target height.
  const normalize=new THREE.Matrix4().makeScale(scale,scale,scale);
  normalize.multiply(new THREE.Matrix4().makeTranslation(-center.x,-bbox.min.y,-center.z));

  const parts=[];
  let hasSkinnedMesh=false;
  scene.traverse(o=>{
    if(!o.isMesh)return;
    o.updateWorldMatrix(true,false);
    if(o.isSkinnedMesh)hasSkinnedMesh=true;
    const matrix=new THREE.Matrix4().multiplyMatrices(normalize,o.matrixWorld);
    parts.push({
      geometry:o.geometry,
      material:o.material,
      matrix,
      name:o.name||'mesh',
      skinned:!!o.isSkinnedMesh
    });
  });
  return {
    gltf,
    scene,
    parts,
    targetHeight,
    sourceHeight:size.y,
    hasSkinnedMesh,
    animations:gltf.animations||[]
  };
}

export async function loadKenneyTreeAssets(){
  const [oak,pine]=await Promise.all([
    loadGLTF('./models/kenney/tree-oak.glb'),
    loadGLTF('./models/kenney/tree-pine.glb')
  ]);
  // Desired base heights are deliberately moderate; per-instance scale adds variety.
  return {
    oak:buildPrototype(oak,6.3),
    pine:buildPrototype(pine,7.4)
  };
}

// V119 internal-landscape tree upgrade.
// Keep the original Kenney GLB as the structural core, then add a compact,
// merged branch network and two irregular crown layers. Because each layer is
// merged into ONE geometry, greenbelt instancing adds only three draw calls
// instead of one draw call per leaf clump/branch.
function transformedGeometry(geometry,position,scale,rotationY=0){
  const g=geometry.clone();
  const matrix=new THREE.Matrix4().compose(
    new THREE.Vector3(position[0],position[1],position[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rotationY,0)),
    new THREE.Vector3(scale[0],scale[1],scale[2])
  );
  g.applyMatrix4(matrix);
  return g;
}

function branchGeometry(start,end,radiusBottom=.13,radiusTop=.07){
  const a=new THREE.Vector3(start[0],start[1],start[2]);
  const b=new THREE.Vector3(end[0],end[1],end[2]);
  const dir=b.clone().sub(a);
  const length=Math.max(.01,dir.length());
  dir.normalize();
  const g=new THREE.CylinderGeometry(radiusTop,radiusBottom,length,8,1,false);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  const matrix=new THREE.Matrix4().compose(
    a.clone().lerp(b,.5),
    q,
    new THREE.Vector3(1,1,1)
  );
  g.applyMatrix4(matrix);
  return g;
}

function buildLushOakPrototype(base){
  const outerBase=new THREE.IcosahedronGeometry(1,2);
  const innerBase=new THREE.IcosahedronGeometry(1,1);

  // Broad, asymmetric crown: much less "single green ball", more like overlapping
  // real foliage masses. The crown is deliberately wider than the source GLB.
  const outerSpecs=[
    [[ 0.00,5.55, 0.00],[1.75,1.30,1.55], .10],
    [[-1.38,5.08, 0.18],[1.38,1.20,1.34],-.35],
    [[ 1.42,5.00,-0.18],[1.46,1.18,1.30], .42],
    [[ 0.18,4.95, 1.25],[1.25,1.04,1.42],-.18],
    [[-0.28,5.08,-1.22],[1.34,1.08,1.36], .28],
    [[-0.78,6.15,-0.38],[1.10, .95,1.06], .62],
    [[ 0.92,6.08, 0.38],[1.12, .92,1.08],-.52]
  ];
  const innerSpecs=[
    [[ 0.00,5.05, 0.00],[1.34,1.08,1.22],0],
    [[-0.78,5.28, 0.56],[ .95, .88, .92],.25],
    [[ 0.86,5.22,-0.52],[ .98, .86, .96],-.32],
    [[ 0.22,5.78,-0.58],[ .90, .78, .86],.48]
  ];

  const outerGeo=mergeGeometries(
    outerSpecs.map(([p,sc,r])=>transformedGeometry(outerBase,p,sc,r)),
    false
  );
  const innerGeo=mergeGeometries(
    innerSpecs.map(([p,sc,r])=>transformedGeometry(innerBase,p,sc,r)),
    false
  );

  const branchGeo=mergeGeometries([
    branchGeometry([0,2.25,0],[-.72,4.55,.22],.18,.085),
    branchGeometry([0,2.45,0],[ .82,4.52,-.18],.18,.082),
    branchGeometry([0,2.75,0],[ .18,4.60, .86],.15,.068),
    branchGeometry([0,2.82,0],[-.22,4.62,-.88],.15,.068),
    branchGeometry([-.35,3.55,.10],[-1.35,4.72,.28],.105,.045),
    branchGeometry([ .38,3.58,-.08],[ 1.42,4.70,-.30],.105,.045)
  ],false);

  outerGeo?.computeVertexNormals();
  innerGeo?.computeVertexNormals();
  branchGeo?.computeVertexNormals();

  const leafOuter=new THREE.MeshStandardMaterial({
    color:0x5b9848,
    roughness:.92,
    metalness:0,
    flatShading:false
  });
  const leafInner=new THREE.MeshStandardMaterial({
    color:0x3f7739,
    roughness:.96,
    metalness:0,
    flatShading:false
  });
  const branchMat=new THREE.MeshStandardMaterial({
    color:0x745039,
    roughness:.95,
    metalness:0
  });

  const extra=[];
  if(branchGeo)extra.push({
    geometry:branchGeo,material:branchMat,matrix:new THREE.Matrix4(),
    name:'V119_LUSH_BRANCH_NETWORK',skinned:false
  });
  if(innerGeo)extra.push({
    geometry:innerGeo,material:leafInner,matrix:new THREE.Matrix4(),
    name:'V119_LUSH_CROWN_INNER',skinned:false
  });
  if(outerGeo)extra.push({
    geometry:outerGeo,material:leafOuter,matrix:new THREE.Matrix4(),
    name:'V119_LUSH_CROWN_OUTER',skinned:false
  });

  return {
    ...base,
    parts:[...base.parts,...extra],
    lushV119:true,
    lushExtraParts:extra.length
  };
}

export async function loadLushKenneyTreeAssets(){
  const base=await loadKenneyTreeAssets();
  return {
    oak:buildLushOakPrototype(base.oak),
    // Pines retain their original silhouette; the user's requested roadside
    // broadleaf upgrade should not turn conifers into rounded crowns.
    pine:base.pine
  };
}


// V121: guaranteed lush street-tree prototype for the main-road greenbelt.
// This is intentionally independent of GLB loading so boulevard trees can never
// fall back to the old round Dodecahedron silhouette.
export function createLushStreetTreePrototypeV121(){
  const crownBaseHi=new THREE.IcosahedronGeometry(1,2);
  const crownBaseLo=new THREE.IcosahedronGeometry(1,1);

  const woodGeo=mergeGeometries([
    branchGeometry([0,0,0],[0,4.25,0],.34,.22),
    branchGeometry([0,2.55,0],[-.95,4.78,.26],.18,.075),
    branchGeometry([0,2.72,0],[1.06,4.72,-.22],.18,.075),
    branchGeometry([.02,2.92,0],[.28,4.95,1.04],.15,.060),
    branchGeometry([-.03,3.04,0],[-.34,4.92,-1.02],.15,.060),
    branchGeometry([-.45,3.68,.12],[-1.42,4.82,.48],.10,.040),
    branchGeometry([.50,3.72,-.10],[1.48,4.80,-.44],.10,.040)
  ],false);

  const outerSpecs=[
    [[ 0.00,5.58, 0.00],[1.90,1.38,1.72], .05],
    [[-1.48,5.16, 0.22],[1.48,1.24,1.40],-.30],
    [[ 1.48,5.10,-0.25],[1.55,1.26,1.38], .36],
    [[ 0.20,5.12, 1.42],[1.34,1.12,1.46],-.18],
    [[-0.30,5.20,-1.40],[1.38,1.13,1.44], .26],
    [[-0.92,6.25,-0.36],[1.18,1.00,1.12], .55],
    [[ 0.98,6.18, 0.42],[1.20,.98,1.15],-.48],
    [[ 0.02,6.55,-0.10],[1.14,.91,1.08], .14],
    [[-1.55,5.82,-0.62],[.96,.84,.92], .32],
    [[ 1.58,5.76, 0.64],[.98,.84,.96],-.22]
  ];
  const innerSpecs=[
    [[ 0.00,5.10, 0.00],[1.42,1.10,1.30],0],
    [[-.82,5.38, .62],[1.00,.90,.98], .28],
    [[ .90,5.30,-.58],[1.02,.90,1.00],-.34],
    [[ .22,5.88,-.62],[.94,.82,.90], .50],
    [[-.30,5.75, .82],[.88,.78,.86],-.18]
  ];

  const outerGeo=mergeGeometries(
    outerSpecs.map(([p,sc,r])=>transformedGeometry(crownBaseHi,p,sc,r)),
    false
  );
  const innerGeo=mergeGeometries(
    innerSpecs.map(([p,sc,r])=>transformedGeometry(crownBaseLo,p,sc,r)),
    false
  );

  woodGeo?.computeVertexNormals();
  outerGeo?.computeVertexNormals();
  innerGeo?.computeVertexNormals();

  const barkMat=new THREE.MeshStandardMaterial({
    color:0x73503a,roughness:.97,metalness:0
  });
  const leafInnerMat=new THREE.MeshStandardMaterial({
    color:0x3d7437,roughness:.97,metalness:0
  });
  const leafOuterMat=new THREE.MeshStandardMaterial({
    color:0x5f984a,roughness:.93,metalness:0
  });

  const parts=[];
  if(woodGeo)parts.push({
    geometry:woodGeo,material:barkMat,matrix:new THREE.Matrix4(),
    name:'V121_STREET_TREE_WOOD',skinned:false
  });
  if(innerGeo)parts.push({
    geometry:innerGeo,material:leafInnerMat,matrix:new THREE.Matrix4(),
    name:'V121_STREET_TREE_INNER_CROWN',skinned:false
  });
  if(outerGeo)parts.push({
    geometry:outerGeo,material:leafOuterMat,matrix:new THREE.Matrix4(),
    name:'V121_STREET_TREE_OUTER_CROWN',skinned:false
  });

  return {
    parts,
    hasSkinnedMesh:false,
    targetHeight:7.5,
    sourceHeight:7.5,
    lushStreetTreeV121:true
  };
}

export async function loadKenneyCharacterAssets(){
  const [male,female]=await Promise.all([
    loadGLTF('./models/kenney/character-male-a.glb'),
    loadGLTF('./models/kenney/character-female-a.glb')
  ]);
  return {
    male:buildPrototype(male,1.73),
    female:buildPrototype(female,1.68)
  };
}


export async function loadKenneyFpsArmsAssetV129(){
  const [arms,male]=await Promise.all([
    loadGLTF('./models/kenney/fps-arms-male-a.glb'),
    loadGLTF('./models/kenney/character-male-a.glb')
  ]);
  const full=buildPrototype(male,1.73);
  return {
    scene:arms.scene,
    animations:arms.animations||[],
    targetHeight:1.73,
    normalizationSourceHeight:full.sourceHeight,
    centerVertically:true,
    armOnlyV129:true
  };
}

export function createAnimatedCharacterInstance(prototype,{
  name='V105_KENNEY_CHARACTER',
  clip='walk',
  castShadow=true,
  receiveShadow=true
}={}){
  if(!prototype?.scene)return null;
  const model=skeletonClone(prototype.scene);
  model.name=name+'_MODEL';

  // Normalize the cloned skinned model to human scale without touching bones.
  model.updateMatrixWorld(true);
  let box=new THREE.Box3().setFromObject(model);
  let size=box.getSize(new THREE.Vector3());
  const normalizationHeight=
    prototype.normalizationSourceHeight||size.y;
  const scale=prototype.targetHeight/Math.max(.001,normalizationHeight);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  box=new THREE.Box3().setFromObject(model);
  const center=box.getCenter(new THREE.Vector3());
  model.position.x-=center.x;
  model.position.z-=center.z;
  if(prototype.centerVertically)model.position.y-=center.y;
  else model.position.y-=box.min.y;
  model.updateMatrixWorld(true);

  model.traverse(o=>{
    if(!o.isMesh)return;
    o.castShadow=castShadow;
    o.receiveShadow=receiveShadow;
    o.frustumCulled=true;
  });

  const wrapper=new THREE.Group();
  wrapper.name=name;
  wrapper.add(model);

  const mixer=new THREE.AnimationMixer(model);
  const clips=prototype.animations||[];
  const selected=
    THREE.AnimationClip.findByName(clips,clip) ||
    THREE.AnimationClip.findByName(clips,'walk') ||
    THREE.AnimationClip.findByName(clips,'idle') ||
    clips[0] || null;
  let action=null;
  if(selected){
    action=mixer.clipAction(selected);
    action.play();
  }

  return {wrapper,model,mixer,action,clip:selected?.name||null};
}

export function createPrototypeGroup(prototype,{
  name='V105_REAL_ASSET_GROUP',
  castShadow=true,
  receiveShadow=true
}={}){
  if(!prototype?.parts?.length)return null;
  const g=new THREE.Group();
  g.name=name;
  for(let i=0;i<prototype.parts.length;i++){
    const part=prototype.parts[i];
    if(part.skinned)continue;
    const mesh=new THREE.Mesh(part.geometry,part.material);
    mesh.name=name+'_PART_'+i;
    mesh.matrixAutoUpdate=false;
    mesh.matrix.copy(part.matrix);
    mesh.castShadow=castShadow;
    mesh.receiveShadow=receiveShadow;
    g.add(mesh);
  }
  return g;
}

export function createStaticInstancedAsset(group,prototype,placements,{
  name='V105_ASSET',
  castShadow=false,
  receiveShadow=true
}={}){
  if(!prototype?.parts?.length||!placements?.length)return {meshes:[],count:0};
  if(prototype.hasSkinnedMesh)throw new Error(name+' cannot instance skinned GLB');

  const meshes=[];
  const instanceMatrix=new THREE.Matrix4();
  for(let partIndex=0;partIndex<prototype.parts.length;partIndex++){
    const part=prototype.parts[partIndex];
    const mesh=new THREE.InstancedMesh(part.geometry,part.material,placements.length);
    mesh.name=name+'_PART_'+partIndex;
    mesh.castShadow=castShadow;
    mesh.receiveShadow=receiveShadow;
    placements.forEach((p,i)=>{
      const pos=p.position||new THREE.Vector3(p.x||0,p.y||0,p.z||0);
      const rotY=p.rotationY??p.rot??0;
      const scale=p.scale??1;
      const place=new THREE.Matrix4().compose(
        pos,
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rotY,0)),
        new THREE.Vector3(scale,scale,scale)
      );
      instanceMatrix.multiplyMatrices(place,part.matrix);
      mesh.setMatrixAt(i,instanceMatrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  }
  return {meshes,count:placements.length,prototype};
}

export function createDynamicInstancedAsset(group,prototype,count,{
  name='V105_DYNAMIC_ASSET',
  castShadow=true,
  receiveShadow=true
}={}){
  if(!prototype?.parts?.length||count<=0)return null;
  if(prototype.hasSkinnedMesh)return null;

  const meshes=prototype.parts.map((part,partIndex)=>{
    const mesh=new THREE.InstancedMesh(part.geometry,part.material,count);
    mesh.name=name+'_PART_'+partIndex;
    mesh.castShadow=castShadow;
    mesh.receiveShadow=receiveShadow;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  });

  const temp=new THREE.Matrix4();
  function setMatrixAt(index,placementMatrix){
    for(let p=0;p<prototype.parts.length;p++){
      temp.multiplyMatrices(placementMatrix,prototype.parts[p].matrix);
      meshes[p].setMatrixAt(index,temp);
    }
  }
  function commit(){
    for(const mesh of meshes){
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
    }
  }
  return {meshes,count,prototype,setMatrixAt,commit};
}
