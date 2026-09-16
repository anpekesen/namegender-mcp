/**
 * MCP araç tanımları ve sonuç biçimlendirme.
 *
 * Taşıma katmanından ayrı: buradaki her şey saf girdi→çıktı, dolayısıyla
 * sunucuyu ayağa kaldırmadan test edilebiliyor.
 */

import { NameGenderError } from './client.js';

const COUNTRY = {
  type: 'string',
  description:
    'Two-letter ISO 3166-1 country code (TR, DE, US). When given, the answer is ' +
    'weighted by that country\'s data — the same name can have a different gender by country.',
  pattern: '^[A-Za-z]{2}$',
};

export const TOOL_DEFINITIONS = [
  {
    name: 'gender_from_name',
    title: 'Gender from a name',
    description:
      'Predicts gender from a person\'s name. The answer carries more than the gender: ' +
      'the probability, how many people the sample is based on and how the name was ' +
      'matched. Names it cannot be sure about return "unknown" instead of a guess.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A first name, or a full name to extract the first name from.' },
        country: COUNTRY,
      },
      required: ['name'],
    },
  },
  {
    name: 'gender_from_email',
    title: 'Gender from an email address',
    description:
      'Extracts a first name from the local part of an email address and predicts its ' +
      'gender. Returns "unknown" when no name can be extracted — role addresses such as ' +
      'info@ or admin@ included.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address.' },
        country: COUNTRY,
      },
      required: ['email'],
    },
  },
  {
    name: 'gender_from_username',
    title: 'Gender from a username',
    description:
      'Extracts a first name from a username or social media handle and predicts its gender.',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username or handle.' },
        country: COUNTRY,
      },
      required: ['username'],
    },
  },
  {
    name: 'gender_bulk',
    title: 'Many names at once',
    description:
      'Resolves up to 100 values in one request and returns a summary with the match rate. ' +
      'Use this for more than one name: doing the same work one call at a time is slower ' +
      'and wasteful.',
    inputSchema: {
      type: 'object',
      properties: {
        names: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description: 'Values to resolve.',
        },
        type: {
          type: 'string',
          enum: ['name', 'email', 'username'],
          description: 'Type of the values. Default: name.',
        },
        country: COUNTRY,
      },
      required: ['names'],
    },
  },
  {
    name: 'name_countries',
    title: 'Countries a name appears in',
    description:
      'Returns the countries where a name is recorded. WARNING: this is NOT a claim about ' +
      'origin or ethnicity. Counted birth registrations are published for only seven ' +
      'countries (US, UK, France, Canada, Spain, Ireland, Norway), so the ranking compares ' +
      'those countries only; countries that publish no counts, such as Turkey or Japan, ' +
      'appear in the attested list, not in the ranking.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'First name.' },
        limit: {
          type: 'integer', minimum: 1, maximum: 100,
          description: 'How many counted countries to return. Default 25.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'account_status',
    title: 'Account and remaining credits',
    description:
      'Returns remaining credits, the daily free quota and the data version. When credits ' +
      'run out the other tools fail with 402; call this to find out why.',
    inputSchema: { type: 'object', properties: {} },
  },
];

/**
 * Tek bir sonucu insan ve model için okunur hâle getirir.
 *
 * Neden ham JSON değil: modele ham gövde vermek, `sample_size` ve `source`
 * alanlarının cevabın içinde kaybolmasına yol açıyor. Oysa bu üründe asıl
 * söylenmesi gereken şey tam olarak o: cevap ne kadar sağlam ve nereden geldi.
 * Ham gövde yine de ekleniyor — modelin gerekirse alanlara erişmesi için.
 */
export function formatResult(result) {
  const parts = [
    `${result.query ?? result.name}: ${result.gender ?? 'unknown'}`,
  ];

  if (typeof result.probability === 'number' && result.gender !== 'unknown') {
    parts.push(`probability ${result.probability}%`);
  }

  if (typeof result.sample_size === 'number' && result.sample_size > 0) {
    parts.push(`sample ${result.sample_size.toLocaleString('en-US')}`);
  } else if (result.confidence === 'unverified') {
    // Sayımı olmayan kaynak: kesinlik iddia etmediğimizi AÇIKÇA söylemek
    // gerekiyor, yoksa %95 bir sayıma dayanıyormuş gibi okunuyor.
    parts.push('no sample (unverified)');
  }

  if (result.source) {
    parts.push(`source ${result.source}`);
  }

  if (result.matched_as && result.matched_as !== result.query) {
    parts.push(`matched as "${result.matched_as}"`);
  }

  if (result.country) {
    parts.push(`country ${result.country}`);
  }

  return parts.join(' · ');
}

export function formatBulk(payload) {
  const summary = payload.summary ?? {};
  const lines = [
    `${summary.total ?? 0} values · ${summary.identified ?? 0} identified · ` +
    `${summary.unknown ?? 0} unknown · match rate ${summary.match_rate ?? 0}%`,
    '',
  ];

  for (const result of payload.results ?? []) {
    lines.push(formatResult(result));
  }

  return lines.join('\n');
}

/**
 * Ülke dağılımını biçimlendirir.
 *
 * İki liste AYRI yazılır ve sıralamanın sınırı en üstte söylenir. Tek liste
 * hâlinde vermek modelin "Mehmet Fransız bir addır" demesine yol açar —
 * ölçüldü: sayımlı veride Fransa %59 ile başta, Türkiye ise hiç yok.
 */
export function formatCountries(payload) {
  const basis = payload.basis ?? {};
  const lines = [];

  if ((payload.registrations ?? []).length > 0) {
    lines.push(`Registrations in the ${basis.counted_countries ?? 0} countries that publish counts:`);

    for (const row of payload.registrations) {
      lines.push(`  ${row.country} · ${row.count.toLocaleString('en-US')} registrations · ${row.share}% · ${row.source}`);
    }
  } else {
    lines.push('No registrations for this name in the countries that publish counts.');
  }

  lines.push('');
  lines.push(`All countries the name is attested in (${basis.attested_countries ?? 0}): ${(payload.attested_in ?? []).join(', ') || '—'}`);

  if (basis.note) {
    lines.push('');
    lines.push(basis.note);
  }

  return lines.join('\n');
}

export function formatAccount(payload) {
  return [
    `Remaining credits: ${(payload.credits_remaining ?? 0).toLocaleString('en-US')}`,
    `Free quota today: ${payload.free_today ?? 0} / ${payload.free_daily_limit ?? 0}`,
    `Purchased credits: ${(payload.purchased_credits ?? 0).toLocaleString('en-US')} (stay on your balance until you spend them)`,
    `Data version: ${payload.data_version ?? 'unknown'}`,
  ].join('\n');
}

/**
 * Bir hatayı MCP araç sonucuna çevirir.
 *
 * `isError: true` ile dönmek, istisna fırlatmaktan farklı: model hatayı
 * görür ve ona göre davranabilir (krediyi kontrol eder, ülke kodunu düzeltir).
 * İstisna ise oturumu bozar ve modele hiçbir şey anlatmaz.
 */
export function formatError(error) {
  if (!(error instanceof NameGenderError)) {
    return { content: [{ type: 'text', text: `Unexpected error: ${error.message}` }], isError: true };
  }

  const hint = {
    no_credits: 'Out of credits. Top up in the namegender.com dashboard; the free quota resets every day.',
    missing_key: 'The API key is missing or invalid. Check the NAMEGENDER_API_KEY environment variable.',
    invalid_key: 'The API key is not recognised. Check the NAMEGENDER_API_KEY environment variable against the keys in the namegender.com dashboard.',
    revoked_key: 'This API key was revoked. Create a new key in the namegender.com dashboard and update NAMEGENDER_API_KEY.',
    email_not_verified: 'The account email is not verified yet. Verify it from the link sent at sign-up, then try again.',
    rate_limited: 'Rate limit reached. Wait a moment and try again.',
    ai_consent_required: 'The AI fallback needs account consent, which can be given in the dashboard.',
  }[error.code];

  const text = [
    error.message,
    hint,
    error.requestId ? `Request ID: ${error.requestId}` : null,
  ].filter(Boolean).join('\n');

  return { content: [{ type: 'text', text }], isError: true };
}
