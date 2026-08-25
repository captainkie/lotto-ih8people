import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * Deliberately *not* a full Content-Security-Policy: Next injects inline bootstrap
 * scripts, so a real `script-src` needs per-request nonces threaded through the
 * document, which is a bigger change than this site needs. `frame-ancestors` is the
 * one CSP directive that is useful on its own — directives you do not send are simply
 * not enforced, so a partial policy is valid rather than half-broken.
 */
const securityHeaders = [
  // The site is HTTPS-only on Vercel; tell browsers never to try plaintext again.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // No MIME sniffing — an uploaded-looking response cannot be re-interpreted as script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full URL only to ourselves; cross-origin gets the origin alone.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Clickjacking: nobody frames this site. CSP for modern browsers, XFO for the rest.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // The site asks for none of these; say so rather than leaving it to the default.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The admin page is password-gated, not secret, but there is no reason for a
      // crawler to index it or follow anything out of it.
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
