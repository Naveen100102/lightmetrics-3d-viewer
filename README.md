# LightMetrics JC400P 3D viewer

[Open the live interactive 3D viewer](https://naveen100102.github.io/lightmetrics-3d-viewer/)

A rotatable Three.js reconstruction of the JC400P camera shown in the supplied images. The reference product is identified through the [LightMetrics camera catalogue](https://www.lightmetrics.co/cameras) and [Jimi IoT's official JC400P product page](https://th.jimiiot.com/products/jc400p-aivision-cam.html).

Jimi IoT lists device dimensions of **109 × 69 × 52 mm** and a weight of **233 g** on its product page. The reconstructed enclosure is normalized to those overall dimensions, with the cable and optional lock excluded from the enclosure measurement. Individual components, contours, and hidden surfaces are still estimated from photographs; this is not manufacturer CAD or a dimensionally validated mechanical model. The source uses **one scene unit = 30 mm**, declared in `model.userData.metersPerModelUnit`. Both the browser download and the reusable exporter convert to metres for glTF. Do not use the full cable-inclusive bounding box as the device's physical dimensions.

## Run and deploy

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The development server must remain running while you view it.

```sh
npm run build
npm run preview
```

Deploy the generated `dist` directory to a static website host. For a subdirectory such as `/camera-viewer/`, build with its base path:

```sh
npm run build -- --base=/camera-viewer/
```

## Controls

- Drag with the mouse or one finger to rotate through 360°.
- Right-drag or Shift-drag to move the model around the view. On touch screens, move with two fingers. Reset or choose a preset to center it again.
- Scroll or pinch to zoom.
- Choose **Reference angle**, **Lens**, **Side**, **Panel detail**, or **Back** for preset views. The original product image alongside the viewer changes to support comparison.
- Use **Panel detail** for a close view of the reference-traced right grille, card mouths, and fasteners.
- Toggle **Auto-rotate**, reset the view, or enter fullscreen.
- Toggle **Side lock** to show the optional lock seen in one of the references.
- Focus the viewer and use arrow keys to rotate.
- **Download 3D model** exports the current visible configuration as `lightmetrics-camera.glb`.

The viewer fits the complete model, including the cable, to the available space. Resizing preserves the viewing direction and relative zoom. The GLB export contains the mesh and materials; the webpage interface, studio lighting, and orbit controls are supplied by the viewer rather than included in that model file.

## Use on your website

### Load the exported GLB

The ready-to-use metric asset is `public/models/jc400p-reconstruction.glb`. Regenerate it after changes to `src/model.js` or `src/right-panel.js`:

```sh
node scripts/export-model.mjs
```

The script exports the default configuration without the optional lock, reloads the GLB with `GLTFLoader`, and verifies mesh/triangle counts, finite geometry and transforms, valid indices, and matching bounds before writing the file. It runs in Node without a browser or WebGL context.

Copy that file into your website's public assets and load it into your Three.js scene:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/models/jc400p-reconstruction.glb');
scene.add(gltf.scene);
```

Add an environment or studio lights and `OrbitControls` in the receiving viewer. This route loads prebuilt geometry and avoids running the procedural construction and boolean operations on every page visit. To include the optional lock, enable it in the viewer and use the browser download to export that configuration. The procedural JavaScript helper functions do not travel with a GLB.

### Use the procedural source

Copy `src/model.js` and `src/right-panel.js` into the same directory in your project and install their dependencies:

```sh
npm install three three-bvh-csg
```

```js
import { createCameraModel } from './model.js';

const model = createCameraModel();
scene.add(model);
model.userData.setLockVisible(true); // Optional; hidden by default.
```

`createCameraModel()` returns a Three.js `Group`. Local X runs across the housing, +Y points toward the cable end, and +Z points toward the mounting face. The road-facing optical module points toward the lens end as well as outward from that face. Presentation rotation may be applied by the receiving viewer. The source model has already been normalized to the manufacturer's overall enclosure dimensions in 30 mm scene units. To use the procedural model in a scene measured in metres, call `model.scale.multiplyScalar(model.userData.metersPerModelUnit)` once. The exported GLB already has that conversion; do not apply it again. Overall size is calibrated, while individual component dimensions remain estimates.

The source uses Three.js's `RoundedBoxGeometry` and `BufferGeometryUtils` addons plus `three-bvh-csg` for the recessed housing geometry. The separate `src/right-panel.js` module traces the right-side outline, diagonal vent channels, service openings, and fastener locations in reference-image coordinates; it also supplies the matching housing recess outline. Its port legends use Three.js's bundled Helvetiker font through `FontLoader`. The other side remains a separate assembly. Materials are generated in code and do not require external texture files. Dispose geometries, materials, and viewer resources when removing an instance in a single-page application.

### Embed the complete viewer

After hosting the built site, add an iframe to your page or Webflow Embed element:

```html
<iframe
  src="https://YOUR-HOST.example/camera-viewer/"
  title="JC400P interactive 3D camera"
  style="width:100%;height:900px;border:0"
  loading="lazy"
  allowfullscreen
></iframe>
```

Replace the example URL with your deployed address and adjust the iframe height for your layout. WebGL 2 support is required. Google Fonts are optional; local sans-serif fallbacks are configured.

## Reference material

- [LightMetrics compatible camera catalogue](https://www.lightmetrics.co/cameras) — identifies the JC400P and includes the matching front product image.
- [Jimi IoT JC400P product page](https://th.jimiiot.com/products/jc400p-aivision-cam.html) — manufacturer views and the published 109 × 69 × 52 mm dimensions.
- [Jimi IoT JC400P specification sheet](https://www.jimilab.com/wp-content/uploads/2022/09/JC400P-0313.pdf) — manufacturer PDF listing the same dimensions and 233 g weight.

Downloaded visual references are in `public/reference/`, including the LightMetrics front image, manufacturer views, and a larger rear image. They guide reconstruction and are not wrapped onto the mesh to simulate 3D.

## Three.js APIs

- [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)
- [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html)
- [RoundedBoxGeometry](https://threejs.org/docs/pages/RoundedBoxGeometry.html)
