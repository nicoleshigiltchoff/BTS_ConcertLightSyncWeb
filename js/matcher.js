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
      // Common fingerprints (steady beats, broad noise, crowd sounds) matter
      // less; rare fingerprints that distinguish one or two songs matter more.
      this.hashWeights.set(hash,1+Math.log((total+1)/(count+1)));
    }
  }

  match(samples,options={}){
    const {minVotes=14,minRatio=1.25}=options;
    const query=fingerprintSamples(samples,AUDIO.targetSampleRate);
    const buckets=new Map();
    for(const [hash,qTime] of query){
      const refs=this.index.get(hash);
      if(!refs)continue;
      const hashWeight=this.hashWeights.get(hash)||1;
      for(const [songId,rTime] of refs){
        const bucket=Math.round((rTime-qTime)/2);
        const key=`${songId}|${bucket}`;
        const value=buckets.get(key)||{raw:0,weighted:0};
        value.raw++;
        value.weighted+=hashWeight;
        buckets.set(key,value);
      }
    }
    if(!buckets.size)return null;

    // Combine adjacent offset buckets so small timing/tempo jitter does not
    // split one good alignment into several weaker scores.
    const bestBySong=new Map();
    for(const [key,value] of buckets){
      const split=key.lastIndexOf('|');
      const songId=key.slice(0,split),bucket=Number(key.slice(split+1));
      let raw=value.raw,weighted=value.weighted;
      for(const neighbor of [-1,1]){
        const nearby=buckets.get(`${songId}|${bucket+neighbor}`);
        if(nearby){raw+=nearby.raw*.55;weighted+=nearby.weighted*.55;}
      }
      const prior=concertPrior(songId,options);
      const score=weighted*prior;
      const priorResult=bestBySong.get(songId);
      if(!priorResult||score>priorResult.score)bestBySong.set(songId,{songId,bucket,raw,weighted,prior,score});
    }

    const ranked=[...bestBySong.values()].sort((a,b)=>b.score-a.score);
    const best=ranked[0],second=ranked[1]?.score||1;
    const ratio=best.score/second;
    if(best.raw<minVotes||ratio<minRatio)return null;
    const song=this.songs.find(s=>s.id===best.songId);
    return {
      song,
      offset:frameToSeconds(best.bucket*2),
      votes:Math.round(best.raw),
      weightedScore:best.score,
      ratio,
      prior:best.prior,
      queryHashes:query.length
    };
  }
}

function concertPrior(songId,{concertAwareness=false,concertOrder=[],concertIndex=0,lookBehind=1,lookAhead=3}={}){
  if(!concertAwareness||!Array.isArray(concertOrder)||!concertOrder.length)return 1;
  const index=concertOrder.indexOf(songId);
  if(index<0)return .88;
  const distance=index-Math.max(0,Number(concertIndex)||0);
  if(distance===0)return 1.35;
  if(distance>0&&distance<=lookAhead)return 1.28-(distance-1)*.07;
  if(distance<0&&Math.abs(distance)<=lookBehind)return 1.08-(Math.abs(distance)-1)*.05;
  return .82;
}
