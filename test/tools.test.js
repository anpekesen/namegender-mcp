import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NameGenderClient, NameGenderError } from '../src/client.js';
import { formatResult, formatBulk, formatCountries, formatAccount, formatError, TOOL_DEFINITIONS } from '../src/tools.js';

/** Fake fetch that records the body and headers. */
function fakeFetch(response, status = 200) {
  const calls = [];

  const impl = async (url, init) => {
    calls.push({ url, init });

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
    };
  };

  impl.calls = calls;

  return impl;
}

test('sends the key in a Bearer header', async () => {
  const fetchImpl = fakeFetch({ gender: 'female' });
  const client = new NameGenderClient({ apiKey: 'ng_live_x', fetchImpl });

  await client.name('Ayşe');

  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer ng_live_x');
});

test('calls every endpoint under /api/v1', async () => {
  const fetchImpl = fakeFetch({});
  const client = new NameGenderClient({ apiKey: 'k', fetchImpl });

  await client.name('Ali');
  await client.email('ali@example.com');
  await client.username('ali84');
  await client.countries('Ali');
  await client.bulk(['Ali']);
  await client.account();

  assert.deepEqual(fetchImpl.calls.map((c) => `${c.init.method} ${c.url}`), [
    'POST https://namegender.com/api/v1/gender',
    'POST https://namegender.com/api/v1/gender/email',
    'POST https://namegender.com/api/v1/gender/username',
    'POST https://namegender.com/api/v1/gender/countries',
    'POST https://namegender.com/api/v1/gender/bulk',
    'GET https://namegender.com/api/v1/me',
  ]);
});

test('leaves an empty country code out of the body', async () => {
  // Observed bug: country: undefined became an empty string in JSON and the
  // API answered 422 because it expects two letters.
  const fetchImpl = fakeFetch({ gender: 'male' });
  const client = new NameGenderClient({ apiKey: 'k', fetchImpl });

  await client.name('Ali', { country: undefined });

  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { name: 'Ali' });
});

test('turns an error body into a typed error and keeps request_id', async () => {
  const fetchImpl = fakeFetch(
    { error: 'no_credits', message: 'Krediniz bitti.', request_id: 'req_42', docs: 'https://namegender.com/docs' },
    402,
  );
  const client = new NameGenderClient({ apiKey: 'k', fetchImpl });

  await assert.rejects(
    () => client.name('Ali'),
    (error) => {
      assert.ok(error instanceof NameGenderError);
      assert.equal(error.code, 'no_credits');
      assert.equal(error.status, 402);
      assert.equal(error.requestId, 'req_42');

      return true;
    },
  );
});

test('an out-of-credits error says what to do and carries the request ID', () => {
  const result = formatError(
    new NameGenderError('Krediniz bitti.', { status: 402, code: 'no_credits', requestId: 'req_9' }),
  );

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /free quota/);
  assert.match(result.content[0].text, /req_9/);
});

test('the result text carries the evidence', () => {
  const line = formatResult({
    query: 'Ayşe', gender: 'female', probability: 99, sample_size: 12345,
    source: 'ssa', country: 'TR', matched_as: 'ayse',
  });

  assert.match(line, /female/);
  assert.match(line, /99%/);
  assert.match(line, /12,345/);      // en-US thousands separator
  assert.match(line, /ssa/);
});

test('an answer without a sample claims no certainty', () => {
  // The most important behaviour here: 95% from a source without counts must
  // NOT look like 95% backed by counted people.
  const line = formatResult({
    query: 'Kamon', gender: 'male', probability: 95, sample_size: 0,
    source: 'wgnd', confidence: 'unverified',
  });

  assert.match(line, /unverified/);
});

test('a bulk result starts with the summary', () => {
  const out = formatBulk({
    summary: { total: 2, identified: 1, unknown: 1, match_rate: 50 },
    results: [
      { query: 'Ali', gender: 'male', probability: 98, sample_size: 500, source: 'ssa' },
      { query: 'Xyz', gender: null },
    ],
  });

  assert.match(out.split('\n')[0], /match rate 50%/);
  assert.match(out, /Xyz: unknown/);
});

test('the account summary shows remaining credits and that they stay on the balance', () => {
  const out = formatAccount({
    credits_remaining: 1500, free_today: 40, free_daily_limit: 100,
    purchased_credits: 1000, data_version: '2026.08',
  });

  assert.match(out, /Remaining credits: 1,500/);
  assert.match(out, /until you spend them/);
  assert.doesNotMatch(out, /never expire/);
  assert.match(out, /2026\.08/);
});

test('every tool has a name, a description and a schema', () => {
  assert.equal(TOOL_DEFINITIONS.length, 6);

  for (const tool of TOOL_DEFINITIONS) {
    assert.ok(tool.name, 'ad zorunlu');
    assert.ok(tool.description.length > 40, `${tool.name}: description too short`);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('the country list states the limit of its ranking', () => {
  // This is what keeps a model from saying "Mehmet is a French name": the
  // counted list covers only seven countries and Turkey is not one of them.
  const out = formatCountries({
    basis: { counted_countries: 2, attested_countries: 3, note: 'Shares are calculated only across…' },
    registrations: [
      { country: 'FR', count: 3775, share: 58.97, source: 'insee' },
      { country: 'GB', count: 1130, share: 17.65, source: 'ons' },
    ],
    attested_in: ['FR', 'GB', 'TR'],
  });

  assert.match(out, /FR/);
  assert.match(out, /TR/);                       // not ranked, but attested
  assert.match(out, /only across/);              // the limit statement is kept
});

test('invalid and revoked keys point to the environment variable', () => {
  // The API reports key problems with three codes; a hint for missing_key only
  // left the model helpless in the most common case, a wrong key.
  for (const code of ['missing_key', 'invalid_key', 'revoked_key']) {
    const result = formatError(new NameGenderError('Key problem.', { status: 401, code }));

    assert.match(result.content[0].text, /NAMEGENDER_API_KEY/, code);
  }
});

test('the server, package.json and server.json report the same version', async () => {
  // The MCP registry rejects a version that is not on npm; if one of the three
  // falls behind, the release or the version clients see is wrong.
  const { readFile } = await import('node:fs/promises');
  const { VERSION } = await import('../src/index.js');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const server = JSON.parse(await readFile(new URL('../server.json', import.meta.url), 'utf8'));

  assert.equal(VERSION, pkg.version);
  assert.equal(server.version, pkg.version);
  assert.equal(server.packages[0].version, pkg.version);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.equal(server.name, pkg.mcpName);
});
