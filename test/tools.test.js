import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NameGenderClient, NameGenderError } from '../src/client.js';
import { formatResult, formatBulk, formatCountries, formatAccount, formatError, TOOL_DEFINITIONS } from '../src/tools.js';

/** Sahte fetch: gövdeyi ve başlıkları kaydeder. */
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

test('anahtar Bearer başlığıyla gönderilir', async () => {
  const fetchImpl = fakeFetch({ gender: 'female' });
  const client = new NameGenderClient({ apiKey: 'ng_live_x', fetchImpl });

  await client.name('Ayşe');

  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer ng_live_x');
});

test('bütün uçlar /api/v1 altında çağrılır', async () => {
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

test('boş ülke kodu gövdeye konmaz', async () => {
  // Ölçülen hata: country: undefined JSON'da boş dizeye dönüşünce API
  // "iki harf" beklediği için 422 dönüyordu.
  const fetchImpl = fakeFetch({ gender: 'male' });
  const client = new NameGenderClient({ apiKey: 'k', fetchImpl });

  await client.name('Ali', { country: undefined });

  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { name: 'Ali' });
});

test('hata gövdesi tiplenmiş hataya çevrilir ve request_id korunur', async () => {
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

test('kredi bitti hatası ne yapılacağını söyler ve istek numarasını taşır', () => {
  const result = formatError(
    new NameGenderError('Krediniz bitti.', { status: 402, code: 'no_credits', requestId: 'req_9' }),
  );

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /free quota/);
  assert.match(result.content[0].text, /req_9/);
});

test('sonuç metni kanıtı da taşır', () => {
  const line = formatResult({
    query: 'Ayşe', gender: 'female', probability: 99, sample_size: 12345,
    source: 'ssa', country: 'TR', matched_as: 'ayse',
  });

  assert.match(line, /female/);
  assert.match(line, /99%/);
  assert.match(line, /12,345/);      // en-US binlik ayracı
  assert.match(line, /ssa/);
});

test('örneklemi olmayan cevap kesinlik iddia etmez', () => {
  // Bu ürünün en önemli davranışı: sayımı olmayan bir kaynağın %95'i,
  // sayıma dayanan bir %95 gibi GÖRÜNMEMELİ.
  const line = formatResult({
    query: 'Kamon', gender: 'male', probability: 95, sample_size: 0,
    source: 'wgnd', confidence: 'unverified',
  });

  assert.match(line, /unverified/);
});

test('toplu sonuç özetle başlar', () => {
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

test('hesap özeti kalan krediyi ve bakiyede kaldığını söyler', () => {
  const out = formatAccount({
    credits_remaining: 1500, free_today: 40, free_daily_limit: 100,
    purchased_credits: 1000, data_version: '2026.08',
  });

  assert.match(out, /Remaining credits: 1,500/);
  assert.match(out, /until you spend them/);
  assert.doesNotMatch(out, /never expire/);
  assert.match(out, /2026\.08/);
});

test('her aracın adı, açıklaması ve şeması var', () => {
  assert.equal(TOOL_DEFINITIONS.length, 6);

  for (const tool of TOOL_DEFINITIONS) {
    assert.ok(tool.name, 'ad zorunlu');
    assert.ok(tool.description.length > 40, `${tool.name}: açıklama çok kısa`);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('ülke listesi sıralamanın sınırını söyler', () => {
  // Modelin "Mehmet Fransız bir addır" dememesi buna bağlı: sayımlı liste
  // yalnızca yedi ülkeyi kapsıyor ve Türkiye onların arasında değil.
  const out = formatCountries({
    basis: { counted_countries: 2, attested_countries: 3, note: 'Shares are calculated only across…' },
    registrations: [
      { country: 'FR', count: 3775, share: 58.97, source: 'insee' },
      { country: 'GB', count: 1130, share: 17.65, source: 'ons' },
    ],
    attested_in: ['FR', 'GB', 'TR'],
  });

  assert.match(out, /FR/);
  assert.match(out, /TR/);                       // sıralamada yok ama tanıklıkta var
  assert.match(out, /only across/);              // sınır beyanı taşınıyor
});

test('geçersiz ve iptal edilmiş anahtar hangi değişkene bakılacağını söyler', () => {
  // API anahtar hatalarını üç ayrı kodla dönüyor; yalnızca missing_key'e
  // ipucu vermek, en sık görülen durumda (yanlış anahtar) modeli çaresiz bırakıyordu.
  for (const code of ['missing_key', 'invalid_key', 'revoked_key']) {
    const result = formatError(new NameGenderError('Key problem.', { status: 401, code }));

    assert.match(result.content[0].text, /NAMEGENDER_API_KEY/, code);
  }
});

test('sunucu, package.json ve server.json aynı sürümü bildirir', async () => {
  // MCP registry npm'de olmayan sürümü reddediyor; üç yerden biri geride
  // kalırsa yayın ya da istemcinin gördüğü sürüm yanlış olur.
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
