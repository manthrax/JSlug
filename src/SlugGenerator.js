// SlugGenerator.js
// Port of the Sluggish C++ Generator using opentype.js
import * as THREE from 'three';

const TEXTURE_WIDTH = 4096;
const SLUGGISH_HEADER_DATA = "SLUGGISH";
const SLUGGISH_HEADER_LEN = 8;

export class SlugGenerator {
    constructor(parameters = {}) {
        this.bandCount = 16;
        this.fullRange = parameters.fullRange !== undefined ? parameters.fullRange : false;
        this.whitelist = parameters.whitelist || null; // Array of codepoints to include
    }

    async generateFromUrl(url) {
        const opentype = (await import('opentype.js')).default;
        const font = await opentype.load(url);
        return this.generate(font);
    }

    async generateFromFile(file) {
        const buffer = await file.arrayBuffer();
        return this.generateFromBuffer(buffer);
    }

    async generateFromBuffer(buffer) {
        const opentype = (await import('opentype.js')).default;
        const font = opentype.parse(buffer);
        return this.generate(font);
    }

    generate(font) {
        let ignoredCodePoints = 0;
        let curvesTexData = []; // Flat array of [x, y]
        let bandsTexBandOffsets = []; // 2 per band [curveCount, bandOffset]
        let bandsTexCurveOffsets = []; // 2 per curve [curveX, curveY]
        let codePointsData = [];
        
        for (let i = 0; i < font.glyphs.length; i++) {
            const glyph = font.glyphs.get(i);
            let cp = glyph.unicode;
            if (cp === undefined) {
                if (i === 0) cp = -1; // .notdef fallback glyph
                else continue;
            }

            // Optional range filtering to control .sluggish file bloat
            if (!this.fullRange && i !== 0) {
                if (this.whitelist) {
                    if (!this.whitelist.includes(cp)) continue;
                } else if (cp < 32 || cp > 126) {
                    continue; // Default to basic printable ASCII only
                }
            }
            const path = glyph.path; // ONLY use raw font-space unstretched paths to match getBoundingBox() perfectly!

            // Determine visible bounding box in font units
            const bbox = glyph.getBoundingBox();
            if (bbox.x1 === bbox.x2 || bbox.y1 === bbox.y2) {
                // Empty glyph (e.g. space) or missing - keep it to preserve advanceWidth!
                codePointsData.push({
                    codePoint: cp,
                    width: 0,
                    height: 0,
                    advanceWidth: Math.floor(glyph.advanceWidth || 0),
                    bearingX: 0,
                    bearingY: 0,
                    bandCount: 0,
                    bandDimX: 0,
                    bandDimY: 0,
                    bandsTexCoordX: 0,
                    bandsTexCoordY: 0
                });
                continue;
            }

            const gx1 = bbox.x1;
            const gy1 = bbox.y1;
            const gx2 = bbox.x2;
            const gy2 = bbox.y2;

            // 1. Build Temporary Curve List
            let curves = [];
            let currentX = 0, currentY = 0;
            let firstCurve = false;
            let startOfShapeX = 0, startOfShapeY = 0;

            for (let i = 0; i < path.commands.length; i++) {
                const cmd = path.commands[i];
                if (cmd.type === 'M') {
                    firstCurve = true;
                    currentX = cmd.x - gx1;
                    currentY = cmd.y - gy1;
                    startOfShapeX = currentX;
                    startOfShapeY = currentY;
                } else if (cmd.type === 'L') {
                    let nextX = cmd.x - gx1;
                    let nextY = cmd.y - gy1;
                    let c = {
                        first: firstCurve,
                        x1: currentX, y1: currentY,
                        x3: nextX, y3: nextY,
                        x2: (currentX + nextX) / 2.0,
                        y2: (currentY + nextY) / 2.0
                    };
                    curves.push(c);
                    firstCurve = false;
                    currentX = nextX;
                    currentY = nextY;
                } else if (cmd.type === 'Q') {
                    let nextX = cmd.x - gx1;
                    let nextY = cmd.y - gy1;
                    let c = {
                        first: firstCurve,
                        x1: currentX, y1: currentY,
                        x2: cmd.x1 - gx1, y2: cmd.y1 - gy1,
                        x3: nextX, y3: nextY
                    };
                    curves.push(c);
                    firstCurve = false;
                    currentX = nextX;
                    currentY = nextY;
                } else if (cmd.type === 'C') {
                    console.warn(`U+${cp.toString(16)} has bicubic curves. Slug requires quadratic.`);
                    ignoredCodePoints++;
                    curves = null; // Mark to skip
                    break;
                } else if (cmd.type === 'Z') {
                    if (currentX !== startOfShapeX || currentY !== startOfShapeY) {
                        let c = {
                            first: firstCurve,
                            x1: currentX, y1: currentY,
                            x3: startOfShapeX, y3: startOfShapeY,
                            x2: (currentX + startOfShapeX) / 2.0,
                            y2: (currentY + startOfShapeY) / 2.0
                        };
                        curves.push(c);
                        firstCurve = false;
                    }
                    currentX = startOfShapeX;
                    currentY = startOfShapeY;
                }
            }

            if (!curves || curves.length === 0) continue;

            // Fix up curves where the control point is one of the endpoints
            for (let c of curves) {
                if ((c.x2 === c.x1 && c.y2 === c.y1) || (c.x2 === c.x3 && c.y2 === c.y3)) {
                    c.x2 = (c.x1 + c.x3) / 2.0;
                    c.y2 = (c.y1 + c.y3) / 2.0;
                }
            }

            const bandsTexelIndex = Math.floor(bandsTexBandOffsets.length / 2);

            // 2. Write Curves Texture
            for (let c of curves) {
                // make sure we start a curve at a texel's boundary (4 values = 2 points = 1 texel RGBA)
                // wait, C++ code: g_curvesTexture.size() % 4
                // each push_back pushed 1 float. so 4 floats = 1 texel.
                // a curve is 3 points -> 6 floats.
                if (c.first && curvesTexData.length % 4 !== 0) {
                    const toAdd = 4 - (curvesTexData.length % 4);
                    for (let i = 0; i < toAdd; i++) curvesTexData.push(-1.0);
                }

                // make sure a curve doesn't cross a row boundary
                let texelCount = Math.floor(curvesTexData.length / 4);
                let col = texelCount % TEXTURE_WIDTH;
                const newRow = col === TEXTURE_WIDTH - 1;
                if (newRow) {
                    const toAdd = 8 - (curvesTexData.length % 4); // C++ used 8
                    for (let i = 0; i < toAdd; i++) curvesTexData.push(-1.0);
                }

                if (c.first || newRow) {
                    c.texelIndex = Math.floor(curvesTexData.length / 4);
                    curvesTexData.push(c.x1, c.y1);
                } else {
                    c.texelIndex = Math.floor((Math.floor(curvesTexData.length / 2) - 1) / 2);
                }

                curvesTexData.push(c.x2, c.y2);
                curvesTexData.push(c.x3, c.y3);
            }

            const sizeX = 1 + (gx2 - gx1);
            const sizeY = 1 + (gy2 - gy1);
            let bCount = this.bandCount; // Re-enable spatial banding optimizations!
            if (sizeX < bCount || sizeY < bCount) {
                bCount = Math.floor(Math.min(sizeX, sizeY) / 2);
                if(bCount < 1) bCount = 1;
            }

            const bandDimY = Math.ceil(sizeY / bCount);
            let bandMinY = 0;
            let bandMaxY = bandDimY;

            // Sort curves by highest Y (max of y1,y2,y3) ascending/descending?
            // C++: Max(a.x1, a.x2, a.x3) > Max(b.x1, b.x2, b.x3)  for H-bands, wait!
            // C++ for H-bands sorted by max X descending.
            curves.sort((a, b) => Math.max(b.x1, b.x2, b.x3) - Math.max(a.x1, a.x2, a.x3));

            for (let b = 0; b < bCount; b++) {
                let bandTexelOffset = Math.floor(bandsTexCurveOffsets.length / 2);
                let curveCount = 0;

                for (let c of curves) {
                    if (c.y1 === c.y2 && c.y2 === c.y3) continue; // perfectly horizontal
                    let curveMinY = Math.min(c.y1, c.y2, c.y3);
                    let curveMaxY = Math.max(c.y1, c.y2, c.y3);
                    if (curveMinY > bandMaxY || curveMaxY < bandMinY) continue; // doesn't cross band

                    let texelIndex = c.texelIndex;
                    let curveOffsetX = texelIndex % TEXTURE_WIDTH;
                    let curveOffsetY = Math.floor(texelIndex / TEXTURE_WIDTH);
                    bandsTexCurveOffsets.push(curveOffsetX, curveOffsetY);
                    curveCount++;
                }
                bandsTexBandOffsets.push(curveCount, bandTexelOffset);
                bandMinY += bandDimY;
                bandMaxY += bandDimY;
            }

            // For vertical bands, sort by max Y descending
            const bandDimX = Math.ceil(sizeX / bCount);
            let bandMinX = 0;
            let bandMaxX = bandDimX;

            curves.sort((a, b) => Math.max(b.y1, b.y2, b.y3) - Math.max(a.y1, a.y2, a.y3));

            for (let b = 0; b < bCount; b++) {
                let bandTexelOffset = Math.floor(bandsTexCurveOffsets.length / 2);
                let curveCount = 0;

                for (let c of curves) {
                    if (c.x1 === c.x2 && c.x2 === c.x3) continue; // perfectly vertical
                    let curveMinX = Math.min(c.x1, c.x2, c.x3);
                    let curveMaxX = Math.max(c.x1, c.x2, c.x3);
                    if (curveMinX > bandMaxX || curveMaxX < bandMinX) continue; // doesn't cross band

                    let texelIndex = c.texelIndex;
                    let curveOffsetX = texelIndex % TEXTURE_WIDTH;
                    let curveOffsetY = Math.floor(texelIndex / TEXTURE_WIDTH);
                    bandsTexCurveOffsets.push(curveOffsetX, curveOffsetY);
                    curveCount++;
                }
                bandsTexBandOffsets.push(curveCount, bandTexelOffset);
                bandMinX += bandDimX;
                bandMaxX += bandDimX;
            }

            codePointsData.push({
                codePoint: cp,
                width: Math.floor(gx2 - gx1),
                height: Math.floor(gy2 - gy1),
                advanceWidth: Math.floor(glyph.advanceWidth || 0),
                bearingX: Math.floor(gx1),
                bearingY: Math.floor(gy1),
                bandCount: bCount,
                bandDimX: bandDimX,
                bandDimY: bandDimY,
                bandsTexCoordX: bandsTexelIndex % TEXTURE_WIDTH,
                bandsTexCoordY: Math.floor(bandsTexelIndex / TEXTURE_WIDTH)
            });
        }

        // Post-processing
        const bandHeaderTexels = Math.floor(bandsTexBandOffsets.length / 2);
        for (let i = 1; i < bandsTexBandOffsets.length; i += 2) {
            bandsTexBandOffsets[i] += bandHeaderTexels;
        }

        return this.buildOutput(codePointsData, curvesTexData, bandsTexBandOffsets, bandsTexCurveOffsets, font);
    }

    buildOutput(codePoints, curvesList, bandOffsets, curveOffsets, font) {
        // Build DataTextures and codePoint Map
        const map = new Map();
        codePoints.forEach(cp => map.set(cp.codePoint, cp));

        const curvesTexels = Math.ceil(curvesList.length / 4);
        const curvesTexHeight = Math.ceil(curvesTexels / TEXTURE_WIDTH);
        
        let curvesFloatArray = new Float32Array(TEXTURE_WIDTH * curvesTexHeight * 4);
        curvesFloatArray.fill(-1.0);
        curvesFloatArray.set(curvesList);

        const curvesTex = new THREE.DataTexture(curvesFloatArray, TEXTURE_WIDTH, curvesTexHeight, THREE.RGBAFormat, THREE.FloatType);
        curvesTex.internalFormat = 'RGBA32F';
        curvesTex.minFilter = THREE.NearestFilter;
        curvesTex.magFilter = THREE.NearestFilter;
        curvesTex.needsUpdate = true;

        const bandsTexels = Math.floor(bandOffsets.length / 2) + Math.floor(curveOffsets.length / 2);
        const bandsTexHeight = Math.ceil(bandsTexels / TEXTURE_WIDTH);
        
        let bandsUintArray = new Uint32Array(TEXTURE_WIDTH * bandsTexHeight * 2);
        bandsUintArray.set(bandOffsets, 0);
        bandsUintArray.set(curveOffsets, bandOffsets.length);

        const bandsTex = new THREE.DataTexture(bandsUintArray, TEXTURE_WIDTH, bandsTexHeight, THREE.RGIntegerFormat, THREE.UnsignedIntType);
        bandsTex.internalFormat = 'RG32UI';
        bandsTex.minFilter = THREE.NearestFilter;
        bandsTex.magFilter = THREE.NearestFilter;
        bandsTex.needsUpdate = true;

        // Also return the raw arrays for export
        return {
            codePoints: map,
            curvesTex: curvesTex,
            bandsTex: bandsTex,
            ascender: font.ascender || 0,
            descender: font.descender || 0,
            lineGap: font.lineGap || 0,
            unitsPerEm: font.unitsPerEm || 0,
            _raw: { codePoints, curvesList, bandOffsets, curveOffsets, metrics: {
                ascender: font.ascender || 0,
                descender: font.descender || 0,
                lineGap: font.lineGap || 0,
                unitsPerEm: font.unitsPerEm || 0
            } }
        };
    }

    exportSluggish(generatedData) {
        // Binary pack into ArrayBuffer
        const { codePoints, curvesList, bandOffsets, curveOffsets } = generatedData._raw;

        const curvesTexels = Math.ceil(curvesList.length / 4);
        const curvesTexHeight = Math.ceil(curvesTexels / TEXTURE_WIDTH);
        const curvesFloatArray = new Float32Array(TEXTURE_WIDTH * curvesTexHeight * 4);
        curvesFloatArray.fill(0); // Optional, filling with 0 or -1. Let's use 0 to match normal behavior
        curvesFloatArray.set(curvesList);

        const bandsTexels = Math.floor(bandOffsets.length / 2) + Math.floor(curveOffsets.length / 2);
        const bandsTexHeight = Math.ceil(bandsTexels / TEXTURE_WIDTH);
        const bandsUintArray = new Uint32Array(TEXTURE_WIDTH * bandsTexHeight * 2);
        bandsUintArray.set(bandOffsets, 0);
        bandsUintArray.set(curveOffsets, bandOffsets.length);

        // Calculate total size
        // Header: 8 bytes
        // CP Count: 2 bytes
        // CPs: 28 bytes * N
        // Curves: Width(2) + Height(2) + Bytes(4) = 8 bytes + CurvesBytes
        // Bands: Width(2) + Height(2) + Bytes(4) = 8 bytes + BandsBytes
        // Calculate total size: 40 bytes per code point
        const curvesBytes = curvesFloatArray.byteLength;
        const bandsBytes = bandsUintArray.byteLength;
        const metrics = generatedData._raw.metrics || { ascender: 0, descender: 0, lineGap: 0, unitsPerEm: 0 };

        const totalBytes = 8 + 2 + (codePoints.length * 40) + 8 + curvesBytes + 8 + bandsBytes + 16;
        const buffer = new ArrayBuffer(totalBytes);
        const view = new DataView(buffer);
        let offset = 0;

        for (let i = 0; i < 8; i++) {
            view.setUint8(offset++, SLUGGISH_HEADER_DATA.charCodeAt(i));
        }

        view.setUint16(offset, codePoints.length, true); offset += 2;

        for (let cp of codePoints) {
            view.setUint32(offset, cp.codePoint, true); offset += 4;
            view.setUint32(offset, cp.width, true); offset += 4;
            view.setUint32(offset, cp.height, true); offset += 4;
            view.setUint32(offset, cp.advanceWidth, true); offset += 4;
            view.setInt32(offset, cp.bearingX, true); offset += 4; // Signed
            view.setInt32(offset, cp.bearingY, true); offset += 4; // Signed
            view.setUint32(offset, cp.bandCount, true); offset += 4;
            view.setUint32(offset, cp.bandDimX, true); offset += 4;
            view.setUint32(offset, cp.bandDimY, true); offset += 4;
            view.setUint16(offset, cp.bandsTexCoordX, true); offset += 2;
            view.setUint16(offset, cp.bandsTexCoordY, true); offset += 2;
        }

        view.setUint16(offset, TEXTURE_WIDTH, true); offset += 2;
        view.setUint16(offset, curvesTexHeight, true); offset += 2;
        view.setUint32(offset, curvesBytes, true); offset += 4;
        new Uint8Array(buffer).set(new Uint8Array(curvesFloatArray.buffer), offset);
        offset += curvesBytes;

        view.setUint16(offset, TEXTURE_WIDTH, true); offset += 2;
        view.setUint16(offset, bandsTexHeight, true); offset += 2;
        view.setUint32(offset, bandsBytes, true); offset += 4;
        new Uint8Array(buffer).set(new Uint8Array(bandsUintArray.buffer), offset);
        offset += bandsBytes;

        // Footer Metadata Table (Backward compatible fallback)
        view.setInt32(offset, metrics.ascender || 0, true); offset += 4;
        view.setInt32(offset, metrics.descender || 0, true); offset += 4;
        view.setInt32(offset, metrics.lineGap || 0, true); offset += 4;
        view.setInt32(offset, metrics.unitsPerEm || 0, true); offset += 4;

        return buffer;
    }
}
