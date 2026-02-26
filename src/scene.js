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
  scene.fog = new THREE.FogExp2(bgColor, 0.012);

  // ─── Camera ───
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 2.0, 12);
  camera.lookAt(0, 0.8, 0);

  // ─── Post-Processing ───
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    intensity: 0.8,
    luminanceThreshold: 0.6,
    luminanceSmoothing: 0.15,
    mipmapBlur: true,
  });
  const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.4 });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const smaa = new SMAAEffect();
  composer.addPass(new EffectPass(camera, bloom, vignette, toneMapping, smaa));

  // ─── Lighting (bright overcast arctic — matches igloo.inc) ───
  const sunLight = new THREE.DirectionalLight(0xdde4ee, 2.5);
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

  const fillLight = new THREE.DirectionalLight(0x99aabb, 0.8);
  fillLight.position.set(-4, 4, -6);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0x99aacc, 0.8);
  backLight.position.set(0, 3, -8);
  scene.add(backLight);

  const hemiLight = new THREE.HemisphereLight(0x99aabb, 0x445566, 1.0);
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

    return new THREE.MeshStandardMaterial({
      map: diff,
      normalMap: nor,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: rough,
      roughness: 0.82,
      metalness: 0.0,
      color: new THREE.Color(0xd0d5dd), // slight tint to brighten
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

            // Add vertex displacement for 3D surface detail (not flat blocks)
            const geo = child.geometry;
            if (geo && geo.attributes.position) {
              const pos = geo.attributes.position;
              const norm = geo.attributes.normal;
              if (norm) {
                for (let vi = 0; vi < pos.count; vi++) {
                  const nx = norm.getX(vi), ny = norm.getY(vi), nz = norm.getZ(vi);
                  const px = pos.getX(vi), py = pos.getY(vi), pz = pos.getZ(vi);
                  // Displace along normal with noise
                  const noise = (Math.sin(px * 15 + py * 12) * Math.cos(pz * 18 + px * 7) * 0.008
                    + Math.sin(px * 35 + pz * 25) * 0.004
                    + Math.sin(py * 40 + px * 30) * 0.003);
                  pos.setXYZ(vi, px + nx * noise, py + ny * noise, pz + nz * noise);
                }
                pos.needsUpdate = true;
                geo.computeVertexNormals();
              }
            }

            // Gentle shrink for gaps (dome blocks only, not tunnel)
            if (!child.name || !child.name.includes('Tunnel')) {
              child.scale.multiplyScalar(0.94);
            } else {
              child.scale.multiplyScalar(0.97);
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
        // Tunnel blocks come from the GLB model now — no generated tunnel

        // ─── Generate tunnel arch to cover the dome hole ───
        {
          let b11 = null, b16 = null;
          iglooGroup.traverse((child) => {
            if (child.isMesh && child.name) {
              if (child.name.includes('r0_b11')) b11 = child;
              if (child.name.includes('r0_b16')) b16 = child;
            }
          });

          if (b11 && b16) {
            const getWBB = (m) => { const b = new THREE.Box3(); b.expandByObject(m); return b; };
            const b11BB = getWBB(b11);
            const b16BB = getWBB(b16);
            const b11C = new THREE.Vector3(); b11BB.getCenter(b11C);
            const b16C = new THREE.Vector3(); b16BB.getCenter(b16C);
            let innerZ1, innerZ2;
            if (b11C.z < b16C.z) { innerZ1 = b11BB.max.z; innerZ2 = b16BB.min.z; }
            else { innerZ1 = b16BB.max.z; innerZ2 = b11BB.min.z; }
            const holeWidth = Math.abs(innerZ2 - innerZ1);
            const holeCenterZ = (innerZ1 + innerZ2) / 2;
            const holeYTop = Math.max(b11BB.max.y, b16BB.max.y);
            const groupBBox = new THREE.Box3(); groupBBox.expandByObject(iglooGroup);
            const holeYBottom = groupBBox.min.y;
            const holeHeight = holeYTop - holeYBottom;
            const domeOuterX = Math.min(b11BB.min.x, b16BB.min.x);
            console.log('Hole: w=' + holeWidth.toFixed(3) + ' h=' + holeHeight.toFixed(3) + ' cZ=' + holeCenterZ.toFixed(3) + ' dX=' + domeOuterX.toFixed(3));
            const tunnelDepth = 1.5, tunnelRings = 4, tunnelSegments = 7, blockThickness = 0.2;
            const archWidth = holeWidth * 1.15, archHeight = holeHeight * 1.05;
            const halfW = archWidth / 2;
            const iceMat = b11.material.clone();
            for (let ring = 0; ring < tunnelRings; ring++) {
              const rd = tunnelDepth / tunnelRings;
              const xN = domeOuterX - ring * rd, xF = xN - rd;
              for (let seg = 0; seg < tunnelSegments; seg++) {
                const t0 = (seg / tunnelSegments) * Math.PI;
                const t1 = ((seg + 1) / tunnelSegments) * Math.PI;
                const subdivs = 4, positions = [], idx = [];
                for (let s = 0; s <= subdivs; s++) {
                  const t = t0 + (t1 - t0) * (s / subdivs);
                  const iz = holeCenterZ + halfW * Math.cos(t);
                  const iy = holeYBottom + archHeight * Math.sin(t);
                  const nz = Math.cos(t) / halfW, ny = Math.sin(t) / archHeight;
                  const nLen = Math.sqrt(nz * nz + ny * ny);
                  const oz = iz + (nz / nLen) * blockThickness;
                  const oy = iy + (ny / nLen) * blockThickness;
                  positions.push(xN, iy, iz, xF, iy, iz, xN, oy, oz, xF, oy, oz);
                  if (s < subdivs) {
                    const base = s * 4, nb = (s + 1) * 4;
                    idx.push(base, base+1, nb+1, base, nb+1, nb);
                    idx.push(base+2, nb+2, nb+3, base+2, nb+3, base+3);
                    idx.push(base, nb, nb+2, base, nb+2, base+2);
                    idx.push(base+1, base+3, nb+3, base+1, nb+3, nb+1);
                  }
                }
                idx.push(0, 2, 3, 0, 3, 1);
                const last = subdivs * 4;
                idx.push(last, last+1, last+3, last, last+3, last+2);
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geo.setIndex(idx);
                geo.computeVertexNormals();
                const mesh = new THREE.Mesh(geo, iceMat);
                mesh.name = 'TunnelBlock_' + ring + '_' + seg;
                mesh.castShadow = true; mesh.receiveShadow = true;
                mesh.scale.multiplyScalar(0.985);
                mesh.userData.originalPosition = mesh.position.clone();
                mesh.userData.originalScale = mesh.scale.clone();
                mesh.userData.originalQuaternion = mesh.quaternion.clone();
                iglooGroup.add(mesh);
              }
            }
            console.log('Generated ' + (tunnelRings * tunnelSegments) + ' tunnel blocks');
          }
        }

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

    // No interior glow to manage

    // Hover (with sticky target to prevent flickering)
    if (iglooBlocks.length > 0) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(iglooBlocks, false);
      const rawHovered = intersects.length > 0 ? intersects[0].object : null;
      
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
        let target = 0;
        if (block === hovered) {
          target = 1;
        } else if (hovered) {
          const bc = block.userData.worldCenter || block.userData.blockCenter;
          const hc = hovered.userData.worldCenter || hovered.userData.blockCenter;
          const dist = bc.distanceTo(hc);
          // Localized radius with falloff — dramatic for close blocks
          if (dist < 2.5) target = 0.7 * Math.pow(1 - dist / 2.5, 1.5);
        }

        // Smooth easing
        block.userData.hoverAmount += (target - block.userData.hoverAmount) * 0.07;
        const h = block.userData.hoverAmount;

        if (h > 0.005) {
          const orig = block.userData.originalPosition;
          const wc = block.userData.worldCenter;
          // Direction: outward from dome center + slight upward
          const dir = wc ? new THREE.Vector3(wc.x, wc.y * 0.6, wc.z).normalize() : new THREE.Vector3(0, 1, 0);
          
          // DRAMATIC outward push — blocks clearly separate from dome
          const pushDist = h * 0.45;
          block.position.copy(orig).addScaledVector(dir, pushDist);
          block.position.y += h * 0.12;

          // Per-block random tilt (seeded — consistent per block)
          const seed = block.id * 1.37;
          block.rotation.x = block.userData.originalRotation.x + h * 0.28 * Math.sin(seed + 0.5);
          block.rotation.y = block.userData.originalRotation.y + h * 0.2 * Math.cos(seed * 0.7);
          block.rotation.z = block.userData.originalRotation.z + h * 0.25 * Math.sin(seed * 1.3 + 1.0);

          // Slight scale
          const s = 1 + h * 0.04;
          block.scale.copy(block.userData.originalScale).multiplyScalar(s);

          // Emissive glow — brighter on directly hovered block
          block.material.emissive.setRGB(0.95, 0.97, 1.0);
          block.material.emissiveIntensity = h * 1.0;

          updateLabel(block, h > 0.4);
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
