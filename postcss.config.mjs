/**
 * Tailwind v4 runs through PostCSS; there is no tailwind.config.js — tokens live
 * in app/globals.css.
 *
 * Object form, not the string-array form Next.js also accepts: vite (used by
 * vitest) loads this same file and rejects bare strings as plugins.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
