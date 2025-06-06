import { createRequestHandler, type ServerBuild } from "@remix-run/cloudflare";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore This file won't exist if it hasn't yet been built
import * as build from "./build/server"; // eslint-disable-line import/no-unresolved
import { getLoadContext } from "./load-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleRemixRequest = createRequestHandler(build as any as ServerBuild);

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      console.log("Incoming request:", {
        method: request.method,
        url: request.url,
        pathname: url.pathname,
        search: url.search,
        headers: Object.fromEntries(request.headers.entries())
      });

      // Log specific routes for debugging
      if (url.pathname.includes('/app/product-config')) {
        console.log("Product config route accessed:", {
          pathname: url.pathname,
          searchParams: url.search,
          method: request.method
        });
      }

      const loadContext = getLoadContext({
        request,
        context: {
          cloudflare: {
            // This object matches the return value from Wrangler's
            // `getPlatformProxy` used during development via Remix's
            // `cloudflareDevProxyVitePlugin`:
            // https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy
            cf: request.cf,
            ctx: {
              waitUntil: ctx.waitUntil.bind(ctx),
              passThroughOnException: ctx.passThroughOnException.bind(ctx),
            },
            caches,
            env,
          },
        },
      });

      // Explicitly handle CORS if needed
      if (request.method === "OPTIONS") {
        console.log("Handling OPTIONS request");
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      // Handle static assets
      if (url.pathname.startsWith('/build/')) {
        console.log("Static asset request:", url.pathname);
      }

      const response = await handleRemixRequest(request, loadContext);
      console.log("Response details:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error("Request handling error:", {
        error: errorMessage,
        stack: errorStack,
        url: request.url,
        method: request.method
      });
      return new Response("An unexpected error occurred", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
