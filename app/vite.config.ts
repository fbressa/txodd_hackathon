import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/txodd_hackathon/", // GitHub Pages (project page)
  plugins: [react()],
  define: {
    // wallet-adapter referencia process.env em alguns caminhos
    "process.env": {},
  },
});
