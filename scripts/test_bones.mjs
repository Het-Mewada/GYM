import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

global.self = {
  URL: {
    createObjectURL: () => 'blob:mock'
  }
};

const data = fs.readFileSync('apps/web/public/assets/home/human-lifter.glb');
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const bones = {};
  gltf.scene.traverse((o) => {
    if (o.isBone) {
      bones[o.name] = o;
    }
  });
  console.log('Bones found:', Object.keys(bones));
  
  // Let's print out the hierarchy starting from Hips
  function printHierarchy(bone, depth = 0) {
    console.log(' '.repeat(depth * 2) + bone.name + ' pos: [' + bone.position.toArray().map(v=>v.toFixed(3)).join(', ') + '] rot: [' + bone.rotation.toArray().slice(0,3).map(v=>v.toFixed(3)).join(', ') + ']');
    for (const child of bone.children) {
      if (child.isBone) {
        printHierarchy(child, depth + 1);
      }
    }
  }
  
  const hips = bones['mixamorigHips'] || bones['Hips'];
  if (hips) {
    console.log('=== HIERARCHY ===');
    printHierarchy(hips);
  } else {
    console.log('No hips found, root bones:', Object.values(bones).filter(b => !b.parent || !b.parent.isBone).map(b => b.name));
  }
});
