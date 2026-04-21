import * as vscode from 'vscode';
import { ActivePokemon } from './pokemon';
import { getWebviewContent } from './webviewTemplate';
import { GEN1_POKEMON, getRandomPokemon } from '../common/pokemonList';

export class PokemonPanel {
  public static currentPanel: PokemonPanel | undefined;
  private static readonly viewType = 'retroPokemon';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _activePokemon: ActivePokemon[] = [];
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): PokemonPanel {
    const column = vscode.ViewColumn.Two;

    if (PokemonPanel.currentPanel) {
      PokemonPanel.currentPanel._panel.reveal(column);
      return PokemonPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      PokemonPanel.viewType,
      'Retro Pokemon',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    PokemonPanel.currentPanel = new PokemonPanel(panel, extensionUri);
    return PokemonPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message: { command: string }) => {
        if (message.command === 'ready') {
          this._syncPokemon();
        }
      },
      null,
      this._disposables
    );
  }

  public spawnRandom(): void {
    const config = vscode.workspace.getConfiguration('retro-pokemon');
    const maxSize: number = config.get('size') ?? 3;
    if (this._activePokemon.length >= maxSize) {
      vscode.window.showInformationMessage(`Your team is full! Remove some Pokemon first.`);
      return;
    }
    const entry = getRandomPokemon();
    this._addPokemon(entry.id, entry.name);
  }

  public async spawnPicked(): Promise<void> {
    const config = vscode.workspace.getConfiguration('retro-pokemon');
    const maxSize: number = config.get('size') ?? 3;
    if (this._activePokemon.length >= maxSize) {
      vscode.window.showInformationMessage(`Your team is full! Remove some Pokemon first.`);
      return;
    }

    const picks = GEN1_POKEMON.map(p => ({ label: `#${String(p.id).padStart(3, '0')} ${p.name}`, id: p.id, name: p.name }));
    const picked = await vscode.window.showQuickPick(picks, { placeHolder: 'Choose a Gen 1 Pokemon' });
    if (picked) {
      this._addPokemon(picked.id, picked.name);
    }
  }

  public removeAll(): void {
    this._activePokemon = [];
    this._syncPokemon();
  }

  private _addPokemon(id: number, name: string): void {
    const pokemon: ActivePokemon = {
      uid: this._activePokemon.length,
      id,
      name,
      state: 'idle',
      x: Math.random() * 60 + 10,
      y: 80,
      facingLeft: Math.random() > 0.5
    };
    this._activePokemon.push(pokemon);
    this._syncPokemon();
  }

  private _syncPokemon(): void {
    this._panel.webview.postMessage({ command: 'setPokemon', pokemon: this._activePokemon });
  }

  private _getConfig() {
    const config = vscode.workspace.getConfiguration('retro-pokemon');
    return {
      gbPalette: config.get<boolean>('gbPalette') ?? true,
      scanlines: config.get<boolean>('scanlines') ?? true,
      spriteScale: config.get<number>('spriteScale') ?? 4
    };
  }

  private _update(): void {
    const webview = this._panel.webview;
    this._panel.webview.html = getWebviewContent(
      webview,
      this._extensionUri,
      this._activePokemon,
      this._getConfig()
    );
  }

  public dispose(): void {
    PokemonPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }
}
