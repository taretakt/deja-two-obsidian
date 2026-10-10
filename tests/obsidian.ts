/** Test-only stand-ins. The real Obsidian module is provided by the host app. */
export class TFile { path = ''; }
export class TFolder { path = ''; }
// Parses only the JSON-compatible scalar subset emitted by serializeEntry.
// Real Obsidian YAML integration remains part of the runtime checklist.
export function parseYaml(yaml: string): Record<string, unknown> {
  return Object.fromEntries(yaml.split('\n').map(line => {
    const colon = line.indexOf(':');
    const key = line.slice(0, colon), value = line.slice(colon + 1).trim();
    return [key, ['manual', 'journal'].includes(value) ? value : JSON.parse(value)];
  }));
}
