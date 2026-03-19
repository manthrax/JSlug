import * as THREE from 'three';

export class SlugGeometry extends THREE.InstancedBufferGeometry {
    constructor(maxGlyphs = 1024) {
        super();

        // 1. Base Quad Geometry (0 to 1, or -1 to 1 based on shader assumptions)
        // Shader expects position * scaleBias.xy + scaleBias.zw.
        // In the C++ code, they use vertices from -1 to 1:
        // -1, -1  |  -1, 1  |  1, 1  |  1, -1
        const vertices = new Float32Array([
            -1.0, -1.0,
            -1.0,  1.0,
             1.0,  1.0,
             1.0, -1.0
        ]);

        const uvs = new Float32Array([
            0.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
            1.0, 0.0
        ]);

        const indices = new Uint16Array([
            0, 1, 2,
            0, 2, 3
        ]);

        this.setIndex(new THREE.BufferAttribute(indices, 1));
        this.setAttribute('position', new THREE.BufferAttribute(vertices, 2));
        this.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        // 2. Instanced Attributes
        this.maxGlyphs = maxGlyphs;
        this.glyphCount = 0;

        this.aScaleBias = new Float32Array(maxGlyphs * 4);
        this.aGlyphBandScale = new Float32Array(maxGlyphs * 4);
        this.aBandMaxTexCoords = new Float32Array(maxGlyphs * 4);

        const attrScaleBias = new THREE.InstancedBufferAttribute(this.aScaleBias, 4);
        attrScaleBias.setUsage(THREE.DynamicDrawUsage);
        this.setAttribute('aScaleBias', attrScaleBias);

        const attrGlyphBandScale = new THREE.InstancedBufferAttribute(this.aGlyphBandScale, 4);
        attrGlyphBandScale.setUsage(THREE.DynamicDrawUsage);
        this.setAttribute('aGlyphBandScale', attrGlyphBandScale);

        // WebGL2 requires InterleavedBuffer or Int32/Uint32 for int attributes in shader (uvec4)
        const attrBandMaxTexCoords = new THREE.InstancedBufferAttribute(this.aBandMaxTexCoords, 4);
        attrBandMaxTexCoords.setUsage(THREE.DynamicDrawUsage);
        this.setAttribute('aBandMaxTexCoords', attrBandMaxTexCoords);

        this.instanceCount = 0;
        
        // Prevent computeBoundingSphere from returning NaN due to 2D positions
        this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
        this.boundingBox = new THREE.Box3(new THREE.Vector3(-Infinity, -Infinity, -Infinity), new THREE.Vector3(Infinity, Infinity, Infinity));
    }

    computeBoundingSphere() {
        this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    }

    addGlyph(codePointData, x, y, width, height, displayWidth, displayHeight) {

        // Based on C++ GL_RenderGlyph
        if (this.glyphCount >= this.maxGlyphs) {
            console.warn("Max glyphs reached");
            return false;
        }

        const i = this.glyphCount;
        
        // Quads go from -1 to 1. Multiply by half width/height to get correct size.
        // Bias translates the center position.
        const sx = width / 2.0;
        const sy = height / 2.0;
        this.aScaleBias[i * 4 + 0] = sx;
        this.aScaleBias[i * 4 + 1] = sy;
        this.aScaleBias[i * 4 + 2] = x + sx;
        this.aScaleBias[i * 4 + 3] = y + sy;

        // Glyph and Band Scale

        this.aGlyphBandScale[i * 4 + 0] = codePointData.width;
        this.aGlyphBandScale[i * 4 + 1] = codePointData.height;
        this.aGlyphBandScale[i * 4 + 2] = codePointData.width / codePointData.bandDimX;
        this.aGlyphBandScale[i * 4 + 3] = codePointData.height / codePointData.bandDimY;

        // Band Max Tex Coords (Uint32)
        this.aBandMaxTexCoords[i * 4 + 0] = codePointData.bandCount - 1;
        this.aBandMaxTexCoords[i * 4 + 1] = codePointData.bandCount - 1;
        this.aBandMaxTexCoords[i * 4 + 2] = codePointData.bandsTexCoordX;
        this.aBandMaxTexCoords[i * 4 + 3] = codePointData.bandsTexCoordY;

        this.glyphCount++;
        this.instanceCount = this.glyphCount;

        return true;
    }

    updateBuffers() {
        this.attributes.aScaleBias.needsUpdate = true;
        this.attributes.aGlyphBandScale.needsUpdate = true;
        this.attributes.aBandMaxTexCoords.needsUpdate = true;
    }

    clear() {
        this.glyphCount = 0;
        this.instanceCount = 0;
    }
}
