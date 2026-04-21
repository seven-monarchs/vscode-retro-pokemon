<div align="center">

<br>

# Retro Pokemon

<br>

<img src=".github/assets/icon.png" alt="Retro Pokemon icon" width="160"/>

<br><br><br>

[Français](README.fr.md)

<br>

Animated Gen 1 Game Boy Pokemon companions living in your VS Code Explorer sidebar.

</div>

<br>

Sprites walk, bounce, and idle in a pixelated Game Boy green palette with CRT scanlines and VHS effects. Click any Pokemon to hear its original 8-bit cry. Spawn and capture them with pokeball animations and retro audio.

Inspired by [vscode-pokemon](https://marketplace.visualstudio.com/items?itemName=jakobhoeg.vscode-pokemon) by jakobhoeg, built independently using [PokeAPI](https://pokeapi.co/) assets.

![Retro Pokemon in VS Code](.github/assets/webview_full.png)

![Venusaur, Pikachu and Charizard in the sidebar](.github/assets/webview.png)

---

## Features

- All 151 Gen 1 Pokemon with authentic Red/Blue sprites
- 4-shade Game Boy green palette filter with chromatic aberration
- CRT scanline overlay and VHS flicker/tracking effects
- Pokeball throw and capture animations with 8-bit synthesized audio
- Click a Pokemon to play its original 8-bit cry
- Idle, walk, and bounce state machine per Pokemon
- Sidebar panel that scales sprites to fit the section height

---

## Commands

All commands are accessible from the Command Palette (`Ctrl+Shift+P`) and from the toolbar icons in the Retro Pokemon sidebar section.

| Command | Icon | Description |
| --- | --- | --- |
| Retro Pokemon: Spawn Pokemon | `+` | Pick a specific Gen 1 Pokemon from a list |
| Retro Pokemon: Spawn Random | shuffle | Spawn a random Pokemon |
| Retro Pokemon: Remove Pokemon | `x` | Pick a Pokemon from your team to capture |
| Retro Pokemon: Remove All | trash | Capture all Pokemon at once |

---

## Configuration

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `retro-pokemon.size` | number | `3` | Maximum number of Pokemon on screen at once (1-6) |
| `retro-pokemon.gbPalette` | boolean | `true` | Apply the original Game Boy green palette filter |
| `retro-pokemon.scanlines` | boolean | `true` | Show CRT scanline overlay |

---

## Installation

### From the Marketplace

Search for **Retro Pokemon** in the VS Code Extensions panel (`Ctrl+Shift+X`).

### From a VSIX file

1. Download the latest `.vsix` from the [Releases](https://github.com/seven-monarchs/vscode-retro-pokemon/releases) page
2. In VS Code: Extensions panel > `...` menu > **Install from VSIX**

---

## Development

### Prerequisites

```bash
npm install
```

Sprites and cries are bundled in `media/`. To re-download them from PokeAPI:

```bash
node scripts/download-sprites.js
node scripts/download-cries.js
```

### Build

```bash
npm run compile        # development build
npm run watch          # watch mode
```

### Run in Extension Development Host

Press `F5` in VS Code to launch a development instance with the extension loaded.

### Package

```bash
npx vsce package --no-dependencies
```

---

## Credits

- Sprites: [PokeAPI sprites](https://github.com/PokeAPI/sprites) - Gen 1 Red/Blue transparent PNGs
- Cries: [PokeAPI cries](https://github.com/PokeAPI/cries) - legacy 8-bit OGG files
- Pokemon and all related names are trademarks of Nintendo / Game Freak. This is a fan project with no commercial affiliation.
