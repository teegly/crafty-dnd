import * as THREE from 'three';

export function createPortalAmbienceMesh(camera) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv - 0.5;
        float radius = length(p);
        float angle = atan(p.y, p.x);
        float swirl = sin(angle * 5.0 - radius * 18.0 + uTime * 5.5);
        float ring = smoothstep(0.42, 0.12, radius);
        float edge = smoothstep(0.72, 0.18, radius);
        vec3 violet = vec3(0.54, 0.18, 1.0);
        vec3 magenta = vec3(1.0, 0.18, 0.86);
        vec3 color = mix(violet, magenta, swirl * 0.5 + 0.5);
        float alpha = (0.2 + max(swirl, 0.0) * 0.34) * ring + edge * 0.16;
        gl_FragColor = vec4(color, alpha * uOpacity);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.position.set(0, 0, -1);
  mesh.renderOrder = 100;
  resizePortalAmbienceMesh(camera, mesh);
  return mesh;
}

export function resizePortalAmbienceMesh(camera, mesh) {
  if (!mesh) return;
  const distance = Math.abs(mesh.position.z);
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
  const width = height * (camera.aspect || 1);
  mesh.scale.set(width, height, 1);
}
