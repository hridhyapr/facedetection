/**
 * AegisVision Main Application Controller
 */

import { biometricDetector } from './detector.js';
import { BiometricRenderer } from './renderer.js';
import { biometricAudio } from './audio.js';

// Application State
const state = {
  mode: 'WEBCAM', // 'WEBCAM' | 'IMAGE'
  isCameraRunning: false,
  isMirrored: true,
  currentStream: null,
  activeFaceIndex: 0,
  lastDetectionResult: null,
  boxStyle: 'tactical',
  meshStyle: 'contours',
  showScanline: true,
  fps: 0,
  frameCount: 0,
  lastFpsTimestamp: performance.now(),
  previousFaceCount: 0,
  snapshots: []
};

// DOM Elements
const elements = {
  // Video & Image
  video: document.getElementById('webcam-feed'),
  staticImg: document.getElementById('static-feed'),
  canvas: document.getElementById('overlay-canvas'),
  mediaContainer: document.getElementById('media-container'),
  viewportStage: document.getElementById('viewport-stage'),
  loader: document.getElementById('viewport-loader'),
  loaderText: document.getElementById('loader-status-text'),
  loaderBar: document.getElementById('loader-bar'),
  dropzone: document.getElementById('upload-dropzone'),
  fileInput: document.getElementById('file-input'),
  btnBrowseFile: document.getElementById('btn-browse-file'),

  // Header Telemetry
  engineDot: document.getElementById('engine-dot'),
  engineStatus: document.getElementById('engine-status'),
  fpsCounter: document.getElementById('fps-counter'),
  latencyCounter: document.getElementById('latency-counter'),
  faceCountPill: document.getElementById('face-count-pill'),

  // Controls & Buttons
  btnSoundToggle: document.getElementById('btn-sound-toggle'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  tabWebcam: document.getElementById('tab-webcam'),
  tabUpload: document.getElementById('tab-upload'),
  sampleBtns: document.querySelectorAll('.btn-sample'),
  cameraControls: document.getElementById('camera-controls'),
  btnToggleCamera: document.getElementById('btn-toggle-camera'),
  btnFlipCamera: document.getElementById('btn-flip-camera'),
  cameraStatusDot: document.getElementById('camera-status-dot'),
  cameraBtnText: document.getElementById('camera-btn-text'),
  btnCaptureSnapshot: document.getElementById('btn-capture-snapshot'),
  toggleScanline: document.getElementById('toggle-scanline'),

  // Sidebar Telemetry
  faceCountBadge: document.getElementById('face-count-badge'),
  faceChipsContainer: document.getElementById('face-chips-container'),
  activeTargetId: document.getElementById('active-target-id'),
  metricConfidence: document.getElementById('metric-confidence'),
  barConfidence: document.getElementById('bar-confidence'),
  gaugeYaw: document.getElementById('gauge-yaw'),
  gaugePitch: document.getElementById('gauge-pitch'),
  gaugeRoll: document.getElementById('gauge-roll'),
  valYaw: document.getElementById('val-yaw'),
  valPitch: document.getElementById('val-pitch'),
  valRoll: document.getElementById('val-roll'),
  valSmile: document.getElementById('val-smile'),
  barSmile: document.getElementById('bar-smile'),
  valJaw: document.getElementById('val-jaw'),
  barJaw: document.getElementById('bar-jaw'),
  badgeEyeLeft: document.getElementById('badge-eye-left'),
  badgeEyeRight: document.getElementById('badge-eye-right'),
  badgeAttention: document.getElementById('badge-attention'),
  valEmotion: document.getElementById('val-emotion'),
  valDimensions: document.getElementById('val-dimensions'),
  valAspect: document.getElementById('val-aspect'),
  valOrigin: document.getElementById('val-origin'),

  // Bottom Snapshot Gallery
  galleryCountChip: document.getElementById('gallery-count-chip'),
  snapshotDeck: document.getElementById('snapshot-deck'),
  btnExportJson: document.getElementById('btn-export-json'),
  btnClearGallery: document.getElementById('btn-clear-gallery')
};

// Initialize Renderer
const renderer = new BiometricRenderer(elements.canvas);

/**
 * Bootstraps the application, downloads vision models, and binds UI listeners
 */
async function initializeApp() {
  loadStoredSnapshots();
  bindEventListeners();

  try {
    elements.loaderText.textContent = 'INITIALIZING BIOMETRIC NEURAL ENGINE...';
    await biometricDetector.init((status) => {
      elements.loaderText.textContent = status.toUpperCase();
    });

    elements.engineStatus.textContent = `ONLINE (${biometricDetector.delegate})`;
    elements.engineDot.className = 'pill-dot status-ready';

    // Hide loader
    elements.loader.classList.add('hidden');

    // Try starting camera; if unavailable, fallback smoothly to photo mode
    await startCamera();
  } catch (err) {
    console.warn('Initialization error, falling back to static photo mode:', err);
    elements.loader.classList.add('hidden');
    elements.engineStatus.textContent = 'OFFLINE MODE';
    elements.engineDot.className = 'pill-dot status-warn';
    switchToUploadMode('/samples/portrait1.jpg');
  }
}

/**
 * Camera Stream Management
 */
async function startCamera() {
  if (state.isCameraRunning) return;

  try {
    elements.loader.classList.remove('hidden');
    elements.loaderText.textContent = 'CONNECTING TO VIDEO DEVICE...';

    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.currentStream = stream;
    elements.video.srcObject = stream;

    await new Promise((resolve) => {
      elements.video.onloadedmetadata = () => {
        elements.video.play();
        resolve();
      };
    });

    state.isCameraRunning = true;
    state.mode = 'WEBCAM';
    await biometricDetector.setRunningMode('VIDEO');

    // Update UI
    elements.video.style.display = 'block';
    elements.staticImg.style.display = 'none';
    elements.dropzone.classList.add('hidden');
    elements.cameraControls.style.display = 'flex';
    elements.cameraStatusDot.className = 'status-indicator live';
    elements.cameraBtnText.textContent = 'STOP FEED';
    elements.tabWebcam.classList.add('active');
    elements.tabUpload.classList.remove('active');

    if (state.isMirrored) {
      elements.video.classList.add('mirrored');
    } else {
      elements.video.classList.remove('mirrored');
    }

    syncCanvasDimensions(elements.video.videoWidth, elements.video.videoHeight);
    elements.loader.classList.add('hidden');

    // Start video detection loop
    requestAnimationFrame(renderVideoLoop);
  } catch (err) {
    console.warn('Camera access denied or unavailable:', err);
    elements.loader.classList.add('hidden');
    state.isCameraRunning = false;
    elements.cameraStatusDot.className = 'status-indicator';
    elements.cameraBtnText.textContent = 'START FEED';
    // Fallback to photo mode with sample portrait
    switchToUploadMode('/samples/portrait1.jpg');
  }
}

function stopCamera() {
  if (state.currentStream) {
    state.currentStream.getTracks().forEach((t) => t.stop());
    state.currentStream = null;
  }
  state.isCameraRunning = false;
  elements.cameraStatusDot.className = 'status-indicator';
  elements.cameraBtnText.textContent = 'START FEED';
}

/**
 * Continuous Video Detection & Rendering Loop
 */
let lastVideoTime = -1;
function renderVideoLoop() {
  if (state.mode !== 'WEBCAM' || !state.isCameraRunning) return;

  const now = performance.now();

  // Calculate Rolling FPS
  state.frameCount++;
  if (now - state.lastFpsTimestamp >= 500) {
    state.fps = Math.round((state.frameCount * 1000) / (now - state.lastFpsTimestamp));
    elements.fpsCounter.textContent = String(state.fps).padStart(2, '0');
    state.frameCount = 0;
    state.lastFpsTimestamp = now;
  }

  if (elements.video.readyState >= 2) {
    if (elements.video.currentTime !== lastVideoTime) {
      lastVideoTime = elements.video.currentTime;

      // Run inference
      const result = biometricDetector.detectVideo(elements.video, now);
      if (result) {
        state.lastDetectionResult = result;
        handleDetectionResults(result);
      }
    }

    // Render Canvas overlays
    renderer.setStyles({
      boxStyle: state.boxStyle,
      meshStyle: state.meshStyle,
      showScanline: state.showScanline,
      selectedFaceIndex: state.activeFaceIndex
    });

    renderer.render(
      state.lastDetectionResult,
      elements.video.videoWidth,
      elements.video.videoHeight,
      biometricDetector.connections
    );
  }

  requestAnimationFrame(renderVideoLoop);
}

/**
 * Photo Upload & Sample Image Processing
 */
async function switchToUploadMode(imageUrl = null) {
  stopCamera();
  state.mode = 'IMAGE';
  await biometricDetector.setRunningMode('IMAGE');

  elements.tabWebcam.classList.remove('active');
  elements.tabUpload.classList.add('active');
  elements.cameraControls.style.display = 'none';
  elements.video.style.display = 'none';

  if (imageUrl) {
    loadAndAnalyzeImage(imageUrl);
  } else {
    elements.staticImg.style.display = 'none';
    elements.dropzone.classList.remove('hidden');
    renderer.clear();
    resetTelemetryDisplay();
  }
}

function loadAndAnalyzeImage(src) {
  elements.loader.classList.remove('hidden');
  elements.loaderText.textContent = 'ANALYZING TARGET IMAGE...';
  elements.dropzone.classList.add('hidden');
  elements.staticImg.style.display = 'block';

  elements.staticImg.onload = async () => {
    syncCanvasDimensions(elements.staticImg.naturalWidth, elements.staticImg.naturalHeight);

    // Run static detection
    const result = biometricDetector.detectImage(elements.staticImg);
    state.lastDetectionResult = result;
    handleDetectionResults(result);

    // Render overlays
    renderer.setStyles({
      boxStyle: state.boxStyle,
      meshStyle: state.meshStyle,
      showScanline: false,
      selectedFaceIndex: state.activeFaceIndex
    });

    renderer.render(
      result,
      elements.staticImg.naturalWidth,
      elements.staticImg.naturalHeight,
      biometricDetector.connections
    );

    elements.loader.classList.add('hidden');
    elements.fpsCounter.textContent = 'ST';
  };

  elements.staticImg.onerror = () => {
    elements.loader.classList.add('hidden');
    alert('Failed to load image. Please select a valid photo file.');
  };

  elements.staticImg.src = src;
}

/**
 * Synchronize canvas resolution and viewport container aspect ratio
 */
function syncCanvasDimensions(width, height) {
  if (!width || !height) return;
  elements.canvas.width = width;
  elements.canvas.height = height;

  // Set container aspect ratio for pixel-perfect overlay
  elements.mediaContainer.style.aspectRatio = `${width} / ${height}`;
}

/**
 * Handle Telemetry & HUD updates when results arrive
 */
function handleDetectionResults(result) {
  if (!result) return;

  const faces = result.faces || [];
  elements.faceCountPill.textContent = String(faces.length);
  elements.faceCountBadge.textContent = `${faces.length} TARGET${faces.length === 1 ? '' : 'S'}`;
  elements.latencyCounter.textContent = `${result.latency} ms`;

  // Sound cue on newly acquired target
  if (faces.length > 0 && state.previousFaceCount === 0) {
    biometricAudio.playLockTone();
  }
  state.previousFaceCount = faces.length;

  // Clamp active index
  if (state.activeFaceIndex >= faces.length) {
    state.activeFaceIndex = 0;
  }

  // Render Target Selector Chips
  renderFaceChips(faces);

  // Update Biometric Gauges for Selected Face
  if (faces.length > 0) {
    const face = faces[state.activeFaceIndex] || faces[0];
    updateTelemetryHUD(face);
  } else {
    resetTelemetryDisplay();
  }
}

/**
 * Render Face Target Chips in Sidebar
 */
function renderFaceChips(faces) {
  elements.faceChipsContainer.innerHTML = '';

  if (faces.length === 0) {
    elements.faceChipsContainer.innerHTML = '<div class="empty-roster-msg">Searching for biometric targets...</div>';
    return;
  }

  faces.forEach((face, idx) => {
    const chip = document.createElement('button');
    chip.className = `face-target-chip ${idx === state.activeFaceIndex ? 'active' : ''}`;
    chip.innerHTML = `
      <span class="pill-dot status-ready"></span>
      <span>${face.id} ${idx === 0 ? '(Primary)' : ''}</span>
      <span class="text-cyan">${face.confidence}%</span>
    `;

    chip.addEventListener('click', () => {
      state.activeFaceIndex = idx;
      biometricAudio.playClick();
      document.querySelectorAll('.face-target-chip').forEach((c, i) => {
        c.classList.toggle('active', i === idx);
      });
      updateTelemetryHUD(face);
      // Re-render overlays with updated selection
      if (state.mode === 'IMAGE' && elements.staticImg.naturalWidth) {
        renderer.setStyles({ selectedFaceIndex: idx });
        renderer.render(
          state.lastDetectionResult,
          elements.staticImg.naturalWidth,
          elements.staticImg.naturalHeight,
          biometricDetector.connections
        );
      }
    });

    elements.faceChipsContainer.appendChild(chip);
  });
}

/**
 * Update Sidebar Gauges for Active Target
 */
function updateTelemetryHUD(face) {
  elements.activeTargetId.textContent = `TARGET: ${face.id}`;

  // Confidence
  elements.metricConfidence.textContent = `${face.confidence}%`;
  elements.barConfidence.style.width = `${face.confidence}%`;

  // 3D Head Pose
  const yaw = face.pose.yaw;
  const pitch = face.pose.pitch;
  const roll = face.pose.roll;

  elements.valYaw.textContent = `${yaw > 0 ? '+' : ''}${yaw}°`;
  elements.valPitch.textContent = `${pitch > 0 ? '+' : ''}${pitch}°`;
  elements.valRoll.textContent = `${roll > 0 ? '+' : ''}${roll}°`;

  // Map [-90, +90] to [0%, 100%]
  elements.gaugeYaw.style.left = `${Math.min(100, Math.max(0, 50 + (yaw / 90) * 50))}%`;
  elements.gaugePitch.style.left = `${Math.min(100, Math.max(0, 50 + (pitch / 90) * 50))}%`;
  elements.gaugeRoll.style.left = `${Math.min(100, Math.max(0, 50 + (roll / 90) * 50))}%`;

  // Expressions & Blendshapes
  const exp = face.expressions;
  elements.valSmile.textContent = `${exp.smile}%`;
  elements.barSmile.style.width = `${exp.smile}%`;

  elements.valJaw.textContent = `${exp.jawOpen}%`;
  elements.barJaw.style.width = `${exp.jawOpen}%`;

  // Eye Blink Status
  const isLeftClosed = exp.leftBlink > 55;
  const isRightClosed = exp.rightBlink > 55;

  elements.badgeEyeLeft.textContent = isLeftClosed ? 'CLOSED' : 'OPEN';
  elements.badgeEyeLeft.className = `blink-badge ${isLeftClosed ? 'closed' : 'open'}`;

  elements.badgeEyeRight.textContent = isRightClosed ? 'CLOSED' : 'OPEN';
  elements.badgeEyeRight.className = `blink-badge ${isRightClosed ? 'closed' : 'open'}`;

  elements.badgeAttention.textContent = exp.attention.toUpperCase();
  elements.badgeAttention.className = `blink-badge ${exp.attention === 'Attentive' ? 'attentive' : 'drowsy'}`;

  elements.valEmotion.textContent = exp.emotion.toUpperCase();

  // Bounding Geometry
  elements.valDimensions.textContent = `${face.boxPx.width} x ${face.boxPx.height} px`;
  elements.valAspect.textContent = `${face.geometry.aspectRatio}`;
  elements.valOrigin.textContent = `${face.boxPx.x}, ${face.boxPx.y}`;
}

/**
 * Reset Sidebar Telemetry to idle state
 */
function resetTelemetryDisplay() {
  elements.activeTargetId.textContent = 'NO TARGET';
  elements.metricConfidence.textContent = '0.0%';
  elements.barConfidence.style.width = '0%';

  elements.valYaw.textContent = '0.0°';
  elements.valPitch.textContent = '0.0°';
  elements.valRoll.textContent = '0.0°';
  elements.gaugeYaw.style.left = '50%';
  elements.gaugePitch.style.left = '50%';
  elements.gaugeRoll.style.left = '50%';

  elements.valSmile.textContent = '0%';
  elements.barSmile.style.width = '0%';
  elements.valJaw.textContent = '0%';
  elements.barJaw.style.width = '0%';

  elements.badgeEyeLeft.textContent = 'OPEN';
  elements.badgeEyeLeft.className = 'blink-badge open';
  elements.badgeEyeRight.textContent = 'OPEN';
  elements.badgeEyeRight.className = 'blink-badge open';

  elements.badgeAttention.textContent = 'WAITING';
  elements.badgeAttention.className = 'blink-badge attentive';
  elements.valEmotion.textContent = 'WAITING FOR TARGET';

  elements.valDimensions.textContent = '0 x 0 px';
  elements.valAspect.textContent = '1.00';
  elements.valOrigin.textContent = '0, 0';
}

/**
 * Capture High-Res Annotated Snapshot
 */
function captureSnapshot() {
  const source = state.mode === 'WEBCAM' ? elements.video : elements.staticImg;
  const hasContent =
    (state.mode === 'WEBCAM' && state.isCameraRunning && elements.video.videoWidth > 0) ||
    (state.mode === 'IMAGE' && elements.staticImg.naturalWidth > 0);

  if (!hasContent) {
    alert('Please start the camera feed or upload a photo before taking a snapshot.');
    return;
  }

  biometricAudio.playShutter();

  const timestamp = new Date().toISOString();
  const dateFormatted = new Date().toLocaleTimeString();

  // Export full annotated image
  const annotatedDataUrl = renderer.exportAnnotatedSnapshot(
    source,
    state.lastDetectionResult,
    biometricDetector.connections
  );

  // Generate thumbnail avatar of primary face (or center thumbnail if no face)
  const primaryFace = state.lastDetectionResult?.faces?.[0];
  let avatarUrl = '';
  if (primaryFace) {
    avatarUrl = renderer.cropFaceAvatar(source, primaryFace.boxPx);
  }

  const snapshotItem = {
    id: `SNAP-${Date.now()}`,
    timestamp,
    dateFormatted,
    image: annotatedDataUrl,
    avatar: avatarUrl || annotatedDataUrl,
    facesCount: state.lastDetectionResult?.faceCount || 0,
    faces: state.lastDetectionResult?.faces || [],
    latency: state.lastDetectionResult?.latency || 0,
    emotion: primaryFace?.expressions?.emotion || 'Unknown',
    confidence: primaryFace?.confidence || 0
  };

  state.snapshots.unshift(snapshotItem);
  saveStoredSnapshots();
  renderSnapshotDeck();
}

/**
 * Render Snapshot Deck in bottom gallery
 */
function renderSnapshotDeck() {
  elements.galleryCountChip.textContent = `${state.snapshots.length} SAVED`;
  elements.snapshotDeck.innerHTML = '';

  if (state.snapshots.length === 0) {
    elements.snapshotDeck.innerHTML = `
      <div class="empty-deck-state" id="empty-deck-msg">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>No biometric snapshots captured yet. Press <strong>CAPTURE SNAPSHOT</strong> or hit <kbd>SPACE</kbd> to record a frame.</span>
      </div>
    `;
    return;
  }

  state.snapshots.forEach((snap, idx) => {
    const card = document.createElement('div');
    card.className = 'snapshot-card';
    card.innerHTML = `
      <div class="snapshot-thumb-wrap">
        <img class="snapshot-thumb" src="${snap.image}" alt="Snapshot ${snap.id}" loading="lazy" />
        <span class="snapshot-stamp">${snap.dateFormatted}</span>
      </div>
      <div class="snapshot-meta">
        <span class="text-cyan">${snap.facesCount} Face${snap.facesCount === 1 ? '' : 's'}</span>
        <span class="text-emerald">${snap.emotion}</span>
        <span>${snap.confidence}%</span>
      </div>
      <div class="snapshot-card-actions">
        <button class="btn-card-action" data-action="download" data-index="${idx}" title="Download Annotated Image">
          DOWNLOAD
        </button>
        <button class="btn-card-delete" data-action="delete" data-index="${idx}" title="Delete Snapshot">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Action clicks
    card.querySelector('[data-action="download"]').addEventListener('click', () => {
      downloadSnapshotImage(snap);
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      state.snapshots.splice(idx, 1);
      saveStoredSnapshots();
      renderSnapshotDeck();
    });

    elements.snapshotDeck.appendChild(card);
  });
}

function downloadSnapshotImage(snap) {
  const link = document.createElement('a');
  link.download = `AegisVision_${snap.id}.png`;
  link.href = snap.image;
  link.click();
}

function exportJsonReport() {
  if (state.snapshots.length === 0) {
    alert('No snapshots available to export. Capture at least one snapshot first.');
    return;
  }

  const exportData = {
    application: 'AegisVision Biometric Studio',
    version: '2.5',
    exportTimestamp: new Date().toISOString(),
    totalSnapshots: state.snapshots.length,
    records: state.snapshots.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      facesDetected: s.facesCount,
      inferenceLatencyMs: s.latency,
      faces: s.faces.map((f) => ({
        id: f.id,
        confidence: f.confidence,
        boxPx: f.boxPx,
        pose: f.pose,
        expressions: f.expressions,
        geometry: f.geometry
      }))
    }))
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = `Biometric_Telemetry_Report_${Date.now()}.json`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

function saveStoredSnapshots() {
  try {
    // Keep max 15 snapshots in localStorage to prevent quota exhaustion
    const trimmed = state.snapshots.slice(0, 15);
    localStorage.setItem('aegis_snapshots', JSON.stringify(trimmed));
  } catch {
    // Quota exceeded safe fallback
  }
}

function loadStoredSnapshots() {
  try {
    const raw = localStorage.getItem('aegis_snapshots');
    if (raw) {
      state.snapshots = JSON.parse(raw);
      renderSnapshotDeck();
    }
  } catch {
    state.snapshots = [];
  }
}

/**
 * Event Listeners & User Interactions
 */
function bindEventListeners() {
  // Mode Tabs
  elements.tabWebcam.addEventListener('click', () => {
    biometricAudio.playClick();
    startCamera();
  });

  elements.tabUpload.addEventListener('click', () => {
    biometricAudio.playClick();
    switchToUploadMode();
  });

  // Sample Buttons
  elements.sampleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      biometricAudio.playClick();
      const samplePath = btn.getAttribute('data-sample');
      switchToUploadMode(samplePath);
    });
  });

  // Camera Controls
  elements.btnToggleCamera.addEventListener('click', () => {
    biometricAudio.playClick();
    if (state.isCameraRunning) {
      stopCamera();
    } else {
      startCamera();
    }
  });

  elements.btnFlipCamera.addEventListener('click', () => {
    biometricAudio.playClick();
    state.isMirrored = !state.isMirrored;
    elements.video.classList.toggle('mirrored', state.isMirrored);
  });

  // Capture Snapshot Button
  elements.btnCaptureSnapshot.addEventListener('click', () => {
    captureSnapshot();
  });

  // Box Style Selector Pills
  document.querySelectorAll('#box-style-selector .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      biometricAudio.playClick();
      document.querySelectorAll('#box-style-selector .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.boxStyle = btn.getAttribute('data-style');

      if (state.mode === 'IMAGE' && elements.staticImg.naturalWidth) {
        renderer.setStyles({ boxStyle: state.boxStyle });
        renderer.render(
          state.lastDetectionResult,
          elements.staticImg.naturalWidth,
          elements.staticImg.naturalHeight,
          biometricDetector.connections
        );
      }
    });
  });

  // Mesh Style Selector Pills
  document.querySelectorAll('#mesh-style-selector .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      biometricAudio.playClick();
      document.querySelectorAll('#mesh-style-selector .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.meshStyle = btn.getAttribute('data-mesh');

      if (state.mode === 'IMAGE' && elements.staticImg.naturalWidth) {
        renderer.setStyles({ meshStyle: state.meshStyle });
        renderer.render(
          state.lastDetectionResult,
          elements.staticImg.naturalWidth,
          elements.staticImg.naturalHeight,
          biometricDetector.connections
        );
      }
    });
  });

  // Hologram Scanline Toggle
  elements.toggleScanline.addEventListener('click', () => {
    biometricAudio.playClick();
    state.showScanline = !state.showScanline;
    elements.toggleScanline.classList.toggle('active', state.showScanline);
  });

  // Sound FX Toggle
  elements.btnSoundToggle.addEventListener('click', () => {
    const isMuted = !biometricAudio.isMuted();
    biometricAudio.setMuted(isMuted);
    elements.btnSoundToggle.classList.toggle('muted', isMuted);
    if (!isMuted) biometricAudio.playClick();
  });

  // Fullscreen Toggle
  elements.btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // File Upload Drag & Drop
  elements.btnBrowseFile.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => {
        loadAndAnalyzeImage(re.target.result);
      };
      reader.readAsDataURL(file);
    }
  });

  // Drag events
  ['dragenter', 'dragover'].forEach((eventName) => {
    elements.viewportStage.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.dropzone.classList.remove('hidden');
      elements.dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    elements.viewportStage.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.dropzone.classList.remove('dragover');
    });
  });

  elements.viewportStage.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      switchToUploadMode();
      const reader = new FileReader();
      reader.onload = (re) => {
        loadAndAnalyzeImage(re.target.result);
      };
      reader.readAsDataURL(file);
    }
  });

  // Gallery Export & Clear
  elements.btnExportJson.addEventListener('click', () => {
    biometricAudio.playClick();
    exportJsonReport();
  });

  elements.btnClearGallery.addEventListener('click', () => {
    if (confirm('Clear all captured biometric snapshots?')) {
      state.snapshots = [];
      saveStoredSnapshots();
      renderSnapshotDeck();
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      captureSnapshot();
    } else if (e.key === 'm' || e.key === 'M') {
      state.isMirrored = !state.isMirrored;
      elements.video.classList.toggle('mirrored', state.isMirrored);
    } else if (e.key === 's' || e.key === 'S') {
      const isMuted = !biometricAudio.isMuted();
      biometricAudio.setMuted(isMuted);
      elements.btnSoundToggle.classList.toggle('muted', isMuted);
    }
  });
}

// Start application on load
window.addEventListener('DOMContentLoaded', initializeApp);
