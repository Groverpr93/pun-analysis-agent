import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	build: {
		// Just above the main chunk (~1,090 kB), which is mostly first-paint UI
		// (assistant-ui, react-dom, base-ui), so the warning fires when it grows
		// rather than on every build. Also clears react-shiki's Oniguruma WASM
		// chunk (~620 kB): emitted, but never fetched, since
		// purdue-highlighter.ts passes a highlighter on the JavaScript engine.
		chunkSizeWarningLimit: 1150,
	},
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "./src"),
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: "./src/setupTests.ts",
	},
});
