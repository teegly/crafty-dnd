import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './util.js';

// Hero prop: the temple arch the avatar runs under, now backed by
// Stone_archway.glb. Native bbox ~ x[-1.84, 1.84], y[0, 4.59]. Per-axis scale
// so we can widen the arch without stretching it taller.
const PROP_MODEL_SCALE = { x: 1.6, y: 1.2, z: 1.2 };
const PORTAL_MODEL_SCALE = 0.34;

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
let portalStructureMaterial = null;
let portalWindowMaterial = null;
let portalSwirlMaterial = null;
let archwayGltfScene = null;
let portalGltfScene = null;
let portalLoadStarted = false;
const pendingArchways = [];
const pendingPortals = [];
gltfLoader.load(assetUrl('/assets/models/Stone_archway.glb'), (gltf) => {
  archwayGltfScene = gltf.scene;
  for (const group of pendingArchways) {
    attachArchwayModel(group);
  }
  pendingArchways.length = 0;
}, undefined, (error) => {
  console.error('Failed to load archway model', error);
  pendingArchways.length = 0;
});

function attachArchwayModel(group) {
  if (!archwayGltfScene) return;
  const clone = archwayGltfScene.clone(true);
  clone.scale.set(PROP_MODEL_SCALE.x, PROP_MODEL_SCALE.y, PROP_MODEL_SCALE.z);
  clone.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = false;
    }
  });
  group.add(clone);
  group.userData.modelInstance = clone;
}

export function createHeroArchway() {
  const group = new THREE.Group();
  if (archwayGltfScene) {
    attachArchwayModel(group);
  } else {
    pendingArchways.push(group);
  }
  return group;
}

function assignProjectedUvs(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const axes = [
    { name: 'x', size: size.x, min: box.min.x },
    { name: 'y', size: size.y, min: box.min.y },
    { name: 'z', size: size.z, min: box.min.z },
  ].sort((a, b) => b.size - a.size);
  const uAxis = axes[0];
  const vAxis = axes[1];
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (position.getComponent(index, ['x', 'y', 'z'].indexOf(uAxis.name)) - uAxis.min) / Math.max(uAxis.size, 0.001);
    uv[index * 2 + 1] = (position.getComponent(index, ['x', 'y', 'z'].indexOf(vAxis.name)) - vAxis.min) / Math.max(vAxis.size, 0.001);
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.attributes.uv.needsUpdate = true;
}

function ensurePortalAssetsLoading() {
  if (!portalStructureMaterial) {
    const portalStructureTexture = textureLoader.load(assetUrl('/assets/textures/portal/portal-structure.png'));
    const portalWindowTexture = textureLoader.load(assetUrl('/assets/textures/portal/portal.png'));
    portalStructureTexture.colorSpace = THREE.SRGBColorSpace;
    portalStructureTexture.wrapS = THREE.RepeatWrapping;
    portalStructureTexture.wrapT = THREE.RepeatWrapping;
    portalStructureTexture.repeat.set(4, 4);
    portalStructureTexture.magFilter = THREE.NearestFilter;
    portalStructureTexture.minFilter = THREE.NearestFilter;
    portalStructureTexture.generateMipmaps = false;
    portalWindowTexture.colorSpace = THREE.SRGBColorSpace;
    portalWindowTexture.wrapS = THREE.ClampToEdgeWrapping;
    portalWindowTexture.wrapT = THREE.ClampToEdgeWrapping;
    portalWindowTexture.magFilter = THREE.NearestFilter;
    portalWindowTexture.minFilter = THREE.NearestFilter;
    portalWindowTexture.generateMipmaps = false;
    portalStructureMaterial = new THREE.MeshBasicMaterial({
      map: portalStructureTexture,
      color: 0x9a9288,
      fog: true,
    });
    portalWindowMaterial = new THREE.MeshBasicMaterial({
      map: portalWindowTexture,
      color: 0xb26bff,
      transparent: true,
      opacity: 0.92,
      alphaTest: 0.01,
      depthWrite: false,
      fog: false,
    });
    portalSwirlMaterial = new THREE.ShaderMaterial({
      transparent: false,
      depthWrite: true,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
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
        varying vec2 vUv;

        void main() {
          vec2 p = vUv - 0.5;
          float radius = length(p);
          float angle = atan(p.y, p.x);
          float spiral = sin(angle * 7.0 - radius * 24.0 + uTime * 4.0);
          vec3 deep = vec3(0.24, 0.05, 0.55);
          vec3 glow = vec3(0.78, 0.32, 1.0);
          vec3 color = mix(deep, glow, spiral * 0.5 + 0.5);
          float edge = smoothstep(0.58, 0.08, radius);
          vec3 fill = mix(vec3(0.18, 0.03, 0.38), color, edge);
          gl_FragColor = vec4(fill, 1.0);
        }
      `,
    });
  }

  if (portalLoadStarted) return;
  portalLoadStarted = true;
  gltfLoader.load(assetUrl('/assets/models/portal.glb'), (gltf) => {
    portalGltfScene = gltf.scene;
    for (const group of pendingPortals) {
      attachPortalModel(group);
    }
    pendingPortals.length = 0;
  }, undefined, (error) => {
    console.error('Failed to load portal model', error);
    pendingPortals.length = 0;
  });
}

function attachPortalModel(group) {
  if (!portalGltfScene || group.userData.modelInstance) return;
  const clone = portalGltfScene.clone(true);
  clone.rotation.y = -Math.PI / 2;
  clone.scale.setScalar(PORTAL_MODEL_SCALE);
  clone.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = false;
      node.renderOrder = 8;
      if (node.name === 'Plane' || node.name === 'Circle') {
        node.geometry = node.geometry.clone();
        assignProjectedUvs(node.geometry);
        node.renderOrder = 8;
        node.material = portalStructureMaterial;
      } else if (node.name === 'Cube' || node.name === 'Cube001') {
        node.geometry = node.geometry.clone();
        assignProjectedUvs(node.geometry);
        node.renderOrder = 7;
        const swirl = new THREE.Mesh(node.geometry.clone(), portalSwirlMaterial);
        swirl.position.copy(node.position);
        swirl.rotation.copy(node.rotation);
        swirl.scale.copy(node.scale);
        swirl.renderOrder = 6;
        node.parent.add(swirl);
        node.material = portalWindowMaterial;
      }
    }
  });
  group.add(clone);
  group.userData.modelInstance = clone;
}

export function createPortal() {
  ensurePortalAssetsLoading();
  const group = new THREE.Group();
  group.visible = false;
  if (portalGltfScene) {
    attachPortalModel(group);
  } else {
    pendingPortals.push(group);
  }
  return group;
}

export function updatePortalMaterials(elapsed) {
  if (!portalSwirlMaterial) return;
  portalSwirlMaterial.uniforms.uTime.value = elapsed;
}
