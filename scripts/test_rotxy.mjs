global.self = global;
import * as THREE from '../apps/web/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../apps/web/node_modules/three/examples/jsm/utils/SkeletonUtils.js';
import fs from 'fs';

const loader = new GLTFLoader();
const buf = fs.readFileSync('apps/web/public/assets/home/human-lifter.glb');
loader.parse(buf.buffer, '', (gltf) => {
  const clone = SkeletonUtils.clone(gltf.scene);
  const bones = {};
  clone.traverse(n => { if (n.isBone) bones[n.name] = n; });
  
  const lArm = bones['mixamorigLeftArm'];
  const lHand = bones['mixamorigLeftHand'];
  const lH0 = new THREE.Vector3();

  console.log('Testing rotX:');
  for (let x = -1.5; x <= 1.5; x += 0.5) {
    lArm.rotation.set(x, 0, 0);
    clone.updateMatrixWorld(true);
    lHand.getWorldPosition(lH0);
    console.log(`rotX: ${x.toFixed(2)} -> lHand pos: (${lH0.x.toFixed(2)}, ${lH0.y.toFixed(2)}, ${lH0.z.toFixed(2)})`);
  }

  console.log('Testing rotY:');
  for (let y = -1.5; y <= 1.5; y += 0.5) {
    lArm.rotation.set(0, y, 0);
    clone.updateMatrixWorld(true);
    lHand.getWorldPosition(lH0);
    console.log(`rotY: ${y.toFixed(2)} -> lHand pos: (${lH0.x.toFixed(2)}, ${lH0.y.toFixed(2)}, ${lH0.z.toFixed(2)})`);
  }
});
