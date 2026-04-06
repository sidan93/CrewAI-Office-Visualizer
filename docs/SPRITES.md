# Hero Sprite Pack Contract

Character rendering is configured in `ui/src/agentSprites.ts`.
`OfficeCanvas` consumes this config to animate movement on the map.

## Source files

- Folder: `ui/src/assets/heroes/`
- Format: one `.png` per character

## Expected sheet layout

Each PNG is currently expected to be `64x128`:

- 4 rows (top to bottom): `down`, `left`, `right`, `up`
- 3 columns (left to right): `leftFootForward`, `legsTogether`, `rightFootForward`

## Animation behavior

- Walk cycle: `1-2-3-2-1` (0-based indices: `0-1-2-1-0`)
- Idle frame: center column (`legsTogether`)
- Agent-to-character mapping is deterministic by agent id

## Switching sprite packs

Replace files in `ui/src/assets/heroes/` and adjust constants/timing in `ui/src/agentSprites.ts` if new dimensions or frame layout differ.
