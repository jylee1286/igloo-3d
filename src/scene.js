import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer, RenderPass, BloomEffect, EffectPass, SMAAEffect, ToneMappingEffect, VignetteEffect, ToneMappingMode } from 'postprocessing';

const texLoader = new THREE.TextureLoader();

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

  // ─── Scene (overcast arctic — igloo.inc has muted grey-blue atmosphere) ───
  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(0xa8b0b8);
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2(bgColor, 0.015); // slightly denser fog for atmosphere

  // ─── Camera ───
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 2.0, 12);
  camera.lookAt(0, 0.8, 0);

  // ─── Post-Processing ───
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    intensity: 2.0,
    luminanceThreshold: 0.35,
    luminanceSmoothing: 0.25,
    mipmapBlur: true,
  });
  const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.4 });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const smaa = new SMAAEffect();
  composer.addPass(new EffectPass(camera, bloom, vignette, toneMapping, smaa));

  // ─── Lighting (bright overcast arctic — matches igloo.inc) ───
  const sunLight = new THREE.DirectionalLight(0xdde4ee, 3.2);
  sunLight.position.set(5, 12, 3);
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

  const fillLight = new THREE.DirectionalLight(0xb0c0d0, 1.2);
  fillLight.position.set(-4, 4, -6);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0x99aacc, 0.8);
  backLight.position.set(0, 3, -8);
  scene.add(backLight);

  const hemiLight = new THREE.HemisphereLight(0xb0c0d8, 0x556677, 1.4);
  scene.add(hemiLight);

  // ─── Ground (rocky snowy terrain like igloo.inc) ───
  const groundGeo = new THREE.PlaneGeometry(120, 120, 400, 400);
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const dist = Math.sqrt(x * x + y * y);
    let h = 0;
    // Rocky undulating terrain — flat right under igloo, rocky everywhere else
    if (dist > 3.5) {
      const t = Math.min((dist - 3.5) / 8, 1);
      // Large rolling hills (gentler)
      h += (Math.sin(x * 0.1 + 0.3) * Math.cos(y * 0.08) * 2.5
        + Math.sin(x * 0.22 + y * 0.15 + 1.2) * 1.5) * t;
      // Medium bumps
      h += (Math.sin(x * 0.45 + 1.3) * Math.cos(y * 0.38 + 0.7) * 0.7
        + Math.sin(x * 0.7 + y * 0.55) * 0.4) * t;
      // Small detail
      h += (Math.sin(x * 1.2 + 2.1) * Math.cos(y * 1.0 + 0.3) * 0.25
        + Math.sin(x * 2.0 + y * 1.8) * 0.12) * t;
    }
    // Fine surface snow bumps everywhere
    h += Math.sin(x * 3.5 + y * 2.8) * 0.06 + Math.sin(x * 7.1 + y * 5.3) * 0.025;
    posAttr.setZ(i, h);
  }
  groundGeo.computeVertexNormals();

  // Real PBR snow textures from Polyhaven
  const groundDiffTex = texLoader.load('/textures/snow_ground_diff.jpg');
  groundDiffTex.wrapS = groundDiffTex.wrapT = THREE.RepeatWrapping;
  groundDiffTex.repeat.set(10, 10);
  groundDiffTex.colorSpace = THREE.SRGBColorSpace;
  const groundNorTex = texLoader.load('/textures/snow_ground_nor.jpg');
  groundNorTex.wrapS = groundNorTex.wrapT = THREE.RepeatWrapping;
  groundNorTex.repeat.set(10, 10);
  const groundRoughTex = texLoader.load('/textures/snow_ground_rough.jpg');
  groundRoughTex.wrapS = groundRoughTex.wrapT = THREE.RepeatWrapping;
  groundRoughTex.repeat.set(10, 10);

  const groundMat = new THREE.MeshStandardMaterial({
    map: groundDiffTex,
    normalMap: groundNorTex,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: groundRoughTex,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // No base ring — igloo sits directly on rocky terrain like igloo.inc

  // Rocky snow mounds — closer to igloo + larger for igloo.inc look
  const moundConfigs = [];
  // Close ring — small snow lumps at igloo base
  for (let i = 0; i < 10; i++) {
    moundConfigs.push({ angle: (i / 10) * Math.PI * 2 + Math.random() * 0.4, dist: 3.8 + Math.random() * 1.2, r: 0.4 + Math.random() * 0.6, sy: 0.2 + Math.random() * 0.2 });
  }
  // Mid ring — medium rocky mounds
  for (let i = 0; i < 14; i++) {
    moundConfigs.push({ angle: (i / 14) * Math.PI * 2 + Math.random() * 0.3, dist: 6 + Math.random() * 5, r: 0.6 + Math.random() * 1.2, sy: 0.25 + Math.random() * 0.35 });
  }
  // Far ring — larger boulders
  for (let i = 0; i < 8; i++) {
    moundConfigs.push({ angle: (i / 8) * Math.PI * 2 + Math.random() * 0.5, dist: 12 + Math.random() * 6, r: 1.0 + Math.random() * 1.5, sy: 0.3 + Math.random() * 0.4 });
  }
  for (const mc of moundConfigs) {
    const moundGeo = new THREE.SphereGeometry(mc.r, 10 + Math.floor(Math.random() * 4), 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const mp = moundGeo.attributes.position;
    for (let v = 0; v < mp.count; v++) {
      const px = mp.getX(v), py = mp.getY(v), pz = mp.getZ(v);
      mp.setX(v, px + (Math.random() - 0.5) * 0.2 * mc.r);
      mp.setY(v, py + (Math.random() - 0.5) * 0.15 * mc.r);
      mp.setZ(v, pz + (Math.random() - 0.5) * 0.2 * mc.r);
    }
    moundGeo.computeVertexNormals();
    const moundMat = groundMat.clone();
    const mound = new THREE.Mesh(moundGeo, moundMat);
    mound.position.set(Math.cos(mc.angle) * mc.dist, -0.5, Math.sin(mc.angle) * mc.dist);
    mound.scale.set(1.2 + Math.random() * 0.4, mc.sy, 1.2 + Math.random() * 0.4);
    mound.receiveShadow = true;
    mound.castShadow = true;
    scene.add(mound);
  }

  // ─── Mountains (terrain ring — organic displaced plane ridges) ───
  const mtDiffTex = texLoader.load('/textures/snow_ground_diff.jpg');
  mtDiffTex.wrapS = mtDiffTex.wrapT = THREE.RepeatWrapping;
  mtDiffTex.repeat.set(8, 8);
  mtDiffTex.colorSpace = THREE.SRGBColorSpace;
  const mtNorTex = texLoader.load('/textures/snow_ground_nor.jpg');
  mtNorTex.wrapS = mtNorTex.wrapT = THREE.RepeatWrapping;
  mtNorTex.repeat.set(8, 8);

  const mtMat = new THREE.MeshStandardMaterial({
    map: mtDiffTex,
    normalMap: mtNorTex,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.92,
    flatShading: false,
  });

  // Smooth noise for organic mountain shapes
  function noise2D(x, y, seed) {
    // Lower frequencies = smoother, rounder ridges
    return Math.sin(x * 0.06 + seed) * Math.cos(y * 0.05 + seed * 0.7) * 1.0
      + Math.sin(x * 0.12 + y * 0.09 + seed * 1.3) * 0.5
      + Math.sin(x * 0.2 + seed * 2.1) * Math.cos(y * 0.15 + seed * 0.3) * 0.25;
  }

  // Create multiple terrain ridge segments around the igloo
  const ridgeConfigs = [
    // Back ridges (behind igloo)
    { cx: 0, cz: -35, w: 80, d: 40, maxH: 22, seed: 1.0 },
    { cx: -30, cz: -20, w: 50, d: 35, maxH: 18, seed: 2.3 },
    { cx: 30, cz: -25, w: 50, d: 35, maxH: 20, seed: 3.7 },
    // Side ridges
    { cx: -45, cz: 5, w: 40, d: 45, maxH: 14, seed: 4.1 },
    { cx: 45, cz: 0, w: 40, d: 45, maxH: 13, seed: 5.5 },
    // Far back
    { cx: 0, cz: -55, w: 100, d: 30, maxH: 28, seed: 6.2 },
    { cx: -50, cz: -40, w: 45, d: 30, maxH: 20, seed: 7.8 },
    { cx: 50, cz: -35, w: 45, d: 30, maxH: 18, seed: 8.4 },
    // Front ridges (lower, further)
    { cx: -35, cz: 30, w: 50, d: 30, maxH: 10, seed: 9.1 },
    { cx: 35, cz: 28, w: 50, d: 30, maxH: 11, seed: 10.3 },
    { cx: 0, cz: 45, w: 70, d: 25, maxH: 8, seed: 11.7 },
  ];

  for (const rc of ridgeConfigs) {
    const segsX = Math.max(20, Math.floor(rc.w * 1.2));
    const segsZ = Math.max(15, Math.floor(rc.d * 1.2));
    const geo = new THREE.PlaneGeometry(rc.w, rc.d, segsX, segsZ);
    const pos = geo.attributes.position;

    for (let vi = 0; vi < pos.count; vi++) {
      const lx = pos.getX(vi);
      const ly = pos.getY(vi);
      // Distance from center of this ridge segment
      const nx = lx / (rc.w * 0.5); // -1 to 1
      const ny = ly / (rc.d * 0.5); // -1 to 1
      // Smooth falloff at edges (rounded ridge shape)
      const edgeFalloff = Math.max(0, 1 - nx * nx) * Math.max(0, 1 - ny * ny);
      const ridgeShape = Math.pow(edgeFalloff, 0.8); // smoother falloff

      // Smooth height field
      const wx = lx + rc.cx, wy = ly + rc.cz;
      // Base shape: smooth dome with noise variation
      const baseH = ridgeShape * rc.maxH * 0.7;
      const noiseH = noise2D(wx, wy, rc.seed) * rc.maxH * 0.4 * ridgeShape;
      const h = baseH + noiseH;

      // Gentle surface detail
      const detail = (Math.sin(wx * 0.5 + rc.seed) * Math.cos(wy * 0.4) * 0.4
        + Math.sin(wx * 1.0 + wy * 0.8) * 0.15) * ridgeShape;

      pos.setZ(vi, Math.max(0, h + detail));
    }
    geo.computeVertexNormals();

    const ridge = new THREE.Mesh(geo, mtMat);
    ridge.rotation.x = -Math.PI / 2;
    ridge.position.set(rc.cx, -0.5, rc.cz);
    ridge.receiveShadow = true;
    ridge.castShadow = true;
    scene.add(ridge);
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
    color: 0xdde4ec,
    size: 0.05,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const snowParticles = new THREE.Points(snowGeo, snowMat);
  scene.add(snowParticles);

  // ─── Snow Block Material (real PBR from Polyhaven snow_02) ───
  const blockDiffTex = texLoader.load('/textures/snow_block_diff.jpg');
  blockDiffTex.wrapS = blockDiffTex.wrapT = THREE.RepeatWrapping;
  blockDiffTex.colorSpace = THREE.SRGBColorSpace;
  const blockNorTex = texLoader.load('/textures/snow_block_nor.jpg');
  blockNorTex.wrapS = blockNorTex.wrapT = THREE.RepeatWrapping;
  const blockRoughTex = texLoader.load('/textures/snow_block_rough.jpg');
  blockRoughTex.wrapS = blockRoughTex.wrapT = THREE.RepeatWrapping;

  function createSnowBlockMaterial() {
    // Each block gets slightly different UV offset for variation
    const offsetX = Math.random(), offsetY = Math.random();
    const rep = 1.5 + Math.random() * 0.5;

    const diff = blockDiffTex.clone();
    diff.repeat.set(rep, rep);
    diff.offset.set(offsetX, offsetY);
    diff.needsUpdate = true;

    const nor = blockNorTex.clone();
    nor.repeat.set(rep, rep);
    nor.offset.set(offsetX, offsetY);
    nor.needsUpdate = true;

    const rough = blockRoughTex.clone();
    rough.repeat.set(rep, rep);
    rough.offset.set(offsetX, offsetY);
    rough.needsUpdate = true;

    return new THREE.MeshPhysicalMaterial({
      map: diff,
      normalMap: nor,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: rough,
      roughness: 0.55,
      metalness: 0.0,
      color: new THREE.Color(0xeaeff6),
      side: THREE.DoubleSide,
      // Subsurface/translucency for icy glow
      transmission: 0.05,
      thickness: 0.3,
      sheen: 0.4,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0xd0e0ff),
      clearcoat: 0.15,
      clearcoatRoughness: 0.4,
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

  // ─── Interior Glow Light (activates on hover like igloo.inc) ───
  const interiorLight = new THREE.PointLight(0xeef4ff, 0, 8);
  interiorLight.position.set(0, 1.2, 0);
  scene.add(interiorLight);
  let interiorGlowTarget = 0;

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
        // Scale to fit
        const box = new THREE.Box3().setFromObject(iglooGroup);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 6;
        const scaleFactor = targetSize / maxDim;
        iglooGroup.scale.setScalar(scaleFactor);
        
        // Recalculate bounds after scaling
        const box2 = new THREE.Box3().setFromObject(iglooGroup);
        const center = box2.getCenter(new THREE.Vector3());
        iglooGroup.position.set(-center.x, -box2.min.y, -center.z);

        let blockIdx = 0;
        iglooGroup.traverse((child) => {
          if (child.isMesh) {

            const mat = createSnowBlockMaterial();
            child.material = mat;
            child.castShadow = true;
            child.receiveShadow = true;

            // Shrink blocks from their center to create clean gaps
            if (!child.name || !child.name.includes('Tunnel')) {
              child.scale.multiplyScalar(0.82);
            } else {
              child.scale.multiplyScalar(0.85);
            }

            // Compute world-space center of this block
            child.geometry.computeBoundingBox();
            const localCenter = new THREE.Vector3();
            child.geometry.boundingBox.getCenter(localCenter);
            // Convert to world space for proper direction
            const worldCenter = localCenter.clone();
            child.localToWorld(worldCenter);
            child.userData.blockCenter = localCenter.clone();
            child.userData.worldCenter = worldCenter.clone();

            child.userData.originalPosition = child.position.clone();
            child.userData.originalScale = child.scale.clone();
            child.userData.originalRotation = child.rotation.clone();
            child.userData.hoverAmount = 0;
            child.userData.blockIndex = blockIdx++;
            iglooBlocks.push(child);
          }
        });

        // Debug: find hole and tunnel positions
        const debugInfo = [];
        iglooGroup.traverse((child) => {
          if (child.isMesh && child.name) {
            child.geometry.computeBoundingBox();
            const c = new THREE.Vector3();
            child.geometry.boundingBox.getCenter(c);
            if (child.name.includes('r0_b25') || child.name.includes('r0_b26') || child.name.includes('r0_b24') || child.name.includes('TunnelBlock_3') || child.name.includes('TunnelBlock_0')) {
              debugInfo.push(`${child.name}: (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}) xz_angle=${(Math.atan2(c.z, c.x) * 180 / Math.PI).toFixed(1)}`);
            }
          }
        });
        console.log(debugInfo.join(' | '));
        // Tunnel blocks come from the GLB model (Blender-built arch)

        // ─── Interior Glow (bright light inside dome, visible through cracks) ───
        const glowGeo = new THREE.SphereGeometry(2.5, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(2.0, 2.0, 2.2), // HDR white for bloom through cracks
          transparent: false,
          side: THREE.BackSide,
        });
        const glowSphere = new THREE.Mesh(glowGeo, glowMat);
        glowSphere.position.set(0, 1.2, 0);
        glowSphere.name = 'interiorGlow';
        iglooGroup.add(glowSphere);

        // Multiple interior lights for strong light bleed through every crack
        const interiorLight = new THREE.PointLight(0xeef2ff, 8.0, 12);
        interiorLight.position.set(0, 1.5, 0);
        const interiorLight2 = new THREE.PointLight(0xeef2ff, 4.0, 8);
        interiorLight2.position.set(0, 0.5, 0);
        iglooGroup.add(interiorLight2);
        iglooGroup.add(interiorLight);

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

  // ─── Camera (fixed front view, no orbit) ───
  // Front-facing view showing tunnel side, matching reference orientation
  const camStart = { x: -8, y: 3.5, z: 6, lookY: 1.5 };
  
  function updateCamera(scrollProgress) {
    // Camera stays at front angle, slight vertical shift on scroll
    const p = scrollProgress;
    camera.position.x = camStart.x + p * 2;
    camera.position.y = camStart.y - p * 1.5;
    camera.position.z = camStart.z - p * 2;
    camera.lookAt(0, camStart.lookY - p * 0.5, 0);
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

    // No interior glow to manage

    // Hover (with sticky target to prevent flickering)
    if (iglooBlocks.length > 0) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(iglooBlocks, false);
      // Only allow hovering front-facing blocks (facing camera, not back of dome)
      let rawHovered = null;
      for (const hit of intersects) {
        const wc = hit.object.userData.worldCenter;
        if (wc) {
          // Check if block faces the camera (dot product of block direction with camera direction)
          const blockDir = wc.clone().normalize();
          const camDir = camera.position.clone().normalize();
          const dot = blockDir.dot(camDir);
          if (dot > 0.15) { // block is on camera-facing side
            rawHovered = hit.object;
            break;
          }
        } else {
          rawHovered = hit.object;
          break;
        }
      }
      
      // Sticky hover: only switch target if we get a consistent new target
      if (!animate._stickyHover) animate._stickyHover = { obj: null, frames: 0 };
      if (rawHovered === animate._stickyHover.obj) {
        animate._stickyHover.frames++;
      } else {
        animate._stickyHover.obj = rawHovered;
        animate._stickyHover.frames = 0;
      }
      // Only switch hovered block after 3 consistent frames
      if (animate._stickyHover.frames >= 3 || rawHovered === null) {
        animate._lastHovered = rawHovered;
      }
      const hovered = animate._lastHovered || null;

      // Interior glow: ramp up when hovering
      interiorGlowTarget = hovered ? 15 : 0;
      interiorLight.intensity += (interiorGlowTarget - interiorLight.intensity) * 0.06;

      for (const block of iglooBlocks) {
        // ─── Idle breathing animation (always active, per-block phase) ───
        const seed = block.id * 1.37;
        const breathe = Math.sin(elapsed * 0.8 + seed * 2.1) * 0.5 + 0.5; // 0-1 slow wave
        const idlePush = breathe * 0.04; // very subtle outward pulse
        const idleTiltX = Math.sin(elapsed * 0.6 + seed * 1.5) * 0.015;
        const idleTiltZ = Math.cos(elapsed * 0.5 + seed * 0.9) * 0.012;
        const idleY = Math.sin(elapsed * 0.7 + seed * 1.8) * 0.008;

        // ─── Hover target ───
        let target = 0;
        if (block === hovered) {
          target = 1;
        } else if (hovered) {
          const bc = block.userData.worldCenter || block.userData.blockCenter;
          const hc = hovered.userData.worldCenter || hovered.userData.blockCenter;
          const dist = bc.distanceTo(hc);
          if (dist < 3.5) target = 0.8 * Math.pow(1 - dist / 3.5, 1.3);
        }

        // Smooth easing (hover persists while staying on same block)
        block.userData.hoverAmount += (target - block.userData.hoverAmount) * 0.07;
        const h = block.userData.hoverAmount;

        const orig = block.userData.originalPosition;
        const wc = block.userData.worldCenter;
        const dir = wc ? new THREE.Vector3(wc.x, wc.y * 0.6, wc.z).normalize() : new THREE.Vector3(0, 1, 0);

        // Combine idle + hover
        const totalPush = idlePush + h * 0.7;
        block.position.copy(orig).addScaledVector(dir, totalPush);
        block.position.y += idleY + h * 0.2;

        block.rotation.x = block.userData.originalRotation.x + idleTiltX + h * 0.4 * Math.sin(seed + 0.5);
        block.rotation.y = block.userData.originalRotation.y + h * 0.3 * Math.cos(seed * 0.7);
        block.rotation.z = block.userData.originalRotation.z + idleTiltZ + h * 0.35 * Math.sin(seed * 1.3 + 1.0);

        const s = 1 + h * 0.04;
        block.scale.copy(block.userData.originalScale).multiplyScalar(s);

        if (h > 0.005) {
          block.material.emissive.setRGB(0.95, 0.97, 1.0);
          block.material.emissiveIntensity = 0.08 + h * 1.2;
          updateLabel(block, h > 0.4);
        } else {
          block.material.emissive.setRGB(0.7, 0.75, 0.85);
          block.material.emissiveIntensity = 0.08;
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
