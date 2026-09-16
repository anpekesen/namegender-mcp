#!/usr/bin/env node

/**
 * NameGender MCP sunucusu.
 *
 * Amaç dağıtım: MCP destekleyen bir istemcide (Claude Desktop, Claude Code,
 * Cursor ve dahası) kullanıcı "şu listedeki adların cinsiyetini bul" diyor ve
 * API'ye kod yazmadan bağlanmış oluyor.
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

// Sürüm tek yerden, package.json'dan okunur: elle yazılan sürüm her
// yayında ayrıca güncellenmek zorundaydı ve istemciye eski numarayı bildirirdi.
// createRequire, JSON içe aktarma özniteliği olmayan Node 18'de de çalışır.
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
 * Hem okunur metin hem yapılandırılmış içerik döndürür.
 *
 * Metin modelin okuduğu şey; `structuredContent` ise alanlara doğrudan
 * erişmesi gerektiğinde kullanacağı ham gövde. İkisini birden vermek,
 * "cevabın yanında kanıtı da dursun" ilkesinin bu yüzeydeki karşılığı.
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
    // stderr'a yazılıyor: stdio taşımasında stdout PROTOKOLE ait, oraya
    // yazılan her şey istemcide çözümleme hatasına dönüşür.
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

// Modül test için de içe aktarılıyor; sunucu YALNIZCA doğrudan
// çalıştırıldığında ayağa kalkar.
if (isEntryPoint()) {
  main().catch((error) => {
    process.stderr.write(`NameGender MCP failed to start: ${error.message}\n`);
    process.exit(1);
  });
}

/**
 * Bu dosya komut satırından mı çalıştırıldı?
 *
 * `import.meta.url` ile `process.argv[1]`'i düz karşılaştırmak YETMİYOR:
 * `npx namegender-mcp` dosyayı `node_modules/.bin/namegender-mcp`
 * kısayolu üzerinden açar, argv[1] o kısayolun yoludur ve eşleşme hiç
 * tutmaz. Sonuç hatasız, sessizce kapanan bir sunucuydu. İki taraf da
 * gerçek dosya yoluna çevrilip karşılaştırılıyor.
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
