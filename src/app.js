/* ═══════════════════════════════════════════════
   BEATFORGE — Main App Logic
═══════════════════════════════════════════════ */

// ─── STATE ───
const state = {
  scene: {
    genre: 'melodic-techno',
    key: 'Am',
    bpm: 128,
    mood: 'driving',
    length: '6',
    reference: null
  },
  arrangement: {},
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

// Drum rows
const DRUM_ROWS = [
  { id:'kick',  name:'Kick' },
  { id:'snare', name:'Snare' },
  { id:'chh',   name:'CH Hat' },
  { id:'ohh',   name:'OH Hat' },
  { id:'perc',  name:'Perc' },
];

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  initChips();
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
    case 'genre': state.scene.genre = value; break;
    case 'key': state.scene.key = value; break;
    case 'mood': state.scene.mood = value; break;
    case 'length': state.scene.length = value; break;
    case 'reference': state.scene.reference = value; break;
    case 'drum-style': state.drums.style = value; break;
    case 'bass-style': state.bass.style = value; break;
    case 'melody-style': state.melody.style = value; break;
    case 'pad-style': state.pads.style = value; break;
    case 'fx-elements': state.pads.fx = value; break;
  }
  updateTransportBar();
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
  const steps = ['scene','arrangement','drums','bass','melody','pads','export'];
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
  const sectionLabels = document.getElementById('section-labels');
  const layerLabels = document.getElementById('layer-labels');
  const grid = document.getElementById('arr-grid');

  // Section headers
  sectionLabels.innerHTML = sections.map(s =>
    `<div class="arr-sec-label">${s}</div>`
  ).join('');

  // Layer labels
  layerLabels.innerHTML = LAYERS.map(l =>
    `<div class="arr-layer-lbl"><span class="arr-layer-dot" style="background:${l.color}"></span>${l.name}</div>`
  ).join('');

  // Grid cells
  grid.innerHTML = LAYERS.map(layer =>
    `<div class="arr-row">${sections.map((sec, si) => {
      const key = `${layer.id}-${si}`;
      const isActive = state.arrangement[key] !== false;
      // Default: sensible arrangement
      if (!(key in state.arrangement)) {
        state.arrangement[key] = getDefaultArrangement(layer.id, si, sections.length);
      }
      return `<div class="arr-cell ${state.arrangement[key] ? 'active' : ''}" 
                   data-layer="${layer.id}" data-section="${si}" 
                   data-key="${key}"></div>`;
    }).join('')}</div>`
  ).join('');

  // Click handlers
  grid.querySelectorAll('.arr-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const key = cell.dataset.key;
      state.arrangement[key] = !state.arrangement[key];
      cell.classList.toggle('active');
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
  
  buildArrangementGrid();
  
  setTimeout(() => {
    addMessage('bot', `Done. I've laid out a ${genre.replace(/-/g,' ')} arrangement — kick drops out in breakdowns, pads fill the atmosphere, lead only hits in the drops. Adjust anything you want. <em>That's how a ${state.scene.reference || 'proper'} track breathes.</em>`);
  }, 800);
}

async function aiGenerateDrums() {
  addMessage('bot', "Cooking up a drum pattern... <em>This is going to be magnificent.</em>");
  
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

// Patch drag behaviour — if split mode, intercept and save instead
const _origDragStart = HTMLElement.prototype.addEventListener;
// We handle this via card.dataset.exportMode check inside the dragstart handler
// Override getMidiForLayer for drums to respect split mode
const _origGetMidiForLayer = getMidiForLayer;
function getMidiForLayer(layer) {
  if (layer === 'drums') {
    const card = document.getElementById('drag-card-drums');
    const mode = card?.dataset.exportMode || 'combined';
    if (mode === 'split') {
      // For drag in split mode — export combined anyway (split doesn't make sense as a single drag)
      // Split is save-only
      return _origGetMidiForLayer('drums');
    }
  }
  return _origGetMidiForLayer(layer);
}


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
function buildLayerNoteEvents(layer, bars, channel) {
  const ch = channel & 0x0F;
  const ticksPerBeat = 480;
  const ticksPerStep = ticksPerBeat / 4;
  const events = [];

  if (layer === 'drums') {
    DRUM_ROWS.forEach(row => {
      const note = DRUM_MIDI_NOTES[row.id] || 36;
      for (let bar = 0; bar < bars; bar++) {
        for (let step = 0; step < 16; step++) {
          if (state.drums.pattern[`${row.id}-${step}`]) {
            const tick = (bar * 16 + step) * ticksPerStep;
            const dur  = Math.round(ticksPerStep * 0.9);
            events.push({ tick,       data:[0x99, note, 100] });
            events.push({ tick:tick+dur, data:[0x89, note, 0] });
          }
        }
      }
    });
  } else {
    const notes = layer === 'bass' ? state.bass.notes
                : layer === 'melody' ? state.melody.notes
                : state.pads.notes;
    notes.forEach(n => {
      events.push({ tick: n.tick,          data:[0x90|ch, n.note, n.velocity||100] });
      events.push({ tick: n.tick+n.duration, data:[0x80|ch, n.note, 0] });
    });
  }

  return events;
}

// ── Layer → channel / name map ──
const LAYER_META = {
  drums:  { channel:9,  label:'Drums',  short:'DRM' },
  bass:   { channel:0,  label:'Bass',   short:'BSS' },
  melody: { channel:1,  label:'Melody', short:'MLY' },
  pads:   { channel:2,  label:'Pads',   short:'PAD' },
};

// ── Main arrangement export ──
async function exportArrangement() {
  const sections  = getSections(state.scene.length);
  const bpm       = state.scene.bpm;
  const key       = state.scene.key;
  const bars      = getBarsPerSection(bpm, parseFloat(state.scene.length) || 6, sections.length);

  const layers = ['drums','bass','melody','pads'].filter(l => hasLayerData(l));

  if (!layers.length) {
    addMessage('bot', "Nothing generated yet — build your patterns first, then export the arrangement. <em>I can't automate silence. Well, I could, but you wouldn't enjoy it.</em>");
    return;
  }

  const files = [];  // { filename, bytes }

  sections.forEach((sectionName, si) => {
    const role = getSectionRole(sectionName);
    const padNum = String(si+1).padStart(2,'0');
    const safeName = sectionName.replace(/\s+/g,'_');

    layers.forEach(layer => {
      // Check if this layer is active in this section
      const arrKey = `${layer === 'drums' ? 'kick' : layer}-${si}`;
      const isActive = state.arrangement[arrKey] !== false;
      if (!isActive) return;

      const meta   = LAYER_META[layer];
      const ccCurves = getCCAutomation(role, layer);
      const noteEvents = buildLayerNoteEvents(layer, bars, meta.channel);

      const filename = `${padNum}_${safeName}__${meta.short}.mid`;
      const trackName = `${sectionName} ${meta.label}`;
      const bytes = buildArrangementClip(noteEvents, ccCurves, meta.channel, bpm, bars, trackName);

      files.push({ filename, bytes, section: sectionName, layer, role });
    });
  });

  if (!files.length) {
    addMessage('bot', "All layers are muted in the arrangement. Flip some cells on and try again.");
    return;
  }

  // Export
  if (isElectron()) {
    // Save each file — native dialog per section folder grouping
    const { dialog } = window.beatforge;
    for (const f of files) {
      await window.beatforge.midi.save(f.filename, Array.from(f.bytes));
    }
  } else {
    files.forEach((f, i) => {
      setTimeout(() => downloadMidi(f.bytes, f.filename), i * 300);
    });
  }

  // Also generate the cheat sheet
  exportCCCheatSheet(sections, layers, bpm, key);

  const sectionCount = sections.length;
  const fileCount    = files.length;
  addMessage('bot', `Arrangement exported — <strong>${fileCount} clips</strong> across ${sectionCount} sections. CC automation is baked into every clip: filter sweeps on buildups, reverb throws before drops, closed filter on breakdowns. Drop them into Ableton, open a clip → MIDI envelope → map CC74 to your filter cutoff on Serum/Sylenth. <em>You're welcome.</em>`);
}

// ── CC Cheat Sheet ──
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
