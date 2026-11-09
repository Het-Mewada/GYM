import fs from 'fs';
import * as THREE from '../apps/web/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../apps/web/node_modules/three/examples/jsm/utils/SkeletonUtils.js';

global.window = {}; global.document = { createElementNS: () => ({}) }; global.self = global;
const buf = fs.readFileSync('apps/web/public/assets/home/human-lifter.glb');
const loader = new GLTFLoader();

loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  const scene = SkeletonUtils.clone(gltf.scene);
  const bones = {};
  scene.traverse(o => { if (o.isBone) bones[o.name] = o; });

  const restQuats = {};
  for (const name in bones) {
    restQuats[name] = bones[name].quaternion.clone();
  }

  const rootGroup = new THREE.Group();
  rootGroup.add(scene);

  const hips = bones['mixamorigHips'];
  const lUpLeg = bones['mixamorigLeftUpLeg'];
  const rUpLeg = bones['mixamorigRightUpLeg'];
  const lLeg = bones['mixamorigLeftLeg'];
  const rLeg = bones['mixamorigRightLeg'];
  const lFoot = bones['mixamorigLeftFoot'];
  const rFoot = bones['mixamorigRightFoot'];
  const spine = bones['mixamorigSpine'];
  const spine1 = bones['mixamorigSpine1'];
  const spine2 = bones['mixamorigSpine2'];
  const head = bones['mixamorigHead'];
  const lArm = bones['mixamorigLeftArm'];
  const rArm = bones['mixamorigRightArm'];
  const lForeArm = bones['mixamorigLeftForeArm'];
  const rForeArm = bones['mixamorigRightForeArm'];
  const lHand = bones['mixamorigLeftHand'];
  const rHand = bones['mixamorigRightHand'];

  const restHipsY = hips.position.y;
  const restHipsZ = hips.position.z;

  function setPose(progress) {
    // progress: 0 (deep crouch deadlift setup) -> 1 (tall standing lockout)
    const crouch = 1.0 - progress;

    // 1. Pelvis drop & slight backward shift in crouch to keep balance over feet
    // Scale factor 0.85
    const athleteScale = 0.85;
    rootGroup.scale.set(athleteScale, athleteScale, athleteScale);

    // Crouch drops hips down and back
    // In rest pose, Hips are at y = -1.42, z = -209.15
    hips.position.y = restHipsY - 38 * crouch;
    hips.position.z = restHipsZ - 12 * crouch;

    // 2. Thighs / Hips flexion: forward rotation (+X)
    const hipAngle = 0.78 * crouch;
    const qHipL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), hipAngle);
    const qHipR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), hipAngle);
    lUpLeg.quaternion.copy(restQuats['mixamorigLeftUpLeg']).multiply(qHipL);
    rUpLeg.quaternion.copy(restQuats['mixamorigRightUpLeg']).multiply(qHipR);

    // 3. Knees flexion: backward rotation (-X)
    const kneeAngle = -1.15 * crouch;
    const qKneeL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kneeAngle);
    const qKneeR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kneeAngle);
    lLeg.quaternion.copy(restQuats['mixamorigLeftLeg']).multiply(qKneeL);
    rLeg.quaternion.copy(restQuats['mixamorigRightLeg']).multiply(qKneeR);

    // 4. Ankles flexion to keep feet planted flat on floor: (+X)
    const ankleAngle = 0.42 * crouch;
    const qAnkleL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ankleAngle);
    const qAnkleR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ankleAngle);
    lFoot.quaternion.copy(restQuats['mixamorigLeftFoot']).multiply(qAnkleL);
    rFoot.quaternion.copy(restQuats['mixamorigRightFoot']).multiply(qAnkleR);

    // 5. Torso / Spine forward hinge: (+X)
    const spineAngle = 0.48 * crouch;
    const qSpine = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spineAngle);
    spine.quaternion.copy(restQuats['mixamorigSpine']).multiply(qSpine);
    if (spine1) {
      const qSpine1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12 * crouch);
      spine1.quaternion.copy(restQuats['mixamorigSpine1']).multiply(qSpine1);
    }

    // 6. Head: keeps eyes up and forward along the floor (slight -X relative to forward spine)
    if (head) {
      const qHead = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.45 * crouch);
      head.quaternion.copy(restQuats['mixamorigHead']).multiply(qHead);
    }

    // 7. Arms: hang straight down in front of knees, holding the bar
    // rx rotates arm down from T-pose (1.35)
    // rz adjusts arm angle so hands hang right in front of knees at x ~ +-0.45
    const armX = 1.38 - crouch * 0.12;
    const armZL = 0.18 + crouch * 0.08;
    const armZR = -0.18 - crouch * 0.08;
    const qArmL = new THREE.Quaternion().setFromEuler(new THREE.Euler(armX, 0, armZL, 'XYZ'));
    const qArmR = new THREE.Quaternion().setFromEuler(new THREE.Euler(armX, 0, armZR, 'XYZ'));
    lArm.quaternion.copy(restQuats['mixamorigLeftArm']).multiply(qArmL);
    rArm.quaternion.copy(restQuats['mixamorigRightArm']).multiply(qArmR);

    // Hands grip angle (overhand bar grip)
    const qHandL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, -0.2, 'XYZ'));
    const qHandR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0.2, 'XYZ'));
    lHand.quaternion.copy(restQuats['mixamorigLeftHand']).multiply(qHandL);
    rHand.quaternion.copy(restQuats['mixamorigRightHand']).multiply(qHandR);

    // Position lifter in world space so feet stay on floor:
    rootGroup.position.set(0, -1.95, -0.25);
    rootGroup.updateMatrixWorld(true);

    const lFootPos = new THREE.Vector3();
    const lHandPos = new THREE.Vector3();
    const rHandPos = new THREE.Vector3();
    const headPos = new THREE.Vector3();
    const hipsPos = new THREE.Vector3();
    lFoot.getWorldPosition(lFootPos);
    lHand.getWorldPosition(lHandPos);
    rHand.getWorldPosition(rHandPos);
    head.getWorldPosition(headPos);
    hips.getWorldPosition(hipsPos);

    console.log(`\n=== PROGRESS = ${progress.toFixed(2)} (crouch = ${crouch.toFixed(2)}) ===`);
    console.log(`Feet Y: ${lFootPos.y.toFixed(2)}`);
    console.log(`Hips pos: [${hipsPos.x.toFixed(2)}, ${hipsPos.y.toFixed(2)}, ${hipsPos.z.toFixed(2)}]`);
    console.log(`Head pos: [${headPos.x.toFixed(2)}, ${headPos.y.toFixed(2)}, ${headPos.z.toFixed(2)}]`);
    console.log(`Left Hand pos:  [${lHandPos.x.toFixed(2)}, ${lHandPos.y.toFixed(2)}, ${lHandPos.z.toFixed(2)}]`);
    console.log(`Right Hand pos: [${rHandPos.x.toFixed(2)}, ${rHandPos.y.toFixed(2)}, ${rHandPos.z.toFixed(2)}]`);
    const barMidY = (lHandPos.y + rHandPos.y) / 2;
    const barMidZ = (lHandPos.z + rHandPos.z) / 2;
    console.log(`Barbell target pos: [0.00, ${barMidY.toFixed(2)}, ${barMidZ.toFixed(2)}]`);
  }

  [0.0, 0.25, 0.5, 0.75, 1.0].forEach(p => setPose(p));
});
