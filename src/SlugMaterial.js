import * as THREE from 'three';

const slug_pars_fragment = `
precision highp int;
precision highp usampler2D;

in vec2 vTexCoords;
flat in vec4 vGlyphBandScale;
flat in uvec4 vBandMaxTexCoords;

uniform sampler2D curvesTex;
uniform usampler2D bandsTex;

const float epsilon = 0.0001;

#define glyphScale     vGlyphBandScale.xy
#define bandScale      vGlyphBandScale.zw
#define bandMax        vBandMaxTexCoords.xy
#define bandsTexCoords vBandMaxTexCoords.zw

float TraceRayCurveH(vec2 p1, vec2 p2, vec2 p3, float pixelsPerEm)
{
    if(max(max(p1.x, p2.x), p3.x) * pixelsPerEm < -0.5)
    {
        return 0.0;
    }

    uint code = (0x2E74U >> (((p1.y > 0.0) ? 2U : 0U) + ((p2.y > 0.0) ? 4U : 0U) + ((p3.y > 0.0) ? 8U : 0U))) & 3U;
    if(code == 0U)
    {
        return 0.0;
    }

    vec2 a = p1 - p2 * 2.0 + p3;
    vec2 b = p1 - p2;
    float c = p1.y;
    float ayr = 1.0 / a.y;
    float d = sqrt(max(b.y * b.y - a.y * c, 0.0));
    float t1 = (b.y - d) * ayr;
    float t2 = (b.y + d) * ayr;

    if(abs(a.y) < epsilon)
    {
        t1 = t2 = c / (2.0 * b.y);
    }

    float coverage = 0.0;

    if((code & 1U) != 0U)
    {
        float x1 = (a.x * t1 - b.x * 2.0) * t1 + p1.x;
        float cov_c = clamp(x1 * pixelsPerEm + 0.5, 0.0, 1.0);
        coverage += cov_c;
    }

    if(code > 1U)
    {
        float x2 = (a.x * t2 - b.x * 2.0) * t2 + p1.x;
        float cov_c = clamp(x2 * pixelsPerEm + 0.5, 0.0, 1.0);
        coverage -= cov_c;
    }

    return coverage;
}

float TraceRayBandH(uvec2 bandData, float pixelsPerEm)
{
    float coverage = 0.0;
    for(uint curve = 0U; curve < bandData.x; ++curve)
    {
        uint curveOffset = bandData.y + curve;
        ivec2 curveLoc = ivec2(texelFetch(bandsTex, ivec2(curveOffset & 0xFFFU, curveOffset >> 12U), 0).xy);
        vec4 p12 = texelFetch(curvesTex, curveLoc, 0) / vec4(glyphScale, glyphScale) - vec4(vTexCoords, vTexCoords);
        vec2 p3 = texelFetch(curvesTex, ivec2(curveLoc.x + 1, curveLoc.y), 0).xy / glyphScale - vTexCoords;
        coverage += TraceRayCurveH(p12.xy, p12.zw, p3.xy, pixelsPerEm);
    }
    return coverage;
}

float TraceRayBandV(uvec2 bandData, float pixelsPerEm)
{
    float coverage = 0.0;
    for(uint curve = 0U; curve < bandData.x; ++curve)
    {
        uint curveOffset = bandData.y + curve;
        ivec2 curveLoc = ivec2(texelFetch(bandsTex, ivec2(curveOffset & 0xFFFU, curveOffset >> 12U), 0).xy);
        vec4 p12 = texelFetch(curvesTex, curveLoc, 0) / vec4(glyphScale, glyphScale) - vec4(vTexCoords, vTexCoords);
        vec2 p3 = texelFetch(curvesTex, ivec2(curveLoc.x + 1, curveLoc.y), 0).xy / glyphScale - vTexCoords;
        coverage += TraceRayCurveH(p12.yx, p12.wz, p3.yx, pixelsPerEm);
    }
    return coverage;
}
`;

const slug_fragment_core = `
    vec2 fdx = dFdx(vTexCoords);
    vec2 fdy = dFdy(vTexCoords);
    // Modern WebGL GPUs legally return 0.0 for fragment derivatives inside colorless Depth-Only passes!
    // A strict mechanical floor guarantees we never divide-by-zero -> Infinity.
    vec2 fw = max(max(abs(fdx), abs(fdy)), vec2(0.000001));
    vec2 pixelsPerEm = vec2(1.0 / fw.x, 1.0 / fw.y);

    // Shadow cameras evaluate text at a sub-pixel size and the algorithm aggressively culls it into alpha 0.0.
    // Clamping to a high resolution floor forces solid strokes when drawn locally into a shadow mapping buffer!
    pixelsPerEm = clamp(pixelsPerEm, vec2(1.0), vec2(200.0));

    uvec2 bandIndex = uvec2(clamp(uvec2(vTexCoords * bandScale), uvec2(0U, 0U), bandMax));

    uint hBandOffset = bandsTexCoords.y * 4096U + bandsTexCoords.x + bandIndex.y;
    uvec2 hBandData = texelFetch(bandsTex, ivec2(hBandOffset & 0xFFFU, hBandOffset >> 12U), 0).xy;

    uint vBandOffset = bandsTexCoords.y * 4096U + bandsTexCoords.x + bandMax.y + 1U + bandIndex.x;
    uvec2 vBandData = texelFetch(bandsTex, ivec2(vBandOffset & 0xFFFU, vBandOffset >> 12U), 0).xy;

    float coverageX = TraceRayBandH(hBandData, pixelsPerEm.x);
    float coverageY = TraceRayBandV(vBandData, pixelsPerEm.y);

    coverageX = min(abs(coverageX), 1.0);
    coverageY = min(abs(coverageY), 1.0);
    float slugAlpha = (coverageX + coverageY) * 0.5;
`;

const slug_fragment_standard = slug_fragment_core + `
    diffuseColor.a *= slugAlpha;
    if ( diffuseColor.a < 0.0001 ) discard;
`;

const slug_pars_vertex = `
in vec4 aScaleBias;
in vec4 aGlyphBandScale;
in vec4 aBandMaxTexCoords;

out vec2 vTexCoords;
flat out vec4 vGlyphBandScale;
flat out uvec4 vBandMaxTexCoords;
`;

const slug_vertex = `
    vec3 transformed = vec3( position.xy * aScaleBias.xy + aScaleBias.zw, 0.0 );
    vTexCoords = position.xy * 0.5 + 0.5;

    #ifdef SLUG_MODELSPACE_UV
    vUv = transformed.xy;
    #endif

    vGlyphBandScale = aGlyphBandScale;
    vBandMaxTexCoords = uvec4(aBandMaxTexCoords);
`;

export function injectSlug(target, ...args) {
    if (target && target.isMesh) {
        const mesh = target;
        const material = args[0];
        const slugData = args[1];

        mesh.material = material;
        injectSlug(material, slugData);

        if (material.isRawShaderMaterial) return;

        if (!slugData._depthMaterial) {
            slugData._depthMaterial = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
            injectSlug(slugData._depthMaterial, slugData);
        }
        
        if (!slugData._distanceMaterial) {
            slugData._distanceMaterial = new THREE.MeshDistanceMaterial({ side: THREE.DoubleSide });
            injectSlug(slugData._distanceMaterial, slugData);
        }

        mesh.customDepthMaterial = slugData._depthMaterial;
        mesh.customDistanceMaterial = slugData._distanceMaterial;
        return;
    }

    // Material fallback mode
    const material = target;
    const slugData = args[0];

    if (material.userData && material.userData.slugInjected) return; // Prevent redundant native macro splicing
    
    material.transparent = true;
    material.alphaTest = 0.01;  

    material.onBeforeCompile = (shader) => {
        shader.uniforms.curvesTex = { value: slugData.curvesTex };
        shader.uniforms.bandsTex = { value: slugData.bandsTex };

        shader.vertexShader = shader.vertexShader.replace(
            '#include <clipping_planes_pars_vertex>',
            '#include <clipping_planes_pars_vertex>\n' + slug_pars_vertex
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            slug_vertex
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_pars_fragment>',
            '#include <clipping_planes_pars_fragment>\n' + slug_pars_fragment
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <alphatest_fragment>',
            slug_fragment_standard + '\n#include <alphatest_fragment>'
        );
    };

    // Also attach to userData so we can clone easily or reference
    material.userData.slugData = slugData;
    material.userData.slugInjected = true;
}

const SLUG_RAW_PIXEL_SHADER = `
precision highp float;
${slug_pars_fragment}

out vec4 fragColor;

void main() {
${slug_fragment_core}
    fragColor = vec4(1.0, 0.8, 0.0, slugAlpha); // Solid yellow fallback text
}
`;

const SLUG_RAW_VERTEX_SHADER = `
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
in vec2 position;
${slug_pars_vertex}
void main() {
${slug_vertex}
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

export class SlugMaterial extends THREE.RawShaderMaterial {
    constructor(parameters = {}) {
        super({
            vertexShader: SLUG_RAW_VERTEX_SHADER,
            fragmentShader: SLUG_RAW_PIXEL_SHADER,
            uniforms: {
                curvesTex: { value: null },
                bandsTex: { value: null }
            },
            transparent: true,
            blending: THREE.NormalBlending,
            //depthTest: false,
            //depthWrite: false,
            side: THREE.DoubleSide,
            glslVersion: THREE.GLSL3 // We need WebGL2 / GLSL3 for texelFetch, usampler2D, flat in uvec4
        });

        if (parameters.curvesTex) this.uniforms.curvesTex.value = parameters.curvesTex;
        if (parameters.bandsTex) this.uniforms.bandsTex.value = parameters.bandsTex;
    }
}

