/**
 * NameGender API istemcisi.
 *
 * Kept apart from the MCP server because the jobs differ: this file does HTTP
 * and error translation, the server defines tools. Being separate, it can be
 * tested without starting the MCP transport.
 */

const DEFAULT_BASE_URL = 'https://namegender.com/api/v1';

export class NameGenderError extends Error {
  constructor(message, { status = null, code = null, requestId = null } = {}) {
    super(message);
    this.name = 'NameGenderError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export class NameGenderClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = 15000, fetchImpl = fetch } = {}) {
    if (!apiKey) {
      throw new NameGenderError('NAMEGENDER_API_KEY is not set.');
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  name(value, options = {}) {
    return this.#post('/gender', { name: value, ...options });
  }

  email(value, options = {}) {
    return this.#post('/gender/email', { email: value, ...options });
  }

  username(value, options = {}) {
    return this.#post('/gender/username', { username: value, ...options });
  }

  countries(value, options = {}) {
    return this.#post('/gender/countries', { name: value, ...options });
  }

  bulk(names, options = {}) {
    return this.#post('/gender/bulk', { names, ...options });
  }

  account() {
    return this.#request('GET', '/me');
  }

  // ----------------------------------------------------------------

  #post(path, body) {
    // Empty fields are dropped from the body. `country: undefined` does not
    // reach JSON as null, but some clients turn it into an empty string, and
    // the API answers 422 because it expects an ISO country code.
    const clean = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );

    return this.#request('POST', path, clean);
  }

  async #request(method, path, body) {
    /*
     * The timeout is required. The MCP server lives inside a client; a request
     * that never answers stalls the whole session, not just the tool.
     */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;

    try {
      response = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new NameGenderError(`NameGender did not respond within ${this.timeoutMs} ms.`);
      }

      throw new NameGenderError(`Could not reach NameGender: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      /*
       * The API returns every error in one shape: {error, message, request_id, docs}.
       * Success is the HTTP status, not a flag in the body. Carrying request_id
       * matters: support can only trace a problem by that number, and if it is
       * lost in the model's text the user cannot find it again.
       */
      throw new NameGenderError(
        payload?.message ?? `NameGender returned ${response.status}.`,
        {
          status: response.status,
          code: payload?.error ?? null,
          requestId: payload?.request_id ?? null,
        },
      );
    }

    return payload;
  }
}

export { DEFAULT_BASE_URL };
