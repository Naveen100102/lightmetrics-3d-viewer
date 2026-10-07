import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCameraModel } from '../src/model.js';

// GLTFExporter uses FileReader for Blob conversion; Node supplies Blob but not
// FileReader. This texture-free model needs no browser canvas or WebGL context.
class NodeFileReader {
  result = null;
  error = null;

  readAsArrayBuffer(blob) {
    this.read(blob.arrayBuffer());
  }

  readAsDataURL(blob) {
    this.read(blob.arrayBuffer().then(buffer =>
      `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`));
  }

  read(promise) {
    this.result = null;
    this.error = null;
    promise.then(result => {
      this.result = result;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }, error => {
      this.error = error;
      this.onerror?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}

globalThis.FileReader ??= NodeFileReader;

function inspect(scene, label) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  let meshes = 0;
  let triangles = 0;
  let reflectedMeshes = 0;

  scene.traverseVisible(object => {
    if (!object.matrixWorld.elements.every(Number.isFinite)) {
      throw new Error(`${label}: nonfinite transform on ${object.name}`);
    }
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    if (!position || !position.count) {
      throw new Error(`${label}: empty geometry on ${object.name}`);
    }
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = attribute.array ?? attribute.data?.array;
      if (!values || !values.every(Number.isFinite)) {
        throw new Error(`${label}: nonfinite ${name} attribute on ${object.name}`);
      }
    }
    const elementCount = geometry.index?.count ?? position.count;
    if (elementCount % 3) {
      throw new Error(`${label}: incomplete triangle on ${object.name}`);
    }
    if (geometry.index && geometry.index.array.some(index => index >= position.count)) {
      throw new Error(`${label}: out-of-range vertex index on ${object.name}`);
    }
    triangles += elementCount / 3;
    reflectedMeshes += Number(object.matrixWorld.determinant() < 0);
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });

  const size = bounds.getSize(new THREE.Vector3());
  if (!meshes || bounds.isEmpty() || !size.toArray().every(value => Number.isFinite(value) && value > 0)) {
    throw new Error(`${label}: invalid or empty visible bounds`);
  }
  return { meshes, triangles, reflectedMeshes, bounds, size };
}

const sourceModel = createCameraModel();
sourceModel.userData.setLockVisible?.(false);
const model = sourceModel.clone(true);
const geometryCache = new Map();
let originalVertices = 0;
let weldedVertices = 0;

model.traverseVisible(object => {
  if (!object.isMesh) return;
  const original = object.geometry;
  if (!geometryCache.has(original)) {
    // mergeVertices compares every attribute, preserving UV and normal seams.
    // Work on a copy so neither the source mesh nor a shared geometry is changed.
    const copy = original.clone();
    copy.normalizeNormals();
    const welded = mergeVertices(copy, 1e-5);
    geometryCache.set(original, welded);
    originalVertices += original.getAttribute('position').count;
    weldedVertices += welded.getAttribute('position').count;
    copy.dispose();
  }
  object.geometry = geometryCache.get(original);
});

const metersPerUnit = model.userData.metersPerModelUnit;
if (!Number.isFinite(metersPerUnit) || metersPerUnit <= 0) {
  throw new Error('The model must declare a positive userData.metersPerModelUnit.');
}

// The source already normalizes the enclosure to its published proportions.
// Convert its 30 mm scene units to glTF's metre convention exactly once.
model.scale.multiplyScalar(metersPerUnit);
model.userData.exportUnits = 'meters';
const source = inspect(model, 'Source');
const binary = await new GLTFExporter().parseAsync(model, {
  binary: true,
  onlyVisible: true,
});
if (!(binary instanceof ArrayBuffer)) throw new Error('Expected a binary GLB result.');

const gltf = await new GLTFLoader().parseAsync(binary, '');
const reloaded = inspect(gltf.scene, 'Reloaded GLB');
if (source.meshes !== reloaded.meshes || source.triangles !== reloaded.triangles) {
  throw new Error(`Round-trip changed geometry counts: ${source.meshes}/${source.triangles} → ${reloaded.meshes}/${reloaded.triangles}`);
}
const boundError = Math.max(
  source.bounds.min.distanceTo(reloaded.bounds.min),
  source.bounds.max.distanceTo(reloaded.bounds.max),
);
if (boundError > 1e-6) {
  throw new Error(`Round-trip changed bounds by ${boundError} metres.`);
}

const output = fileURLToPath(new URL('../public/models/jc400p-reconstruction.glb', import.meta.url));
await mkdir(dirname(output), { recursive: true });
await writeFile(`${output}.tmp`, new Uint8Array(binary));
await rename(`${output}.tmp`, output);

console.log(JSON.stringify({
  output: relative(process.cwd(), output),
  bytes: binary.byteLength,
  mebibytes: Number((binary.byteLength / 1024 / 1024).toFixed(2)),
  meshes: reloaded.meshes,
  triangles: reloaded.triangles,
  reflectedMeshes: reloaded.reflectedMeshes,
  uniqueGeometries: geometryCache.size,
  originalVertices,
  weldedVertices,
  boundsMetersIncludingCable: reloaded.size.toArray().map(value => Number(value.toFixed(6))),
  roundTripBoundsErrorMeters: boundError,
  sourceMetersPerModelUnit: metersPerUnit,
  optionalLock: 'excluded',
  validation: 'finite geometry, transforms, indices, counts and bounds passed',
}, null, 2));
