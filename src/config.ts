import * as vscode from "vscode";

const TOKEN_KEY = "wanikani.apiToken";

/** Reads user settings under the `wanikani.*` namespace. */
export function getConfig() {
  const cfg = vscode.workspace.getConfiguration("wanikani");
  return {
    practiceMode: cfg.get<boolean>("practiceMode", false),
    refreshIntervalMinutes: cfg.get<number>("refreshInterval", 15),
    notifyOnDue: cfg.get<boolean>("notifyOnDue", true),
    lessonBatchSize: cfg.get<number>("lessonBatchSize", 5),
  };
}

/** SecretStorage-backed token access. The token never touches settings/disk in plain text. */
export class TokenStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  get(): Promise<string | undefined> {
    return Promise.resolve(this.secrets.get(TOKEN_KEY));
  }

  async set(token: string): Promise<void> {
    await this.secrets.store(TOKEN_KEY, token.trim());
  }

  async clear(): Promise<void> {
    await this.secrets.delete(TOKEN_KEY);
  }

  async has(): Promise<boolean> {
    return !!(await this.get());
  }
}

/** Prompt the user for their WaniKani personal access token. */
export async function promptForToken(store: TokenStore): Promise<boolean> {
  const token = await vscode.window.showInputBox({
    title: "WaniKani API Token",
    prompt: "Paste a personal access token from wanikani.com → Settings → API Tokens",
    password: true,
    ignoreFocusOut: true,
    placeHolder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    validateInput: (value) =>
      value.trim().length < 20 ? "That doesn't look like a WaniKani token." : undefined,
  });
  if (!token) return false;
  await store.set(token);
  return true;
}
