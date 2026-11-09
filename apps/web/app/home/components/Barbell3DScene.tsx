'use client';

import React, { useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

interface BarbellSceneProps {
  explodeProgress: number; // 0 to 1
  liftProgress: number;    // 0 to 1
  mode: 'exploded' | 'lift';
}

// Preload the photorealistic human lifter model
useGLTF.preload('/assets/home/human-lifter.glb');

// 3D Drifting Chalk Dust Particles
function ChalkDustParticles({ count = 250 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const t = state.clock.getElapsedTime() * 0.2;
    pointsRef.current.rotation.y = t * 0.3;
    pointsRef.current.rotation.x = Math.sin(t * 0.2) * 0.1;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color="#c6ff3d"
        transparent
        opacity={0.35}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ============================================================================
// ULTRA-REALISTIC 3D HUMAN LIFTER
// - 5 anatomically curled fingers forming a tight power grip overhand fist
// - Barbell strictly 20cm in FRONT of body/tshirt (never penetrates clothing)
// - Crouch-to-stand deadlift execution synchronized with 360-degree scene orbit
// ============================================================================
function UltraRealistic3DLifter({ explodeProgress }: { explodeProgress: number }) {
  const { scene } = useGLTF('/assets/home/human-lifter.glb');

  // Clone with SkeletonUtils so each canvas has independent mesh & bones
  const clonedScene = useMemo(() => {
    if (!scene) return null;
    return SkeletonUtils.clone(scene);
  }, [scene]);

  const lifterGroupRef = useRef<THREE.Group>(null);
  const bonesMap = useRef<Record<string, THREE.Bone>>({});
  const restQuatsRef = useRef<Record<string, THREE.Quaternion>>({});
  const restHipsYRef = useRef<number>(-1.416);

  useEffect(() => {
    if (!clonedScene) return;
    const bones: Record<string, THREE.Bone> = {};
    const quats: Record<string, THREE.Quaternion> = {};

    clonedScene.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) {
        bones[obj.name] = obj as THREE.Bone;
        quats[obj.name] = obj.quaternion.clone();
      }
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.envMapIntensity = 2.4;
          mat.roughness = Math.max(0.35, mat.roughness ?? 0.5);
        }
      }
    });

    if (bones['mixamorigHips']) {
      restHipsYRef.current = bones['mixamorigHips'].position.y;
    }

    bonesMap.current = bones;
    restQuatsRef.current = quats;
  }, [clonedScene]);

  useFrame(() => {
    if (!lifterGroupRef.current) return;
    const bones = bonesMap.current;
    const restQuats = restQuatsRef.current;
    const hips = bones['mixamorigHips'];
    if (!hips || !restQuats['mixamorigHips']) return;

    // Stand progress: 0 (deep crouch setup) -> 1 (full vertical standing lockout)
    const standProgress = Math.max(0, Math.min(1, explodeProgress));
    const crouch = 1.0 - standProgress;

    // Athlete scale
    const athleteScale = 0.90;
    lifterGroupRef.current.scale.set(athleteScale, athleteScale, athleteScale);

    const lUpLeg = bones['mixamorigLeftUpLeg'];
    const rUpLeg = bones['mixamorigRightUpLeg'];
    const lLeg = bones['mixamorigLeftLeg'];
    const rLeg = bones['mixamorigRightLeg'];
    const lFoot = bones['mixamorigLeftFoot'];
    const rFoot = bones['mixamorigRightFoot'];
    const spine = bones['mixamorigSpine'];
    const spine1 = bones['mixamorigSpine1'];
    const head = bones['mixamorigHead'];
    const lArm = bones['mixamorigLeftArm'];
    const rArm = bones['mixamorigRightArm'];
    const lHand = bones['mixamorigLeftHand'];
    const rHand = bones['mixamorigRightHand'];

    // 1. Hips drop down in crouch
    hips.position.y = restHipsYRef.current - 12 * crouch;

    // 2. Thighs / Hips hinge: (+X)
    const hipAngle = 0.28 * crouch;
    const qHip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), hipAngle);
    if (lUpLeg && restQuats['mixamorigLeftUpLeg']) lUpLeg.quaternion.copy(restQuats['mixamorigLeftUpLeg']).multiply(qHip);
    if (rUpLeg && restQuats['mixamorigRightUpLeg']) rUpLeg.quaternion.copy(restQuats['mixamorigRightUpLeg']).multiply(qHip);

    // 3. Knees: moderate athletic bend (-X) keeping shins vertical
    const kneeAngle = -0.38 * crouch;
    const qKnee = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kneeAngle);
    if (lLeg && restQuats['mixamorigLeftLeg']) lLeg.quaternion.copy(restQuats['mixamorigLeftLeg']).multiply(qKnee);
    if (rLeg && restQuats['mixamorigRightLeg']) rLeg.quaternion.copy(restQuats['mixamorigRightLeg']).multiply(qKnee);

    // 4. Ankles: keep feet planted flat
    if (lFoot && restQuats['mixamorigLeftFoot']) lFoot.quaternion.copy(restQuats['mixamorigLeftFoot']);
    if (rFoot && restQuats['mixamorigRightFoot']) rFoot.quaternion.copy(restQuats['mixamorigRightFoot']);

    // 5. Spine: flat back forward hinge (+X)
    const spineAngle = 0.72 * crouch;
    const qSpine = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spineAngle);
    if (spine && restQuats['mixamorigSpine']) spine.quaternion.copy(restQuats['mixamorigSpine']).multiply(qSpine);
    if (spine1 && restQuats['mixamorigSpine1']) {
      const qSpine1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.22 * crouch);
      spine1.quaternion.copy(restQuats['mixamorigSpine1']).multiply(qSpine1);
    }

    // 6. Head: focused forward along the lifting line
    if (head && restQuats['mixamorigHead']) {
      const qHead = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.65 * crouch);
      head.quaternion.copy(restQuats['mixamorigHead']).multiply(qHead);
    }

    // 7. Arms: reach forward in front of body/tshirt to hold the barbell
    const armX = 1.30 - crouch * 0.12;
    const armZL = 0.35 + crouch * 0.45;
    const armZR = -0.35 - crouch * 0.45;
    const qArmL = new THREE.Quaternion().setFromEuler(new THREE.Euler(armX, 0, armZL, 'XYZ'));
    const qArmR = new THREE.Quaternion().setFromEuler(new THREE.Euler(armX, 0, armZR, 'XYZ'));
    if (lArm && restQuats['mixamorigLeftArm']) lArm.quaternion.copy(restQuats['mixamorigLeftArm']).multiply(qArmL);
    if (rArm && restQuats['mixamorigRightArm']) rArm.quaternion.copy(restQuats['mixamorigRightArm']).multiply(qArmR);

    // 8. Wrist orientation: overhand knuckles forward/up
    const qHandL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0.1, -0.15, 'XYZ'));
    const qHandR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, -0.1, 0.15, 'XYZ'));
    if (lHand && restQuats['mixamorigLeftHand']) lHand.quaternion.copy(restQuats['mixamorigLeftHand']).multiply(qHandL);
    if (rHand && restQuats['mixamorigRightHand']) rHand.quaternion.copy(restQuats['mixamorigRightHand']).multiply(qHandR);

    // 9. REALISTIC 5-FINGER POWER FISTS:
    // Rotate joints around X to curl fingers firmly down and around the barbell shaft
    const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
    ['Left', 'Right'].forEach((side) => {
      fingers.forEach((finger) => {
        const b1 = bones[`mixamorig${side}Hand${finger}1`];
        const b2 = bones[`mixamorig${side}Hand${finger}2`];
        const b3 = bones[`mixamorig${side}Hand${finger}3`];
        if (b1) b1.rotation.set(1.30, 0, 0);
        if (b2) b2.rotation.set(1.45, 0, 0);
        if (b3) b3.rotation.set(1.25, 0, 0);
      });
      // Thumb wraps securely underneath the barbell
      const t1 = bones[`mixamorig${side}HandThumb1`];
      const t2 = bones[`mixamorig${side}HandThumb2`];
      const t3 = bones[`mixamorig${side}HandThumb3`];
      const sign = side === 'Left' ? 1 : -1;
      if (t1) t1.rotation.set(0.65, 0, -sign * 0.45);
      if (t2) t2.rotation.set(0.55, 0, -sign * 0.35);
      if (t3) t3.rotation.set(0.45, 0, -sign * 0.25);
    });

    // 10. Plant feet firmly on the floor at floorY = -1.90
    lifterGroupRef.current.position.set(0, 0, 0);
    lifterGroupRef.current.rotation.set(0, 0, 0);
    lifterGroupRef.current.updateMatrixWorld(true);

    if (lFoot) {
      const lFootPos = new THREE.Vector3();
      lFoot.getWorldPosition(lFootPos);
      const floorY = -1.90;
      const offsetY = floorY - lFootPos.y;
      lifterGroupRef.current.position.set(0, offsetY, 0);
    }
  });

  if (!clonedScene) return null;

  return (
    <group ref={lifterGroupRef}>
      <primitive object={clonedScene} />
    </group>
  );
}

// ============================================================================
// PHOTOREALISTIC THEME-COHERENT OLYMPIC BARBELL MODEL
// ============================================================================
function RealisticBarbellModel({ explodeProgress, liftProgress, mode }: BarbellSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftSleeveGroup = useRef<THREE.Group>(null);
  const rightSleeveGroup = useRef<THREE.Group>(null);

  // Individual plate refs for cascading wide separation
  const lPlate1 = useRef<THREE.Group>(null);
  const rPlate1 = useRef<THREE.Group>(null);
  const lPlate2 = useRef<THREE.Group>(null);
  const rPlate2 = useRef<THREE.Group>(null);
  const lPlate3 = useRef<THREE.Group>(null);
  const rPlate3 = useRef<THREE.Group>(null);
  const lPlate4 = useRef<THREE.Group>(null);
  const rPlate4 = useRef<THREE.Group>(null);
  const lPlate5 = useRef<THREE.Group>(null);
  const rPlate5 = useRef<THREE.Group>(null);

  const leftCollarGroup = useRef<THREE.Group>(null);
  const rightCollarGroup = useRef<THREE.Group>(null);
  const leftCapGroup = useRef<THREE.Group>(null);
  const rightCapGroup = useRef<THREE.Group>(null);
  const shaftMesh = useRef<THREE.Mesh>(null);

  // Materials matching GymOS UI theme
  const brushedSteel = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xdddddf,
      metalness: 0.95,
      roughness: 0.16,
      envMapIntensity: 2.2
    });
  }, []);

  const sleeveChrome = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xf5f5f7,
      metalness: 0.98,
      roughness: 0.1,
      envMapIntensity: 2.8
    });
  }, []);

  const machinedDarkAlloy = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x1f1f23,
      metalness: 0.9,
      roughness: 0.28
    });
  }, []);

  // 1. Stealth Carbon Urethane Black 25KG
  const plateStealthCarbon = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x141418,
      metalness: 0.22,
      roughness: 0.65,
      emissive: 0x050508,
      emissiveIntensity: 0.1
    });
  }, []);

  // 2. Machined Gunmetal Titanium 20KG
  const plateGunmetalTitanium = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x2b2c34,
      metalness: 0.88,
      roughness: 0.26,
      envMapIntensity: 2.4
    });
  }, []);

  // 3. Dense Matte Charcoal Slate 15KG
  const plateMatteSlate = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x1e1f26,
      metalness: 0.35,
      roughness: 0.55
    });
  }, []);

  // 4. Signature GymOS Volt Green Performance Plate 10KG
  const plateSignatureVolt = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xc6ff3d,
      metalness: 0.38,
      roughness: 0.3,
      emissive: 0x5a8a00,
      emissiveIntensity: 0.45
    });
  }, []);

  // 5. Precision Mirror / Polished Olympic Chrome 5KG Change Plate
  const plateOlympicChrome = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xe6e6ea,
      metalness: 0.96,
      roughness: 0.12,
      envMapIntensity: 2.6
    });
  }, []);

  // Anodized Volt Accent Material
  const anodizedVolt = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xc6ff3d,
      emissive: 0x73a800,
      emissiveIntensity: 0.55,
      metalness: 0.88,
      roughness: 0.2
    });
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();

    if (mode === 'exploded') {
      const p = explodeProgress;
      const crouch = 1.0 - p;
      const explodeFactor = Math.sin(p * Math.PI);

      // Barbell position strictly matches the lifter's fists 20cm IN FRONT of tshirt:
      // At crouch (p = 0): y = -0.68, z = +0.27 (well in front of shins & knees)
      // At lockout (p = 1): y = -0.41, z = +0.25 (well in front of tshirt & thighs)
      const barY = -0.41 - crouch * 0.27;
      const barZ = 0.25 + crouch * 0.02;
      groupRef.current.position.set(0, barY, barZ);
      groupRef.current.rotation.set(0, 0, Math.sin(t * 0.5) * 0.01);

      // Plate separation along sleeves
      // 1. Stealth Carbon 25KG Plates (Separate factor 0.75)
      if (lPlate1.current) lPlate1.current.position.x = -1.25 - explodeFactor * 0.75;
      if (rPlate1.current) rPlate1.current.position.x = 1.25 + explodeFactor * 0.75;

      // 2. Gunmetal Titanium 20KG Plates (Separate factor 1.35)
      if (lPlate2.current) lPlate2.current.position.x = -1.37 - explodeFactor * 1.35;
      if (rPlate2.current) rPlate2.current.position.x = 1.37 + explodeFactor * 1.35;

      // 3. Matte Slate 15KG Plates (Separate factor 1.95)
      if (lPlate3.current) lPlate3.current.position.x = -1.48 - explodeFactor * 1.95;
      if (rPlate3.current) rPlate3.current.position.x = 1.48 + explodeFactor * 1.95;

      // 4. GymOS Signature Volt 10KG Plates (Separate factor 2.55)
      if (lPlate4.current) lPlate4.current.position.x = -1.58 - explodeFactor * 2.55;
      if (rPlate4.current) rPlate4.current.position.x = 1.58 + explodeFactor * 2.55;

      // 5. Polished Chrome 5KG Change Plates (Separate factor 3.15)
      if (lPlate5.current) lPlate5.current.position.x = -1.67 - explodeFactor * 3.15;
      if (rPlate5.current) rPlate5.current.position.x = 1.67 + explodeFactor * 3.15;

      // 6. Lock Collars
      if (leftCollarGroup.current) {
        leftCollarGroup.current.position.x = -1.78 - explodeFactor * 3.85;
        leftCollarGroup.current.rotation.z = explodeFactor * 0.6;
      }
      if (rightCollarGroup.current) {
        rightCollarGroup.current.position.x = 1.78 + explodeFactor * 3.85;
        rightCollarGroup.current.rotation.z = -explodeFactor * 0.6;
      }

      // 7. End Caps
      if (leftCapGroup.current) {
        leftCapGroup.current.position.x = -2.15 - explodeFactor * 4.5;
      }
      if (rightCapGroup.current) {
        rightCapGroup.current.position.x = 2.15 + explodeFactor * 4.5;
      }
    } else if (mode === 'lift') {
      const lp = liftProgress;
      const currentY = -1.6 + lp * 2.0;
      groupRef.current.position.set(0, currentY, 0);
      groupRef.current.rotation.set(0, 0, 0);

      const flex = Math.sin(lp * Math.PI) * 0.08;
      if (shaftMesh.current) {
        shaftMesh.current.scale.set(1, 1 - flex * 0.25, 1);
      }

      // Plates locked tight in lifting position
      if (lPlate1.current) lPlate1.current.position.x = -1.25;
      if (rPlate1.current) rPlate1.current.position.x = 1.25;
      if (lPlate2.current) lPlate2.current.position.x = -1.37;
      if (rPlate2.current) rPlate2.current.position.x = 1.37;
      if (lPlate3.current) lPlate3.current.position.x = -1.48;
      if (rPlate3.current) rPlate3.current.position.x = 1.48;
      if (lPlate4.current) lPlate4.current.position.x = -1.58;
      if (rPlate4.current) rPlate4.current.position.x = 1.58;
      if (lPlate5.current) lPlate5.current.position.x = -1.67;
      if (rPlate5.current) rPlate5.current.position.x = 1.67;
      if (leftCollarGroup.current) leftCollarGroup.current.position.x = -1.78;
      if (rightCollarGroup.current) rightCollarGroup.current.position.x = 1.78;
      if (leftCapGroup.current) leftCapGroup.current.position.x = -2.15;
      if (rightCapGroup.current) rightCapGroup.current.position.x = 2.15;
    }
  });

  return (
    <group ref={groupRef}>
      {/* 1. OLYMPIC STEEL SHAFT */}
      <mesh ref={shaftMesh} rotation={[0, 0, Math.PI / 2]} material={brushedSteel}>
        <cylinderGeometry args={[0.042, 0.042, 4.3, 48]} />
      </mesh>

      {/* Textured knurling sleeves on shaft */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.60, 0, 0]} material={machinedDarkAlloy}>
        <cylinderGeometry args={[0.043, 0.043, 0.35, 36]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.60, 0, 0]} material={machinedDarkAlloy}>
        <cylinderGeometry args={[0.043, 0.043, 0.35, 36]} />
      </mesh>

      {/* Anodized Volt Grip Indicator Bands */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.80, 0, 0]} material={anodizedVolt}>
        <cylinderGeometry args={[0.044, 0.044, 0.015, 32]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.80, 0, 0]} material={anodizedVolt}>
        <cylinderGeometry args={[0.044, 0.044, 0.015, 32]} />
      </mesh>

      {/* 2. ROTATING CHROME SLEEVES */}
      <group ref={leftSleeveGroup} position={[-1.15, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.15, 0, 0]} material={sleeveChrome}>
          <cylinderGeometry args={[0.095, 0.095, 0.04, 36]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.44, 0, 0]} material={sleeveChrome}>
          <cylinderGeometry args={[0.075, 0.075, 1.15, 36]} />
        </mesh>
      </group>

      <group ref={rightSleeveGroup} position={[1.15, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.15, 0, 0]} material={sleeveChrome}>
          <cylinderGeometry args={[0.095, 0.095, 0.04, 36]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.44, 0, 0]} material={sleeveChrome}>
          <cylinderGeometry args={[0.075, 0.075, 1.15, 36]} />
        </mesh>
      </group>

      {/* 3. THEME-MATCHED LUXURY GYMOS PLATES */}
      {/* PLATE 1: STEALTH CARBON URETHANE 25KG */}
      <group ref={lPlate1} position={[-1.25, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateStealthCarbon}>
          <cylinderGeometry args={[0.72, 0.72, 0.11, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={anodizedVolt}>
          <cylinderGeometry args={[0.722, 0.722, 0.015, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.15, 0.15, 0.115, 36]} />
        </mesh>
      </group>
      <group ref={rPlate1} position={[1.25, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateStealthCarbon}>
          <cylinderGeometry args={[0.72, 0.72, 0.11, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={anodizedVolt}>
          <cylinderGeometry args={[0.722, 0.722, 0.015, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.15, 0.15, 0.115, 36]} />
        </mesh>
      </group>

      {/* PLATE 2: MACHINED GUNMETAL TITANIUM 20KG */}
      <group ref={lPlate2} position={[-1.37, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateGunmetalTitanium}>
          <cylinderGeometry args={[0.65, 0.65, 0.1, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.15, 0.15, 0.105, 36]} />
        </mesh>
      </group>
      <group ref={rPlate2} position={[1.37, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateGunmetalTitanium}>
          <cylinderGeometry args={[0.65, 0.65, 0.1, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.15, 0.15, 0.105, 36]} />
        </mesh>
      </group>

      {/* PLATE 3: MATTE CHARCOAL SLATE 15KG */}
      <group ref={lPlate3} position={[-1.48, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateMatteSlate}>
          <cylinderGeometry args={[0.58, 0.58, 0.08, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={anodizedVolt}>
          <cylinderGeometry args={[0.42, 0.42, 0.082, 36]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.15, 0.15, 0.085, 36]} />
        </mesh>
      </group>
      <group ref={rPlate3} position={[1.48, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateMatteSlate}>
          <cylinderGeometry args={[0.58, 0.58, 0.08, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={anodizedVolt}>
          <cylinderGeometry args={[0.42, 0.42, 0.082, 36]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.15, 0.15, 0.085, 36]} />
        </mesh>
      </group>

      {/* PLATE 4: SIGNATURE GYMOS VOLT PERFORMANCE 10KG */}
      <group ref={lPlate4} position={[-1.58, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateSignatureVolt}>
          <cylinderGeometry args={[0.5, 0.5, 0.07, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.15, 0.15, 0.075, 36]} />
        </mesh>
      </group>
      <group ref={rPlate4} position={[1.58, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateSignatureVolt}>
          <cylinderGeometry args={[0.5, 0.5, 0.07, 48]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.15, 0.15, 0.075, 36]} />
        </mesh>
      </group>

      {/* PLATE 5: POLISHED OLYMPIC CHROME 5KG CHANGE PLATE */}
      <group ref={lPlate5} position={[-1.67, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateOlympicChrome}>
          <cylinderGeometry args={[0.38, 0.38, 0.05, 36]} />
        </mesh>
      </group>
      <group ref={rPlate5} position={[1.67, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={plateOlympicChrome}>
          <cylinderGeometry args={[0.38, 0.38, 0.05, 36]} />
        </mesh>
      </group>

      {/* 4. PRECISION COMPETITION CLAMP COLLARS */}
      <group ref={leftCollarGroup} position={[-1.78, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={machinedDarkAlloy}>
          <cylinderGeometry args={[0.11, 0.11, 0.075, 32]} />
        </mesh>
        <mesh position={[0, 0.12, 0]} material={anodizedVolt}>
          <boxGeometry args={[0.04, 0.09, 0.03]} />
        </mesh>
      </group>

      <group ref={rightCollarGroup} position={[1.78, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={machinedDarkAlloy}>
          <cylinderGeometry args={[0.11, 0.11, 0.075, 32]} />
        </mesh>
        <mesh position={[0, 0.12, 0]} material={anodizedVolt}>
          <boxGeometry args={[0.04, 0.09, 0.03]} />
        </mesh>
      </group>

      {/* 5. END CAPS */}
      <group ref={leftCapGroup} position={[-2.15, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.074, 0.074, 0.02, 32]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.012, 0, 0]} material={anodizedVolt}>
          <cylinderGeometry args={[0.065, 0.065, 0.005, 32]} />
        </mesh>
      </group>

      <group ref={rightCapGroup} position={[2.15, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={sleeveChrome}>
          <cylinderGeometry args={[0.074, 0.074, 0.02, 32]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.012, 0, 0]} material={anodizedVolt}>
          <cylinderGeometry args={[0.065, 0.065, 0.005, 32]} />
        </mesh>
      </group>
    </group>
  );
}

// ============================================================================
// COORDINATED 360-DEGREE ROTATING ASSEMBLY
// Rotates a full 360 degrees as the user scrolls through the section,
// keeping the barbell firmly gripped in the lifter's fists in front of his body!
// ============================================================================
function Coordinated360Assembly({ explodeProgress, liftProgress, mode }: BarbellSceneProps) {
  const assemblyRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!assemblyRef.current) return;
    const t = state.clock.getElapsedTime();
    const pointer = state.pointer;

    if (mode === 'exploded') {
      // Full 360-degree rotation driven by scroll (0 to 2*PI)
      // + subtle continuous ambient drift + interactive mouse orbit
      const scroll360 = explodeProgress * Math.PI * 2;
      assemblyRef.current.rotation.y = scroll360 + Math.sin(t * 0.35) * 0.03 + pointer.x * 0.35;
      assemblyRef.current.rotation.x = 0.06 - pointer.y * 0.15;
    } else {
      assemblyRef.current.rotation.y = 0;
      assemblyRef.current.rotation.x = 0;
    }
  });

  return (
    <group ref={assemblyRef}>
      {/* 3D Human Lifter (Only rendered in Platform Architecture) */}
      {mode === 'exploded' && (
        <Suspense fallback={null}>
          <UltraRealistic3DLifter explodeProgress={explodeProgress} />
        </Suspense>
      )}

      {/* Olympic Barbell Model */}
      <RealisticBarbellModel
        explodeProgress={explodeProgress}
        liftProgress={liftProgress}
        mode={mode}
      />
    </group>
  );
}

export function Barbell3DScene({ explodeProgress, liftProgress, mode }: BarbellSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.15, 5.8], fov: 48 }}
      dpr={Math.min(1.5, typeof window !== 'undefined' ? window.devicePixelRatio : 1)}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      className="w-full h-full pointer-events-auto cursor-grab active:cursor-grabbing"
    >
      <ambientLight intensity={0.9} />
      {/* High-intensity directional volt-green rim light */}
      <directionalLight position={[-6, 4, 3]} intensity={4.5} color="#C6FF3D" />
      {/* Overhead key light for metallic specular shine and muscular definition */}
      <directionalLight position={[3, 7, 5]} intensity={3.0} color="#ffffff" />
      {/* Front fill light */}
      <directionalLight position={[0, 1, 4]} intensity={2.2} color="#f4f1ea" />
      {/* Floor reflection bounce fill */}
      <directionalLight position={[0, -5, -1]} intensity={1.1} color="#71717a" />
      {/* Back silhouette separator for 360 view */}
      <directionalLight position={[0, 2, -5]} intensity={2.6} color="#ffffff" />

      {/* 3D Chalk Dust Particles in Volumetric Lighting */}
      <ChalkDustParticles count={300} />

      {/* Coordinated 360 Rotating Assembly */}
      <Coordinated360Assembly
        explodeProgress={explodeProgress}
        liftProgress={liftProgress}
        mode={mode}
      />
    </Canvas>
  );
}
