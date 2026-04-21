import * as vscode from 'vscode';
import { ActivePokemon } from './pokemon';

export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pokemon: ActivePokemon[],
  config: { gbPalette: boolean; scanlines: boolean; spriteScale: number }
): string {
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'retro.css')
  );
  const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'webview.js')
  );

  const spriteUris: Record<number, string> = {};
  const cryUris: Record<number, string> = {};
  for (let id = 1; id <= 151; id++) {
    spriteUris[id] = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'sprites', 'front', `${id}.png`)
    ).toString();
    cryUris[id] = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'cries', `${id}.ogg`)
    ).toString();
  }

  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; media-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet">
  <title>Retro Pokemon</title>
</head>
<body class="${config.scanlines ? 'scanlines' : ''}">
  <div id="stage"></div>
  <script nonce="${nonce}">
    window.RETRO_CONFIG = ${JSON.stringify(config)};
    window.SPRITE_URIS = ${JSON.stringify(spriteUris)};
    window.CRY_URIS = ${JSON.stringify(cryUris)};
    window.INITIAL_POKEMON = ${JSON.stringify(pokemon)};
  </script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
