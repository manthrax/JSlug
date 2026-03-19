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

        const normals = new Float32Array([
            0.0, 0.0, 1.0,
            0.0, 0.0, 1.0,
            0.0, 0.0, 1.0,
            0.0, 0.0, 1.0
        ]);

        const indices = new Uint16Array([
            0, 2, 1,
            0, 3, 2
        ]);

        this.setIndex(new THREE.BufferAttribute(indices, 1));
        this.setAttribute('position', new THREE.BufferAttribute(vertices, 2));
        this.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

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
        
        this.boundingBox = new THREE.Box3();
        this.boundingSphere = new THREE.Sphere();
    }

    clear() {
        this.glyphCount = 0;
        this.instanceCount = 0;
        this.boundingBox.makeEmpty();
        this.boundingSphere.radius = 0;
    }

    computeBoundingSphere() {
        if (!this.boundingBox || this.boundingBox.isEmpty()) {
            this.boundingSphere.set(new THREE.Vector3(), 0);
        } else {
            this.boundingBox.getBoundingSphere(this.boundingSphere);
        }
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
        const cx = x + sx;
        const cy = y + sy;
        
        this.aScaleBias[i * 4 + 0] = sx;
        this.aScaleBias[i * 4 + 1] = sy;
        this.aScaleBias[i * 4 + 2] = cx;
        this.aScaleBias[i * 4 + 3] = cy;

        // Dynamically compute the exact bounding box of the packed structure for frustum culling and native Shadow Map projections
        this.boundingBox.expandByPoint(new THREE.Vector3(cx - sx, cy - sy, 0));
        this.boundingBox.expandByPoint(new THREE.Vector3(cx + sx, cy + sy, 0));

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

        // Automatically sync the bounding sphere to the aggressively tracked bounding box for native physics implementations
        this.computeBoundingSphere();
    }

    clear() {
        this.glyphCount = 0;
        this.instanceCount = 0;
        if (this.boundingBox) this.boundingBox.makeEmpty();
        if (this.boundingSphere) this.boundingSphere.radius = 0;
    }

    addText(text, slugData, options = {}) {
        const {
            fontScale = 0.5,
            lineHeight = 2000 * fontScale,
            startX = 0,
            startY = 0,
            justify = 'left' // 'left', 'center', 'right'
        } = options;

        const lines = text.split('\n');
        let currentY = startY;

        for (const line of lines) {
            let lineWidth = 0;
            
            // First pass: Measure exact physical width of the line for justification offsets
            let j = 0;
            while (j < line.length) {
                const charCode = line.codePointAt(j);
                j += charCode > 0xFFFF ? 2 : 1;
                let data = slugData.codePoints.get(charCode) || slugData.codePoints.get(-1);
                if (data) {
                    lineWidth += data.advanceWidth * fontScale;
                } else if (line[j-1] === ' ') {
                    lineWidth += 600 * fontScale; // Fallback space width
                }
            }

            let currentX = startX;
            if (justify === 'center') currentX -= lineWidth / 2.0;
            else if (justify === 'right') currentX -= lineWidth;

            // Second pass: Inject the geometric layout frames into the instanced buffers
            let k = 0;
            while (k < line.length) {
                const charCode = line.codePointAt(k);
                k += charCode > 0xFFFF ? 2 : 1;
                let data = slugData.codePoints.get(charCode) || slugData.codePoints.get(-1);

                if (data) {
                    if (data.width > 0 && data.height > 0) {
                        const quadW = data.width * fontScale;
                        const quadH = data.height * fontScale;
                        const px = currentX + data.bearingX * fontScale;
                        const py = currentY + data.bearingY * fontScale;
                        
                        this.addGlyph(data, px, py, quadW, quadH, 0, 0); // Display size dropped in PBR pass
                    }
                    currentX += data.advanceWidth * fontScale;
                } else if (line[k-1] === ' ') {
                    currentX += 600 * fontScale;
                }
            }
            currentY -= lineHeight;
        }

        this.updateBuffers();
    }
}
