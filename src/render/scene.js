import * as THREE from '../../vendor/three.module.min.js';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { createCreatureRenderer } from './creatures.js';
import { createProps } from './props.js';
import { BIOMES } from '../sim/biomes.js';
import { MAX_HEIGHT } from '../sim/terrain.js';
import { recall } from '../sim/memory.js';

const SYLL_COLORS = [0x3987e5, 0xd95926, 0x199e70, 0xc98500];
const MAX_RINGS = 300;

const COLD = new THREE.Color(0xbfd8ff), HOT = new THREE.Color(0xffd3a0), NEUTRAL = new THREE.Color(0xffffff);
const SKY = new THREE.Color(0xa9c9e8);
export const MAX_RENDERED = 600;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = SKY.clone();
  scene.fog = new THREE.Fog(SKY.clone(), 220, 520);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 5;
  controls.maxDistance = 400;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556644, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(40, 80, 20);
  scene.add(hemi, sun);

  let creatures, food, terrain, water, props, heightAt, hazardGroup, hazardKey = '', W = 0;
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  // Call rings: expanding rings at callers, coloured by syllable.
  const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.85, 1, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }), MAX_RINGS);
  rings.name = 'callRings'; rings.frustumCulled = false; rings.count = 0;
  scene.add(rings);
  let ringList = [], lastStep = -1, ringWorld = null;

  // Mental-map overlay for one creature: danger red, food green, familiar ground faint blue.
  const overlay = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }), 1024);
  overlay.name = 'memoryOverlay'; overlay.frustumCulled = false; overlay.visible = false; overlay.count = 0;
  scene.add(overlay);
  let overlayAt = 0;
  function showMemory(c) {
    if (!c) { overlay.visible = false; return; }
    overlay.visible = true;
    const now = performance.now();
    if (now - overlayAt < 500) return;
    overlayAt = now;
    const m = c.map, col = new THREE.Color();
    let k = 0;
    for (let j = 0; j < m.n && k < overlay.instanceMatrix.count; j++) for (let i = 0; i < m.n; i++) {
      const x = (i + 0.5) * m.cell, z = (j + 0.5) * m.cell;
      const d = recall(m, x, z, 'danger'), f = recall(m, x, z, 'food'), v = recall(m, x, z, 'visits');
      const hex = d > 0.05 ? 0xe0533d : f > 0.05 ? 0x3fbf4a : v > 0.05 ? 0x6da7ec : null;
      if (hex === null) continue;
      overlay.setMatrixAt(k, mtx.compose(vec.set(x, heightAt(x, z) + 0.4, z), quat.identity(), scl.set(m.cell * 0.9, 1, m.cell * 0.9)));
      overlay.setColorAt(k, col.setHex(hex));
      k++;
    }
    overlay.count = k;
    overlay.instanceMatrix.needsUpdate = true;
    if (overlay.instanceColor) overlay.instanceColor.needsUpdate = true;
  }
  const mtx = new THREE.Matrix4(), vec = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();

  function updateRings(world) {
    if (ringWorld !== world) { ringList = []; ringWorld = world; lastStep = -1; }
    if (world.stepCount !== lastStep) {
      lastStep = world.stepCount;
      for (const k of world.calls) ringList.push({ x: k.x, z: k.z, syll: k.syll, loud: k.loud, born: world.time });
    }
    ringList = ringList.filter((r) => world.time - r.born < 1.2).slice(-MAX_RINGS);
    const col = new THREE.Color();
    ringList.forEach((r, i) => {
      const s2 = 0.5 + (world.time - r.born) * (3 + 10 * r.loud);
      rings.setMatrixAt(i, mtx.compose(vec.set(r.x, heightAt(r.x, r.z) + 0.25, r.z), quat.identity(), scl.set(s2, 1, s2)));
      rings.setColorAt(i, col.setHex(SYLL_COLORS[r.syll]));
    });
    rings.count = ringList.length;
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  }

  function setWorld(world) {
    for (const o of [terrain, water, props, food, hazardGroup]) if (o) { scene.remove(o); o.traverse((x) => { x.geometry?.dispose(); x.material?.dispose?.(); }); }
    const t = world.terrain;
    W = world.settings.worldSize;
    // Objects float on water; terrain itself dips below it.
    heightAt = (x, z) => Math.max(t.heightAt(x, z), t.waterHeight - 0.3);
    const segs = Math.min(t.n, 128);
    const g = new THREE.PlaneGeometry(W, W, segs, segs).rotateX(-Math.PI / 2).translate(W / 2, 0, W / 2);
    const pos = g.attributes.position, cols = [], c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = t.heightAt(x, z);
      pos.setY(i, h);
      c.setHex(BIOMES[t.biomeAt(x, z)].color).multiplyScalar(0.8 + 0.35 * Math.min(1, h / (MAX_HEIGHT * 1.4)));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    water = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2).translate(W / 2, t.waterHeight, W / 2),
      new THREE.MeshLambertMaterial({ color: 0x3f7fb5, transparent: true, opacity: 0.72 }));
    water.name = 'water';
    props = createProps(t, world.settings.seed);
    food = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.35), new THREE.MeshLambertMaterial({ color: 0x3fbf4a, flatShading: true }), Math.max(1, 2 * world.foodCap));
    food.frustumCulled = false;
    hazardGroup = new THREE.Group();
    hazardKey = '';
    scene.add(terrain, water, props, food, hazardGroup);
    if (!creatures) creatures = createCreatureRenderer(scene, MAX_RENDERED, (x, z) => heightAt(x, z));
    camera.position.set(W / 2, W * 0.45, W / 2 + W * 0.55);
    controls.target.set(W / 2, 0, W / 2);
  }

  const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  function render(world) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    creatures.update(world);
    updateRings(world);
    food.count = Math.min(world.food.length, food.instanceMatrix.count);
    for (let i = 0; i < food.count; i++) {
      const f = world.food[i];
      food.setMatrixAt(i, m.compose(v.set(f.x, heightAt(f.x, f.z) + 0.25, f.z), q, s));
    }
    food.instanceMatrix.needsUpdate = true;

    const key = world.env.hazards.map((h) => h.id).join(',');
    if (key !== hazardKey) {
      hazardKey = key;
      for (const c of [...hazardGroup.children]) { hazardGroup.remove(c); c.geometry.dispose(); }
      for (const hz of world.env.hazards) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(hz.r, hz.r, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xd02a1a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
        disc.position.set(hz.x, heightAt(hz.x, hz.z), hz.z);
        disc.userData.hazardId = hz.id;
        hazardGroup.add(disc);
      }
    }
    // Season tint: light shifts cold-blue in winter, warm in summer.
    const season = world.env.season(world.time);
    sun.color.copy(NEUTRAL).lerp(season < 0 ? COLD : HOT, Math.abs(season) * 0.6);
    controls.update();
    renderer.render(scene, camera);
  }

  // Returns the creature or ground point under a screen position.
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    creatures.bodyMesh.boundingSphere = null; // instances move every frame
    const hit = raycaster.intersectObject(creatures.bodyMesh)[0];
    if (hit && hit.instanceId != null) return { type: 'creature', id: creatures.idAt(hit.instanceId) };
    const hz = raycaster.intersectObjects(hazardGroup.children)[0];
    const g = raycaster.intersectObject(terrain)[0];
    if (g) return { type: 'ground', x: g.point.x, z: g.point.z, hazardId: hz ? hz.object.userData.hazardId : null };
    return null;
  }

  function project(x, z) {
    v.set(x, heightAt(x, z) + 0.5, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  // Keep the camera's offset while tracking a creature; skip wrap-around jumps.
  const fv = new THREE.Vector3();
  function follow(c) {
    if (!c) return;
    fv.set(c.x, heightAt(c.x, c.z), c.z).sub(controls.target);
    if (fv.length() > W / 2) { camera.position.add(fv); controls.target.add(fv); return; }
    fv.multiplyScalar(0.15);
    camera.position.add(fv); controls.target.add(fv);
  }

  return { renderer, scene, camera, controls, setWorld, render, pick, project, follow, showMemory };
}
