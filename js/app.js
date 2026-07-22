import { getAll,put,clear,remove } from './db.js';
import { LightstickManager } from './bluetooth.js';
import { decodeAndFingerprint } from './fingerprint.js';
import { ConstellationMatcher } from './matcher.js';
import { MicrophoneRecognizer } from './recognizer.js';
import { normalizeSequence,SequencePlayer } from './sequences.js';

const $=id=>document.getElementById(id),logEl=$('log');
function log(msg){const line=`${new Date().toLocaleTimeString()}  ${msg}`;console.log(line);logEl.textContent=(line+'\n'+logEl.textContent).slice(0,18000);}
let songs=await getAll('songs'),sequences=await getAll('sequences');
const settingsRecord=(await getAll('settings')).find(x=>x.id==='main')||{id:'main',mappings:{}};
const matcher=new ConstellationMatcher();matcher.setSongs(songs);
const lights=new LightstickManager(log);
const player=new SequencePlayer((color,b)=>lights.sendColor(color,b));
const recognizer=new MicrophoneRecognizer(matcher,readSettings,log);
let activeSongId=null;

function readSettings(){return{windowSeconds:+$('windowSeconds').value,matchInterval:+$('matchInterval').value,minVotes:+$('minVotes').value,minRatio:+$('minRatio').value,globalOffset:+$('globalOffset').value};}
function saveSettings(){settingsRecord.mappings=settingsRecord.mappings||{};put('settings',settingsRecord);}

lights.addEventListener('change',renderDevices);
player.addEventListener('cue',e=>{const {cue,time,index,sequence}=e.detail;$('lightPreview').style.background=cue.color;$('lightPreview').style.opacity=String(Math.max(.08,cue.brightness));$('lightPreview').style.boxShadow=`0 0 ${18+cue.brightness*35}px ${cue.color}`;$('cueLabel').textContent=`${sequence.title}: ${cue.label}`;$('cueDetail').textContent=`Cue ${index+1}/${sequence.cues.length} at ${time.toFixed(1)} s — ${cue.color}, ${Math.round(cue.brightness*100)}%`;});
recognizer.addEventListener('state',()=>{$('recognizerState').textContent=recognizer.running?'Listening':'Stopped';$('startListening').disabled=recognizer.running;$('stopListening').disabled=!recognizer.running;});
recognizer.addEventListener('match',e=>handleMatch(e.detail));
recognizer.addEventListener('nomatch',()=>{$('matchConfidence').textContent='No confident match';});

$('pairButton').onclick=async()=>{try{await lights.pair();}catch(e){showBtError(e.message);log(`Bluetooth error: ${e.message}`);}};
$('sendTest').onclick=()=>lights.sendColor($('testColor').value,+$('testBrightness').value/100);
$('testBrightness').oninput=()=>{$('brightnessValue').textContent=$('testBrightness').value+'%';};
$('blackout').onclick=()=>lights.sendColor('#000000',0);
$('startListening').onclick=async()=>{try{if(!songs.length)throw new Error('Import and index at least one song first.');await recognizer.start();}catch(e){alert(e.message);log(`Microphone error: ${e.message}`);}};
$('stopListening').onclick=()=>{recognizer.stop();player.stop();activeSongId=null;};
$('audioFiles').onchange=e=>indexFiles([...e.target.files]);
$('sequenceFiles').onchange=e=>importSequences([...e.target.files]);
$('clearSongs').onclick=async()=>{if(confirm('Delete all locally stored song fingerprints?')){await clear('songs');songs=[];matcher.setSongs(songs);renderAll();}};
$('clearSequences').onclick=async()=>{if(confirm('Delete all locally stored sequences?')){await clear('sequences');sequences=[];renderAll();}};
$('loadExample').onclick=async()=>{const r=await fetch('examples/example-sequence.json');const seq=normalizeSequence(await r.json(),'example-sequence.json');await put('sequences',seq);sequences=await getAll('sequences');renderAll();};
$('cacheOffline').onclick=cacheOffline;
$('exportData').onclick=exportData;
$('importData').onchange=e=>importBackup(e.target.files[0]);
for(const id of ['windowSeconds','matchInterval','minVotes','minRatio','globalOffset'])$(id).onchange=saveSettings;

async function indexFiles(files){
  if(!files.length)return;const box=$('indexProgress');box.classList.remove('hidden','error');
  for(let i=0;i<files.length;i++)try{box.textContent=`Indexing ${i+1}/${files.length}: ${files[i].name}`;await new Promise(r=>setTimeout(r,50));const fp=await decodeAndFingerprint(files[i]);const song={id:crypto.randomUUID?.()||`${Date.now()}-${i}`,title:files[i].name.replace(/\.[^.]+$/,''),fileName:files[i].name,duration:fp.duration,hashes:fp.hashes,createdAt:new Date().toISOString()};await put('songs',song);log(`Indexed ${song.title}: ${song.hashes.length} hashes`);}catch(e){box.classList.add('error');box.textContent=`Failed on ${files[i].name}: ${e.message}`;log(box.textContent);}
  songs=await getAll('songs');matcher.setSongs(songs);box.textContent=`Finished. ${songs.length} song(s) indexed locally.`;renderAll();
}
async function importSequences(files){for(const file of files)try{const seq=normalizeSequence(JSON.parse(await file.text()),file.name);await put('sequences',seq);log(`Imported sequence ${seq.title}: ${seq.cues.length} cues`);}catch(e){alert(`${file.name}: ${e.message}`);}sequences=await getAll('sequences');renderAll();}
function handleMatch(m){
  const corrected=m.currentOffset+readSettings().globalOffset;
  $('matchedSong').textContent=m.song.title;$('matchedOffset').textContent=corrected.toFixed(1)+' s';$('matchConfidence').textContent=`${m.votes} votes · ${m.ratio.toFixed(2)}×`;
  const seqId=settingsRecord.mappings?.[m.song.id];const seq=sequences.find(s=>s.id===seqId);
  if(!seq){$('cueLabel').textContent='Song matched; no sequence mapped';return;}
  if(activeSongId!==m.song.id||player.sequence?.id!==seq.id){activeSongId=m.song.id;player.sync(seq,corrected);log(`Started ${seq.title} at ${corrected.toFixed(2)} s`);}else player.correct(corrected);
}
function renderDevices(){const list=$('deviceList'),items=[...lights.devices.values()];list.innerHTML=items.length?'':`<p class="empty">No lightsticks paired.</p>`;for(const d of items){const row=document.createElement('div');row.className='device';row.innerHTML=`<div class="device-info"><strong>${escapeHtml(d.name)}</strong><small class="${d.device.gatt.connected?'connected':'disconnected'}">${d.device.gatt.connected?'Connected':'Disconnected'}</small></div><button>Disconnect</button>`;row.querySelector('button').onclick=()=>lights.disconnect(d.id);list.append(row);}}
function renderSongs(){const list=$('songList');list.innerHTML=songs.length?'':'<p class="empty">No indexed songs.</p>';for(const s of songs){const row=document.createElement('div');row.className='data-row';row.innerHTML=`<div class="data-info"><strong>${escapeHtml(s.title)}</strong><small>${formatTime(s.duration)} · ${(s.hashes||[]).length.toLocaleString()} hashes</small></div><button class="danger">Delete</button>`;row.querySelector('button').onclick=async()=>{await remove('songs',s.id);songs=await getAll('songs');matcher.setSongs(songs);renderAll();};list.append(row);}}
function renderSequences(){const list=$('sequenceList');list.innerHTML=sequences.length?'':'<p class="empty">No sequences imported.</p>';for(const s of sequences){const end=s.cues.at(-1)?.time||0,row=document.createElement('div');row.className='data-row';row.innerHTML=`<div class="data-info"><strong>${escapeHtml(s.title)}</strong><small>${s.cues.length} cues · ends at ${formatTime(end)} · offset ${s.offset||0}s</small></div><button class="danger">Delete</button>`;row.querySelector('button').onclick=async()=>{await remove('sequences',s.id);sequences=await getAll('sequences');renderAll();};list.append(row);}}
function renderMappings(){const list=$('mappingList');list.innerHTML=(songs.length&&sequences.length)?'':'<p class="empty">Import at least one song and one sequence.</p>';if(!(songs.length&&sequences.length))return;for(const song of songs){const row=document.createElement('div');row.className='mapping-row';const label=document.createElement('strong');label.textContent=song.title;const select=document.createElement('select');select.innerHTML='<option value="">No sequence</option>'+sequences.map(s=>`<option value="${escapeAttr(s.id)}">${escapeHtml(s.title)}</option>`).join('');select.value=settingsRecord.mappings?.[song.id]||autoMatch(song)||'';if(!settingsRecord.mappings?.[song.id]&&select.value){settingsRecord.mappings[song.id]=select.value;saveSettings();}select.onchange=()=>{settingsRecord.mappings[song.id]=select.value;saveSettings();};row.append(label,select);list.append(row);}}
function autoMatch(song){const key=normalizeName(song.title);return sequences.find(s=>normalizeName(s.songKey||s.title).includes(key)||key.includes(normalizeName(s.songKey||s.title)))?.id;}
function renderAll(){renderDevices();renderSongs();renderSequences();renderMappings();}
function showBtError(msg){const el=$('bluetoothWarning');el.textContent=msg;el.classList.remove('hidden');el.classList.add('error');}
async function cacheOffline(){if(!('serviceWorker'in navigator)){alert('This browser does not expose service workers. Bluefy may still retain its own page cache, but test offline before the concert.');return;}const reg=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;alert('App shell cached. Open it once online after every update, then test in airplane mode.');log(`Service worker ready: ${reg.scope}`);updateOfflineBadge();}
async function exportData(){const blob=new Blob([JSON.stringify({version:1,songs,sequences,settings:settingsRecord},null,2)],{type:'application/json'});download(blob,'concert-lightstick-catalog.json');}
async function importBackup(file){if(!file)return;const data=JSON.parse(await file.text());for(const s of data.songs||[])await put('songs',s);for(const s of data.sequences||[])await put('sequences',s);if(data.settings)await put('settings',data.settings);location.reload();}
function updateOfflineBadge(){const b=$('offlineBadge');if(!navigator.onLine){b.textContent='Offline';b.classList.add('ok');}else if('serviceWorker'in navigator&&navigator.serviceWorker.controller){b.textContent='Offline-ready';b.classList.add('ok');}else b.textContent='Online';}
window.addEventListener('online',updateOfflineBadge);window.addEventListener('offline',updateOfflineBadge);updateOfflineBadge();
if(!lights.supported())showBtError('Web Bluetooth is unavailable in this browser. On iPad, use Bluefy rather than Safari.');
renderAll();
function formatTime(s){return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;}function normalizeName(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}function escapeAttr(s){return escapeHtml(s);}function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
