import { decodeAndFingerprint } from './fingerprint.js';
import { normalizeSequence } from './sequences.js';

const MANIFEST_URL = './assets-manifest.json';

export async function loadRepositoryAssets({ existingSongs = [], existingSequences = [], onStatus = () => {}, onLog = () => {} } = {}) {
  const manifest = await fetchJson(MANIFEST_URL, true);
  if (!manifest) return { songs: [], sequences: [], manifest: null };

  const importedSongs = [];
  const importedSequences = [];
  const songIds = new Set(existingSongs.map(item => item.id));
  const sequenceIds = new Set(existingSequences.map(item => item.id));

  const audioEntries = Array.isArray(manifest.audio) ? manifest.audio : [];
  for (let index = 0; index < audioEntries.length; index++) {
    const entry = normalizeEntry(audioEntries[index], 'audio');
    if (!entry) continue;
    const id = entry.id || `repo-audio:${entry.path}`;
    if (songIds.has(id)) continue;

    onStatus(`Indexing bundled audio ${index + 1}/${audioEntries.length}: ${entry.title}`);
    const response = await fetch(resolvePath(entry.path, 'audio'));
    if (!response.ok) throw new Error(`Could not load bundled audio ${entry.path}: HTTP ${response.status}`);
    const blob = await response.blob();
    const file = new File([blob], fileName(entry.path), { type: blob.type || guessAudioType(entry.path) });
    const fingerprint = await decodeAndFingerprint(file);
    const song = {
      id,
      title: entry.title || stripExtension(file.name),
      fileName: file.name,
      repositoryPath: resolvePath(entry.path, 'audio'),
      duration: fingerprint.duration,
      hashes: fingerprint.hashes,
      source: 'repository',
      createdAt: new Date().toISOString()
    };
    importedSongs.push(song);
    songIds.add(id);
    onLog(`Indexed bundled song ${song.title}: ${song.hashes.length} hashes`);
  }

  const sequenceEntries = Array.isArray(manifest.sequences) ? manifest.sequences : [];
  for (let index = 0; index < sequenceEntries.length; index++) {
    const entry = normalizeEntry(sequenceEntries[index], 'sequence');
    if (!entry) continue;
    const response = await fetch(resolvePath(entry.path, 'sequences'));
    if (!response.ok) throw new Error(`Could not load bundled sequence ${entry.path}: HTTP ${response.status}`);
    const raw = await response.json();
    const sequence = normalizeSequence(raw, fileName(entry.path));
    sequence.id = entry.id || sequence.id || `repo-sequence:${entry.path}`;
    if (sequenceIds.has(sequence.id)) continue;
    if (entry.title) sequence.title = entry.title;
    if (entry.songKey) sequence.songKey = entry.songKey;
    sequence.repositoryPath = resolvePath(entry.path, 'sequences');
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
    if (entry) paths.push(resolvePath(entry.path, 'audio'));
  }
  for (const item of manifest.sequences || []) {
    const entry = normalizeEntry(item, 'sequence');
    if (entry) paths.push(resolvePath(entry.path, 'sequences'));
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
    songKey: kind === 'sequence' && value.songKey ? String(value.songKey) : ''
  };
}

function resolvePath(path, defaultFolder) {
  const clean = String(path).replace(/^\.\//, '');
  if (clean.includes('/')) return `./${clean}`;
  return `./${defaultFolder}/${clean}`;
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
