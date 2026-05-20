"use client";
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, MeshDistortMaterial, Float } from "@react-three/drei";
import * as THREE from "three";

function OrbMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.008;
      meshRef.current.rotation.z += 0.004;
    }
  });

  return (
    <Sphere ref={meshRef} args={[1, 100, 100]}>
      <MeshDistortMaterial
        color="#00f0ff" // Bright neon cyan
        metalness={0.9}
        roughness={0.15}
        emissive="#0055ff" // Futuristic royal blue
        emissiveIntensity={0.6}
        distort={0.35} // Perfect organic morphing
        speed={2.2} // Smooth animation speed
      />
    </Sphere>
  );
}

export default function GoldenOrb() {
  return (
    <div style={{ width: "100%", height: "100%", cursor: "grab" }}>
      <Canvas camera={{ position: [0, 0, 2.5], fov: 40 }} gl={{ alpha: true }}>
        <ambientLight intensity={0.6} />
        <spotLight position={[5, 5, 5]} angle={0.3} penumbra={1} intensity={5} color="#0055ff" castShadow />
        <pointLight position={[-5, -5, 2]} intensity={2.5} color="#00ffff" />
        <Float speed={2.5} rotationIntensity={0.8} floatIntensity={0.35}>
          <OrbMesh />
        </Float>
      </Canvas>
    </div>
  );
}
