import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCameraModel } from './model.js';
import './style.css';

const host = document.querySelector('#viewer');
const status = document.querySelector('#status');

try {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);

  // Broad, neutral reflections reveal curved black plastic without blue casts.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.4;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.45));
  for (const [position, intensity] of [
    [[-4, -3, 7], 1.7], [[5, 2, 3], 0.25], [[2, 5, -4], 0.6],
  ]) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.set(...position);
    if(position[0] === -4) {
      light.castShadow = true;light.shadow.mapSize.set(2048,2048);
      Object.assign(light.shadow.camera,{left:-4,right:4,top:5,bottom:-4,near:.1,far:25});
      light.shadow.bias=-.0003;light.shadow.normalBias=.015;
    }
    scene.add(light);
  }

  const cameraFill = new THREE.DirectionalLight(0xffffff, 0.65);
  scene.add(cameraFill, cameraFill.target);

  const model = createCameraModel();
  scene.add(model);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const panelBounds = new THREE.Box3().setFromObject(model.getObjectByName('Reference-traced right side grille and service ports'));
  let activeBounds = bounds;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  host.setAttribute('aria-label', 'Interactive 3D camera. Drag to rotate, right-drag or Shift-drag to move, scroll to zoom, or use arrow keys. On touch screens, use two fingers to move and pinch to zoom.');
  document.querySelector('.orbit-hint').textContent = 'DRAG TO ROTATE · RIGHT-DRAG / SHIFT-DRAG TO MOVE · SCROLL TO ZOOM';
  controls.autoRotateSpeed = 0.55;
  controls.minPolarAngle = 0.01;
  controls.maxPolarAngle = Math.PI - 0.01;

  const views = {
    perspective: new THREE.Vector3(0.7, -9, 10).normalize(),
    front: new THREE.Vector3(0, -1, 0.85).normalize(),
    side: new THREE.Vector3(1, 0, 0),
    panel: new THREE.Vector3(8, -10, 9).normalize(),
    back: new THREE.Vector3(6, 6, -8).normalize(),
  };
  camera.position.copy(center).addScaledVector(views.perspective, 12);
  camera.lookAt(center);
  let fittedDistance = 12;
  let hasFramed = false;

  // Fit all eight corners, including the cable, to the available canvas.
  // Resizing retains the user's viewing direction and relative zoom.
  function frameModel(direction, relativeZoom = 1, panOffset = new THREE.Vector3()) {
    const focusCenter = activeBounds.getCenter(new THREE.Vector3());
    const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontalTangent = verticalTangent * camera.aspect;
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const corner = new THREE.Vector3();
    let distance = 0;
    for (const x of [activeBounds.min.x, activeBounds.max.x]) {
      for (const y of [activeBounds.min.y, activeBounds.max.y]) {
        for (const z of [activeBounds.min.z, activeBounds.max.z]) {
          corner.set(x, y, z).sub(focusCenter);
          const depth = corner.dot(direction);
          distance = Math.max(distance,
            Math.abs(corner.dot(right)) * 1.08 / horizontalTangent + depth,
            Math.abs(corner.dot(up)) * 1.12 / verticalTangent + depth);
        }
      }
    }
    fittedDistance = Math.max(distance, 2);
    controls.minDistance = fittedDistance * 0.42;
    controls.maxDistance = fittedDistance * 2.5;
    focusCenter.add(panOffset);
    controls.target.copy(focusCenter);
    camera.position.copy(focusCenter).addScaledVector(direction, fittedDistance * relativeZoom);
    camera.lookAt(focusCenter);
    controls.update();
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const offset = camera.position.clone().sub(controls.target);
    const panOffset = controls.target.clone().sub(activeBounds.getCenter(new THREE.Vector3()));
    const zoom = hasFramed ? offset.length() / fittedDistance : 1;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.setFocalLength(55);
    camera.updateProjectionMatrix();
    frameModel(offset.normalize(), THREE.MathUtils.clamp(zoom, 0.42, 2.5), panOffset);
    hasFramed = true;
  }
  new ResizeObserver(resize).observe(host);
  resize();
  controls.saveState();

  const rotate = document.querySelector('#rotate');
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  const referenceImage = document.querySelector('#reference-image');
  const referenceSources = { perspective: 'jc400p-lightmetrics-front.webp', front:'jc400p-lightmetrics-front.webp', side:'jc400p-official-3.png', panel:'jc400p-official-3.png', back:'jc400p-official-rear-large.png' };
  let selectedView = 'perspective';
  function stopRotation() {
    controls.autoRotate = false;
    rotate.setAttribute('aria-pressed', 'false');
  }
  controls.addEventListener('start', () => {
    stopRotation();
    viewButtons.forEach(button => button.classList.remove('active'));
  });
  rotate.onclick = () => {
    controls.autoRotate = !controls.autoRotate;
    rotate.setAttribute('aria-pressed', String(controls.autoRotate));
  };
  viewButtons.forEach(button => {
    button.onclick = () => {
      stopRotation();
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      activeBounds = button.dataset.view === 'panel' ? panelBounds : bounds;
      frameModel(views[button.dataset.view], button.dataset.view === 'perspective' ? 1.18 : 1);
      selectedView = button.dataset.view;
      const referenceFile = selectedView === 'perspective' && document.querySelector('#lock').getAttribute('aria-pressed') === 'true' ? 'jc400p-official-1.png' : referenceSources[selectedView];
      referenceImage.src = new URL(`reference/${referenceFile}`, document.baseURI).href;
      referenceImage.alt = `Original JC400P manufacturer reference, ${selectedView} view`;
      controls.enableDamping = damping;
      viewButtons.forEach(other => other.classList.toggle('active', other === button));
    };
  });
  document.querySelector('#reset').onclick = () => viewButtons[0].click();
  document.querySelector('#fullscreen').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.requestFullscreen();
    } catch {
      status.textContent = 'Fullscreen is unavailable in this browser.';
    }
  };

  const lockButton = document.querySelector('#lock');
  if (typeof model.userData.setLockVisible === 'function') {
    lockButton.hidden = false;
    model.userData.setLockVisible(false);
    lockButton.onclick = () => {
      const visible = lockButton.getAttribute('aria-pressed') !== 'true';
      model.userData.setLockVisible(visible);
      if(selectedView === 'perspective')referenceImage.src = new URL(`reference/${visible ? 'jc400p-official-1.png' : referenceSources.perspective}`, document.baseURI).href;
      lockButton.setAttribute('aria-pressed', String(visible));
    };
  }

  document.querySelector('#export').onclick = async () => {
    const button = document.querySelector('#export');
    button.disabled = true;
    button.textContent = 'Preparing model…';
    try {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const exportModel = model.clone(true);
      exportModel.scale.multiplyScalar(model.userData.metersPerModelUnit || 1);
      const { mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js');
      exportModel.traverse(object => {
        if(object.isMesh) {
          const geometry = object.geometry.clone();
          geometry.normalizeNormals();
          object.geometry = mergeVertices(geometry, 1e-5);
          geometry.dispose();
        }
      });
      const result = await new GLTFExporter().parseAsync(exportModel, { binary: true });
      const url = URL.createObjectURL(new Blob([result], { type: 'model/gltf-binary' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'lightmetrics-camera.glb';
      anchor.click();
      exportModel.traverse(object => { if(object.isMesh)object.geometry.dispose(); });
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status.textContent = 'Model exported successfully.';
    } catch (error) {
      status.textContent = 'Export failed. Please try again.';
      console.error(error);
    } finally {
      button.disabled = false;
      button.textContent = 'Download 3D model ↗';
    }
  };

  host.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    stopRotation();
    viewButtons.forEach(button => button.classList.remove('active'));
    const offset = camera.position.clone().sub(controls.target);
    const toY = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
    const spherical = new THREE.Spherical().setFromVector3(offset.applyQuaternion(toY));
    spherical.theta += event.key === 'ArrowLeft' ? 0.12 : event.key === 'ArrowRight' ? -0.12 : 0;
    spherical.phi += event.key === 'ArrowUp' ? -0.12 : event.key === 'ArrowDown' ? 0.12 : 0;
    spherical.makeSafe();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical).applyQuaternion(toY.invert()));
    controls.update();
  });

  const requestedView = new URLSearchParams(window.location.search).get('view');
  (viewButtons.find(button => button.dataset.view === requestedView) || viewButtons[0]).click();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    controls.update(clock.getDelta());
    cameraFill.position.copy(camera.position);
    cameraFill.target.position.copy(controls.target);
    renderer.render(scene, camera);
  });
} catch (error) {
  status.textContent = 'Unable to start 3D. Please use a browser with WebGL enabled.';
  console.error(error);
}
