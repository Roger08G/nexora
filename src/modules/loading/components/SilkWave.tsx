import { useEffect, useRef, useState } from "react";

const VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec2 aPosition;
  attribute vec2 aUv;

  uniform mat4 uModelMatrix;
  uniform mat4 uViewMatrix;
  uniform mat4 uProjectionMatrix;
  uniform mat3 uNormalMatrix;
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
    vUv = aUv;
    vec2 p = aPosition;
    float e = 0.05;
    vec3 c = displaced(p, aUv, uTime);
    vec3 dx = displaced(p + vec2(e, 0.0), aUv, uTime) - c;
    vec3 dy = displaced(p + vec2(0.0, e), aUv + vec2(0.0, e * 0.09), uTime) - c;

    vNormalW = normalize(uNormalMatrix * normalize(cross(dx, dy)));
    vHeight = c.z;
    vec4 world = uModelMatrix * vec4(c, 1.0);
    vWorldPos = world.xyz;
    gl_Position = uProjectionMatrix * uViewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uCameraPosition;
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
    vec3 viewDir = normalize(uCameraPosition - vWorldPos);
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
    position: readonly [number, number, number];
    rotation: readonly [number, number, number];
    scale: number;
};

type Uniforms = {
    amp: WebGLUniformLocation;
    cameraPosition: WebGLUniformLocation;
    deep: WebGLUniformLocation;
    mid: WebGLUniformLocation;
    modelMatrix: WebGLUniformLocation;
    normalMatrix: WebGLUniformLocation;
    opacity: WebGLUniformLocation;
    projectionMatrix: WebGLUniformLocation;
    time: WebGLUniformLocation;
    viewMatrix: WebGLUniformLocation;
    violet: WebGLUniformLocation;
    warm: WebGLUniformLocation;
    width: WebGLUniformLocation;
};

type Vec3 = readonly [number, number, number];

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
const PLANE_WIDTH = 20;
const PLANE_HEIGHT = 8;
const SEGMENTS_X = 280;
const SEGMENTS_Y = 140;
const INDEX_COUNT = SEGMENTS_X * SEGMENTS_Y * 6;
const MAX_PIXEL_RATIO = 1.5;
const CAMERA_TARGET: Vec3 = [0, -0.2, 0];
const CAMERA_UP: Vec3 = [0, 1, 0];

export function SilkWave({ className }: { className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [rendererFailed, setRendererFailed] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let disposed = false;
        let releaseRenderer: (() => void) | undefined;

        try {
            releaseRenderer = startRenderer(canvas, () => {
                if (!disposed) setRendererFailed(true);
            });
            setRendererFailed(false);
        } catch (error) {
            console.error("No se pudo iniciar SilkWave.", error);
            setRendererFailed(true);
        }

        return () => {
            disposed = true;
            releaseRenderer?.();
        };
    }, []);

    return (
        <div
            aria-hidden="true"
            className={className}
            data-renderer={rendererFailed ? "fallback" : "webgl"}
        >
            <canvas ref={canvasRef} />
            {rendererFailed ? <div className="loading-screen__silk-fallback" /> : null}
        </div>
    );
}

function startRenderer(canvas: HTMLCanvasElement, onContextLost: () => void) {
    const gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        premultipliedAlpha: true,
    });
    if (!gl) throw new Error("WebGL no está disponible.");

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const positionBuffer = gl.createBuffer();
    const uvBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!positionBuffer || !uvBuffer || !indexBuffer) {
        gl.deleteProgram(program);
        throw new Error("No se pudieron reservar los buffers de SilkWave.");
    }

    const { positions, uvs, indices } = createPlaneGeometry();
    const positionAttribute = requireAttribute(gl, program, "aPosition");
    const uvAttribute = requireAttribute(gl, program, "aUv");
    const uniforms = getUniforms(gl, program);

    gl.useProgram(program);
    bindAttribute(gl, positionBuffer, positionAttribute, positions);
    bindAttribute(gl, uvBuffer, uvAttribute, uvs);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.uniform3fv(uniforms.deep, srgbToLinear("#05050b"));
    gl.uniform3fv(uniforms.mid, srgbToLinear("#1b2f96"));
    gl.uniform3fv(uniforms.violet, srgbToLinear("#7d5bf5"));
    gl.uniform3fv(uniforms.warm, srgbToLinear("#e2913c"));

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    const background = srgbToLinear("#05050a");
    gl.clearColor(background[0], background[1], background[2], 1);

    const projectionMatrix = new Float32Array(16);
    const viewMatrix = new Float32Array(16);
    const modelMatrix = new Float32Array(16);
    const modelViewMatrix = new Float32Array(16);
    const normalMatrix = new Float32Array(9);
    const cameraPosition = new Float32Array(3);
    let viewportWidth = 0;
    let viewportHeight = 0;

    const resize = () => {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
        const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
        if (width === viewportWidth && height === viewportHeight) return;

        viewportWidth = width;
        viewportHeight = height;
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
        perspective(projectionMatrix, (40 * Math.PI) / 180, width / height, 0.1, 1_000);
        gl.uniformMatrix4fv(uniforms.projectionMatrix, false, projectionMatrix);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener("resize", resize);
    resize();

    const startedAt = performance.now();
    let animationFrame = 0;
    const render = (timestamp: number) => {
        const elapsed = (timestamp - startedAt) / 1_000;

        cameraPosition[0] = Math.sin(elapsed * 0.08) * 0.5;
        cameraPosition[1] = 1.1 + Math.sin(elapsed * 0.12) * 0.18;
        cameraPosition[2] = 6.6;
        lookAt(viewMatrix, cameraPosition, CAMERA_TARGET, CAMERA_UP);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(uniforms.viewMatrix, false, viewMatrix);
        gl.uniform3fv(uniforms.cameraPosition, cameraPosition);

        RENDER_LAYERS.forEach((config, index) => {
            composeModel(
                modelMatrix,
                config.position[0],
                config.position[1] + Math.sin(elapsed * 0.15 + index) * 0.14,
                config.position[2],
                config.rotation[0],
                config.rotation[1],
                config.rotation[2] + Math.sin(elapsed * 0.1 + index) * 0.04,
                config.scale,
            );
            multiplyMatrices(modelViewMatrix, viewMatrix, modelMatrix);
            normalFromMatrix4(normalMatrix, modelViewMatrix);

            gl.uniformMatrix4fv(uniforms.modelMatrix, false, modelMatrix);
            gl.uniformMatrix3fv(uniforms.normalMatrix, false, normalMatrix);
            gl.uniform1f(uniforms.time, config.offset + elapsed * config.speed);
            gl.uniform1f(uniforms.amp, config.amp);
            gl.uniform1f(uniforms.width, config.width);
            gl.uniform1f(uniforms.opacity, config.opacity);
            gl.drawElements(gl.TRIANGLES, INDEX_COUNT, gl.UNSIGNED_SHORT, 0);
        });

        animationFrame = window.requestAnimationFrame(render);
    };
    animationFrame = window.requestAnimationFrame(render);

    const handleContextLost = (event: Event) => {
        event.preventDefault();
        window.cancelAnimationFrame(animationFrame);
        onContextLost();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    return () => {
        window.cancelAnimationFrame(animationFrame);
        resizeObserver.disconnect();
        window.removeEventListener("resize", resize);
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(uvBuffer);
        gl.deleteBuffer(indexBuffer);
        gl.deleteProgram(program);
    };
}

function createPlaneGeometry() {
    const vertexCount = (SEGMENTS_X + 1) * (SEGMENTS_Y + 1);
    const positions = new Float32Array(vertexCount * 2);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint16Array(INDEX_COUNT);
    let vertexOffset = 0;

    for (let y = 0; y <= SEGMENTS_Y; y += 1) {
        const yRatio = y / SEGMENTS_Y;
        for (let x = 0; x <= SEGMENTS_X; x += 1) {
            const xRatio = x / SEGMENTS_X;
            positions[vertexOffset] = xRatio * PLANE_WIDTH - PLANE_WIDTH / 2;
            positions[vertexOffset + 1] = PLANE_HEIGHT / 2 - yRatio * PLANE_HEIGHT;
            uvs[vertexOffset] = xRatio;
            uvs[vertexOffset + 1] = 1 - yRatio;
            vertexOffset += 2;
        }
    }

    let indexOffset = 0;
    const rowSize = SEGMENTS_X + 1;
    for (let y = 0; y < SEGMENTS_Y; y += 1) {
        for (let x = 0; x < SEGMENTS_X; x += 1) {
            const topLeft = x + rowSize * y;
            const bottomLeft = x + rowSize * (y + 1);
            const bottomRight = x + 1 + rowSize * (y + 1);
            const topRight = x + 1 + rowSize * y;
            indices[indexOffset] = topLeft;
            indices[indexOffset + 1] = bottomLeft;
            indices[indexOffset + 2] = topRight;
            indices[indexOffset + 3] = bottomLeft;
            indices[indexOffset + 4] = bottomRight;
            indices[indexOffset + 5] = topRight;
            indexOffset += 6;
        }
    }

    return { positions, uvs, indices };
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error("No se pudo crear el programa WebGL.");

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? "Error desconocido al enlazar los shaders.";
        gl.deleteProgram(program);
        throw new Error(log);
    }
    return program;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("No se pudo crear un shader WebGL.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? "Error desconocido al compilar el shader.";
        gl.deleteShader(shader);
        throw new Error(log);
    }
    return shader;
}

function bindAttribute(
    gl: WebGLRenderingContext,
    buffer: WebGLBuffer,
    location: number,
    data: Float32Array,
) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
}

function requireAttribute(gl: WebGLRenderingContext, program: WebGLProgram, name: string) {
    const location = gl.getAttribLocation(program, name);
    if (location < 0) throw new Error(`No se encontró el atributo WebGL ${name}.`);
    return location;
}

function requireUniform(gl: WebGLRenderingContext, program: WebGLProgram, name: string) {
    const location = gl.getUniformLocation(program, name);
    if (!location) throw new Error(`No se encontró el uniforme WebGL ${name}.`);
    return location;
}

function getUniforms(gl: WebGLRenderingContext, program: WebGLProgram): Uniforms {
    return {
        amp: requireUniform(gl, program, "uAmp"),
        cameraPosition: requireUniform(gl, program, "uCameraPosition"),
        deep: requireUniform(gl, program, "uDeep"),
        mid: requireUniform(gl, program, "uMid"),
        modelMatrix: requireUniform(gl, program, "uModelMatrix"),
        normalMatrix: requireUniform(gl, program, "uNormalMatrix"),
        opacity: requireUniform(gl, program, "uOpacity"),
        projectionMatrix: requireUniform(gl, program, "uProjectionMatrix"),
        time: requireUniform(gl, program, "uTime"),
        viewMatrix: requireUniform(gl, program, "uViewMatrix"),
        violet: requireUniform(gl, program, "uViolet"),
        warm: requireUniform(gl, program, "uWarm"),
        width: requireUniform(gl, program, "uWidth"),
    };
}

function srgbToLinear(hex: string) {
    const value = Number.parseInt(hex.slice(1), 16);
    return new Float32Array(
        [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
        }),
    );
}

function perspective(
    out: Float32Array,
    fieldOfView: number,
    aspect: number,
    near: number,
    far: number,
) {
    const focalLength = 1 / Math.tan(fieldOfView / 2);
    out.fill(0);
    out[0] = focalLength / aspect;
    out[5] = focalLength;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
}

function lookAt(out: Float32Array, eye: Float32Array, target: Vec3, up: Vec3) {
    let z0 = eye[0] - target[0];
    let z1 = eye[1] - target[1];
    let z2 = eye[2] - target[2];
    let length = Math.hypot(z0, z1, z2) || 1;
    z0 /= length;
    z1 /= length;
    z2 /= length;

    let x0 = up[1] * z2 - up[2] * z1;
    let x1 = up[2] * z0 - up[0] * z2;
    let x2 = up[0] * z1 - up[1] * z0;
    length = Math.hypot(x0, x1, x2) || 1;
    x0 /= length;
    x1 /= length;
    x2 /= length;

    const y0 = z1 * x2 - z2 * x1;
    const y1 = z2 * x0 - z0 * x2;
    const y2 = z0 * x1 - z1 * x0;

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    out[15] = 1;
}

function composeModel(
    out: Float32Array,
    positionX: number,
    positionY: number,
    positionZ: number,
    rotationX: number,
    rotationY: number,
    rotationZ: number,
    scale: number,
) {
    const halfX = rotationX / 2;
    const halfY = rotationY / 2;
    const halfZ = rotationZ / 2;
    const c1 = Math.cos(halfX);
    const c2 = Math.cos(halfY);
    const c3 = Math.cos(halfZ);
    const s1 = Math.sin(halfX);
    const s2 = Math.sin(halfY);
    const s3 = Math.sin(halfZ);
    const x = s1 * c2 * c3 + c1 * s2 * s3;
    const y = c1 * s2 * c3 - s1 * c2 * s3;
    const z = c1 * c2 * s3 + s1 * s2 * c3;
    const w = c1 * c2 * c3 - s1 * s2 * s3;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    out[0] = (1 - (yy + zz)) * scale;
    out[1] = (xy + wz) * scale;
    out[2] = (xz - wy) * scale;
    out[3] = 0;
    out[4] = (xy - wz) * scale;
    out[5] = (1 - (xx + zz)) * scale;
    out[6] = (yz + wx) * scale;
    out[7] = 0;
    out[8] = (xz + wy) * scale;
    out[9] = (yz - wx) * scale;
    out[10] = (1 - (xx + yy)) * scale;
    out[11] = 0;
    out[12] = positionX;
    out[13] = positionY;
    out[14] = positionZ;
    out[15] = 1;
}

function multiplyMatrices(out: Float32Array, left: Float32Array, right: Float32Array) {
    for (let column = 0; column < 4; column += 1) {
        const offset = column * 4;
        const r0 = right[offset];
        const r1 = right[offset + 1];
        const r2 = right[offset + 2];
        const r3 = right[offset + 3];
        out[offset] = left[0] * r0 + left[4] * r1 + left[8] * r2 + left[12] * r3;
        out[offset + 1] = left[1] * r0 + left[5] * r1 + left[9] * r2 + left[13] * r3;
        out[offset + 2] = left[2] * r0 + left[6] * r1 + left[10] * r2 + left[14] * r3;
        out[offset + 3] = left[3] * r0 + left[7] * r1 + left[11] * r2 + left[15] * r3;
    }
}

function normalFromMatrix4(out: Float32Array, matrix: Float32Array) {
    const a00 = matrix[0];
    const a01 = matrix[1];
    const a02 = matrix[2];
    const a10 = matrix[4];
    const a11 = matrix[5];
    const a12 = matrix[6];
    const a20 = matrix[8];
    const a21 = matrix[9];
    const a22 = matrix[10];
    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;
    const determinant = a00 * b01 + a01 * b11 + a02 * b21 || 1;
    const inverse = 1 / determinant;

    out[0] = b01 * inverse;
    out[1] = b11 * inverse;
    out[2] = b21 * inverse;
    out[3] = (-a22 * a01 + a02 * a21) * inverse;
    out[4] = (a22 * a00 - a02 * a20) * inverse;
    out[5] = (-a21 * a00 + a01 * a20) * inverse;
    out[6] = (a12 * a01 - a02 * a11) * inverse;
    out[7] = (-a12 * a00 + a02 * a10) * inverse;
    out[8] = (a11 * a00 - a01 * a10) * inverse;
}
