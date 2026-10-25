"use client";

import { Component, ReactNode, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { useTheme } from "@/components/theme-provider";

function makeGlobeTexture(spiderTheme: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const latitude = (y / canvas.height - 0.5) * Math.PI;
    for (let x = 0; x < canvas.width; x += 1) {
      const longitude = (x / canvas.width - 0.5) * Math.PI * 2;
      const broad = Math.sin(longitude * 1.9 + Math.cos(latitude * 2.3)) + Math.cos(longitude * 2.6 - latitude * 1.8) + Math.sin(latitude * 5.4 + longitude * 0.7);
      const detail = Math.sin(longitude * 9 + latitude * 4) * 0.22 + Math.cos(latitude * 14 - longitude * 5) * 0.14;
      const land = broad + detail > 0.78;
      const shade = Math.max(0, Math.min(1, (Math.sin(latitude * 2.1) + Math.cos(longitude * 1.4) + 2) / 4));
      const offset = (y * canvas.width + x) * 4;
      image.data[offset] = spiderTheme ? (land ? 110 + shade * 100 : 5 + shade * 20) : (land ? 111 + shade * 44 : 111 + shade * 18);
      image.data[offset + 1] = spiderTheme ? (land ? 18 + shade * 28 : 22 + shade * 35) : (land ? 160 + shade * 55 : 177 + shade * 28);
      image.data[offset + 2] = spiderTheme ? (land ? 34 + shade * 50 : 57 + shade * 115) : (land ? 88 + shade * 28 : 202 + shade * 28);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createPoints(count: number, radius: number, spiderTheme: boolean) {
  const points = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const lime = new THREE.Color(spiderTheme ? "#ff5362" : "#b6d85a");
  const ocean = new THREE.Color(spiderTheme ? "#66d5f3" : "#d5eff1");
  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / (count - 1)) * 2;
    const ring = Math.sqrt(1 - y * y);
    const angle = Math.PI * (3 - Math.sqrt(5)) * index;
    const offset = index * 3;
    points[offset] = Math.cos(angle) * ring * radius;
    points[offset + 1] = y * radius;
    points[offset + 2] = Math.sin(angle) * ring * radius;
    const color = index % 4 === 0 ? lime : ocean;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }
  return { points, colors };
}

function Globe({ reducedMotion, spiderTheme }: { reducedMotion: boolean; spiderTheme: boolean }) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => makeGlobeTexture(spiderTheme), [spiderTheme]);
  const points = useMemo(() => createPoints(540, 1.015, spiderTheme), [spiderTheme]);
  useEffect(() => () => texture?.dispose(), [texture]);
  useFrame((_, delta) => { if (!reducedMotion && group.current) group.current.rotation.y += delta * 0.045; });
  return <group ref={group}>
    <mesh>
      <sphereGeometry args={[1, 96, 96]} />
      <meshPhysicalMaterial map={texture ?? undefined} color={texture ? "white" : "#8bb2a2"} roughness={0.76} metalness={0.04} clearcoat={0.25} clearcoatRoughness={0.62} />
    </mesh>
    <mesh scale={1.035}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshBasicMaterial color={spiderTheme ? "#ed4051" : "#badb68"} transparent opacity={spiderTheme ? 0.12 : 0.09} side={THREE.BackSide} />
    </mesh>
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points.points, 3]} count={points.points.length / 3} />
        <bufferAttribute attach="attributes-color" args={[points.colors, 3]} count={points.colors.length / 3} />
      </bufferGeometry>
      <pointsMaterial size={0.012} vertexColors transparent opacity={0.65} sizeAttenuation />
    </points>
    <mesh rotation={[0.92, 0.1, -0.25]}>
      <torusGeometry args={[1.36, 0.006, 8, 180]} />
      <meshBasicMaterial color={spiderTheme ? "#ef4a58" : "#a9c765"} transparent opacity={spiderTheme ? 0.75 : 0.5} />
    </mesh>
    <mesh rotation={[0.92, 0.1, 0.16]}>
      <torusGeometry args={[1.52, 0.003, 6, 180]} />
      <meshBasicMaterial color={spiderTheme ? "#00f0ff" : "#8ba3a3"} transparent opacity={spiderTheme ? 0.55 : 0.32} />
    </mesh>
  </group>;
}

export default function AuthGlobe() {
  const reducedMotion = useReducedMotion() ?? false;
  const { theme } = useTheme();
  const spiderTheme = theme === "spider-man";
  return <GlobeBoundary><Canvas camera={{ position: [0, 0, 4.25], fov: 40 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}>
    <ambientLight intensity={spiderTheme ? 0.9 : 1.25} />
    <directionalLight position={[3, 2, 4]} intensity={2.1} color={spiderTheme ? "#e8f8ff" : "#fff8df"} />
    <pointLight position={[-3, -1, -2]} intensity={2.5} color={spiderTheme ? "#ed4051" : "#b6d85a"} />
    {spiderTheme && <pointLight position={[2, -1, 2]} intensity={1.4} color="#35bfe9" />}
    {!reducedMotion && <Sparkles count={34} scale={4.6} size={1.6} speed={0.12} color={spiderTheme ? "#a8eaff" : "#9bb65c"} opacity={0.34} />}
    <Globe reducedMotion={reducedMotion} spiderTheme={spiderTheme} />
    <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={0.45} minPolarAngle={Math.PI / 2.8} maxPolarAngle={Math.PI / 1.7} autoRotate={!reducedMotion} autoRotateSpeed={0.25} />
  </Canvas></GlobeBoundary>;
}

class GlobeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidMount() {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      context?.getExtension("WEBGL_lose_context")?.loseContext();
      if (!context) this.setState({ failed: true });
    } catch { this.setState({ failed: true }); }
  }
  render() {
    return this.state.failed ? <div className="auth-globe-fallback" role="img" aria-label="Decorative globe illustration"><div className="auth-globe-fallback-sphere" /><i /><b /></div> : this.props.children;
  }
}
