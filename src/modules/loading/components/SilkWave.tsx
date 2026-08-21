import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform float uWidth;

  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying float vHeight;

  float field(vec2 p, float t) {
    float h = 0.0;
    h += sin(p.x * 0.62 + t * 0.30) * 1.15;
    h += sin(p.x * 0.34 - p.y * 1.60 + t * 0.21) * 0.95;
    h += sin(p.y * 3.10 + p.x * 0.42 + t * 0.27) * 0.45;
    h += sin((p.x * 1.60 + p.y * 3.9) + t * 0.41) * 0.22;
    h += sin(p.x * 3.40 - p.y * 1.1 - t * 0.33) * 0.10;
    return h;
  }

  float envelope(vec2 uv) {
    float d = uv.y - 0.5;
    return exp(-d * d * 9.0);
  }

  vec3 displaced(vec2 p, vec2 uv, float t) {
    float h = field(p, t) * envelope(uv) * uAmp;
    float lift = sin(p.x * 0.33 + t * 0.19) * 0.55;
    return vec3(p.x, p.y * uWidth + lift, h);
  }

  void main() {
    vUv = uv;
    vec2 p = position.xy;
    float e = 0.05;
    vec3 c = displaced(p, uv, uTime);
    vec3 dx = displaced(p + vec2(e, 0.0), uv, uTime) - c;
    vec3 dy = displaced(p + vec2(0.0, e), uv + vec2(0.0, e * 0.09), uTime) - c;

    vNormalW = normalize(normalMatrix * normalize(cross(dx, dy)));
    vHeight = c.z;
    vec4 world = modelMatrix * vec4(c, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uViolet;
  uniform vec3 uWarm;
  uniform float uOpacity;

  varying vec3 vWorldPos;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying float vHeight;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    if (dot(n, viewDir) < 0.0) n = -n;

    vec3 keyLight = normalize(vec3(-0.40, 0.80, 0.55));
    vec3 rimLight = normalize(vec3(0.90, -0.20, 0.30));
    float diff = clamp(dot(n, keyLight), 0.0, 1.0);
    float back = clamp(dot(n, rimLight), 0.0, 1.0);
    float fresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 4.0);
    vec3 halfVector = normalize(keyLight + viewDir);
    float specular = pow(clamp(dot(n, halfVector), 0.0, 1.0), 120.0);
    float sheen = pow(clamp(dot(n, halfVector), 0.0, 1.0), 18.0);

    vec3 color = uDeep;
    color = mix(color, uMid, pow(diff, 3.2));
    color = mix(color, uViolet, pow(diff, 6.0) * 0.8);
    float warmMask = pow(back, 3.0) * smoothstep(0.15, 1.1, abs(vHeight));
    color += uWarm * warmMask * 0.5;
    color += vec3(0.85, 0.88, 1.0) * specular * 1.1;
    color += uViolet * fresnel * 0.28;
    color += uMid * sheen * 0.20;

    float edge = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
    float sides = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    gl_FragColor = vec4(color, uOpacity * edge * sides);
  }
`;

type LayerConfig = {
    amp: number;
    width: number;
    opacity: number;
    speed: number;
    offset: number;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
};

const LAYERS: readonly LayerConfig[] = [
    {
        amp: 1,
        width: 1,
        opacity: 1,
        speed: 1,
        offset: 0,
        position: [0, -0.1, 0],
        rotation: [-0.34, 0, -0.13],
        scale: 1,
    },
    {
        amp: 0.72,
        width: 0.8,
        opacity: 0.45,
        speed: 0.6,
        offset: 11.4,
        position: [0.6, -1.9, -3.2],
        rotation: [-0.5, 0, 0.1],
        scale: 1.3,
    },
];

const RENDER_LAYERS = [...LAYERS].reverse();

function SilkLayer({ config, index }: { config: LayerConfig; index: number }) {
    const mesh = useRef<THREE.Mesh>(null);
    const material = useRef<THREE.ShaderMaterial>(null);
    const uniforms = useMemo(
        () => ({
            uTime: { value: config.offset },
            uAmp: { value: config.amp },
            uWidth: { value: config.width },
            uOpacity: { value: config.opacity },
            uDeep: { value: new THREE.Color("#05050b") },
            uMid: { value: new THREE.Color("#1b2f96") },
            uViolet: { value: new THREE.Color("#7d5bf5") },
            uWarm: { value: new THREE.Color("#e2913c") },
        }),
        [config],
    );

    useFrame((state, delta) => {
        if (material.current) {
            material.current.uniforms.uTime.value += delta * config.speed;
        }
        if (mesh.current) {
            const time = state.clock.elapsedTime;
            mesh.current.rotation.z = config.rotation[2] + Math.sin(time * 0.1 + index) * 0.04;
            mesh.current.position.y = config.position[1] + Math.sin(time * 0.15 + index) * 0.14;
        }
    });

    return (
        <mesh position={config.position} ref={mesh} rotation={config.rotation} scale={config.scale}>
            <planeGeometry args={[20, 8, 280, 140]} />
            <shaderMaterial
                depthWrite={false}
                fragmentShader={FRAGMENT_SHADER}
                ref={material}
                side={THREE.DoubleSide}
                transparent
                uniforms={uniforms}
                vertexShader={VERTEX_SHADER}
            />
        </mesh>
    );
}

function CameraDrift() {
    const { camera } = useThree();

    useFrame((state) => {
        const time = state.clock.elapsedTime;
        camera.position.x = Math.sin(time * 0.08) * 0.5;
        camera.position.y = 1.1 + Math.sin(time * 0.12) * 0.18;
        camera.lookAt(0, -0.2, 0);
    });

    return null;
}

export function SilkWave({ className }: { className?: string }) {
    return (
        <div aria-hidden="true" className={className}>
            <Canvas
                camera={{ position: [0, 1.1, 6.6], fov: 40 }}
                dpr={[1, 1.5]}
                gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            >
                <color args={["#05050a"]} attach="background" />
                <fog args={["#05050a", 7, 18]} attach="fog" />
                {RENDER_LAYERS.map((config, index) => (
                    <SilkLayer config={config} index={index} key={config.offset} />
                ))}
                <CameraDrift />
            </Canvas>
        </div>
    );
}
