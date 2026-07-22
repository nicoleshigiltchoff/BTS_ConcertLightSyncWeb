import { fingerprintSamples, frameToSeconds } from './fingerprint.js';
import { AUDIO } from './config.js';

export class ConstellationMatcher {
  constructor(){this.songs=[];this.index=new Map();}
  setSongs(songs){this.songs=songs;this.index.clear();for(const song of songs)for(const [hash,time] of song.hashes||[]){let list=this.index.get(hash);if(!list)this.index.set(hash,list=[]);list.push([song.id,time]);}}
  match(samples,{minVotes=14,minRatio=1.35}={}){
    const query=fingerprintSamples(samples,AUDIO.targetSampleRate);
    const votes=new Map();
    for(const [hash,qTime] of query){const refs=this.index.get(hash);if(!refs)continue;for(const [songId,rTime] of refs){const delta=rTime-qTime;const bucket=Math.round(delta/2);const key=`${songId}|${bucket}`;votes.set(key,(votes.get(key)||0)+1);}}
    const ranked=[...votes.entries()].sort((a,b)=>b[1]-a[1]);
    if(!ranked.length)return null;
    const [bestKey,bestVotes]=ranked[0],second=ranked.find(([k])=>k.split('|')[0]!==bestKey.split('|')[0])?.[1]||1;
    if(bestVotes<minVotes||bestVotes/second<minRatio)return null;
    const [songId,bucket]=bestKey.split('|');
    const song=this.songs.find(s=>s.id===songId);
    return {song,offset:frameToSeconds(Number(bucket)*2),votes:bestVotes,ratio:bestVotes/second,queryHashes:query.length};
  }
}
