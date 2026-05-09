/* ═══════════════════════════════════════════════
   BEATFORGE — Main App Logic
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
  document.getElementById('idea-roll-suggest')?.addEventListener('click', suggestIdeaPhrase);
  document.getElementById('idea-roll-quant')?.addEventListener('click', quantiseIdeaRoll);

  // Build button
  document.getElementById('idea-build-btn')?.addEventListener('click', buildTrackFromIdea);

  // Blueprint strip live update
  updateIdeaBlueprintStrip();
  initIdeaRoll();
}

// ── Piano Roll Renderer ──
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

  // Background rows
  for (let r = 0; r < ideaRoll.rows; r++) {
    const midi = root + 12 - r;
    const pc   = ((midi%12)+12)%12;
    const isScale = scale.includes(pc);
    const isRoot  = pc === (root%12);
    ctx.fillStyle = isRoot ? '#1a1500' : isScale ? '#111108' : ([1,3,6,8,10].includes(pc) ? '#0a0a0a' : '#0e0e0e');
    ctx.fillRect(0, r*rowH, canvas.width, rowH);

    // Row line
    ctx.strokeStyle = isRoot ? '#c9a84c33' : '#1a1a1a';
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

function attachIdeaRollEvents() {
  const canvas = document.getElementById('idea-roll-canvas');
  if (!canvas || canvas._eventsAttached) return;
  canvas._eventsAttached = true;

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const totalSteps = ideaRoll.bars * 16;
    const stepW = canvas.width / totalSteps;
    const rowH  = canvas.height / ideaRoll.rows;
    const x     = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y     = (e.clientY - rect.top)  * (canvas.height / rect.height);
    return {
      step: Math.floor(x / stepW),
      row:  Math.floor(y / rowH),
      stepW, rowH
    };
  };

  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    const {step, row} = getPos(e);
    if (e.button === 2) {
      // Right click = delete
      ideaRoll.notes = ideaRoll.notes.filter(n => !(n.row===row && step>=n.step && step<n.step+n.len));
      drawIdeaRoll(); return;
    }
    // Check if clicking existing note right edge (resize)
    const snap = ideaRoll.snap;
    const snapped = Math.round(step/snap)*snap;
    const existing = ideaRoll.notes.find(n => n.row===row && snapped>=n.step && snapped<n.step+n.len);
    if (existing) {
      ideaRoll.resizing = existing;
      ideaRoll.startStep = snapped;
    } else {
      const newNote = { row, step: snapped, len: snap, vel: 100 };
      ideaRoll.notes.push(newNote);
      ideaRoll.activeNote = newNote;
      ideaRoll.drawing = true;
      ideaRoll.startStep = snapped;
    }
    drawIdeaRoll();
  });

  canvas.addEventListener('mousemove', e => {
    if (!ideaRoll.drawing && !ideaRoll.resizing) return;
    const {step} = getPos(e);
    const snap = ideaRoll.snap;
    const snapped = Math.max(snap, Math.round(step/snap)*snap);
    if (ideaRoll.drawing && ideaRoll.activeNote) {
      ideaRoll.activeNote.len = Math.max(snap, snapped - ideaRoll.activeNote.step);
      drawIdeaRoll();
    }
    if (ideaRoll.resizing) {
      ideaRoll.resizing.len = Math.max(snap, snapped - ideaRoll.resizing.step);
      drawIdeaRoll();
    }
  });

  canvas.addEventListener('mouseup', () => {
    ideaRoll.drawing  = false;
    ideaRoll.resizing = null;
    ideaRoll.activeNote = null;
    // Push notes into state
    commitIdeaRollToState();
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

function commitIdeaRollToState() {
  const key   = document.getElementById('idea-roll-key')?.value || 'Am';
  const root  = KEY_ROOTS[key] || 69;
  // Convert roll notes → MIDI note objects
  state.idea.notes = ideaRoll.notes.map(n => ({
    note:     root + 12 - n.row,
    time:     n.step,
    duration: n.len,
    velocity: n.vel,
  }));
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
  document.getElementById('idea-roll-status').textContent = `Suggested ${ideaRoll.notes.length} notes — tweak freely then hit Build.`;
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

  // Navigate to scene to confirm settings, then straight to arrangement
  navigateTo('scene');

  // Small delay then skip straight to arrangement if we have enough to go on
  if (notes.length) {
    setTimeout(() => {
      // Auto-lock scene and go to arrangement
      document.getElementById('scene-next')?.click();
    }, 800);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  initChips();
  updateIntentSummary();
  initIdeaScreen();
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
function initArrangement() {
  buildArrangementGrid();
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

  // Click to toggle
  seq.querySelectorAll('.seq-step').forEach(step => {
    step.addEventListener('click', () => {
      step.classList.toggle('active');
      const key = step.dataset.key;
      state.drums.pattern[key] = step.classList.contains('active');
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
    if (typeof window.beatforge !== 'undefined') {
      const result = await window.beatforge.ai.generate(userMessage, context);
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

async function aiGenerateMelody() {
  addMessage('bot', "Composing a melody that fits around everything... <em>Oh for— this is going to be good.</em>");
  
  const key = state.scene.key;
  const scale = getScale(key);
  const root = getNoteNumber(key);
  const complexity = state.melody.complexity;
  const density = state.melody.density;
  
  let notes = [];
  const octaveUp = scale.map(n => n + 12);
  const allNotes = [...scale, ...octaveUp];
  
  const style = state.melody.style;
  
  if (style === 'arp') {
    // Arpeggiated — cycling through scale tones
    const pattern = [0, 2, 4, 2, 0, 3, 4, 3]; // Scale degree pattern
    for (let i = 0; i < 16; i++) {
      if (i % Math.max(1, 4 - Math.floor(density/3)) === 0) {
        const deg = pattern[i % pattern.length];
        notes.push({
          note: allNotes[deg % allNotes.length],
          time: i,
          duration: Math.max(1, 3 - Math.floor(density/4)),
          velocity: 80 + Math.random() * 30
        });
      }
    }
  } else if (style === 'lead') {
    // Lead line — longer notes, more melodic
    let pos = 0;
    let prevDeg = 0;
    while (pos < 16) {
      const dur = 2 + Math.floor(Math.random() * 3);
      const deg = prevDeg + Math.floor(Math.random() * 3) - 1;
      const clampedDeg = Math.max(0, Math.min(allNotes.length - 1, deg));
      notes.push({
        note: allNotes[clampedDeg],
        time: pos,
        duration: dur,
        velocity: 85 + Math.random() * 25
      });
      prevDeg = clampedDeg;
      pos += dur + (density < 5 ? 1 : 0);
    }
  } else {
    // Stab / pluck / vocal chop — rhythmic hits
    [0, 3, 6, 8, 11, 14].forEach(t => {
      if (Math.random() < density * 0.12) {
        const deg = Math.floor(Math.random() * 5);
        notes.push({
          note: allNotes[deg],
          time: t,
          duration: 1,
          velocity: 90 + Math.random() * 20
        });
      }
    });
  }
  
  state.melody.notes = notes;
  renderPianoRoll('melody-pianoroll', notes, root, root + 24);
  
  setTimeout(() => {
    addMessage('bot', `${style} melody in ${key}. ${notes.length} notes, designed to sit above your bass without clashing. <em>That's a hook right there.</em>`);
  }, 600);
}

async function aiGeneratePads() {
  addMessage('bot', "Building the atmosphere...");
  
  const key = state.scene.key;
  const scale = getScale(key);
  const root = getNoteNumber(key);
  
  // Pads are sustained chords
  const notes = [
    { note: scale[0] + 12, time: 0, duration: 8, velocity: 60 },
    { note: scale[2] + 12, time: 0, duration: 8, velocity: 55 },
    { note: scale[4] + 12, time: 0, duration: 8, velocity: 55 },
    { note: scale[0] + 12, time: 8, duration: 8, velocity: 60 },
    { note: scale[3] + 12, time: 8, duration: 8, velocity: 55 },
    { note: scale[4] + 12, time: 8, duration: 8, velocity: 50 },
  ];
  
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
  
  const range = maxNote - minNote;
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 180;
  const totalSteps = 16;
  
  notes.forEach(n => {
    const el = document.createElement('div');
    el.className = 'pr-note';
    const x = (n.time / totalSteps) * width;
    const w = (n.duration / totalSteps) * width;
    const y = height - ((n.note - minNote) / range) * height;
    el.style.left = x + 'px';
    el.style.width = Math.max(4, w) + 'px';
    el.style.top = Math.max(0, Math.min(height - 10, y)) + 'px';
    el.style.opacity = (n.velocity || 100) / 127;
    container.appendChild(el);
  });
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
function previewDrums() {
  addMessage('bot', "Preview requires the Tone.js audio engine — coming in next update. For now, send it to your DAW! <em>That's where the real magic happens anyway.</em>");
}

function previewBass() { previewDrums(); }
function previewMelody() { previewDrums(); }

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
  const trackName = 'BeatForge Drums';
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

function buildNotesMidi(notes, channelNum, bpm, trackName = 'BeatForge') {
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
  const filename = `BeatForge_Drums_${state.scene.bpm}bpm_${bars}bars.mid`;
  downloadMidi(midi, filename);
  addMessage('bot', `Drums exported → <strong>${filename}</strong>. Drop it on a Drum Rack in Ableton. Notes are mapped to the default Kit-Core 909: Kick=C1, Snare=D1, CH=F#1, OH=A#1, Perc=D2. <em>You're welcome.</em>`);
}

function exportBassMidi() {
  if (!state.bass.notes.length) {
    addMessage('bot', "No bass notes yet — generate a bassline first! <em>Bass first, then glory.</em>");
    return;
  }
  const midi = buildNotesMidi(state.bass.notes, 0, state.scene.bpm, 'BeatForge Bass');
  downloadMidi(midi, `BeatForge_Bass_${state.scene.key}_${state.scene.bpm}bpm.mid`);
  addMessage('bot', `Bass exported. Drop it on a synth channel in ${state.scene.key}. <em>That low end isn't going to produce itself.</em>`);
}

function exportMelodyMidi() {
  if (!state.melody.notes.length) {
    addMessage('bot', "No melody notes yet — generate a melody first! <em>Step 5, genius.</em>");
    return;
  }
  const midi = buildNotesMidi(state.melody.notes, 1, state.scene.bpm, 'BeatForge Melody');
  downloadMidi(midi, `BeatForge_Melody_${state.scene.key}_${state.scene.bpm}bpm.mid`);
  addMessage('bot', `Melody exported in ${state.scene.key}. <em>Now THAT's a hook.</em>`);
}

function exportPadsMidi() {
  if (!state.pads.notes.length) {
    addMessage('bot', "No pad notes yet — generate pads first! <em>Atmosphere doesn't generate itself.</em>");
    return;
  }
  const midi = buildNotesMidi(state.pads.notes, 2, state.scene.bpm, 'BeatForge Pads');
  downloadMidi(midi, `BeatForge_Pads_${state.scene.key}_${state.scene.bpm}bpm.mid`);
  addMessage('bot', `Pads exported. Long chords in ${state.scene.key}. <em>Beautiful.</em>`);
}

function exportFullMidiPack() {
  const hasAnything = Object.values(state.drums.pattern).some(v => v) ||
    state.bass.notes.length || state.melody.notes.length || state.pads.notes.length;
  if (!hasAnything) {
    addMessage('bot', "Nothing to export yet! Generate at least drums before hitting Export. <em>You need to actually make music first.</em>");
    return;
  }

  let exported = [];
  if (Object.values(state.drums.pattern).some(v => v)) {
    downloadMidi(buildDrumMidi(state.drums.pattern, state.scene.bpm, 2),
      `BeatForge_Drums_${state.scene.bpm}bpm.mid`);
    exported.push('Drums');
  }
  if (state.bass.notes.length) {
    downloadMidi(buildNotesMidi(state.bass.notes, 0, state.scene.bpm, 'BeatForge Bass'),
      `BeatForge_Bass_${state.scene.key}.mid`);
    exported.push('Bass');
  }
  if (state.melody.notes.length) {
    downloadMidi(buildNotesMidi(state.melody.notes, 1, state.scene.bpm, 'BeatForge Melody'),
      `BeatForge_Melody_${state.scene.key}.mid`);
    exported.push('Melody');
  }
  if (state.pads.notes.length) {
    downloadMidi(buildNotesMidi(state.pads.notes, 2, state.scene.bpm, 'BeatForge Pads'),
      `BeatForge_Pads_${state.scene.key}.mid`);
    exported.push('Pads');
  }

  addMessage('bot', `Exported ${exported.length} MIDI files: <strong>${exported.join(', ')}</strong>. Drop each one onto a separate channel in Ableton. Drums → Drum Rack. Everything else → your synth of choice. <em>Now go make something ridiculous.</em>`);
}


// ═══════════════════════════════════════════════
// DRAG-TO-DAW ENGINE
// In Electron: uses native OS file drag (ipcRenderer → main → startDrag)
// Fallback: browser blob download
// ═══════════════════════════════════════════════

function isElectron() {
  return typeof window !== 'undefined' && window.beatforge && window.beatforge.app && window.beatforge.app.isElectron;
}

// Generate MIDI bytes for a given layer
function getMidiForLayer(layer) {
  const bpm = state.scene.bpm;
  const key = state.scene.key;
  switch (layer) {
    case 'drums':
      return { bytes: buildDrumMidi(state.drums.pattern, bpm, 2), filename: `BeatForge_Drums_${bpm}bpm.mid` };
    case 'bass':
      return state.bass.notes.length
        ? { bytes: buildNotesMidi(state.bass.notes, 0, bpm, 'BeatForge Bass'), filename: `BeatForge_Bass_${key}.mid` }
        : null;
    case 'melody':
      return state.melody.notes.length
        ? { bytes: buildNotesMidi(state.melody.notes, 1, bpm, 'BeatForge Melody'), filename: `BeatForge_Melody_${key}.mid` }
        : null;
    case 'pads':
      return state.pads.notes.length
        ? { bytes: buildNotesMidi(state.pads.notes, 2, bpm, 'BeatForge Pads'), filename: `BeatForge_Pads_${key}.mid` }
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
        window.beatforge.midi.startDrag(midi.filename, Array.from(midi.bytes));
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
    const result = await window.beatforge.midi.save(midi.filename, Array.from(midi.bytes));
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

  const name = `BeatForge ${rowId.charAt(0).toUpperCase() + rowId.slice(1)}`;
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
      const filename = `BeatForge_${row.name.replace(/\s+/g,'_')}_${bpm}bpm.mid`;
      await window.beatforge.midi.save(filename, Array.from(bytes));
    }
    if (fromCard) pulseCard(fromCard, 'saved');
    addMessage('bot', `Split export done — ${active.length} files, one per instrument. Each one goes on its own track. <em>Now THAT's a clean session.</em>`);
  } else {
    // Browser: trigger downloads one by one with slight delay
    active.forEach((row, i) => {
      setTimeout(() => {
        const bytes = buildSingleDrumMidi(row.id, state.drums.pattern, bpm, bars);
        const filename = `BeatForge_${row.name.replace(/\s+/g,'_')}_${bpm}bpm.mid`;
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
  const sections  = getSections(state.scene.length);
  const bpm       = state.scene.bpm;
  const key       = state.scene.key;
  const totalMins = parseFloat(state.scene.length) || 6;
  const defaultBars = getBarsPerSection(bpm, totalMins, sections.length);
  const ticksPerBeat = 480;
  const ticksPerBar  = ticksPerBeat * 4;   // 4/4 time

  if (!state.melody.notes?.length && !state.bass.notes?.length && !Object.keys(state.drums.pattern||{}).length) {
    addMessage('bot', "Nothing generated yet — build your patterns first, then export. <em>I can't automate silence. Well, I could, but you wouldn't enjoy it.</em>");
    return;
  }

  // ── Build one multi-track Format-1 MIDI per layer-track ──
  // Tracks: Tempo map | Drums | Bass | Arp | Lead | Pads | FX
  // Each section's notes are placed at the correct bar offset so dragging
  // a single MIDI file into Ableton gives you the full arrangement timeline.

  // Pre-compute section bar offsets
  const sectionBarOffsets = [];
  let runningBar = 0;
  sections.forEach((name, si) => {
    sectionBarOffsets.push(runningBar);
    const evo = state.progression?.[si];
    // Use the longest phrase in this section to determine how many bars it occupies
    const melBars  = evo?.melody?.phraseLen || defaultBars;
    const bassBars = evo?.bass?.phraseLen   || defaultBars;
    const secBars  = Math.max(melBars, bassBars, defaultBars);
    runningBar += secBars;
  });
  const totalBars = runningBar;

  // ── Drum split into individual instrument tracks ──
  const DRUM_TRACKS = [
    { id:'kick',  name:'Kick',   note:36, ch:9 },
    { id:'snare', name:'Snare',  note:38, ch:9 },
    { id:'chh',   name:'Hi-Hat', note:42, ch:9 },
    { id:'ohh',   name:'Open HH',note:46, ch:9 },
    { id:'perc',  name:'Perc',   note:50, ch:9 },
  ];

  // Build per-track event lists (all sections merged into timeline)
  const trackEvents = {}; // key → [{tick, data}]

  const addEv = (trackId, tick, data) => {
    if (!trackEvents[trackId]) trackEvents[trackId] = [];
    trackEvents[trackId].push({ tick, data });
  };

  sections.forEach((secName, si) => {
    const role   = getSectionRole(secName);
    const evo    = state.progression?.[si] || null;
    const offsetTick = sectionBarOffsets[si] * ticksPerBar;
    const secBars = evo?.melody?.phraseLen
                  ? Math.max(evo.melody.phraseLen, evo?.bass?.phraseLen || defaultBars, defaultBars)
                  : defaultBars;
    const arrActive = (layId) => state.arrangement[`${layId}-${si}`] !== false;
    const ticksPerStep = ticksPerBeat / 4;

    // ── DRUMS ──
    if (arrActive('kick')) {
      const activeEls = evo?.drums?.elements || DRUM_TRACKS.map(d=>d.id);
      const density   = evo?.drums?.density  || 5;
      const vel = Math.min(127, Math.round(70 + density * 5));
      DRUM_TRACKS.forEach(dt => {
        if (!activeEls.includes(dt.id)) return;
        for (let bar = 0; bar < secBars; bar++) {
          for (let step = 0; step < 16; step++) {
            if (state.drums.pattern[`${dt.id}-${step}`]) {
              const t   = offsetTick + (bar * 16 + step) * ticksPerStep;
              const dur = Math.round(ticksPerStep * 0.9);
              addEv(`drum_${dt.id}`, t,       [0x99, dt.note, vel]);
              addEv(`drum_${dt.id}`, t + dur, [0x89, dt.note, 0]);
            }
          }
        }
      });
    }

    // ── BASS ──
    if (arrActive('bass') && state.bass.notes?.length) {
      const bEvo     = evo?.bass;
      const phraseLen = bEvo?.phraseLen || defaultBars;
      const intensity = bEvo?.intensity || 100;
      const bStyle    = bEvo?.style || 'progression';
      const scale     = getScale(key);
      let notes = state.bass.notes;
      if (bStyle === 'root') {
        notes = notes.filter(n => n.note % 12 === scale[0] % 12);
        if (!notes.length) notes = state.bass.notes.slice(0,1);
      } else if (bStyle === 'walk') {
        const filtered = notes.filter(n => {
          const pc = n.note % 12;
          return pc === scale[0] % 12 || pc === scale[4] % 12;
        });
        if (filtered.length) notes = filtered;
      }
      const phraseTicks = phraseLen * ticksPerBar;
      const totalSecTicks = secBars * ticksPerBar;
      let off = 0;
      while (off < totalSecTicks) {
        notes.forEach(n => {
          const nt  = n.time !== undefined ? n.time * ticksPerStep : (n.tick||0);
          const nd  = n.duration !== undefined ? n.duration * ticksPerStep : ticksPerStep;
          const t   = offsetTick + off + nt;
          const vel = Math.min(127, Math.round((n.velocity||100) * (intensity/100)));
          addEv('bass', t,      [0x90, n.note, vel]);
          addEv('bass', t + nd, [0x80, n.note, 0]);
        });
        off += phraseTicks;
      }
    }

    // ── MELODY → ARP track + LEAD track ──
    if (arrActive('lead') && state.melody.notes?.length) {
      const mEvo      = evo?.melody;
      const phraseLen = mEvo?.phraseLen  || defaultBars;
      const intensity = mEvo?.intensity  || 100;
      const density   = mEvo?.noteDensity || 7;
      const phraseTicks = phraseLen * ticksPerBar;
      const totalSecTicks = secBars * ticksPerBar;

      // Split melody notes: shorter duration = arp, longer = lead
      const allNotes = state.melody.notes;
      const avgDur   = allNotes.reduce((s,n) => s + (n.duration||2), 0) / allNotes.length;
      const arpNotes  = allNotes.filter(n => (n.duration||2) <= avgDur);
      const leadNotes = allNotes.filter(n => (n.duration||2) >  avgDur);
      // Fallback: if all same duration, put all in arp and duplicate to lead
      const useArp  = arpNotes.length  ? arpNotes  : allNotes;
      const useLead = leadNotes.length ? leadNotes : allNotes;

      // Filter by density
      const filterByDensity = (notes) => {
        if (density >= 7) return notes;
        const pitches = [...new Set(notes.map(n => n.note))].slice(0, density);
        return notes.filter(n => pitches.includes(n.note));
      };

      const writeNotes = (trackId, ch, notes) => {
        if (!notes.length) return;
        let off = 0;
        while (off < totalSecTicks) {
          notes.forEach(n => {
            const nt  = n.time !== undefined ? n.time * ticksPerStep : (n.tick||0);
            const nd  = n.duration !== undefined ? n.duration * ticksPerStep : ticksPerStep;
            const t   = offsetTick + off + nt;
            const vel = Math.min(127, Math.round((n.velocity||100) * (intensity/100)));
            addEv(trackId, t,      [0x90|ch, n.note, vel]);
            addEv(trackId, t + nd, [0x80|ch, n.note, 0]);
          });
          off += phraseTicks;
        }
      };

      writeNotes('arp',  1, filterByDensity(useArp));
      writeNotes('lead', 2, filterByDensity(useLead));
    }

    // ── PADS ──
    if (arrActive('pad') && state.pads.notes?.length) {
      const phraseLen = defaultBars;
      const phraseTicks = phraseLen * ticksPerBar;
      const totalSecTicks = secBars * ticksPerBar;
      let off = 0;
      while (off < totalSecTicks) {
        state.pads.notes.forEach(n => {
          const nt  = n.time !== undefined ? n.time * ticksPerStep : (n.tick||0);
          const nd  = n.duration !== undefined ? n.duration * ticksPerStep : ticksPerStep;
          const t   = offsetTick + off + nt;
          addEv('pads', t,      [0x93, n.note, n.velocity||60]);
          addEv('pads', t + nd, [0x83, n.note, 0]);
        });
        off += phraseTicks;
      }
    }

    // ── FX ──
    if (arrActive('fx')) {
      // FX = CC-only track: reverb throw on builds/breakdowns, filter sweep on drops
      const ccCurves = getCCAutomation(role, 'fx');
      const totalSecTicks = secBars * ticksPerBar;
      const ccEvts = buildCCEvents(ccCurves, totalSecTicks, 4);
      ccEvts.forEach(e => addEv('fx', offsetTick + e.tick, e.data));
    }
  });

  // ── Assemble Format-1 MIDI (multiple tracks) ──
  const endTick = totalBars * ticksPerBar + ticksPerBeat;
  const tempo   = Math.round(60000000 / bpm);

  // Track 0: tempo map
  const tempoTrack = buildRawTrack('Tempo Map', [
    { tick:0, data:[0xFF,0x51,0x03,(tempo>>16)&0xFF,(tempo>>8)&0xFF,tempo&0xFF] },
    { tick:0, data:[0xFF,0x58,0x04,0x04,0x02,0x18,0x08] }, // 4/4
    { tick: endTick, data:[0xFF,0x2F,0x00] }
  ]);

  const TRACK_ORDER = [
    { id:'drum_kick',  name:'Kick',    ch:9 },
    { id:'drum_snare', name:'Snare',   ch:9 },
    { id:'drum_chh',   name:'Hi-Hat',  ch:9 },
    { id:'drum_ohh',   name:'Open HH', ch:9 },
    { id:'drum_perc',  name:'Perc',    ch:9 },
    { id:'bass',       name:'Bass',    ch:0 },
    { id:'arp',        name:'Arp',     ch:1 },
    { id:'lead',       name:'Lead',    ch:2 },
    { id:'pads',       name:'Pads',    ch:3 },
    { id:'fx',         name:'FX',      ch:4 },
  ];

  const tracks = [tempoTrack];
  TRACK_ORDER.forEach(t => {
    const evts = trackEvents[t.id];
    if (!evts || !evts.length) return;
    evts.push({ tick: endTick, data:[0xFF,0x2F,0x00] });
    tracks.push(buildRawTrack(t.name, evts));
  });

  // MIDI header: format 1, N tracks
  const numTracks = tracks.length;
  const midiHeader = [
    0x4D,0x54,0x68,0x64,
    0x00,0x00,0x00,0x06,
    0x00,0x01,                              // format 1
    (numTracks>>8)&0xFF, numTracks&0xFF,
    (ticksPerBeat>>8)&0xFF, ticksPerBeat&0xFF
  ];
  const allBytes = new Uint8Array([
    ...midiHeader,
    ...tracks.flatMap(t => Array.from(t))
  ]);

  // ── Also build a CC cheat sheet txt ──
  const cheatLines = buildCheatSheet(sections, bpm, key);
  const cheatBytes = new TextEncoder().encode(cheatLines);

  // ── ZIP both into one download ──
  const safeName = `BeatForge_${key.replace('#','s')}_${bpm}bpm`;
  const zip = buildZip([
    { name: `${safeName}_Arrangement.mid`, bytes: allBytes },
    { name: `${safeName}_CC_Map.txt`,      bytes: cheatBytes },
  ]);

  const zipFilename = `${safeName}.zip`;
  if (isElectron()) {
    await window.beatforge.midi.save(zipFilename, Array.from(zip));
  } else {
    downloadBytes(zip, zipFilename, 'application/zip');
  }

  addMessage('bot', `<strong>ZIP exported</strong> — one multi-track MIDI + CC map. Drag <em>${safeName}_Arrangement.mid</em> into Ableton session view. It'll land ${TRACK_ORDER.filter(t=>trackEvents[t.id]?.length).length} tracks wide with every section already in the right position on the timeline. Kick, snare, hats all split. Arp and lead are separate tracks. <em>You're welcome.</em>`);
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
    `BeatForge Arrangement Export`,
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
    `1. Drop BeatForge_Arrangement.mid into Session View`,
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
    `Generated by BeatForge — beatforge.app`,
  ];
  return lines.join('\n');
}

// ── CC Cheat Sheet (legacy, kept for compatibility) ──
function exportCCCheatSheet(sections, layers, bpm, key) {
  const lines = [
    `BeatForge Arrangement Export`,
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
  a.download = `BeatForge_CC_CheatSheet_${key}_${bpm}bpm.txt`;
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
  if (!window.beatforge?.updater) return; // not in Electron

  const toast      = document.getElementById('update-toast');
  const title      = document.getElementById('update-toast-title');
  const msg        = document.getElementById('update-toast-msg');
  const icon       = document.getElementById('update-toast-icon');
  const progressW  = document.getElementById('update-progress-wrap');
  const progressB  = document.getElementById('update-progress-bar');
  const restartBtn = document.getElementById('update-restart-btn');
  const dismissBtn = document.getElementById('update-dismiss-btn');

  function showToast() { toast.classList.remove('update-toast--hidden'); }
  function hideToast() { toast.classList.add('update-toast--hidden'); }

  window.beatforge.updater.onStatus(({ type, version, message }) => {
    showToast();
    if (type === 'downloading') {
      icon.textContent = '⬇';
      title.textContent = `BeatForge ${version} available`;
      msg.textContent = 'Downloading in the background...';
      progressW.style.display = '';
      restartBtn.style.display = 'none';
    } else if (type === 'ready') {
      icon.textContent = '✅';
      title.textContent = `BeatForge ${version} ready`;
      msg.textContent = 'Restart to apply the update.';
      progressW.style.display = 'none';
      restartBtn.style.display = '';
    }
  });

  window.beatforge.updater.onProgress(({ percent }) => {
    progressB.style.width = `${percent}%`;
  });

  restartBtn.addEventListener('click', () => window.beatforge.updater.install());
  dismissBtn.addEventListener('click', hideToast);
}



document.addEventListener('DOMContentLoaded', () => {
  // initAutoUpdater is called after DOMContentLoaded alongside other inits
  initAutoUpdater();
});
