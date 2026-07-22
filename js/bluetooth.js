import { BLE } from './config.js';

export class LightstickManager extends EventTarget {
  constructor(log=console.log){super();this.devices=new Map();this.log=log;}
  supported(){return !!navigator.bluetooth;}
  async pair(){
    if(!this.supported()) throw new Error('Web Bluetooth is unavailable. On iPad, open this page in Bluefy.');
    const device=await navigator.bluetooth.requestDevice({filters:BLE.filters,optionalServices:[BLE.service]});
    return this.connectDevice(device);
  }
  async connectDevice(device){
    const server=device.gatt.connected?device.gatt:await device.gatt.connect();
    await delay(350); // Bluefy is more reliable with small gaps between GATT operations.
    const service=await server.getPrimaryService(BLE.service);
    await delay(250);
    const characteristic=await service.getCharacteristic(BLE.characteristic);
    const entry={id:device.id,name:device.name||'BTS Lightstick',device,characteristic,connected:true,lastWrite:0};
    this.devices.set(device.id,entry);
    device.addEventListener('gattserverdisconnected',()=>{entry.connected=false;this.dispatchEvent(new Event('change'));});
    this.dispatchEvent(new Event('change'));
    this.log(`Connected: ${entry.name}`);
    return entry;
  }
  disconnect(id){const d=this.devices.get(id);if(d?.device.gatt.connected)d.device.gatt.disconnect();this.devices.delete(id);this.dispatchEvent(new Event('change'));}
  buildPacket(hex,brightness=1){
    const rgb=hexToRgb(hex);
    const b=Math.max(0,Math.min(1,brightness));
    const r=Math.round(rgb.r*b),g=Math.round(rgb.g*b),bl=Math.round(rgb.b*b);
    const bytes=[1,1,11,0,0,r,g,bl,0,0];
    const checksum=(bytes.reduce((sum,v)=>sum+v,0)-2)&255;
    bytes.push(checksum);
    return new Uint8Array(bytes);
  }
  async sendColor(hex,brightness=1){
    const packet=this.buildPacket(hex,brightness);
    const tasks=[];
    for(const entry of this.devices.values()){
      if(!entry.device.gatt.connected) continue;
      tasks.push(this.write(entry,packet));
    }
    await Promise.allSettled(tasks);
  }
  async write(entry,packet){
    const wait=Math.max(0,45-(performance.now()-entry.lastWrite));
    if(wait) await delay(wait);
    if(entry.characteristic.properties.writeWithoutResponse) await entry.characteristic.writeValueWithoutResponse(packet);
    else await entry.characteristic.writeValue(packet);
    entry.lastWrite=performance.now();
  }
}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
function hexToRgb(hex){const s=hex.replace('#','').padEnd(6,'0');return{r:parseInt(s.slice(0,2),16)||0,g:parseInt(s.slice(2,4),16)||0,b:parseInt(s.slice(4,6),16)||0};}
