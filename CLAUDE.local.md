# vscode-retro-pokemon - Project Context

A VS Code extension that renders animated Gen 1 Game Boy Pokemon sprites as companions in the Explorer sidebar, with retro GB aesthetic, VHS effects, pokeball animations, and 8-bit cry audio.

Inspired by [vscode-pokemon by jakobhoeg](https://marketplace.visualstudio.com/items?itemName=jakobhoeg.vscode-pokemon), built independently using PokeAPI assets.

---

## Build workflow

```bash
npm run compile          # dev build (webpack, both bundles)
npm run watch            # watch mode
npx vsce package --no-dependencies   # produce the .vsix
```

**Two webpack bundles** are built in parallel (see `webpack.config.js`):
- `dist/extension.js` — Node target, entry `src/extension.ts`, externalises `vscode`
- `media/webview.js` — Web target, entry `src/webview/webview.ts`, no Node globals

Press F5 in VS Code to launch the Extension Development Host for live testing.

---

## Project structure

```
src/
  extension.ts              Activation, command registration
  common/pokemonList.ts     GEN1_POKEMON array (id + name, 1-151)
  panel/
    pokemon.ts              ActivePokemon interface
    PokemonView.ts          WebviewViewProvider (sidebar) — ACTIVE, main provider
    PokemonPanel.ts         Legacy WebviewPanel (editor tab) — NOT wired up in extension.ts
    webviewTemplate.ts      Generates the HTML string; bakes all 151 sprite + cry URIs
  webview/
    webview.ts              Webview-side logic (compiled to media/webview.js)
media/
  retro.css                 All styles: GB palette, VHS effects, animations, pokeball
  webview.js                Compiled output — do not edit directly
  sprites/front/            151 transparent PNGs from PokeAPI (1.png … 151.png)
  cries/                    151 OGG files from PokeAPI legacy cries repo (1.ogg … 151.ogg)
  icon.png                  Extension icon
scripts/
  download-sprites.js       One-shot: fetches sprites from PokeAPI GitHub raw
  download-cries.js         One-shot: fetches legacy OGG cries from PokeAPI cries repo
  gen-icon.js               One-shot: generates the GB-green icon.png
```

---

## Architecture

### Extension host (`PokemonView.ts`)

`PokemonViewProvider` implements `WebviewViewProvider` and lives in the Explorer sidebar (`retro-pokemon.sidebarView`). It:

- Holds `_activePokemon: ActivePokemon[]` as the source of truth
- Assigns a monotonically increasing `uid` to every Pokemon (via `_nextUid`)
- Communicates with the webview via `postMessage` using an explicit command protocol (see below)
- On `resolveWebviewView`, generates HTML with `INITIAL_POKEMON` baked in, then sends `setPokemon` again when the webview fires `ready` (handles reopen/restore)

`PokemonPanel.ts` is a leftover `WebviewPanel` class (editor tab). It still compiles but is NOT registered in `extension.ts`. Do not use it for new features; consider removing it eventually.

### Webview (`webview.ts` → `media/webview.js`)

Runs in the sandboxed webview context (Chromium, no Node). Key globals injected by the HTML template:
- `window.RETRO_CONFIG` — `{ gbPalette, scanlines, spriteScale }`
- `window.SPRITE_URIS` — `Record<number, string>`, all 151 webview URIs pre-baked
- `window.CRY_URIS` — `Record<number, string>`, all 151 OGG webview URIs pre-baked
- `window.INITIAL_POKEMON` — `PokemonData[]`, state at HTML generation time

**Critical webpack rule:** never use `declare const X` for window globals in webview code. Webpack's module scope will fail to resolve them at runtime. Always use `(window as any).X` for explicit global lookup.

`SPRITE_URIS` and `RETRO_CONFIG` are read eagerly (before the module runs). `CRY_URIS` was originally read eagerly but must be read lazily inside `_playCry()` to avoid a module-init race.

---

## Message protocol (extension host ↔ webview)

### Webview → Extension host
| command | payload | meaning |
|---------|---------|---------|
| `ready` | — | Webview finished loading; host should send current state |

### Extension host → Webview
| command | payload | meaning |
|---------|---------|---------|
| `setPokemon` | `pokemon: PokemonData[]` | Full list, no animation. Used only on restore (webview reopen). |
| `spawnPokemon` | `data: PokemonData` | Spawn one Pokemon with pokeball animation. |
| `removePokemon` | `uid: number` | Capture one Pokemon with pokeball animation. |
| `removeAll` | — | Capture all Pokemon, staggered 400 ms apart. |

The `uid` field on `PokemonData` is the stable identity used to key the `sprites` Map and target capture animations. It is assigned by the extension host and survives webview restarts via `INITIAL_POKEMON`.

---

## Pokeball animation system

Two animation functions in `webview.ts`:

**`animateSpawn(data)`**
1. Creates a `.pokeball-sprite` div, positions at top-right off-screen
2. `wrap.animate()` — diagonal throw to landing position, `ease-in` (gravity), 440 ms
3. Commits `left`/`top` inline, cancels fill-forwards, then squash+stretch on impact
4. Adds `.pokeball-flash` CSS class (3 brightness pulses, ~330 ms)
5. Creates `PokemonSprite` with `.appearing` class (`scale 0→1` + brightness fade, 380 ms)
6. Ball shrinks to 0 and is removed

**`animateCapture(uid, onDone)`**
1. Removes sprite from `sprites` Map immediately (stops tick loop); DOM element stays
2. Ball drops from above sprite center, `ease-in`, 240 ms
3. Commits position, cancels fill-forwards
4. Adds `.pokeball-flash` + `.vanishing` class on wrapper simultaneously (~320 ms)
5. Removes sprite DOM element
6. Wobbles the ball 3 times (alternating ±22°, 310 ms each, 80 ms gap), plays `sndWobble` each
7. Ball fades to `scale(0.4)` opacity 0, then `wrap.remove()`, then calls `onDone`

**Pattern for Web Animations API fill-forwards:** always commit the final position to `element.style.left/top`, then call `animation.cancel()` before chaining the next animation. This avoids stale fill effects competing with new animations.

---

## Audio (Web Audio API)

Shared `AudioContext` (`_audioCtx`). All sounds are square-wave oscillators with `linearRampToValueAtTime` for frequency sweeps. No external audio files — fully synthesized.

| function | character |
|----------|-----------|
| `sndThrow()` | 460→115 Hz sweep, 200 ms — whoosh |
| `sndBounce()` | 80→35 Hz, 90 ms — low thud |
| `sndSpawn()` | C5/E5/G5 arpeggio, 65 ms apart — ascending chime |
| `sndCapture()` | 370→65 Hz, 280 ms — descending woop |
| `sndWobble()` | 95→52 Hz, 140 ms — low rattle |

`AudioContext` may be in `suspended` state if no user gesture occurred in the webview before the extension command fires. `synth()` calls `ctx.resume()` but this is async; sounds triggered by VS Code toolbar commands (not webview clicks) may be silently blocked. This is accepted behavior.

---

## CSS architecture (`media/retro.css`)

### GB palette
`.pokemon-sprite.gb-palette` applies: `grayscale → contrast → sepia → hue-rotate → brightness → saturate` plus two `drop-shadow` calls for chromatic aberration (light green right, dark ghost left).

### VHS effects (on `body`)
- `body { animation: vhs-flicker }` — subtle opacity stutter every 7 s
- `body::before` — horizontal tracking line sweeping down, `vhs-track` 9 s
- `body::after` — glitch bar that jumps between `top: 20%/55%/75%/38%` while opacity is 0 so repositioning is invisible, `vhs-glitch` 11 s

### DOM layers per Pokemon
```
.pokemon-wrapper          position:absolute, left:X%, z-index:10+i
  .pokemon-group          translateY animation (idle/walk/bounce)
    .cry-icon             opacity:0 → 1 when .active; SVG speaker
    .pokemon-name         GB dialog box label
    .pokemon-direction    scaleX(-1) when .facing-left
      img.pokemon-sprite  squash/stretch animation; gb-palette filter
```

### Animation class pairs
Each state drives two classes (group-level and image-level):
- idle: `anim-group-idle` / `anim-img-idle`
- walk: `anim-group-walk` / `anim-img-walk`
- bounce: `anim-group-bounce` / `anim-img-bounce`

---

## Static assets

**Sprites** (`media/sprites/front/1.png` … `151.png`): transparent Gen 1 PNGs from `https://github.com/PokeAPI/sprites` path `sprites/pokemon/versions/generation-i/red-blue/transparent/`.

**Cries** (`media/cries/1.ogg` … `151.ogg`): legacy 8-bit OGG files from `https://github.com/PokeAPI/cries` path `cries/pokemon/legacy/`. ~1.3 MB total.

Re-download with `node scripts/download-sprites.js` / `node scripts/download-cries.js` if the `media/` assets are missing.

---

## Content Security Policy

```
default-src 'none';
img-src ${webview.cspSource};
style-src ${webview.cspSource};
script-src 'nonce-${nonce}';
media-src ${webview.cspSource};
```

`media-src` is required for the OGG cry audio. `webview.cspSource` covers the extension's own `media/` directory. The Web Audio API synthesizer does not need any additional CSP entries.

---

## Known issues / notes

- **Cry audio on spawn**: sounds triggered by VS Code toolbar commands (outside the webview) may not play due to AudioContext autoplay policy. Clicks inside the webview (cry icon) always work.
- **`PokemonPanel.ts`**: dead code from an earlier editor-tab implementation. Still compiles but is not wired up. Safe to delete in the future.
- **`PokemonPanel.ts` uid**: uses `this._activePokemon.length` as uid, which is not safe across removes. Only acceptable because the class is unused.
- **Scale formula**: `Math.min(6, Math.max(1, Math.round(stageH * 0.76 / 56)))`. The `0.76` factor was doubled from an earlier `0.38` at user request for larger sprites.
- **Sprite z-index**: assigned as `10 + sprites.size` at spawn time. After captures, indices are not rebalanced — gaps can form but do not cause visual issues.
