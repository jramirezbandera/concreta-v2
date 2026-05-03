import { defineConfig } from "vitest/config";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      registerType: "prompt", // prompt user before SW update (CEO plan: show toast + "Actualizar" button)
      devOptions: { enabled: false }, // preserve Vite HMR in dev
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"],
        runtimeCaching: [], // all assets are precached; no runtime rules needed
      },
      manifest: {
        name: "Concreta",
        short_name: "Concreta",
        description: "Cálculos estructurales profesionales",
        lang: "es",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          // Vector mark (Chrome/Edge/Firefox/Android Chrome).
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          // Raster fallbacks for older Android versions and the Web App Manifest validator.
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // Maskable variant — survives Android adaptive-icon cropping (safe-zone padded).
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
