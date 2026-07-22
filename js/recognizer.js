import { AUDIO } from './config.js';

export class MicrophoneRecognizer extends EventTarget{
  constructor(matcher,settings,log=console.log){super();this.matcher=matcher;this.settings=settings;this.log=log;this.running=false;this.buffer=[];}
  async start(){
    if(this.running)return;
    this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
    this.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:AUDIO.targetSampleRate});
    await this.ctx.resume();
    this.source=this.ctx.createMediaStreamSource(this.stream);
    this.processor=this.ctx.createScriptProcessor(4096,1,1);
    this.silent=this.ctx.createGain();this.silent.gain.value=0;
    this.source.connect(this.processor);this.processor.connect(this.silent);this.silent.connect(this.ctx.destination);
    this.buffer=[];this.running=true;
    this.processor.onaudioprocess=e=>{const x=e.inputBuffer.getChannelData(0);this.buffer.push(new Float32Array(x));const max=Math.ceil(this.ctx.sampleRate*(this.settings().windowSeconds+2));trimChunks(this.buffer,max);};
    this.timer=setInterval(()=>this.analyze(),this.settings().matchInterval*1000);
    this.dispatchEvent(new Event('state'));
  }
  async analyze(){
    if(!this.running)return;
    const nativeNeeded=Math.floor(this.ctx.sampleRate*this.settings().windowSeconds),nativeSamples=flattenLast(this.buffer,nativeNeeded);
    if(nativeSamples.length<nativeNeeded*.65)return;
    const samples=this.ctx.sampleRate===AUDIO.targetSampleRate?nativeSamples:resampleLinear(nativeSamples,this.ctx.sampleRate,AUDIO.targetSampleRate);
    const started=performance.now();
    const match=this.matcher.match(samples,this.settings());
    if(match){
      const captureDuration=samples.length/AUDIO.targetSampleRate;
      match.currentOffset=match.offset+captureDuration;
      match.processingDelay=(performance.now()-started)/1000;
      match.currentOffset+=match.processingDelay;
      this.dispatchEvent(new CustomEvent('match',{detail:match}));
    } else this.dispatchEvent(new Event('nomatch'));
  }
  async stop(){if(!this.running)return;this.running=false;clearInterval(this.timer);this.processor?.disconnect();this.source?.disconnect();this.silent?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());await this.ctx?.close().catch(()=>{});this.dispatchEvent(new Event('state'));}
}
function flattenLast(chunks,n){const out=new Float32Array(Math.min(n,chunks.reduce((s,c)=>s+c.length,0)));let pos=out.length;for(let i=chunks.length-1;i>=0&&pos>0;i--){const c=chunks[i],take=Math.min(pos,c.length);pos-=take;out.set(c.subarray(c.length-take),pos);}return out;}
function trimChunks(chunks,max){let total=chunks.reduce((s,c)=>s+c.length,0);while(chunks.length>1&&total-chunks[0].length>max)total-=chunks.shift().length;}

function resampleLinear(input,from,to){if(from===to)return input;const n=Math.floor(input.length*to/from),out=new Float32Array(n),ratio=from/to;for(let i=0;i<n;i++){const p=i*ratio,a=Math.floor(p),b=Math.min(input.length-1,a+1),f=p-a;out[i]=input[a]*(1-f)+input[b]*f;}return out;}
