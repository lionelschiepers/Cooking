import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';

// Plugin to serve static recipe pages
function serveStaticRecipes() {
  return {
    name: 'serve-static-recipes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Check if request is for a recipe page
        const recipeMatch = req.url.match(/^\/recipes\/([^\/]+)\/?$/);
        if (recipeMatch) {
          const recipeName = recipeMatch[1];
          const recipePath = path.join(
            process.cwd(),
            'public',
            'recipes',
            recipeName,
            'index.html',
          );

          if (fs.existsSync(recipePath)) {
            res.setHeader('Content-Type', 'text/html');
            res.end(fs.readFileSync(recipePath));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), serveStaticRecipes()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: 'index.html',
        recipes: 'recipes/index.html',
      },
    },
  },
});
