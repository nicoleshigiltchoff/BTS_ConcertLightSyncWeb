# ConcertLightSync

An iPhone SwiftUI prototype that:

1. Builds an on-device ShazamKit custom catalog from your own reference audio.
2. Listens through the iPhone microphone.
3. Identifies the programmed song and current reference-audio offset.
4. Starts or re-aligns a JSON lighting sequence at that offset.
5. Sends simplified RGB/brightness frames to a BTS Special Edition lightstick over BLE.

## Important limitations

- No copyrighted audio or Bora Waves sequence data is included.
- The supplied SE Bluetooth UUIDs and 9-byte packet format are a **community-derived candidate**, not verified here against your physical SE. Test manually and update `SEBluetoothProfile.json` as needed.
- ShazamKit aligns to the reference recording. Added concert intros, speeches, dance breaks, tempo changes, or alternate arrangements may temporarily prevent matching.
- Keep the app in the foreground during the show.

## Requirements

- macOS with Xcode 16 or newer recommended
- iPhone running iOS 17 or newer
- Apple Account signed into Xcode
- Your own legally obtained audio reference files
- Your own lighting cue JSON files
- Optional: XcodeGen (`brew install xcodegen`)

No third-party Swift packages are required. The app imports only Apple frameworks:

- `SwiftUI`
- `Foundation`
- `AVFoundation`
- `AVFAudio`
- `ShazamKit`
- `CoreBluetooth`

## Generate the Xcode project

From Terminal:

```bash
cd /path/to/ConcertLightSync
brew install xcodegen   # only if not already installed
xcodegen generate
open ConcertLightSync.xcodeproj
```

If you do not want XcodeGen, create a new iOS App project in Xcode named `ConcertLightSync`, choose SwiftUI and Swift, set iOS 17 as the minimum, then drag the entire `ConcertLightSync` source folder into the project. Select "Copy items if needed" and make sure the app target is checked. Remove Xcode's generated App and ContentView files to avoid duplicate types.

## Add a song

### 1. Add reference audio

Put an `.m4a`, `.mp3`, or `.wav` file in:

```
ConcertLightSync/Resources/ReferenceAudio/
```

Use the exact audio version to which the light sequence is timed. In Xcode, confirm the file belongs to the ConcertLightSync target and appears under Build Phases > Copy Bundle Resources.

### 2. Create sequence JSON

Create `Resources/Sequences/my-song.json`:

```json
{
  "id": "my-song",
  "title": "My Song",
  "artist": "Artist",
  "referenceAudioFile": "my-song.m4a",
  "referenceStartOffset": 0.0,
  "duration": 180.0,
  "cues": [
    { "time": 0.0, "frame": { "red": 255, "green": 0, "blue": 0, "brightness": 255 } },
    { "time": 4.2, "frame": { "red": 80, "green": 0, "blue": 255, "brightness": 200 } }
  ]
}
```

`referenceStartOffset` is the position in the reference audio where sequence time zero occurs. For a full-song sequence it is usually `0.0`. For a 22-second sequence beginning 64.5 seconds into a song, use `64.5`.

### 3. Add the manifest entry

Edit `Resources/SequenceManifest.json`:

```json
{
  "sequences": [
    {
      "id": "my-song",
      "title": "My Song",
      "artist": "Artist",
      "referenceAudioFile": "my-song.m4a",
      "sequenceFile": "my-song.json"
    }
  ]
}
```

The title is used as Shazam metadata; the sequence ID is stored in the subtitle field and recovered from a match.

## Configure the SE BLE profile

Edit `Resources/SEBluetoothProfile.json`:

```json
{
  "deviceNamePrefixes": ["multiM"],
  "serviceUUID": "YOUR-SERVICE-UUID",
  "characteristicUUID": "YOUR-WRITE-CHARACTERISTIC-UUID",
  "packetFormat": "fanlightNineByte",
  "writeWithoutResponse": true,
  "foldBrightnessIntoRGB": true
}
```

Supported packet formats:

- `fanlightNineByte`: `01 FF 00 RR GG BB 00 00 checksum`
- `rawRGB`: `RR GG BB`
- `rawRGBBrightness`: `RR GG BB brightness`

`foldBrightnessIntoRGB` scales RGB by brightness before encoding. This is useful if the SE protocol exposes only RGB rather than a separate brightness control.

Before testing at a concert:

1. Turn on the SE in Bluetooth/app mode.
2. Tap Scan and connect.
3. Try Red, Green, Blue, and Off.
4. If connection succeeds but colors do not change, the UUID or packet format is wrong.
5. Inspect the official SE app traffic or use nRF Connect to determine the correct service and characteristic.

## Install and run on your iPhone

1. Connect the iPhone to the Mac with USB, or enable wireless debugging after initial pairing.
2. Unlock the iPhone and tap Trust if prompted.
3. In Xcode, open Xcode > Settings > Accounts and add your Apple Account.
4. Select the project, then the ConcertLightSync target.
5. Open Signing & Capabilities.
6. Enable Automatically manage signing.
7. Choose your Personal Team or paid developer team.
8. Change the bundle identifier to a unique value, such as `com.yourname.ConcertLightSync`.
9. Select your iPhone as the run destination in Xcode's toolbar.
10. Press Run.
11. On the iPhone, approve Developer Mode if iOS requests it and restart when prompted.
12. If iOS says the developer is untrusted, open Settings > General > VPN & Device Management and trust your development certificate.
13. Launch the app and grant Microphone and Bluetooth permissions.

A free Personal Team can install development builds on your own phone, but signing is temporary and may need renewal. A paid Apple Developer membership gives longer-lived provisioning and additional distribution options.

## First test without a lightstick

1. Replace the demo audio filename or add `demo-song.m4a`.
2. Run the app on the iPhone.
3. Play the exact reference audio from another device.
4. Tap Start listening.
5. Verify that the app displays the song, reference offset, confidence, and changing color preview.
6. Start playback in the middle of the song and confirm that the sequence joins at the corresponding position.

## Drift correction behavior

- New song: starts immediately at the recognized offset.
- Error below 0.25 s: ignored.
- Error from 0.25 to 0.75 s: half-corrected to reduce visible jumps.
- Error at or above 0.75 s: hard seek.
- Sequence frames are evaluated at 20 Hz, but BLE packets are sent only when the frame changes.

## Concert use checklist

- Test recognition using loud speaker playback plus crowd-noise recordings.
- Use the exact tour arrangement where available.
- Keep the phone microphone unobstructed.
- Keep the app open and disable Auto-Lock temporarily.
- Fully charge the iPhone and lightstick.
- Add a manual Off button and verify it before entering the venue.
- Respect venue rules and avoid transmitting anything other than a connection to your own lightstick.
