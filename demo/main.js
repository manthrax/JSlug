
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SlugLoader } from '../src/SlugLoader.js';
import { SlugMaterial, injectSlug } from '../src/SlugMaterial.js';
import { SlugGeometry } from '../src/SlugGeometry.js';
import { SlugGenerator } from '../src/SlugGenerator.js';

// Only handles some generic unicode:
// 漢字 ॐ ♞ ♠ ♡ ♢ ♣ ☻ ☼ 🎵 🚀 (Demonstrating generic Unicode vectors)
// ✌️🌴🐢🐐🍄⚽🍻👑📸😬👀🚨🏡🕊️🏆😻🌟🧿🍀🎨🍜


let camera, scene, renderer;
let controls;
let slugMesh;
let spotLight;
let pointLight;
let debugCube;
let loadedData = null;
let loadedFileName = 'font';

init();
animate();

function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1.0); // Pure black background
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Swap to Perspective camera to fly around
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(307, -500, 400);

    scene = new THREE.Scene();

    const ambientLight = new THREE.AmbientLight(0x404040, 0.2); // Very low ambient to keep shadows dark
    scene.add(ambientLight);

    // Extreme intensity for high contrast, positioned head-on to cast perfectly square shadows onto the backend plane
    spotLight = new THREE.SpotLight(0xffffff, 5000000.0);
    spotLight.position.set(0, 0, 800);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.5;
    spotLight.decay = 2.0;
    spotLight.distance = 3000;
    spotLight.castShadow = true;
    spotLight.shadow.bias = -0.0001; // Tiny absolute depth offset to kill shadow acne
    spotLight.shadow.normalBias = 0.05; // Slightly push the intersection along the normal
    spotLight.shadow.mapSize.width = 2048;
    spotLight.shadow.mapSize.height = 2048;
    spotLight.shadow.camera.near = 10;
    spotLight.shadow.camera.far = 2000;
    scene.add(spotLight);

    // Explicitly add target so Three.js auto-updates its matrices
    spotLight.target.position.set(0, 0, -100);
    scene.add(spotLight.target);

    const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.z = -10; // Moved explicitly further back so depth bounds are 100% unambiguous in shadow map
    plane.receiveShadow = true;
    scene.add(plane);

    // Floating Debug Cube to cast shadows on text
    const cubeGeo = new THREE.BoxGeometry(20, 20, 20);
    const cubeMat = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.1 });
    debugCube = new THREE.Mesh(cubeGeo, cubeMat);
    debugCube.position.set(0, 0, 50);
    debugCube.castShadow = true;
    scene.add(debugCube);

    // Small blue point light that orbits the debug cube
    pointLight = new THREE.PointLight(0x00aaff, 200000.0, 2500); // Increased intensity + reach radius
    const bulbGeo = new THREE.SphereGeometry(10, 16, 8); // Larger visible sphere
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
    pointLight.add(new THREE.Mesh(bulbGeo, bulbMat));
    pointLight.castShadow = true;
    pointLight.shadow.bias = -0.0001;
    scene.add(pointLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(207, 0, 0);
    window.addEventListener('resize', onWindowResize);

    document.getElementById('fileSluggish').addEventListener('change', handleSluggishUpload);
    document.getElementById('fileTtf').addEventListener('change', handleTtfUpload);
    document.getElementById('btnDownload').addEventListener('click', handleDownload);
    document.getElementById('textInput').addEventListener('input', () => {
        if (loadedData) createTextMesh();
    });

    document.getElementById('fontSelect').addEventListener('change', (e) => {
        loadFont(e.target.value);
    });

    document.getElementById('textInput').addEventListener('input', () => {
        if (loadedData) createTextMesh();
    });

    document.getElementById('useRawShader').addEventListener('change', () => {
        if (loadedData) createTextMesh();
    });

    // Prepopulate textarea with our own source code to demonstrate large paragraphs
    fetch('./main.js')
        .then(response => response.text())
        .then(text => {
            const textArea = document.getElementById('textInput');
            textArea.value = text; // 1x copies
            if (loadedData) createTextMesh();
        })
        .catch(err => console.error("Could not load main.js for textarea", err));

    // Dynamically populate font select from index
    const select = document.getElementById('fontSelect');
    fetch('./fonts/fonts.json')
        .then(r => r.json())
        .then(fonts => {
            fonts.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f;
                opt.innerText = f.replace(/\.[^/.]+$/, "");
                select.appendChild(opt);
            });
            if (select.children.length > 0) {
                loadFont(select.value);
            } else {
                loadFont('DejaVuSansMono.ttf');
            }
        })
        .catch(err => {
            console.error("Could not load fonts.json list:", err);
            loadFont('DejaVuSansMono.ttf'); // Fallback
        });
}

async function loadFont(fontName) {
    try {
        console.log(`Loading font: ${fontName}...`);
        const response = await fetch(`./fonts/${fontName}`);
        const buffer = await response.arrayBuffer();
        const generator = new SlugGenerator();
        loadedData = await generator.generateFromBuffer(buffer);
        loadedFileName = fontName.replace(/\.[^/.]+$/, "");
        console.log(`Loaded font data for ${fontName}:`, loadedData);
        createTextMesh();
    } catch (err) {
        console.error(`Failed to load font ${fontName}`, err);
    }
}

function handleSluggishUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const buffer = e.target.result;
        try {
            const loader = new SlugLoader();
            loadedData = loader.parse(buffer);
            console.log("Loaded Sluggish Data:", loadedData);
            createTextMesh();
        } catch (err) {
            console.error(err);
            alert("Error parsing sluggish file: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function handleTtfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    loadedFileName = file.name.replace(/\.[^/.]+$/, "");

    try {
        console.log("Generating slug data from TTF...");
        const generator = new SlugGenerator();
        loadedData = await generator.generateFromFile(file);
        console.log("Generated Data:", loadedData);
        createTextMesh();
    } catch (err) {
        console.error(err);
        alert("Error generating sluggish data: " + err.message);
    }
}

function handleDownload() {
    if (!loadedData || !loadedData._raw) {
        alert("No generated TTF data to download. Please load a .ttf file first.");
        return;
    }
    const generator = new SlugGenerator();
    const buffer = generator.exportSluggish(loadedData);

    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = loadedFileName + ".sluggish";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function createTextMesh() {
    if (!loadedData) return;

    if (slugMesh) {
        scene.remove(slugMesh);
        slugMesh.geometry.dispose();
        slugMesh.material.dispose();
    }

    const useRawFallback = document.getElementById('useRawShader').checked;
    let material, depthMaterial, distanceMaterial;

    if (useRawFallback) {
        material = new SlugMaterial({
            curvesTex: loadedData.curvesTex,
            bandsTex: loadedData.bandsTex
        });
        // No custom shadow material for raw shader fallback
    } else {
        material = new THREE.MeshStandardMaterial({
            color: 0xffcc00,     // Golden yellow
            roughness: 1.0,      // Pure diffuse plastic surface to properly scatter un-angled SpotLight luminance
            metalness: 0.0,      // Removing metalness prevents the flat quads from reflecting the void into a dark mirror
            side: THREE.DoubleSide
        });
        injectSlug(material, loadedData);

        depthMaterial = new THREE.MeshDepthMaterial({
            side: THREE.DoubleSide
        });
        injectSlug(depthMaterial, loadedData);

        distanceMaterial = new THREE.MeshDistanceMaterial({
            side: THREE.DoubleSide
        });
        injectSlug(distanceMaterial, loadedData);
    }

    const textToRender = document.getElementById('textInput').value;

    // Dynamically size the geometry capacity to exactly the number of characters
    // Add a minimum of 1 to avoid Three.js throwing empty buffer errors
    const geometry = new SlugGeometry(Math.max(1, textToRender.length));

    geometry.clear();

    geometry.addText(textToRender, loadedData, {
        fontScale: 0.5,
        startX: -1000,
        startY: 500,
        justify: 'left'
    });

    slugMesh = new THREE.Mesh(geometry, material);

    if (depthMaterial) slugMesh.customDepthMaterial = depthMaterial;
    if (distanceMaterial) slugMesh.customDistanceMaterial = distanceMaterial;

    // Let Three.js dynamically build the Depth Material derived from our onBeforeCompile graph instead of forcing custom
    slugMesh.castShadow = true;
    slugMesh.receiveShadow = true;

    // Disabling frustum culling temporally to purely isolate WebGL shadow buffer pipelines
    slugMesh.frustumCulled = false;
    slugMesh.scale.multiplyScalar(.01);
    scene.add(slugMesh);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Star Wars Title Crawl
    if (slugMesh) {
        const autoScroll = document.getElementById('autoScroll');
        if (autoScroll && autoScroll.checked) {
            const speed = .2;
            slugMesh.position.y += speed;
            if (slugMesh.position.y > 2800) {
                slugMesh.position.y = -2400;
            }
        }
    }

    if (debugCube) {
        // Keep debug cube visible in frame and spinning wildly
        debugCube.position.y = 50;
        debugCube.position.x = Math.sin(Date.now() * 0.001) * 300;
        debugCube.rotation.x += 0.01;
        debugCube.rotation.y += 0.02;

        if (pointLight) {
            pointLight.position.x = debugCube.position.x + Math.cos(Date.now() * 0.0015) * 300;
            pointLight.position.y = debugCube.position.y + Math.sin(Date.now() * 0.0015) * 300;
            pointLight.position.z = debugCube.position.z + Math.cos(Date.now() * 0.001) * 150;
        }
    }

    if (controls) controls.update();
    renderer.render(scene, camera);
}
