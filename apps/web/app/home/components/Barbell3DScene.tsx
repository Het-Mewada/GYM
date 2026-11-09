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
// Posed exactly matching the reference powerlifter deadlift:
// Torso hinged forward, arms hanging straight down in front holding the bar,
// and slowly standing straight with the barbell as the user scrolls.
// ============================================================================
function UltraRealistic3DLifter({ explodeProgress }: { explodeProgress: number }) {
  const { scene } = useGLTF('/assets/home/human-lifter.glb');

  // Clone with SkeletonUtils so every canvas has its own independent mesh & bones
  const clonedScene = useMemo(() => {
    if (!scene) return null;
    return SkeletonUtils.clone(scene);
  }, [scene]);

  const lifterGroupRef = useRef<THREE.Group>(null);
  const bonesMap = useRef<Record<string, THREE.Bone>>({});

  useEffect(() => {
    if (!clonedScene) return;
    const map: Record<string, THREE.Bone> = {};
    clonedScene.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) {
        map[obj.name] = obj as THREE.Bone;
        map[obj.name.replace(':', '')] = obj as THREE.Bone;
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
    bonesMap.current = map;
  }, [clonedScene]);

  // Dynamic deadlift execution:
  // Starts in reference hinge posture (Image 2) and slowly stands straight with the barbell on scroll
  useFrame(() => {
    if (!lifterGroupRef.current) return;
    const bones = bonesMap.current;

    const lArm = bones['mixamorigLeftArm'];
    const rArm = bones['mixamorigRightArm'];
    const lForeArm = bones['mixamorigLeftForeArm'];
    const rForeArm = bones['mixamorigRightForeArm'];
    const lHand = bones['mixamorigLeftHand'];
    const rHand = bones['mixamorigRightHand'];
    const spine = bones['mixamorigSpine'];
    const spine1 = bones['mixamorigSpine1'];
    const lUpLeg = bones['mixamorigLeftUpLeg'];
    const rUpLeg = bones['mixamorigRightUpLeg'];
    const lLeg = bones['mixamorigLeftLeg'];
    const rLeg = bones['mixamorigRightLeg'];
    const head = bones['mixamorigHead'];

    // Large, heroic powerlifter scale
    const athleteScale = 0.95;
    lifterGroupRef.current.scale.set(athleteScale, athleteScale, athleteScale);

    // Stand progress smoothly transitions 0 (deep setup hinge) -> 1 (full vertical lockout)
    const standProgress = Math.max(0, Math.min(1, explodeProgress));
    const hinge = 1.0 - standProgress;

    // 1. Torso & Spine: flat back hinge (matching reference image), straightening to vertical
    if (spine) spine.rotation.x = -0.38 * hinge;
    if (spine1) spine1.rotation.x = -0.16 * hinge;

    // 2. Legs: knees bent and hips back in setup, extending to straight lockout
    if (lUpLeg && rUpLeg) {
      lUpLeg.rotation.x = -0.42 * hinge;
      rUpLeg.rotation.x = -0.42 * hinge;
    }
    if (lLeg && rLeg) {
      lLeg.rotation.x = 0.42 * hinge;
      rLeg.rotation.x = 0.42 * hinge;
    }

    // 3. Head: focused forward along floor at start, leveling out at lockout
    if (head) {
      head.rotation.x = -0.18 * hinge;
    }

    // 4. Arms: hanging straight down in front of torso holding the bar (matching reference photo)
    if (lArm && rArm) {
      lArm.rotation.set(1.42 - standProgress * 0.25, 0.85, 0.38 + standProgress * 0.1);
      rArm.rotation.set(1.42 - standProgress * 0.25, -0.85, -0.38 - standProgress * 0.1);
    }
    if (lForeArm && rForeArm) {
      lForeArm.rotation.set(0.08, 0, 0.12);
      rForeArm.rotation.set(0.08, 0, -0.12);
    }
    if (lHand && rHand) {
      // Overhand hook grip securely locked onto the knurled barbell
      lHand.rotation.set(0.35, 0, 0);
      rHand.rotation.set(0.35, 0, 0);
    }

    // 5. Position: Hands stay locked to the barbell in front, rising smoothly together
    const barElevation = -0.25 + standProgress * 0.55;
    lifterGroupRef.current.position.set(0, -2.12 + barElevation, -0.32);
  });

  if (!clonedScene) return null;

  return (
    <group ref={lifterGroupRef}>
      <primitive object={clonedScene} />
    </group>
  );
}

// Photorealistic Theme-Coherent Olympic Barbell Model
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

  // =========================================================================
  // MATERIALS MATCHING GYMOS UI THEME (#0A0A0B, #111114, #C6FF3D, #F4F1EA)
  // =========================================================================
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

  // 1. Stealth Carbon Urethane Black 25KG (Deep matte black with subtle specular)
  const plateStealthCarbon = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x141418,
      metalness: 0.22,
      roughness: 0.65,
      emissive: 0x050508,
      emissiveIntensity: 0.1
    });
  }, []);

  // 2. Machined Gunmetal Titanium 20KG (High-grade brushed titanium)
  const plateGunmetalTitanium = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x2b2c34,
      metalness: 0.88,
      roughness: 0.26,
      envMapIntensity: 2.4
    });
  }, []);

  // 3. Dense Matte Charcoal Slate 15KG (Heavy density textured charcoal)
  const plateMatteSlate = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x1e1f26,
      metalness: 0.35,
      roughness: 0.55
    });
  }, []);

  // 4. Signature GymOS Volt Green Performance Plate 10KG (Electric volt accent)
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

  // Anodized Volt Accent Material (Grip bands, collar locks, rim grooves)
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
    const pointer = state.pointer; // Mouse parallax [-1, 1]

    if (mode === 'exploded') {
      const p = explodeProgress;
      // Harmonic curve: 0 (assembled) -> 1 (peak disassembly) -> 0 (reassembled)
      const explodeFactor = Math.sin(p * Math.PI);

      // Continuous 3D rotation + interactive subtle mouse parallax
      groupRef.current.rotation.y = p * Math.PI * 2.2 + t * 0.22 + pointer.x * 0.25;
      groupRef.current.rotation.x = 0.1 + Math.sin(p * Math.PI) * 0.2 - pointer.y * 0.2;
      groupRef.current.rotation.z = Math.sin(t * 0.3) * 0.02;

      // Smooth lifting elevation as the lifter stands straight
      const barElevation = -0.25 + p * 0.55;
      groupRef.current.position.y = Math.sin(t * 0.6) * 0.02 + barElevation;

      // 1. Stealth Carbon 25KG Plates (Separate factor 0.7)
      if (lPlate1.current) lPlate1.current.position.x = -1.25 - explodeFactor * 0.7;
      if (rPlate1.current) rPlate1.current.position.x = 1.25 + explodeFactor * 0.7;

      // 2. Gunmetal Titanium 20KG Plates (Separate factor 1.3)
      if (lPlate2.current) lPlate2.current.position.x = -1.37 - explodeFactor * 1.3;
      if (rPlate2.current) rPlate2.current.position.x = 1.37 + explodeFactor * 1.3;

      // 3. Matte Slate 15KG Plates (Separate factor 1.9)
      if (lPlate3.current) lPlate3.current.position.x = -1.48 - explodeFactor * 1.9;
      if (rPlate3.current) rPlate3.current.position.x = 1.48 + explodeFactor * 1.9;

      // 4. GymOS Signature Volt 10KG Plates (Separate factor 2.5)
      if (lPlate4.current) lPlate4.current.position.x = -1.58 - explodeFactor * 2.5;
      if (rPlate4.current) rPlate4.current.position.x = 1.58 + explodeFactor * 2.5;

      // 5. Polished Chrome 5KG Change Plates (Separate factor 3.1)
      if (lPlate5.current) lPlate5.current.position.x = -1.67 - explodeFactor * 3.1;
      if (rPlate5.current) rPlate5.current.position.x = 1.67 + explodeFactor * 3.1;

      // 6. Lock Collars (Fly outward far with rotation)
      if (leftCollarGroup.current) {
        leftCollarGroup.current.position.x = -1.78 - explodeFactor * 3.8;
        leftCollarGroup.current.rotation.z = explodeFactor * 0.6;
      }
      if (rightCollarGroup.current) {
        rightCollarGroup.current.position.x = 1.78 + explodeFactor * 3.8;
        rightCollarGroup.current.rotation.z = -explodeFactor * 0.6;
      }

      // 7. End Caps (Fly outward most)
      if (leftCapGroup.current) {
        leftCapGroup.current.position.x = -2.15 - explodeFactor * 4.4;
      }
      if (rightCapGroup.current) {
        rightCapGroup.current.position.x = 2.15 + explodeFactor * 4.4;
      }
    } else if (mode === 'lift') {
      const lp = liftProgress;
      const currentY = -1.6 + lp * 2.0;
      groupRef.current.position.y = currentY;
      groupRef.current.rotation.y = 0;
      groupRef.current.rotation.x = 0;

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
      {/* ===================================================================
          1. REALISTIC 3D HUMAN LIFTER
          Only rendered in 'exploded' Platform Architecture mode.
          In 'lift' (Precision Telemetry) mode, only the barbell lifts.
         =================================================================== */}
      {mode === 'exploded' && (
        <Suspense fallback={null}>
          <UltraRealistic3DLifter explodeProgress={explodeProgress} />
        </Suspense>
      )}

      {/* ===================================================================
          2. OLYMPIC STEEL SHAFT
         =================================================================== */}
      <mesh ref={shaftMesh} rotation={[0, 0, Math.PI / 2]} material={brushedSteel}>
        <cylinderGeometry args={[0.042, 0.042, 4.3, 48]} />
      </mesh>

      {/* Textured knurling sleeves on shaft */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.42, 0, 0]} material={machinedDarkAlloy}>
        <cylinderGeometry args={[0.043, 0.043, 0.35, 36]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.42, 0, 0]} material={machinedDarkAlloy}>
        <cylinderGeometry args={[0.043, 0.043, 0.35, 36]} />
      </mesh>

      {/* Anodized Volt Grip Indicator Bands */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.65, 0, 0]} material={anodizedVolt}>
        <cylinderGeometry args={[0.044, 0.044, 0.015, 32]} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.65, 0, 0]} material={anodizedVolt}>
        <cylinderGeometry args={[0.044, 0.044, 0.015, 32]} />
      </mesh>

      {/* ===================================================================
          3. ROTATING CHROME SLEEVES WITH INNER FLANGES
         =================================================================== */}
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

      {/* ===================================================================
          4. THEME-MATCHED LUXURY GYMOS PLATES
         =================================================================== */}
      
      {/* PLATE 1: STEALTH CARBON URETHANE 25KG (Diameter 0.72) with Volt Outer Ring */}
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

      {/* PLATE 2: MACHINED GUNMETAL TITANIUM 20KG (Diameter 0.65) */}
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

      {/* PLATE 3: MATTE CHARCOAL SLATE 15KG (Diameter 0.58) with Volt Recessed Ring */}
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

      {/* PLATE 4: SIGNATURE GYMOS VOLT PERFORMANCE 10KG (Diameter 0.50) */}
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

      {/* PLATE 5: POLISHED OLYMPIC CHROME 5KG CHANGE PLATE (Diameter 0.38) */}
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

      {/* ===================================================================
          5. PRECISION COMPETITION CLAMP COLLARS
         =================================================================== */}
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

      {/* ===================================================================
          6. END CAPS
         =================================================================== */}
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
      {/* Back silhouette separator */}
      <directionalLight position={[0, 2, -5]} intensity={2.4} color="#ffffff" />

      {/* 3D Chalk Dust Particles in Volumetric Lighting */}
      <ChalkDustParticles count={300} />

      <RealisticBarbellModel
        explodeProgress={explodeProgress}
        liftProgress={liftProgress}
        mode={mode}
      />
    </Canvas>
  );
}
