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
    renderer.setClearColor(0x004040, 1.0);
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
}

function handleSluggishUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
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

    const geometry = new SlugGeometry(100);

    const textToRender = "SLUG!";
    
    const top = window.innerHeight;
    const s = 300.0;
    const d = 25.0;
    // Center it around 0,0,0
    let x = -((textToRender.length * (s + d)) / 2);
    let y = 0;

    geometry.clear();


    for(let i=0; i<textToRender.length; i++) {
        const charCode = textToRender.charCodeAt(i);
        const data = loadedData.codePoints.get(charCode);
        if (data) {
            geometry.addGlyph(data, x, y, s, s, window.innerWidth, window.innerHeight);
            x += d + s;
        } else {
            console.warn("Character not found in font:", textToRender[i]);
        }
    }

    geometry.updateBuffers();

    slugMesh = new THREE.Mesh(geometry, material);
    // Disabling frustum culling since bounds aren't calculated for the instanced geometry
    slugMesh.frustumCulled = false; 
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
