import { defineConfig } from "vitest/config";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  // Web Workers en módulo ES (Vite 8 nativo) — lo usa el worker de Pyodide del
  // módulo de taludes (geotech/pyslope.worker.ts), primer worker del repo.
  worker: { format: "es" },
  // Pyodide se autohospeda en public/pyodide/ y el worker lo importa por URL no
  // literal (no como dependencia npm) — excluirlo del pre-bundle de Vite.
  optimizeDeps: { exclude: ["pyodide"] },
  build: {
    rolldownOptions: {
      output: {
        // Los SDKs de IA (@anthropic-ai/sdk, openai, @google/genai) solo se
        // cargan vía dynamic import desde src/lib/ai/providers/* ("Rellenar
        // con IA", BYOK). Se agrupan en un único chunk `ai-vendor` con nombre
        // estable para poder excluirlo del precache del SW (globIgnores de
        // VitePWA, abajo). Vite 8 usa rolldown: la API vigente es
        // `output.codeSplitting` (`advancedChunks` es su alias @deprecated en
        // rolldown 1.0.0-rc.12).
        codeSplitting: {
          groups: [
            // El helper compartido de import() de Vite (__vite_preload) DEBE ir
            // en su propio chunk. Si no, rolldown lo mete dentro de `ai-vendor`
            // y, como el entry necesita ese helper para sus lazy-imports, pasa a
            // importar `ai-vendor` ESTÁTICAMENTE → arrastra 634 KB de SDK al
            // arranque y obliga a precachearlo (o pantalla en blanco tras cada
            // deploy, ver globIgnores abajo). Aislándolo, ai-vendor queda 100%
            // lazy: solo lo carga `import()` desde providers/*, y el arranque
            // solo arrastra este helper de ~1,2 KB (precacheado).
            {
              name: "vite-preload-helper",
              test: /preload-helper/,
            },
            {
              name: "ai-vendor",
              test: /node_modules[\\/](@anthropic-ai[\\/]sdk|openai|@google[\\/]genai)[\\/]/,
            },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      registerType: "prompt", // prompt user before SW update (CEO plan: show toast + "Actualizar" button)
      // No auto-inyectamos registerSW.js: registramos el SW desde React con
      // `useRegisterSW` (src/components/pwa/PwaUpdatePrompt.tsx) para poder
      // enganchar `onNeedRefresh` → toast "Actualizar". Con 'auto' el script
      // inyectado registra sin callbacks y el SW nuevo se quedaría esperando
      // para siempre (bundle cacheado obsoleto tras cada deploy).
      injectRegister: false,
      devOptions: { enabled: false }, // preserve Vite HMR in dev
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"],
        // Cache-bust por versión: cada build reescribe el precache con revisiones
        // por content-hash. Al activar el SW nuevo (SKIP_WAITING desde el toast),
        // workbox purga las entradas del precache anterior para no dejar bundle
        // viejo en Cache Storage. Es el default de vite-plugin-pwa; explícito
        // para dejar constancia del mecanismo de invalidación.
        cleanupOutdatedCaches: true,
        // Pyodide (~16 MB) NO entra en el precache, AUNQUE el módulo de taludes
        // ya esté shipped:true (Phase 2). Dos barreras lo garantizan: (1) sus
        // assets son .mjs/.wasm/.whl/.zip/.json — ninguna extensión está en el
        // globPatterns de arriba; (2) maximumFileSizeToCacheInBytes = 4 MiB, por
        // debajo del .wasm de ~9,6 MB. Se cachea EN RUNTIME (CacheFirst, regla
        // /pyodide/ de abajo) la primera vez que un usuario abre /geotec/taludes
        // → offline tras el 1er uso, sin inflar el precache de producción
        // (eng-review §9.4 #9). El nombre de caché va versionado al nº de Pyodide
        // para invalidar tras bump (§9.2 #2).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/pyodide/"),
            handler: "CacheFirst",
            options: {
              cacheName: "pyodide-runtime-v314_0_0",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
        // El chunk `ai-vendor` (SDKs de IA, ver build.rolldownOptions arriba) se
        // EXCLUYE del precache: es 100% lazy (solo lo carga `import()` desde
        // src/lib/ai/providers/*), así que el arranque NO depende de él y
        // precachearlo solo inflaría el SW (~634 KB) para todos los usuarios de
        // una feature BYOK que además requiere red.
        //
        // INVARIANTE: esto solo es seguro porque el helper __vite_preload va en
        // su propio chunk (grupo `vite-preload-helper` de arriba, precacheado).
        // Si se quita ese grupo, rolldown vuelve a meter el helper en ai-vendor,
        // el entry lo importa estáticamente y excluirlo del precache deja la app
        // EN BLANCO tras cada deploy (el SW viejo sirve un index/entry que piden
        // un `ai-vendor-<hashViejo>.js` ya purgado por GitHub Pages → 404).
        //
        // No lleva runtimeCaching a propósito (a diferencia de Pyodide): sin red
        // el chunk cacheado no sirve —la IA llama al proveedor por red igualmente—
        // y el único borde (abrir la IA justo tras un deploy, con el chunk viejo
        // purgado y el SW aún sin actualizar) lo cubre el toast "Actualizar".
        globIgnores: ["**/ai-vendor-*.js"],
        // Concreta is offline-first: the whole app bundle must be precached.
        // The main chunk is >2 MiB (default limit), so raise the cap.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Concreta",
        short_name: "Concreta",
        description: "Cálculos estructurales profesionales",
        lang: "es",
        theme_color: "#ffffff",
        background_color: "#ffffff",
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
    // Dos proyectos: la suite normal corre en jsdom (UI + cálculos puros); el
    // golden de PySlope corre en node (Pyodide NO arranca en jsdom). `bun run
    // test:run` ejecuta ambos. Eng-review §9.2 #4 / §3.5.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          globals: true,
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["**/*.golden.test.ts", "**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "golden",
          environment: "node",
          globals: true,
          include: ["src/**/*.golden.test.ts"],
          // Pyodide cold-start + carga de numpy + cómputo: dar margen amplio.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
