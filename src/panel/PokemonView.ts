import * as vscode from 'vscode';
import { ActivePokemon } from './pokemon';
import { getWebviewContent } from './webviewTemplate';
import { GEN1_POKEMON, getRandomPokemon } from '../common/pokemonList';

export class PokemonViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'retro-pokemon.sidebarView';

  private _view?: vscode.WebviewView;
  private _activePokemon: ActivePokemon[] = [];
  private _nextUid = 0;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
    };

    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this._extensionUri,
      this._activePokemon,
      this._getConfig()
    );

    webviewView.webview.onDidReceiveMessage((msg: { command: string }) => {
      if (msg.command === 'ready') { this._syncPokemon(); }
    });
  }

  spawnRandom(): void {
    const max = vscode.workspace.getConfiguration('retro-pokemon').get<number>('size') ?? 3;
    if (this._activePokemon.length >= max) {
      vscode.window.showInformationMessage('Team is full! Remove some Pokemon first.');
      return;
    }
    const entry = getRandomPokemon();
    this._addPokemon(entry.id, entry.name);
  }

  async spawnPicked(): Promise<void> {
    const max = vscode.workspace.getConfiguration('retro-pokemon').get<number>('size') ?? 3;
    if (this._activePokemon.length >= max) {
      vscode.window.showInformationMessage('Team is full! Remove some Pokemon first.');
      return;
    }
    const picks = GEN1_POKEMON.map(p => ({
      label: `#${String(p.id).padStart(3, '0')} ${p.name}`,
      id: p.id, name: p.name
    }));
    const picked = await vscode.window.showQuickPick(picks, { placeHolder: 'Choose a Gen 1 Pokemon' });
    if (picked) { this._addPokemon(picked.id, picked.name); }
  }

  async removePicked(): Promise<void> {
    if (this._activePokemon.length === 0) {
      vscode.window.showInformationMessage('No Pokemon on the team right now.');
      return;
    }
    const picks = this._activePokemon.map((p, i) => ({
      label: `#${String(p.id).padStart(3, '0')} ${p.name}`,
      index: i,
      uid: p.uid
    }));
    const picked = await vscode.window.showQuickPick(picks, { placeHolder: 'Choose a Pokemon to remove' });
    if (picked === undefined) { return; }
    this._activePokemon.splice(picked.index, 1);
    this._view?.webview.postMessage({ command: 'removePokemon', uid: picked.uid });
  }

  removeAll(): void {
    this._activePokemon = [];
    this._view?.webview.postMessage({ command: 'removeAll' });
  }

  private _addPokemon(id: number, name: string): void {
    const pokemon: ActivePokemon = {
      uid: this._nextUid++,
      id, name,
      state: 'idle',
      x: Math.random() * 60 + 10,
      y: 80,
      facingLeft: Math.random() > 0.5
    };
    this._activePokemon.push(pokemon);
    this._view?.webview.postMessage({ command: 'spawnPokemon', data: pokemon });
  }

  private _syncPokemon(): void {
    this._view?.webview.postMessage({ command: 'setPokemon', pokemon: this._activePokemon });
  }

  private _getConfig() {
    const c = vscode.workspace.getConfiguration('retro-pokemon');
    return {
      gbPalette: c.get<boolean>('gbPalette') ?? true,
      scanlines: c.get<boolean>('scanlines') ?? true,
      spriteScale: c.get<number>('spriteScale') ?? 2
    };
  }
}
