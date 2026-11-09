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
  
  const spine = bones['mixamorigSpine'];
  const spine1 = bones['mixamorigSpine1'];
  const lUpLeg = bones['mixamorigLeftUpLeg'];
  const rUpLeg = bones['mixamorigRightUpLeg'];
  const lLeg = bones['mixamorigLeftLeg'];
  const rLeg = bones['mixamorigRightLeg'];
  const lArm = bones['mixamorigLeftArm'];
  const rArm = bones['mixamorigRightArm'];
  const lForeArm = bones['mixamorigLeftForeArm'];
  const rForeArm = bones['mixamorigRightForeArm'];
  const lHand = bones['mixamorigLeftHand'];
  const rHand = bones['mixamorigRightHand'];
  const head = bones['mixamorigHead'];

  console.log('Testing arm spread to grip barbell at x = ±0.45:');

  // Let's test different combinations of arm angles
  for (let rx of [0.8, 1.1, 1.3]) {
    for (let rz of [-0.6, -0.9, -1.2]) {
      for (let ry of [0.0, 0.2, 0.4]) {
        lArm.rotation.set(rx, ry, rz);
        rArm.rotation.set(rx, -ry, -rz);
        clone.updateMatrixWorld(true);
        const lH = new THREE.Vector3();
        const rH = new THREE.Vector3();
        lHand.getWorldPosition(lH);
        rHand.getWorldPosition(rH);
        
        // We want:
        // 1. lH.x around +0.45 to +0.55
        // 2. rH.x around -0.45 to -0.55
        // 3. lH.z in front of body (> 0)
        if (lH.x > 0.35 && lH.x < 0.60 && rH.x < -0.35 && rH.x > -0.60 && lH.z > 0.1) {
          console.log(`rx: ${rx}, ry: ${ry}, rz: ${rz} -> left: (${lH.x.toFixed(2)}, ${lH.y.toFixed(2)}, ${lH.z.toFixed(2)}), right: (${rH.x.toFixed(2)}, ${rH.y.toFixed(2)}, ${rH.z.toFixed(2)})`);
        }
      }
    }
  }
});
