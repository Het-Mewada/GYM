import fs from 'fs';
import * as THREE from '../apps/web/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

global.window = {}; global.document = { createElementNS: () => ({}) }; global.self = global;
const buf = fs.readFileSync('apps/web/public/assets/home/human-lifter.glb');
const loader = new GLTFLoader();

loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  const bones = {};
  gltf.scene.traverse(o => { if (o.isBone) bones[o.name] = o; });

  const rArm = bones['mixamorigRightArm'];
  const rHand = bones['mixamorigRightHand'];
  const restQuat = rArm.quaternion.clone();

  function testArmAxis(axis, angle) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis==='x'?1:0, axis==='y'?1:0, axis==='z'?1:0), angle);
    rArm.quaternion.copy(restQuat).multiply(q);
    gltf.scene.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    rHand.getWorldPosition(p);
    console.log(`Right Arm ${axis} = ${angle.toFixed(2)}: Hand pos: [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`);
  }

  ['x', 'y', 'z'].forEach(axis => {
    testArmAxis(axis, -1.3);
    testArmAxis(axis, 1.3);
  });
});
