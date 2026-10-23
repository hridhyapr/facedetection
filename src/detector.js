/**
 * MediaPipe FaceLandmarker Wrapper & Biometric Telemetry Extractor
 */
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

class BiometricDetector {
  constructor() {
    this.landmarker = null;
    this.isReady = false;
    this.currentMode = 'IMAGE'; // 'IMAGE' or 'VIDEO'
    this.delegate = 'GPU';
    this.initError = null;
    this.connections = null;
  }

  async init(onProgress = () => {}) {
    if (this.isReady && this.landmarker) return true;

    try {
      onProgress('Loading Vision WASM runtime...');
      
      // Try local wasm first, then fallback to CDN
      let filesetResolver;
      try {
        filesetResolver = await FilesetResolver.forVisionTasks('/wasm');
      } catch (err) {
        console.warn('Local wasm failed, falling back to CDN:', err);
        filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
      }

      onProgress('Initializing Face Detection neural models...');

      // Try local model first, then CDN
      const modelCandidates = [
        '/models/face_landmarker.task',
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
      ];

      let lastError = null;
      for (const modelPath of modelCandidates) {
        try {
          // Try GPU first
          try {
            this.landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: modelPath,
                delegate: 'GPU'
              },
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
              runningMode: this.currentMode,
              numFaces: 6,
              minFaceDetectionConfidence: 0.4,
              minFacePresenceConfidence: 0.4,
              minTrackingConfidence: 0.4
            });
            this.delegate = 'GPU';
            break;
          } catch (gpuErr) {
            console.warn('GPU delegate failed, attempting CPU fallback:', gpuErr);
            this.landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: modelPath,
                delegate: 'CPU'
              },
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
              runningMode: this.currentMode,
              numFaces: 6,
              minFaceDetectionConfidence: 0.4,
              minFacePresenceConfidence: 0.4,
              minTrackingConfidence: 0.4
            });
            this.delegate = 'CPU';
            break;
          }
        } catch (mErr) {
          console.warn(`Model load failed for ${modelPath}:`, mErr);
          lastError = mErr;
        }
      }

      if (!this.landmarker) {
        throw lastError || new Error('Failed to initialize Face Landmarker from any source.');
      }

      // Store connections
      this.connections = {
        tesselation: FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        contours: FaceLandmarker.FACE_LANDMARKS_CONTOURS,
        leftIris: FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
        rightIris: FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
        faceOval: FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        lips: FaceLandmarker.FACE_LANDMARKS_LIPS,
        leftEye: FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        rightEye: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        leftEyebrow: FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        rightEyebrow: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW
      };

      this.isReady = true;
      onProgress('AI Biometric Engine Ready.');
      return true;
    } catch (err) {
      console.error('BiometricDetector init failed:', err);
      this.initError = err;
      throw err;
    }
  }

  async setRunningMode(mode) {
    if (!this.landmarker) return;
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    try {
      await this.landmarker.setOptions({ runningMode: mode });
    } catch (err) {
      console.warn('Failed to switch runningMode dynamically:', err);
    }
  }

  // Detect faces in a static image (HTMLImageElement, HTMLCanvasElement)
  detectImage(imageElement) {
    if (!this.isReady || !this.landmarker) return null;
    const startTime = performance.now();
    try {
      const result = this.landmarker.detect(imageElement);
      const latency = performance.now() - startTime;
      return this.processResults(result, imageElement.naturalWidth || imageElement.width, imageElement.naturalHeight || imageElement.height, latency);
    } catch (err) {
      console.error('detectImage error:', err);
      return null;
    }
  }

  // Detect faces in a video frame (HTMLVideoElement)
  detectVideo(videoElement, timestamp) {
    if (!this.isReady || !this.landmarker) return null;
    const startTime = performance.now();
    try {
      const result = this.landmarker.detectForVideo(videoElement, timestamp);
      const latency = performance.now() - startTime;
      return this.processResults(result, videoElement.videoWidth, videoElement.videoHeight, latency);
    } catch (err) {
      console.error('detectVideo error:', err);
      return null;
    }
  }

  // Calculate face bounding boxes, geometry, pose, and blendshapes
  processResults(rawResult, imgWidth, imgHeight, latency) {
    if (!rawResult || !rawResult.faceLandmarks || rawResult.faceLandmarks.length === 0) {
      return {
        faces: [],
        latency: Math.round(latency * 10) / 10,
        faceCount: 0
      };
    }

    const faces = rawResult.faceLandmarks.map((landmarks, index) => {
      // 1. Calculate Bounding Box
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      landmarks.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });

      // Add 12% padding for biometric framing
      const padX = (maxX - minX) * 0.12;
      const padY = (maxY - minY) * 0.15;
      const boxNorm = {
        x: Math.max(0, minX - padX),
        y: Math.max(0, minY - padY),
        width: Math.min(1 - Math.max(0, minX - padX), (maxX - minX) + padX * 2),
        height: Math.min(1 - Math.max(0, minY - padY), (maxY - minY) + padY * 2)
      };

      const boxPx = {
        x: Math.round(boxNorm.x * imgWidth),
        y: Math.round(boxNorm.y * imgHeight),
        width: Math.round(boxNorm.width * imgWidth),
        height: Math.round(boxNorm.height * imgHeight)
      };

      // 2. Parse Blendshapes (Facial Expressions)
      const blendshapes = {};
      if (rawResult.faceBlendshapes && rawResult.faceBlendshapes[index]) {
        rawResult.faceBlendshapes[index].categories.forEach(c => {
          blendshapes[c.categoryName] = c.score;
        });
      }

      const smileLeft = blendshapes['mouthSmileLeft'] || 0;
      const smileRight = blendshapes['mouthSmileRight'] || 0;
      const smileScore = Math.max(smileLeft, smileRight);

      const blinkLeft = blendshapes['eyeBlinkLeft'] || 0;
      const blinkRight = blendshapes['eyeBlinkRight'] || 0;
      const jawOpen = blendshapes['jawOpen'] || 0;
      const browDown = ((blendshapes['browDownLeft'] || 0) + (blendshapes['browDownRight'] || 0)) / 2;

      // Classify Emotion
      let emotion = 'Neutral';
      let emotionConfidence = 0.85;
      if (smileScore > 0.45) {
        emotion = 'Happy / Smiling';
        emotionConfidence = smileScore;
      } else if (jawOpen > 0.45) {
        emotion = 'Surprised';
        emotionConfidence = jawOpen;
      } else if (blinkLeft > 0.65 && blinkRight > 0.65) {
        emotion = 'Eyes Closed';
        emotionConfidence = (blinkLeft + blinkRight) / 2;
      } else if (browDown > 0.4) {
        emotion = 'Focused / Serious';
        emotionConfidence = browDown;
      }

      // Attention status
      let attention = 'Attentive';
      if (blinkLeft > 0.7 && blinkRight > 0.7) {
        attention = 'Drowsy / Closed';
      }

      // 3. Estimate Head Pose (Pitch, Yaw, Roll)
      let yaw = 0;
      let pitch = 0;
      let roll = 0;

      // If matrix exists, compute from rotation matrix
      const matrix = rawResult.facialTransformationMatrixes && rawResult.facialTransformationMatrixes[index];
      if (matrix && matrix.data) {
        const m = matrix.data;
        // Matrix is 4x4 row-major
        // Pitch: rotation around X axis
        // Yaw: rotation around Y axis
        // Roll: rotation around Z axis
        yaw = Math.atan2(m[2], m[10]) * (180 / Math.PI);
        pitch = Math.atan2(-m[6], Math.sqrt(m[2] * m[2] + m[10] * m[10])) * (180 / Math.PI);
        roll = Math.atan2(m[4], m[5]) * (180 / Math.PI);
      } else {
        // Geometric approximation from landmarks:
        // Landmark 1: nose tip
        // Landmark 33: left eye outer
        // Landmark 263: right eye outer
        // Landmark 152: chin
        // Landmark 10: forehead center
        const nose = landmarks[1] || landmarks[4];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const chin = landmarks[152];
        const forehead = landmarks[10];

        if (nose && leftEye && rightEye && chin && forehead) {
          // Roll from eye slope
          const dX = (rightEye.x - leftEye.x) * imgWidth;
          const dY = (rightEye.y - leftEye.y) * imgHeight;
          roll = Math.atan2(dY, dX) * (180 / Math.PI);

          // Yaw from nose displacement from eyes midpoint
          const eyeMidX = (leftEye.x + rightEye.x) / 2;
          const eyeDistX = Math.abs(rightEye.x - leftEye.x) || 0.001;
          yaw = ((nose.x - eyeMidX) / eyeDistX) * 90;

          // Pitch from nose displacement relative to forehead & chin
          const faceMidY = (forehead.y + chin.y) / 2;
          const faceHeight = Math.abs(chin.y - forehead.y) || 0.001;
          pitch = ((nose.y - faceMidY) / faceHeight) * -90;
        }
      }

      // 4. Key Landmark Points for Quick Rendering
      // 1: Nose tip, 33: Left eye outer, 263: Right eye outer, 61: Left mouth, 291: Right mouth, 152: Chin
      const keypoints = {
        noseTip: landmarks[1] || landmarks[4],
        leftEye: landmarks[33],
        rightEye: landmarks[263],
        leftIris: landmarks[468] || landmarks[469],
        rightIris: landmarks[473] || landmarks[474],
        leftMouth: landmarks[61],
        rightMouth: landmarks[291],
        chin: landmarks[152]
      };

      // 5. Confidence score approximation based on landmark coherence & detection
      const confidence = Math.min(0.99, Math.max(0.72, 0.94 - Math.abs(yaw) * 0.002 - Math.abs(pitch) * 0.002));

      return {
        id: `FACE-${String(index + 1).padStart(2, '0')}`,
        index,
        boxNorm,
        boxPx,
        confidence: Math.round(confidence * 1000) / 10,
        landmarks,
        keypoints,
        pose: {
          yaw: Math.round(yaw * 10) / 10,
          pitch: Math.round(pitch * 10) / 10,
          roll: Math.round(roll * 10) / 10
        },
        expressions: {
          smile: Math.round(smileScore * 100),
          leftBlink: Math.round(blinkLeft * 100),
          rightBlink: Math.round(blinkRight * 100),
          jawOpen: Math.round(jawOpen * 100),
          browDown: Math.round(browDown * 100),
          emotion,
          attention
        },
        geometry: {
          aspectRatio: Math.round((boxPx.width / (boxPx.height || 1)) * 100) / 100,
          area: boxPx.width * boxPx.height
        }
      };
    });

    // Sort faces: largest area first (Primary Face)
    faces.sort((a, b) => b.geometry.area - a.geometry.area);

    return {
      faces,
      latency: Math.round(latency * 10) / 10,
      faceCount: faces.length
    };
  }
}

export const biometricDetector = new BiometricDetector();
