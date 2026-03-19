import * as THREE from 'three';

const SLUGGISH_HEADER_DATA = "SLUGGISH";
const TEXTURE_WIDTH = 4096;

export class SlugLoader {
    constructor(manager) {
        this.manager = manager !== undefined ? manager : THREE.DefaultLoadingManager;
    }

    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader(this.manager);
        loader.setResponseType('arraybuffer');
        loader.load(url, (buffer) => {
            try {
                onLoad(this.parse(buffer));
            } catch (e) {
                if (onError) {
                    onError(e);
                } else {
                    console.error(e);
                }
            }
        }, onProgress, onError);
    }

    parse(buffer) {
        const dataView = new DataView(buffer);
        let offset = 0;

        // Verify Header Validate
        const headerBytes = new Uint8Array(buffer, offset, 8);
        const headerStr = String.fromCharCode.apply(null, headerBytes);
        if (headerStr !== SLUGGISH_HEADER_DATA) {
            throw new Error(`Invalid header found (${headerStr} instead of ${SLUGGISH_HEADER_DATA})`);
        }
        offset += 8;

        const codePointCount = dataView.getUint16(offset, true);
        offset += 2;

        const codePoints = new Map();
        for (let i = 0; i < codePointCount; i++) {
            const cp = {
                codePoint: dataView.getUint32(offset, true),
                width: dataView.getUint32(offset + 4, true),
                height: dataView.getUint32(offset + 8, true),
                bandCount: dataView.getUint32(offset + 12, true),
                bandDimX: dataView.getUint32(offset + 16, true),
                bandDimY: dataView.getUint32(offset + 20, true),
                bandsTexCoordX: dataView.getUint16(offset + 24, true),
                bandsTexCoordY: dataView.getUint16(offset + 26, true),
            };
            codePoints.set(cp.codePoint, cp);
            offset += 28; // sizeof(SluggishCodePoint) with 1-byte packing in C++
        }

        const curvesTexWidth = dataView.getUint16(offset, true); offset += 2;
        const curvesTexHeight = dataView.getUint16(offset, true); offset += 2;
        const curvesTexBytes = dataView.getUint32(offset, true); offset += 4;

        if (curvesTexWidth === 0 || curvesTexHeight === 0 || curvesTexBytes === 0 || curvesTexWidth !== TEXTURE_WIDTH) {
            throw new Error("Invalid curves texture dimensions");
        }

        const curvesTexels = curvesTexWidth * curvesTexHeight;
        const curvesData = new Float32Array(curvesTexels * 4); // RGBA32F
        const curvesBuffer = buffer.slice(offset, offset + curvesTexBytes);
        const incomingCurvesData = new Float32Array(curvesBuffer);
        curvesData.set(incomingCurvesData);
        // Fill remaining with -1/-1/-1/-1 padding as expected by shader sometimes? Wait, C++ memsets to 0xCD.
        offset += curvesTexBytes;

        const bandsTexWidth = dataView.getUint16(offset, true); offset += 2;
        const bandsTexHeight = dataView.getUint16(offset, true); offset += 2;
        const bandsTexBytes = dataView.getUint32(offset, true); offset += 4;

        if (bandsTexWidth === 0 || bandsTexHeight === 0 || bandsTexBytes === 0 || bandsTexWidth !== TEXTURE_WIDTH) {
            throw new Error("Invalid bands texture dimensions");
        }

        const bandsTexels = bandsTexWidth * bandsTexHeight;
        const bandsData = new Uint16Array(bandsTexels * 2); // RG16UI
        const bandsBuffer = buffer.slice(offset, offset + bandsTexBytes);
        const incomingBandsData = new Uint16Array(bandsBuffer);
        bandsData.set(incomingBandsData);
        offset += bandsTexBytes;

        const curvesTex = new THREE.DataTexture(curvesData, curvesTexWidth, curvesTexHeight, THREE.RGBAFormat, THREE.FloatType);
        curvesTex.internalFormat = 'RGBA32F';
        curvesTex.minFilter = THREE.NearestFilter;
        curvesTex.magFilter = THREE.NearestFilter;
        curvesTex.needsUpdate = true;

        const bandsTex = new THREE.DataTexture(bandsData, bandsTexWidth, bandsTexHeight, THREE.RGIntegerFormat, THREE.UnsignedShortType);
        bandsTex.internalFormat = 'RG16UI';
        bandsTex.minFilter = THREE.NearestFilter;
        bandsTex.magFilter = THREE.NearestFilter;
        bandsTex.needsUpdate = true;

        return {
            codePoints: codePoints,
            curvesTex: curvesTex,
            bandsTex: bandsTex
        };
    }
}
