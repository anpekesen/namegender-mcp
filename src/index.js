#!/usr/bin/env node

/**
 * NameGender MCP sunucusu.
 *
 * In any MCP client (Claude Desktop, Claude Code, Cursor and others) a user can
 * say "find the gender of the names in this list" and reach the API without
 * writing code.
 *
 * Kurulum:
 *   NAMEGENDER_API_KEY=ng_live_... npx namegender-mcp
 */

import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { NameGenderClient, DEFAULT_BASE_URL } from './client.js';
import {
  TOOL_DEFINITIONS,
  formatAccount,
  formatBulk,
  formatCountries,
  formatError,
  formatResult,
} from './tools.js';

// The version comes from package.json alone: a hand-written copy had to be
// bumped separately on every release and reported a stale number to clients.
// createRequire also works on Node 18, which lacks JSON import attributes.
export const VERSION = createRequire(import.meta.url)('../package.json').version;

export function createServer(client) {
  const server = new Server(
    { name: 'namegender', version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'gender_from_name': {
          const payload = await client.name(args.name, { country: args.country });

          return text(formatResult(payload), payload);
        }

        case 'gender_from_email': {
          const payload = await client.email(args.email, { country: args.country });

          return text(formatResult(payload), payload);
        }

        case 'gender_from_username': {
          const payload = await client.username(args.username, { country: args.country });

          return text(formatResult(payload), payload);
        }

        case 'gender_bulk': {
          const payload = await client.bulk(args.names, {
            country: args.country,
            type: args.type,
          });

          return text(formatBulk(payload), payload);
        }

        case 'name_countries': {
          const payload = await client.countries(args.name, { limit: args.limit });

          return text(formatCountries(payload), payload);
        }

        case 'account_status': {
          const payload = await client.account();

          return text(formatAccount(payload), payload);
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return formatError(error);
    }
  });

  return server;
}

/**
 * Returns both readable text and structured content.
 *
 * The text is what the model reads; `structuredContent` is the raw body for
 * when it needs a field directly. Giving both is how this server keeps the
 * evidence next to every answer.
 */
function text(summary, payload) {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: payload,
  };
}

async function main() {
  const apiKey = process.env.NAMEGENDER_API_KEY;

  if (!apiKey) {
    // Written to stderr: over the stdio transport stdout belongs to the
    // protocol, and anything else written there breaks parsing in the client.
    process.stderr.write(
      'NAMEGENDER_API_KEY is not set. Get a key from the namegender.com dashboard.\n',
    );
    process.exit(1);
  }

  const client = new NameGenderClient({
    apiKey,
    baseUrl: process.env.NAMEGENDER_BASE_URL ?? DEFAULT_BASE_URL,
  });

  await createServer(client).connect(new StdioServerTransport());
}

// The module is also imported by the tests; the server starts ONLY when the
// file is run directly.
if (isEntryPoint()) {
  main().catch((error) => {
    process.stderr.write(`NameGender MCP failed to start: ${error.message}\n`);
    process.exit(1);
  });
}

/**
 * Was this file run from the command line?
 *
 * Comparing `import.meta.url` with `process.argv[1]` as strings is NOT enough:
 * `npx namegender-mcp` runs the file through the `node_modules/.bin/namegender-mcp`
 * symlink, argv[1] is that link's path, and the comparison never matches. The
 * result was a server that exited silently. Both sides are resolved to the
 * real file path before comparing.
 */
function isEntryPoint() {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
