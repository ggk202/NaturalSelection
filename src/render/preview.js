import * as THREE from '../../vendor/three.module.min.js';
import { placeParts } from './parts.js';
import { creatureColor } from './creatures.js';

const GEOMS = {
  body: new THREE.IcosahedronGeometry(1, 0), leg: new THREE.CylinderGeometry(1, 0.7, 1, 5),
  digit: new THREE.ConeGeometry(1, 1, 4), eye: new THREE.IcosahedronGeometry(1, 0),
  antenna: new THREE.CylinderGeometry(1, 1, 1, 4), mouth: new THREE.ConeGeometry(1, 1, 5),
};

// One shared renderer: iPad Safari caps live WebGL contexts, so previews draw offscreen and blit.
let shared = null;
function getShared() {
  if (!shared) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(3, 5, 4);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 2), sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    shared = { renderer, scene, camera };
  }
  return shared;
}

export function buildCreature(body) {
  const group = new THREE.Group(), color = creatureColor(body);
  const mats = {
    body: new THREE.MeshLambertMaterial({ color, flatShading: true }),
    limb: new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.7), flatShading: true }),
    eye: new THREE.MeshLambertMaterial({ color: 0xf4f4f0, flatShading: true }),
    mouth: new THREE.MeshLambertMaterial({ color: 0x3a2a2a, flatShading: true }),
  };
  for (const p of placeParts(body)) {
    const mesh = new THREE.Mesh(GEOMS[p.type], mats[p.type] || mats.limb);
    mesh.position.fromArray(p.position); mesh.rotation.set(...p.rotation); mesh.scale.fromArray(p.scale);
    group.add(mesh);
  }
  return group;
}

export function createPreview(canvas) {
  let group = null, raf = 0, angle = 0;
  const ctx = canvas.getContext('2d');
  function loop() {
    const { renderer, scene, camera } = getShared();
    const w = canvas.clientWidth || 160, hgt = canvas.clientHeight || 160, dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hgt * dpr; }
    renderer.setSize(canvas.width, canvas.height, false);
    camera.aspect = canvas.width / canvas.height; camera.updateProjectionMatrix();
    angle += 0.01;
    scene.add(group);
    group.rotation.y = angle;
    renderer.render(scene, camera);
    scene.remove(group);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(renderer.domElement, 0, 0);
    raf = requestAnimationFrame(loop);
  }
  return {
    show(genome) {
      const s = genome.body.size, { camera } = getShared();
      group = buildCreature(genome.body);
      camera.position.set(2.6 * s + 0.8, 1.6 * s + 0.6, 2.6 * s + 0.8);
      camera.lookAt(0, 0.6 * s, 0);
      if (!raf) loop();
    },
    dispose() { cancelAnimationFrame(raf); raf = 0; group = null; },
  };
}
