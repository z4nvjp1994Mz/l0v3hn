import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
