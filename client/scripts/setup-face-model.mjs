/**
 * Prepares the on-device face detection assets so proctoring works without any
 * external API (and without a CDN at exam time).
 *
 *  1. copies the MediaPipe vision WASM runtime out of node_modules into public/
 *  2. downloads the BlazeFace short-range .tflite model into public/models/
 *
 * Runs automatically on `npm install` (postinstall) and before `npm run build`.
 * Safe to re-run: existing files are left alone.
 */
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '..');

// Works whether the dependency is installed locally or hoisted to the repo root.
const WASM_CANDIDATES = [
  path.join(clientRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  path.join(clientRoot, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
];
const WASM_DEST = path.join(clientRoot, 'public', 'mediapipe', 'wasm');

const MODEL_DEST_DIR = path.join(clientRoot, 'public', 'models');
const MODEL_FILE = 'blaze_face_short_range.tflite';
const MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
];

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  let source = null;
  for (const candidate of WASM_CANDIDATES) {
    if (await exists(candidate)) {
      source = candidate;
      break;
    }
  }
  if (!source) {
    console.warn('[face-model] @mediapipe/tasks-vision is not installed yet, skipping wasm copy.');
    return false;
  }

  await fs.mkdir(WASM_DEST, { recursive: true });
  const files = await fs.readdir(source);
  for (const file of files) {
    await fs.copyFile(path.join(source, file), path.join(WASM_DEST, file));
  }
  console.log(`[face-model] copied ${files.length} MediaPipe wasm files -> public/mediapipe/wasm`);
  return true;
}

async function downloadModel() {
  const dest = path.join(MODEL_DEST_DIR, MODEL_FILE);
  if (await exists(dest)) {
    const { size } = await fs.stat(dest);
    console.log(`[face-model] model already present (${Math.round(size / 1024)} KB), skipping download.`);
    return true;
  }

  await fs.mkdir(MODEL_DEST_DIR, { recursive: true });

  for (const url of MODEL_URLS) {
    try {
      console.log(`[face-model] downloading ${url}`);
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const tmp = `${dest}.partial`;
      await pipeline(res.body, createWriteStream(tmp));
      await fs.rename(tmp, dest);
      const { size } = await fs.stat(dest);
      console.log(`[face-model] saved public/models/${MODEL_FILE} (${Math.round(size / 1024)} KB)`);
      return true;
    } catch (error) {
      console.warn(`[face-model] download failed: ${error.message}`);
    }
  }

  console.warn(
    '[face-model] Could not fetch the face detection model.\n' +
      `             Download it manually and place it at client/public/models/${MODEL_FILE}:\n` +
      `             ${MODEL_URLS[0]}\n` +
      '             Until then the system check will report face detection as unavailable.'
  );
  return false;
}

const wasmOk = await copyWasm();
const modelOk = await downloadModel();

if (wasmOk && modelOk) {
  console.log('[face-model] face detection assets ready.');
}
// Never fail the install: the app degrades gracefully and reports the problem in
// the candidate system check.
process.exit(0);
