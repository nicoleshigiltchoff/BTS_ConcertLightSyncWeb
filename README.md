# Concert Lightstick Sync

A static, dependency-free web app for:

1. Pairing one or more BTS Special Edition / V3 lightsticks using Web Bluetooth.
2. Building a local Shazam-style constellation fingerprint catalog from a predetermined concert setlist.
3. Recognizing the currently playing song and estimating its playback position.
4. Playing a pre-programmed RGB/brightness sequence on all connected lightsticks.
5. Running from GitHub Pages and caching its application shell for offline use.

## Bluetooth protocol recovered from the supplied Bora Waves chunks

Device filters:

- `BTS LIGHTSTICK_SE`
- `multiM`
- `BTS LIGHTSTICK3`

GATT service:

`00010203-0405-0607-0809-0a0b0c0d1911`

Writable characteristic:

`00010203-0405-0607-0809-0a0b0c0d2b19`

SE/V3 color packet:

`[01, 01, 0B, 00, 00, RR, GG, BB, 00, 00, CHECKSUM]`

where `CHECKSUM = (sum(all first ten bytes) - 2) & 0xFF`.

Bora Waves treats `multiM` and `BTS LIGHTSTICK3` as the same SE/V3 path. Brightness in this project is applied by scaling RGB because the supplied chunks do not expose a separate SE brightness command.

## GitHub Pages deployment

1. Create a GitHub repository.
2. Copy every file and folder from this project into the repository root. `index.html` must remain at the root.
3. Commit and push.
4. In GitHub: **Settings → Pages → Deploy from a branch**, choose `main` and `/ (root)`.
5. Open the resulting HTTPS URL in Bluefy on the iPad.
6. Tap **Cache app for offline use** while online.
7. Before the concert, enable airplane mode while leaving Bluetooth on, reopen the page in Bluefy, and verify that it loads and reconnects.

GitHub Pages provides HTTPS, which is required by service workers and normally by Web Bluetooth.

## First-time setup

1. Open the page in Bluefy.
2. Pair each SE or V3 lightstick separately with **Pair another lightstick**.
3. Import the concert audio files. MP3 or M4A is appropriate; WAV is faster to decode but much larger.
4. Wait for indexing to finish. Indexing can be CPU-heavy on an iPad, so do this before the concert while plugged into power.
5. Import sequence JSON files.
6. Map every song to its corresponding sequence.
7. Export a backup catalog.
8. Start listening and test against speakers playing the exact reference tracks.

## Recognition design

The app implements an in-browser constellation matcher:

- audio is converted to mono and resampled to 11,025 Hz;
- 2,048-sample FFT windows are analyzed every 512 samples;
- prominent local spectral peaks are selected;
- anchor/target peak pairs generate time-difference hashes;
- live microphone hashes vote for a song and time-offset alignment;
- repeated matches correct sequence drift.

This is the same broad family of technique popularized by Shazam, but it is a compact original implementation and will not have Shazam's decades of tuning. It works best when concert playback closely resembles the reference file. Live-only intros, crowd pauses, pitch changes, medleys, and rearrangements can temporarily prevent matching.

## Sequence format

See `examples/example-sequence.json` and `sequences/README.md`.

The supplied Bora Waves chunks contained Bluetooth packet construction and connection logic but did not contain a recoverable stored sequence payload. Therefore this project provides a canonical format and a tolerant importer instead of claiming an exact undocumented Bora database schema.

## Bluefy and offline limitations

- Web Bluetooth requires a direct user gesture for each new device selection.
- Browsers do not persist an active GATT connection across complete app/browser termination.
- Keep Bluefy in the foreground during the show. iPadOS can suspend microphone analysis and timers in the background.
- Service-worker behavior can vary by Bluefy/iOS version. Always test the exact cached workflow in airplane mode before relying on it.
- The app stores fingerprints, sequences, mappings, and backups in IndexedDB. Clearing Bluefy site data removes them.
- Multiple simultaneous lightsticks are supported, but practical reliability depends on Bluefy, iPad hardware, RF congestion, and the number of active GATT links.

## Files

```text
index.html
manifest.webmanifest
sw.js
css/app.css
js/app.js
js/bluetooth.js
js/config.js
js/db.js
js/fingerprint.js
js/matcher.js
js/recognizer.js
js/sequences.js
audio/.gitkeep
audio/README.md
sequences/.gitkeep
sequences/README.md
examples/example-sequence.json
README.md
```
