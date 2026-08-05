import { fingerprintSamples, frameToSeconds } from './fingerprint.js';
import { AUDIO } from './config.js';

export class ConstellationMatcher {
  constructor(){this.songs=[];this.index=new Map();this.hashWeights=new Map();}

  setSongs(songs){
    this.songs=songs;
    this.index.clear();
    this.hashWeights.clear();
    const documents=new Map();
    for(const song of songs){
      const seen=new Set();
      for(const [hash,time] of song.hashes||[]){
        let list=this.index.get(hash);
        if(!list)this.index.set(hash,list=[]);
        list.push([song.id,time]);
        seen.add(hash);
      }
      for(const hash of seen)documents.set(hash,(documents.get(hash)||0)+1);
    }
    const total=Math.max(1,songs.length);
    for(const [hash,count] of documents){
      this.hashWeights.set(hash,1+Math.log((total+1)/(count+1)));
    }
  }

  match(samples,options={}){
    const {minVotes=14,minRatio=1.25,allowedSongIds=null}=options;
    const allowed=Array.isArray(allowedSongIds)&&allowedSongIds.length?new Set(allowedSongIds):null;
    const query=fingerprintSamples(samples,AUDIO.targetSampleRate);
    const buckets=new Map();
    for(const [hash,qTime] of query){
      const refs=this.index.get(hash);
      if(!refs)continue;
      const hashWeight=this.hashWeights.get(hash)||1;
      for(const [songId,rTime] of refs){
        if(allowed&&!allowed.has(songId))continue;
        const bucket=Math.round((rTime-qTime)/2);
        const key=`${songId}|${bucket}`;
        const value=buckets.get(key)||{raw:0,weighted:0};
        value.raw++;
        value.weighted+=hashWeight;
        buckets.set(key,value);
      }
    }
    if(!buckets.size)return null;

    const bestBySong=new Map();
    for(const [key,value] of buckets){
      const split=key.lastIndexOf('|');
      const songId=key.slice(0,split),bucket=Number(key.slice(split+1));
      let raw=value.raw,weighted=value.weighted;
      for(const neighbor of [-1,1]){
        const nearby=buckets.get(`${songId}|${bucket+neighbor}`);
        if(nearby){raw+=nearby.raw*.55;weighted+=nearby.weighted*.55;}
      }
      const priorResult=bestBySong.get(songId);
      if(!priorResult||weighted>priorResult.score)bestBySong.set(songId,{songId,bucket,raw,score:weighted});
    }

    const ranked=[...bestBySong.values()].sort((a,b)=>b.score-a.score);
    const best=ranked[0];
    const second=ranked[1]?.score||1;
    const ratio=best.score/second;
    if(best.raw<minVotes||ratio<minRatio)return null;
    const song=this.songs.find(s=>s.id===best.songId);
    if(!song)return null;
    return {
      song,
      offset:frameToSeconds(best.bucket*2),
      votes:Math.round(best.raw),
      weightedScore:best.score,
      ratio,
      queryHashes:query.length
    };
  }
}
