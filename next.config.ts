import type { NextConfig } from "next";

/**
 * FFZONE security headers — applied to every response.
 * - CSP stops injected scripts / foreign content from running.
 * - frame-ancestors DENY prevents the site from being embedded in a
 *   phishing iframe (clickjacking).
 * - nosniff stops MIME-type confusion attacks.
 * ('unsafe-inline'/'unsafe-eval' are required by Next.js bootstrapping
 * and Tailwind's runtime styles.)
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone/camera allowed for the site itself (The Vault's voice notes),
  // still blocked for any third-party embed.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
