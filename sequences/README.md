# Sequence folder

This folder is intentionally empty. Sequence JSON files can be imported from the app and are stored in IndexedDB.

Canonical schema:

```json
{
  "id": "unique-id",
  "title": "Song title",
  "songKey": "audio filename or song title",
  "offset": 0,
  "commands": [
    {"time": 0.0, "color": "#000000", "brightness": 0, "effect": "Blackout"},
    {"time": 1.2, "color": "#7C3AED", "brightness": 1, "effect": "Solid"}
  ]
}
```

The importer also accepts arrays named `cues`, `events`, `timeline`, or `sequenceData`; time keys `timestamp`, `at`, `startTime`, `timeMs`, or `timestampMs`; and color keys `hexColor`, `hex`, or RGB arrays/objects.
