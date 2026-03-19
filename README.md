

# JSlug: Three.js Font Rendering Pipeline

JSlug is a Javascript and WebGL port of Eric Lengyel's **Slug** font rendering algorithm, implemented for **Three.js**.

Unlike traditional MSDF (Multi-Channel Signed Distance Field) font rendering which can suffer from corner rounding and texture resolution limits, the Slug algorithm evaluates the quadratic bezier curves of the TrueType font directly within the fragment shader. This enables resolution-independent font rendering, sharp corners, and precise anti-aliasing.

## Screenshots

![JSlug Rendering Demo](screenshot.png)


## Features

- **Client-side Generation**: Parses `.ttf` and `.otf` data dynamically using `opentype.js` to compute curve layouts and spatial binning locally.
- **Binary Format**: Serializes curves and bin maps to `.sluggish` file payloads for cache delivery.
- **Instanced Rendering**: Passes coordinate frames and glyph indexing variables to WebGL vertex attributes backends.
- **Typography Alignment**: Iterates layout structures utilizing metric scalars mapping direct width increments.

### Phase 2: Native PBR & Shadow Integration
- **Modular Shader Chunks**: The core Slug mathematical raytracer has been decoupled into distinct Three.js `#include` chunks (`slug_fragment_core`, `slug_fragment_standard`, `slug_pars_vertex`).
- **Standard Material Hooks**: Utilizes `onBeforeCompile` to non-destructively splice the font rendering algorithm directly into native Three.js materials (e.g. `MeshStandardMaterial`, `MeshDepthMaterial`).
- **Physical Lighting**: Evaluates vector glyphs securely under physically based rendering paradigms, seamlessly scattering Light arrays and mapping PBR Specular boundaries.
- **Dynamic Occlusions**: Typography casts and receives accurate, anti-aliased shadows inside the active scene viewport using standard Depth buffer constraints and custom `MeshDistanceMaterial` definitions.

## Quick Start Example

```javascript
import * as THREE from 'three';
import { SlugLoader } from './src/SlugLoader.js';
import { SlugGeometry } from './src/SlugGeometry.js';
import { injectSlug } from './src/SlugMaterial.js';

// 1. Load the pre-compiled .sluggish binary font data
new SlugLoader().load('path/to/font.sluggish', (slugData) => {
    
    // 2. Initialize the scalable vector geometry
    const geometry = new SlugGeometry(1000); // Specify max glyph capacity
    
    // 3. Create a native Three.js Standard Material
    const material = new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        roughness: 1.0,
        metalness: 0.0,
        side: THREE.DoubleSide
    });
    
    // 4. Inject the mathematical Slug raytracer directly into the material's Shader Chunks
    injectSlug(material, slugData);
    
    // 5. Append your text
    geometry.addText('MyString! WOOHOO!', slugData, {
        fontScale: 0.5,
        justify: 'center'
    });

    // 6. Spawn the finalized PBR Mesh
    const slugMesh = new THREE.Mesh(geometry, material);
    slugMesh.castShadow = true;
    slugMesh.receiveShadow = true;
    scene.add(slugMesh);
});
```

## Usage

1. Serve the repository locally (e.g., `npx http-server`).
2. Open `demo/index.html`.
3. Use the UI to load a standard `.ttf` file. The Javascript generator will parse the curves, initialize the GPU textures, and dynamically render standard PBR typography inside the demo viewer.
4. Toggle the **RawShader Fallback** to swap between Native Standard Lighting graphs or unlit baseline GLSL debugging buffers.
5. (Optional) Click **Download .sluggish** to cache the generated font data to a serialized binary array.

## Credits & Acknowledgements

*   **Eric Lengyel** for the [Slug Algorithm](http://sluglibrary.com/).
*   **The Sluggish C++ Port** for providing the architectural reference for mapping Slug textures directly to generic WebGL buffer pipelines.
*   **[opentype.js](https://github.com/opentypejs/opentype.js)** for providing the native Javascript TrueType parsing core.
*   Ported to Javascript and Three.js by **[manthrax](https://github.com/manthrax)**.
