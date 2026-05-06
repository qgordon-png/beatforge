# BeatForge — Architecture

## Product
AI Co-Producer desktop app. Windows-first, Mac to follow.
Genre focus: Melodic Techno, Progressive House (Artbat, Sasha, Boris Brejcha, Deadmau5).

## Stack
- **Frontend:** Electron (cross-platform shell)
- **UI:** HTML/CSS/JS (React-like component system)
- **AI Backend:** Base44 hosted (no user API key needed)
- **MIDI Output:** Virtual MIDI via LoopMIDI → Ableton/any DAW
- **Audio Engine:** Tone.js for in-app preview

## Core Workflow (Step-by-Step)
1. **Scene Setup** — Genre, Key, BPM, Mood, Track Length
2. **Arrangement Grid** — Visual arrangement view (like DAW piano roll)
   - Rows = layers (Kick, Hats, Perc, Bass, Lead, Pad, FX)
   - Columns = sections (Intro, Build, Drop, Breakdown, Outro)
   - User designs the structure by toggling blocks on/off
3. **Layer Builder** — One layer at a time:
   - Start with DRUMS → design the kit, groove, pattern
   - Then BASS → AI generates contextual bass patterns
   - Then MELODY → AI writes around existing layers
   - Then PADS/FX → AI fills atmosphere
4. **AI Co-Producer** — Chat sidebar, context-aware per layer
5. **MIDI Export** — Per layer, per section, or full arrangement
6. **DAW Bridge** — Virtual MIDI out to LoopMIDI → Ableton

## Key Principle
The user makes every creative decision. The AI generates within those constraints.
"Feel like a producer while having Skippy on your shoulder."

## File Structure
```
beatforge/
├── package.json          # Electron + deps
├── main.js               # Electron main process
├── preload.js            # IPC bridge
├── src/
│   ├── index.html        # App shell
│   ├── styles.css         # Full UI stylesheet
│   ├── app.js            # Main app logic
│   ├── arrangement.js    # Arrangement grid component
│   ├── layerBuilder.js   # Layer-by-layer builder
│   ├── midi.js           # MIDI generation & output
│   ├── aiEngine.js       # AI co-producer interface
│   └── daw-bridge.js     # LoopMIDI virtual MIDI bridge
├── ai/
│   └── prompts.js        # Genre-specific prompt templates
└── assets/
    └── icon.png
```
