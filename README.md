# 🍳 Les recettes de Lionel & Ophélie

A stunning static website to store and showcase cooking recipes with an incredible user experience!

## ✨ Features

### 🏠 Home Page
- **Beautiful grid layout** displaying recipe icons (4 per row on desktop, fully responsive)
- **Magical hover effects** that make icons come alive
- **Powerful search & filter** capabilities
- **Tag-based filtering** with dropdown menu

### 📝 Recipe Types
1. 🔗 **External Links** - Link to other websites
2. 🎬 **YouTube Videos** - Auto-fetched thumbnails as icons
3. 📄 **Markdown Pages** - Stored in dedicated sub-folders for easy organization

### 🎨 Design
- Soft colors inspired by [CuisineAZ](https://www.cuisineaz.com/)
- Light grey background for the main area
- Black header and footer background
- Beautiful typography with proper hierarchy

### 🖨️ Print-Friendly
All markdown recipe pages are optimized for printing with:
- Hidden navigation elements
- Clean, readable layout
- Proper page breaks
- No shadows or decorative elements

## 🛠️ Tech Stack

- ⚡ **Vite 7+** - Lightning-fast builds and minification
- 🎨 **TailwindCSS 4.1+** - Beautiful, responsive styling via PostCSS/Vite plugin
- 📝 **Marked 17+** - Markdown rendering
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
│   ├── styles.css         # Tailwind + custom styles
│   ├── main.js            # Home page logic
│   ├── markdown-renderer.js   # Centralized markdown rendering
│   └── recipe-loader.js       # Recipe page loader
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Actions deployment
├── vite.config.js         # Vite configuration
└── package.json           # Dependencies
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd les-recettes-de-lionel-et-ophelie
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open http://localhost:5173 in your browser

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## 📖 Adding New Recipes

### 1. Markdown Recipes

Create a new folder in `/recipes/` with the recipe name, add a `recipe.md` file:

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
  "path": "recipes/index.html?md=recipe-name.md",
  "image": "https://placehold.co/400x300/HEX/TEXT?text=Recipe+Name",
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
- External placeholder services may be blocked by some networks
- For production, consider hosting images locally in `/public/images/`
- YouTube thumbnails are generally reliable

## 🐛 Troubleshooting

### Images Not Displaying
1. Check browser console for 404 or CORS errors
2. Test image URL directly in browser
3. Check if ad blockers are blocking external images
4. Solution: Use local images in `/public/images/` folder

### Markdown Not Rendering
1. Verify the `path` field uses the correct format: `recipes/index.html?md=recipe-name.md`
2. Check that the `.md` file exists in the expected location
3. Ensure the file has proper markdown syntax

## 📄 License

ISC License - See package.json for details

## ❤️ Credits

Made with love by Lionel & Ophélie

---

*Bon appétit !*
