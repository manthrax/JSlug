# JSlug: Three.js Font Rendering Pipeline

JSlug is a pure Javascript port of Eric Lengyel's revolutionary **Slug** font rendering algorithm, natively integrated with **Three.js** and WebGL 2. 

Unlike traditional MSDF (Multi-Channel Signed Distance Field) font rendering which suffers from corner rounding and high-resolution texture memory limits, the Slug algorithm evaluates the raw quadratic bezier curves of the TrueType font directly within the fragment shader. This enables true infinite-resolution font rendering, flawless sharp corners, and perfectly precise topological anti-aliasing.

## Features

- **On-the-Fly Generation**: Parses `.ttf` and `.otf` fonts directly in the browser via `opentype.js`, mathematically computing boundary bands and extracting the scalable geometric hierarchy natively on the client.
- **`.sluggish` Binary Export**: Serializes the computed font curves and boundary bands into a highly optimized binary structure (`.sluggish`) for blazingly fast network delivery.
- **Three.js Instanced Rendering**: Leverages `InstancedBufferGeometry` and `RawShaderMaterial` to render thousands of dynamic text characters in a single GPU draw call with a 1MB memory footprint.
- **Dynamic Layout Engine**: Uses true font metrics (`advanceWidth`, Left Side Bearing) to perfectly kern and position paragraphs in responsive 3D world space.

## Usage

1. Serve the repository locally (e.g., `npx http-server`).
2. Open `demo/index.html`.
3. Use the UI to load a standard `.ttf` file. The Javascript generator will parse the curves, initialize the GPU textures, and immediately render a live, dynamic text physics mesh.
4. (Optional) Click **Download .sluggish** to cache the generated font data to a serialized binary for production use.

## Screenshots

*(User: Add a screenshot here!)*
![JSlug Rendering Demo](screenshot.png)

## Credits & Acknowledgements

*   **Eric Lengyel** for inventing the groundbreaking [Slug Algorithm](http://sluglibrary.com/).
*   **The Sluggish C++ Port** for providing the architectural reference for mapping Slug textures directly to generic WebGL buffer pipelines.
*   **[opentype.js](https://github.com/opentypejs/opentype.js)** for providing the native Javascript TrueType parsing core.
*   Ported to Javascript and Three.js by **[manthrax](https://github.com/manthrax)**.
