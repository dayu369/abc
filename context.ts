import type { Cookie } from "./vendor/https/deno.land/std/http/cookie.ts";
import type { Application } from "./app.ts";
import type { ContextOptions } from "./types.ts";

import { Status } from "./vendor/https/deno.land/std/http/http_status.ts";
import { join } from "./vendor/https/deno.land/std/path/mod.ts";
import {
  getCookies,
  setCookie,
} from "./vendor/https/deno.land/std/http/cookie.ts";
import { Header, MIME } from "./constants.ts";
import { contentType, NotFoundHandler } from "./util.ts";

const { cwd, readFile } = Deno;

const encoder = new TextEncoder();

export class Context {
  app!: Application;
  #request!: Request;
  url!: URL;

  response: {
    body?: BodyInit;
    headers: Headers;
    status?: number;
    statusText?: string;
  } = { headers: new Headers() };
  params: Record<string, string> = {};
  customContext: any;

  #store?: Map<string | symbol, unknown>;

  get cookies(): Record<string, string> {
    return getCookies(this.#request.headers);
  }

  get path(): string {
    return this.url.pathname;
  }

  get method(): string {
    return this.#request.method;
  }

  get queryParams(): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [k, v] of this.url.searchParams) {
      params[k] = v;
    }
    return params;
  }

  get req(): Request {
    return this.#request;
  }

  get res(): Response {
    const { body, headers, status, statusText } = this.response;
    return new Response(body, { headers, status, statusText });
  }

  get(key: string | symbol): unknown {
    return this.#store?.get(key);
  }

  set(key: string | symbol, val: unknown): void {
    if (this.#store === undefined) {
      this.#store = new Map();
    }

    this.#store.set(key, val);
  }

  constructor(opts: ContextOptions);
  constructor(c: Context);
  constructor(optionsOrContext: ContextOptions | Context) {
    if (optionsOrContext instanceof Context) {
      Object.assign(this, optionsOrContext);
      this.customContext = this;
      return;
    }

    const opts = optionsOrContext;
    this.app = opts.app;
    this.#request = opts.r;

    this.url = new URL(this.#request.url, `http://0.0.0.0`);
  }

  #writeContentType = (v: string): void => {
    if (!this.response.headers.has(Header.ContentType)) {
      this.response.headers.set(Header.ContentType, v);
    }
  };

  string(v: string, code: Status = Status.OK): void {
    this.#writeContentType(MIME.TextPlainCharsetUTF8);
    this.response.status = code;
    this.response.body = encoder.encode(v);
  }

  json(v: Record<string, any> | string, code: Status = Status.OK): void {
    this.#writeContentType(MIME.ApplicationJSONCharsetUTF8);
    this.response.status = code;
    this.response.body = encoder.encode(
      typeof v === "object" ? JSON.stringify(v) : v,
    );
  }

  /** Sends an HTTP response with status code. */
  html(v: string, code: Status = Status.OK): void {
    this.#writeContentType(MIME.TextHTMLCharsetUTF8);
    this.response.status = code;
    this.response.body = encoder.encode(v);
  }

  /** Sends an HTTP blob response with status code. */
  htmlBlob(b: Uint8Array, code: Status = Status.OK): void {
    this.blob(b, MIME.TextHTMLCharsetUTF8, code);
  }

  /**
   * Renders a template with data and sends a text/html response with status code.
   * renderer must be registered first.
   */
  async render<T>(
    name: string,
    data: T = {} as T,
    code: Status = Status.OK,
  ): Promise<void> {
    if (!this.app.renderer) {
      throw new Error();
    }
    const r = await this.app.renderer.render(name, data);
    this.htmlBlob(r, code);
  }

  /** Sends a blob response with content type and status code. */
  blob(
    b: Uint8Array,
    contentType?: string,
    code: Status = Status.OK,
  ): void {
    if (contentType) {
      this.#writeContentType(contentType);
    }
    this.response.status = code;
    this.response.body = b;
  }

  async file(filepath: string): Promise<void> {
    filepath = join(cwd(), filepath);
    try {
      this.blob(await readFile(filepath), contentType(filepath));
    } catch {
      NotFoundHandler();
    }
  }

  /** append a `Set-Cookie` header to the response */
  setCookie(c: Cookie): void {
    setCookie(this.response.headers, c);
  }

  /** Redirects a response to a specific URL. the `code` defaults to `302` if omitted */
  redirect(url: string, code = Status.Found): void {
    this.response.headers.set(Header.Location, url);
    this.response.status = code;
  }
}
