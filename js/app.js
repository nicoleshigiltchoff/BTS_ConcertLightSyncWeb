import { getAll,put,clear,remove } from './db.js';
import { LightstickManager } from './bluetooth.js';
import { decodeAndFingerprint } from './fingerprint.js';
import { ConstellationMatcher } from './matcher.js';
import { MicrophoneRecognizer } from './recognizer.js';
import { normalizeSequence,SequencePlayer } from './sequences.js';
import { loadRepositoryAssets } from './repository-assets.js';
import { FINGERPRINT_VERSION } from './config.js';

const $=id=>document.getElementById(id),logEl=$('log');
function log(msg){const line=`${new Date().toLocaleTimeString()}  ${msg}`;console.log(line);logEl.textContent=(line+'\n'+logEl.textContent).slice(0,18000);}
let songs=await getAll('songs'),sequences=await getAll('sequences');
const settingsRecord=(await getAll('settings')).find(x=>x.id==='main')||{id:'main',mappings:{}};
const matcher=new ConstellationMatcher();matcher.setSongs(songs);
const lights=new LightstickManager(log);
const player=new SequencePlayer((color,b)=>lights.sendColor(color,b));
const recognizer=new MicrophoneRecognizer(matcher,readSettings,log);
let activeSongId=null;
let concertOrder=[];
let concertIndex=Math.max(0,Number(settingsRecord.recognition?.concertIndex||0));

function readSettings(){
  const currentId=concertOrder[concertIndex];
  const nextId=concertOrder[concertIndex+1];
  return{
    windowSeconds:+$('windowSeconds').value,
    matchInterval:+$('matchInterval').value,
    minVotes:+$('minVotes').value,
    minRatio:+$('minRatio').value,
    globalOffset:+$('globalOffset').value,
    concertIndex,
    concertOrder,
    allowedSongIds:[currentId,nextId].filter(Boolean)
  };
}
function saveSettings(){settingsRecord.mappings=settingsRecord.mappings||{};settingsRecord.recognition={...readSettings(),concertOrder:undefined};put('settings',settingsRecord);}

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
  for(let i=0;i<files.length;i++)try{box.textContent=`Indexing ${i+1}/${files.length}: ${files[i].name}`;await new Promise(r=>setTimeout(r,50));const fp=await decodeAndFingerprint(files[i]);const song={id:crypto.randomUUID?.()||`${Date.now()}-${i}`,title:files[i].name.replace(/\.[^.]+$/,''),fileName:files[i].name,duration:fp.duration,hashes:fp.hashes,fingerprintVersion:fp.fingerprintVersion||FINGERPRINT_VERSION,createdAt:new Date().toISOString()};await put('songs',song);log(`Indexed ${song.title}: ${song.hashes.length} hashes`);}catch(e){box.classList.add('error');box.textContent=`Failed on ${files[i].name}: ${e.message}`;log(box.textContent);}
  songs=await getAll('songs');matcher.setSongs(songs);if(!concertOrder.length)resolveConcertOrder(null);box.textContent=`Finished. ${songs.length} song(s) indexed locally.`;renderAll();
}
async function importSequences(files){for(const file of files)try{const seq=normalizeSequence(JSON.parse(await file.text()),file.name);await put('sequences',seq);log(`Imported sequence ${seq.title}: ${seq.cues.length} cues`);}catch(e){alert(`${file.name}: ${e.message}`);}sequences=await getAll('sequences');renderAll();}
function handleMatch(m){
  const corrected=m.currentOffset+readSettings().globalOffset;
  $('matchedSong').textContent=m.song.title;$('matchedOffset').textContent=corrected.toFixed(1)+' s';$('matchConfidence').textContent=`${m.votes} aligned · ${m.ratio.toFixed(2)}×${m.prior&&m.prior!==1?' · setlist '+m.prior.toFixed(2)+'×':''}`;
  const matchedConcertIndex=concertOrder.indexOf(m.song.id);
  if(matchedConcertIndex===concertIndex+1){
    setConcertPosition(matchedConcertIndex,{scroll:true,logChange:true,stopPlayback:false});
  }else if(matchedConcertIndex!==concertIndex){
    // Strict-order matching should already exclude every other song. Ignore any
    // stale result generated immediately before a manual position change.
    return;
  }
  const seqId=settingsRecord.mappings?.[m.song.id];const seq=sequences.find(s=>s.id===seqId);
  if(!seq){$('cueLabel').textContent='Song matched; no sequence mapped';return;}
  if(activeSongId!==m.song.id||player.sequence?.id!==seq.id){activeSongId=m.song.id;player.sync(seq,corrected);log(`Started ${seq.title} at ${corrected.toFixed(2)} s`);}else player.correct(corrected);
}
function renderDevices(){const list=$('deviceList'),items=[...lights.devices.values()];list.innerHTML=items.length?'':`<p class="empty">No lightsticks paired.</p>`;for(const d of items){const row=document.createElement('div');row.className='device';row.innerHTML=`<div class="device-info"><strong>${escapeHtml(d.name)}</strong><small class="${d.device.gatt.connected?'connected':'disconnected'}">${d.device.gatt.connected?'Connected':'Disconnected'}</small></div><button>Disconnect</button>`;row.querySelector('button').onclick=()=>lights.disconnect(d.id);list.append(row);}}
function renderSongs(){const list=$('songList');list.innerHTML=songs.length?'':'<p class="empty">No indexed songs.</p>';for(const s of songs){const row=document.createElement('div');row.className='data-row';row.innerHTML=`<div class="data-info"><strong>${escapeHtml(s.title)}</strong><small>${formatTime(s.duration)} · ${(s.hashes||[]).length.toLocaleString()} hashes</small></div><button class="danger">Delete</button>`;row.querySelector('button').onclick=async()=>{await remove('songs',s.id);songs=await getAll('songs');matcher.setSongs(songs);renderAll();};list.append(row);}}
function renderSequences(){const list=$('sequenceList');list.innerHTML=sequences.length?'':'<p class="empty">No sequences imported.</p>';for(const s of sequences){const end=s.cues.at(-1)?.time||0,row=document.createElement('div');row.className='data-row';row.innerHTML=`<div class="data-info"><strong>${escapeHtml(s.title)}</strong><small>${s.cues.length} cues · ends at ${formatTime(end)} · offset ${s.offset||0}s</small></div><button class="danger">Delete</button>`;row.querySelector('button').onclick=async()=>{await remove('sequences',s.id);sequences=await getAll('sequences');renderAll();};list.append(row);}}
function renderMappings(){const list=$('mappingList');list.innerHTML=(songs.length&&sequences.length)?'':'<p class="empty">Import at least one song and one sequence.</p>';if(!(songs.length&&sequences.length))return;for(const song of songs){const row=document.createElement('div');row.className='mapping-row';const label=document.createElement('strong');label.textContent=song.title;const select=document.createElement('select');select.innerHTML='<option value="">No sequence</option>'+sequences.map(s=>`<option value="${escapeAttr(s.id)}">${escapeHtml(s.title)}</option>`).join('');select.value=settingsRecord.mappings?.[song.id]||autoMatch(song)||'';if(!settingsRecord.mappings?.[song.id]&&select.value){settingsRecord.mappings[song.id]=select.value;saveSettings();}select.onchange=()=>{settingsRecord.mappings[song.id]=select.value;saveSettings();};row.append(label,select);list.append(row);}}
function autoMatch(song){const key=normalizeName(song.title);return sequences.find(s=>normalizeName(s.songKey||s.title).includes(key)||key.includes(normalizeName(s.songKey||s.title)))?.id;}
function renderAll(){renderDevices();renderSongs();renderSequences();renderMappings();renderSetlistTiles();}

function applySavedRecognitionSettings(){
  const saved=settingsRecord.recognition||{};
  for(const id of ['windowSeconds','matchInterval','minVotes','minRatio','globalOffset']){
    if(saved[id]!==undefined&&$(id))$(id).value=String(saved[id]);
  }
}
function resolveConcertOrder(manifest){
  const explicit=Array.isArray(manifest?.concertOrder)?manifest.concertOrder.map(String):[];
  const valid=new Set(songs.map(song=>song.id));
  const fromExplicit=explicit.filter(id=>valid.has(id));
  const ordered=songs.filter(song=>Number.isFinite(song.concertOrder)).sort((a,b)=>a.concertOrder-b.concertOrder).map(song=>song.id);
  const fallback=songs.map(song=>song.id);
  concertOrder=[...new Set(fromExplicit.length?fromExplicit:ordered.length?ordered:fallback)];
  concertIndex=Math.max(0,Math.min(concertIndex,Math.max(0,concertOrder.length-1)));
}
function setConcertPosition(index,{scroll=false,logChange=false,stopPlayback=true}={}){
  if(!concertOrder.length)return;
  concertIndex=Math.max(0,Math.min(Number(index)||0,concertOrder.length-1));
  activeSongId=null;
  if(stopPlayback)player.stop();
  saveSettings();
  renderSetlistTiles();
  if(scroll){
    requestAnimationFrame(()=>{
      const tile=$('setlistTiles')?.querySelector(`[data-index="${concertIndex}"]`);
      tile?.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  }
  if(logChange){
    const song=songs.find(item=>item.id===concertOrder[concertIndex]);
    if(song)log(`Current concert song changed to ${concertIndex+1}. ${song.title}`);
  }
}
function renderSetlistTiles(){
  const list=$('setlistTiles');
  if(!list)return;
  concertIndex=Math.max(0,Math.min(concertIndex,Math.max(0,concertOrder.length-1)));
  const currentSong=songs.find(item=>item.id===concertOrder[concertIndex]);
  const previousSong=concertIndex>0?songs.find(item=>item.id===concertOrder[concertIndex-1]):null;
  const nextSong=concertIndex<concertOrder.length-1?songs.find(item=>item.id===concertOrder[concertIndex+1]):null;
  $('setlistCurrentLabel').textContent=currentSong?`${concertIndex+1}. ${currentSong.title}`:'No setlist loaded';
  $('previousSongLabel').textContent=previousSong?.title||'—';
  $('nextSongLabel').textContent=nextSong?.title||'—';
  list.innerHTML='';
  if(!concertOrder.length){list.innerHTML='<p class="empty">Add concertOrder to assets-manifest.json.</p>';return;}
  concertOrder.forEach((id,index)=>{
    const song=songs.find(item=>item.id===id);
    if(!song)return;
    const button=document.createElement('button');
    button.type='button';
    button.className=`setlist-song-button primary${index===concertIndex?' current':''}`;
    button.dataset.index=String(index);
    button.setAttribute('aria-pressed',index===concertIndex?'true':'false');
    button.innerHTML=`<span>${index+1}</span><strong>${escapeHtml(song.title)}</strong>`;
    button.onclick=()=>setConcertPosition(index,{scroll:true,logChange:true});
    list.append(button);
  });
}

function showBtError(msg){const el=$('bluetoothWarning');el.textContent=msg;el.classList.remove('hidden');el.classList.add('error');}
async function cacheOffline(){if(!('serviceWorker'in navigator)){alert('This browser does not expose service workers. Bluefy may still retain its own page cache, but test offline before the concert.');return;}const reg=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;alert('App shell cached. Open it once online after every update, then test in airplane mode.');log(`Service worker ready: ${reg.scope}`);updateOfflineBadge();}
async function exportData(){const blob=new Blob([JSON.stringify({version:1,songs,sequences,settings:settingsRecord},null,2)],{type:'application/json'});download(blob,'concert-lightstick-catalog.json');}
async function importBackup(file){if(!file)return;const data=JSON.parse(await file.text());for(const s of data.songs||[])await put('songs',s);for(const s of data.sequences||[])await put('sequences',s);if(data.settings)await put('settings',data.settings);location.reload();}
function updateOfflineBadge(){const b=$('offlineBadge');if(!navigator.onLine){b.textContent='Offline';b.classList.add('ok');}else if('serviceWorker'in navigator&&navigator.serviceWorker.controller){b.textContent='Offline-ready';b.classList.add('ok');}else b.textContent='Online';}
window.addEventListener('online',updateOfflineBadge);window.addEventListener('offline',updateOfflineBadge);updateOfflineBadge();
applySavedRecognitionSettings();
if(!lights.supported())showBtError('Web Bluetooth is unavailable in this browser. On iPad, use Bluefy rather than Safari.');
await loadBundledAssets();
renderAll();

async function loadBundledAssets(){
  const box=$('indexProgress');
  try{
    const result=await loadRepositoryAssets({
      existingSongs:songs,
      existingSequences:sequences,
      onStatus:message=>{box.classList.remove('hidden','error');box.textContent=message;},
      onLog:log
    });
    for(const song of result.songs) await put('songs',song);
    for(const sequence of result.sequences) await put('sequences',sequence);
    if(result.songs.length||result.sequences.length){
      songs=await getAll('songs');
      sequences=await getAll('sequences');
      matcher.setSongs(songs);
      resolveConcertOrder(result.manifest);
      box.textContent=`Loaded ${result.songs.length} bundled song(s) and ${result.sequences.length} bundled sequence(s).`;
      renderAll();
    }else if(result.manifest){
      resolveConcertOrder(result.manifest);
      renderSetlistTiles();
      box.classList.add('hidden');
    }
  }catch(e){
    box.classList.remove('hidden');
    box.classList.add('error');
    box.textContent=`Bundled asset error: ${e.message}`;
    log(box.textContent);
  }
}

function formatTime(s){return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;}function normalizeName(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}function escapeAttr(s){return escapeHtml(s);}function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
