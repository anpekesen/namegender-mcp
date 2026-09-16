// Runs from `npm version`: copies the new package.json version into
// server.json, which the MCP registry reads and which must match.
import { readFile, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const path = new URL('../server.json', import.meta.url);
const server = JSON.parse(await readFile(path, 'utf8'));

server.version = pkg.version;
for (const entry of server.packages ?? []) {
  if (entry.identifier === pkg.name) {
    entry.version = pkg.version;
  }
}

await writeFile(path, JSON.stringify(server, null, 2) + '\n');
console.log(`server.json -> ${pkg.version}`);
