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
  
  const rArm = bones['mixamorigRightArm'];
  const rHand = bones['mixamorigRightHand'];
  const rH0 = new THREE.Vector3();

  console.log('Testing RightArm rotX:');
  for (let x = -1.5; x <= 1.5; x += 0.5) {
    rArm.rotation.set(x, 0, 0);
    clone.updateMatrixWorld(true);
    rHand.getWorldPosition(rH0);
    console.log(`RightArm rotX: ${x.toFixed(2)} -> rHand pos: (${rH0.x.toFixed(2)}, ${rH0.y.toFixed(2)}, ${rH0.z.toFixed(2)})`);
  }
});
