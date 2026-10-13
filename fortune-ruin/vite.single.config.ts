import { defineConfig, type Plugin } from 'vite';
import type { OutputAsset } from 'rollup';
import react from '@vitejs/plugin-react';

/**
 * Builds the whole game into one self-contained HTML file (code, styles and
 * libraries inlined). All art and sound are generated at runtime, so the
 * file runs offline by simply opening it in a browser — no install, no server.
 *
 *   npm run build:single   →   dist-single/fortune-ruin.html
 */
function inlineIntoHtml(): Plugin {
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    name: 'fortune-ruin:single-file',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = Object.values(bundle).find((a): a is OutputAsset => a.type === 'asset' && a.fileName.endsWith('.html'));
      if (!page) return;
      let html = String(page.source);
      for (const [key, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          const tag = new RegExp(`<script[^>]*src="[^"]*${escapeRe(item.fileName)}"[^>]*></script>`);
          // a literal "</script" inside the code would end the inline script early
          const code = item.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(tag, () => `<script type="module">${code}</script>`);
          delete bundle[key];
        } else if (item.fileName.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${escapeRe(item.fileName)}"[^>]*>`);
          html = html.replace(tag, () => `<style>${String(item.source)}</style>`);
          delete bundle[key];
        }
      }
      page.source = html;
      page.fileName = 'fortune-ruin.html';
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineIntoHtml()],
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: 'index.html',
      output: { inlineDynamicImports: true },
    },
  },
});
