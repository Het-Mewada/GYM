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
  const rArm = bones['mixamorigRightArm'];
  const rHand = bones['mixamorigRightHand'];

  console.log('Default T-pose positions:');
  clone.updateMatrixWorld(true);
  const lH0 = new THREE.Vector3();
  const rH0 = new THREE.Vector3();
  lHand.getWorldPosition(lH0);
  rHand.getWorldPosition(rH0);
  console.log('T-pose lHand:', lH0);
  console.log('T-pose rHand:', rH0);

  // In T-pose:
  // lHand is at x = 1.96, y = 2.45, z = -0.06
  // rHand is at x = -1.93, y = 2.45, z = -0.06
  // To bring the hand from x = 1.96 down to x = 0.48:
  // We want to rotate the arm DOWN around Z!
  // In Three.js:
  for (let z = -0.1; z >= -1.6; z -= 0.2) {
    lArm.rotation.set(0, 0, z);
    clone.updateMatrixWorld(true);
    lHand.getWorldPosition(lH0);
    console.log(`lArm rotZ: ${z.toFixed(2)} -> lHand pos: (${lH0.x.toFixed(2)}, ${lH0.y.toFixed(2)}, ${lH0.z.toFixed(2)})`);
  }
});
