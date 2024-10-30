import { Context, PylonAPI, auth, defineService } from "@getcronit/pylon";
import { Handler } from "hono";
import { createBunWebSocket } from "hono/bun";
import { WebSocket } from "ws";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function basicProxy(proxy_url = ""): Handler {
  console.log("Proxying to", proxy_url);
  return async (c: Context) => {
    // remove prefix
    // prefix = /app1/*, path = /app1/a/b
    // => suffix_path = /a/b
    // let path = new URL(c.req.raw.url).pathname
    let path = c.req.path;
    path = path.replace(
      new RegExp(`^${c.req.routePath.replace("*", "")}`),
      "/"
    );
    let url = proxy_url ? proxy_url + path : c.req.url;
    // add params to URL
    if (c.req.query()) {
      let search = new URLSearchParams(c.req.query()).toString();

      if (search) {
        url = url + "?" + search;
      }
    }
    // request

    const headers = {};

    c.req.raw.headers.forEach((value, key) => {
      // Skip if hop-by-hop headers
      if (
        [
          "connection",
          "keep-alive",
          "proxy-authenticate",
          "proxy-authorization",
          "te",
          "trailers",
          "transfer-encoding",
          "upgrade",
          "user-agent",
        ].includes(key)
      ) {
        return;
      }

      headers[key] = value;
    });

    const blob = await c.req.blob();

    const fetchAndHandleBunCertificateError = async (): Promise<Response> => {
      try {
        return await fetch(url, {
          method: c.req.raw.method,
          headers: { ...headers, host: undefined },
          body: blob.size > 0 ? blob : undefined,
          tls: {
            rejectUnauthorized: false,
          },
          keepalive: false,
        });
      } catch (error) {
        console.error(
          "fetchAndHandleBunCertificateError: Error",
          error,
          error.code,
          error.name,
          error.message
        );
        if (
          error.code === "UNABLE_TO_GET_ISSUER_CERT" ||
          error.name === "UNABLE_TO_GET_ISSUER_CERT" ||
          error.message === "unable to get issuer certificate"
        ) {
          console.log(
            "fetchAndHandleBunCertificateError: Retrying after sleep",
            url
          );

          await Bun.sleep(200);

          return fetchAndHandleBunCertificateError();
        }

        throw error;
      }
    };

    try {
      const response = await fetchAndHandleBunCertificateError();

      // response

      console.log("Response", response.status, response.statusText);

      // Compress the response based on the Content-Encoding

      const contentEncoding = response.headers.get("Content-Encoding");

      let compressed: ArrayBuffer;

      if (contentEncoding === "deflate") {
        const buffer = await response.arrayBuffer();
        compressed = Bun.deflateSync(buffer).buffer as ArrayBuffer;
      } else if (contentEncoding === "gzip") {
        const buffer = await response.arrayBuffer();
        compressed = Bun.gzipSync(buffer).buffer as ArrayBuffer;
      } else {
        compressed = await response.arrayBuffer();
      }

      // Delete x-frame-options header
      response.headers.delete("x-frame-options");
      // Delete CSP header
      response.headers.delete("content-security-policy");

      return new Response(compressed, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      console.error("Error", error);

      return new Response("Error", {
        status: 500,
      });
    }
  };
}

import { Lens, LensService } from "./services/lens.service";
import { PasswordUpdater } from "./services/password-updater.service";

dotenv.config();

export const lensService = new Lens();

export default defineService({
  Query: {
    allService: lensService.getServices,
  },
  Mutation: {
    updateInternalPassword: PasswordUpdater.updatePassword,
    serviceUpdate: lensService.updateService,
  },
});

export const configureApp: PylonAPI["configureApp"] = async (app) => {
  app.use(auth.initialize());

  let services = new Map<string, LensService>();

  await lensService.start((latestServices) => {
    services = new Map<string, LensService>(
      latestServices.map((service) => [service.id, service])
    );

    console.log("Services", services);
  });

  app.use(
    upgradeWebSocket(async (c) => {
      // Skip if not a WebSocket upgrade request
      if (!c.req.header("upgrade") || c.req.header("upgrade") !== "websocket") {
        return {};
      }

      const subdomains = getSubdomains(c.req.url);
      const serviceId = subdomains[subdomains.length - 1] || "";

      const service = services.get(serviceId);

      if (service === undefined) {
        throw new Error("Service not found");
      }

      const url = new URL(c.req.url);
      url.host = service.host;
      url.port = service.port.toString();
      url.protocol = service.isSecure ? "wss:" : "ws:";

      console.log("Connecting to", url.href);

      const wsOrigin = `${service.isSecure ? "https" : "http"}://${
        service.host
      }:${service.port}`;

      const targetWs = new WebSocket(url.href, {
        headers: {
          cookie: c.req.header("cookie"),
          origin: wsOrigin,
        },
      });

      await new Promise<void>((resolve) => {
        // Wait until targetWs is open
        targetWs.onopen = () => {
          console.log("Target WebSocket connection established");

          resolve();
        };
      });

      return {
        onOpen: (e, ws) => {
          console.log("Opening WebSocket connection");

          targetWs.onerror = (event) => {
            console.error("Target WebSocket error:", event.message || event);
            ws.close(1011, "Target WebSocket error");
          };

          targetWs.onmessage = async (event) => {
            ws.send(event.data.toString());
          };

          targetWs.onclose = (e) => {
            console.log("Target WebSocket connection closed", e.code, e.reason);
            ws.close(e.code, e.reason);
          };
        },
        onMessage: (event, ws) => {
          if (targetWs) {
            targetWs.send(event.data.toString());
          } else {
            console.error("No target WebSocket to forward message to");
          }
        },
        onClose: (e) => {
          console.log("Closing WebSocket connection", e.code, e.reason);
          if (targetWs) {
            targetWs.close(e.code, e.reason);
          }
        },
      };
    })
  );

  app.use(async (c, next) => {
    const subdomains = getSubdomains(c.req.url);

    const serviceId = subdomains[subdomains.length - 1];

    if (serviceId === undefined) {
      return next();
    }

    const service = services.get(serviceId);

    if (service === undefined) {
      return next();
    }

    if (service.redirect) {
      return c.redirect(service.redirect, 301);
    } else {
      const proxyUrl = `${service.isSecure ? "https" : "http"}://${
        service.host
      }:${service.port}`;

      const proxy = basicProxy(proxyUrl);

      return proxy(c, next);
    }
  });
};

const getSubdomains = (url: string): string[] => {
  const hostnameParts = new URL(url).hostname.split(".");
  // If root domain, treat the whole thing as a single part
  return hostnameParts.length > 1
    ? hostnameParts.slice(0, hostnameParts.length - 1).reverse()
    : [];
};

const { upgradeWebSocket, websocket } = createBunWebSocket();

export const configureWebsocket: PylonAPI["configureWebsocket"] = () => {
  return websocket;
};