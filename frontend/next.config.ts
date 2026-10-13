import type { NextConfig } from "next";

const originOf = (url?: string) => {
  try { return url ? new URL(url).origin : ""; } catch { return ""; }
};
const isProd = process.env.NODE_ENV === "production";

// Browser may only talk to: itself, the two backends, and Microsoft Entra External ID (sign-in + token calls).
const connectSrc = [
  "'self'",
  originOf(process.env.NEXT_PUBLIC_CLAIMS_API_URL),
  originOf(process.env.NEXT_PUBLIC_CHAT_API_URL),
  "https://*.ciamlogin.com",
  "https://login.microsoftonline.com",
].filter(Boolean).join(" ");

// 'unsafe-inline' for scripts/styles is required by Next.js inline bootstrap code unless nonces are introduced.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // CSP only in production: the dev server needs eval for hot reload.
          ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
