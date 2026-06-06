import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // ── GitHub Pages base path ─────────────────────────────────────────────
  // Project site:  set to "/<your-repo-name>/"  e.g. "/service-jobs-crm/"
  // Root / custom domain:  set to "/"
  base: "/service-jobs-crm/",
});
