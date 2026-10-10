import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Deployed under a sub-path on GitHub Pages
// (https://mmncollieg.github.io/Project-Fare-AI/). Override with BASE=/ for root
// hosts such as Vercel/Netlify or local preview.
const base = process.env.BASE ?? "/Project-Fare-AI/";

export default defineConfig({
  base,
  build: {
    target: "es2022", // top-level await + WebGPU-era browsers
    sourcemap: true,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.png", "icons/*.svg"],
      manifest: {
        name: "BiyaheOffline",
        short_name: "BiyaheOffline",
        description:
          "Offline jeepney routing, legal student-fare math, and an airplane-mode GPS wake-up alarm. Works with zero load.",
        lang: "fil",
        theme_color: "#0b7d3b",
        background_color: "#0f1115",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        categories: ["travel", "navigation", "utilities"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Pre-cache the whole app shell, including the WebLLM runtime chunk, so
        // the app opens and runs in airplane mode after the first Wi-Fi visit.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,wasm,json}"],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: "index.html",
        // IMPORTANT: never let the service worker touch the multi-hundred-MB
        // model weights. WebLLM already stores them in its own Cache storage;
        // caching them twice would blow up the phone's disk. We simply do not
        // add any runtimeCaching rule for huggingface.co / the CDN, so those
        // requests pass straight through to WebLLM.
        navigateFallbackDenylist: [/^\/huggingface\.co/, /\/resolve\/main\//],
      },
      devOptions: {
        // Keep the Service Worker OUT of `vite dev`. A dev SW caches the app
        // shell and then serves a STALE index.html to an already-open tab after
        // you edit the HTML, which makes elements go missing at runtime. The SW
        // is still generated and tested in the production build (`npm run build`
        // + `npm run preview`), which is where offline behaviour should be verified.
        enabled: false,
      },
    }),
  ],
});
