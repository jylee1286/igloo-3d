import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer, RenderPass, BloomEffect, EffectPass, SMAAEffect, ToneMappingEffect, VignetteEffect, ToneMappingMode } from 'postprocessing';

export function createScene(container) {
  // ─── Renderer ───
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // ─── Scene ───
  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(0x2a2e33);
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2(bgColor, 0.03);

  // ─── Camera ───
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 2.0, 12);
  camera.lookAt(0, 0.8, 0);

  // ─── Post-Processing ───
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    intensity: 1.0,
    luminanceThreshold: 0.55,
    luminanceSmoothing: 0.2,
    mipmapBlur: true,
  });
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.55 });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const smaa = new SMAAEffect();
  composer.addPass(new EffectPass(camera, bloom, vignette, toneMapping, smaa));

  // ─── Lighting ───
  const sunLight = new THREE.DirectionalLight(0xc0d4e8, 2.0);
  sunLight.position.set(5, 10, 3);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 30;
  const sc = 8;
  sunLight.shadow.camera.left = -sc;
  sunLight.shadow.camera.right = sc;
  sunLight.shadow.camera.top = sc;
  sunLight.shadow.camera.bottom = -sc;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x8899aa, 0.3);
  fillLight.position.set(-4, 4, -6);
  scene.add(fillLight);

  const hemiLight = new THREE.HemisphereLight(0x667788, 0x222233, 0.4);
  scene.add(hemiLight);

  // ─── Interior glow — BRIGHT white, the key visual element ───
  // The real igloo.inc has blindingly bright white interior visible through every gap
  const interiorGlow = new THREE.PointLight(0xeef4ff, 20, 8, 1.5);
  interiorGlow.position.set(0, 1.0, 0);
  scene.add(interiorGlow);

  const interiorFill = new THREE.PointLight(0xddeeff, 12, 6, 1.5);
  interiorFill.position.set(0, 1.8, 0);
  scene.add(interiorFill);

  // Bright glow core sphere — visible through gaps
  const glowCoreMat = new THREE.MeshBasicMaterial({
    color: 0xeef4ff,
    transparent: true,
    opacity: 0.35,
  });
  const glowCore = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), glowCoreMat);
  glowCore.position.y = 0.9;
  scene.add(glowCore);

  // Entrance spill light
  const entranceDir = new THREE.Vector3(0.85, 0, -0.53).normalize();
  const entranceSpill = new THREE.SpotLight(0xeef4ff, 10, 10, Math.PI / 3.5, 0.4);
  entranceSpill.position.set(0, 0.6, 0);
  entranceSpill.target.position.copy(entranceDir.clone().multiplyScalar(5));
  entranceSpill.target.position.y = 0.2;
  scene.add(entranceSpill);
  scene.add(entranceSpill.target);

  // ─── Ground ───
  const groundGeo = new THREE.PlaneGeometry(120, 120, 250, 250);
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const dist = Math.sqrt(x * x + y * y);
    // Rocky terrain with more detail
    let h = 0;
    if (dist > 4) {
      const t = Math.min((dist - 4) / 20, 1);
      h = (Math.sin(x * 0.12) * Math.cos(y * 0.1) * 2.5
        + Math.sin(x * 0.25 + y * 0.18) * 1.2
        + Math.sin(x * 0.5 + 1.3) * Math.cos(y * 0.4 + 0.7) * 0.5) * t;
    }
    posAttr.setZ(i, h);
  }
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x3d4750,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // Snow base ring
  const baseRingGeo = new THREE.TorusGeometry(3.3, 0.7, 8, 32);
  const baseRing = new THREE.Mesh(baseRingGeo, groundMat.clone());
  baseRing.material.color.set(0x4a5560);
  baseRing.rotation.x = -Math.PI / 2;
  baseRing.position.y = -0.3;
  baseRing.scale.y = 0.35;
  baseRing.receiveShadow = true;
  scene.add(baseRing);

  // Rock/snow mounds around base
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 3.8 + Math.random() * 4;
    const r = 0.4 + Math.random() * 0.9;
    const moundGeo = new THREE.SphereGeometry(r, 6 + Math.floor(Math.random() * 4), 5, 0, Math.PI * 2, 0, Math.PI / 2);
    // Deform for rocky look
    const mp = moundGeo.attributes.position;
    for (let v = 0; v < mp.count; v++) {
      const px = mp.getX(v), py = mp.getY(v), pz = mp.getZ(v);
      mp.setX(v, px + (Math.random() - 0.5) * 0.15 * r);
      mp.setY(v, py + (Math.random() - 0.5) * 0.1 * r);
      mp.setZ(v, pz + (Math.random() - 0.5) * 0.15 * r);
    }
    moundGeo.computeVertexNormals();
    const mound = new THREE.Mesh(moundGeo, groundMat);
    mound.position.set(Math.cos(angle) * dist, -0.5, Math.sin(angle) * dist);
    mound.scale.set(1.5 + Math.random(), 0.3 + Math.random() * 0.25, 1.5 + Math.random());
    mound.receiveShadow = true;
    scene.add(mound);
  }

  // ─── Mountains (360°) ───
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.2;
    const dist = 22 + Math.random() * 28;
    const h = 8 + Math.random() * 20;
    const s = 7 + Math.random() * 14;
    const geo = new THREE.ConeGeometry(s, h, 5 + Math.floor(Math.random() * 4));
    const mPos = geo.attributes.position;
    for (let v = 0; v < mPos.count; v++) {
      const px = mPos.getX(v), py = mPos.getY(v), pz = mPos.getZ(v);
      const n = (Math.sin(px * 1.5 + py * 0.8) * Math.cos(pz * 1.2 + 0.5)) * 0.18 * s;
      mPos.setX(v, px + n);
      mPos.setZ(v, pz + n * 0.6);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.58, 0.04, 0.18 + Math.random() * 0.1),
      roughness: 0.95,
      flatShading: true,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(angle) * dist, h / 2 - 3, Math.sin(angle) * dist);
    m.rotation.y = Math.random() * Math.PI;
    scene.add(m);
  }

  // ─── Snow Particles ───
  const snowCount = 1500;
  const snowGeo = new THREE.BufferGeometry();
  const snowPositions = new Float32Array(snowCount * 3);
  const snowSizes = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i++) {
    snowPositions[i * 3] = (Math.random() - 0.5) * 50;
    snowPositions[i * 3 + 1] = Math.random() * 20;
    snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 50;
    snowSizes[i] = 0.02 + Math.random() * 0.04;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  const snowMat = new THREE.PointsMaterial({
    color: 0x889aaa,
    size: 0.05,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const snowParticles = new THREE.Points(snowGeo, snowMat);
  scene.add(snowParticles);

  // ─── Snow Block Material ───
  function createSnowBlockMaterial() {
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 256;
    const ctx = bumpCanvas.getContext('2d');
    // Fine grain noise
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        ctx.fillStyle = `rgb(${Math.random() * 60 + 80},${Math.random() * 60 + 80},${Math.random() * 60 + 80})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Larger grain clumps
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const r = 3 + Math.random() * 10;
      const v = Math.random() * 50 + 90;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(2, 2);

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 128;
    colorCanvas.height = 128;
    const cctx = colorCanvas.getContext('2d');
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const base = 85 + Math.random() * 45;
        cctx.fillStyle = `rgb(${base - 3 + Math.random() * 6},${base + Math.random() * 5},${base + 5 + Math.random() * 8})`;
        cctx.fillRect(x, y, 1, 1);
      }
    }
    const colorTex = new THREE.CanvasTexture(colorCanvas);
    colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.repeat.set(2, 2);

    return new THREE.MeshStandardMaterial({
      map: colorTex,
      roughness: 0.9,
      metalness: 0.0,
      bumpMap: bumpTex,
      bumpScale: 0.25,
      side: THREE.DoubleSide,
    });
  }

  // ─── Number label overlay for hover ───
  const labelContainer = document.createElement('div');
  labelContainer.style.cssText = 'position:fixed;inset:0;z-index:20;pointer-events:none;';
  container.parentElement.appendChild(labelContainer);

  function updateLabel(block, visible) {
    if (!block.userData.labelEl) {
      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute;font-family:'Space Mono',monospace;font-size:11px;
        color:white;opacity:0;transition:opacity 0.2s;pointer-events:none;
        text-shadow:0 1px 4px rgba(0,0,0,0.6);letter-spacing:1px;
      `;
      el.textContent = block.userData.blockIndex || '0';
      labelContainer.appendChild(el);
      block.userData.labelEl = el;
    }
    const el = block.userData.labelEl;
    if (visible) {
      // Project 3D position to screen
      const pos = new THREE.Vector3();
      block.getWorldPosition(pos);
      pos.project(camera);
      const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.opacity = '0.8';
      el.style.transform = 'translate(-50%, -50%)';
    } else {
      el.style.opacity = '0';
    }
  }

  // ─── Load Igloo Model ───
  let iglooBlocks = [];
  let iglooGroup = null;
  const loader = new GLTFLoader();
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(99, 99);

  const modelPromise = new Promise((resolve) => {
    loader.load(
      '/models/igloo-blender.glb',
      (gltf) => {
        iglooGroup = gltf.scene;
        const box = new THREE.Box3().setFromObject(iglooGroup);
        const center = box.getCenter(new THREE.Vector3());
        iglooGroup.position.set(-center.x, -box.min.y, -center.z);

        let blockIdx = 0;
        iglooGroup.traverse((child) => {
          if (child.isMesh) {
            const mat = createSnowBlockMaterial();
            child.material = mat;
            child.castShadow = true;
            child.receiveShadow = true;

            // SHRINK each block to create visible gaps for light to shine through
            child.scale.multiplyScalar(0.88);

            // Add slight random irregularity
            child.scale.x *= 0.95 + Math.random() * 0.1;
            child.scale.y *= 0.93 + Math.random() * 0.14;
            child.scale.z *= 0.95 + Math.random() * 0.1;

            child.userData.originalPosition = child.position.clone();
            child.userData.originalScale = child.scale.clone();
            child.userData.originalRotation = child.rotation.clone();
            child.userData.hoverAmount = 0;
            child.userData.blockIndex = blockIdx++;
            iglooBlocks.push(child);
          }
        });

        scene.add(iglooGroup);
        resolve();
      },
      undefined,
      () => resolve()
    );
  });

  // ─── Hover ───
  function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }
  window.addEventListener('mousemove', onMouseMove, { passive: true });

  // ─── Camera Orbit ───
  const cameraOrbit = { angle: 0, radius: 12, height: 2.0, lookAtY: 0.8 };

  function updateCamera(scrollProgress) {
    cameraOrbit.angle = scrollProgress * Math.PI * 2;
    const h = cameraOrbit.height + Math.sin(scrollProgress * Math.PI) * 1.0;
    camera.position.x = Math.sin(cameraOrbit.angle) * cameraOrbit.radius;
    camera.position.z = Math.cos(cameraOrbit.angle) * cameraOrbit.radius;
    camera.position.y = h;
    camera.lookAt(0, cameraOrbit.lookAtY, 0);
  }

  // ─── Resize ───
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ─── Animation ───
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Snow
    const snowPos = snowParticles.geometry.attributes.position;
    for (let i = 0; i < snowCount; i++) {
      let y = snowPos.getY(i);
      y -= (0.25 + snowSizes[i] * 2.5) * dt;
      const x = snowPos.getX(i) + Math.sin(elapsed * 0.25 + i) * 0.004;
      const z = snowPos.getZ(i) + Math.cos(elapsed * 0.18 + i * 0.5) * 0.003;
      if (y < -0.5) y = 17 + Math.random() * 5;
      snowPos.setXYZ(i, x, y, z);
    }
    snowPos.needsUpdate = true;

    // Interior glow pulse
    const pulse = Math.sin(elapsed * 1.8) * 2 + Math.sin(elapsed * 3.2) * 1;
    interiorGlow.intensity = 20 + pulse;
    interiorFill.intensity = 12 + pulse * 0.5;
    glowCoreMat.opacity = 0.5 + Math.sin(elapsed * 1.2) * 0.1;

    // Hover
    if (iglooBlocks.length > 0) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(iglooBlocks, false);
      const hovered = intersects.length > 0 ? intersects[0].object : null;

      for (const block of iglooBlocks) {
        let target = 0;
        if (block === hovered) {
          target = 1;
        } else if (hovered) {
          const dist = block.userData.originalPosition.distanceTo(hovered.userData.originalPosition);
          if (dist < 1.0) target = 0.35 * (1 - dist / 1.0);
        }

        block.userData.hoverAmount += (target - block.userData.hoverAmount) * 0.1;
        const h = block.userData.hoverAmount;

        if (h > 0.005) {
          const orig = block.userData.originalPosition;
          const dir = orig.clone().normalize();

          // DRAMATIC outward push
          block.position.copy(orig).addScaledVector(dir, h * 1.5);
          block.position.y += h * 0.35;

          // Rotation wobble
          block.rotation.x = block.userData.originalRotation.x + h * 0.2 * Math.sin(elapsed * 0.8 + block.id);
          block.rotation.z = block.userData.originalRotation.z + h * 0.12 * Math.cos(elapsed * 0.6 + block.id);

          // Scale up slightly
          const s = 1 + h * 0.08;
          block.scale.copy(block.userData.originalScale).multiplyScalar(s);

          // Bright edge glow on hovered block
          block.material.emissive.setRGB(0.95, 0.97, 1.0);
          block.material.emissiveIntensity = h * 1.8;

          // Show label
          updateLabel(block, h > 0.3);
        } else {
          block.position.copy(block.userData.originalPosition);
          block.rotation.copy(block.userData.originalRotation);
          block.scale.copy(block.userData.originalScale);
          block.material.emissive.setRGB(0, 0, 0);
          block.material.emissiveIntensity = 0;
          updateLabel(block, false);
        }
      }

      renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    }

    composer.render();
  }
  animate();

  return { renderer, scene, camera, updateCamera, modelPromise };
}
