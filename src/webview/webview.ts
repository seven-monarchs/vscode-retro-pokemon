declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

interface RetroCfg { gbPalette: boolean; scanlines: boolean; spriteScale: number }
interface PokemonData { uid: number; id: number; name: string; x: number; y: number; facingLeft: boolean }

const RETRO_CONFIG    = (window as any).RETRO_CONFIG    as RetroCfg;
const SPRITE_URIS     = (window as any).SPRITE_URIS     as Record<number, string>;
const INITIAL_POKEMON = (window as any).INITIAL_POKEMON as PokemonData[];

type State = 'idle' | 'walking-left' | 'walking-right' | 'bouncing';

const SPRITE_PX  = 56;
const WALK_SPEED = 0.12;

function calcScale(stageH: number): number {
  const target = stageH * 0.55;
  return Math.min(3, Math.max(1, Math.round(target / SPRITE_PX)));
}

let currentScale = 1;

// ---- Retro 8-bit audio synthesis ----
let _audioCtx: AudioContext | null = null;
function _ctx(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new AudioContext();
    }
    return _audioCtx;
  } catch { return null; }
}
function synth(hz0: number, hz1: number, dur: number, vol = 0.11, wave: OscillatorType = 'square'): void {
  const ctx = _ctx();
  if (!ctx) { return; }
  try {
    if (ctx.state === 'suspended') { void ctx.resume(); }
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = wave;
    osc.frequency.setValueAtTime(hz0, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(hz1, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch { /* audio blocked */ }
}
function sndThrow():   void { synth(460, 115, 0.20); }
function sndBounce():  void { synth(80,   35, 0.09, 0.20); }
function sndSpawn():   void {
  [523, 659, 784].forEach((hz, i) => setTimeout(() => synth(hz, hz, 0.10), i * 65));
}
function sndCapture(): void { synth(370, 65, 0.28); }
function sndWobble():  void { synth(95,  52, 0.14, 0.16); }

// ---- PokemonSprite ----
class PokemonSprite {
  wrapper:   HTMLDivElement;
  group:     HTMLDivElement;
  cryIconEl: HTMLDivElement;
  nameEl:    HTMLDivElement;
  dirDiv:    HTMLDivElement;
  img:       HTMLImageElement;

  uid: number;
  id: number;
  x: number;
  facingLeft: boolean;
  state: State = 'idle';
  stateTimer = 0;
  stateTimeout = rand(120, 300);

  private _audio: HTMLAudioElement | null = null;

  constructor(data: PokemonData, cfg: RetroCfg, uri: string) {
    this.uid = data.uid;
    this.id  = data.id;
    this.x   = data.x;
    this.facingLeft = data.facingLeft;

    this.img = document.createElement('img');
    this.img.src = uri;
    this.img.alt = data.name;
    this.img.className = 'pokemon-sprite' + (cfg.gbPalette ? ' gb-palette' : '');
    this.img.style.cursor = 'pointer';

    this.dirDiv = document.createElement('div');
    this.dirDiv.className = 'pokemon-direction';
    this.dirDiv.appendChild(this.img);

    this.nameEl = document.createElement('div');
    this.nameEl.className = 'pokemon-name';
    this.nameEl.textContent = data.name;

    this.cryIconEl = document.createElement('div');
    this.cryIconEl.className = 'cry-icon';
    this.cryIconEl.innerHTML =
      `<svg viewBox="0 0 14 12" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="3" width="4" height="6" fill="currentColor"/>` +
      `<polygon points="4,3 8,0 8,12 4,9" fill="currentColor"/>` +
      `<line x1="9.5" y1="4" x2="9.5" y2="8"  stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>` +
      `<line x1="11.5" y1="2" x2="11.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>` +
      `</svg>`;

    this.group = document.createElement('div');
    this.group.className = 'pokemon-group';
    this.group.appendChild(this.cryIconEl);
    this.group.appendChild(this.nameEl);
    this.group.appendChild(this.dirDiv);

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'pokemon-wrapper';
    this.wrapper.appendChild(this.group);

    this.wrapper.addEventListener('click', () => { this._playCry(); });

    this.updateScale(currentScale);
    this._applyState();
  }

  private _playCry(): void {
    const cryUris = (window as any).CRY_URIS as Record<number, string> | undefined;
    if (!cryUris) { return; }
    const uri = cryUris[this.id];
    if (!uri) { return; }

    if (this._audio) {
      this._audio.pause();
      this._audio.remove();
      this._audio = null;
    }

    const audio = document.createElement('audio');
    audio.src = uri;
    document.body.appendChild(audio);
    this._audio = audio;

    this.cryIconEl.classList.add('active');

    const cleanup = () => {
      this.cryIconEl.classList.remove('active');
      audio.remove();
      this._audio = null;
    };

    audio.addEventListener('ended', cleanup);
    audio.addEventListener('error', cleanup);
    audio.play().catch(cleanup);
  }

  updateScale(scale: number): void {
    const px = SPRITE_PX * scale;
    this.img.style.width  = `${px}px`;
    this.img.style.height = `${px}px`;
  }

  tick(stageW: number): void {
    this.stateTimer++;
    if (this.stateTimer >= this.stateTimeout) { this._nextState(); }

    const spritePct = (SPRITE_PX * currentScale) / stageW * 100;
    const maxX = Math.max(0, 100 - spritePct);

    if (this.state === 'walking-left') {
      this.x -= WALK_SPEED;
      if (this.x <= 0) { this.x = 0; this._nextState(); }
    } else if (this.state === 'walking-right') {
      this.x += WALK_SPEED;
      if (this.x >= maxX) { this.x = maxX; this._nextState(); }
    }

    this.wrapper.style.left = `${this.x}%`;
    this.dirDiv.classList.toggle('facing-left', this.facingLeft);
  }

  private _applyState(): void {
    const gc = ['anim-group-idle', 'anim-group-walk', 'anim-group-bounce'];
    const ic = ['anim-img-idle',   'anim-img-walk',   'anim-img-bounce'];
    this.group.classList.remove(...gc);
    this.img.classList.remove(...ic);

    if (this.state === 'walking-left' || this.state === 'walking-right') {
      this.group.classList.add('anim-group-walk');
      this.img.classList.add('anim-img-walk');
    } else if (this.state === 'bouncing') {
      this.group.classList.add('anim-group-bounce');
      this.img.classList.add('anim-img-bounce');
    } else {
      this.group.classList.add('anim-group-idle');
      this.img.classList.add('anim-img-idle');
    }
  }

  private _nextState(): void {
    this.stateTimer = 0;
    const r = Math.random();
    const prev = this.state;
    if      (r < 0.30) { this.state = 'idle';          this.stateTimeout = rand(80, 220); }
    else if (r < 0.55) { this.state = 'walking-left';  this.facingLeft = true;  this.stateTimeout = rand(60, 200); }
    else if (r < 0.80) { this.state = 'walking-right'; this.facingLeft = false; this.stateTimeout = rand(60, 200); }
    else               { this.state = 'bouncing';       this.stateTimeout = rand(40, 90); }
    if (this.state !== prev) { this._applyState(); }
  }
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

// ---- Pokeball helpers ----
function _ballSz(): number {
  return Math.max(14, Math.min(28, (SPRITE_PX * currentScale * 0.32) | 0));
}

function _makeBall(sz: number): HTMLDivElement {
  const b = document.createElement('div');
  b.className    = 'pokeball-sprite';
  b.style.width  = `${sz}px`;
  b.style.height = `${sz}px`;
  return b;
}

// Ball flies in from top-right, bounces, flashes open, Pokemon materialises
function animateSpawn(data: PokemonData): void {
  const W  = stage.clientWidth  || 600;
  const H  = stage.clientHeight || 150;
  const sz = _ballSz();

  const landX  = Math.min(W - sz, Math.max(0, (data.x / 100) * W));
  const landY  = H - sz - 2;
  const startX = W * 0.82;
  const startY = -sz * 2;

  const wrap = document.createElement('div');
  wrap.style.cssText = `position:absolute;left:0;top:0;width:${sz}px;height:${sz}px;z-index:200;pointer-events:none;`;
  const ball = _makeBall(sz);
  wrap.appendChild(ball);
  stage.appendChild(wrap);

  sndThrow();

  // Diagonal throw — ease-in simulates gravity acceleration
  const fly = wrap.animate([
    { transform: `translate(${startX}px,${startY}px) rotate(0deg)` },
    { transform: `translate(${landX}px,${landY}px) rotate(720deg)` }
  ], { duration: 440, easing: 'ease-in', fill: 'forwards' });

  fly.onfinish = () => {
    wrap.style.left = `${landX}px`;
    wrap.style.top  = `${landY}px`;
    fly.cancel();

    sndBounce();
    ball.animate([
      { transform: 'scaleX(1.55) scaleY(0.55)' },
      { transform: 'scaleX(0.88) scaleY(1.12)' },
      { transform: 'scaleX(1)    scaleY(1)' }
    ], { duration: 190, easing: 'ease-out' }).onfinish = () => {
      ball.classList.add('pokeball-flash');
      sndSpawn();

      setTimeout(() => {
        ball.classList.remove('pokeball-flash');

        const uri = SPRITE_URIS[data.id];
        if (uri) {
          const s = new PokemonSprite(data, cfg, uri);
          s.wrapper.style.zIndex = String(10 + sprites.size);
          s.wrapper.classList.add('appearing');
          stage.appendChild(s.wrapper);
          sprites.set(data.uid, s);
          s.wrapper.addEventListener('animationend', () => {
            s.wrapper.classList.remove('appearing');
          }, { once: true });
        }

        wrap.animate([
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0)' }
        ], { duration: 160 }).onfinish = () => wrap.remove();
      }, 330);
    };
  };
}

// Ball drops from above, Pokemon vanishes into it, 3 wobbles, ball disappears
function animateCapture(uid: number, onDone: () => void): void {
  const s = sprites.get(uid);
  if (!s) { onDone(); return; }
  sprites.delete(uid); // stop ticking; DOM element stays until vanish completes

  const W  = stage.clientWidth  || 600;
  const H  = stage.clientHeight || 150;
  const sz = _ballSz();

  const spriteCenterX = (s.x / 100) * W + (SPRITE_PX * currentScale) / 2;
  const bx = Math.min(W - sz, Math.max(0, spriteCenterX - sz / 2));
  const by = H - 2 - SPRITE_PX * currentScale * 0.5 - sz / 2;

  const wrap = document.createElement('div');
  wrap.style.cssText = `position:absolute;left:0;top:0;width:${sz}px;height:${sz}px;z-index:200;pointer-events:none;`;
  const ball = _makeBall(sz);
  wrap.appendChild(ball);
  stage.appendChild(wrap);

  sndCapture();

  const drop = wrap.animate([
    { transform: `translate(${bx}px,${-sz * 2.5}px) rotate(0deg)` },
    { transform: `translate(${bx}px,${by}px) rotate(180deg)` }
  ], { duration: 240, easing: 'ease-in', fill: 'forwards' });

  drop.onfinish = () => {
    wrap.style.left = `${bx}px`;
    wrap.style.top  = `${by}px`;
    drop.cancel();

    ball.classList.add('pokeball-flash');
    s.wrapper.classList.add('vanishing');

    setTimeout(() => {
      ball.classList.remove('pokeball-flash');
      s.wrapper.remove();

      let n = 0;
      function wobble(): void {
        if (n >= 3) {
          wrap.animate([
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(0.4)' }
          ], { duration: 200 }).onfinish = () => { wrap.remove(); onDone(); };
          return;
        }
        sndWobble();
        wrap.animate([
          { transform: 'rotate(0deg)' },
          { transform: `rotate(${n % 2 === 0 ? -22 : 22}deg)` },
          { transform: 'rotate(0deg)' }
        ], { duration: 310 }).onfinish = () => { n++; setTimeout(wobble, 80); };
      }
      wobble();
    }, 320);
  };
}

// ---- Stage setup ----
const vscode  = acquireVsCodeApi();
const stage   = document.getElementById('stage')!;
const sprites = new Map<number, PokemonSprite>(); // keyed by uid
const cfg: RetroCfg = RETRO_CONFIG;

function applyScale(scale: number): void {
  if (scale === currentScale) { return; }
  currentScale = scale;
  for (const s of sprites.values()) { s.updateScale(scale); }
}

const ro = new ResizeObserver(entries => {
  const h = entries[0]?.contentRect.height ?? stage.clientHeight;
  applyScale(calcScale(h));
});
ro.observe(stage);

// Used only on initial restore when the webview (re)opens — no animation
function setPokemon(list: PokemonData[]): void {
  const incoming = new Set(list.map(d => d.uid));
  for (const [uid, s] of sprites) {
    if (!incoming.has(uid)) { s.wrapper.remove(); sprites.delete(uid); }
  }
  list.forEach(data => {
    if (sprites.has(data.uid)) { return; }
    const uri = SPRITE_URIS[data.id];
    if (!uri) { return; }
    const s = new PokemonSprite(data, cfg, uri);
    s.wrapper.style.zIndex = String(10 + sprites.size);
    stage.appendChild(s.wrapper);
    sprites.set(data.uid, s);
  });
}

function loop(): void {
  const w = stage.clientWidth || 600;
  for (const s of sprites.values()) { s.tick(w); }
  requestAnimationFrame(loop);
}

type Msg =
  | { command: 'setPokemon';    pokemon: PokemonData[] }
  | { command: 'spawnPokemon';  data: PokemonData }
  | { command: 'removePokemon'; uid: number }
  | { command: 'removeAll' };

window.addEventListener('message', (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.command === 'setPokemon' && msg.pokemon) {
    setPokemon(msg.pokemon);
  } else if (msg.command === 'spawnPokemon' && msg.data) {
    animateSpawn(msg.data);
  } else if (msg.command === 'removePokemon') {
    animateCapture(msg.uid, () => {});
  } else if (msg.command === 'removeAll') {
    const uids = [...sprites.keys()];
    uids.forEach((uid, i) => setTimeout(() => animateCapture(uid, () => {}), i * 400));
  }
});

currentScale = calcScale(stage.clientHeight || 150);
setPokemon(INITIAL_POKEMON);
vscode.postMessage({ command: 'ready' });
requestAnimationFrame(loop);
