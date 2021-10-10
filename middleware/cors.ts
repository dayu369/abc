import type { HandlerFunc, MiddlewareFunc } from "../types.ts";
import type { Skipper } from "./skipper.ts";

import { Status } from "../vendor/https/deno.land/std/http/http_status.ts";
import { DefaultSkipper } from "./skipper.ts";
import { Header, HttpMethod } from "../constants.ts";

export const DefaultCORSConfig: CORSConfig = {
  skipper: DefaultSkipper,
  allowOrigins: ["*"],
  allowMethods: [
    HttpMethod.Delete,
    HttpMethod.Get,
    HttpMethod.Head,
    HttpMethod.Patch,
    HttpMethod.Post,
    HttpMethod.Put,
  ],
};

export function cors(config: CORSConfig = DefaultCORSConfig): MiddlewareFunc {
  if (config.skipper == null) {
    config.skipper = DefaultCORSConfig.skipper;
  }
  if (!config.allowOrigins || config.allowOrigins.length == 0) {
    config.allowOrigins = DefaultCORSConfig.allowOrigins;
  }
  if (!config.allowMethods || config.allowMethods.length == 0) {
    config.allowMethods = DefaultCORSConfig.allowMethods;
  }

  return function (next: HandlerFunc): HandlerFunc {
    return (c) => {
      if (config.skipper!(c)) {
        return next(c);
      }
      const req = c.req;
      const resp = c.response;
      const origin = req.headers!.get(Header.Origin)!;
      if (!resp.headers) resp.headers = new Headers();

      let allowOrigin: string | null = null;
      for (const o of config.allowOrigins!) {
        if (o == "*" && config.allowCredentials) {
          allowOrigin = origin;
          break;
        }
        if (o == "*" || o == origin) {
          allowOrigin = o;
          break;
        }
        if (origin === null) {
          break;
        }
        if (origin.startsWith(o)) {
          allowOrigin = origin;
          break;
        }
      }

      resp.headers.append(Header.Vary, Header.Origin);
      if (config.allowCredentials) {
        resp.headers.set(Header.AccessControlAllowCredentials, "true");
      }

      if (req.method != HttpMethod.Options) {
        if (allowOrigin) {
          resp.headers.set(Header.AccessControlAllowOrigin, allowOrigin);
        }
        if (config.exposeHeaders && config.exposeHeaders.length != 0) {
          resp.headers.set(
            Header.AccessControlExposeHeaders,
            config.exposeHeaders.join(","),
          );
        }

        return next(c);
      }
      resp.headers.append(Header.Vary, Header.AccessControlAllowMethods);
      resp.headers.append(Header.Vary, Header.AccessControlAllowHeaders);
      if (allowOrigin) {
        resp.headers.set(Header.AccessControlAllowOrigin, allowOrigin);
      }
      resp.headers.set(
        Header.AccessControlAllowMethods,
        config.allowMethods!.join(","),
      );
      if (config.allowHeaders && config.allowHeaders.length != 0) {
        resp.headers.set(
          Header.AccessControlAllowHeaders,
          config.allowHeaders.join(","),
        );
      } else {
        const h = req.headers.get(Header.AccessControlRequestHeaders);
        if (h) {
          resp.headers.set(Header.AccessControlRequestHeaders, h);
        }
      }
      if (config.maxAge! > 0) {
        resp.headers.set(Header.AccessControlMaxAge, String(config.maxAge));
      }

      resp.status = Status.NoContent;
    };
  };
}

export interface CORSConfig {
  skipper?: Skipper;
  allowOrigins?: string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  allowCredentials?: boolean;
  exposeHeaders?: string[];
  maxAge?: number;
}
