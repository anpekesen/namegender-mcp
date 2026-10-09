import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NameGenderClient, NameGenderError } from '../src/client.js';
import {
  formatResult, formatBulk, formatCountries, formatAccount, formatError, formatSalutation, formatNameCheck,
  formatAge, formatAges, TOOL_DEFINITIONS,
} from '../src/tools.js';

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
  assert.equal(TOOL_DEFINITIONS.length, 9);

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

test('falls back to the default address when the base URL is blank', async () => {
  for (const baseUrl of ['', '   ', undefined]) {
    const fetchImpl = fakeFetch({ gender: 'female' });
    const client = new NameGenderClient({ apiKey: 'ng_live_x', baseUrl, fetchImpl });

    await client.name('Ayşe');

    assert.ok(fetchImpl.calls[0].url.startsWith('https://namegender.com/api/v1/'));
  }
});

test('lookup tools accept locale and ip next to country', () => {
  for (const name of ['gender_from_name', 'gender_from_email', 'gender_from_username', 'gender_bulk']) {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === name);

    assert.deepEqual(['country', 'locale', 'ip'].map((k) => k in tool.inputSchema.properties), [true, true, true], name);
  }
});

test('the country field takes codes and country names', () => {
  // The API converts "Germany" and "Deutschland" to DE since 9 October 2026; a
  // two-or-three-letter pattern here would reject them before they reach it.
  const country = TOOL_DEFINITIONS[0].inputSchema.properties.country;

  assert.equal(country.pattern, undefined);
  assert.equal(country.maxLength, 60);
  assert.match(country.description, /Deutschland/);
});

test('sends locale and ip, and drops them when empty', async () => {
  const fetchImpl = fakeFetch({ gender: 'male' });
  const client = new NameGenderClient({ apiKey: 'ng_live_x', fetchImpl });

  await client.name('Andrea', { country: undefined, locale: 'it-IT', ip: '' });

  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { name: 'Andrea', locale: 'it-IT' });
});

test('says when the country was inferred from a locale or an IP', () => {
  const base = { query: 'Andrea', gender: 'male', probability: 95, country: 'IT' };

  assert.match(formatResult({ ...base, country_source: 'locale' }), /country IT \(from locale\)/);
  assert.match(formatResult({ ...base, country_source: 'ip' }), /country IT \(from ip\)/);
  assert.match(formatResult({ ...base, country_source: 'country' }), /country IT$/);
});

test('the salutation, name check and age tools call their endpoints, single and bulk', async () => {
  const fetchImpl = fakeFetch({});
  const client = new NameGenderClient({ apiKey: 'k', fetchImpl });

  await client.salutation('Anna Müller', { language: 'de', gender: undefined });
  await client.salutationBulk(['Anna Müller'], { language: 'de', type: 'name' });
  await client.nameCheck('asdf qwerty');
  await client.nameCheckBulk(['asdf qwerty']);
  await client.age('Brittany', { gender: 'female', country: '' });
  await client.ageBulk(['Kari'], { country: 'NO' });

  assert.deepEqual(fetchImpl.calls.map((c) => c.url.replace('https://namegender.com/api/v1', '')), [
    '/salutation', '/salutation/bulk', '/name-check', '/name-check/bulk', '/age', '/age/bulk',
  ]);
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { name: 'Anna Müller', language: 'de' });
  assert.deepEqual(JSON.parse(fetchImpl.calls[4].init.body), { name: 'Brittany', gender: 'female' });
});

test('a salutation says when it fell back to the neutral form', () => {
  const gendered = formatSalutation({
    query: 'Anna Müller', form: 'gendered', reason: null, gender: 'female', probability: 98, language: 'de',
    salutation: { formal: 'Sehr geehrte Frau Müller,', informal: 'Liebe Anna,', neutral: 'Guten Tag Anna Müller,' },
  });
  const neutral = formatSalutation({
    query: 'Kim Lee', form: 'neutral', reason: 'gender_unknown', gender: null, language: 'en',
    salutation: { formal: 'Dear Kim Lee,', informal: 'Hi Kim,', neutral: 'Dear Kim Lee,' },
  });

  assert.match(gendered, /^Anna Müller: Sehr geehrte Frau Müller, · informal "Liebe Anna," · female 98% · language de$/);
  assert.match(neutral, /neutral form \(gender_unknown\)/);
});

test('a name check lists only the signals that count against the name', () => {
  const text = formatNameCheck({
    query: 'asdf qwerty', assessment: 'implausible', score: 0,
    signals: [
      { code: 'keyboard_pattern', severity: 'high', part: 'first_name', value: 'asdf' },
      { code: 'keyboard_pattern', severity: 'high', part: 'last_name', value: 'qwerty' },
      { code: 'first_name_attested', severity: 'positive', part: 'first_name', value: 'asdf' },
    ],
  });

  assert.equal(text, 'asdf qwerty: implausible · score 0/100 · signals: keyboard_pattern (high)');
  assert.match(formatNameCheck({ query: 'Jennifer Null', assessment: 'plausible', score: 96, signals: [] }), /no signals against it/);
});

test('an age always comes with its range, and says when the US was assumed', () => {
  const brittany = {
    name: 'Brittany', gender: null, age: 36, age_range: { low: 32, high: 38 }, age_range_80: { low: 28, high: 41 },
    birth_year: 1990, sample_size: 353775, country: 'US', country_source: 'default', reason: null,
  };

  assert.equal(formatAge(brittany),
    'Brittany: median age 36 · half between 32 and 38 · 80% between 28 and 41 · born around 1990 · ' +
    '353,775 living people · country US (default, no country given)');
  assert.equal(formatAge({ name: 'Andrea', age: null, reason: 'country_not_covered', country: 'DE' }),
    'Andrea: no age · country_not_covered · country DE');
  assert.match(formatAges({ credits_charged: 1, results: [brittany] }), /^1 names · 1 credits\n\nBrittany: median age 36/);
});
