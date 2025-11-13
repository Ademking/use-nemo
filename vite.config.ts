import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import customDirectives from "./use-nemo";

// https://vite.dev/config/
export default defineConfig({
  plugins: [customDirectives(), react()],
});
