// 漢字 ॐ ♞ ♠ ♡ ♢ ♣ ☻ ☼ 🎵 🚀 (Demonstrating generic Unicode vectors)

// ✌️🌴🐢🐐🍄⚽🍻👑📸😬👀🚨🏡🕊️🏆😻🌟🧿🍀🎨🍜

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SlugLoader } from '../src/SlugLoader.js';
import { SlugMaterial } from '../src/SlugMaterial.js';
import { SlugGeometry } from '../src/SlugGeometry.js';
import { SlugGenerator } from '../src/SlugGenerator.js';



let camera, scene, renderer;
let controls;
let slugMesh;
let loadedData = null;
let loadedFileName = 'font';

init();
animate();

function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0b192c, 1.0); // Deep blue background
    document.body.appendChild(renderer.domElement);

    // Swap to Perspective camera to fly around
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(0, 0, 2000);

    scene = new THREE.Scene();

    // Add a basic cube to verify scene/camera is working
    const debugCube = new THREE.Mesh(
        new THREE.BoxGeometry(100, 100, 100),
        new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
    );
    scene.add(debugCube);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

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

    // Prepopulate textarea with our own source code to demonstrate large paragraphs
    fetch('./main.js')
        .then(response => response.text())
        .then(text => {
            const textArea = document.getElementById('textInput');
            textArea.value = text.repeat(10); // Stress test with 10 copies!
            if (loadedData) createTextMesh();
        })
        .catch(err => console.error("Could not load main.js for textarea", err));

    // Load default DejaVuSansMono font
    loadFont('DejaVuSansMono.ttf');
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

    const material = new SlugMaterial({
        curvesTex: loadedData.curvesTex,
        bandsTex: loadedData.bandsTex
    });

    const textToRender = document.getElementById('textInput').value;

    // Dynamically size the geometry capacity to exactly the number of characters
    // Add a minimum of 1 to avoid Three.js throwing empty buffer errors
    const geometry = new SlugGeometry(Math.max(1, textToRender.length));

    geometry.clear();

    const fontScale = 0.5; // Global scaling factor to bring 1000-2048 UnitsPerEm down to reasonable world coords
    const lineHeight = 2000 * fontScale;
    let x = -1000;
    let startX = x;
    let y = 500;

    let i = 0;
    while (i < textToRender.length) {
        if (textToRender[i] === '\n') {
            x = startX;
            y -= lineHeight;
            i++;
            continue;
        }

        const charCode = textToRender.codePointAt(i);
        // Step by 2 if it's a surrogate pair
        i += charCode > 0xFFFF ? 2 : 1;

        let data = loadedData.codePoints.get(charCode);
        if (!data) {
            data = loadedData.codePoints.get(-1); // .notdef fallback!
        }

        if (data) {
            if (data.width > 0 && data.height > 0) {
                const quadW = data.width * fontScale;
                const quadH = data.height * fontScale;
                const px = x + data.bearingX * fontScale;
                const py = y + data.bearingY * fontScale;

                geometry.addGlyph(data, px, py, quadW, quadH, window.innerWidth, window.innerHeight);
            }
            x += data.advanceWidth * fontScale;
        } else if (textToRender[i] === ' ') {
            x += 600 * fontScale;
        }
    }

    geometry.updateBuffers();

    slugMesh = new THREE.Mesh(geometry, material);
    // Disabling frustum culling since bounds aren't calculated for the instanced geometry
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
    if (controls) controls.update();
    renderer.render(scene, camera);
}
