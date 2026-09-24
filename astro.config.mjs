import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  site: 'https://11hotel.vip',
  integrations: [
    sitemap({
      filter: (page) => {
        const u = new URL(page);
        const p = u.pathname;
        // /en/... 配下も同じ除外対象にする（/en/vip/keys 等が漏れないように）
        return (
          !p.startsWith('/vip') &&
          !p.startsWith('/hospitality') &&
          !p.startsWith('/admin') &&
          !p.startsWith('/ai') &&
          !p.startsWith('/api/') &&
          !p.startsWith('/en/vip') &&
          !p.startsWith('/en/hospitality') &&
          !p.startsWith('/en/admin') &&
          !p.startsWith('/private') &&
          !p.startsWith('/collections')
        );
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: true,
    },
  },
});
