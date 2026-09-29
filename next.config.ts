import type { NextConfig } from "next";

// Security headers: neither Next.js nor Supabase sets these automatically —
// this has to be done explicitly at the app-deployment layer.
// CSP allows camera/photo capture (blob:) and talking to Supabase (REST + realtime),
// since those are required features, not optional ones. images.pexels.com is
// allowed specifically because the Landscaping catalog's 58 plant photos are
// hosted there - without it the browser silently blocks every one of them.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://images.pexels.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera stays allowed (evidence photos are a required feature); microphone
  // is not needed anywhere in the app, so it's explicitly blocked.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), interest-cohort=()" },
];

// Public share links carry a secret in the URL. These pages must never be
// indexed by search engines, cached by a shared cache/CDN (the API response
// contains short-lived signed file URLs), or leak the URL through a Referer
// header when someone clicks a link off the page.
const shareHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/share/:path*", headers: shareHeaders },
      { source: "/api/share/:path*", headers: shareHeaders },
    ];
  },
};

export default nextConfig;
