# Protocol notes from the supplied Bora Waves JavaScript

Recovered logic:

```js
function buildBtsPacket(hex, type = 'SE', mode = 1) {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  if (type === 'BTS_V4 LS') return new Uint8Array([r, g, b, mode]);
  const packet = [1, 1, 11, 0, 0, r, g, b, 0, 0];
  packet.push((packet.reduce((a, x) => a + x, 0) - 2) & 255);
  return new Uint8Array(packet);
}
```

For SE/V3, Bora Waves writes with `writeValueWithoutResponse`. It recognizes `multiM` and `BTS LIGHTSTICK3` as the same device family, and also filters for `BTS LIGHTSTICK_SE`.
