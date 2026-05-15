/* ═══════════════════════════════════════════════
   BFF — Main App Logic
═══════════════════════════════════════════════ */

// ─── STATE ───
const state = {
  idea: {
    role: 'melody',
    notes: [],
    text: '',
  },
  scene: {
    genre: 'melodic-techno',
    key: 'Am',
    bpm: 128,
    mood: 'driving',
    length: '6',
    energyArc: 'club-banger',
    atmosphere: 'euphoric',
    density: 'balanced',
  },
  arrangement: {},
  sectionDesigner: {},   // per-section: { intensity, tension, release, layerMix, fx }
  progression: {},    // per-section evolution: { 'si': { melody:{}, bass:{}, drums:{} } }
  drums: { style:'rolling', swing:15, density:5, humanise:30, pattern:{} },
  bass: { style:'rolling-sub', complexity:4, octave:1, notes:[] },
  melody: { style:'arp', complexity:5, density:5, notes:[] },
  pads: { style:'warm-pad', fx:[], notes:[] },
  currentStep: 'scene'
};

// Layer definitions
const LAYERS = [
  { id:'kick', name:'Kick',    color:'rgba(255,82,82,0.6)' },
  { id:'hats', name:'Hi-Hats', color:'rgba(255,200,82,0.6)' },
  { id:'perc', name:'Perc',    color:'rgba(255,140,50,0.6)' },
  { id:'bass', name:'Bass',    color:'rgba(107,179,255,0.6)' },
  { id:'lead', name:'Lead',    color:'rgba(201,168,76,0.7)' },
  { id:'pad',  name:'Pad',     color:'rgba(170,107,255,0.6)' },
  { id:'fx',   name:'FX',      color:'rgba(107,255,200,0.5)' },
];

// Section definitions based on track length
function getSections(length) {
  // If description interpreter set custom sections, use those
  if (state.scene && state.scene._customSections && state.scene._customSections.length) {
    return state.scene._customSections;
  }
  // Accept '6', '6min', or numeric
  const mins = parseFloat(String(length).replace('min','')) || 6;
  if (mins <= 4)  return ['Intro','Build','Drop','Breakdown','Drop 2','Outro'];
  if (mins <= 6)  return ['Intro','Build A','Drop A','Breakdown','Build B','Drop B','Outro'];
  if (mins <= 8)  return ['Intro','Build A','Drop A','Breakdown 1','Build B','Drop B','Breakdown 2','Drop C','Outro'];
  if (mins <= 10) return ['Intro','Build A','Drop A','Breakdown 1','Build B','Drop B','Breakdown 2','Build C','Drop C','Outro'];
  const base = ['Intro','Build A','Drop A','Breakdown 1','Build B','Drop B','Breakdown 2','Build C','Drop C'];
  const extra = Math.floor((mins - 10) / 2);
  for (let i = 0; i < extra; i++) {
    const letter = String.fromCharCode(68 + i);
    base.push(`Breakdown ${3+i}`, `Drop ${letter}`);
  }
  base.push('Outro');
  return base;
}

function getBarsPerSection(bpm, totalMins, numSections) {
  totalMins = parseFloat(String(totalMins).replace('min','')) || 6;
  const totalBars = Math.round((totalMins * bpm) / 4);
  return Math.max(4, Math.round(totalBars / numSections));
}

// ─── INTENT PROFILE ENGINE ──────────────────────────────────
// Maps (energyArc + atmosphere + density) → mathematical blueprint
// All downstream generation reads from this object

function computeIntentBlueprint() {
  const arc  = state.scene.energyArc  || 'club-banger';
  const atmo = state.scene.atmosphere || 'euphoric';
  const dens = state.scene.density    || 'balanced';

  // ── Base parameters per Energy Arc ──
  const arcParams = {
    'club-banger':    { bpmMin:128, bpmMax:132, swing:10, introLayers:2, dropLayers:6, breakdownLayers:1, melodyArc:'tight',    bassDrive:'rolling',  tension:'mid',  phraseGrowth:[2,4,4,8],   drumBuild:'steady'    },
    'festival-epic':  { bpmMin:126, bpmMax:130, swing:5,  introLayers:1, dropLayers:7, breakdownLayers:2, melodyArc:'bloom',     bassDrive:'walk',     tension:'high', phraseGrowth:[2,4,8,16],  drumBuild:'dramatic'  },
    'late-night-deep':{ bpmMin:120, bpmMax:126, swing:20, introLayers:3, dropLayers:5, breakdownLayers:3, melodyArc:'slow-burn', bassDrive:'minimal',  tension:'low',  phraseGrowth:[4,4,8,8],   drumBuild:'subtle'    },
    'peak-time':      { bpmMin:132, bpmMax:138, swing:8,  introLayers:1, dropLayers:8, breakdownLayers:1, melodyArc:'stab',      bassDrive:'driving',  tension:'max',  phraseGrowth:[2,2,4,8],   drumBuild:'relentless'},
    'journey':        { bpmMin:122, bpmMax:128, swing:15, introLayers:2, dropLayers:6, breakdownLayers:3, melodyArc:'evolve',    bassDrive:'progress', tension:'arc',  phraseGrowth:[2,4,8,16],  drumBuild:'story'     },
  };

  // ── Scale degree tension maps per atmosphere ──
  // Which scale degrees are introduced in each phase: intro → build → drop → breakdown → drop2
  const atmosphereTension = {
    'dark-industrial': { introDegs:[0,4],       buildDegs:[0,2,4,6],     dropDegs:[0,1,2,3,4,5,6], scaleMod:'phrygian',  scaleHint:'Phrygian / Locrian — dissonance, avoid the 2nd early' },
    'euphoric':        { introDegs:[0,2,4],      buildDegs:[0,2,3,4,5],   dropDegs:[0,1,2,3,4,5,6], scaleMod:'natural',   scaleHint:'Natural minor with 6th — emotional uplift on the 6th degree' },
    'hypnotic':        { introDegs:[0,4],        buildDegs:[0,2,4],       dropDegs:[0,2,4,5,6],     scaleMod:'dorian',    scaleHint:'Dorian — raised 6th creates forward motion without resolution' },
    'melancholic':     { introDegs:[0,3],        buildDegs:[0,2,3,5],     dropDegs:[0,2,3,4,5,6],   scaleMod:'aeolian',   scaleHint:'Aeolian — full natural minor, lean on the b7 for longing' },
    'tribal':          { introDegs:[0,5],        buildDegs:[0,2,4,5],     dropDegs:[0,2,4,5,6],     scaleMod:'pentatonic',scaleHint:'Minor pentatonic — strip to 5 notes, rhythm IS the melody' },
  };

  // ── Density multipliers ──
  const densityMult = { minimal:0.5, balanced:1.0, dense:1.4 };
  const mult = densityMult[dens] || 1.0;

  const ap = arcParams[arc]   || arcParams['club-banger'];
  const at = atmosphereTension[atmo] || atmosphereTension['euphoric'];

  // ── Drum density per section type ──
  const drumDensity = {
    intro:     Math.round(2  * mult),
    build:     Math.round(6  * mult),
    drop:      Math.round(8  * mult),
    breakdown: Math.round(2  * mult),
    outro:     Math.round(3  * mult),
  };

  // ── Melody note density (scale degrees active) per phase ──
  const melodyDensity = {
    intro:     at.introDegs.length,
    build:     at.buildDegs.length,
    drop:      Math.round(at.dropDegs.length * mult),
    breakdown: Math.max(2, at.introDegs.length - 1),
    outro:     at.introDegs.length,
  };

  // ── Velocity intensity per section type ──
  const velocityMap = {
    intro:     Math.round(45 * mult),
    build:     Math.round(65 * mult),
    drop:      Math.min(127, Math.round(95 * mult)),
    breakdown: Math.round(40 * mult),
    outro:     Math.round(35 * mult),
  };

  // ── Bass style per section ──
  const bassStyleMap = {
    intro:     'root',
    build:     ap.bassDrive === 'minimal' ? 'root' : 'walk',
    drop:      ap.bassDrive === 'driving' || ap.bassDrive === 'progress' ? 'progression' : 'walk',
    breakdown: 'root',
    outro:     'root',
  };

  // ── Swing by arc + atmosphere ──
  let swing = ap.swing;
  if (atmo === 'hypnotic' || atmo === 'tribal') swing += 8;
  if (arc === 'late-night-deep') swing += 5;
  swing = Math.min(35, swing);

  // BPM recommendation (don't force-change, just advise)
  const bpmAdvice = `${ap.bpmMin}–${ap.bpmMax}`;

  const blueprint = {
    arc, atmo, dens,
    bpmAdvice,
    swing,
    drumDensity,
    melodyDensity,
    velocityMap,
    bassStyleMap,
    phraseGrowth: ap.phraseGrowth,
    scaleHint:    at.scaleHint,
    introLayers:  Math.round(ap.introLayers * mult),
    dropLayers:   Math.round(ap.dropLayers  * mult),
    drumBuild:    ap.drumBuild,
    melodyArc:    ap.melodyArc,
    tension:      ap.tension,
    scaleDegrees: at,
  };

  state.intent = blueprint;
  return blueprint;
}

// Update the intent summary UI panel
function updateIntentSummary() {
  const bp = computeIntentBlueprint();
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  set('is-bpm',     `${bp.bpmAdvice} BPM recommended`);
  set('is-swing',   `${bp.swing}% groove offset`);
  set('is-intro',   `${bp.introLayers} layer${bp.introLayers>1?'s':''} — sparse entry`);
  set('is-drop',    `${bp.dropLayers} layer${bp.dropLayers>1?'s':''} at peak`);
  set('is-melody',  `${bp.melodyArc} — phrases: ${bp.phraseGrowth.join('→')} bars`);
  set('is-bass',    `${bp.bassStyleMap.drop} at drop / ${bp.bassStyleMap.intro} intro`);
  set('is-tension', bp.scaleHint);
}

// ─── PROGRESSION BLUEPRINT ENGINE ───────────────────────────
// Classify a section name into a role type
function classifySection(name) {
  const n = name.toLowerCase();
  if (n.includes('intro'))     return 'intro';
  if (n.includes('outro'))     return 'outro';
  if (n.includes('breakdown')) return 'breakdown';
  if (n.includes('build'))     return 'build';
  if (n.includes('drop'))      return 'drop';
  return 'drop';
}

// How many unique drops have appeared so far (1st drop = 1, 2nd = 2, etc.)
function getDropIndex(sections, currentIdx) {
  let count = 0;
  for (let i = 0; i <= currentIdx; i++) {
    if (classifySection(sections[i]) === 'drop') count++;
  }
  return count;
}

// Generate the evolution blueprint for every section
function buildProgressionBlueprint(sections) {
  const blueprint = {};
  sections.forEach((name, si) => {
    const role = classifySection(name);
    const dropIdx = role === 'drop' ? getDropIndex(sections, si) : 0;
    blueprint[si] = buildSectionEvolution(role, dropIdx, si, sections.length);
  });
  return blueprint;
}

// Per-section evolution state
function buildSectionEvolution(role, dropIdx, si, totalSections) {
  const intent = state.intent || {};
  // Melody phrase lengths: 2 bars intro motif → 4 bars first drop → 8 bars evolved drops
  // Bass: root only intro → walking first drop → full progression later
  // Drums: stripped intro/breakdown → full drop → perc layers added in later drops

  // Pull intent-computed values
  const iDrumDensity  = intent.drumDensity  || {};
  const iMelDensity   = intent.melodyDensity || {};
  const iVelocity     = intent.velocityMap   || {};
  const iBassStyle    = intent.bassStyleMap  || {};
  const iPhraseGrowth = intent.phraseGrowth  || [2,4,8,16];
  const iSwing        = intent.swing         || 10;

  // Phrase length from growth array: intro→build→drop→drop2+
  const phaseIdx = role === 'intro' ? 0 : role === 'build' ? 1 : role === 'drop' ? Math.min(2 + (dropIdx-1), iPhraseGrowth.length-1) : role === 'breakdown' ? 2 : 1;
  const phraseLen = iPhraseGrowth[phaseIdx] || 4;

  const evo = {
    melody: {
      phraseLen:   phraseLen,
      noteDensity: iMelDensity[role] || 3,
      octaveSpread: (role === 'drop' && dropIdx > 1) ? 1 : 0,
      intensity:   iVelocity[role]   || 70,
      motifNotes:  null,
      label:       '',
    },
    bass: {
      phraseLen:   phraseLen,
      style:       iBassStyle[role]  || 'root',
      octaveDepth: (role === 'drop') ? 1 : 0,
      intensity:   Math.min(127, (iVelocity[role] || 70) + 10),
      label:       '',
    },
    drums: {
      elements: ['kick'],
      density:  iDrumDensity[role]  || 3,
      swing:    role === 'drop' ? iSwing : role === 'build' ? Math.round(iSwing * 0.6) : 0,
      label:    '',
    }
  };

  if (role === 'intro') {
    evo.melody.phraseLen    = 2;
    evo.melody.noteDensity  = 2;
    evo.melody.octaveSpread = 0;
    evo.melody.intensity    = 45;
    evo.melody.label        = '2-bar motif seed';
    evo.bass.phraseLen      = 2;
    evo.bass.style          = 'root';
    evo.bass.intensity      = 70;
    evo.bass.label          = 'Root note only';
    evo.drums.elements      = ['kick'];
    evo.drums.density       = 2;
    evo.drums.label         = 'Kick only';
  } else if (role === 'build') {
    evo.melody.phraseLen    = 4;
    evo.melody.noteDensity  = 3;
    evo.melody.octaveSpread = 0;
    evo.melody.intensity    = 60;
    evo.melody.label        = '4-bar motif rising';
    evo.bass.phraseLen      = 4;
    evo.bass.style          = 'walk';
    evo.bass.intensity      = 85;
    evo.bass.label          = 'Walking root-fifth';
    evo.drums.elements      = ['kick','hats','perc'];
    evo.drums.density       = 6;
    evo.drums.swing         = 5;
    evo.drums.label         = 'Full kit building';
  } else if (role === 'drop') {
    if (dropIdx === 1) {
      evo.melody.phraseLen    = 4;
      evo.melody.noteDensity  = 4;
      evo.melody.octaveSpread = 0;
      evo.melody.intensity    = 90;
      evo.melody.label        = '4-bar phrase — melody introduced';
      evo.bass.phraseLen      = 4;
      evo.bass.style          = 'walk';
      evo.bass.octaveDepth    = 1;
      evo.bass.intensity      = 100;
      evo.bass.label          = 'Root + fifth, sub octave';
      evo.drums.elements      = ['kick','snare','hats','perc'];
      evo.drums.density       = 7;
      evo.drums.label         = 'Full groove';
    } else if (dropIdx === 2) {
      evo.melody.phraseLen    = 8;
      evo.melody.noteDensity  = 6;
      evo.melody.octaveSpread = 1;
      evo.melody.intensity    = 100;
      evo.melody.label        = '8-bar — evolved full melody';
      evo.bass.phraseLen      = 8;
      evo.bass.style          = 'progression';
      evo.bass.octaveDepth    = 1;
      evo.bass.intensity      = 110;
      evo.bass.label          = 'Full chord progression';
      evo.drums.elements      = ['kick','snare','hats','ohh','perc'];
      evo.drums.density       = 9;
      evo.drums.label         = 'Full kit + open hats';
    } else {
      // 3rd drop+ — maximum evolution
      evo.melody.phraseLen    = 16;
      evo.melody.noteDensity  = 7;
      evo.melody.octaveSpread = 1;
      evo.melody.intensity    = 110;
      evo.melody.label        = '16-bar — peak evolution';
      evo.bass.phraseLen      = 16;
      evo.bass.style          = 'progression';
      evo.bass.octaveDepth    = 1;
      evo.bass.intensity      = 115;
      evo.bass.label          = 'Driving chord progression';
      evo.drums.elements      = ['kick','snare','hats','ohh','perc'];
      evo.drums.density       = 10;
      evo.drums.label         = 'Peak energy — full layers';
    }
  } else if (role === 'breakdown') {
    evo.melody.phraseLen    = 8;
    evo.melody.noteDensity  = 3;
    evo.melody.octaveSpread = 0;
    evo.melody.intensity    = 55;
    evo.melody.label        = '8-bar stripped — pads carry it';
    evo.bass.phraseLen      = 8;
    evo.bass.style          = 'root';
    evo.bass.octaveDepth    = 0;
    evo.bass.intensity      = 65;
    evo.bass.label          = 'Root sub only';
    evo.drums.elements      = ['kick'];
    evo.drums.density       = 2;
    evo.drums.label         = 'Minimal — kick only';
  } else if (role === 'outro') {
    evo.melody.phraseLen    = 4;
    evo.melody.noteDensity  = 2;
    evo.melody.octaveSpread = 0;
    evo.melody.intensity    = 35;
    evo.melody.label        = '4-bar fading out';
    evo.bass.phraseLen      = 4;
    evo.bass.style          = 'root';
    evo.bass.intensity      = 60;
    evo.bass.label          = 'Root only, fading';
    evo.drums.elements      = ['kick','hats'];
    evo.drums.density       = 3;
    evo.drums.label         = 'Sparse — kick + hats';
  }

  return evo;
}


// Drum rows
const DRUM_ROWS = [
  { id:'kick',  name:'Kick' },
  { id:'snare', name:'Snare' },
  { id:'chh',   name:'CH Hat' },
  { id:'ohh',   name:'OH Hat' },
  { id:'perc',  name:'Perc' },
];

// ─── INIT ───

// ════════════════════════════════════════════════════════════
// IDEA SCREEN ENGINE
// The whole track starts here. One idea → everything else.
// ════════════════════════════════════════════════════════════

// Piano roll state
const ideaRoll = {
  notes: [],          // [{row, step, len, vel}]
  rows: 24,           // visible pitch rows
  bars: 2,
  snap: 1,            // steps (1=16th, 2=8th, 4=quarter)
  rootMidi: 69,       // A4 default
  scaleDegrees: [],   // MIDI notes that are in scale
  drawing: false,
  resizing: null,
  moving: null,
  moveOffsetStep: 0,
  moveOffsetRow: 0,
  startStep: null,
  startRow: null,
  activeNote: null,
};

const SCALES = {
  'Am':  [0,2,3,5,7,8,10],
  'Cm':  [0,2,3,5,7,8,10],
  'Dm':  [0,2,3,5,7,8,10],
  'Em':  [0,2,3,5,7,8,10],
  'Fm':  [0,2,3,5,7,8,10],
  'Gm':  [0,2,3,5,7,8,10],
  'Bm':  [0,2,3,5,7,8,10],
  'Bbm': [0,2,3,5,7,8,10],
};

const KEY_ROOTS = {
  'Am':69,'Cm':60,'Dm':62,'Em':64,'Fm':65,'Gm':67,'Bm':71,'Bbm':70
};

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function ideaMidiToName(midi) {
  return NOTE_NAMES[midi % 12] + Math.floor(midi/12 - 1);
}

function initIdeaScreen() {
  // Mode toggle
  document.querySelectorAll('.idea-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.idea-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.getElementById('idea-pane-describe').classList.toggle('hidden', mode === 'draw');
      document.getElementById('idea-pane-draw').classList.toggle('hidden', mode === 'describe');
      if (mode === 'both') {
        document.getElementById('idea-pane-describe').classList.remove('hidden');
        document.getElementById('idea-pane-draw').classList.remove('hidden');
      }
      if (mode !== 'describe') initIdeaRoll();
    });
  });

  // Role buttons
  document.querySelectorAll('.idea-role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.idea-role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.idea.role = btn.dataset.role;
    });
  });

  // Parse idea button
  document.getElementById('idea-parse-btn')?.addEventListener('click', parseIdeaText);

  // Roll toolbar
  document.getElementById('idea-roll-key')?.addEventListener('change', e => {
    state.scene.key = e.target.value;
    document.getElementById('tb-key').textContent = e.target.value;
    ideaRoll.rootMidi = KEY_ROOTS[e.target.value] || 69;
    initIdeaRoll();
  });
  document.getElementById('idea-roll-bars')?.addEventListener('change', e => {
    ideaRoll.bars = parseInt(e.target.value);
    initIdeaRoll();
  });
  document.getElementById('idea-roll-snap')?.addEventListener('change', e => {
    ideaRoll.snap = parseInt(e.target.value);
  });
  document.getElementById('idea-roll-clear')?.addEventListener('click', () => {
    ideaRoll.notes = [];
    drawIdeaRoll();
  });
  document.getElementById('idea-play-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[BF] Play idea clicked, ideaRoll.notes=', ideaRoll.notes.length);
    // playIdeaRoll -> BF_Audio.playSequence -> start() handles AudioContext internally
    playIdeaRoll();
  });
  document.getElementById('idea-roll-suggest')?.addEventListener('click', suggestIdeaPhrase);
  document.getElementById('idea-roll-quant')?.addEventListener('click', quantiseIdeaRoll);

  // Build button
  // Entry screen
  initEntryScreen();
  // Legacy build btn (kept for compatibility)
  document.getElementById('idea-build-btn')?.addEventListener('click', buildTrackFromIdea);

  // Blueprint strip live update
  updateIdeaBlueprintStrip();
  initIdeaRoll();
}

// ── Piano Roll Renderer ──

// Stub: bass roll uses same engine, just different canvas
function initIdeaRollOnCanvas(canvas, keysEl, role, rollState) {
  // Delegate to main idea roll init — bass roll shares the same canvas logic
  // In a future version this creates a fully independent piano roll instance
  // For now, initialise the main roll if canvas is the melody one, otherwise basic grid
  if (canvas && canvas.id === 'idea-roll-canvas') { initIdeaRoll(); return; }
  // Bass roll: 2-octave range centred on bass register (MIDI 36-60)
  if (!canvas) return;
  const W = canvas.parentElement?.clientWidth || 500;
  const ROWS = 24; const ROW_H = 18;
  canvas.width  = W; canvas.height = ROWS * ROW_H;
  const ctx = canvas.getContext('2d');
  const bassNotes = [];
  for (let r = 0; r < ROWS; r++) {
    const midi = 60 - r;
    const isBlack = [1,3,6,8,10].includes(midi % 12);
    ctx.fillStyle = isBlack ? '#0a0a0a' : '#111';
    ctx.fillRect(0, r*ROW_H, W, ROW_H-1);
  }
  // Simple click-to-add for bass roll
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const row  = Math.floor((e.clientY - rect.top) / ROW_H);
    const step = Math.floor(((e.clientX - rect.left) / W) * 32);
    const midi = 60 - row;
    rollState.notes.push({ step, len: 2, note: midi, vel: 90 });
    ctx.fillStyle = 'rgba(201,168,76,0.85)';
    ctx.fillRect(step*(W/32), row*ROW_H+1, (W/32)*2-2, ROW_H-3);
    // Play note
    playPreviewNote(midi, 'bass');
  });
  if (keysEl) {
    keysEl.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      const midi = 60 - r;
      const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      const name  = names[midi % 12];
      const isBlack = [1,3,6,8,10].includes(midi % 12);
      const div = document.createElement('div');
      div.className = `ir-key ${isBlack ? 'ir-key-black' : 'ir-key-white'}`;
      div.textContent = name + Math.floor(midi/12-1);
      div.style.height = ROW_H + 'px';
      keysEl.appendChild(div);
    }
  }
}

function initIdeaRoll() {
  const key      = document.getElementById('idea-roll-key')?.value || 'Am';
  const root     = KEY_ROOTS[key] || 69;
  const scale    = SCALES[key]    || [0,2,3,5,7,8,10];
  ideaRoll.rootMidi    = root;
  ideaRoll.scaleDegrees = [];

  // Build key labels
  const keyEl = document.getElementById('idea-roll-keys');
  if (!keyEl) return;
  keyEl.innerHTML = '';

  // 24 rows from root+12 down to root-12
  for (let i = 0; i < ideaRoll.rows; i++) {
    const midi    = root + 12 - i;
    const pc      = ((midi % 12) + 12) % 12;
    const isScale = scale.includes(pc);
    const isRoot  = pc === (root % 12);
    if (isScale) ideaRoll.scaleDegrees.push(midi);
    const d = document.createElement('div');
    d.className = 'irk-key ' + (isRoot ? 'root-deg' : isScale ? 'scale-deg' : ([1,3,6,8,10].includes(pc) ? 'black' : 'white'));
    d.textContent = isRoot || isScale ? NOTE_NAMES[pc] : '';
    keyEl.appendChild(d);
  }

  drawIdeaRoll();
  attachIdeaRollEvents();
}

function drawIdeaRoll() {
  const canvas = document.getElementById('idea-roll-canvas');
  if (!canvas) return;
  const totalSteps = ideaRoll.bars * 16;
  const stepW = 28;
  const rowH  = Math.floor(220 / ideaRoll.rows);
  canvas.width  = totalSteps * stepW;
  canvas.height = ideaRoll.rows * rowH;
  const ctx = canvas.getContext('2d');

  const key   = document.getElementById('idea-roll-key')?.value || 'Am';
  const root  = KEY_ROOTS[key] || 69;
  const scale = SCALES[key]    || [0,2,3,5,7,8,10];

  // ── Scale guidelines ──
  // Chord tones for current atmosphere (scale degrees 0,2,4 = root,3rd,5th)
  const chordTonePCs = [0, 4, 7].map(d => ((root % 12) + d + 12) % 12); // root, major 3rd/minor 3rd, 5th
  const scaleChordPCs = [scale[0]%12, scale[2]%12, scale[4]%12];

  for (let r = 0; r < ideaRoll.rows; r++) {
    const midi = root + 12 - r;
    const pc   = ((midi%12)+12)%12;
    const isScale     = scale.includes(pc);
    const isRoot      = pc === (root % 12);
    const isChordTone = scaleChordPCs.includes(pc);
    const isBlack     = [1,3,6,8,10].includes(pc);

    // Row background — chord tones glow gold, scale notes slightly warm, others dark
    if (isRoot) {
      ctx.fillStyle = '#1f1800';
    } else if (isChordTone) {
      ctx.fillStyle = '#161200';
    } else if (isScale) {
      ctx.fillStyle = '#0f0f0a';
    } else if (isBlack) {
      ctx.fillStyle = '#080808';
    } else {
      ctx.fillStyle = '#0d0d0d';
    }
    ctx.fillRect(0, r*rowH, canvas.width, rowH);

    // Guide stripe on left edge for scale/chord tones
    if (isRoot) {
      ctx.fillStyle = '#c9a84c';
      ctx.fillRect(0, r*rowH, 3, rowH);
    } else if (isChordTone) {
      ctx.fillStyle = '#c9a84c66';
      ctx.fillRect(0, r*rowH, 2, rowH);
    } else if (isScale) {
      ctx.fillStyle = '#c9a84c22';
      ctx.fillRect(0, r*rowH, 1, rowH);
    }

    // Row separator line
    ctx.strokeStyle = isRoot ? '#c9a84c44' : isScale ? '#222210' : '#141414';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,r*rowH); ctx.lineTo(canvas.width,r*rowH); ctx.stroke();
  }

  // Beat/bar lines
  for (let s = 0; s < totalSteps; s++) {
    const x = s * stepW;
    ctx.strokeStyle = s % 16 === 0 ? '#c9a84c55' : s % 4 === 0 ? '#2a2a2a' : '#1a1a1a';
    ctx.lineWidth = s % 16 === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
  }

  // Notes
  ideaRoll.notes.forEach(n => {
    const x   = n.step * stepW;
    const y   = n.row  * rowH + 1;
    const w   = Math.max(stepW*0.6, n.len * stepW - 2);
    const h   = rowH - 2;
    ctx.fillStyle   = '#c9a84c';
    ctx.strokeStyle = '#e6c86a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x+1,y,w,h,3) : ctx.rect(x+1,y,w,h);
    ctx.fill(); ctx.stroke();

    // Velocity bar
    ctx.fillStyle = '#00000066';
    ctx.fillRect(x+1, y+h-3, w, 3);
    ctx.fillStyle = '#e6c86a';
    ctx.fillRect(x+1, y+h-3, w*(n.vel/127), 3);
  });
}

// Stored handlers so we can remove & re-add cleanly without cloning the canvas
const _rollHandlers = {};

function attachIdeaRollEvents() {
  const canvas = document.getElementById('idea-roll-canvas');
  if (!canvas) return;

  // Strip any previously attached named handlers
  if (_rollHandlers.mousedown) canvas.removeEventListener('mousedown', _rollHandlers.mousedown);
  if (_rollHandlers.mousemove) canvas.removeEventListener('mousemove', _rollHandlers.mousemove);
  if (_rollHandlers.mouseup)   canvas.removeEventListener('mouseup',   _rollHandlers.mouseup);
  if (_rollHandlers.contextmenu) canvas.removeEventListener('contextmenu', _rollHandlers.contextmenu);

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const totalSteps = ideaRoll.bars * 16;
    const stepW = canvas.width / totalSteps || 28;
    const rowH  = canvas.height / ideaRoll.rows || 9;
    const scaleX = rect.width  > 0 ? canvas.width  / rect.width  : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const x     = (e.clientX - rect.left) * scaleX;
    const y     = (e.clientY - rect.top)  * scaleY;
    return {
      step: Math.max(0, Math.floor(x / stepW)),
      row:  Math.max(0, Math.min(ideaRoll.rows - 1, Math.floor(y / rowH))),
      stepW, rowH
    };
  };

  _rollHandlers.mousedown = (e) => {
    try {
      e.preventDefault();
      const {step, row, stepW, rowH} = getPos(e);
      // Right-click = delete
      if (e.button === 2) {
        ideaRoll.notes = ideaRoll.notes.filter(n => !(n.row===row && step>=n.step && step<n.step+n.len));
        drawIdeaRoll(); return;
      }
      const snap = ideaRoll.snap;
      const snapped = Math.round(step / snap) * snap;
      const existing = ideaRoll.notes.find(n => n.row===row && step>=n.step && step<n.step+n.len);

      if (existing) {
        // Click near right edge (last 25%) = resize; click body = move or delete
        const noteRightEdge = (existing.step + existing.len) * stepW;
        const noteLeftEdge  = existing.step * stepW;
        const noteWidth     = existing.len * stepW;
        // Get raw x pixel position
        const rect = document.getElementById('idea-roll-canvas').getBoundingClientRect();
        const scaleX = rect.width > 0 ? (document.getElementById('idea-roll-canvas').width / rect.width) : 1;
        const rawX = (e.clientX - rect.left) * scaleX;
        const posInNote = rawX - noteLeftEdge;
        if (posInNote > noteWidth * 0.75) {
          // Resize mode
          ideaRoll.resizing = existing;
          ideaRoll.startStep = snapped;
        } else {
          // Move mode — track offset within note
          ideaRoll.moving = existing;
          ideaRoll.moveOffsetStep = step - existing.step;
          ideaRoll.moveOffsetRow  = row  - existing.row;
          ideaRoll.startStep = snapped;
          ideaRoll.startRow  = row;
        }
      } else {
        // Empty cell — draw new note. But if it's a second click on same cell, play note for feedback
        const newNote = { row, step: snapped, len: snap, vel: 100 };
        ideaRoll.notes.push(newNote);
        ideaRoll.activeNote = newNote;
        ideaRoll.drawing = true;
        ideaRoll.startStep = snapped;
        // 🎵 Play note on placement — makes the grid feel alive
        playPreviewNote(newNote.note, state.idea.role || 'melody');
        // Audition the pitch
        const root = ideaRoll.rootMidi;
        const midi = root + 12 - row;
        BF_Audio.playNote(midi, 'melody', 0.2).catch(()=>{});
      }
      drawIdeaRoll();
    } catch(err) { console.error('Roll mousedown error:', err); }
  };

  _rollHandlers.mousemove = (e) => {
    try {
      if (!ideaRoll.drawing && !ideaRoll.resizing && !ideaRoll.moving) return;
      const {step, row} = getPos(e);
      const snap = ideaRoll.snap;
      const snapped = Math.max(0, Math.round(step/snap)*snap);
      if (ideaRoll.drawing && ideaRoll.activeNote) {
        ideaRoll.activeNote.len = Math.max(snap, snapped - ideaRoll.activeNote.step + snap);
        drawIdeaRoll();
      }
      if (ideaRoll.resizing) {
        ideaRoll.resizing.len = Math.max(snap, snapped - ideaRoll.resizing.step + snap);
        drawIdeaRoll();
      }
      if (ideaRoll.moving) {
        const newStep = Math.max(0, snapped - Math.round(ideaRoll.moveOffsetStep/snap)*snap);
        const newRow  = Math.max(0, Math.min(ideaRoll.rows-1, row - ideaRoll.moveOffsetRow));
        ideaRoll.moving.step = newStep;
        ideaRoll.moving.row  = newRow;
        drawIdeaRoll();
      }
    } catch(err) { console.error('Roll mousemove error:', err); }
  };

  _rollHandlers.mouseup = () => {
    ideaRoll.drawing  = false;
    ideaRoll.resizing = null;
    ideaRoll.moving   = null;
    ideaRoll.activeNote = null;
    commitIdeaRollToState();
  };

  _rollHandlers.contextmenu = (e) => e.preventDefault();

  canvas.addEventListener('mousedown',   _rollHandlers.mousedown);
  canvas.addEventListener('mousemove',   _rollHandlers.mousemove);
  canvas.addEventListener('mouseup',     _rollHandlers.mouseup);
  canvas.addEventListener('contextmenu', _rollHandlers.contextmenu);
}

function commitIdeaRollToState() {
  const key   = document.getElementById('idea-roll-key')?.value || 'Am';
  const root  = KEY_ROOTS[key] || 69;
  state.idea.notes = ideaRoll.notes.map(n => ({
    note:     root + 12 - n.row,
    time:     n.step,
    duration: n.len,
    velocity: n.vel,
  }));
}

// ── Idea Roll Transport ──
function playIdeaRoll() {
  try {
  const role  = state.idea?.role || 'melody';
  const bpm   = parseInt(document.getElementById('bpm-val')?.value) || 128;
  const key   = document.getElementById('idea-roll-key')?.value || 'Am';
  const root  = KEY_ROOTS[key] || 69;

  const notes = ideaRoll.notes.map(n => ({
    note: root + 12 - n.row,
    step: n.step,
    len:  n.len,
    vel:  n.vel,
  }));

  if (!notes.length) {
    // Switch to Draw tab if not already there
    const drawPane = document.getElementById('idea-pane-draw');
    const drawBtn = document.querySelector('.idea-mode-btn[data-mode="draw"]');
    if (drawPane && drawPane.classList.contains('hidden')) {
      document.querySelectorAll('.idea-mode-btn').forEach(b => b.classList.remove('active'));
      if (drawBtn) drawBtn.classList.add('active');
      document.getElementById('idea-pane-describe')?.classList.add('hidden');
      drawPane.classList.remove('hidden');
      initIdeaRoll();
    }
    // Flash the status
    const _irs = document.getElementById('idea-roll-status');
    if (_irs) {
      _irs.textContent = '⚠ Draw some notes on the piano roll first, then hit Play.';
      _irs.style.color = '#C9A84C';
      setTimeout(() => { _irs.style.color = ''; _irs.textContent = 'Click = add · Drag right edge = resize · Drag body = move · Right-click = delete'; }, 3000);
    }
    // Flash the canvas border
    const canvas = document.getElementById('idea-roll-canvas');
    if (canvas) {
      canvas.style.boxShadow = '0 0 0 2px #C9A84C';
      setTimeout(() => { canvas.style.boxShadow = ''; }, 1500);
    }
    return;
  }

  if (BF_Audio.getIsPlaying()) {
    BF_Audio.stopAll();
    updateIdeaTransport(false);
    return;
  }

  updateIdeaTransport(true);
  const _irs = document.getElementById('idea-roll-status'); if(_irs) _irs.textContent = '▶ Playing…';

  BF_Audio.playSequence(notes, bpm, role,
    (step) => highlightRollStep(step),
    () => {
      updateIdeaTransport(false);
      clearRollHighlight();
      const _irs = document.getElementById('idea-roll-status'); if(_irs) _irs.textContent = 'Click = add · Drag right edge = resize · Drag body = move · Right-click = delete';
    }
  ).catch(err => console.warn('Audio play error:', err));
  } catch(err) { console.error('playIdeaRoll crash:', err); }
}

function updateIdeaTransport(playing) {
  const btn = document.getElementById('idea-play-btn');
  if (!btn) return;
  btn.textContent = playing ? '⏹ Stop' : '▶ Play idea';
  btn.classList.toggle('playing', playing);
}

function highlightRollStep(step) {
  // Draw a playhead line on the canvas
  const canvas = document.getElementById('idea-roll-canvas');
  if (!canvas) return;
  const totalSteps = ideaRoll.bars * 16;
  const stepW = canvas.width / totalSteps;
  drawIdeaRoll();
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ffffff55';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(step * stepW, 0);
  ctx.lineTo(step * stepW, canvas.height);
  ctx.stroke();
}

function clearRollHighlight() {
  drawIdeaRoll();
}

// ── Suggest a phrase based on intent ──
function suggestIdeaPhrase() {
  const bp   = computeIntentBlueprint();
  const key  = document.getElementById('idea-roll-key')?.value || 'Am';
  const root = KEY_ROOTS[key] || 69;
  const scale = SCALES[key] || [0,2,3,5,7,8,10];
  const arc  = state.scene.energyArc || 'club-banger';
  const atmo = state.scene.atmosphere || 'euphoric';
  ideaRoll.notes = [];

  // Build scale note pool (within 2 octaves of root)
  const pool = [];
  for (let oct = 0; oct < 2; oct++) {
    scale.forEach(deg => pool.push(root + deg + oct*12));
  }

  const totalSteps = ideaRoll.bars * 16;
  const role = state.idea.role || 'melody';

  if (role === 'groove') {
    // Rhythmic pattern on single pitch
    const kickPitch = root - 12;
    const patterns = {
      'club-banger':   [0,4,8,12],
      'festival-epic': [0,3,6,9,12],
      'late-night-deep':[0,6,12],
      'peak-time':     [0,2,4,6,8,10,12,14],
      'journey':       [0,4,8,10,12],
    };
    const pat = patterns[arc] || [0,4,8,12];
    pat.forEach(step => {
      const row = ideaRoll.rows - 1 - Math.round((kickPitch - root + 12) / 24 * ideaRoll.rows);
      ideaRoll.notes.push({ row: Math.min(ideaRoll.rows-1, Math.max(0, row)), step, len: 1, vel: 100 });
    });
  } else if (role === 'bass') {
    // Root movement — sparse, lower register
    const bassNotes = [root-12, root-12+scale[4], root-12+scale[2]];
    const steps = arc === 'peak-time' ? [0,4,6,10,12] : [0,8,12];
    steps.forEach((step, i) => {
      const midi = bassNotes[i % bassNotes.length];
      const row  = Math.round((root+12 - midi) / 24 * ideaRoll.rows);
      ideaRoll.notes.push({ row: Math.min(ideaRoll.rows-1, Math.max(0,row)), step, len: arc==='club-banger' ? 3 : 7, vel: 110 });
    });
  } else if (role === 'arp') {
    // Rapid arpeggiated pattern through scale degrees
    const arpPool = scale.slice(0,4).map(d => root+d);
    const arpRates = { 'club-banger':1,'festival-epic':2,'late-night-deep':2,'peak-time':1,'journey':2 };
    const rate = arpRates[arc] || 2;
    for (let s = 0; s < totalSteps; s += rate) {
      const midi = arpPool[Math.floor(s/rate) % arpPool.length];
      const row  = Math.round((root+12 - midi) / 24 * ideaRoll.rows);
      ideaRoll.notes.push({ row: Math.min(ideaRoll.rows-1, Math.max(0,row)), step:s, len:rate, vel: 85 + (s%4===0?15:0) });
    }
  } else {
    // Melody / Lead — phrase based on atmosphere
    const phrases = {
      'dark-industrial': [[0,0],[4,2],[6,4],[8,0],[10,6],[12,3]],
      'euphoric':        [[0,4],[2,5],[4,6],[6,5],[8,4],[10,6],[12,7],[14,5]],
      'hypnotic':        [[0,0],[4,0],[6,2],[8,0],[12,4],[14,2]],
      'melancholic':     [[0,4],[3,3],[6,2],[9,0],[12,3],[14,1]],
      'tribal':          [[0,0],[2,4],[4,0],[6,4],[8,0],[10,4],[12,0],[14,4]],
    };
    const phrase = phrases[atmo] || phrases['euphoric'];
    const lengths= { 'dark-industrial':3,'euphoric':2,'hypnotic':4,'melancholic':3,'tribal':2 };
    const noteLen = lengths[atmo] || 2;
    phrase.forEach(([step, degIdx]) => {
      if (step >= totalSteps) return;
      const deg  = scale[degIdx % scale.length];
      const midi = root + deg;
      const row  = Math.round((root+12 - midi) / 24 * ideaRoll.rows);
      ideaRoll.notes.push({ row: Math.min(ideaRoll.rows-1, Math.max(0,row)), step, len:noteLen, vel: step===0 ? 110 : 90 });
    });
  }

  drawIdeaRoll();
  commitIdeaRollToState();
  const _irs = document.getElementById('idea-roll-status'); if(_irs) _irs.textContent = `Suggested ${ideaRoll.notes.length} notes — tweak freely then hit Build.`;
}

// ── Quantise all notes to current snap ──
function quantiseIdeaRoll() {
  const snap = ideaRoll.snap;
  ideaRoll.notes = ideaRoll.notes.map(n => ({
    ...n,
    step: Math.round(n.step/snap)*snap,
    len:  Math.max(snap, Math.round(n.len/snap)*snap),
  }));
  drawIdeaRoll();
  commitIdeaRollToState();
}

// ── Parse plain text description → pitch/rhythm parameters ──
function parseIdeaText() {
  const text = (document.getElementById('idea-text')?.value || '').toLowerCase();
  const show = document.getElementById('idea-parsed');
  if (!show || !text.trim()) return;

  // Key detection
  const keyMap = {
    'minor':'Am','dark':'Am','sad':'Am','melancholic':'Am','dorian':'Dm',
    'phrygian':'Em','major':'C','happy':'C','uplifting':'C','tribal':'Dm',
  };
  let detectedKey = 'Am';
  Object.entries(keyMap).forEach(([word, key]) => { if (text.includes(word)) detectedKey = key; });

  // BPM feel
  const bpmFeel = text.includes('slow') || text.includes('deep') ? '120–124' :
                  text.includes('fast') || text.includes('peak') || text.includes('driving') ? '132–138' :
                  text.includes('energetic') || text.includes('banger') ? '128–132' : '126–130';

  // Phrase length
  const phrase = text.includes('four-note') || text.includes('4 note') ? '1 bar' :
                 text.includes('eight') || text.includes('8 note') ? '2 bars' :
                 text.includes('long') ? '4 bars' : '2 bars';

  // Character
  const chars = [];
  if (text.includes('dark') || text.includes('heavy')) chars.push('dark');
  if (text.includes('hypnotic') || text.includes('repetitive') || text.includes('minimal')) chars.push('hypnotic');
  if (text.includes('euphoric') || text.includes('uplifting') || text.includes('happy')) chars.push('euphoric');
  if (text.includes('cinematic') || text.includes('emotional')) chars.push('cinematic');
  if (text.includes('tribal') || text.includes('raw')) chars.push('tribal');
  const character = chars.join(' + ') || 'neutral';

  // Scale mode
  const scaleMode = text.includes('phrygian') ? 'Phrygian (2nd mode)' :
                    text.includes('dorian') ? 'Dorian (raised 6th)' :
                    text.includes('minor') || text.includes('dark') ? 'Natural minor (Aeolian)' :
                    text.includes('pentatonic') || text.includes('tribal') ? 'Minor pentatonic' :
                    text.includes('major') ? 'Major (Ionian)' : 'Natural minor';

  // Apply detected key to scene and roll
  state.scene.key = detectedKey;
  document.getElementById('tb-key').textContent = detectedKey;
  const rollKey = document.getElementById('idea-roll-key');
  if (rollKey) rollKey.value = detectedKey;
  ideaRoll.rootMidi = KEY_ROOTS[detectedKey] || 69;

  // Set atmosphere from text
  if (text.includes('dark') || text.includes('industrial')) state.scene.atmosphere = 'dark-industrial';
  else if (text.includes('euphoric') || text.includes('uplifting')) state.scene.atmosphere = 'euphoric';
  else if (text.includes('hypnotic') || text.includes('minimal')) state.scene.atmosphere = 'hypnotic';
  else if (text.includes('cinematic') || text.includes('emotional')) state.scene.atmosphere = 'melancholic';
  else if (text.includes('tribal') || text.includes('raw')) state.scene.atmosphere = 'tribal';

  // Show parsed
  show.style.display = 'grid';
  document.getElementById('ip-key').textContent    = detectedKey;
  document.getElementById('ip-bpm').textContent    = bpmFeel + ' BPM';
  document.getElementById('ip-phrase').textContent = phrase;
  document.getElementById('ip-char').textContent   = character;
  document.getElementById('ip-scale').textContent  = scaleMode;

  // Auto-suggest in roll if draw pane visible
  if (!document.getElementById('idea-pane-draw').classList.contains('hidden')) {
    initIdeaRoll();
    suggestIdeaPhrase();
  }

  updateIdeaBlueprintStrip();
}

// ── Blueprint strip updater ──
function updateIdeaBlueprintStrip() {
  const bp = computeIntentBlueprint();
  const s  = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  s('ibs-bpm',     bp.bpmAdvice);
  s('ibs-swing',   bp.swing + '%');
  s('ibs-phrases', (bp.phraseGrowth||[]).join('→') + ' bars');
  s('ibs-scale',   bp.scaleDegrees?.scaleHint?.split('—')[0]?.trim() || '—');
  s('ibs-drop',    bp.dropLayers + ' layers');

  // Also sync scene-level intent summary if visible
  if (typeof updateIntentSummary === 'function') updateIntentSummary();
}

// ── BUILD TRACK FROM IDEA ──

// ══════════════════════════════════════════════════════════════════
// BFF ENTRY SCREEN — Dynamic Starting Point
// ══════════════════════════════════════════════════════════════════

function showEntryScreen() {
  document.getElementById('bff-entry-screen').classList.remove('hidden');
  ['describe','beat','melody','bass'].forEach(f => {
    const el = document.getElementById(`bff-flow-${f}`);
    if (el) el.classList.add('hidden');
  });
}

function showFlow(name) {
  document.getElementById('bff-entry-screen').classList.add('hidden');
  ['describe','beat','melody','bass'].forEach(f => {
    const el = document.getElementById(`bff-flow-${f}`);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(`bff-flow-${name}`);
  if (target) {
    target.classList.remove('hidden');
    if (name === 'melody') initIdeaRoll();
    if (name === 'bass')   initBassRoll();
  }
}

function initEntryScreen() {
  // Entry card clicks
  document.querySelectorAll('.bff-entry-card').forEach(card => {
    card.addEventListener('click', () => showFlow(card.dataset.entry));
  });

  // Beat option selection
  document.querySelectorAll('.bff-beat-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.bff-beat-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      state.scene.groovePreset = opt.dataset.groove;
    });
  });

  // Beat build
  document.getElementById('beat-entry-build')?.addEventListener('click', () => {
    const groove = document.querySelector('.bff-beat-option.active')?.dataset.groove || 'four-on-floor';
    applyGroovePreset(groove);
    addMessage('bot', `🥁 Starting with a <strong>${groove.replace(/-/g,' ')}</strong> groove. I'll build the full arrangement around your beat — let's dial in the drums first.`);
    setTimeout(() => goToStep('scene'), 200);
    setTimeout(() => goToStep('drums'), 400);
  });

  // Describe: parse button
  document.getElementById('bff-parse-btn')?.addEventListener('click', interpretDescription);

  // Describe: re-parse
  document.getElementById('bir-reparse')?.addEventListener('click', interpretDescription);

  // Describe: build
  document.getElementById('bir-build')?.addEventListener('click', () => {
    applyInterpretedSections();
    addMessage('bot', `💬 Section skeleton locked. I've pre-filled the Section Designer based on your description — tweak any section then build. <em>Your words just became a track structure.</em>`);
    setTimeout(() => goToStep('scene'), 200);
    setTimeout(() => goToStep('arrangement'), 500);
  });

  // Melody build
  document.getElementById('melody-entry-build')?.addEventListener('click', () => {
    state.idea.role = document.querySelector('.idea-role-btn.active')?.dataset.role || 'melody';
    addMessage('bot', `🎹 Melody locked in — ${ideaRoll.notes.length} notes as your <strong>${state.idea.role}</strong>. Building arrangement around your phrase.`);
    setTimeout(() => goToStep('scene'), 200);
    setTimeout(() => goToStep('arrangement'), 500);
  });

  // Bass build
  document.getElementById('bass-entry-build')?.addEventListener('click', () => {
    state.idea.role = 'bass';
    if (bassRoll) state.bass.notes = [...bassRoll.notes];
    addMessage('bot', `◉ Bassline locked in. Building arrangement from your root movement.`);
    setTimeout(() => goToStep('scene'), 200);
    setTimeout(() => goToStep('arrangement'), 500);
  });

  // Idea role buttons
  document.querySelectorAll('.idea-role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.idea-role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.idea.role = btn.dataset.role;
    });
  });
}

// ── Groove presets ──
function applyGroovePreset(groove) {
  // Clear existing pattern
  Object.keys(state.drums.pattern).forEach(k => { state.drums.pattern[k] = false; });

  const patterns = {
    'four-on-floor': {
      kick:  [0,4,8,12],
      snare: [4,12],
      chh:   [2,6,10,14],
      ohh:   [4,12],
    },
    'half-time': {
      kick:  [0,8],
      snare: [8],
      chh:   [0,2,4,6,8,10,12,14],
      ohh:   [8],
    },
    'broken': {
      kick:  [0,3,8,11],
      snare: [4,13],
      chh:   [2,6,10,14],
      ohh:   [6],
      perc:  [1,5,9,13],
    },
    'tribal': {
      kick:  [0,1,3,4,6,8,9,11],
      snare: [4,12],
      chh:   [0,2,4,6,8,10,12,14],
      perc:  [1,3,5,7,9,11,13,15],
    },
  };

  const p = patterns[groove] || patterns['four-on-floor'];
  Object.entries(p).forEach(([row, steps]) => {
    steps.forEach(s => { state.drums.pattern[`${row}-${s}`] = true; });
  });
}

// ══════════════════════════════════════════════════════════════════
// NLP DESCRIPTION INTERPRETER
// Turns plain English into a section designer skeleton
// ══════════════════════════════════════════════════════════════════

// Keyword maps
const NLP_SECTIONS = [
  { keywords: ['intro','start','opening','beginning','first'],   role: 'intro'     },
  { keywords: ['build','build-up','buildup','ramp','rise','pre drop','pre-drop'], role: 'build' },
  { keywords: ['drop','hit','boom','bang','explode','kick in'],  role: 'drop'      },
  { keywords: ['break','breakdown','strip','stripped','quiet','silence','pause','empty'], role: 'breakdown' },
  { keywords: ['bridge','middle','mid section'],                 role: 'bridge'    },
  { keywords: ['outro','end','fade','close','finish'],           role: 'outro'     },
];

const NLP_LAYERS = {
  kick:  ['kick','four on the floor','beat','drum','thud','boom','bass drum'],
  snare: ['snare','clap','snap','fill','snare fill'],
  hats:  ['hat','hi-hat','hihat','cymbal','tick','sizzle'],
  perc:  ['perc','percussion','conga','bongo','shaker','tribal','texture'],
  bass:  ['bass','sub','rumble','low end','bassline'],
  arp:   ['arp','arpeggio','sequence','stab','riff'],
  lead:  ['lead','melody','hook','synth','motif','phrase'],
  pad:   ['pad','atmosphere','ambient','wash','strings','chord','chords','epic','cinematic','alien','space','otherworldly','ethereal','lush'],
};

const NLP_FX = {
  'filter-up':    ['build','ramp','filter sweep','sweep up','filter rise'],
  'riser':        ['riser','rise','tension','build up','buildup'],
  'filter-down':  ['filter down','sweep down','filter fall'],
  'downlifter':   ['drop','downlifter','fall','descend'],
  'silence-drop': ['silence','silence drop','sudden stop','dead stop','empty','nothing'],
  'stutter':      ['stutter','gate','chop','glitch','stuttering'],
  'rev-cymbal':   ['reverse cymbal','crash','reverse','sweep'],
};

const NLP_INTENSITY = {
  high:   ['epic','massive','huge','big','explode','boom','full','all in','hard','heavy','intense','booom','boomm'],
  medium: ['warm','groove','rolling','steady','flowing','moving'],
  low:    ['silence','quiet','minimal','empty','bare','stripped','nothing','sparse','subtle'],
};

function detectSections(text) {
  const sentences = text.toLowerCase()
    .replace(/[.!?]+/g, '|')
    .replace(/,\s*(then|but|and|after|suddenly|again)/g, '|$1')
    .replace(/(then|but|suddenly|again|this time|repeat)/g, '|$1')
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 2);

  const detected = [];
  let sectionCounter = { intro:0, build:0, drop:0, breakdown:0, bridge:0, outro:0, section:0 };

  sentences.forEach((sentence, si) => {
    // Identify section role
    let role = null;
    for (const sec of NLP_SECTIONS) {
      if (sec.keywords.some(k => sentence.includes(k))) { role = sec.role; break; }
    }
    if (!role) {
      // Heuristic: first sentence = intro, last = outro, otherwise section
      role = si === 0 ? 'intro' : si === sentences.length-1 ? 'outro' : 'section';
    }

    // Detect layers
    const activeLayers = {};
    Object.entries(NLP_LAYERS).forEach(([layer, keywords]) => {
      activeLayers[layer] = keywords.some(k => sentence.includes(k)) ? 10 : 0;
    });

    // Detect FX
    const fx = [];
    Object.entries(NLP_FX).forEach(([fxId, keywords]) => {
      if (keywords.some(k => sentence.includes(k))) fx.push(fxId);
    });

    // Detect intensity
    let intensity = 5;
    if (NLP_INTENSITY.high.some(k => sentence.includes(k)))   intensity = 9;
    if (NLP_INTENSITY.low.some(k => sentence.includes(k)))    intensity = 1;
    if (NLP_INTENSITY.medium.some(k => sentence.includes(k))) intensity = 5;

    // Silence = everything off
    const isSilence = ['silence','nothing','empty','pause','dead'].some(k => sentence.includes(k));
    if (isSilence) { Object.keys(activeLayers).forEach(l => activeLayers[l] = 0); intensity = 0; }

    // Detect repeat
    const isRepeat = ['repeat','again','this time','second time','once more'].some(k => sentence.includes(k));

    // Name the section
    sectionCounter[role] = (sectionCounter[role] || 0) + 1;
    const nameMap = { intro:'Intro', build:'Build', drop:'Drop', breakdown:'Breakdown', bridge:'Bridge', outro:'Outro', section:'Section' };
    const count = sectionCounter[role];
    const name = count > 1 ? `${nameMap[role]} ${count}` : nameMap[role];

    detected.push({ name, role, sentence, activeLayers, fx, intensity, isRepeat, isSilence });
  });

  return detected;
}

let _interpretedSections = [];

function interpretDescription() {
  const text = document.getElementById('bff-describe-text')?.value?.trim();
  if (!text) return;

  _interpretedSections = detectSections(text);
  if (!_interpretedSections.length) return;

  const result = document.getElementById('bff-interpret-result');
  const birSections = document.getElementById('bir-sections');
  if (!result || !birSections) return;

  const roleColors = {
    intro:'#6b6bff', build:'#ffaa33', drop:'#c9a84c',
    breakdown:'#9b59b6', bridge:'#3bbf8a', outro:'#555', section:'#888'
  };

  birSections.innerHTML = _interpretedSections.map((sec, i) => {
    const color = roleColors[sec.role] || '#888';
    const activeLayerNames = Object.entries(sec.activeLayers)
      .filter(([,v]) => v > 0).map(([k]) => k);
    const allLayers = ['kick','snare','hats','perc','bass','arp','lead','pad'];

    return `<div class="bir-section-row" style="--section-color:${color}">
      <div class="bir-sec-name">${sec.name}</div>
      <div class="bir-sec-layers">
        ${allLayers.map(l => `<span class="bir-layer-chip ${activeLayerNames.includes(l) ? 'active' : ''}">${l}</span>`).join('')}
        ${sec.fx.length ? `<span class="bir-layer-chip active" style="border-color:#3bbf8a;color:#3bbf8a">${sec.fx.join(' + ')}</span>` : ''}
      </div>
      <div class="bir-sec-note">${sec.isSilence ? '🔇 Silence' : `intensity ${sec.intensity}`}</div>
    </div>`;
  }).join('');

  result.classList.remove('hidden');
}

function applyInterpretedSections() {
  if (!_interpretedSections.length) return;

  // Re-init sectionDesigner with interpreted data
  _interpretedSections.forEach((sec, si) => {
    const mix = {};
    Object.entries(sec.activeLayers).forEach(([l, v]) => { mix[l] = v; });
    // Add reasonable defaults for zero layers
    if (!Object.values(mix).some(v => v > 0) && !sec.isSilence) {
      mix.pad = 7; mix.bass = 4;
    }

    state.sectionDesigner[si] = {
      name:      sec.name,
      intensity: sec.intensity,
      tension:   sec.role === 'build' ? 8 : sec.role === 'drop' ? 4 : sec.role === 'breakdown' ? 2 : 4,
      release:   sec.role === 'breakdown' ? 9 : sec.role === 'bridge' ? 7 : 3,
      layerMix:  mix,
      fx:        sec.fx,
      bars:      sec.role === 'breakdown' ? 8 : sec.role === 'drop' ? 8 : 4,
    };

    // Sync to arrangement state
    Object.keys(mix).forEach(layer => {
      state.arrangement[`${layer}-${si}`] = mix[layer] > 0;
    });
  });

  // Rebuild section names to match interpretation
  // Override getSections for this track
  state.scene._customSections = _interpretedSections.map(s => s.name);
}

// ── Bass roll (separate instance from melody roll) ──
let bassRoll = null;
function initBassRoll() {
  // Reuse the piano roll engine but pointed at the bass canvas
  // For now, seed a simple octave-lower version of the idea roll
  const canvas = document.getElementById('bass-roll-canvas');
  const keysEl = document.getElementById('bass-roll-keys');
  if (!canvas || !keysEl) return;
  // Use same init but with bass role
  if (!bassRoll) bassRoll = { notes: [], role: 'bass' };
  // Full piano roll init lives in initIdeaRoll — here we point a second instance
  // For simplicity, reuse the same canvas system but with bass key range
  initIdeaRollOnCanvas(canvas, keysEl, 'bass', bassRoll);
}

function buildTrackFromIdea() {
  const role  = state.idea.role || 'melody';
  const notes = state.idea.notes || [];
  const key   = state.scene.key;

  // Compute intent blueprint from current selections
  computeIntentBlueprint();

  // Seed the appropriate layer with the idea notes
  if (role === 'melody' || role === 'arp') {
    state.melody.notes = notes.length ? notes : state.melody.notes;
    if (role === 'arp') {
      // Also put in arp-specific slot
      state.arp = { notes: [...notes] };
    }
  } else if (role === 'bass') {
    state.bass.notes = notes.length ? notes : state.bass.notes;
  }

  // Auto-detect BPM from description if not already set
  const textEl = document.getElementById('idea-text');
  if (textEl?.value) parseIdeaText();

  addMessage('bot', `<strong>Idea locked in</strong> — ${notes.length} notes as your <em>${role}</em>. ${
    role==='melody' ? 'Drums and bass will build around your phrase.' :
    role==='bass'   ? 'Melody and drums will lock to your root movement.' :
    role==='groove' ? 'Everything layers on top of your groove.' :
    'The arp pattern seeds the harmonic framework.'
  } Blueprint: <strong>${(state.scene.energyArc||'').replace(/-/g,' ')} · ${(state.scene.atmosphere||'').replace(/-/g,' ')}</strong>. Swinging at <strong>${state.intent?.swing||10}%</strong>. Let's build.`);

  // Go straight to drums — first real creative step after locking the idea
  setTimeout(() => {
    goToStep('drums');
  }, 300);
}



// ── AUTO UPDATER UI ──────────────────────────────────────────
function initUpdaterUI() {
  // Version label — independent of button existence
  const verLabel = document.getElementById('tb-version-label');
  if (verLabel) {
    const _getVer = window.bff?.app?.getVersion;
    if (_getVer) {
      _getVer().then(v => { verLabel.textContent = 'v' + v; }).catch(() => { verLabel.textContent = 'v0.3.9'; });
    } else {
      verLabel.textContent = 'v0.3.9';
    }
  }

  const btn    = document.getElementById('tb-update-btn');
  const status = document.getElementById('tb-update-status');
  if (!btn || !status) return;

  // Listen for update events from main process
  if (window.electronAPI?.onUpdateAvailable) {
    window.electronAPI.onUpdateAvailable((info) => {
      status.textContent = '';
      btn.style.display = 'inline-flex';
      btn.textContent = `↑ v${info.version} ready`;
      btn.classList.add('tb-update-ready');
    });
  }

  if (window.electronAPI?.onUpdateDownloaded) {
    window.electronAPI.onUpdateDownloaded(() => {
      btn.textContent = '↑ Restart & Install';
      btn.classList.add('tb-update-ready');
      btn.style.display = 'inline-flex';
    });
  }

  if (window.electronAPI?.onUpdateProgress) {
    window.electronAPI.onUpdateProgress((prog) => {
      status.textContent = `Downloading… ${Math.round(prog.percent)}%`;
      btn.style.display = 'none';
    });
  }

  if (window.electronAPI?.onUpdateNotAvailable) {
    window.electronAPI.onUpdateNotAvailable(() => {
      status.textContent = 'Up to date ✓';
      btn.style.display = 'none';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });
  }

  // Manual check button
  btn.addEventListener('click', () => {
    const isReady = btn.classList.contains('tb-update-ready');
    if (isReady) {
      // Install and restart
      window.electronAPI?.installUpdate?.();
    } else {
      // Check for updates
      btn.textContent = 'Checking…';
      btn.style.display = 'inline-flex';
      window.electronAPI?.checkForUpdates?.();
      setTimeout(() => {
        if (!btn.classList.contains('tb-update-ready')) {
          btn.style.display = 'none';
          status.textContent = 'Up to date ✓';
          setTimeout(() => { status.textContent = ''; }, 2000);
        }
      }, 8000);
    }
  });
}

// Always show "Check for update" button on hover of titlebar version
function initUpdateCheckTrigger() {
  const ver = document.getElementById('tb-version-label');
  const btn = document.getElementById('tb-update-btn');
  if (!ver || !btn) return;
  ver.addEventListener('click', () => {
    const status = document.getElementById('tb-update-status');
    if (status) status.textContent = 'Checking…';
    window.electronAPI?.checkForUpdates?.();
    setTimeout(() => {
      if (!btn.classList.contains('tb-update-ready')) {
        if (status) { status.textContent = 'Up to date ✓'; setTimeout(()=>{ if(status) status.textContent=''; },2500); }
      }
    }, 8000);
  });
}


// ════════════════════════════════════════════════════════════
// BFF AUDIO ENGINE — Tone.js
// Synth playback for idea roll, drums, bass, melody previews.
// ════════════════════════════════════════════════════════════

const BF_Audio = (() => {
  // Guard: if Tone.js didn't load, expose no-op stubs
  if (typeof Tone === 'undefined') {
    console.error('Tone.js not loaded — audio disabled');
    const noop = async () => {};
    return { start: noop, playNote: noop, playDrum: noop, playSequence: noop, playDrumPattern: noop, stopAll: ()=>{}, getIsPlaying: ()=>false };
  }
  let started      = false;
  let melodySynth  = null;
  let bassSynth    = null;
  let drumSynths   = {};
  let padSynth     = null;
  let playSeq      = null;      // active Tone.Sequence
  let isPlaying    = false;

  // ── Ensure AudioContext is started (needs user gesture) ──
  async function start() {
    console.log('[BF_Audio] start() called, started=', started, 'Tone.context.state=', Tone?.context?.state);
    if (started) return;
    try {
      console.log('[BF_Audio] calling Tone.start()...');
      await Tone.start();
      // Also directly resume the underlying AudioContext in case Tone.start() doesn't
      if (Tone.context?.rawContext?.state === 'suspended') {
        await Tone.context.rawContext.resume();
      }
      console.log('[BF_Audio] Tone.start() succeeded, context state=', Tone.context.state);
      started = true;
      buildSynths();
      console.log('[BF_Audio] buildSynths() complete, melodySynth=', !!melodySynth);
    } catch(e) {
      console.error('[BF_Audio] Tone.start() FAILED:', e);
    }
  }

  // ── Build all synth voices ──
  
// Play a preview note when clicking on the piano roll
function playPreviewNote(midi, role) {
  try {
    if (!melodySynth && !bassSynth) buildSynths();
    const freq = Tone.Frequency(Math.max(21, Math.min(108, midi)), 'midi').toFrequency();
    const dur  = role === 'bass' ? '8n' : '16n';
    const vel  = 0.7;
    if (role === 'bass' && bassSynth) {
      bassSynth.triggerAttackRelease(freq, dur, Tone.now(), vel);
    } else if (melodySynth) {
      melodySynth.triggerAttackRelease(freq, dur, Tone.now(), vel);
    }
  } catch(e) { /* silent fail — preview is bonus */ }
}

function buildSynths() {
    // ── Melody / Lead — supersaw detuned PolySynth with delay ──
    try {
      const melDelay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.35, wet: 0.22 }).toDestination();
      const melFilter = new Tone.Filter({ frequency: 7000, type: 'lowpass', rolloff: -24 }).connect(melDelay);
      melodySynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
        envelope: { attack: 0.005, decay: 0.18, sustain: 0.65, release: 1.4 },
        volume: -9,
      }).connect(melFilter);
    } catch(e) { console.error('[BF] melodySynth build failed:', e); }

    // ── Bass — sub+saw with drive and envelope filter ──
    try {
      const bassFilter = new Tone.Filter({ frequency: 700, type: 'lowpass', rolloff: -24 }).toDestination();
      const bassDist   = new Tone.Distortion({ distortion: 0.12, wet: 0.25 }).connect(bassFilter);
      bassSynth = new Tone.MonoSynth({
        oscillator: { type: 'fatsawtooth', count: 2, spread: 8 },
        envelope: { attack: 0.005, decay: 0.12, sustain: 0.85, release: 0.3 },
        filterEnvelope: { attack: 0.005, decay: 0.22, sustain: 0.45, release: 0.4, baseFrequency: 110, octaves: 2.5 },
        volume: -4,
      }).connect(bassDist);
    } catch(e) { console.error('[BF] bassSynth build failed:', e); }

    // ── Pad — wide detuned PolySynth with FeedbackDelay (Chorus can fail on some Electron builds) ──
    try {
      const padDelay = new Tone.FeedbackDelay({ delayTime: '4n', feedback: 0.4, wet: 0.35 }).toDestination();
      const padFilter = new Tone.Filter({ frequency: 4500, type: 'lowpass' }).connect(padDelay);
      padSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 2, spread: 28 },
        envelope: { attack: 0.7, decay: 0.5, sustain: 0.85, release: 3.5 },
        volume: -13,
      }).connect(padFilter);
    } catch(e) { console.error('[BF] padSynth build failed:', e); }

    // ── Drums — synthetic percussion ──
    const masterVol = new Tone.Volume(-2).toDestination();

    // Kick: sine click + low-freq thump
    const kickEnv = new Tone.AmplitudeEnvelope({ attack:0.001, decay:0.35, sustain:0, release:0.1 }).connect(masterVol);
    const kickOsc = new Tone.Oscillator({ type:'sine', frequency:55 }).connect(kickEnv);
    const kickPitch = new Tone.FrequencyEnvelope({ attack:0.001, decay:0.08, sustain:0, release:0.1, baseFrequency:120, octaves:2 });
    kickPitch.connect(kickOsc.frequency);
    kickOsc.start();
    kickEnv.start = () => {}; // managed below
    drumSynths.kick = {
      triggerAttackRelease: (note, dur, time) => {
        try { kickPitch.triggerAttack(time || Tone.now()); kickEnv.triggerAttack(time || Tone.now()); kickEnv.triggerRelease((time || Tone.now()) + 0.3); } catch(e){}
      }
    };

    // Snare: noise burst
    const snareNoise = new Tone.NoiseSynth({
      noise: { type:'white' },
      envelope: { attack:0.001, decay:0.13, sustain:0, release:0.05 },
      volume: -8,
    }).connect(masterVol);
    drumSynths.snare = { triggerAttackRelease: (dur, time) => { try { snareNoise.triggerAttackRelease(dur||'16n', time || Tone.now()); } catch(e){} } };

    // Closed Hat: short noise
    const chhNoise = new Tone.NoiseSynth({
      noise: { type:'white' },
      envelope: { attack:0.001, decay:0.04, sustain:0, release:0.01 },
      volume: -14,
    });
    const chhFilter = new Tone.Filter({ frequency:8000, type:'highpass' }).connect(masterVol);
    chhNoise.connect(chhFilter);
    drumSynths.chh = { triggerAttackRelease: (dur, time) => { try { chhNoise.triggerAttackRelease('32n', time || Tone.now()); } catch(e){} } };

    // Open Hat: longer noise
    const ohhNoise = new Tone.NoiseSynth({
      noise: { type:'white' },
      envelope: { attack:0.001, decay:0.25, sustain:0.1, release:0.15 },
      volume: -14,
    });
    const ohhFilter = new Tone.Filter({ frequency:7000, type:'highpass' }).connect(masterVol);
    ohhNoise.connect(ohhFilter);
    drumSynths.ohh = { triggerAttackRelease: (dur, time) => { try { ohhNoise.triggerAttackRelease(dur||'8n', time || Tone.now()); } catch(e){} } };

    // Perc: metallic mid hit
    const percSynth = new Tone.MetalSynth({
      frequency:300, envelope:{attack:0.001,decay:0.12,release:0.05},
      harmonicity:5.1, modulationIndex:32, resonance:4000, octaves:1.5,
      volume: -16,
    }).connect(masterVol);
    drumSynths.perc = { triggerAttackRelease: (note, dur, time) => { try { percSynth.triggerAttackRelease(dur||'16n', time || Tone.now()); } catch(e){} } };
  }

  // ── Trigger single note (for piano roll click feedback) ──
  async function playNote(midiNote, role='melody', durationSec=0.25) {
    await start();
    const freq = Tone.Frequency(midiNote, 'midi').toFrequency();
    const dur  = `${durationSec}s`;
    if (role === 'bass') {
      bassSynth.triggerAttackRelease(freq, dur);
    } else if (role === 'pad') {
      padSynth.triggerAttackRelease(freq, dur);
    } else {
      melodySynth.triggerAttackRelease(freq, dur);
    }
  }

  // ── Trigger single drum hit ──
  async function playDrum(type) {
    await start();
    const now = Tone.now();
    if (type === 'kick')  drumSynths.kick.triggerAttackRelease('C1', '8n', now);
    if (type === 'snare') drumSynths.snare.triggerAttackRelease('16n', now);
    if (type === 'chh')   drumSynths.chh.triggerAttackRelease('32n', now);
    if (type === 'ohh')   drumSynths.ohh.triggerAttackRelease('8n', now);
    if (type === 'perc')  drumSynths.perc.triggerAttackRelease('G2', '16n', now);
  }

  // ── Play a sequence of notes (idea roll / melody preview) ──
  async function playSequence(notes, bpm, role='melody', onStep, onStop) {
    // Always resume AudioContext — Electron can suspend it between interactions
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start();
        await Tone.context.rawContext?.resume();
      }
    } catch(e) { console.warn('[BF_Audio] context resume failed:', e); }

    if (!started) {
      try { await Tone.start(); started = true; buildSynths(); } catch(e) { console.error('[BF_Audio] start failed:', e); }
    } else if (!melodySynth) {
      try { buildSynths(); } catch(e) { console.error('[BF_Audio] buildSynths retry failed:', e); }
    }

    stopAll();

    if (!notes || !notes.length) { console.log('[BF_Audio] no notes, returning'); return; }

    Tone.getTransport().bpm.value = bpm || 128;

    // Normalise notes to {step, len, note, vel}
    const normNotes = notes.map(n => ({
      step: n.step !== undefined ? n.step : Math.round((n.time || 0)),
      len:  n.len  !== undefined ? n.len  : Math.max(1, Math.round(n.duration || 2)),
      note: n.note,
      vel:  n.vel || n.velocity || 90,
    }));

    // Build step → notes lookup
    const stepMap = {};
    normNotes.forEach(n => {
      if (!stepMap[n.step]) stepMap[n.step] = [];
      stepMap[n.step].push(n);
    });

    // Total length = last note end + 1 step of silence, snapped to bar boundary (16 steps)
    const rawMax  = Math.max(...normNotes.map(n => n.step + n.len));
    const maxStep = Math.ceil(rawMax / 16) * 16; // snap to bar
    const stepsArr = Array.from({ length: maxStep }, (_, i) => i);

    // Always loop — let the stop button end playback
    // Transport loops over the exact bar range
    Tone.getTransport().loop     = true;
    Tone.getTransport().loopStart = 0;
    Tone.getTransport().loopEnd  = `${maxStep * 16}i`; // in Tone "i" = ticks (PPQ=192 per 16n)

    playSeq = new Tone.Sequence((time, step) => {
      if (!stepMap[step]) return; // empty step — advance silently
      stepMap[step].forEach(n => {
        try {
          const midi   = Math.max(21, Math.min(108, Math.round(n.note)));
          const freq   = Tone.Frequency(midi, 'midi').toFrequency();
          const stepSec = (60 / (Tone.getTransport().bpm.value || 128)) / 4;
          const durSec  = stepSec * Math.max(1, n.len || 1) * 0.92; // tiny gap for articulation
          if (role === 'bass') {
            if (bassSynth) bassSynth.triggerAttackRelease(freq, durSec, time, Math.min(1, (n.vel||90)/127));
          } else if (role === 'pad') {
            if (padSynth) padSynth.triggerAttackRelease(freq, durSec, time, Math.min(1, (n.vel||70)/127));
          } else {
            if (melodySynth) melodySynth.triggerAttackRelease(freq, durSec, time, Math.min(1, (n.vel||90)/127));
          }
        } catch(noteErr) {
          console.warn('[BF_Audio] note trigger error (skipping):', noteErr);
        }
      });
      if (onStep) onStep(step);
    }, stepsArr, '16n');

    try {
      playSeq.start(0);
      Tone.getTransport().start();
      isPlaying = true;
    } catch(e) {
      console.error('Tone transport start error:', e);
      isPlaying = false;
      if (onStop) onStop();
    }
  }

  // ── Play drum pattern (looping) ──
  async function playDrumPattern(pattern, bpm, bars=1, onStep, onStop) {
    await start();
    stopAll();
    Tone.getTransport().bpm.value = bpm || 128;
    Tone.getTransport().loop = false; // Sequence handles looping

    // Build a 16-step repeating array
    const stepArr = Array.from({length:16}, (_,i) => i);

    playSeq = new Tone.Sequence((time, i) => {
      const si = i % 16;
      try { if (pattern.kick?.[si])  drumSynths.kick?.triggerAttackRelease('C1','8n',time); } catch(e){}
      try { if (pattern.snare?.[si]) drumSynths.snare?.triggerAttackRelease('16n',time); } catch(e){}
      try { if (pattern.chh?.[si])   drumSynths.chh?.triggerAttackRelease('32n',time); } catch(e){}
      try { if (pattern.ohh?.[si])   drumSynths.ohh?.triggerAttackRelease('8n',time); } catch(e){}
      try { if (pattern.perc?.[si])  drumSynths.perc?.triggerAttackRelease('G2','16n',time); } catch(e){}
      if (onStep) onStep(si);
    }, stepArr, '16n');

    playSeq.loop = true;
    playSeq.loopEnd = '1m';
    playSeq.start(0);
    Tone.getTransport().start();
    isPlaying = true;
  }

  // ── Stop everything ──
  function stopAll() {
    if (playSeq) { try { playSeq.stop(); } catch(e){} try { playSeq.dispose(); } catch(e){} playSeq = null; }
    try { Tone.getTransport().stop(); } catch(e) {}
    try { Tone.getTransport().cancel(); } catch(e) {}
    try { Tone.getTransport().loop = false; } catch(e) {}
    isPlaying = false;
    if (melodySynth) try { melodySynth.releaseAll(); } catch(e){}
    if (padSynth)    try { padSynth.releaseAll(); }    catch(e){}
  }

  function getIsPlaying() { return isPlaying; }

  return { start, playNote, playDrum, playSequence, playDrumPattern, stopAll, getIsPlaying };
})();

// Global safety net - prevent renderer crash from navigating away
window.addEventListener('unhandledrejection', (e) => {
  console.error('[BF] Unhandled promise rejection (caught globally):', e.reason);
  e.preventDefault(); // Prevent Electron renderer crash
});
window.addEventListener('error', (e) => {
  console.error('[BF] Unhandled error (caught globally):', e.message, e.filename, e.lineno);
  // Don't e.preventDefault() here - let Electron log it but don't reload
});

document.addEventListener('DOMContentLoaded', () => {
  // Version label — do this first, independently of updater UI
  (function() {
    console.log('[BF] DOMContentLoaded, window.bff=', !!window.bff, 'getVersion=', !!window.bff?.app?.getVersion);
    const vl = document.getElementById('tb-version-label');
    console.log('[BF] tb-version-label element=', !!vl);
    if (!vl) return;
    const fn = window.bff?.app?.getVersion;
    if (fn) {
      fn().then(v => { console.log('[BF] version from IPC=', v); vl.textContent = 'v' + v; }).catch(e=>{ console.error('[BF] getVersion error:', e); vl.textContent = 'v0.3.9'; });
    } else {
      console.warn('[BF] no getVersion fn, using fallback');
      vl.textContent = 'v0.3.9';
    }
  })();
  initChips();
  updateIntentSummary();
  initIdeaScreen();
  initUpdaterUI();
  initUpdateCheckTrigger();
  initTrackLengthInput();
  initBPM();
  initStepNav();
  initArrangement();
  initSequencer();
  initRangeSliders();
  initPanelButtons();
  initAIChat();
  updateTransportBar();
});

// ─── CHIP BUTTONS ───
function initTrackLengthInput() {
  const input = document.getElementById('track-length-input');
  const hint  = document.getElementById('track-length-hint');
  if (!input) return;

  function updateHint(mins) {
    const bpm = state.scene.bpm || 125;
    const sections = getSections(String(mins));
    const barsPerSec = getBarsPerSection(bpm, mins, sections.length);
    hint.textContent = `→ ${sections.length} sections · ~${barsPerSec} bars each`;
  }

  // Set initial state
  state.scene.length = String(input.value);
  updateHint(parseFloat(input.value));

  input.addEventListener('input', () => {
    const v = Math.max(1, Math.min(60, parseFloat(input.value) || 6));
    state.scene.length = String(v);
    updateHint(v);
    updateTransportBar();
  });
}

function initChips() {
  document.querySelectorAll('.chip-group').forEach(group => {
    const isMulti = group.classList.contains('multi');
    group.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (isMulti) {
          chip.classList.toggle('active');
        } else {
          group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        }
        // Update state
        const field = group.dataset.field;
        if (isMulti) {
          const vals = [...group.querySelectorAll('.chip.active')].map(c => c.dataset.val);
          updateState(field, vals);
        } else {
          updateState(field, chip.dataset.val);
        }
      });
    });
  });
}

function updateState(field, value) {
  switch(field) {
    case 'genre':       state.scene.genre       = value; break;
    case 'key':         state.scene.key         = value; break;
    case 'mood':        state.scene.mood        = value; break;
    case 'length':      state.scene.length      = value; break;
    case 'energyArc':   state.scene.energyArc   = value; break;
    case 'atmosphere':  state.scene.atmosphere  = value; break;
    case 'density':     state.scene.density     = value; break;
    case 'drum-style':  state.drums.style       = value; break;
    case 'bass-style':  state.bass.style        = value; break;
    case 'melody-phrase': state.melody.phraseLen = parseInt(value) || 16; break;
    case 'melody-style':state.melody.style      = value; break;
    case 'pad-style':   state.pads.style        = value; break;
    case 'fx-elements': state.pads.fx           = value; break;
  }
  updateTransportBar();
  // Recalc intent summary whenever a scene field changes
  if (['genre','mood','energyArc','atmosphere','density'].includes(field)) {
    updateIntentSummary();
  }
}

// ─── BPM ───
function initBPM() {
  const val = document.getElementById('bpm-val');
  const down = document.getElementById('bpm-down');
  const up = document.getElementById('bpm-up');

  const setBPM = (v) => {
    v = Math.max(80, Math.min(180, v));
    val.value = v;
    state.scene.bpm = v;
    updateTransportBar();
    // Update preset chips
    document.querySelectorAll('[data-bpm]').forEach(c => {
      c.classList.toggle('active', parseInt(c.dataset.bpm) === v);
    });
  };

  down.addEventListener('click', () => setBPM(state.scene.bpm - 1));
  up.addEventListener('click', () => setBPM(state.scene.bpm + 1));
  val.addEventListener('change', () => setBPM(parseInt(val.value) || 128));

  document.querySelectorAll('[data-bpm]').forEach(c => {
    c.addEventListener('click', () => setBPM(parseInt(c.dataset.bpm)));
  });
}

function updateTransportBar() {
  document.getElementById('tb-bpm').textContent = state.scene.bpm + ' BPM';
  document.getElementById('tb-key').textContent = state.scene.key;
  const genreLabel = state.scene.genre.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  document.getElementById('tb-genre').textContent = genreLabel;
}

// ─── STEP NAVIGATION ───
function initStepNav() {
  document.querySelectorAll('.nav-step').forEach(navItem => {
    navItem.addEventListener('click', () => {
      const step = navItem.dataset.step;
      goToStep(step);
    });
  });
}

function goToStep(step) {
  // Update nav
  document.querySelectorAll('.nav-step').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-step[data-step="${step}"]`).classList.add('active');
  // Show transport bar only once past the idea screen
  const transport = document.getElementById('tb-transport');
  if (transport) transport.style.display = step === 'idea' ? 'none' : 'flex';
  // Mark previous steps as completed
  const steps = ['idea','scene','arrangement','drums','bass','melody','pads','export'];
  const idx = steps.indexOf(step);
  steps.forEach((s, i) => {
    const nav = document.querySelector(`.nav-step[data-step="${s}"]`);
    if (i < idx) nav.classList.add('completed');
    else nav.classList.remove('completed');
  });
  // Show panel
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${step}`).classList.add('active');
  state.currentStep = step;

  // Rebuild dynamic panels
  if (step === 'arrangement') buildArrangementGrid();
  if (step === 'export') {
    setTimeout(() => {
      if (typeof initDragCards === 'function') initDragCards();
      document.querySelectorAll('.drag-card').forEach(c => {
        if (typeof updateCardState === 'function') updateCardState(c, c.dataset.layer);
      });
    }, 50);
  }
}

// ─── ARRANGEMENT GRID ───

// ═══════════════════════════════════════════════════════════════
// SECTION DESIGNER
// ═══════════════════════════════════════════════════════════════

const SD_LAYERS = [
  { id:'kick',  name:'Kick',    icon:'🥁' },
  { id:'snare', name:'Snare',   icon:'🔵' },
  { id:'hats',  name:'Hats',    icon:'🎩' },
  { id:'perc',  name:'Perc',    icon:'🪘' },
  { id:'bass',  name:'Bass',    icon:'◉'  },
  { id:'arp',   name:'Arp',     icon:'♪'  },
  { id:'lead',  name:'Lead',    icon:'♫'  },
  { id:'pad',   name:'Pad',     icon:'≋'  },
];

const SD_FX = [
  { id:'filter-up',    name:'Filter Sweep ↑',  cc:74 },
  { id:'filter-down',  name:'Filter Sweep ↓',  cc:74 },
  { id:'riser',        name:'Riser',            cc:73 },
  { id:'downlifter',   name:'Downlifter',       cc:73 },
  { id:'stutter',      name:'Stutter / Gate',   cc:92 },
  { id:'glitch',       name:'Glitch',           cc:93 },
  { id:'rev-cymbal',   name:'Reverse Cymbal',   cc:91 },
  { id:'silence-drop', name:'Silence Drop',     cc:7  },
  { id:'chop',         name:'Chop',             cc:92 },
  { id:'bitcrush',     name:'Bitcrush',         cc:94 },
];

const SD_ROLE_COLORS = {
  intro:     '#6b6bff',
  build:     '#ffaa33',
  'pre-chorus': '#ff7f50',
  drop:      '#c9a84c',
  breakdown: '#9b59b6',
  bridge:    '#3bbf8a',
  outro:     '#555',
};

function sdGetColor(name) {
  const n = name.toLowerCase();
  if (n.includes('intro'))    return SD_ROLE_COLORS.intro;
  if (n.includes('build'))    return SD_ROLE_COLORS.build;
  if (n.includes('pre'))      return SD_ROLE_COLORS['pre-chorus'];
  if (n.includes('drop'))     return SD_ROLE_COLORS.drop;
  if (n.includes('breakdown') || n.includes('break')) return SD_ROLE_COLORS.breakdown;
  if (n.includes('bridge'))   return SD_ROLE_COLORS.bridge;
  if (n.includes('outro'))    return SD_ROLE_COLORS.outro;
  return '#c9a84c';
}

function sdDefaultSection(name, si, total) {
  const n = name.toLowerCase();
  const isIntro     = n.includes('intro');
  const isBuild     = n.includes('build') || n.includes('pre');
  const isDrop      = n.includes('drop');
  const isBreakdown = n.includes('breakdown') || n.includes('break');
  const isBridge    = n.includes('bridge');
  const isOutro     = n.includes('outro');

  // Default layer mix 0-10
  const mix = {};
  SD_LAYERS.forEach(l => { mix[l.id] = 0; });
  if (isIntro)     { mix.pad=7; mix.bass=3; mix.hats=4; }
  if (isBuild)     { mix.kick=5; mix.hats=7; mix.bass=6; mix.arp=5; mix.pad=6; }
  if (isDrop)      { mix.kick=10; mix.snare=8; mix.hats=9; mix.perc=7; mix.bass=10; mix.arp=8; mix.lead=9; mix.pad=5; }
  if (isBreakdown) { mix.pad=9; mix.bass=4; mix.lead=5; }
  if (isBridge)    { mix.pad=8; mix.arp=7; mix.bass=5; mix.hats=4; }
  if (isOutro)     { mix.pad=6; mix.bass=3; mix.hats=3; }

  return {
    intensity: isDrop ? 9 : isBuild ? 6 : isBreakdown ? 3 : isBridge ? 5 : isIntro ? 2 : isOutro ? 2 : 5,
    tension:   isBuild ? 8 : isDrop ? 4 : isBreakdown ? 2 : isBridge ? 7 : 3,
    release:   isBreakdown ? 9 : isBridge ? 7 : isDrop ? 2 : isIntro ? 5 : 4,
    layerMix:  mix,
    fx:        [],
    bars:      4,
  };
}

function initSectionDesigner() {
  const sections = getSections(state.scene.length);
  const bpm      = state.scene.bpm;
  const totalMin = parseFloat(state.scene.length) || 6;
  const barsEach = getBarsPerSection(bpm, totalMin, sections.length);

  // Initialise sectionDesigner state
  sections.forEach((name, si) => {
    if (!state.sectionDesigner[si]) {
      state.sectionDesigner[si] = sdDefaultSection(name, si, sections.length);
      state.sectionDesigner[si].name = name;
      state.sectionDesigner[si].bars = barsEach;
    }
  });

  // Also keep arrangement state in sync (for MIDI export)
  LAYERS.forEach(layer => {
    sections.forEach((sec, si) => {
      const key = `${layer.id}-${si}`;
      if (!(key in state.arrangement)) {
        state.arrangement[key] = getDefaultArrangement(layer.id, si, sections.length);
      }
    });
  });

  renderSDStrip(sections);
  // Auto-select first section
  if (sections.length) openSDEditor(0, sections);
}

function renderSDStrip(sections) {
  const strip = document.getElementById('sd-strip');
  if (!strip) return;
  strip.innerHTML = sections.map((name, si) => {
    const color = sdGetColor(name);
    return `<div class="sd-tab" id="sd-tab-${si}" data-si="${si}" style="border-bottom:3px solid ${color}" onclick="openSDEditor(${si}, null)">
      <span class="sd-tab-name">${name}</span>
    </div>`;
  }).join('');
}

let _sdSections = null; // cache sections for editor

function openSDEditor(si, sectionsArg) {
  if (sectionsArg) _sdSections = sectionsArg;
  const sections = _sdSections || getSections(state.scene.length);
  const name = sections[si];
  const sd   = state.sectionDesigner[si];
  if (!sd) return;
  const color = sdGetColor(name);

  // Highlight active tab
  document.querySelectorAll('.sd-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(`sd-tab-${si}`);
  if (tab) tab.classList.add('active');

  const editor = document.getElementById('sd-editor');
  if (!editor) return;

  editor.innerHTML = `
    <div class="sd-edit-wrap">
      <div class="sd-edit-header" style="border-left:4px solid ${color}">
        <span class="sd-edit-title">${name}</span>
        <span class="sd-edit-bars">${sd.bars} bars</span>
      </div>

      <!-- ── Layer Mix ── -->
      <div class="sd-section-block">
        <div class="sd-block-title">Layer Mix</div>
        <div class="sd-layer-grid">
          ${SD_LAYERS.map(l => `
            <div class="sd-layer-item">
              <div class="sd-layer-name">${l.icon} ${l.name}</div>
              <input type="range" class="sd-mix-slider" min="0" max="10" step="1"
                value="${sd.layerMix[l.id] || 0}"
                data-si="${si}" data-layer="${l.id}"
                style="--accent:${color}">
              <span class="sd-mix-val" id="sd-mix-val-${si}-${l.id}">${sd.layerMix[l.id] || 0}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- ── Section Controls ── -->
      <div class="sd-section-block">
        <div class="sd-block-title">Shape</div>
        <div class="sd-shape-grid">
          <div class="sd-shape-item">
            <label>Intensity</label>
            <input type="range" class="sd-shape-slider" min="1" max="10" step="1"
              value="${sd.intensity}" data-si="${si}" data-prop="intensity"
              style="--accent:${color}">
            <span class="sd-shape-val" id="sd-shape-intensity-${si}">${sd.intensity}</span>
            <span class="sd-shape-hint">note density + velocity</span>
          </div>
          <div class="sd-shape-item">
            <label>Tension</label>
            <input type="range" class="sd-shape-slider" min="1" max="10" step="1"
              value="${sd.tension}" data-si="${si}" data-prop="tension"
              style="--accent:${color}">
            <span class="sd-shape-val" id="sd-shape-tension-${si}">${sd.tension}</span>
            <span class="sd-shape-hint">harmonic direction ↑ away from tonic</span>
          </div>
          <div class="sd-shape-item">
            <label>Release</label>
            <input type="range" class="sd-shape-slider" min="1" max="10" step="1"
              value="${sd.release}" data-si="${si}" data-prop="release"
              style="--accent:${color}">
            <span class="sd-shape-val" id="sd-shape-release-${si}">${sd.release}</span>
            <span class="sd-shape-hint">note tail length into next section</span>
          </div>
          <div class="sd-shape-item">
            <label>Length (bars)</label>
            <select class="sd-bars-select" data-si="${si}">
              ${[2,4,8,16,32].map(b => `<option value="${b}" ${b===sd.bars?'selected':''}>${b} bars</option>`).join('')}
            </select>
            <span class="sd-shape-hint">section duration</span>
          </div>
        </div>
      </div>

      <!-- ── FX Lane ── -->
      <div class="sd-section-block">
        <div class="sd-block-title">FX Lane <span class="sd-fx-hint">exports as CC automation in MIDI pack</span></div>
        <div class="sd-fx-grid">
          ${SD_FX.map(fx => `
            <div class="sd-fx-chip ${sd.fx.includes(fx.id) ? 'active' : ''}"
              data-si="${si}" data-fx="${fx.id}" data-cc="${fx.cc}"
              onclick="toggleSDFx(${si}, '${fx.id}', this)">
              ${fx.name}
            </div>`).join('')}
        </div>
      </div>

      <!-- ── Nav ── -->
      <div class="sd-nav">
        ${si > 0 ? `<button class="btn-ghost sd-nav-btn" onclick="openSDEditor(${si-1}, null)">← ${sections[si-1]}</button>` : '<span></span>'}
        ${si < sections.length-1 ? `<button class="btn-ghost sd-nav-btn" onclick="openSDEditor(${si+1}, null)">${sections[si+1]} →</button>` : '<span></span>'}
      </div>
    </div>`;

  // Wire layer mix sliders
  editor.querySelectorAll('.sd-mix-slider').forEach(sl => {
    sl.addEventListener('input', () => {
      const _si = parseInt(sl.dataset.si);
      const layer = sl.dataset.layer;
      const val = parseInt(sl.value);
      state.sectionDesigner[_si].layerMix[layer] = val;
      const v = document.getElementById(`sd-mix-val-${_si}-${layer}`);
      if (v) v.textContent = val;
      // Sync to arrangement state
      state.arrangement[`${layer}-${_si}`] = val > 0;
    });
  });

  // Wire shape sliders
  editor.querySelectorAll('.sd-shape-slider').forEach(sl => {
    sl.addEventListener('input', () => {
      const _si = parseInt(sl.dataset.si);
      const prop = sl.dataset.prop;
      const val = parseInt(sl.value);
      state.sectionDesigner[_si][prop] = val;
      const v = document.getElementById(`sd-shape-${prop}-${_si}`);
      if (v) v.textContent = val;
    });
  });

  // Wire bars select
  editor.querySelectorAll('.sd-bars-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const _si = parseInt(sel.dataset.si);
      state.sectionDesigner[_si].bars = parseInt(sel.value);
    });
  });
}

function toggleSDFx(si, fxId, el) {
  const sd = state.sectionDesigner[si];
  if (!sd) return;
  if (sd.fx.includes(fxId)) {
    sd.fx = sd.fx.filter(f => f !== fxId);
    el.classList.remove('active');
  } else {
    sd.fx.push(fxId);
    el.classList.add('active');
  }
}


function initArrangement() {
  initSectionDesigner();
}

function buildArrangementGrid() {
  const sections = getSections(state.scene.length);
  const bpm = state.scene.bpm;
  const totalMins = parseFloat(state.scene.length) || 6;
  const bars = getBarsPerSection(bpm, totalMins, sections.length);

  // Always rebuild blueprint from intent
  computeIntentBlueprint();
  state.progression = buildProgressionBlueprint(sections);

  // Build old-style arrangement defaults too (for MIDI export compatibility)
  LAYERS.forEach(layer => {
    sections.forEach((sec, si) => {
      const key = `${layer.id}-${si}`;
      if (!(key in state.arrangement)) {
        state.arrangement[key] = getDefaultArrangement(layer.id, si, sections.length);
      }
    });
  });

  const grid = document.getElementById('arr-grid');
  const sectionLabels = document.getElementById('section-labels');
  const layerLabels = document.getElementById('layer-labels');

  // Hide old label containers if they exist — we're taking over
  if (sectionLabels) sectionLabels.style.display = 'none';
  if (layerLabels) layerLabels.style.display = 'none';

  // Render progression timeline cards
  grid.innerHTML = `
    <div class="prog-timeline">
      ${sections.map((name, si) => {
        const evo = state.progression[si];
        const role = classifySection(name);
        const roleColor = {
          intro:'#6b6bff', build:'#ffaa33', drop:'#c9a84c',
          breakdown:'#9b59b6', outro:'#555'
        }[role] || '#c9a84c';

        const drumElements = evo.drums.elements.join(' · ');

        return `<div class="prog-card" data-si="${si}" style="border-top:3px solid ${roleColor}">
          <div class="prog-card-header">
            <span class="prog-section-name">${name}</span>
            <span class="prog-role-badge" style="background:${roleColor}22;color:${roleColor}">${role.toUpperCase()}</span>
          </div>
          <div class="prog-layers">
            <div class="prog-layer-row" data-layer="melody" data-si="${si}">
              <span class="prog-layer-icon">♪</span>
              <div class="prog-layer-info">
                <span class="prog-layer-title">Melody</span>
                <span class="prog-layer-detail" id="mel-label-${si}">${evo.melody.label}</span>
              </div>
              <div class="prog-controls">
                <button class="prog-btn prog-phrase-down" data-layer="melody" data-si="${si}" title="Shorter phrase">−</button>
                <span class="prog-phrase-val" id="mel-phrase-${si}">${evo.melody.phraseLen}bar</span>
                <button class="prog-btn prog-phrase-up" data-layer="melody" data-si="${si}" title="Longer phrase">+</button>
                <span class="prog-density-val" id="mel-density-${si}" title="Note density">${evo.melody.noteDensity}/${7} notes</span>
              </div>
            </div>
            <div class="prog-layer-row" data-layer="bass" data-si="${si}">
              <span class="prog-layer-icon">◉</span>
              <div class="prog-layer-info">
                <span class="prog-layer-title">Bass</span>
                <span class="prog-layer-detail" id="bass-label-${si}">${evo.bass.label}</span>
              </div>
              <div class="prog-controls">
                <button class="prog-btn prog-phrase-down" data-layer="bass" data-si="${si}" title="Shorter phrase">−</button>
                <span class="prog-phrase-val" id="bass-phrase-${si}">${evo.bass.phraseLen}bar</span>
                <button class="prog-btn prog-phrase-up" data-layer="bass" data-si="${si}" title="Longer phrase">+</button>
                <span class="prog-style-val" id="bass-style-${si}" title="Bass style">${evo.bass.style}</span>
              </div>
            </div>
            <div class="prog-layer-row" data-layer="drums" data-si="${si}">
              <span class="prog-layer-icon">◈</span>
              <div class="prog-layer-info">
                <span class="prog-layer-title">Drums</span>
                <span class="prog-layer-detail" id="drum-label-${si}">${evo.drums.label}</span>
              </div>
              <div class="prog-controls">
                <span class="prog-drum-elements" id="drum-els-${si}">${drumElements}</span>
              </div>
            </div>
          </div>
          <div class="prog-section-bars">~${bars} bars</div>
        </div>`;
      }).join('')}
    </div>`;

  // Phrase length +/- controls
  grid.querySelectorAll('.prog-phrase-up, .prog-phrase-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const si = parseInt(btn.dataset.si);
      const layer = btn.dataset.layer;
      const evo = state.progression[si][layer];
      const isUp = btn.classList.contains('prog-phrase-up');
      const options = [1,2,4,8,16,32];
      const cur = options.indexOf(evo.phraseLen);
      const next = isUp ? Math.min(options.length-1, cur+1) : Math.max(0, cur-1);
      evo.phraseLen = options[next];
      const el = document.getElementById(`${layer === 'melody' ? 'mel' : 'bass'}-phrase-${si}`);
      if (el) el.textContent = evo.phraseLen + 'bar';
    });
  });
}

function getDefaultArrangement(layer, secIdx, totalSections) {
  // Smart defaults for melodic techno arrangement
  const defaults = {
    kick:  [1,1,1,0,1,1,1],   // out in breakdown
    hats:  [0,1,1,0,1,1,0],   // not intro/outro
    perc:  [0,1,1,0,1,1,0],
    bass:  [0,1,1,1,1,1,0],   // bass in breakdown (sub)
    lead:  [0,0,1,0,0,1,0],   // only drops
    pad:   [1,1,0,1,1,0,1],   // atmosphere, not drops
    fx:    [0,1,0,1,1,0,0],   // transitions
  };
  const pattern = defaults[layer] || [];
  // Scale pattern to match section count
  if (secIdx < pattern.length) return !!pattern[secIdx];
  return false;
}

// ─── DRUM SEQUENCER ───
function initSequencer() {
  const seq = document.getElementById('drum-sequencer');
  seq.innerHTML = DRUM_ROWS.map(row => {
    const steps = Array.from({length:16}, (_, i) => {
      const key = `${row.id}-${i}`;
      const isBeat = i % 4 === 0;
      return `<div class="seq-step ${isBeat ? 'beat-1' : ''}" data-row="${row.id}" data-step="${i}" data-key="${key}"></div>`;
    }).join('');
    return `<div class="seq-row"><div class="seq-label">${row.name}</div><div class="seq-steps">${steps}</div></div>`;
  }).join('');

  // Set default kick pattern (4 on floor)
  [0,4,8,12].forEach(i => {
    const el = seq.querySelector(`[data-row="kick"][data-step="${i}"]`);
    if (el) { el.classList.add('active'); state.drums.pattern[`kick-${i}`] = true; }
  });
  // Default hats
  [2,6,10,14].forEach(i => {
    const el = seq.querySelector(`[data-row="chh"][data-step="${i}"]`);
    if (el) { el.classList.add('active'); state.drums.pattern[`chh-${i}`] = true; }
  });
  // Default open hat
  [4,12].forEach(i => {
    const el = seq.querySelector(`[data-row="ohh"][data-step="${i}"]`);
    if (el) { el.classList.add('active'); state.drums.pattern[`ohh-${i}`] = true; }
  });

  // Click to toggle + audio feedback
  seq.querySelectorAll('.seq-step').forEach(step => {
    step.addEventListener('click', () => {
      step.classList.toggle('active');
      const key = step.dataset.key;
      state.drums.pattern[key] = step.classList.contains('active');
      if (step.classList.contains('active')) {
        // Map row id to drum type
        const drumTypeMap = { kick:'kick', snare:'snare', chh:'chh', ohh:'ohh', perc:'perc' };
        const type = drumTypeMap[step.dataset.row] || 'kick';
        BF_Audio.playDrum(type).catch(()=>{});
      }
    });
  });
}

// ─── RANGE SLIDERS ───
function initRangeSliders() {
  document.querySelectorAll('.groove-row').forEach(row => {
    const slider = row.querySelector('input[type=range]');
    const val = row.querySelector('.range-val');
    if (slider && val) {
      slider.addEventListener('input', () => {
        let display = slider.value;
        if (slider.id && slider.id.includes('swing')) display += '%';
        if (slider.id && slider.id.includes('humanise')) display += '%';
        val.textContent = display;
        // Update state
        if (slider.id === 'drum-swing') state.drums.swing = parseInt(slider.value);
        if (slider.id === 'drum-density') state.drums.density = parseInt(slider.value);
        if (slider.id === 'drum-humanise') state.drums.humanise = parseInt(slider.value);
        if (slider.id === 'bass-complexity') state.bass.complexity = parseInt(slider.value);
        if (slider.id === 'bass-octave') state.bass.octave = parseInt(slider.value);
        if (slider.id === 'melody-complexity') state.melody.complexity = parseInt(slider.value);
        if (slider.id === 'melody-density') state.melody.density = parseInt(slider.value);
      });
    }
  });
}

// ─── PANEL BUTTONS (NAVIGATION) ───
function initPanelButtons() {
  document.getElementById('scene-next')?.addEventListener('click', () => goToStep('arrangement'));
  document.getElementById('arr-next')?.addEventListener('click', () => goToStep('drums'));
  document.getElementById('drum-next')?.addEventListener('click', () => goToStep('bass'));
  document.getElementById('bass-next')?.addEventListener('click', () => goToStep('melody'));
  document.getElementById('melody-next')?.addEventListener('click', () => goToStep('pads'));
  document.getElementById('pads-next')?.addEventListener('click', () => goToStep('export'));

  // AI generate buttons
  document.getElementById('arr-suggest')?.addEventListener('click', () => aiSuggestArrangement());
  document.getElementById('drum-generate')?.addEventListener('click', () => aiGenerateDrums());
  document.getElementById('bass-generate')?.addEventListener('click', () => aiGenerateBass());
  document.getElementById('melody-generate')?.addEventListener('click', () => aiGenerateMelody());
  document.getElementById('pads-generate')?.addEventListener('click', () => aiGeneratePads());

  // Export buttons
  document.getElementById('export-midi')?.addEventListener('click', () => exportFullMidiPack());
  document.getElementById('export-arrangement')?.addEventListener('click', () => exportArrangement());
  document.getElementById('export-drums-midi')?.addEventListener('click', () => exportDrumMidi());
  document.getElementById('export-drums-split')?.addEventListener('click', () => exportDrumSplitPack());
  document.getElementById('export-melody-split')?.addEventListener('click', () => exportMelodySplitPack());
  document.getElementById('export-bass-midi')?.addEventListener('click', () => exportBassMidi());
  document.getElementById('export-melody-midi')?.addEventListener('click', () => exportMelodyMidi());
  document.getElementById('export-drums-midi-quick')?.addEventListener('click', () => exportDrumMidi());
  document.getElementById('export-pads-midi')?.addEventListener('click', () => exportPadsMidi());
  document.getElementById('export-daw')?.addEventListener('click', () => exportDrumMidi());
  document.getElementById('export-arr')?.addEventListener('click', () => exportFullMidiPack());

  // Preview buttons
  document.getElementById('drum-preview')?.addEventListener('click', () => previewDrums());
  document.getElementById('bass-preview')?.addEventListener('click', () => previewBass());
  document.getElementById('melody-preview')?.addEventListener('click', () => previewMelody());
  document.getElementById('pads-preview')?.addEventListener('click',  () => previewPads());
}

// ─── AI CHAT ───
function initAIChat() {
  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send');
  const messages = document.getElementById('ai-messages');

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    addMessage('user', text);
    input.value = '';
    // Process AI response
    handleAIChat(text);
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
}

function addMessage(role, text) {
  const messages = document.getElementById('ai-messages');
  const msg = document.createElement('div');
  msg.className = `ai-msg ${role}`;
  msg.innerHTML = `<div class="ai-msg-text">${text}</div>`;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

async function handleAIChat(userMessage) {
  addMessage('bot', '<em>Thinking...</em>');
  try {
    const context = {
      scene: state.scene,
      currentStep: state.currentStep,
      arrangement: state.arrangement,
      drums: state.drums,
      bass: state.bass,
      melody: state.melody,
    };

    // Call AI backend
    if (typeof window.bff !== 'undefined') {
      const result = await window.bff.ai.generate(userMessage, context);
      // Remove thinking message
      const msgs = document.getElementById('ai-messages');
      msgs.removeChild(msgs.lastChild);
      addMessage('bot', result.response || result.error || "Hmm, something went wrong. Try again.");
    } else {
      // Dev fallback — no Electron
      const msgs = document.getElementById('ai-messages');
      msgs.removeChild(msgs.lastChild);
      addMessage('bot', "I'm running in browser mode — AI backend needs the Electron shell. But the UI is all here for you to play with. <em>You're welcome.</em>");
    }
  } catch(e) {
    const msgs = document.getElementById('ai-messages');
    msgs.removeChild(msgs.lastChild);
    addMessage('bot', `Error: ${e.message}`);
  }
}

// ─── AI GENERATION FUNCTIONS ───
async function aiSuggestArrangement() {
  addMessage('bot', "Generating an arrangement based on your scene settings... <em>Hold my beer.</em>");
  
  // For now — generate a smart default based on genre
  const sections = getSections(state.scene.length);
  const genre = state.scene.genre;
  
  // Genre-specific arrangements
  const patterns = {
    'melodic-techno': {
      kick:  sections.map((s,i) => !s.includes('Intro') && !s.includes('Breakdown')),
      hats:  sections.map((s,i) => !s.includes('Intro') && !s.includes('Outro') && !s.includes('Breakdown')),
      perc:  sections.map((s,i) => s.includes('Drop') || s.includes('Build')),
      bass:  sections.map((s,i) => !s.includes('Intro') && !s.includes('Outro')),
      lead:  sections.map((s,i) => s.includes('Drop')),
      pad:   sections.map((s,i) => s.includes('Intro') || s.includes('Breakdown') || s.includes('Outro') || s.includes('Build')),
      fx:    sections.map((s,i) => s.includes('Build') || s.includes('Breakdown')),
    },
    'progressive-house': {
      kick:  sections.map((s,i) => !s.includes('Breakdown')),
      hats:  sections.map((s,i) => !s.includes('Intro') && !s.includes('Outro')),
      perc:  sections.map((s,i) => s.includes('Drop') || s.includes('Build')),
      bass:  sections.map((s,i) => !s.includes('Intro') && !s.includes('Outro')),
      lead:  sections.map((s,i) => s.includes('Drop') || s.includes('Build')),
      pad:   sections.map((s,i) => true),
      fx:    sections.map((s,i) => s.includes('Build') || s.includes('Breakdown')),
    }
  };

  const pattern = patterns[genre] || patterns['melodic-techno'];
  
  // Apply to state and rebuild grid
  LAYERS.forEach(layer => {
    sections.forEach((sec, si) => {
      const key = `${layer.id}-${si}`;
      state.arrangement[key] = pattern[layer.id] ? pattern[layer.id][si] : false;
    });
  });
  
  // Rebuild progression blueprint fresh
  state.progression = buildProgressionBlueprint(sections);
  buildArrangementGrid();
  
  setTimeout(() => {
    const dropCount = sections.filter(s => classifySection(s) === 'drop').length;
    const bp = state.intent || {};
    const arcLabel = (state.scene.energyArc||'').replace(/-/g,' ');
    const atmoLabel = (state.scene.atmosphere||'').replace(/-/g,' ');
    addMessage('bot', `Done. <strong>${sections.length} sections mapped</strong> — <em>${arcLabel} · ${atmoLabel}</em> blueprint applied. Phrases grow ${(bp.phraseGrowth||[2,4,8]).join('→')} bars. Swing locked at ${bp.swing||10}%. ${dropCount} drops, each one more evolved than the last. Every section knows exactly what it's doing. <em>Drop in your instruments. You're welcome.</em>`);
  }, 800);
}

async function aiGenerateDrums() {
  // Pull intent blueprint
  const bp = computeIntentBlueprint();
  const drumBuild = bp.drumBuild || 'steady';
  addMessage('bot', `Cooking up a <strong>${drumBuild}</strong> drum pattern... <em>This is going to be magnificent.</em>`);

  // Apply intent swing to drum state
  state.drums.swing = bp.swing;
  const swingEl = document.getElementById('drum-swing');
  const swingVal = document.querySelector('#drum-swing + .range-val') || document.querySelector('.range-val');
  if (swingEl) { swingEl.value = bp.swing; }

  // Generate pattern based on style
  const seq = document.getElementById('drum-sequencer');
  
  // Clear existing
  seq.querySelectorAll('.seq-step').forEach(s => s.classList.remove('active'));
  state.drums.pattern = {};
  
  const style = state.drums.style;
  let patterns = {};
  
  if (style === 'rolling' || style === 'four-on-floor') {
    patterns = {
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      chh:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      ohh:   [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1],
      perc:  [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,1,0,0],
    };
  } else if (style === 'breakbeat') {
    patterns = {
      kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
      chh:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      ohh:   [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0],
      perc:  [0,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,1,0],
    };
  } else { // minimal
    patterns = {
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      chh:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      ohh:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      perc:  [0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    };
  }
  
  // Add swing/humanise variation
  const density = state.drums.density;
  if (density > 6) {
    // Add extra ghost notes on hats
    [1,3,5,7,9,11,13,15].forEach(i => {
      if (Math.random() < (density - 5) * 0.15) patterns.chh[i] = 1;
    });
  }
  
  // Apply to sequencer
  Object.entries(patterns).forEach(([row, steps]) => {
    steps.forEach((on, i) => {
      if (on) {
        const el = seq.querySelector(`[data-row="${row}"][data-step="${i}"]`);
        if (el) { el.classList.add('active'); state.drums.pattern[`${row}-${i}`] = true; }
      }
    });
  });
  
  setTimeout(() => {
    addMessage('bot', `${style.replace(/-/g,' ')} pattern loaded. Kick on all four, hats are offset, perc adds movement. Tweak any step by clicking. <em>Now THAT's a groove.</em>`);
  }, 600);
}

async function aiGenerateBass() {
  addMessage('bot', "Writing a bassline around your drums... <em>This is the fun part.</em>");
  
  const key = state.scene.key;
  const style = state.bass.style;
  const complexity = state.bass.complexity;
  
  // Generate bass notes based on key and style
  const root = getNoteNumber(key);
  const scale = getScale(key);
  
  let notes = [];
  const barLength = 16; // 16th notes per bar
  
  if (style === 'rolling-sub') {
    // Simple rolling sub — root note on kick hits
    notes = [
      { note: root, time: 0, duration: 3, velocity: 110 },
      { note: root, time: 4, duration: 3, velocity: 100 },
      { note: root, time: 8, duration: 3, velocity: 110 },
      { note: root, time: 12, duration: 3, velocity: 100 },
    ];
    if (complexity > 5) {
      notes.push({ note: scale[4], time: 6, duration: 1, velocity: 80 });
      notes.push({ note: scale[3], time: 14, duration: 1, velocity: 75 });
    }
  } else if (style === 'acid') {
    notes = scale.slice(0,5).map((n, i) => ({
      note: n, time: i * 3, duration: 2, velocity: 90 + Math.random() * 20
    }));
  } else {
    // Pluck/Reese/FM — arpeggiated
    for (let i = 0; i < barLength; i += (11 - complexity)) {
      const scaleIdx = Math.floor(Math.random() * Math.min(complexity, scale.length));
      notes.push({ note: scale[scaleIdx], time: i, duration: 2, velocity: 85 + Math.random() * 25 });
    }
  }
  
  state.bass.notes = notes;
  renderPianoRoll('bass-pianoroll', notes, root - 12, root + 12);
  
  setTimeout(() => {
    addMessage('bot', `${style.replace(/-/g,' ')} bassline in ${key}. ${notes.length} notes, sits right under your kick pattern. <em>You can feel that low end already.</em>`);
  }, 600);
}

// Dance music chord progressions (scale degree indices, minor scale)
const CHORD_PROGRESSIONS = {
  'euphoric':    [[0,2,4],[5,0,2],[3,5,0],[4,6,1]],   // i – VI – iv – VII
  'dark':        [[0,2,4],[6,1,3],[5,0,2],[4,6,1]],   // i – vii° – VI – VII
  'hypnotic':    [[0,2,4],[0,2,4],[5,0,2],[5,0,2]],   // i i VI VI (dorian loop)
  'melancholic': [[0,2,4],[3,5,0],[5,0,2],[4,6,1]],   // i – iv – VI – VII
  'tribal':      [[0,4],[0,4],[5,2],[5,2]],             // power chords
};

async function aiGenerateMelody() {
  const phraseChoice = state.melody.phraseLen || 16; // 8, 16, or 32 steps
  const style        = state.melody.style || 'lead';
  const key          = state.scene.key;
  const scale        = getScale(key);
  const root         = getNoteNumber(key);
  const atmo         = state.scene.atmosphere || 'euphoric';

  addMessage('bot', `Composing ${phraseChoice}-step ${style} in ${key}... <em>Oh for— this is going to be good.</em>`);

  // Pick chord progression
  const progKey = Object.keys(CHORD_PROGRESSIONS).find(k => atmo.includes(k)) || 'euphoric';
  const chordProg = CHORD_PROGRESSIONS[progKey];
  const chordLen  = Math.floor(phraseChoice / chordProg.length); // steps per chord

  // Scale degrees for melody (upper octave)
  const octaveUp  = scale.map(n => n + 12);
  const allNotes  = [...scale, ...octaveUp];

  let notes = [];

  if (style === 'arp') {
    // Arpeggiated — per-chord arp pattern that evolves each chord
    const arpPatterns = [
      [0,2,4,2],      // up
      [4,2,0,2],      // down
      [0,4,2,4],      // pivot
      [2,0,4,2],      // offset
    ];
    chordProg.forEach((chord, ci) => {
      const startStep = ci * chordLen;
      const pat = arpPatterns[ci % arpPatterns.length];
      const stepSize = Math.max(1, Math.floor(chordLen / (pat.length * 2)));
      let pos = startStep;
      while (pos < startStep + chordLen && pos < phraseChoice) {
        const deg  = chord[pat[(pos - startStep) % pat.length] % chord.length];
        const midi = allNotes[Math.min(deg + 7, allNotes.length - 1)]; // upper octave arp
        notes.push({ note: midi, time: pos, duration: stepSize, velocity: 75 + (pos % 4 === 0 ? 20 : 5) });
        pos += stepSize;
      }
    });

  } else if (style === 'lead') {
    // Lead line — one phrase per chord, stepwise motion, peak on 3rd chord
    let prevDeg = 0;
    chordProg.forEach((chord, ci) => {
      const startStep = ci * chordLen;
      const numNotes  = 2 + ci; // grows: 2, 3, 4, 5
      const noteSlots = Array.from({length:numNotes}, (_,i) => startStep + Math.round(i * chordLen / numNotes));
      noteSlots.forEach((t, ni) => {
        // Step toward a chord tone from previous note
        const target   = chord[ni % chord.length];
        const deg      = Math.round(prevDeg * 0.5 + target * 0.5 + (Math.random()-0.5));
        const clamped  = Math.max(0, Math.min(allNotes.length - 1, deg));
        const dur      = ni === numNotes - 1 ? Math.max(2, chordLen - noteSlots[ni] + startStep) : Math.max(1, noteSlots[ni+1] - t - 1);
        notes.push({ note: allNotes[clamped], time: t, duration: dur, velocity: 80 + (ni === 0 ? 20 : 5) });
        prevDeg = clamped;
      });
    });

  } else {
    // Stab / chop — rhythmic hits that follow chord changes
    chordProg.forEach((chord, ci) => {
      const startStep = ci * chordLen;
      const stabSlots = [0, 3, 5, 8, 10, 12, 14].filter(s => s < chordLen);
      stabSlots.forEach(offset => {
        if (Math.random() < 0.65) {
          const deg = chord[Math.floor(Math.random() * chord.length)];
          notes.push({ note: allNotes[Math.min(deg+7, allNotes.length-1)], time: startStep + offset, duration: 1, velocity: 88 + Math.floor(Math.random()*22) });
        }
      });
    });
  }

  // Sort by time
  notes.sort((a,b) => a.time - b.time);

  state.melody.notes = notes;
  state.melody.phraseLen = phraseChoice;
  renderPianoRoll('melody-pianoroll', notes, root, root + 24);

  const progStr = chordProg.map((c,i) => {
    const names = ['i','ii°','III','iv','v','VI','VII'];
    return names[c[0]] || `${c[0]}`;
  }).join(' → ');

  setTimeout(() => {
    addMessage('bot', `${style} in <strong>${key}</strong> over <strong>${phraseChoice} steps</strong> (${chordProg.length} chords: ${progStr}).<br>Each chord section evolves the melody — arp builds complexity, lead peaks on chord 3, stabs follow the harmony.<br><em>Click on the grid to add notes. Right-click to delete. That's a real composition right there.</em>`);
  }, 600);
}

async function aiGeneratePads() {
  addMessage('bot', "Building the atmosphere... <em>This is where the emotion lives.</em>");

  const key   = state.scene.key;
  const scale = getScale(key);
  const root  = getNoteNumber(key);
  const atmo  = state.scene.atmosphere || 'euphoric';

  // Use same chord progression logic as melody
  const progKey  = Object.keys(CHORD_PROGRESSIONS).find(k => atmo.includes(k)) || 'euphoric';
  const chordProg = CHORD_PROGRESSIONS[progKey];
  const totalSteps = 32;
  const chordLen   = Math.floor(totalSteps / chordProg.length);

  const notes = [];
  chordProg.forEach((chord, ci) => {
    const startStep = ci * chordLen;
    // Build a 3-note chord voicing (root, 3rd, 5th) one octave up
    chord.forEach((deg, vi) => {
      const midi = scale[deg % scale.length] + 12;
      notes.push({
        note: midi,
        time: startStep,
        duration: chordLen,
        velocity: vi === 0 ? 65 : 55, // root slightly louder
      });
    });
  });

  state.pads.notes = notes;
  renderPianoRoll('pads-pianoroll', notes, root + 6, root + 30);
  
  setTimeout(() => {
    addMessage('bot', `Warm pad chords in ${key}. Long sustained notes that breathe underneath everything. <em>Now THAT's an atmosphere.</em>`);
  }, 500);
}

// ─── PIANO ROLL RENDERER ───
function renderPianoRoll(containerId, notes, minNote, maxNote) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const role = containerId.includes('bass') ? 'bass' : containerId.includes('pad') ? 'pad' : 'melody';
  const range = maxNote - minNote;
  const totalSteps = 32; // 2 bars of 16ths
  const cellW = Math.max(18, Math.floor((container.clientWidth || 600) / totalSteps));
  const rows  = range + 1;
  const cellH = Math.max(10, Math.floor((container.clientHeight || 200) / rows));
  const gridW = cellW * totalSteps;
  const gridH = cellH * rows;

  container.style.position = 'relative';
  container.style.overflow = 'auto';
  container.style.cursor   = 'crosshair';

  // Draw grid background via canvas
  const canvas = document.createElement('canvas');
  canvas.width  = gridW;
  canvas.height = gridH;
  canvas.style.position = 'absolute';
  canvas.style.top = '0'; canvas.style.left = '0';
  canvas.style.pointerEvents = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  for (let r = 0; r < rows; r++) {
    const noteNum = maxNote - r;
    const isBlack = [1,3,6,8,10].includes(noteNum % 12);
    ctx.fillStyle = isBlack ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, r * cellH, gridW, cellH);
  }
  // Beat lines
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let s = 0; s <= totalSteps; s++) {
    ctx.globalAlpha = (s % 4 === 0) ? 0.4 : 0.12;
    ctx.beginPath(); ctx.moveTo(s*cellW, 0); ctx.lineTo(s*cellW, gridH); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Note state (mutable copy)
  let noteArr = notes.map(n => ({...n}));

  function noteToRow(midiNote) { return maxNote - midiNote; }
  function rowToMidi(row)      { return maxNote - row; }
  function timeToCol(time)     { return Math.round(time); }
  function colToTime(col)      { return col; }

  function redrawNotes() {
    // Remove old note divs
    container.querySelectorAll('.pr-note').forEach(e => e.remove());
    noteArr.forEach((n, idx) => {
      const col = timeToCol(n.time);
      const row = noteToRow(n.note);
      if (row < 0 || row >= rows) return;
      const el = document.createElement('div');
      el.className = 'pr-note';
      el.style.position = 'absolute';
      el.style.left   = (col * cellW) + 'px';
      el.style.top    = (row * cellH + 1) + 'px';
      el.style.width  = Math.max(cellW - 1, (n.duration || 2) * cellW - 1) + 'px';
      el.style.height = (cellH - 2) + 'px';
      el.style.opacity = (n.velocity || 100) / 127;
      el.dataset.idx  = idx;
      // Right-click to delete
      el.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        noteArr.splice(idx, 1);
        syncBack();
        redrawNotes();
      });
      container.appendChild(el);
    });
  }

  function syncBack() {
    if (role === 'bass')   state.bass.notes   = noteArr.map(n => ({...n}));
    else if (role === 'pad') state.pads.notes = noteArr.map(n => ({...n}));
    else                   state.melody.notes = noteArr.map(n => ({...n}));
  }

  // Click on grid to add note
  let painting = false;
  let paintNote = null;
  let paintStartCol = 0;

  container.addEventListener('mousedown', e => {
    if (e.target.classList.contains('pr-note')) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const y = e.clientY - rect.top  + container.scrollTop;
    const col  = Math.floor(x / cellW);
    const row  = Math.floor(y / cellH);
    const midi = rowToMidi(row);
    if (midi < minNote || midi > maxNote) return;
    painting = true;
    paintStartCol = col;
    paintNote = { note: midi, time: colToTime(col), duration: 1, velocity: 100 };
    noteArr.push(paintNote);
    BF_Audio.playNote(midi, role, 0.15).catch(()=>{});
    redrawNotes();
  });

  container.addEventListener('mousemove', e => {
    if (!painting || !paintNote) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const col = Math.floor(x / cellW);
    paintNote.duration = Math.max(1, col - paintStartCol + 1);
    redrawNotes();
  });

  const endPaint = () => {
    if (painting) { syncBack(); }
    painting = false; paintNote = null;
  };
  container.addEventListener('mouseup',    endPaint);
  container.addEventListener('mouseleave', endPaint);

  redrawNotes();
}

// ─── MUSIC THEORY HELPERS ───
function getNoteNumber(key) {
  const map = {'C':48,'D':50,'E':52,'F':53,'G':55,'A':57,'B':59,
    'Am':45,'Bm':47,'Cm':48,'Dm':50,'Em':52,'Fm':53,'Gm':55,'Bbm':46};
  return map[key] || 48;
}

function getScale(key) {
  const root = getNoteNumber(key);
  const isMinor = key.includes('m');
  const intervals = isMinor 
    ? [0,2,3,5,7,8,10] // Natural minor
    : [0,2,4,5,7,9,11]; // Major
  return intervals.map(i => root + i);
}

// ─── PREVIEW (USING TONE.JS OR WEB AUDIO) ───
async function previewDrums() {
  const btn = document.getElementById('drum-preview');
  if (BF_Audio.getIsPlaying()) {
    BF_Audio.stopAll();
    if (btn) btn.textContent = '▶ Preview';
    document.querySelectorAll('.seq-step').forEach(c => c.classList.remove('playhead'));
    return;
  }
  if (btn) btn.textContent = '⏹ Stop';

  // Convert flat pattern object to arrays per row
  const rows = ['kick','snare','chh','ohh','perc'];
  const pattern = {};
  rows.forEach(r => {
    pattern[r] = Array.from({length:16}, (_,i) => !!state.drums.pattern[`${r}-${i}`]);
  });

  await BF_Audio.playDrumPattern(
    pattern,
    state.scene.bpm || 128,
    2,
    (step) => {
      document.querySelectorAll('.seq-step').forEach(c => {
        c.classList.toggle('playhead', parseInt(c.dataset.step) === step % 16);
      });
    },
    () => {
      if (btn) btn.textContent = '▶ Preview';
      document.querySelectorAll('.seq-step').forEach(c => c.classList.remove('playhead'));
    }
  );
}

async function previewBass() {
  const btn = document.getElementById('bass-preview');
  if (BF_Audio.getIsPlaying()) {
    BF_Audio.stopAll();
    if (btn) btn.textContent = '▶ Preview'; return;
  }
  if (!state.bass.notes.length) {
    addMessage('bot', "Generate a bassline first — nothing to preview yet."); return;
  }
  if (btn) btn.textContent = '⏹ Stop';
  await BF_Audio.playSequence(
    state.bass.notes,
    state.scene.bpm || 128,
    'bass',
    null,
    () => { if (btn) btn.textContent = '▶ Preview'; }
  );
}

async function previewMelody() {
  const btn = document.getElementById('melody-preview');
  if (BF_Audio.getIsPlaying()) {
    BF_Audio.stopAll();
    if (btn) btn.textContent = '▶ Preview'; return;
  }
  if (!state.melody.notes.length) {
    addMessage('bot', "Generate a melody first — nothing to preview yet."); return;
  }
  if (btn) btn.textContent = '⏹ Stop';
  await BF_Audio.playSequence(
    state.melody.notes,
    state.scene.bpm || 128,
    'melody',
    null,
    () => { if (btn) btn.textContent = '▶ Preview'; }
  );
}

async function previewPads() {
  const btn = document.getElementById('pads-preview');
  if (BF_Audio.getIsPlaying()) {
    BF_Audio.stopAll();
    if (btn) btn.textContent = '▶ Preview'; return;
  }
  if (!state.pads.notes.length) {
    addMessage('bot', "Generate pads first — nothing to preview yet."); return;
  }
  if (btn) btn.textContent = '⏹ Stop';
  await BF_Audio.playSequence(
    state.pads.notes,
    state.scene.bpm || 128,
    'pad',
    null,
    () => { if (btn) btn.textContent = '▶ Preview'; }
  );
}


// ── FX Lane → CC Automation MIDI ──
function buildFxAutomationMidi() {
  const sections = getSections(state.scene.length);
  const events = [];
  let absoluteTick = 0;
  const TICKS_PER_BEAT = 480;
  const TICKS_PER_BAR  = TICKS_PER_BEAT * 4;

  sections.forEach((name, si) => {
    const sd = state.sectionDesigner[si];
    const barCount = sd ? sd.bars : 4;
    const barTicks = barCount * TICKS_PER_BAR;
    if (!sd || !sd.fx || !sd.fx.length) { absoluteTick += barTicks; return; }

    sd.fx.forEach(fxId => {
      const fxDef = SD_FX.find(f => f.id === fxId);
      if (!fxDef) return;
      const cc = fxDef.cc;

      if (fxId === 'filter-up' || fxId === 'riser') {
        for (let step = 0; step <= 32; step++) {
          events.push({ tick: absoluteTick + Math.floor((step/32)*barTicks), cc, val: Math.floor((step/32)*127) });
        }
      } else if (fxId === 'filter-down' || fxId === 'downlifter') {
        for (let step = 0; step <= 32; step++) {
          events.push({ tick: absoluteTick + Math.floor((step/32)*barTicks), cc, val: 127 - Math.floor((step/32)*127) });
        }
      } else if (fxId === 'silence-drop') {
        events.push({ tick: absoluteTick, cc, val: 100 });
        events.push({ tick: absoluteTick + barTicks - TICKS_PER_BEAT, cc, val: 0 });
      } else if (fxId === 'stutter' || fxId === 'chop') {
        for (let beat = 0; beat < barCount * 4; beat++) {
          events.push({ tick: absoluteTick + beat * TICKS_PER_BEAT, cc, val: beat % 2 === 0 ? 127 : 0 });
        }
      } else if (fxId === 'glitch' || fxId === 'bitcrush') {
        for (let beat = 0; beat < barCount * 4; beat++) {
          const offset = beat % 3 === 0 ? Math.floor(TICKS_PER_BEAT/8) : 0;
          events.push({ tick: absoluteTick + beat * TICKS_PER_BEAT + offset, cc,
            val: beat % 3 === 0 ? 127 : beat % 2 === 0 ? 64 : 0 });
        }
      } else {
        events.push({ tick: absoluteTick, cc, val: 127 });
        events.push({ tick: absoluteTick + barTicks, cc, val: 0 });
      }
    });

    absoluteTick += barTicks;
  });

  if (!events.length) return null;

  events.sort((a,b) => a.tick - b.tick);

  // Build raw MIDI bytes directly (no helper dependency)
  const bpm = state.scene.bpm || 128;
  const tempo = Math.round(60000000 / bpm);
  const rawEvents = [];

  // Tempo meta event at tick 0
  rawEvents.push({ tick: 0, data: [0xFF,0x51,0x03,(tempo>>16)&0xFF,(tempo>>8)&0xFF,tempo&0xFF] });
  // Track name
  const tname = [0xFF,0x03,0x0E,...'BFF FX Automation'.split('').map(c=>c.charCodeAt(0))];
  rawEvents.push({ tick: 0, data: tname });

  // CC events
  events.forEach(ev => {
    rawEvents.push({ tick: ev.tick, data: [0xB0, ev.cc & 0x7F, ev.val & 0x7F] });
  });

  rawEvents.sort((a,b) => a.tick - b.tick);

  // Encode as delta-time events
  const trackBytes = [];
  let prevTick = 0;
  rawEvents.forEach(ev => {
    const delta = ev.tick - prevTick;
    writeVarLen(trackBytes, delta);
    trackBytes.push(...ev.data);
    prevTick = ev.tick;
  });
  writeVarLen(trackBytes, 0);
  trackBytes.push(0xFF, 0x2F, 0x00); // end of track

  // MIDI header chunk (format 0, 1 track, 480 ticks/beat)
  const header = [
    0x4D,0x54,0x68,0x64, 0x00,0x00,0x00,0x06,
    0x00,0x00, 0x00,0x01,
    (TICKS_PER_BEAT>>8)&0xFF, TICKS_PER_BEAT&0xFF
  ];

  // Track chunk
  const trackLen = trackBytes.length;
  const trackChunk = [
    0x4D,0x54,0x72,0x6B, // "MTrk"
    (trackLen>>24)&0xFF,(trackLen>>16)&0xFF,(trackLen>>8)&0xFF,trackLen&0xFF,
    ...trackBytes
  ];

  return new Uint8Array([...header, ...trackChunk]);
}

// ═══════════════════════════════════════════════
// MIDI EXPORT ENGINE
// Pure JS — no dependencies. Builds a valid .mid file binary.
// ═══════════════════════════════════════════════

// Ableton Drum Rack MIDI note mapping (default Kit-Core 909)
const DRUM_MIDI_NOTES = {
  kick:  36,  // C1
  snare: 38,  // D1
  chh:   42,  // F#1 (closed hat)
  ohh:   46,  // A#1 (open hat)
  perc:  50,  // D2
};

function writeVarLen(value) {
  // MIDI variable-length encoding
  let bytes = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }
  return bytes.reverse();
}


// ── Build a single-instrument drum MIDI (one row only) ──
function buildDrumMidiSplit(pattern, bpm, bars, rowId) {
  const ticksPerBeat = 480;
  const ticksPerStep = ticksPerBeat / 4;
  const totalSteps = 16 * bars;
  const note = DRUM_MIDI_NOTES[rowId] || 36;

  const header = [
    0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01,
    (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF
  ];

  let events = [];
  const tempo = Math.round(60000000 / bpm);
  events.push({ tick: 0, data: [0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF] });

  const tname = ('BFF ' + rowId.charAt(0).toUpperCase() + rowId.slice(1));
  const tnameBytes = tname.split('').map(c => c.charCodeAt(0));
  events.push({ tick: 0, data: [0xFF, 0x03, tnameBytes.length, ...tnameBytes] });

  for (let bar = 0; bar < bars; bar++) {
    for (let step = 0; step < 16; step++) {
      const key = `${rowId}-${step}`;
      if (pattern[key]) {
        const tick = (bar * 16 + step) * ticksPerStep;
        const dur  = Math.round(ticksPerStep * 0.85);
        const vel  = rowId === 'kick' ? 110 : rowId === 'snare' ? 100 : 85;
        events.push({ tick, data: [0x99, note, vel] });
        events.push({ tick: tick + dur, data: [0x89, note, 0] });
      }
    }
  }

  const endTick = totalSteps * ticksPerStep;
  events.push({ tick: endTick, data: [0xFF, 0x2F, 0x00] });
  events.sort((a, b) => a.tick - b.tick);

  let trackBytes = [];
  let prevTick = 0;
  events.forEach(evt => {
    const delta = evt.tick - prevTick;
    prevTick = evt.tick;
    trackBytes.push(...writeVarLen(delta));
    trackBytes.push(...evt.data);
  });

  const trackLen = trackBytes.length;
  const track = [
    0x4D, 0x54, 0x72, 0x6B,
    (trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF,
    (trackLen >> 8) & 0xFF, trackLen & 0xFF,
    ...trackBytes
  ];
  return new Uint8Array([...header, ...track]);
}

// ── Export all drum instruments as separate MIDI files in a ZIP ──
async function exportDrumSplitPack() {
  const hasNotes = Object.values(state.drums.pattern).some(v => v);
  if (!hasNotes) {
    addMessage('bot', "Your drum pattern is empty! Build some drums first. <em>No notes, no zip.</em>");
    return;
  }

  const bpm  = state.scene.bpm;
  const totalMins = parseFloat(state.scene.length) || 6;
  const bars = Math.max(4, Math.round((totalMins * bpm) / 4));
  const safe = `BFF_Drums_${bpm}bpm`;

  const drumRows = [
    { id: 'kick',  label: 'Kick' },
    { id: 'snare', label: 'Snare' },
    { id: 'chh',   label: 'HatsC' },
    { id: 'ohh',   label: 'HatsO' },
    { id: 'perc',  label: 'Perc'  },
  ];

  const files = [];
  const exported = [];

  drumRows.forEach(row => {
    // Check if this instrument has any hits
    const hasHits = Array.from({length: 16}, (_, s) => `${row.id}-${s}`).some(k => state.drums.pattern[k]);
    if (hasHits) {
      const bytes = buildDrumMidiSplit(state.drums.pattern, bpm, bars, row.id);
      files.push({ name: `${safe}_${row.label}.mid`, bytes });
      exported.push(row.label);
    }
  });

  // Also include the combined all-drums file
  files.push({ name: `${safe}_ALL.mid`, bytes: buildDrumMidi(state.drums.pattern, bpm, bars) });

  const zip = buildZip(files);
  const zipName = `${safe}_SplitPack.zip`;

  if (isElectron()) {
    await window.bff.midi.save(zipName, Array.from(zip));
  } else {
    downloadBytes(zip, zipName, 'application/zip');
  }

  addMessage('bot', `🥁 <strong>${zipName}</strong> saved — ${exported.length} split drum MIDI files: <strong>${exported.join(' · ')}</strong> + one combined ALL file.<br><br>In Ableton: drop each onto its own Drum Rack pad or instrument channel. Mute/unmute per section to control when hats and perc enter. <em>Your drums just got surgical.</em>`);
}


function buildDrumMidi(pattern, bpm, bars = 2) {
  const ticksPerBeat = 480;
  const ticksPerStep = ticksPerBeat / 4; // 16th note = quarter note / 4
  const totalSteps = 16 * bars;

  // ── MIDI Header Chunk ──
  const header = [
    0x4D, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // chunk length = 6
    0x00, 0x00,             // format 0 (single track)
    0x00, 0x01,             // 1 track
    (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF // ticks per quarter note
  ];

  // ── Build track events ──
  let events = [];

  // Tempo event (microseconds per beat)
  const tempo = Math.round(60000000 / bpm);
  events.push({
    tick: 0,
    data: [0xFF, 0x51, 0x03,
      (tempo >> 16) & 0xFF,
      (tempo >> 8) & 0xFF,
      tempo & 0xFF
    ]
  });

  // Track name
  const trackName = 'BFF Drums';
  const nameBytes = trackName.split('').map(c => c.charCodeAt(0));
  events.push({
    tick: 0,
    data: [0xFF, 0x03, nameBytes.length, ...nameBytes]
  });

  // Note events — loop the pattern for `bars` bars
  DRUM_ROWS.forEach(row => {
    for (let bar = 0; bar < bars; bar++) {
      for (let step = 0; step < 16; step++) {
        const key = `${row.id}-${step}`;
        if (pattern[key]) {
          const note = DRUM_MIDI_NOTES[row.id] || 36;
          const tick = (bar * 16 + step) * ticksPerStep;
          const velocity = 100;
          const duration = Math.round(ticksPerStep * 0.9); // slight gap between hits

          // Note On
          events.push({ tick, data: [0x99, note, velocity] }); // ch10 = drums
          // Note Off
          events.push({ tick: tick + duration, data: [0x89, note, 0] });
        }
      }
    }
  });

  // End of track
  const endTick = totalSteps * ticksPerStep;
  events.push({ tick: endTick, data: [0xFF, 0x2F, 0x00] });

  // Sort by tick
  events.sort((a, b) => a.tick - b.tick);

  // Convert to delta-time bytes
  let trackBytes = [];
  let prevTick = 0;
  events.forEach(evt => {
    const delta = evt.tick - prevTick;
    prevTick = evt.tick;
    trackBytes.push(...writeVarLen(delta));
    trackBytes.push(...evt.data);
  });

  // ── MIDI Track Chunk ──
  const trackLen = trackBytes.length;
  const track = [
    0x4D, 0x54, 0x72, 0x6B, // "MTrk"
    (trackLen >> 24) & 0xFF,
    (trackLen >> 16) & 0xFF,
    (trackLen >> 8) & 0xFF,
    trackLen & 0xFF,
    ...trackBytes
  ];

  return new Uint8Array([...header, ...track]);
}

function buildNotesMidi(notes, channelNum, bpm, trackName = 'BFF') {
  const ticksPerBeat = 480;
  const ticksPerStep = ticksPerBeat / 4;

  const header = [
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF
  ];

  let events = [];

  const tempo = Math.round(60000000 / bpm);
  events.push({
    tick: 0,
    data: [0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF]
  });

  const nameBytes = trackName.split('').map(c => c.charCodeAt(0));
  events.push({ tick: 0, data: [0xFF, 0x03, nameBytes.length, ...nameBytes] });

  const ch = channelNum & 0x0F;
  notes.forEach(n => {
    const tick = Math.round(n.time * ticksPerStep);
    const dur  = Math.round((n.duration || 1) * ticksPerStep * 0.9);
    const vel  = Math.round(n.velocity || 90);
    events.push({ tick,       data: [0x90 | ch, n.note & 0x7F, vel] });
    events.push({ tick: tick + dur, data: [0x80 | ch, n.note & 0x7F, 0] });
  });

  const endTick = Math.max(...notes.map(n => Math.round((n.time + (n.duration||1)) * ticksPerStep))) + ticksPerStep;
  events.push({ tick: endTick, data: [0xFF, 0x2F, 0x00] });

  events.sort((a, b) => a.tick - b.tick);

  let trackBytes = [];
  let prevTick = 0;
  events.forEach(evt => {
    const delta = evt.tick - prevTick;
    prevTick = evt.tick;
    trackBytes.push(...writeVarLen(delta));
    trackBytes.push(...evt.data);
  });

  const trackLen = trackBytes.length;
  const track = [
    0x4D, 0x54, 0x72, 0x6B,
    (trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF,
    (trackLen >> 8) & 0xFF, trackLen & 0xFF,
    ...trackBytes
  ];

  return new Uint8Array([...header, ...track]);
}

function downloadMidi(bytes, filename) {
  const blob = new Blob([bytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportDrumMidi() {
  const hasNotes = Object.values(state.drums.pattern).some(v => v);
  if (!hasNotes) {
    addMessage('bot', "Your drum pattern is empty! Toggle some steps on the sequencer first. <em>Even I can't export silence.</em>");
    return;
  }
  const totalMins = parseFloat(state.scene.length) || 6;
  const bars = Math.max(4, Math.round((totalMins * state.scene.bpm) / 4));
  const midi = buildDrumMidi(state.drums.pattern, state.scene.bpm, bars);
  const filename = `BFF_Drums_${state.scene.bpm}bpm_${bars}bars.mid`;
  downloadMidi(midi, filename);
  addMessage('bot', `Drums exported → <strong>${filename}</strong>. Drop it on a Drum Rack in Ableton. Notes are mapped to the default Kit-Core 909: Kick=C1, Snare=D1, CH=F#1, OH=A#1, Perc=D2. <em>You're welcome.</em>`);
}

function exportBassMidi() {
  if (!state.bass.notes.length) {
    addMessage('bot', "No bass notes yet — generate a bassline first! <em>Bass first, then glory.</em>");
    return;
  }
  const midi = buildNotesMidi(state.bass.notes, 0, state.scene.bpm, 'BFF Bass');
  downloadMidi(midi, `BFF_Bass_${state.scene.key}_${state.scene.bpm}bpm.mid`);
  addMessage('bot', `Bass exported. Drop it on a synth channel in ${state.scene.key}. <em>That low end isn't going to produce itself.</em>`);
}

function exportMelodyMidi() {
  if (!state.melody.notes.length) {
    addMessage('bot', "No melody notes yet — generate a melody first! <em>Step 5, genius.</em>");
    return;
  }
  const midi = buildNotesMidi(state.melody.notes, 1, state.scene.bpm, 'BFF Melody');
  downloadMidi(midi, `BFF_Melody_${state.scene.key}_${state.scene.bpm}bpm.mid`);
  addMessage('bot', `Melody exported in ${state.scene.key}. <em>Now THAT's a hook.</em>`);
}

// ── Export melody split: Arp + Lead as separate MIDI files ──
async function exportMelodySplitPack() {
  const melNotes  = state.melody.notes  || [];
  const arpNotes  = state.arp?.notes    || [];
  const leadNotes = state.lead?.notes   || [];

  // Fallback: if no separate arp/lead, try to split melody by note density
  // Short notes (len <= 2 steps) = arp, longer = lead
  let arpOut  = arpNotes.length  ? arpNotes  : melNotes.filter(n => (n.duration || n.len || 1) <= 2);
  let leadOut = leadNotes.length ? leadNotes : melNotes.filter(n => (n.duration || n.len || 1) > 2);

  if (!melNotes.length && !arpNotes.length && !leadNotes.length) {
    addMessage('bot', "No melody or arp notes yet! Generate or draw a melody first.");
    return;
  }

  const bpm  = state.scene.bpm;
  const key  = state.scene.key;
  const safe = `BFF_Melody_${key.replace('#','s')}_${bpm}bpm`;
  const files = [];
  const exported = [];

  if (arpOut.length) {
    files.push({ name: `${safe}_Arp.mid`, bytes: buildNotesMidi(arpOut, 1, bpm, 'BFF Arp') });
    exported.push('Arp');
  }
  if (leadOut.length) {
    files.push({ name: `${safe}_Lead.mid`, bytes: buildNotesMidi(leadOut, 2, bpm, 'BFF Lead') });
    exported.push('Lead');
  }
  // Always include combined
  if (melNotes.length) {
    files.push({ name: `${safe}_Combined.mid`, bytes: buildNotesMidi(melNotes, 1, bpm, 'BFF Melody') });
    exported.push('Combined');
  }

  if (!files.length) {
    addMessage('bot', "Nothing to split — generate a melody first!");
    return;
  }

  const zip = buildZip(files);
  const zipName = `${safe}_SplitPack.zip`;

  if (isElectron()) {
    await window.bff.midi.save(zipName, Array.from(zip));
  } else {
    downloadBytes(zip, zipName, 'application/zip');
  }

  addMessage('bot', `🎵 <strong>${zipName}</strong> — split as: <strong>${exported.join(' · ')}</strong>.<br><br>In Ableton: Arp goes on a repeating synth (high-passed, running throughout). Lead goes on your main synth/vocal bus — bring it in on drops only. <em>Arp supports. Lead dominates. That's the game.</em>`);
}

function exportPadsMidi() {
  if (!state.pads.notes.length) {
    addMessage('bot', "No pad notes yet — generate pads first! <em>Atmosphere doesn't generate itself.</em>");
    return;
  }
  const midi = buildNotesMidi(state.pads.notes, 2, state.scene.bpm, 'BFF Pads');
  downloadMidi(midi, `BFF_Pads_${state.scene.key}_${state.scene.bpm}bpm.mid`);
  addMessage('bot', `Pads exported. Long chords in ${state.scene.key}. <em>Beautiful.</em>`);
}

async function exportFullMidiPack() {
  const hasAnything = Object.values(state.drums.pattern).some(v => v) ||
    state.bass.notes.length || state.melody.notes.length || state.pads.notes.length;
  if (!hasAnything) {
    addMessage('bot', "Nothing to export yet! Generate at least drums before hitting Export. <em>You need to actually make music first.</em>");
    return;
  }

  const bpm  = state.scene.bpm;
  const key  = state.scene.key;
  const totalMins = parseFloat(state.scene.length) || 6;
  const bars = Math.max(4, Math.round((totalMins * bpm) / 4));
  const safe = `BFF_${key.replace('#','s')}_${bpm}bpm`;
  const files = [];
  const exported = [];

  // ── DRUMS: split per instrument ──
  if (Object.values(state.drums.pattern).some(v => v)) {
    const drumRows = [
      { id: 'kick', label: 'Kick' }, { id: 'snare', label: 'Snare' },
      { id: 'chh',  label: 'HatsC' }, { id: 'ohh', label: 'HatsO' },
      { id: 'perc', label: 'Perc' },
    ];
    drumRows.forEach(row => {
      const hasHits = Array.from({length:16}, (_,s) => `${row.id}-${s}`).some(k => state.drums.pattern[k]);
      if (hasHits) {
        files.push({ name: `${safe}_${row.label}.mid`, bytes: buildDrumMidiSplit(state.drums.pattern, bpm, bars, row.id) });
        exported.push(row.label);
      }
    });
    // Combined drums too
    files.push({ name: `${safe}_Drums_ALL.mid`, bytes: buildDrumMidi(state.drums.pattern, bpm, bars) });
  }

  // ── BASS ──
  if (state.bass.notes.length) {
    files.push({ name: `${safe}_Bass.mid`, bytes: buildNotesMidi(state.bass.notes, 0, bpm, 'BFF Bass') });
    exported.push('Bass');
  }

  // ── MELODY: split into Arp + Lead ──
  const melNotes  = state.melody.notes || [];
  const arpNotes  = state.arp?.notes   || [];
  const leadNotes = state.lead?.notes  || [];

  if (melNotes.length || arpNotes.length || leadNotes.length) {
    const arpOut  = arpNotes.length  ? arpNotes  : melNotes.filter(n => (n.duration || n.len || 1) <= 2);
    const leadOut = leadNotes.length ? leadNotes : melNotes.filter(n => (n.duration || n.len || 1) > 2);

    if (arpOut.length) {
      files.push({ name: `${safe}_Arp.mid`, bytes: buildNotesMidi(arpOut, 1, bpm, 'BFF Arp') });
      exported.push('Arp');
    }
    if (leadOut.length) {
      files.push({ name: `${safe}_Lead.mid`, bytes: buildNotesMidi(leadOut, 2, bpm, 'BFF Lead') });
      exported.push('Lead');
    }
    if (melNotes.length) {
      files.push({ name: `${safe}_Melody.mid`, bytes: buildNotesMidi(melNotes, 1, bpm, 'BFF Melody') });
    }
  }

  // ── PADS ──
  if (state.pads.notes.length) {
    files.push({ name: `${safe}_Pads.mid`, bytes: buildNotesMidi(state.pads.notes, 2, bpm, 'BFF Pads') });
    exported.push('Pads');
  }

  // ── FX AUTOMATION ──
  const fxMidi = buildFxAutomationMidi();
  if (fxMidi) {
    files.push({ name: `${safe}_FX_Automation.mid`, bytes: fxMidi });
    exported.push('FX Automation (CC)');
  }

  const zip = buildZip(files);
  const zipName = `${safe}_MIDIPack.zip`;

  if (isElectron()) {
    await window.bff.midi.save(zipName, Array.from(zip));
  } else {
    downloadBytes(zip, zipName, 'application/zip');
  }

  addMessage('bot', `📦 <strong>${zipName}</strong> — ${files.length} files inside.<br>
    🥁 Drums split: Kick · Snare · HatsC · HatsO · Perc (+ combined ALL)<br>
    🎵 Melody split: Arp + Lead as separate clips<br>
    🔊 ${exported.join(' · ')}<br><br>
    Drop each onto its own Ableton channel. Bring hats and perc in section by section. Arp runs throughout — Lead comes in on your drops. <em>That's how Quinton does it. You're welcome.</em>`);
}


// ═══════════════════════════════════════════════
// DRAG-TO-DAW ENGINE
// In Electron: uses native OS file drag (ipcRenderer → main → startDrag)
// Fallback: browser blob download
// ═══════════════════════════════════════════════

function isElectron() {
  return typeof window !== 'undefined' && window.bff && window.bff.app && window.bff.app.isElectron;
}

// Generate MIDI bytes for a given layer
function getMidiForLayer(layer) {
  const bpm = state.scene.bpm;
  const key = state.scene.key;
  switch (layer) {
    case 'drums':
      return { bytes: buildDrumMidi(state.drums.pattern, bpm, 2), filename: `BFF_Drums_${bpm}bpm.mid` };
    case 'bass':
      return state.bass.notes.length
        ? { bytes: buildNotesMidi(state.bass.notes, 0, bpm, 'BFF Bass'), filename: `BFF_Bass_${key}.mid` }
        : null;
    case 'melody':
      return state.melody.notes.length
        ? { bytes: buildNotesMidi(state.melody.notes, 1, bpm, 'BFF Melody'), filename: `BFF_Melody_${key}.mid` }
        : null;
    case 'pads':
      return state.pads.notes.length
        ? { bytes: buildNotesMidi(state.pads.notes, 2, bpm, 'BFF Pads'), filename: `BFF_Pads_${key}.mid` }
        : null;
    default:
      return null;
  }
}

function hasLayerData(layer) {
  if (layer === 'drums') return Object.values(state.drums.pattern).some(v => v);
  if (layer === 'bass') return state.bass.notes.length > 0;
  if (layer === 'melody') return state.melody.notes.length > 0;
  if (layer === 'pads') return state.pads.notes.length > 0;
  return false;
}

// ── Drag cards setup ──
function initDragCards() {
  const cards = document.querySelectorAll('.drag-card');

  cards.forEach(card => {
    const layer = card.dataset.layer;

    // Update card visual state
    updateCardState(card, layer);

    // Native drag (Electron)
    card.addEventListener('dragstart', (e) => {
      if (!hasLayerData(layer)) {
        e.preventDefault();
        pulseCard(card, 'empty');
        return;
      }
      const midi = getMidiForLayer(layer);
      if (!midi) { e.preventDefault(); return; }

      card.classList.add('dragging');

      if (isElectron()) {
        // Tell main process to write temp file + start native OS drag
        e.preventDefault(); // suppress browser drag, we use native
        window.bff.midi.startDrag(midi.filename, Array.from(midi.bytes));
      } else {
        // Browser fallback: set drag data (won't open in Ableton but at least something happens)
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', midi.filename);
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    // Make card draggable
    card.setAttribute('draggable', 'true');

    // Save button (⬇)
    const saveBtn = card.querySelector('.drag-card-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveMidiLayer(layer, card);
      });
    }
  });

  // Update key labels
  updateExportKeyLabels();
}

function updateCardState(card, layer) {
  const hasData = hasLayerData(layer);
  if (hasData) {
    card.classList.remove('card-empty');
    card.classList.add('card-ready');
  } else {
    card.classList.remove('card-ready');
    card.classList.add('card-empty');
  }
}

function pulseCard(card, type) {
  card.classList.add(`pulse-${type}`);
  setTimeout(() => card.classList.remove(`pulse-${type}`), 800);
}

async function saveMidiLayer(layer, card) {
  if (!hasLayerData(layer)) {
    pulseCard(card, 'empty');
    addMessage('bot', `No ${layer} data yet — generate the ${layer} pattern first!`);
    return;
  }

  const midi = getMidiForLayer(layer);
  if (!midi) return;

  if (isElectron()) {
    // Use native save dialog
    const result = await window.bff.midi.save(midi.filename, Array.from(midi.bytes));
    if (result && result.saved) {
      pulseCard(card, 'saved');
      addMessage('bot', `${layer.charAt(0).toUpperCase() + layer.slice(1)} saved → <strong>${result.path}</strong>. <em>You're welcome.</em>`);
    }
  } else {
    // Browser download fallback
    downloadMidi(midi.bytes, midi.filename);
    pulseCard(card, 'saved');
  }
}

function updateExportKeyLabels() {
  const key = state.scene.key;
  ['bass','melody','pads'].forEach(id => {
    const el = document.getElementById(`exp-key-${id}`);
    if (el) el.textContent = key;
  });
}

// Refresh drag cards whenever export panel is opened
// goToStep export-panel logic merged into original above


// ═══════════════════════════════════════════════
// SPLIT DRUM MIDI EXPORT
// One .mid file per instrument — drop each onto its own track
// ═══════════════════════════════════════════════

function buildSingleDrumMidi(rowId, pattern, bpm, bars = 2) {
  // Builds a MIDI file containing only one drum instrument
  const ticksPerBeat = 480;
  const ticksPerStep = ticksPerBeat / 4;
  const totalSteps = 16 * bars;
  const note = DRUM_MIDI_NOTES[rowId] || 36;

  const header = [
    0x4D, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    (ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF
  ];

  let events = [];

  const tempo = Math.round(60000000 / bpm);
  events.push({ tick: 0, data: [0xFF, 0x51, 0x03,
    (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF] });

  const name = `BFF ${rowId.charAt(0).toUpperCase() + rowId.slice(1)}`;
  const nameBytes = name.split('').map(c => c.charCodeAt(0));
  events.push({ tick: 0, data: [0xFF, 0x03, nameBytes.length, ...nameBytes] });

  for (let bar = 0; bar < bars; bar++) {
    for (let step = 0; step < 16; step++) {
      const key = `${rowId}-${step}`;
      if (pattern[key]) {
        const tick = (bar * 16 + step) * ticksPerStep;
        const dur  = Math.round(ticksPerStep * 0.9);
        events.push({ tick,       data: [0x99, note, 100] });
        events.push({ tick: tick + dur, data: [0x89, note, 0] });
      }
    }
  }

  events.push({ tick: totalSteps * ticksPerStep, data: [0xFF, 0x2F, 0x00] });
  events.sort((a, b) => a.tick - b.tick);

  let trackBytes = [];
  let prevTick = 0;
  events.forEach(evt => {
    const delta = evt.tick - prevTick;
    prevTick = evt.tick;
    trackBytes.push(...writeVarLen(delta));
    trackBytes.push(...evt.data);
  });

  const trackLen = trackBytes.length;
  const track = [
    0x4D, 0x54, 0x72, 0x6B,
    (trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF,
    (trackLen >> 8) & 0xFF, trackLen & 0xFF,
    ...trackBytes
  ];

  return new Uint8Array([...header, ...track]);
}

// Check which rows have at least one active step
function getActiveDrumRows() {
  return DRUM_ROWS.filter(row =>
    Array.from({length:16}, (_,i) => state.drums.pattern[`${row.id}-${i}`]).some(Boolean)
  );
}

// Download one file per active drum instrument
async function exportDrumsSplit(fromCard) {
  const active = getActiveDrumRows();
  if (!active.length) {
    if (fromCard) pulseCard(fromCard, 'empty');
    addMessage('bot', "Nothing on the sequencer yet! Add some steps first. <em>Even a kick drum. Something.</em>");
    return;
  }

  const bpm = state.scene.bpm;
  const bars = 2;

  if (isElectron()) {
    // Save dialog for each file in sequence
    for (const row of active) {
      const bytes = buildSingleDrumMidi(row.id, state.drums.pattern, bpm, bars);
      const filename = `BFF_${row.name.replace(/\s+/g,'_')}_${bpm}bpm.mid`;
      await window.bff.midi.save(filename, Array.from(bytes));
    }
    if (fromCard) pulseCard(fromCard, 'saved');
    addMessage('bot', `Split export done — ${active.length} files, one per instrument. Each one goes on its own track. <em>Now THAT's a clean session.</em>`);
  } else {
    // Browser: trigger downloads one by one with slight delay
    active.forEach((row, i) => {
      setTimeout(() => {
        const bytes = buildSingleDrumMidi(row.id, state.drums.pattern, bpm, bars);
        const filename = `BFF_${row.name.replace(/\s+/g,'_')}_${bpm}bpm.mid`;
        downloadMidi(bytes, filename);
      }, i * 400);
    });
    if (fromCard) pulseCard(fromCard, 'saved');
    addMessage('bot', `${active.length} MIDI files downloading — one per drum. Drop each onto its own track. <em>You're welcome.</em>`);
  }
}


// ═══════════════════════════════════════════════
// DRUM CARD — COMBINED / SPLIT MODE TOGGLE
// ═══════════════════════════════════════════════

let drumExportMode = 'combined'; // 'combined' | 'split'

function initDrumExportToggle() {
  const btnCombined = document.getElementById('drum-export-combined');
  const btnSplit    = document.getElementById('drum-export-split-toggle');  // toggle button
  const saveBtn     = document.getElementById('export-drums-midi');
  const splitBtn    = document.getElementById('export-drums-split');
  const card        = document.getElementById('drag-card-drums');
  const preview     = document.getElementById('drum-split-preview');

  // Re-query the mode buttons (they're inside the card)
  const modeCombined = document.getElementById('drum-export-combined');
  const modeSplit    = document.getElementById('drum-export-split');

  if (!modeCombined || !modeSplit) return;

  function setMode(mode) {
    drumExportMode = mode;
    modeCombined.classList.toggle('dem-btn--active', mode === 'combined');
    modeSplit.classList.toggle('dem-btn--active', mode === 'split');

    if (saveBtn) saveBtn.style.display = mode === 'combined' ? '' : 'none';
    if (splitBtn) splitBtn.style.display = mode === 'split' ? '' : 'none';

    // Update card drag behaviour label
    const handle = card?.querySelector('.drag-card-handle');
    if (handle) {
      handle.innerHTML = mode === 'combined'
        ? '<span class="drag-handle-icon">⠿</span> drag to Ableton (full kit)'
        : '<span class="drag-handle-icon">⠿</span> save split — one file per drum';
    }

    // Update card data attribute so drag engine knows
    if (card) card.dataset.exportMode = mode;

    renderSplitPreview(preview);
  }

  modeCombined.addEventListener('click', (e) => { e.stopPropagation(); setMode('combined'); });
  modeSplit.addEventListener('click',    (e) => { e.stopPropagation(); setMode('split'); });

  // Split save button
  if (splitBtn) {
    splitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDrumsSplit(card);
    });
  }

  // Override drum-export-combined save button to trigger split when in split mode
  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveMidiLayer('drums', card);
    });
  }

  renderSplitPreview(preview);
  setMode('combined');
}

function renderSplitPreview(container) {
  if (!container) return;
  const active = getActiveDrumRows();
  if (!active.length) {
    container.innerHTML = '<span class="split-empty">No steps yet</span>';
    return;
  }
  container.innerHTML = active.map(row =>
    `<span class="split-pill">
      <span class="split-pill-dot" style="background:${getDrumColour(row.id)}"></span>
      ${row.name}
    </span>`
  ).join('');
}

function getDrumColour(rowId) {
  const map = { kick:'#ff5252', snare:'#ffcc52', chh:'#ffaa33', ohh:'#ff7744', perc:'#aa6bff' };
  return map[rowId] || '#888';
}

// initDrumExportToggle is called directly inside initDragCards below

// (drum split handled in exportArrangement)


// ═══════════════════════════════════════════════════════════════════
// ARRANGEMENT EXPORT ENGINE
// Exports one .mid file per section per layer — with CC automation
// baked in based on the section's role (buildup, drop, breakdown etc)
// ═══════════════════════════════════════════════════════════════════

// ── CC Map (standard + synth conventions) ──
const CC = {
  filterCutoff:  74,   // Standard / Serum / Sylenth
  filterRes:     71,   // Standard / Serum
  reverbSend:    91,   // General MIDI reverb
  delaySend:     92,   // General MIDI delay/chorus
  volume:         7,   // Channel volume
  pan:           10,
  expression:    11,
  chorusSend:    93,
  drive:         24,   // Serum OSC drive (approx)
  lfoRate:       76,   // Mod
};

// ── Section role classifier ──
function getSectionRole(name) {
  const n = name.toLowerCase();
  if (n.includes('intro'))     return 'intro';
  if (n.includes('build'))     return 'buildup';
  if (n.includes('drop'))      return 'drop';
  if (n.includes('breakdown')) return 'breakdown';
  if (n.includes('outro'))     return 'outro';
  return 'neutral';
}

// ── CC automation curve definitions per section role ──
// Each entry: { cc, points: [{pos: 0-1, val: 0-127}] }
// pos is normalised position within the clip (0=start, 1=end)
function getCCAutomation(role, layer) {
  const curves = {
    buildup: [
      // Filter sweeps open over the whole section
      { cc: CC.filterCutoff, points: [{pos:0, val:20}, {pos:0.6, val:80}, {pos:1, val:120}] },
      { cc: CC.filterRes,    points: [{pos:0, val:10}, {pos:0.7, val:40}, {pos:1, val:20}] },
      // Reverb builds up then throws on last beat
      { cc: CC.reverbSend,   points: [{pos:0, val:20}, {pos:0.85, val:30}, {pos:0.95, val:100}, {pos:1, val:10}] },
      // Volume swells
      { cc: CC.expression,   points: [{pos:0, val:60}, {pos:1, val:115}] },
    ],
    drop: [
      // Filter fully open, stays open
      { cc: CC.filterCutoff, points: [{pos:0, val:120}, {pos:1, val:120}] },
      { cc: CC.filterRes,    points: [{pos:0, val:15}, {pos:1, val:15}] },
      { cc: CC.reverbSend,   points: [{pos:0, val:18}, {pos:1, val:18}] },
      { cc: CC.expression,   points: [{pos:0, val:110}, {pos:1, val:110}] },
    ],
    breakdown: [
      // Filter closes right down — that "stripped back" feel
      { cc: CC.filterCutoff, points: [{pos:0, val:90}, {pos:0.2, val:45}, {pos:1, val:30}] },
      { cc: CC.reverbSend,   points: [{pos:0, val:60}, {pos:1, val:75}] },  // washy reverb
      { cc: CC.delaySend,    points: [{pos:0, val:40}, {pos:0.5, val:70}, {pos:1, val:40}] },
      { cc: CC.expression,   points: [{pos:0, val:75}, {pos:0.5, val:55}, {pos:1, val:65}] },
    ],
    intro: [
      // Starts dark, slightly opens
      { cc: CC.filterCutoff, points: [{pos:0, val:35}, {pos:1, val:65}] },
      { cc: CC.reverbSend,   points: [{pos:0, val:45}, {pos:1, val:35}] },
      { cc: CC.expression,   points: [{pos:0, val:55}, {pos:1, val:75}] },
    ],
    outro: [
      // Closes back down — mirror of intro
      { cc: CC.filterCutoff, points: [{pos:0, val:65}, {pos:1, val:25}] },
      { cc: CC.reverbSend,   points: [{pos:0, val:35}, {pos:1, val:55}] },
      { cc: CC.expression,   points: [{pos:0, val:75}, {pos:1, val:45}] },
    ],
    neutral: [
      { cc: CC.filterCutoff, points: [{pos:0, val:80}, {pos:1, val:80}] },
      { cc: CC.expression,   points: [{pos:0, val:90}, {pos:1, val:90}] },
    ],
  };

  // Drums get lighter automation — velocity-focused, no filter sweeps
  if (layer === 'drums') {
    return {
      buildup:   [{ cc: CC.expression, points: [{pos:0, val:65}, {pos:1, val:110}] }],
      drop:      [{ cc: CC.expression, points: [{pos:0, val:110}, {pos:1, val:110}] }],
      breakdown: [{ cc: CC.expression, points: [{pos:0, val:80}, {pos:0.5, val:55}, {pos:1, val:45}] }],
      intro:     [{ cc: CC.expression, points: [{pos:0, val:60}, {pos:1, val:75}] }],
      outro:     [{ cc: CC.expression, points: [{pos:0, val:75}, {pos:1, val:50}] }],
      neutral:   [{ cc: CC.expression, points: [{pos:0, val:90}, {pos:1, val:90}] }],
    }[role] || [];
  }

  return curves[role] || curves.neutral;
}

// ── Interpolate CC curve into MIDI CC events ──
// resolution = number of CC messages to insert across the clip
function buildCCEvents(curves, totalTicks, channel, resolution = 32) {
  const events = [];
  const ch = channel & 0x0F;

  curves.forEach(curve => {
    const pts = curve.points;
    for (let i = 0; i <= resolution; i++) {
      const pos = i / resolution;
      const tick = Math.round(pos * totalTicks);

      // Find surrounding points and interpolate
      let val = pts[0].val;
      for (let j = 0; j < pts.length - 1; j++) {
        if (pos >= pts[j].pos && pos <= pts[j+1].pos) {
          const t = (pos - pts[j].pos) / (pts[j+1].pos - pts[j].pos);
          val = Math.round(pts[j].val + t * (pts[j+1].val - pts[j].val));
          break;
        }
      }
      val = Math.max(0, Math.min(127, val));
      events.push({ tick, data: [0xB0 | ch, curve.cc, val] });
    }
  });

  return events;
}

// ── Build a MIDI file with notes + CC automation ──
function buildArrangementClip(noteEvents, ccCurves, channel, bpm, bars, trackName) {
  const ticksPerBeat = 480;
  const ticksPerStep = ticksPerBeat / 4;
  const totalTicks   = bars * 16 * ticksPerStep;
  const ch = channel & 0x0F;

  const header = [
    0x4D,0x54,0x68,0x64, 0x00,0x00,0x00,0x06,
    0x00,0x00, 0x00,0x01,
    (ticksPerBeat>>8)&0xFF, ticksPerBeat&0xFF
  ];

  let events = [];

  const tempo = Math.round(60000000 / bpm);
  events.push({ tick:0, data:[0xFF,0x51,0x03,(tempo>>16)&0xFF,(tempo>>8)&0xFF,tempo&0xFF] });

  const nameBytes = trackName.split('').map(c=>c.charCodeAt(0));
  events.push({ tick:0, data:[0xFF,0x03,nameBytes.length,...nameBytes] });

  // CC automation
  events.push(...buildCCEvents(ccCurves, totalTicks, ch));

  // Notes
  events.push(...noteEvents);

  // End of track
  events.push({ tick: totalTicks + ticksPerBeat, data:[0xFF,0x2F,0x00] });

  events.sort((a,b) => a.tick !== b.tick ? a.tick - b.tick : 0);

  let trackBytes = [];
  let prev = 0;
  events.forEach(evt => {
    const delta = evt.tick - prev;
    prev = evt.tick;
    trackBytes.push(...writeVarLen(delta), ...evt.data);
  });

  const tLen = trackBytes.length;
  const track = [0x4D,0x54,0x72,0x6B,
    (tLen>>24)&0xFF,(tLen>>16)&0xFF,(tLen>>8)&0xFF,tLen&0xFF,
    ...trackBytes
  ];

  return new Uint8Array([...header, ...track]);
}

// ── Build note events for a layer (reuses existing pattern/notes) ──
function buildLayerNoteEvents(layer, bars, channel, evo) {
  // evo = progression blueprint for this section (optional)
  const ch = channel & 0x0F;
  const ticksPerBeat = 480;
  const ticksPerStep = ticksPerBeat / 4;
  const events = [];

  if (layer === 'drums') {
    // Use drum elements from blueprint to filter which rows play
    const activeElements = evo && evo.drums ? evo.drums.elements : null;
    DRUM_ROWS.forEach(row => {
      if (activeElements && !activeElements.includes(row.id)) return;
      const note = DRUM_MIDI_NOTES[row.id] || 36;
      const density = evo && evo.drums ? evo.drums.density : 5;
      for (let bar = 0; bar < bars; bar++) {
        for (let step = 0; step < 16; step++) {
          if (state.drums.pattern[`${row.id}-${step}`]) {
            const tick = (bar * 16 + step) * ticksPerStep;
            const dur  = Math.round(ticksPerStep * 0.9);
            const vel  = Math.min(127, Math.round(70 + density * 5));
            events.push({ tick,        data:[0x99, note, vel] });
            events.push({ tick:tick+dur, data:[0x89, note, 0] });
          }
        }
      }
    });
  } else {
    const baseNotes = layer === 'bass' ? state.bass.notes
                    : layer === 'melody' ? state.melody.notes
                    : state.pads.notes;

    if (!baseNotes || !baseNotes.length) return events;

    // Phrase length from blueprint
    const phraseLen = evo && evo[layer] ? evo[layer].phraseLen : null;
    const intensity = evo && evo[layer] ? evo[layer].intensity : 100;
    const noteDensity = evo && evo.melody && layer === 'melody' ? evo.melody.noteDensity : 7;

    // Steps in one phrase (each step = 16th note)
    const phraseSteps = phraseLen ? phraseLen * 16 : null;
    const ticksPerBar = ticksPerBeat * 4;
    const totalTicks = bars * ticksPerBar;

    // For melody: filter notes by density (take first N unique pitches)
    let filteredNotes = baseNotes;
    if (layer === 'melody' && noteDensity < 7) {
      // Get unique pitches, keep only noteDensity of them
      const pitches = [...new Set(baseNotes.map(n => n.note))].slice(0, noteDensity);
      filteredNotes = baseNotes.filter(n => pitches.includes(n.note));
    }

    // For bass: apply style variation
    if (layer === 'bass' && evo && evo.bass) {
      const bStyle = evo.bass.style;
      const scale = getScale(state.scene.key);
      if (bStyle === 'root') {
        // Only root note
        filteredNotes = baseNotes.filter(n => n.note % 12 === scale[0] % 12);
        if (!filteredNotes.length) filteredNotes = baseNotes.slice(0,1);
      } else if (bStyle === 'walk') {
        // Root + fifth allowed
        filteredNotes = baseNotes.filter(n => {
          const pc = n.note % 12;
          return pc === scale[0] % 12 || pc === scale[4] % 12;
        });
        if (!filteredNotes.length) filteredNotes = baseNotes;
      }
      // 'progression' = all notes, no filter
    }

    // Tile the phrase across total bars
    if (phraseSteps && phraseSteps > 0) {
      const phraseTicks = phraseSteps * ticksPerStep;
      let offset = 0;
      while (offset < totalTicks) {
        filteredNotes.forEach(n => {
          const noteTick = n.time !== undefined ? n.time * ticksPerStep : (n.tick || 0);
          const noteDur  = n.duration !== undefined ? n.duration * ticksPerStep : (n.dur || ticksPerStep);
          const t = offset + noteTick;
          if (t < totalTicks) {
            const vel = Math.min(127, Math.round((n.velocity || 100) * (intensity / 100)));
            events.push({ tick: t,            data:[0x90|ch, n.note, vel] });
            events.push({ tick: t + noteDur,  data:[0x80|ch, n.note, 0] });
          }
        });
        offset += phraseTicks;
      }
    } else {
      // No blueprint — just tile based on note timings
      filteredNotes.forEach(n => {
        const noteTick = n.time !== undefined ? n.time * ticksPerStep : (n.tick || 0);
        const noteDur  = n.duration !== undefined ? n.duration * ticksPerStep : (n.dur || ticksPerStep);
        const vel = Math.min(127, Math.round((n.velocity || 100) * ((intensity||100) / 100)));
        events.push({ tick: noteTick,          data:[0x90|ch, n.note, vel] });
        events.push({ tick: noteTick+noteDur,  data:[0x80|ch, n.note, 0] });
      });
    }
  }

  return events;
}

// ── Layer → channel / name map ──
const LAYER_META = {
  drums:  { channel:9,  label:'Drums',  short:'DRM' },
  bass:   { channel:0,  label:'Bass',   short:'BSS' },
  arp:    { channel:1,  label:'Arp',    short:'ARP' },
  lead:   { channel:2,  label:'Lead',   short:'LED' },
  pads:   { channel:3,  label:'Pads',   short:'PAD' },
  fx:     { channel:4,  label:'FX',     short:'FX_' },
};

// ── Main arrangement export ──
async function exportArrangement() {
  const sections    = getSections(state.scene.length);
  const bpm         = state.scene.bpm  || 128;
  const key         = state.scene.key  || 'Am';
  const genre       = state.scene.energyArc  || 'club-banger';
  const atmo        = state.scene.atmosphere || 'euphoric';
  const totalMins   = parseFloat(state.scene.length) || 6;
  const defaultBars = getBarsPerSection(bpm, totalMins, sections.length);

  const roleLabel = {
    intro:     '🌑 INTRO      — sparse, filtering in, tension building',
    build:     '📈 BUILD      — layers stacking, filter opens, energy rising',
    drop:      '💥 DROP       — full energy, all elements in, peak impact',
    breakdown: '🌊 BREAKDOWN  — stripped back, pads/arp only, emotional reset',
    outro:     '🌅 OUTRO      — layers drop out, fade, journey ends',
  };

  let barCursor = 1;
  const sectionData = sections.map((name, si) => {
    const evo   = state.progression?.[si];
    const bars  = Math.max(evo?.melody?.phraseLen || defaultBars, defaultBars);
    const role  = getSectionRole(name);
    const label = roleLabel[role] || `⚙ ${name.toUpperCase()}`;
    const active = [];
    ['kick','snare','chh','ohh','bass','lead','pad','fx'].forEach(lid => {
      if (state.arrangement[`${lid}-${si}`] !== false) {
        const nm = {kick:'Kick',snare:'Snare',chh:'HatsC',ohh:'HatsO',bass:'Bass',lead:'Arp/Lead',pad:'Pads',fx:'FX'}[lid];
        active.push(nm);
      }
    });
    const mins = Math.round((bars * 4 / bpm) * 100) / 100;
    const start = barCursor;
    barCursor += bars;
    return { name, label, bars, mins, active, start, end: barCursor - 1 };
  });

  const totalBars = sectionData.reduce((s,x) => s + x.bars, 0);
  const totalTime = Math.round((totalBars * 4 / bpm) * 100) / 100;

  const L = (s) => s;
  const lines = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║  BFF — ARRANGEMENT BLUEPRINT                                 ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `  Key         : ${key}`,
    `  BPM         : ${bpm}`,
    `  Genre Arc   : ${genre}`,
    `  Atmosphere  : ${atmo}`,
    `  Total       : ${totalTime} min  (${totalBars} bars)`,
    '',
    '──────────────────────────────────────────────────────────────',
    '  SECTION MAP',
    '──────────────────────────────────────────────────────────────',
    '',
  ];

  sectionData.forEach((s, i) => {
    lines.push(`  ${String(i+1).padStart(2,'0')}. ${s.label}`);
    lines.push(`       Bars ${s.start}–${s.end}  (${s.bars} bars / ~${s.mins} min)`);
    lines.push(`       Layers: ${s.active.join(', ') || 'silent'}`);
    lines.push('');
  });

  lines.push('──────────────────────────────────────────────────────────────');
  lines.push('  HOW TO USE IN ABLETON');
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push('');
  lines.push('  1. Hit "Export Full MIDI Pack" → unzip → one folder of MIDIs');
  lines.push('  2. Switch Ableton to Arrangement View  (Tab)');
  lines.push('  3. Drop each file onto its own track');
  lines.push('  4. Use this sheet to decide where each clip goes:');
  lines.push('       Arp    → runs the whole track underneath');
  lines.push('       Lead   → drops in at the DROP sections only');
  lines.push('       HatsC  → enters at first DROP, stays in');
  lines.push('       HatsO  → sparse in builds, open on drop off-beats');
  lines.push('       Perc   → adds complexity in second half drops');
  lines.push('  5. Sidechain bass + pads to kick for that pump');
  lines.push('');
  lines.push('  ⚡ Generated by BFF — Your Best Friend in Music Production');
  lines.push("     You're welcome. — Skippy");
  lines.push('');

  const text = lines.join('\n');
  const textBytes = new TextEncoder().encode(text);
  const safeName  = `BFF_${key.replace('#','s')}_${bpm}bpm_Arrangement`;

  if (isElectron()) {
    await window.bff.midi.save(`${safeName}.txt`, Array.from(textBytes));
  } else {
    downloadBytes(textBytes, `${safeName}.txt`, 'text/plain');
  }

  addMessage('bot', `📋 <strong>${safeName}.txt</strong> — your arrangement blueprint.<br>
    ${sectionData.length} sections: <strong>${sectionData.map(s=>s.name).join(' → ')}</strong><br><br>
    This is your map. Hit <strong>Export Full MIDI Pack</strong> for the actual MIDI files, then follow the blueprint to lay them out in Ableton. <em>Structure first. Music fills it. That\'s how it\'s done.</em>`);
}



// ── Build a raw MIDI track chunk from events array ──
function buildRawTrack(name, events) {
  events.sort((a,b) => a.tick - b.tick);
  const nameBytes = Array.from(new TextEncoder().encode(name));
  let allEvts = [
    { tick:0, data:[0xFF,0x03,nameBytes.length,...nameBytes] },
    ...events
  ];
  allEvts.sort((a,b) => a.tick - b.tick);
  let bytes = [];
  let prev  = 0;
  allEvts.forEach(e => {
    const delta = e.tick - prev;
    prev = e.tick;
    bytes.push(...writeVarLen(delta), ...e.data);
  });
  const len = bytes.length;
  return new Uint8Array([
    0x4D,0x54,0x72,0x6B,
    (len>>24)&0xFF,(len>>16)&0xFF,(len>>8)&0xFF,len&0xFF,
    ...bytes
  ]);
}

// ── Minimal ZIP builder (stored, no compression) ──
function buildZip(files) {
  // files: [{name:string, bytes:Uint8Array}]
  const enc = new TextEncoder();
  let localHeaders = [];
  let centralDir   = [];
  let offset = 0;

  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const size = f.bytes.length;
    const dosDate = 0x5369; // arbitrary fixed date
    const dosTime = 0x0000;

    // Local file header
    const lh = new Uint8Array([
      0x50,0x4B,0x03,0x04,  // signature
      0x14,0x00,            // version needed: 2.0
      0x00,0x00,            // general flags
      0x00,0x00,            // compression: stored
      dosTime & 0xFF, (dosTime>>8)&0xFF,
      dosDate & 0xFF, (dosDate>>8)&0xFF,
      crc&0xFF,(crc>>8)&0xFF,(crc>>16)&0xFF,(crc>>24)&0xFF,
      size&0xFF,(size>>8)&0xFF,(size>>16)&0xFF,(size>>24)&0xFF,
      size&0xFF,(size>>8)&0xFF,(size>>16)&0xFF,(size>>24)&0xFF,
      nameBytes.length&0xFF,(nameBytes.length>>8)&0xFF,
      0x00,0x00,            // extra field length
      ...nameBytes,
      ...f.bytes
    ]);
    localHeaders.push(lh);

    // Central directory entry
    const cd = new Uint8Array([
      0x50,0x4B,0x01,0x02,  // signature
      0x14,0x00,            // version made by
      0x14,0x00,            // version needed
      0x00,0x00,            // flags
      0x00,0x00,            // compression
      dosTime & 0xFF, (dosTime>>8)&0xFF,
      dosDate & 0xFF, (dosDate>>8)&0xFF,
      crc&0xFF,(crc>>8)&0xFF,(crc>>16)&0xFF,(crc>>24)&0xFF,
      size&0xFF,(size>>8)&0xFF,(size>>16)&0xFF,(size>>24)&0xFF,
      size&0xFF,(size>>8)&0xFF,(size>>16)&0xFF,(size>>24)&0xFF,
      nameBytes.length&0xFF,(nameBytes.length>>8)&0xFF,
      0x00,0x00,            // extra
      0x00,0x00,            // comment
      0x00,0x00,            // disk start
      0x00,0x00,            // int attr
      0x00,0x00,0x00,0x00,  // ext attr
      offset&0xFF,(offset>>8)&0xFF,(offset>>16)&0xFF,(offset>>24)&0xFF,
      ...nameBytes
    ]);
    centralDir.push(cd);
    offset += lh.length;
  });

  const cdOffset = offset;
  const cdBytes  = new Uint8Array(centralDir.flatMap(a => Array.from(a)));
  const eocd = new Uint8Array([
    0x50,0x4B,0x05,0x06,  // end of central dir signature
    0x00,0x00,0x00,0x00,  // disk number / cd start disk
    files.length&0xFF,(files.length>>8)&0xFF,
    files.length&0xFF,(files.length>>8)&0xFF,
    cdBytes.length&0xFF,(cdBytes.length>>8)&0xFF,(cdBytes.length>>16)&0xFF,(cdBytes.length>>24)&0xFF,
    cdOffset&0xFF,(cdOffset>>8)&0xFF,(cdOffset>>16)&0xFF,(cdOffset>>24)&0xFF,
    0x00,0x00             // comment length
  ]);

  const total = localHeaders.flatMap(a=>Array.from(a));
  return new Uint8Array([...total, ...Array.from(cdBytes), ...Array.from(eocd)]);
}

// ── CRC32 for ZIP ──
function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Generic byte downloader ──
function downloadBytes(bytes, filename, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Build cheat sheet string (returns string) ──
function buildCheatSheet(sections, bpm, key) {
  const lines = [
    `BFF Arrangement Export`,
    `Track: ${key} · ${bpm} BPM · ${sections.length} sections`,
    `Generated: ${new Date().toLocaleString()}`,
    ``,
    `── CC AUTOMATION MAP ──`,
    `CC 74  →  Filter Cutoff    (Serum: Fil Cutoff | Sylenth: CutOff)`,
    `CC 71  →  Filter Resonance (Serum: Fil Res    | Sylenth: Resonance)`,
    `CC 91  →  Reverb Send      (Ableton Reverb: Dry/Wet)`,
    `CC 92  →  Delay Send       (Ableton Delay: Dry/Wet)`,
    `CC 11  →  Expression/Volume riding`,
    ``,
    `── HOW TO MAP IN ABLETON ──`,
    `1. Drop BFF_Arrangement.mid into Session View`,
    `2. Ableton auto-creates one track per MIDI channel`,
    `3. On each track assign your instrument (Serum, Sylenth, Drum Rack etc)`,
    `4. Open any clip → Envelopes → select CC74 lane → automation is already drawn`,
    `5. Right-click synth param → MIDI Map → move CC74 slider`,
    ``,
    `── TRACK LAYOUT ──`,
    `Ch 10  Kick / Snare / Hi-Hat / Open HH / Perc  (Ableton Drum Rack)`,
    `Ch 1   Bass`,
    `Ch 2   Arp (melodic, shorter phrases)`,
    `Ch 3   Lead (melodic, longer phrases)`,
    `Ch 4   Pads`,
    `Ch 5   FX (CC automation only — reverb/filter throws)`,
    ``,
    `── SECTION PROGRESSION ──`,
    ...sections.map((s,i) => {
      const evo = (typeof state !== 'undefined' && state.progression?.[i]) || {};
      const mel = evo.melody ? `Melody: ${evo.melody.label || ''} (${evo.melody.phraseLen||'?'}bar)` : '';
      const bas = evo.bass   ? `Bass: ${evo.bass.label   || ''} (${evo.bass.style||''})` : '';
      const drm = evo.drums  ? `Drums: ${evo.drums.label || ''}` : '';
      return `${String(i+1).padStart(2,'0')} ${s}\n   ${mel}\n   ${bas}\n   ${drm}`;
    }),
    ``,
    `Generated by BFF — bff.app`,
  ];
  return lines.join('\n');
}

// ── CC Cheat Sheet (legacy, kept for compatibility) ──
function exportCCCheatSheet(sections, layers, bpm, key) {
  const lines = [
    `BFF Arrangement Export`,
    `Track: ${key} · ${bpm} BPM · ${sections.length} sections`,
    `Generated: ${new Date().toLocaleString()}`,
    ``,
    `── CC AUTOMATION MAP ──`,
    ``,
    `CC 74  →  Filter Cutoff    (Serum: Fil Cutoff | Sylenth: CutOff)`,
    `CC 71  →  Filter Resonance (Serum: Fil Res    | Sylenth: Resonance)`,
    `CC 91  →  Reverb Send      (Ableton Reverb: Dry/Wet)`,
    `CC 92  →  Delay Send       (Ableton Delay: Dry/Wet)`,
    `CC 11  →  Expression       (Velocity/volume riding)`,
    ``,
    `── HOW TO MAP IN ABLETON ──`,
    ``,
    `1. Load your synth (Serum / Sylenth / etc) on the MIDI track`,
    `2. Open the MIDI clip → click the 'E' envelope button`,
    `3. In the CC lane dropdown, select e.g. 'CC 74 (Filter Cutoff)'`,
    `4. The automation curve is already drawn in`,
    `5. On your synth, right-click Filter Cutoff → MIDI Map → move the CC74 fader`,
    `   Or: CMD+M (Mac) / CTRL+M (Win) in Ableton → click the synth param → done`,
    ``,
    `── SECTION ROLES & AUTOMATION ──`,
    ``,
    ...sections.map(s => {
      const role = getSectionRole(s);
      const desc = {
        intro:     'Filter opens slowly. Reverb high. Eases listener in.',
        buildup:   'Filter sweeps fully open. Resonance peaks mid-section. Reverb throw on final beat.',
        drop:      'Filter fully open. Dry/punchy. Max expression.',
        breakdown: 'Filter closes. Heavy reverb/delay. Stripped-back wash.',
        outro:     'Filter closes back down. Mirrors intro.',
        neutral:   'Steady state. Moderate filter position.',
      }[role] || '';
      return `  ${s.padEnd(16)} [${role.toUpperCase().padEnd(10)}]  ${desc}`;
    }),
    ``,
    `── FILE NAMING ──`,
    `  01_Intro__DRM.mid   = Section 1, Drums`,
    `  01_Intro__BSS.mid   = Section 1, Bass`,
    `  02_Build_A__MLY.mid = Section 2, Melody`,
    `  etc.`,
    ``,
    `Drop all files into one Ableton set. Each clip goes on its own track.`,
    `Arrangement view: place clips in order per the section numbering.`,
  ];

  const text = lines.join('\n');
  const blob = new Blob([text], { type:'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `BFF_CC_CheatSheet_${key}_${bpm}bpm.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// ═══════════════════════════════════════════════
// AUTO-UPDATER UI
// Listens for messages from main process, shows toast
// ═══════════════════════════════════════════════
function initAutoUpdater() {
  if (!window.bff?.updater) return;

  const toast      = document.getElementById('update-toast');
  const title      = document.getElementById('update-toast-title');
  const msg        = document.getElementById('update-toast-msg');
  const icon       = document.getElementById('update-toast-icon');
  const progressW  = document.getElementById('update-progress-wrap');
  const progressB  = document.getElementById('update-progress-bar');
  const restartBtn = document.getElementById('update-restart-btn');
  const dismissBtn = document.getElementById('update-dismiss-btn');
  if (!toast) return;

  function showToast() { toast.classList.remove('update-toast--hidden'); }
  function hideToast()  { toast.classList.add('update-toast--hidden'); }

  // Main sends 'updater:available' when an update is found (starts downloading)
  window.bff.updater.onAvailable(({ version }) => {
    icon.textContent    = '⬇';
    title.textContent   = `BFF ${version} available`;
    msg.textContent     = 'Downloading in the background…';
    if (progressW) progressW.style.display = '';
    if (restartBtn) restartBtn.style.display = 'none';
    showToast();
  });

  // Main sends 'updater:progress' during download
  window.bff.updater.onProgress(({ percent }) => {
    if (progressB) progressB.style.width = `${percent}%`;
  });

  // Main sends 'updater:downloaded' when ready to install
  window.bff.updater.onDownloaded(({ version }) => {
    icon.textContent    = '✅';
    title.textContent   = `v${version} ready to install`;
    msg.textContent     = 'Restart BFF to apply the update.';
    if (progressW) progressW.style.display = 'none';
    if (restartBtn) restartBtn.style.display = '';
    showToast();
  });

  if (restartBtn) restartBtn.addEventListener('click', () => window.bff.updater.install());
  if (dismissBtn) dismissBtn.addEventListener('click', hideToast);
}



document.addEventListener('DOMContentLoaded', () => {
  // initAutoUpdater is called after DOMContentLoaded alongside other inits
  initAutoUpdater();
});
