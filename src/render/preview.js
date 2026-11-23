import * as THREE from '../../vendor/three.module.min.js';
import { creatureColor, organsOf } from './creatures.js';
import { traitsOf } from '../sim/genome.js';
import { expandBody } from '../sim/bodyplan.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const ORGAN = { eyes: new THREE.IcosahedronGeometry(1, 0), mouths: new THREE.ConeGeometry(1, 1, 5).rotateZ(-Math.PI / 2), antennae: new THREE.CylinderGeometry(1, 1, 1, 4).translate(0, 0.5, 0), spikes: new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0), claws: new THREE.ConeGeometry(1, 1, 4).rotateZ(-Math.PI / 2) };
const ORGAN_COLOR = { eyes: 0xf4f4f0, mouths: 0x3a2a2a, claws: 0x2c2620 };

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

// The creature's rest pose: one box per body part plus its organs (same placement as the world view).
export function buildCreature(genome) {
  const group = new THREE.Group(), color = creatureColor(traitsOf(genome));
  for (const p of expandBody(genome.body)) {
    const part = new THREE.Group();
    part.position.fromArray(p.pos); part.quaternion.fromArray(p.rot);
    const tint = color.clone();
    if (p.covering === 'fur') tint.lerp(new THREE.Color(0x9a7a55), 0.5); else if (p.covering === 'shell') tint.multiplyScalar(0.55);
    const box = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: tint, flatShading: true }));
    box.scale.fromArray(p.size);
    part.add(box);
    for (const [type, pos, scl, rot] of organsOf(p)) {
      const o = new THREE.Mesh(ORGAN[type], new THREE.MeshLambertMaterial({ color: ORGAN_COLOR[type] ?? tint, flatShading: true }));
      o.position.fromArray(pos); o.scale.fromArray(scl); o.rotation.set(...rot);
      part.add(o);
    }
    group.add(part);
    group.userData.radius = Math.max(group.userData.radius || 0, Math.hypot(...p.pos) + Math.max(...p.size) / 2);
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
      const { camera } = getShared();
      group = buildCreature(genome);
      const s = group.userData.radius; // frame the whole body
      camera.position.set(2.2 * s + 0.5, 1.4 * s + 0.4, 2.2 * s + 0.5);
      camera.lookAt(0, 0, 0);
      if (!raf) loop();
    },
    dispose() { cancelAnimationFrame(raf); raf = 0; group = null; },
  };
}
