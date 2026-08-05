# Concert Lightstick Sync

A static, dependency-free web app for:

1. Pairing one or more BTS Special Edition / V3 lightsticks using Web Bluetooth.
2. Building a local Shazam-style constellation fingerprint catalog from a predetermined concert setlist.
3. Recognizing the currently playing song and estimating its playback position.
4. Playing a pre-programmed RGB/brightness sequence on all connected lightsticks.
5. Running from GitHub Pages and caching its application shell for offline use.

## Statement of purpose

This is a free, open-source fan project by ARMY for ARMY, made for the love of BTS. The intent is to improve concert-going experience for fans who bring a pre-V4 "Army Bomb" (BTS lightstick) to BTS shows. No artistic copyright or proprietary technology infringement is intended.

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
5. Open the resulting HTTPS URL in Bluefy on a smartphone/tablet.
6. Tap **Cache app for offline use** while online.
7. Before the concert, enable airplane mode or turn off Wi-fi while leaving Bluetooth on, reopen the page in Bluefy, and verify that it loads and reconnects.

GitHub Pages provides HTTPS, which is required by service workers and normally by Web Bluetooth.

## First-time setup

1. Open the page in Bluefy.
2. Pair each SE or V3 lightstick separately with **Pair another lightstick**.
3. (Optional) Import the concert audio and lighting sequence files. MP3 or M4A is appropriate; WAV is faster to decode but much larger. The audio and lighting sequence files for the pre-determined Arirang setlist (as of August 2026) are currently pre-loaded.
4. Wait for indexing to finish. Indexing can be CPU-heavy, so do this before the concert while plugged into power.
6. Make sure every song is mapped to its corresponding sequence. This should happen automatically for the pre-loaded files, but you may need to map manually ig you loaded your own.
7. Export a backup catalog.
8. Start listening. It's recommended to test against speakers playing reference tracks before the concert to ensure your microphone is working correctly.

## Recognition design

The app implements an in-browser constellation matcher:

- audio is converted to mono and resampled to 11,025 Hz;
- 2,048-sample FFT windows are analyzed every 512 samples;
- prominent local spectral peaks are selected;
- anchor/target peak pairs generate time-difference hashes;
- live microphone hashes vote for a song and time-offset alignment;
- repeated matches correct sequence drift.

This is the same broad family of technique popularized by Shazam, but it is a compact original implementation and will not have Shazam's decades of tuning. It works best when concert playback closely resembles the reference file. Live-only intros, long crowd pauses, pitch changes, medleys, and rearrangements can temporarily prevent matching.

## Bluefy and offline limitations

- Web Bluetooth requires a direct user gesture for each new device selection.
- Browsers do not persist an active GATT connection across complete app/browser termination.
- Keep Bluefy in the foreground during the show. Devices almost always suspend microphone analysis and timers in the background.
- Service-worker behavior can vary by Bluefy/iOS/Android version. Always test the exact cached workflow in airplane mode before relying on it.
- The app stores fingerprints, sequences, mappings, and backups in IndexedDB. Clearing Bluefy site data removes them.
- Multiple simultaneous lightsticks are supported, but practical reliability depends on Bluefy, device hardware, RF congestion, and the number of active GATT links.

## Files

```text
assets-manifest.json
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
js/repository-assets.js
js/sequences.js
audio/.gitkeep
audio/<audio files>
sequences/.gitkeep
sequences/<sequence files>
sequences/README.md
examples/example-sequence.json
README.md
```

## Cue sheets and fades

The sequence importer accepts bora-waves.com exports with `sequence.clips`,
`trackId: "color"`, and `trackId: "mode"`. Fade mode clips are rendered as
smooth RGB and brightness transitions at approximately 20 Bluetooth updates
per second. See `sequences/README.md`. It's recommended that you use bora-waves.com to create lighting cue sequences, though you can code them manually or use any other method to produce

## Bundling repository audio and sequences

GitHub Pages cannot list files in a folder automatically, so committed assets are declared in the root `assets-manifest.json`.

Example:

```json
{
  "audio": [
    {
      "id": "fire-test-audio-v1",
      "path": "fire-test.mp3",
      "title": "Fire Test"
    }
  ],
  "sequences": [
    {
      "id": "fire-test-sequence-v1",
      "path": "fire-test-sequence.json",
      "title": "Fire Test Sequence",
    }
  ]
}
```

Paths are resolved under `audio/` or `sequences/`. Full paths such as `audio/tests/sample.mp3` are also accepted.

At startup, the app:

1. fetches `assets-manifest.json`;
2. fingerprints any new bundled audio and stores its fingerprints in IndexedDB;
3. imports any new bundled sequences;
4. keeps manual browser uploads available.

Use stable IDs. When replacing the contents of an audio or sequence file, change its ID (for example from `-v1` to `-v2`) so the browser imports the new version rather than retaining the old IndexedDB record.

The service worker also reads the manifest during installation and caches all listed assets for offline use. After changing the manifest or files, bump the cache name in `sw.js` and reopen the site online before testing offline.


## Bluefy bundled-audio compatibility

Bundled audio is fetched as a Blob and decoded directly. The app does not create a synthetic browser `File`, because some Bluefy/iOS WebKit versions reject that constructor with `The string did not match the expected pattern`. Repository asset paths are also resolved against the deployed page URL, so GitHub Pages project subpaths work correctly.

## Improved recognition and concert-order awareness

Fingerprint version 2 improves recognition of songs whose strongest content is
not a distinctive bass line or isolated vocal:

- peaks are selected across multiple frequency bands, so quieter melodic and
  percussion detail is retained;
- more peaks and anchor pairs are stored per analysis frame;
- hashes that occur in many songs receive less weight than rare, identifying
  hashes;
- neighboring time-offset buckets are combined to tolerate small timing jitter.

Bundled repository audio is automatically re-indexed when the fingerprint
version changes. The first load after this update can therefore take longer.

A predetermined setlist can be declared in `assets-manifest.json` using the
exact audio IDs:

```json
{
  "concertOrder": [
    "opening-song-audio-v1",
    "second-song-audio-v1",
    "encore-song-audio-v1"
  ],
  "audio": [
    {
      "id": "opening-song-audio-v1",
      "path": "opening-song.mp3",
      "title": "Opening Song"
    }
  ],
  "sequences": []
}
```

Alternatively, add a numeric `order` field to every audio entry. Explicit
`concertOrder` takes precedence.

## Strict setlist selection and recognition

The **Select current concert song** section appears immediately after **Pair lightsticks**. Its full-width buttons are generated in the exact order listed by `concertOrder` in `assets-manifest.json`.

Tapping a song makes it the current concert position. Recognition then searches only:

1. the selected current song, so its playback offset can continue to update; and
2. the immediately following song, so the app can advance automatically when the next song begins.

All other songs are excluded from matching. The previous/current/next labels update whenever a button is tapped or the next song is recognized. This works contingent on a consistent concert order.

## Sticky recognition status

The main recognition-status card remains pinned below the app header while the rest of the page scrolls. This keeps the matched song, playback position, confidence, current cue, and listening controls visible while selecting songs or pairing lightsticks. The current-song section appears before the lightstick-pairing section.

## Community contribution aknowledgements

ARMY is a community full of enthusiastic people who are willing to commit extraordinary effort to fan projects for the love of BTS. This project would have been A LOT harder without the help of the following people:
- The creator of bora-waves.com, thanks to you I was able to figure out how to bluetooth pair and programmatically control the BTS lightsticks. Go check out their site, where anyone can make their own light show to any song and play public sequences created by other fans: bora-waves.com
- User @3r1kd4n on bora-waves.com, thank you for accurately coding every. single. song. on the Arirang world tour. I cannot imagine how many fancams you probably had to watch to get all the cues and how long it must have taken you to do that. That's dedication if I've ever seen it.
- Joshi Archives (BTS) YouTube channel, thank you for uploading cleaned and accurate performance versions of the songs from the Arirang tour, the audio in this matching project would not be as good without your contribution. Go check out their channel, they have a playlist containing all the setlist songs and every surprise song that's been played so far.
