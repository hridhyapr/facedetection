/**
 * Biometric HUD Visual Renderer
 * Hardware-accelerated Canvas rendering for Bounding Boxes, 3D Mesh, Contours, and Telemetry
 */

export class BiometricRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scanlineY = 0;
    this.scanlineSpeed = 3;
    this.showScanline = true;
    this.boxStyle = 'tactical'; // 'tactical' | 'neon' | 'minimal' | 'privacy'
    this.meshStyle = 'contours'; // 'mesh' | 'contours' | 'iris' | 'keypoints' | 'off'
    this.primaryColor = '#00f2fe';
    this.secondaryColor = '#00f5a0';
    this.alertColor = '#ff2a5f';
    this.selectedFaceIndex = 0;
  }

  setStyles({ boxStyle, meshStyle, showScanline, selectedFaceIndex }) {
    if (boxStyle !== undefined) this.boxStyle = boxStyle;
    if (meshStyle !== undefined) this.meshStyle = meshStyle;
    if (showScanline !== undefined) this.showScanline = showScanline;
    if (selectedFaceIndex !== undefined) this.selectedFaceIndex = selectedFaceIndex;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(detectionResult, sourceWidth, sourceHeight, connections) {
    this.clear();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (!detectionResult || !detectionResult.faces || detectionResult.faces.length === 0) {
      // If scanline enabled, still sweep when searching
      if (this.showScanline) {
        this.drawScanline(w, h, 'searching');
      }
      return;
    }

    const faces = detectionResult.faces;

    // 1. Draw Mesh / Landmarks first (beneath boxes)
    faces.forEach((face, idx) => {
      const isSelected = idx === this.selectedFaceIndex;
      this.drawLandmarks(face, w, h, connections, isSelected);
    });

    // 2. Draw Bounding Boxes
    faces.forEach((face, idx) => {
      const isSelected = idx === this.selectedFaceIndex;
      this.drawBoundingBox(face, w, h, isSelected);
    });

    // 3. Draw Holographic Scanline
    if (this.showScanline) {
      this.drawScanline(w, h, 'locked');
    }
  }

  // Draw Bounding Box based on current style
  drawBoundingBox(face, canvasW, canvasH, isSelected) {
    const ctx = this.ctx;
    const b = face.boxNorm;
    const x = b.x * canvasW;
    const y = b.y * canvasH;
    const bw = b.width * canvasW;
    const bh = b.height * canvasH;

    const mainColor = isSelected ? this.primaryColor : 'rgba(0, 242, 254, 0.7)';
    const accentColor = isSelected ? this.secondaryColor : 'rgba(0, 245, 160, 0.7)';

    if (this.boxStyle === 'privacy') {
      this.drawPrivacyShield(x, y, bw, bh, face);
      return;
    }

    if (this.boxStyle === 'minimal') {
      ctx.save();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.shadowColor = mainColor;
      ctx.shadowBlur = isSelected ? 8 : 4;
      ctx.strokeRect(x, y, bw, bh);

      // Pill Tag
      const tagText = `${face.id} • ${face.confidence}%`;
      ctx.font = '600 11px "Inter", sans-serif';
      const textMetrics = ctx.measureText(tagText);
      const tagW = textMetrics.width + 16;
      const tagH = 20;

      ctx.fillStyle = 'rgba(8, 12, 20, 0.85)';
      ctx.fillRect(x, Math.max(0, y - tagH - 4), tagW, tagH);
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, Math.max(0, y - tagH - 4), tagW, tagH);

      ctx.fillStyle = mainColor;
      ctx.fillText(tagText, x + 8, Math.max(0, y - tagH - 4) + 14);
      ctx.restore();
      return;
    }

    if (this.boxStyle === 'neon') {
      ctx.save();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.shadowColor = mainColor;
      ctx.shadowBlur = isSelected ? 16 : 8;

      // Rounded Neon Box
      this.roundRect(ctx, x, y, bw, bh, 8);
      ctx.stroke();

      // Ambient glow fill
      ctx.fillStyle = isSelected ? 'rgba(0, 242, 254, 0.08)' : 'rgba(0, 242, 254, 0.03)';
      ctx.fill();

      // Header Tag
      const tagText = `${face.id} [${face.confidence}%] ${face.expressions.emotion}`;
      ctx.font = '700 11px "Orbitron", monospace';
      ctx.fillStyle = mainColor;
      ctx.fillText(tagText, x + 6, Math.max(16, y - 6));
      ctx.restore();
      return;
    }

    // Default: 'tactical' (Cyberpunk Biometric HUD)
    ctx.save();
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = isSelected ? 10 : 4;

    // Ambient interior wash
    ctx.fillStyle = isSelected ? 'rgba(0, 242, 254, 0.05)' : 'rgba(0, 242, 254, 0.02)';
    ctx.fillRect(x, y, bw, bh);

    // Corner brackets length
    const corner = Math.min(24, bw * 0.2, bh * 0.2);

    ctx.beginPath();
    // Top-Left
    ctx.moveTo(x, y + corner);
    ctx.lineTo(x, y);
    ctx.lineTo(x + corner, y);

    // Top-Right
    ctx.moveTo(x + bw - corner, y);
    ctx.lineTo(x + bw, y);
    ctx.lineTo(x + bw, y + corner);

    // Bottom-Right
    ctx.moveTo(x + bw, y + bh - corner);
    ctx.lineTo(x + bw, y + bh);
    ctx.lineTo(x + bw - corner, y + bh);

    // Bottom-Left
    ctx.moveTo(x + corner, y + bh);
    ctx.lineTo(x, y + bh);
    ctx.lineTo(x, y + bh - corner);
    ctx.stroke();

    // Center Crosshair Reticle
    const cx = x + bw / 2;
    const cy = y + bh / 2;
    const reticleLen = 6;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - reticleLen, cy);
    ctx.lineTo(cx + reticleLen, cy);
    ctx.moveTo(cx, cy - reticleLen);
    ctx.lineTo(cx, cy + reticleLen);
    ctx.stroke();

    // Center targeting circle
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.stroke();

    // Tactical HUD Info Badge
    const tagText = `${face.id} // CONF: ${face.confidence}%`;
    const subText = `POSE Y:${face.pose.yaw}° P:${face.pose.pitch}°`;
    ctx.font = '700 10px "Orbitron", monospace';
    const tagW = Math.max(ctx.measureText(tagText).width, ctx.measureText(subText).width) + 16;
    const tagH = 28;

    const badgeY = y > tagH + 6 ? y - tagH - 4 : y + bh + 4;

    ctx.fillStyle = 'rgba(10, 16, 26, 0.9)';
    ctx.fillRect(x, badgeY, tagW, tagH);
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, badgeY, tagW, tagH);

    // Accent line on badge
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, badgeY, 3, tagH);

    // Text labels
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, x + 8, badgeY + 12);
    ctx.fillStyle = accentColor;
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillText(subText, x + 8, badgeY + 23);

    // Dimension tick marks at bottom right of box
    const dimText = `${face.boxPx.width}x${face.boxPx.height}px`;
    ctx.fillStyle = 'rgba(0, 242, 254, 0.7)';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillText(dimText, x + bw - ctx.measureText(dimText).width - 4, y + bh - 4);

    ctx.restore();
  }

  // Draw Privacy Shield (Face Anonymization)
  drawPrivacyShield(x, y, bw, bh, face) {
    const ctx = this.ctx;
    ctx.save();

    // Elliptical blur / pixel shield
    const cx = x + bw / 2;
    const cy = y + bh / 2;
    const rx = bw * 0.48;
    const ry = bh * 0.52;

    // Dark mosaic mask
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();

    // High-tech mosaic grid
    const gridSize = 14;
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.15)';
    ctx.lineWidth = 1;
    for (let gx = x; gx < x + bw; gx += gridSize) {
      for (let gy = y; gy < y + bh; gy += gridSize) {
        ctx.fillStyle = ((gx + gy) / gridSize) % 2 === 0 ? 'rgba(30, 41, 59, 0.9)' : 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(gx, gy, gridSize, gridSize);
        ctx.strokeRect(gx, gy, gridSize, gridSize);
      }
    }
    ctx.restore();

    // Shield Border
    ctx.strokeStyle = this.alertColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = this.alertColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Badge
    const label = `ANONYMIZED // ${face.id}`;
    ctx.font = '700 10px "Orbitron", monospace';
    const lw = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(255, 42, 95, 0.9)';
    ctx.fillRect(cx - lw / 2, cy - 10, lw, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx - lw / 2 + 8, cy + 4);

    ctx.restore();
  }

  // Draw Landmarks / Mesh based on current meshStyle
  drawLandmarks(face, canvasW, canvasH, connections, isSelected) {
    if (this.meshStyle === 'off' || this.boxStyle === 'privacy') return;
    const ctx = this.ctx;
    const landmarks = face.landmarks;
    if (!landmarks || landmarks.length === 0) return;

    ctx.save();

    // 1. Full 3D Tesselation Mesh
    if (this.meshStyle === 'mesh' && connections && connections.tesselation) {
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = isSelected ? 'rgba(0, 242, 254, 0.35)' : 'rgba(0, 242, 254, 0.18)';
      ctx.beginPath();
      for (const edge of connections.tesselation) {
        const p1 = landmarks[edge.start];
        const p2 = landmarks[edge.end];
        if (p1 && p2) {
          ctx.moveTo(p1.x * canvasW, p1.y * canvasH);
          ctx.lineTo(p2.x * canvasW, p2.y * canvasH);
        }
      }
      ctx.stroke();

      // Draw key glowing vertices
      ctx.fillStyle = this.secondaryColor;
      for (let i = 0; i < landmarks.length; i += 8) {
        const p = landmarks[i];
        ctx.beginPath();
        ctx.arc(p.x * canvasW, p.y * canvasH, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Contours (Eyes, Lips, Eyebrows, Face Oval)
    if (this.meshStyle === 'contours' || this.meshStyle === 'mesh') {
      const contourGroups = [
        { conns: connections?.faceOval, color: isSelected ? 'rgba(0, 242, 254, 0.6)' : 'rgba(0, 242, 254, 0.3)', width: 1.2 },
        { conns: connections?.leftEye, color: this.secondaryColor, width: 1.5 },
        { conns: connections?.rightEye, color: this.secondaryColor, width: 1.5 },
        { conns: connections?.leftEyebrow, color: 'rgba(0, 242, 254, 0.8)', width: 1.2 },
        { conns: connections?.rightEyebrow, color: 'rgba(0, 242, 254, 0.8)', width: 1.2 },
        { conns: connections?.lips, color: 'rgba(255, 42, 95, 0.75)', width: 1.5 }
      ];

      for (const group of contourGroups) {
        if (!group.conns) continue;
        ctx.strokeStyle = group.color;
        ctx.lineWidth = group.width;
        ctx.beginPath();
        for (const edge of group.conns) {
          const p1 = landmarks[edge.start];
          const p2 = landmarks[edge.end];
          if (p1 && p2) {
            ctx.moveTo(p1.x * canvasW, p1.y * canvasH);
            ctx.lineTo(p2.x * canvasW, p2.y * canvasH);
          }
        }
        ctx.stroke();
      }
    }

    // 3. Iris & Gaze Tracking
    if (this.meshStyle === 'iris' || this.meshStyle === 'contours' || this.meshStyle === 'mesh') {
      const irisPoints = [
        { pt: face.keypoints.leftIris, label: 'L' },
        { pt: face.keypoints.rightIris, label: 'R' }
      ];

      irisPoints.forEach(({ pt }) => {
        if (!pt) return;
        const px = pt.x * canvasW;
        const py = pt.y * canvasH;

        ctx.strokeStyle = this.secondaryColor;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = this.secondaryColor;
        ctx.shadowBlur = 6;

        // Iris target ring
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Gaze projection line based on head yaw & pitch
        if (this.meshStyle === 'iris') {
          const gazeLen = 28;
          const gazeDx = Math.sin((face.pose.yaw * Math.PI) / 180) * gazeLen;
          const gazeDy = -Math.sin((face.pose.pitch * Math.PI) / 180) * gazeLen;

          ctx.strokeStyle = this.primaryColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + gazeDx, py + gazeDy);
          ctx.stroke();

          ctx.fillStyle = this.primaryColor;
          ctx.beginPath();
          ctx.arc(px + gazeDx, py + gazeDy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 4. Primary Keypoints
    if (this.meshStyle === 'keypoints') {
      const pts = [
        face.keypoints.noseTip,
        face.keypoints.leftEye,
        face.keypoints.rightEye,
        face.keypoints.leftMouth,
        face.keypoints.rightMouth,
        face.keypoints.chin
      ];

      pts.forEach(pt => {
        if (!pt) return;
        const px = pt.x * canvasW;
        const py = pt.y * canvasH;

        ctx.strokeStyle = this.primaryColor;
        ctx.fillStyle = this.secondaryColor;
        ctx.lineWidth = 1;
        ctx.shadowColor = this.secondaryColor;
        ctx.shadowBlur = 8;

        // Diamond node
        ctx.beginPath();
        ctx.moveTo(px, py - 4);
        ctx.lineTo(px + 4, py);
        ctx.lineTo(px, py + 4);
        ctx.lineTo(px - 4, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
    }

    ctx.restore();
  }

  // Holographic sweeping scanline
  drawScanline(w, h, status = 'locked') {
    const ctx = this.ctx;
    this.scanlineY += this.scanlineSpeed;
    if (this.scanlineY > h) {
      this.scanlineY = 0;
    }

    ctx.save();
    const grad = ctx.createLinearGradient(0, this.scanlineY - 30, 0, this.scanlineY);
    const beamColor = status === 'locked' ? 'rgba(0, 242, 254, ' : 'rgba(0, 245, 160, ';
    grad.addColorStop(0, `${beamColor}0)`);
    grad.addColorStop(0.85, `${beamColor}0.15)`);
    grad.addColorStop(1, `${beamColor}0.6)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, Math.max(0, this.scanlineY - 30), w, 30);

    // Laser edge line
    ctx.strokeStyle = status === 'locked' ? this.primaryColor : this.secondaryColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, this.scanlineY);
    ctx.lineTo(w, this.scanlineY);
    ctx.stroke();

    ctx.restore();
  }

  // Helper for rounded rectangle
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Create High-Res Annotated Snapshot
  exportAnnotatedSnapshot(sourceElement, detectionResult, connections) {
    const sw = sourceElement.videoWidth || sourceElement.naturalWidth || sourceElement.width;
    const sh = sourceElement.videoHeight || sourceElement.naturalHeight || sourceElement.height;

    const offscreen = document.createElement('canvas');
    offscreen.width = sw;
    offscreen.height = sh;
    const offCtx = offscreen.getContext('2d');

    // 1. Draw base video/image
    offCtx.drawImage(sourceElement, 0, 0, sw, sh);

    // 2. Temporarily render overlays onto offscreen canvas
    const tempRenderer = new BiometricRenderer(offscreen);
    tempRenderer.setStyles({
      boxStyle: this.boxStyle,
      meshStyle: this.meshStyle,
      showScanline: false,
      selectedFaceIndex: this.selectedFaceIndex
    });
    tempRenderer.render(detectionResult, sw, sh, connections);

    // 3. Draw Watermark & Telemetry Banner
    const bannerH = 40;
    offCtx.fillStyle = 'rgba(8, 12, 20, 0.88)';
    offCtx.fillRect(0, sh - bannerH, sw, bannerH);
    offCtx.strokeStyle = this.primaryColor;
    offCtx.lineWidth = 1;
    offCtx.beginPath();
    offCtx.moveTo(0, sh - bannerH);
    offCtx.lineTo(sw, sh - bannerH);
    offCtx.stroke();

    const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const facesFound = detectionResult?.faceCount || 0;

    offCtx.font = '700 12px "Orbitron", monospace';
    offCtx.fillStyle = this.primaryColor;
    offCtx.fillText(`AEGIS-VISION BIOMETRIC SCAN`, 16, sh - 16);

    offCtx.font = '600 11px "JetBrains Mono", monospace';
    offCtx.fillStyle = this.secondaryColor;
    offCtx.fillText(`// FACES: ${facesFound} // LATENCY: ${detectionResult?.latency || 0}ms // UTC: ${dateStr}`, 240, sh - 16);

    return offscreen.toDataURL('image/png');
  }

  // Crop face to square avatar for thumbnail chips
  cropFaceAvatar(sourceElement, boxPx) {
    const avatarCanvas = document.createElement('canvas');
    const size = 128;
    avatarCanvas.width = size;
    avatarCanvas.height = size;
    const aCtx = avatarCanvas.getContext('2d');

    const sw = sourceElement.videoWidth || sourceElement.naturalWidth || sourceElement.width;
    const sh = sourceElement.videoHeight || sourceElement.naturalHeight || sourceElement.height;

    // Add square margin
    const side = Math.max(boxPx.width, boxPx.height);
    const cx = boxPx.x + boxPx.width / 2;
    const cy = boxPx.y + boxPx.height / 2;
    const sx = Math.max(0, cx - side / 2);
    const sy = Math.max(0, cy - side / 2);
    const sWidth = Math.min(sw - sx, side);
    const sHeight = Math.min(sh - sy, side);

    try {
      aCtx.drawImage(sourceElement, sx, sy, sWidth, sHeight, 0, 0, size, size);
      return avatarCanvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return '';
    }
  }
}
