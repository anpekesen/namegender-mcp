/**
 * NameGender API istemcisi.
 *
 * MCP sunucusundan AYRI duruyor çünkü iki farklı sorumluluk: burası HTTP ve
 * hata çevirisi, orası araç tanımları. Ayrı olduğu için test edilebiliyor —
 * MCP taşıma katmanını ayağa kaldırmadan.
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
    // Tanımsız alanlar gövdeden düşürülüyor: `country: undefined` JSON'a
    // `null` olarak gitmez ama bazı istemcilerde boş dize olur ve API
    // doğrulaması ISO ülke kodu beklediği için 422 döner.
    const clean = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );

    return this.#request('POST', path, clean);
  }

  async #request(method, path, body) {
    /*
     * Zaman aşımı ZORUNLU. MCP sunucusu bir istemcinin içinde yaşıyor;
     * yanıtsız kalan bir istek aracı değil, tüm oturumu askıda bırakır.
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
       * API her hatayı tek gövdeyle döndürüyor: {error, message, request_id, docs}.
       * Başarı gövdede bir bayrakla değil, HTTP statüsüyle bildiriliyor.
       * request_id'yi taşımak önemli — destek bir sorunu ancak o numarayla
       * izleyebiliyor ve modelin ürettiği metinde kaybolursa kullanıcı onu
       * bir daha bulamıyor.
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
