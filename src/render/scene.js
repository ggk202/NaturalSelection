import * as THREE from '../../vendor/three.module.min.js';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { createCreatureRenderer } from './creatures.js';
import { makeHeightAt } from './terrain.js';

const COLD = new THREE.Color(0xbfd8ff), HOT = new THREE.Color(0xffd3a0), NEUTRAL = new THREE.Color(0xffffff);
const SKY = new THREE.Color(0xa9c9e8);
export const MAX_RENDERED = 600;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = SKY.clone();
  scene.fog = new THREE.Fog(SKY.clone(), 120, 260);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 5;
  controls.maxDistance = 220;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556644, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(40, 80, 20);
  scene.add(hemi, sun);

  let creatures, food, terrain, heightAt, hazardGroup, hazardKey = '', W = 0;
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  function setWorld(world) {
    if (terrain) { scene.remove(terrain, food, hazardGroup); terrain.geometry.dispose(); }
    W = world.settings.worldSize;
    heightAt = makeHeightAt(W);
    const g = new THREE.PlaneGeometry(W, W, 64, 64).rotateX(-Math.PI / 2).translate(W / 2, 0, W / 2);
    const pos = g.attributes.position, cols = [];
    const north = new THREE.Color(0xdfe9ee), mid = new THREE.Color(0x7fae5a), south = new THREE.Color(0xd9c27a), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, heightAt(x, z) - 0.05);
      const t = z / W; // north (z=0) is cold
      if (world.settings.env.temperature) c.copy(t < 0.5 ? north : mid).lerp(t < 0.5 ? mid : south, t < 0.5 ? t * 2 : (t - 0.5) * 2);
      else c.copy(mid);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    food = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.35), new THREE.MeshLambertMaterial({ color: 0x3fbf4a, flatShading: true }), Math.max(1, world.settings.maxFood));
    food.frustumCulled = false;
    hazardGroup = new THREE.Group();
    hazardKey = '';
    scene.add(terrain, food, hazardGroup);
    if (!creatures) creatures = createCreatureRenderer(scene, MAX_RENDERED, (x, z) => heightAt(x, z));
    camera.position.set(W / 2, 70, W / 2 + 80);
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
    creatures.update(world.creatures, world.time);
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
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(hz.r, hz.r, 3.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xd02a1a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
        disc.position.set(hz.x, 0, hz.z);
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

  return { renderer, scene, camera, controls, setWorld, render, pick, project };
}
