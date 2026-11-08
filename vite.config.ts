// Adapted from coin-vault (MIT, Daksh Dua)
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// package.json is the one place the project's addresses are written down.
// The deploy workflow can override them (see .github/workflows/ship.yml).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  homepage?: string;
  repository?: { url?: string };
};
const siteUrl = (process.env.SITE_URL || pkg.homepage || '.').replace(/\/$/, '');
const repoUrl = process.env.REPO_URL || pkg.repository?.url || 'https://github.com';

/**
 * The Content-Security-Policy the built page ships with. It lets the page run its own script and
 * style, show its own images and photos, and nothing else. The app makes no requests, and the policy blocks
 * fetch, XHR and outside images. (A meta policy does not govern links the user follows.) The dev server needs inline styles and a
 * socket, so the policy is only written into the production build.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig(({ command }) => ({
  // Relative paths, so the same build works at <user>.github.io/bar-vault/,
  // on a custom domain, or from any subfolder.
  base: './',
  build: {
    target: 'es2022',
    // Fonts stay files (font-src 'self'), not data URLs inside the CSS.
    assetsInlineLimit: 0,
  },
  plugins: [
    {
      name: 'fill-in-links',
      transformIndexHtml: (html) =>
        html
          .replaceAll('%SITE_URL%', siteUrl)
          .replaceAll('%REPO_URL%', repoUrl)
          .replaceAll('%CSP%', command === 'build' ? `<meta http-equiv="Content-Security-Policy" content="${CSP}" />` : ''),
    },
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
