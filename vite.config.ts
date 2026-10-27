import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : l'application fonctionne aussi servie depuis un sous-dossier
  base: './',
  plugins: [react(), tailwindcss()],
});
