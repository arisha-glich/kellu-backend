/**
 * CORS `Access-Control-Allow-Origin` values.
 *
 * In production, Better Auth sets cookies with `Domain=.kellu.co` (see `lib/auth.ts`). Those
 * cookies are **not** sent to `*.kellu.com` (e.g. `demo.kellu.com`) on navigations to that host,
 * so a Next app on `.com` cannot use the same session cookie model as `*.kellu.co` frontends.
 */
export const ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:4000',
  'http://localhost:5000',
  'http://localhost:8000',
  'http://localhost:8080',
  'http://localhost:9000',
  'https://demo.kellu.com', // .com ≠ .kellu.co; fine for CORS API calls, not for shared .kellu.co cookies on that host
  'https://kellu-frontend.onrender.com',
  'https://kelluproject.kellu.co',
  'https://api.kellu.co',
]
