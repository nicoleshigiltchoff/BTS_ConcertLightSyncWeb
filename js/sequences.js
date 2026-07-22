export function normalizeSequence(raw,fileName='sequence.json'){
  const root=raw.sequence||raw.data||raw;
  const source=root.commands||root.cues||root.events||root.timeline||root.sequenceData||[];
  if(!Array.isArray(source))throw new Error('No commands/cues/events/timeline array found.');
  const cues=source.map((c,i)=>normalizeCue(c,i)).filter(Boolean).sort((a,b)=>a.time-b.time);
  if(!cues.length)throw new Error('No usable color cues found.');
  return {
    id:String(root.id||slug(fileName.replace(/\.json$/i,''))+'-'+Date.now()),
    title:String(root.title||root.name||fileName.replace(/\.json$/i,'')),
    songKey:String(root.songKey||root.song||root.audioFile||root.audio||''),
    sourceFile:fileName,
    offset:Number(root.offset||root.startOffset||0),
    cues
  };
}
function normalizeCue(c,i){
  let time=c.time??c.timestamp??c.at??c.startTime??c.timeSeconds;
  if(time==null&&c.timeMs!=null)time=Number(c.timeMs)/1000;
  if(time==null&&c.timestampMs!=null)time=Number(c.timestampMs)/1000;
  time=Number(time);if(!Number.isFinite(time))return null;
  let color=c.color??c.hexColor??c.hex??c.rgb;
  if(Array.isArray(color))color='#'+color.slice(0,3).map(v=>Math.max(0,Math.min(255,Number(v)||0)).toString(16).padStart(2,'0')).join('');
  if(color&&typeof color==='object')color='#'+['r','g','b'].map(k=>Math.max(0,Math.min(255,Number(color[k])||0)).toString(16).padStart(2,'0')).join('');
  if(typeof color!=='string')return null;
  if(!color.startsWith('#'))color='#'+color;
  if(!/^#[0-9a-f]{6}$/i.test(color))return null;
  let brightness=Number(c.brightness??c.intensity??c.level??1);
  if(brightness>1)brightness/=100;
  brightness=Math.max(0,Math.min(1,Number.isFinite(brightness)?brightness:1));
  return {time,color:color.toUpperCase(),brightness,label:String(c.effect||c.mode||c.label||`Cue ${i+1}`)};
}
export class SequencePlayer extends EventTarget{
  constructor(send){super();this.send=send;this.sequence=null;this.songStartPerf=0;this.timer=null;this.lastIndex=-1;}
  sync(sequence,songOffset){
    const seqTime=songOffset-(sequence.offset||0);
    this.sequence=sequence;this.songStartPerf=performance.now()-seqTime*1000;this.lastIndex=findCueIndex(sequence.cues,seqTime)-1;
    if(!this.timer)this.timer=setInterval(()=>this.tick(),35);
    this.tick();
  }
  correct(songOffset){if(!this.sequence)return;const targetStart=performance.now()-(songOffset-(this.sequence.offset||0))*1000;const error=targetStart-this.songStartPerf;if(Math.abs(error)>750)this.songStartPerf=targetStart;else this.songStartPerf+=error*.25;}
  async tick(){if(!this.sequence)return;const t=(performance.now()-this.songStartPerf)/1000;const idx=findCueIndex(this.sequence.cues,t);if(idx!==this.lastIndex&&idx>=0){this.lastIndex=idx;const cue=this.sequence.cues[idx];await this.send(cue.color,cue.brightness);this.dispatchEvent(new CustomEvent('cue',{detail:{cue,time:t,index:idx,sequence:this.sequence}}));}}
  stop(){this.sequence=null;this.lastIndex=-1;if(this.timer){clearInterval(this.timer);this.timer=null;}}
}
function findCueIndex(cues,t){let lo=0,hi=cues.length-1,ans=-1;while(lo<=hi){const m=(lo+hi)>>1;if(cues[m].time<=t){ans=m;lo=m+1}else hi=m-1;}return ans;}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'sequence';}
