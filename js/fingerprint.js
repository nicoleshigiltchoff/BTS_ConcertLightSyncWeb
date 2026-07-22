import { AUDIO } from './config.js';

export async function decodeAndFingerprint(file,onProgress=()=>{}){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  try{
    const data=await file.arrayBuffer();
    const decoded=await ctx.decodeAudioData(data.slice(0));
    const mono=mixToMono(decoded);
    const samples=resampleLinear(mono,decoded.sampleRate,AUDIO.targetSampleRate);
    onProgress('fingerprinting');
    const hashes=fingerprintSamples(samples,AUDIO.targetSampleRate);
    return {duration:decoded.duration,hashes,sampleRate:AUDIO.targetSampleRate};
  } finally { await ctx.close().catch(()=>{}); }
}

export function fingerprintSamples(samples,sampleRate=AUDIO.targetSampleRate){
  if(samples.length<AUDIO.fftSize) return [];
  const window=hann(AUDIO.fftSize),frames=[];
  const minBin=Math.max(1,Math.floor(AUDIO.minHz*AUDIO.fftSize/sampleRate));
  const maxBin=Math.min(AUDIO.fftSize/2-1,Math.ceil(AUDIO.maxHz*AUDIO.fftSize/sampleRate));
  for(let start=0,fi=0;start+AUDIO.fftSize<=samples.length;start+=AUDIO.hopSize,fi++){
    const real=new Float64Array(AUDIO.fftSize),imag=new Float64Array(AUDIO.fftSize);
    for(let i=0;i<AUDIO.fftSize;i++) real[i]=samples[start+i]*window[i];
    fft(real,imag);
    const candidates=[];
    for(let b=minBin+1;b<maxBin-1;b++){
      const mag=Math.log1p(real[b]*real[b]+imag[b]*imag[b]);
      if(mag>Math.log1p(real[b-1]*real[b-1]+imag[b-1]*imag[b-1])&&mag>=Math.log1p(real[b+1]*real[b+1]+imag[b+1]*imag[b+1])) candidates.push([mag,b]);
    }
    candidates.sort((a,b)=>b[0]-a[0]);
    const selected=[];
    for(const [,bin] of candidates){
      if(selected.every(x=>Math.abs(x-bin)>=4)){selected.push(bin);if(selected.length>=AUDIO.peaksPerFrame)break;}
    }
    frames.push(selected.map(bin=>({bin,time:fi})));
  }
  const hashes=[];
  for(let i=0;i<frames.length;i++) for(const anchor of frames[i]){
    let added=0;
    for(let j=i+AUDIO.minPairFrames;j<Math.min(frames.length,i+AUDIO.maxPairFrames+1)&&added<AUDIO.fanout;j++){
      for(const target of frames[j]){
        const dt=j-i;
        hashes.push([hashKey(anchor.bin,target.bin,dt),anchor.time]);
        if(++added>=AUDIO.fanout) break;
      }
    }
  }
  return hashes;
}
export function frameToSeconds(frame){return frame*AUDIO.hopSize/AUDIO.targetSampleRate;}
function hashKey(f1,f2,dt){return `${f1}.${f2}.${Math.round(dt/AUDIO.timeQuantizationFrames)}`;}
function mixToMono(buffer){const out=new Float32Array(buffer.length);for(let c=0;c<buffer.numberOfChannels;c++){const ch=buffer.getChannelData(c);for(let i=0;i<out.length;i++)out[i]+=ch[i]/buffer.numberOfChannels;}return out;}
function resampleLinear(input,from,to){if(from===to)return input;const n=Math.floor(input.length*to/from),out=new Float32Array(n),ratio=from/to;for(let i=0;i<n;i++){const p=i*ratio,a=Math.floor(p),b=Math.min(input.length-1,a+1),f=p-a;out[i]=input[a]*(1-f)+input[b]*f;}return out;}
function hann(n){const w=new Float64Array(n);for(let i=0;i<n;i++)w[i]=.5-.5*Math.cos(2*Math.PI*i/(n-1));return w;}
function fft(real,imag){const n=real.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}}for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wlr=Math.cos(ang),wli=Math.sin(ang);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const uR=real[i+j],uI=imag[i+j],vR=real[i+j+len/2]*wr-imag[i+j+len/2]*wi,vI=real[i+j+len/2]*wi+imag[i+j+len/2]*wr;real[i+j]=uR+vR;imag[i+j]=uI+vI;real[i+j+len/2]=uR-vR;imag[i+j+len/2]=uI-vI;const next=wr*wlr-wi*wli;wi=wr*wli+wi*wlr;wr=next;}}}}
