# 🍳 Les recettes de Lionel & Ophélie

**Keywords:** Lionel Schiepers, Ophélie De Loz, Cooking, Recipes, Cuisine, Food, Lionel Schiepers cooking, Lionel Schiepers recipes, Ophélie De Loz cooking, Home cooking, Culinary, Gastronomy

A stunning static website to store and showcase cooking recipes with an incredible user experience!

## ✨ Features

### 🏠 Home Page
- **Recipes as square photos** with softly rounded corners (2 to 4 per row depending on screen width)
- **Search** across titles, descriptions and categories (every word must match, accents ignored)
- **Category filter and sorting**; clicking a category on a recipe filters the list too
- **Shareable filters**: the search, category and sort live in the URL (`?q=pâtes&tag=Pates&sort=title-asc`)
- Helpful empty state with one-click ways to widen the search

### 🍽️ Recipe Pages
- Title, photo, date and categories at the top; categories link back to the filtered list
- **Ingredient checklist**: tick ingredients as you go (kept while the tab is open)
- **Keep the screen on** while cooking (Screen Wake Lock API, where supported)
- Print button

### 📝 Recipe Types
1. 🔗 **External Links** - Link to other websites
2. 🎬 **YouTube Videos** - Auto-fetched thumbnails as icons
3. 📄 **Markdown Pages** - Stored in dedicated sub-folders for easy organization

### 🎨 Design
The palette comes from the kitchen table: blue-grey stoneware plates on a pale linen cloth, with a touch of chicon (Belgian endive) yellow.

| Token | Hex | Use |
| --- | --- | --- |
| `--nappe` | `#EEF1EC` | Page background (tablecloth) |
| `--gres` | `#34505B` | Headings, links, buttons (stoneware) |
| `--encre` | `#1D2A2F` | Body text |
| `--sourdine` | `#55666B` | Secondary text (dates, descriptions) |
| `--chicon` | `#E8C547` | Selected category, ticked ingredients only |

- **Type**: [Alegreya](https://www.huertatipografica.com/en/fonts/alegreya-ht-pro) (serif, titles and recipe text) and Alegreya Sans (labels, buttons), self-hosted with Fontsource
- The large square photos are the one bold element; everything else stays quiet
- All tokens and components live in `src/styles.css`
- Accessibility: WCAG AA contrast, visible keyboard focus, skip link, reduced motion and Windows high-contrast support

### 🖨️ Print-Friendly
Recipe pages print without navigation or buttons, with unticked boxes in front of each ingredient (handy as a shopping list) and the address of every link.

### 📱 Offline
`public/sw.js` keeps the pages you have visited available offline, and `public/manifest.json` lets the site be added to a phone's home screen.

## 🛠️ Tech Stack

- ⚡ **Vite 8** - Builds and minification
- 🎨 **Tailwind CSS 4** - Via the Vite plugin, with custom components in `src/styles.css`
- 📝 **Marked 18** - Markdown rendering
- 🖼️ **sharp** - Creates 480/960/1440 px WebP copies of every recipe photo (`pnpm run build:images`)
- 📦 **GitHub Actions** - Automated deployment
- 🌐 **GitHub Pages** - Free hosting with relative paths

## 📂 Project Structure

```
/
├── index.html              # Home page
├── recipes.json           # Recipe index (single source of truth)
├── recipes/               # Markdown recipes and viewer
│   ├── index.html         # Dynamic markdown viewer
│   ├── tiramisu/
│   │   └── recipe.md      # Tiramisu recipe
│   └── salade-grecque/
│       └── recipe.md      # Greek salad recipe
├── src/                   # Source code
│   ├── styles.css         # Tailwind + design tokens and components
│   ├── main.js            # Home page logic
│   ├── recipe-page.js     # Ingredient checklist, print, keep screen on
│   ├── markdown-renderer.js   # Centralized markdown rendering
│   └── recipe-loader.js       # Recipe page loader
├── public/                # favicon.svg, manifest.json, sw.js (copied as is)
├── _layouts/recipe.html   # Template of the static recipe pages
├── recipe-pages.js        # Builds the static recipe pages (shared by prod and dev)
├── build-recipes.js       # Static recipe pages for dist/
├── build-recipes-dev.js   # Static recipe pages for the dev server
├── build-images.js        # Responsive WebP copies of the photos
├── image-variants.js      # Naming of those copies (photo.w480.webp, ...)
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Actions deployment
├── vite.config.js         # Vite configuration
└── package.json           # Dependencies
```

## 🚀 Getting Started

### Prerequisites
- Node.js 22.13 or newer (the deployment uses Node.js 26)
- [pnpm](https://pnpm.io/installation) 11: `npm install -g pnpm`. pnpm then uses the exact version set in `package.json` (`packageManager`)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd les-recettes-de-lionel-et-ophelie
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm run dev
```

4. Open http://localhost:5173 in your browser

### Build for Production

```bash
pnpm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
pnpm run preview
```

## 📖 Adding New Recipes

### 1. Markdown Recipes

Create a new folder in `/recipes/` with the recipe name, add a `recipe.md` file and the photo. Start the markdown with the photo (`![Recipe name](./recipe-name.webp)`) to show it at the top of the page. Name the ingredients section `## Ingrédients` so its list becomes a checklist:

```markdown
---
title: Recipe Name
prep_time: 30 minutes
cook_time: 1 hour
servings: 4
---

## Ingredients
- Item 1
- Item 2

## Instructions
1. Step 1
2. Step 2
```

Then add to `recipes.json`:

```json
{
  "id": "recipe-name",
  "title": "Recipe Name",
  "type": "markdown",
  "date": "2025/12/31",
  "path": "recipes/index.html?md=recipe-name/recipe.md",
  "image": "./recipes/recipe-name/recipe-name.webp",
  "tags": ["tag1", "tag2"],
  "description": "Brief description"
}
```

### 2. YouTube Videos

Add to `recipes.json`:

```json
{
  "id": "video-name",
  "title": "Video Title",
  "type": "youtube",
  "date": "2025/12/31",
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "image": "https://img.youtube.com/vi/VIDEO_ID/0.jpg",
  "tags": ["tag1", "tag2"],
  "description": "Brief description"
}
```

### 3. External Links

Add to `recipes.json`:

```json
{
  "id": "external-recipe",
  "title": "External Recipe",
  "type": "external",
  "date": "2025/12/31",
  "url": "https://example.com/recipe",
  "image": "https://example.com/image.jpg",
  "tags": ["tag1", "tag2"],
  "description": "Brief description"
}
```

### 4. Foodbag Recipes

Import a recipe from [foodbag.be](https://www.foodbag.be) as a Markdown recipe (2 servings, photo cropped so the plate is centered):

```bash
node .agents/skills/import-foodbag/import-foodbag.js "https://www.foodbag.be/fr/recept?dishId=...&weekDocId=..." --tags Viande --dry-run
```

Remove `--dry-run` to write the files. Run with `--help` for all options. Agents can use the `import-foodbag` skill (`.agents/skills/import-foodbag/SKILL.md`), which also covers checking the photo. The skill updates itself when an import reveals something new; after changing the script, run `node .agents/skills/import-foodbag/import-foodbag.js --check` to re-test the recipes in `references.json`.

## 🚢 Deployment

This project is configured for automatic deployment to GitHub Pages via GitHub Actions.

1. Push your code to GitHub
2. Go to Settings → Pages
3. Set Source to "GitHub Actions"
4. The workflow in `.github/workflows/deploy.yml` will automatically build and deploy on every push to main

## 🔧 Important Notes

### ⚠️ Single recipes.json Rule
- There must be **ONLY ONE** `recipes.json` file in the entire project
- This file lives in the **project root** (not in subdirectories)
- The `dist/` folder is in `.gitignore` to prevent duplicate recipes.json
- Build tools will copy recipes.json to `dist/` during build

### ⚠️ Tailwind CSS
**DO NOT use cdn.tailwindcss.com in production!** We use the Vite plugin for production-ready CSS with proper purging.

### ⚠️ Image Considerations
- Keep recipe photos in their recipe folder; `pnpm run build:images` creates the smaller copies the pages use
- Do not name your own files `*.w480.webp`, `*.w960.webp` or `*.w1440.webp`: those names are reserved for the generated copies
- If a photo cannot be loaded, the home page shows an empty plate instead
- YouTube thumbnails are generally reliable

## 📜 Troubleshooting

### Images Not Displaying
1. Check browser console for 404 or CORS errors
2. Test image URL directly in browser
3. Check if ad blockers are blocking external images
4. Solution: Store the photo in the recipe folder (`recipes/<name>/`)

### Markdown Not Rendering
1. Verify the `path` field uses the correct format: `recipes/index.html?md=recipe-name/recipe.md`
2. Check that the `.md` file exists in the expected location
3. Ensure the file has proper markdown syntax

## 📄 License

ISC License - See package.json for details

## ❤️ Credits

Made with love by Lionel & Ophélie

---

*Bon appétit !*
