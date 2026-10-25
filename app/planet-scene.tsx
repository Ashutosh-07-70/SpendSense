"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, Stars } from "@react-three/drei";
import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import { categoryTotals } from "@/lib/finance";
import { useTheme } from "@/components/theme-provider";

type SpendingCategory = ReturnType<typeof categoryTotals>[number];

function createSurfaceTextures(spiderTheme: boolean) {
  const width = 512;
  const height = 256;
  const colorCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  colorCanvas.width = bumpCanvas.width = width;
  colorCanvas.height = bumpCanvas.height = height;
  const colorContext = colorCanvas.getContext("2d");
  const bumpContext = bumpCanvas.getContext("2d");
  if (!colorContext || !bumpContext) return null;
  const colorImage = colorContext.createImageData(width, height);
  const bumpImage = bumpContext.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width * Math.PI * 2;
      const v = y / height * Math.PI;
      const broad = Math.sin(u * 2.1 + Math.sin(v * 2.7)) * 0.34 + Math.cos(v * 4.2 - u * 0.8) * 0.2;
      const detail = Math.sin(u * 8.5 + v * 3.1) * 0.11 + Math.cos(v * 13.4 - u * 4.6) * 0.07;
      const grain = Math.sin(x * 12.9898 + y * 78.233) * 0.035;
      const terrain = broad + detail + grain;
      const land = terrain > 0.08;
      const shade = Math.max(0, Math.min(1, (terrain + 0.6) / 1.25));
      const index = (y * width + x) * 4;
      colorImage.data[index] = spiderTheme ? (land ? 88 + shade * 112 : 7 + shade * 15) : (land ? 42 + shade * 35 : 13 + shade * 14);
      colorImage.data[index + 1] = spiderTheme ? (land ? 21 + shade * 32 : 24 + shade * 35) : (land ? 65 + shade * 49 : 31 + shade * 34);
      colorImage.data[index + 2] = spiderTheme ? (land ? 38 + shade * 54 : 54 + shade * 100) : (land ? 39 + shade * 26 : 32 + shade * 29);
      colorImage.data[index + 3] = 255;
      const heightValue = Math.round(95 + shade * 115 + (land ? 26 : 0));
      bumpImage.data[index] = bumpImage.data[index + 1] = bumpImage.data[index + 2] = heightValue;
      bumpImage.data[index + 3] = 255;
    }
  }
  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  const map = new THREE.CanvasTexture(colorCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = bumpMap.wrapS = THREE.RepeatWrapping;
  map.anisotropy = bumpMap.anisotropy = 4;
  return { map, bumpMap };
}

function Planet({ onSelect, categories, reducedMotion, selectedCategory, spiderTheme }: { onSelect: (category: string) => void; categories: SpendingCategory[]; reducedMotion: boolean; selectedCategory?: string | null; spiderTheme: boolean }) {
  const group = useRef<THREE.Group>(null);
  const textures = useMemo(() => createSurfaceTextures(spiderTheme), [spiderTheme]);
  useEffect(() => () => { textures?.map.dispose(); textures?.bumpMap.dispose(); }, [textures]);
  useFrame((_, delta) => { if (!reducedMotion && group.current) group.current.rotation.y += delta * 0.07; });
  const markerPositions: [number, number, number][] = [[0.15, 1.35, 0.22], [-1.34, -0.42, 0.15], [1.32, -0.35, 0.18], [-0.42, 0.6, 0.94], [0.72, 0.55, -0.76], [-0.8, -0.2, -0.72], [0.85, -0.66, 0.4]];
  const maxAmount = Math.max(...categories.map((entry) => entry.amountCents), 1);
  return <group ref={group}>
    <mesh>
      <sphereGeometry args={[1.02, 96, 96]} />
      <meshStandardMaterial map={textures?.map} bumpMap={textures?.bumpMap} bumpScale={0.045} color={textures ? "#fff" : spiderTheme ? "#581b2a" : "#25352a"} roughness={spiderTheme ? 0.72 : 0.82} metalness={spiderTheme ? 0.19 : 0.12} emissive={spiderTheme ? "#34112b" : "#24351e"} emissiveIntensity={spiderTheme ? 0.21 : 0.11} />
    </mesh>
    <mesh scale={1.034}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshBasicMaterial color={spiderTheme ? "#ed4051" : "#c5f36c"} transparent opacity={spiderTheme ? 0.09 : 0.055} side={THREE.BackSide} />
    </mesh>
    <mesh scale={1.012}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshBasicMaterial color={spiderTheme ? "#55c9ee" : "#baf469"} wireframe transparent opacity={spiderTheme ? 0.055 : 0.035} />
    </mesh>
    <mesh rotation={[1.08, 0.3, -0.2]}>
      <torusGeometry args={[1.38, 0.009, 8, 180]} />
      <meshBasicMaterial color={spiderTheme ? "#ef4a58" : "#c5f36c"} transparent opacity={0.72} />
    </mesh>
    <mesh rotation={[1.08, 0.3, 0.22]}>
      <torusGeometry args={[1.55, 0.003, 6, 180]} />
      <meshBasicMaterial color={spiderTheme ? "#67d2ee" : "#9ca89b"} transparent opacity={0.24} />
    </mesh>
    {categories.map((item, index) => { const markerColor = spiderTheme ? index % 2 === 0 ? "#ff5968" : "#59cbed" : item.color; return <mesh key={item.category} position={markerPositions[index % markerPositions.length]} onClick={(event) => { event.stopPropagation(); onSelect(item.category); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "auto"; }}>
      <sphereGeometry args={[0.035 + Math.min(0.035, item.amountCents / maxAmount * 0.035), 14, 14]} />
      <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={item.category === selectedCategory ? 2.2 : 0.8} roughness={0.3} transparent opacity={!selectedCategory || item.category === selectedCategory ? 1 : 0.42} />
    </mesh>; })}
  </group>;
}

export default function PlanetScene({ onSelect, categoryTotals: categories, selectedCategory }: { onSelect: (category: string) => void; categoryTotals: SpendingCategory[]; selectedCategory?: string | null }) {
  const reducedMotion = useReducedMotion() ?? false;
  const { theme } = useTheme();
  const spiderTheme = theme === "spider-man";
  return <PlanetFallbackBoundary><Canvas frameloop={reducedMotion ? "demand" : "always"} camera={{ position: [0, 0, 4.05], fov: 42 }} dpr={[1, 1.4]} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}>
    <ambientLight intensity={spiderTheme ? 0.31 : 0.38} /><directionalLight position={[3, 2, 4]} intensity={spiderTheme ? 2.15 : 2.3} color={spiderTheme ? "#e1f4ff" : "#efffd5"} />
    <pointLight position={[-3, -1, -2]} intensity={spiderTheme ? 2.35 : 2.1} color={spiderTheme ? "#f04452" : "#8bd64d"} /><pointLight position={[2, -2, 1]} intensity={spiderTheme ? 1.05 : 0.65} color={spiderTheme ? "#37bce9" : "#75a9c0"} />
    <Stars radius={35} depth={20} count={160} factor={1.7} saturation={spiderTheme ? 0.65 : 0.2} fade speed={reducedMotion ? 0 : 0.15} />
    <Float speed={reducedMotion ? 0 : 0.5} rotationIntensity={reducedMotion ? 0 : 0.035} floatIntensity={reducedMotion ? 0 : 0.07}><Planet onSelect={onSelect} categories={categories} reducedMotion={reducedMotion} selectedCategory={selectedCategory} spiderTheme={spiderTheme} /></Float>
    <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.6} maxPolarAngle={Math.PI / 1.8} rotateSpeed={0.55} />
  </Canvas></PlanetFallbackBoundary>;
}

class PlanetFallbackBoundary extends Component<{ children: ReactNode }, { failed: boolean; webglAvailable: boolean | null }> {
  state: { failed: boolean; webglAvailable: boolean | null } = { failed: false, webglAvailable: null };
  static getDerivedStateFromError() { return { failed: true, webglAvailable: false }; }
  componentDidMount() {
    let available = false;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      available = context !== null;
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { available = false; }
    this.setState({ webglAvailable: available });
  }
  render() {
    if (this.state.failed || !this.state.webglAvailable) return <div className="planet-fallback" role="img" aria-label="Static financial planet shown because WebGL is unavailable"><div className="fallback-orbit"><div className="fallback-planet" /></div></div>;
    return this.props.children;
  }
}
