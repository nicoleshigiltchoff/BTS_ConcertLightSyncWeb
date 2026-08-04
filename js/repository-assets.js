import { decodeAndFingerprint } from './fingerprint.js';
import { FINGERPRINT_VERSION } from './config.js';
import { normalizeSequence } from './sequences.js';

const MANIFEST_URL = './assets-manifest.json';

export async function loadRepositoryAssets({ existingSongs = [], existingSequences = [], onStatus = () => {}, onLog = () => {} } = {}) {
  const manifest = await fetchJson(MANIFEST_URL, true);
  if (!manifest) return { songs: [], sequences: [], manifest: null };

  const importedSongs = [];
  const importedSequences = [];
  const songsById = new Map(existingSongs.map(item => [item.id,item]));
  const sequenceIds = new Set(existingSequences.map(item => item.id));

  const audioEntries = Array.isArray(manifest.audio) ? manifest.audio : [];
  for (let index = 0; index < audioEntries.length; index++) {
    const entry = normalizeEntry(audioEntries[index], 'audio');
    if (!entry) continue;
    const id = entry.id || `repo-audio:${entry.path}`;
    const stored = songsById.get(id);
    if (stored && Number(stored.fingerprintVersion || 1) >= FINGERPRINT_VERSION) continue;

    onStatus(`Indexing bundled audio ${index + 1}/${audioEntries.length}: ${entry.title}`);
    const assetUrl = resolveAssetUrl(entry.path, 'audio');
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Could not load bundled audio ${entry.path}: HTTP ${response.status}`);
    const blob = await response.blob();
    // Bluefy/iOS WebKit can reject synthetic File construction with
    // 'The string did not match the expected pattern'. The fingerprint
    // decoder only needs arrayBuffer(), so use the downloaded Blob directly.
    const fingerprint = await decodeAndFingerprint(blob);
    const assetName = fileName(entry.path);
    const song = {
      id,
      title: entry.title || stripExtension(assetName),
      fileName: assetName,
      repositoryPath: assetUrl,
      duration: fingerprint.duration,
      hashes: fingerprint.hashes,
      fingerprintVersion: fingerprint.fingerprintVersion || FINGERPRINT_VERSION,
      concertOrder: Number.isFinite(entry.order) ? entry.order : null,
      source: 'repository',
      createdAt: new Date().toISOString()
    };
    importedSongs.push(song);
    songsById.set(id, song);
    onLog(`Indexed bundled song ${song.title}: ${song.hashes.length} hashes`);
  }

  const sequenceEntries = Array.isArray(manifest.sequences) ? manifest.sequences : [];
  for (let index = 0; index < sequenceEntries.length; index++) {
    const entry = normalizeEntry(sequenceEntries[index], 'sequence');
    if (!entry) continue;
    const assetUrl = resolveAssetUrl(entry.path, 'sequences');
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Could not load bundled sequence ${entry.path}: HTTP ${response.status}`);
    const raw = await response.json();
    const sequence = normalizeSequence(raw, fileName(entry.path));
    sequence.id = entry.id || sequence.id || `repo-sequence:${entry.path}`;
    if (sequenceIds.has(sequence.id)) continue;
    if (entry.title) sequence.title = entry.title;
    if (entry.songKey) sequence.songKey = entry.songKey;
    sequence.repositoryPath = assetUrl;
    sequence.source = 'repository';
    importedSequences.push(sequence);
    sequenceIds.add(sequence.id);
    onLog(`Imported bundled sequence ${sequence.title}: ${sequence.cues.length} cues`);
  }

  return { songs: importedSongs, sequences: importedSequences, manifest };
}

export async function getRepositoryAssetPaths() {
  const manifest = await fetchJson(MANIFEST_URL, true);
  if (!manifest) return [MANIFEST_URL];
  const paths = [MANIFEST_URL];
  for (const item of manifest.audio || []) {
    const entry = normalizeEntry(item, 'audio');
    if (entry) paths.push(resolveAssetUrl(entry.path, 'audio'));
  }
  for (const item of manifest.sequences || []) {
    const entry = normalizeEntry(item, 'sequence');
    if (entry) paths.push(resolveAssetUrl(entry.path, 'sequences'));
  }
  return [...new Set(paths)];
}

function normalizeEntry(value, kind) {
  if (typeof value === 'string') return { path: value, title: stripExtension(fileName(value)) };
  if (!value || typeof value !== 'object' || !value.path) return null;
  return {
    id: value.id ? String(value.id) : '',
    path: String(value.path),
    title: value.title ? String(value.title) : stripExtension(fileName(value.path)),
    songKey: kind === 'sequence' && value.songKey ? String(value.songKey) : '',
    order: kind === 'audio' && Number.isFinite(Number(value.order)) ? Number(value.order) : null
  };
}

function resolvePath(path, defaultFolder) {
  const clean = String(path).trim().replace(/^\.\//, '').replace(/^\//, '');
  if (!clean) throw new Error('Asset path is empty.');
  if (clean.includes('/')) return clean;
  return `${defaultFolder}/${clean}`;
}

function resolveAssetUrl(path, defaultFolder) {
  const relativePath = resolvePath(path, defaultFolder);
  return new URL(relativePath, document.baseURI).href;
}

async function fetchJson(url, optional = false) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (response.status === 404 && optional) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

function fileName(path) { return String(path).split('/').pop() || String(path); }
function stripExtension(name) { return String(name).replace(/\.[^.]+$/, ''); }
function guessAudioType(path) {
  const ext = fileName(path).split('.').pop().toLowerCase();
  return ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg' })[ext] || 'application/octet-stream';
}
