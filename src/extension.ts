import * as vscode from 'vscode';
import { PokemonViewProvider } from './panel/PokemonView';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PokemonViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PokemonViewProvider.viewType, provider),

    vscode.commands.registerCommand('retro-pokemon.spawnRandom', () => {
      provider.spawnRandom();
    }),
    vscode.commands.registerCommand('retro-pokemon.spawn', () => {
      provider.spawnPicked();
    }),
    vscode.commands.registerCommand('retro-pokemon.remove', () => {
      provider.removePicked();
    }),
    vscode.commands.registerCommand('retro-pokemon.removeAll', () => {
      provider.removeAll();
    })
  );
}

export function deactivate(): void {}
