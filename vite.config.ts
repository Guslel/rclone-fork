import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the page talks to a separate `rclone rcd`:
//   RC_URL=http://127.0.0.1:5573 RC_AUTH=user:pass npm run dev
// In production rclone serves the built files itself (see bin/rclone-painel).
const target = process.env.RC_URL ?? "http://127.0.0.1:5572";
const auth = process.env.RC_AUTH ? `Basic ${Buffer.from(process.env.RC_AUTH).toString("base64")}` : undefined;
const api = "^/(rc|core|config|operations|sync|job|mount|vfs|options|fscache|backend|\\[)";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      [api]: { target, changeOrigin: true, headers: auth ? { Authorization: auth } : undefined },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
