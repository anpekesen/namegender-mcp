/**
 * MCP tool definitions and result formatting.
 *
 * Separate from the transport: everything here is pure input to output, so it
 * can be tested without starting the server.
 */

import { NameGenderError } from './client.js';

const COUNTRY = {
  type: 'string',
  description:
    'Country as an ISO code (TR, DE, US or TUR, DEU, USA) or a country name (Germany, Deutschland). ' +
    'When given, the answer is weighted by that country\'s data — the same name can have a different gender by country.',
  maxLength: 60,
};

const NAMES = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 };

// Fallbacks for when the country is not known, as in a sign-up form: the API
// uses country first, then the locale's region, then the IP. A locale without
// a region ("en") sets no country.
const LOCALE = {
  type: 'string',
  description:
    'Language tag of the person, such as a browser\'s Accept-Language (it-IT, de-AT). Its region ' +
    'is used as the country when `country` is not given; a tag without a region (en) sets none.',
  maxLength: 35,
};

const IP = {
  type: 'string',
  description:
    'IP address of the person (IPv4 or IPv6), used to look up the country when neither `country` ' +
    'nor a locale with a region is given. It is not stored.',
  maxLength: 45,
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
        locale: LOCALE,
        ip: IP,
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
        locale: LOCALE,
        ip: IP,
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
        locale: LOCALE,
        ip: IP,
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
        locale: LOCALE,
        ip: IP,
      },
      required: ['names'],
    },
  },
  {
    name: 'name_countries',
    title: 'Countries a name appears in',
    description:
      'Returns the countries where a name is recorded. WARNING: this is NOT a claim about ' +
      'origin or ethnicity. Counted birth registrations are published by only a small set of ' +
      'countries (the US, UK, France, Spain and a few others), so the ranking compares those ' +
      'countries only; countries that publish no counts, such as Turkey or Japan, appear in ' +
      'the attested list, not in the ranking.',
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
    name: 'salutation',
    title: 'Salutation for a letter or email',
    description:
      'Writes the opening line of a letter or email for a name, in the language of the letter: ' +
      '"Sehr geehrte Frau Müller," in German, "Sayın Ahmet Bey," in Turkish, "Madame," in French. ' +
      'Returns formal, informal and neutral versions. When the gender is not certain enough, the ' +
      'gendered form is NOT guessed: `form` is "neutral" and `reason` says why. Use the returned line ' +
      'as it is; word order, punctuation and which name part is used differ by language. ' +
      'Pass `names` instead of `name` for up to 100 at once.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name, e.g. "Anna Müller". Use `email` instead when there is no name.' },
        names: { ...NAMES, description: 'Up to 100 full names (or email addresses with type "email"), answered in order.' },
        email: { type: 'string', description: 'Email address, when no name is known: anna.mueller@ gives Frau Mueller.' },
        type: { type: 'string', enum: ['name', 'email'], description: 'With `names`: what the values are. Default: name.' },
        language: {
          type: 'string',
          description: 'Language of the letter, not of the name: en, en-US, en-GB, de, de-AT, de-CH, fr, es, it, pt, ' +
            'pt-PT, pt-BR, nl, tr, pl, ja. Without it the locale\'s language is used, then the country\'s, then English.',
          maxLength: 35,
        },
        gender: {
          type: 'string', enum: ['male', 'female', 'neutral'],
          description: 'Known gender, e.g. from a CRM field. Skips the lookup.',
        },
        title: { type: 'string', description: 'Academic title to include, e.g. "Dr."', maxLength: 40 },
        min_probability: {
          type: 'integer', minimum: 50, maximum: 100,
          description: 'Below this gender probability the neutral form is used. Default 90.',
        },
        country: COUNTRY,
        locale: LOCALE,
        ip: IP,
      },
    },
  },
  {
    name: 'name_check',
    title: 'Does a name look real?',
    description:
      'Says whether a name typed into a form looks like a real person\'s name, with the reasons: ' +
      'keyboard mashing ("asdf qwerty"), placeholders ("Test Test", "John Doe"), fictional characters, ' +
      'profanity, digits or an email address in the name field. Returns an assessment (plausible, ' +
      'suspicious or implausible), a 0-100 score and the signals. It never calls a name fake: use it ' +
      'to flag a record for review, not to reject a person. Real names such as Jennifer Null pass. ' +
      'Pass `names` instead of `name` for up to 100 at once.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name as typed into the form.' },
        names: { ...NAMES, description: 'Up to 100 names, answered in order.' },
        country: COUNTRY,
        locale: LOCALE,
        ip: IP,
      },
    },
  },
  {
    name: 'age_from_name',
    title: 'Age of the people with a first name',
    description:
      'How old the living people with a first name are: the median age, the middle half and the ' +
      'middle 80%, from birth records and life tables. "Brittany" in the US: median 36, half between ' +
      '32 and 38. It describes a GROUP, not a person: always report the range with the median, and ' +
      'never use it to decide anything about one person. Covered: US, FR and NO; without a country ' +
      'the US series is used. Another country returns no age and costs nothing. ' +
      'Pass `names` instead of `name` for up to 100 at once.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A first name, or a full name to take the first name from.' },
        names: { ...NAMES, description: 'Up to 100 names, answered in order.' },
        gender: {
          type: 'string', enum: ['male', 'female'],
          description: 'Use only one gender\'s records. Matters for names that moved between genders: male Leslies are much older than female ones.',
        },
        country: COUNTRY,
        locale: LOCALE,
        ip: IP,
      },
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
 * Makes one result readable for people and models.
 *
 * Why not raw JSON: given the raw body, a model loses `sample_size` and
 * `source` inside the answer, and those are exactly what matters here: how
 * solid the answer is and where it came from. The raw body is still attached
 * for when the model needs a field.
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
    // A source without counts: say EXPLICITLY that no certainty is claimed,
    // otherwise 95% reads as if it rested on a count.
    parts.push('no sample (unverified)');
  }

  if (result.source) {
    parts.push(`source ${result.source}`);
  }

  if (result.matched_as && result.matched_as !== result.query) {
    parts.push(`matched as "${result.matched_as}"`);
  }

  if (result.country) {
    // Say when the country was inferred: "IT" from a locale is a guess about
    // the person, not something the caller stated.
    const inferred = result.country_source === 'locale' || result.country_source === 'ip';
    parts.push(`country ${result.country}${inferred ? ` (from ${result.country_source})` : ''}`);
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
 * Formats a country distribution.
 *
 * The two lists are written SEPARATELY and the ranking's limit is stated first.
 * As a single list, a model says "Mehmet is a French name". This was measured:
 * in the counted data France leads with 59% and Turkey does not appear at all.
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

/** One salutation: the formal line first, then why it is neutral if it is. */
export function formatSalutation(result) {
  const s = result.salutation ?? {};
  const parts = [`${result.query ?? result.name ?? ''}: ${s.formal ?? '—'}`];

  parts.push(`informal "${s.informal ?? ''}"`);

  if (result.form === 'neutral') {
    parts.push(`neutral form${result.reason ? ` (${result.reason})` : ''}`);
  } else if (result.form === 'organization') {
    parts.push('organization');
  } else if (typeof result.probability === 'number') {
    parts.push(`${result.gender} ${result.probability}%`);
  }

  if (result.language) {
    parts.push(`language ${result.language}`);
  }

  return parts.join(' · ');
}

export function formatSalutations(payload) {
  const summary = payload.summary ?? {};
  const lines = [
    `${summary.total ?? 0} names · ${summary.gendered ?? 0} gendered · ${summary.neutral ?? 0} neutral · ` +
    `${summary.organization ?? 0} organization`,
    '',
  ];

  for (const result of payload.results ?? []) {
    lines.push(formatSalutation(result));
  }

  return lines.join('\n');
}

/**
 * One name check. Only the signals that count against a name are listed: info
 * and positive signals explain the score but are not a reason to look again.
 */
export function formatNameCheck(result) {
  const concerns = [...new Set((result.signals ?? [])
    .filter((s) => s.severity !== 'info' && s.severity !== 'positive')
    .map((s) => `${s.code} (${s.severity})`))];

  return [
    `${result.query ?? ''}: ${result.assessment ?? 'unknown'}`,
    `score ${result.score ?? 0}/100`,
    concerns.length > 0 ? `signals: ${concerns.join(', ')}` : 'no signals against it',
  ].join(' · ');
}

export function formatNameChecks(payload) {
  const summary = payload.summary ?? {};
  const lines = [
    `${summary.total ?? 0} names · ${summary.plausible ?? 0} plausible · ${summary.suspicious ?? 0} suspicious · ` +
    `${summary.implausible ?? 0} implausible`,
    '',
  ];

  for (const result of payload.results ?? []) {
    lines.push(formatNameCheck(result));
  }

  return lines.join('\n');
}

/**
 * One age estimate. The range is written next to the median every time: a
 * median alone reads as one person's age, which this is not.
 */
export function formatAge(result) {
  const who = `${result.name ?? ''}${result.gender ? ` (${result.gender})` : ''}`;

  if (result.age === null || result.age === undefined) {
    return `${who}: no age · ${result.reason ?? 'unknown'}${result.country ? ` · country ${result.country}` : ''}`;
  }

  const parts = [
    `${who}: median age ${result.age}`,
    `half between ${result.age_range.low} and ${result.age_range.high}`,
    `80% between ${result.age_range_80.low} and ${result.age_range_80.high}`,
    `born around ${result.birth_year}`,
    `${(result.sample_size ?? 0).toLocaleString('en-US')} living people`,
  ];

  const defaulted = result.country_source === 'default';
  const inferred = result.country_source === 'locale' || result.country_source === 'ip';
  parts.push(`country ${result.country}${defaulted ? ' (default, no country given)' : inferred ? ` (from ${result.country_source})` : ''}`);

  return parts.join(' · ');
}

export function formatAges(payload) {
  return [
    `${(payload.results ?? []).length} names · ${payload.credits_charged ?? 0} credits`,
    '',
    ...(payload.results ?? []).map(formatAge),
  ].join('\n');
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
 * Turns an error into an MCP tool result.
 *
 * Returning `isError: true` differs from throwing: the model sees the error and
 * can act on it (check credits, fix a country code). A thrown exception breaks
 * the session and tells the model nothing.
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
