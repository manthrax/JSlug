# JSlug: Three.js Font Rendering Pipeline

JSlug is a Javascript and WebGL port of Eric Lengyel's **Slug** font rendering algorithm, implemented for **Three.js**.

Unlike traditional MSDF (Multi-Channel Signed Distance Field) font rendering which can suffer from corner rounding and texture resolution limits, the Slug algorithm evaluates the quadratic bezier curves of the TrueType font directly within the fragment shader. This enables resolution-independent font rendering, sharp corners, and precise anti-aliasing.

## Features

- **On-the-Fly Generation**: Parses `.ttf` and `.otf` fonts directly in the browser via `opentype.js`, computing boundary bands and extracting vector geometry on the client.
- **`.sluggish` Binary Export**: Serializes the computed font curves and boundary bands into a binary structure (`.sluggish`) for network delivery.
- **Three.js Instanced Rendering**: Leverages `InstancedBufferGeometry` and `RawShaderMaterial` to render text characters in a single GPU draw call.
- **Dynamic Layout Engine**: Uses true font metrics (`advanceWidth`, Left Side Bearing) to kern and position multi-line paragraphs in 3D world space.

## Usage

1. Serve the repository locally (e.g., `npx http-server`).
2. Open `demo/index.html`.
3. Use the UI to load a standard `.ttf` file. The Javascript generator will parse the curves, initialize the GPU textures, and render the text mesh.
4. (Optional) Click **Download .sluggish** to cache the generated font data to a serialized binary.

## Screenshots

![JSlug Rendering Demo](screenshot.png)

## Credits & Acknowledgements

*   **Eric Lengyel** for inventing the groundbreaking [Slug Algorithm](http://sluglibrary.com/).
*   **The Sluggish C++ Port** for providing the architectural reference for mapping Slug textures directly to generic WebGL buffer pipelines.
*   **[opentype.js](https://github.com/opentypejs/opentype.js)** for providing the native Javascript TrueType parsing core.
*   Ported to Javascript and Three.js by **[manthrax](https://github.com/manthrax)**.
