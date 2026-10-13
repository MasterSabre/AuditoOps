import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleAuditApiRequest } from "./lib/server/audit-api";
import {
  authorizeAuditApiRequest,
  firstAllowedPath,
  getAuthSession,
  handleAuthApiRequest,
  initializeAuthDatabase,
  permissionForPage,
  userCanAccess,
} from "./lib/server/auth-api";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;
let authBootstrapPromise: Promise<void> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function isStaticAsset(path: string): boolean {
  return path.startsWith("/assets/")
    || path.startsWith("/_build/")
    || path.startsWith("/_tanstack/")
    || path.startsWith("/@vite/")
    || path.startsWith("/@id/")
    || path.startsWith("/@fs/")
    || path === "/@vite/client"
    || path === "/favicon.ico"
    || path === "/robots.txt"
    || path === "/__vite_ping"
    || /\.(?:js|mjs|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|pdf)$/i.test(path);
}

function safeNextPath(request: Request): string | null {
  const next = new URL(request.url).searchParams.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes(String.fromCharCode(92))) return null;
  return next;
}

function redirectToLogin(request: Request): Response {
  const current = new URL(request.url);
  const destination = new URL("/login", current);
  const next = `${current.pathname}${current.search}`;
  if (next !== "/login" && !next.startsWith("/api/")) destination.searchParams.set("next", next);
  return Response.redirect(destination, 302);
}

function redirect(request: Request, pathname: string, query?: Record<string, string>): Response {
  const target = new URL(pathname, request.url);
  if (query) for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  return Response.redirect(target, 302);
}

async function protectedPageResponse(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/login") {
    const auth = await getAuthSession(request);
    if (auth && !auth.user.forcePasswordChange) {
      const next = safeNextPath(request);
      const destination = next ?? firstAllowedPath(auth.user);
      return Response.redirect(new URL(destination, url), 302);
    }
    return null;
  }

  const auth = await getAuthSession(request);
  if (!auth) return redirectToLogin(request);
  if (auth.user.forcePasswordChange) return redirect(request, "/login", { mustChangePassword: "1" });
  if (path === "/sem-acesso" || path === "/minha-conta") return null;

  const permission = permissionForPage(path);
  if (permission === "__master__" && auth.user.role !== "master") return redirect(request, "/sem-acesso");
  if (permission && permission !== "__master__" && !userCanAccess(auth.user, permission)) return redirect(request, "/sem-acesso");
  return null;
}

function getServerEnv(): Record<string, string | undefined> {
  return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function expectedRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  if (getServerEnv()["AUDITOPS_TRUST_PROXY"] !== "1") return url.origin;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : url.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

function csrfDenial(request: Request): Response | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return null;
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return new Response(JSON.stringify({ error: "Requisição bloqueada pela proteção CSRF." }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== expectedRequestOrigin(request)) {
        return new Response(JSON.stringify({ error: "Origem não autorizada pela proteção CSRF." }), {
          status: 403,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "Cabeçalho Origin inválido." }), {
        status: 403,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
  } else if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    return new Response(JSON.stringify({ error: "Requisição bloqueada pela proteção CSRF." }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return null;
}

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  const env = getServerEnv();
  const url = new URL(request.url);
  const forwardedProto = env["AUDITOPS_TRUST_PROXY"] === "1"
    ? request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
    : null;
  if (url.protocol === "https:" || forwardedProto === "https") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const path = url.pathname;
  const isStatic = isStaticAsset(path);
  if (path.startsWith("/api/") || !isStatic) headers.set("Cache-Control", "no-store");
  if (env["NODE_ENV"] === "production" && env["AUDITOPS_CSP"] !== "off") {
    const policy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; ");
    headers.set(env["AUDITOPS_CSP"] === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", policy);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Provision/migrate auth exactly once per server process. This makes a newly generated
      // master password visible in the terminal at startup/first request, without a failed login.
      if (!authBootstrapPromise) {
        authBootstrapPromise = initializeAuthDatabase().catch((error: unknown) => {
          authBootstrapPromise = undefined;
          throw error;
        });
      }
      await authBootstrapPromise;
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const csrf = csrfDenial(request);
      if (csrf) return withSecurityHeaders(csrf, request);

      if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/")) {
        return withSecurityHeaders(await handleAuthApiRequest(request), request);
      }
      if (path.startsWith("/api/")) {
        const denied = await authorizeAuditApiRequest(request);
        if (denied) return withSecurityHeaders(denied, request);
        return withSecurityHeaders(await handleAuditApiRequest(request), request);
      }

      const handler = await getServerEntry();
      if (!isStaticAsset(path)) {
        const denial = await protectedPageResponse(request);
        if (denial) return withSecurityHeaders(denial, request);
      }
      let response = await handler.fetch(request, env, ctx);
      response = await normalizeCatastrophicSsrResponse(response);
      return withSecurityHeaders(response, request);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }), request);
    }
  },
};
