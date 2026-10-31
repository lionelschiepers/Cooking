# 🍳 Cooking Recipes Website - Amazing Edition

## ✨ Vision
Create a **stunning** static website to store and showcase cooking recipes with an **incredible user experience**!

The name of the site is 'Les recettes de Lionel & Ophélie'

## 🚀 Key Features

### 🏠 Home Page
- **Beautiful grid layout** displaying recipe icons
- **4 icons per row** on desktop (fully responsive!)
- **Magical hover effects** that make icons come alive
- **Powerful search & filter** capabilities

### 📝 Recipe Types
1. 🔗 **External Links** - Link to other websites
2. 🎬 **YouTube Videos** - Auto-fetch thumbnails as icons
3. 📄 **Markdown Pages** - Stored in dedicated sub-folders for easy organization

### Styling
- You can use https://www.cuisineaz.com/ for an inspiration about the style and the colors.
- Soft colors especially for the icons displayed from https://placehold.co/
- light grey background for the main area.
- black header and footer background.

### Markdown Rendering
- **CSS styles MUST be provided** for rendered markdown content (lists, headings, blockquotes, code, etc.)
- Use `.prose` class with custom CSS or @tailwindcss/typography plugin
- Ensure proper styling for: unordered lists (bullets), ordered lists (numbers), headings hierarchy, bold/italic text, blockquotes, code blocks, tables, and links
- Test that markdown elements display with proper indentation and visual hierarchy
- **Centralized Rendering**: Use a single dynamic viewer page (`recipes/index.html`) that loads markdown files via query parameter (`?md=filename.md`) rather than creating separate HTML pages for each recipe

### Printing
- **print friendly** - The markdown pages must be printable with an optimized layout.

### 🔍 Smart Filtering
- **Free-text search** - Find recipes instantly
- **Tag filtering** - Drop down to filter by sauce, chicken, vegetable, etc.
- Place the free-text search and tag filtering list on the same line.

## 🛠️ Tech Stack
- ⚡ **Vite 7+** - Lightning-fast builds and minification
- 🎨 **TailwindCSS 4.1+** - Beautiful, responsive styling via PostCSS/Vite plugin (⚠️ **NEVER use CDN in production**)
- **Marked** - Use npm marked 17+ for markdown rendering 
- 📦 **GitHub Actions** - Automated deployment
- 🌐 **GitHub Pages** - Free hosting with relative paths

### Important Note on Tailwind CSS
**DO NOT use cdn.tailwindcss.com in production!** The Tailwind CSS CDN is designed for development purposes only and is not intended for production. Instead:
- Install Tailwind CSS via pnpm: `pnpm add tailwindcss @tailwindcss/vite`
- Use the Vite plugin in `vite.config.js`
- Import the CSS file in your HTML: `<link rel="stylesheet" href="./src/style.css">`
- This ensures optimized, production-ready CSS with proper purging and smaller bundle sizes

## 📂 Project Structure
```
/index.html              # Home page
/recipes.json           # Recipe index with URLs, titles, tags, images (⚠️ ONLY ONE - in project root)
/recipes/               # Markdown recipe source files
  /recipe-name/
    recipe.md            # Markdown content
/recipes/                # Dynamic markdown viewer
  index.html             # Single viewer page for all markdown recipes
/src/                    # Source code
  styles.css             # Tailwind + custom styles
  main.js                # Home page logic
  markdown-renderer.js   # Centralized markdown rendering
  recipe-loader.js       # Recipe page loader
/.gitignore              # Must include 'dist/' to prevent duplicate recipes.json
```

### ⚠️ Important: Single recipes.json Rule
- There must be **ONLY ONE** `recipes.json` file in the entire project
- This file lives in the **project root** (not in subdirectories)
- The `dist/` folder (build output) must be added to `.gitignore`
- Build tools (Vite) will copy recipes.json to `dist/` during build, but this should NOT be committed to git
- Having multiple recipes.json files causes confusion and data inconsistency

## Recipe Types & URL Structure

### 1. YouTube Videos
- `type`: "youtube"
- `url`: Full YouTube URL
- Opens in new tab

### 2. External Links
- `type`: "external"
- `url`: Full external URL
- Opens in new tab
- **⚠️ Image Considerations**: External link recipes need an `image` field with a direct URL to an image
  - Use **https://placehold.co** for placeholder images (format: `https://placehold.co/400x300/BACKGROUND_COLOR/TEXT_COLOR?text=RECIPE+NAME`)
  - Alternatively, save images locally in `/public/images/` folder for better reliability
  - Always test that external images load correctly (some networks may block external image URLs)

### 3. Markdown Pages (⚠️ IMPORTANT)
- `type`: "markdown"
- `path`: Must use the dynamic viewer format
- **Format**: `recipes/index.html?md=RECIPE-NAME.md`
- **Examples**:
  - `recipes/index.html?md=tiramisu.md`
  - `recipes/index.html?md=salade-grecque.md`
  - `recipes/index.html?md=poulet-curry.md`

## Recipe index
Example format for a recipe:
```json
{
  "id": "tiramisu",
  "title": "Tiramisu",
  "type": "markdown",
  "date": "2025/12/31",
  "path": "recipes/index.html?md=tiramisu.md",
  "image": "https://placehold.co/400x300/8B4513/white?text=Tiramisu",
  "tags": ["dessert", "sweet", "italian", "coffee", "cream"],
  "description": "Classic Italian coffee-flavored dessert"
}
```
## 🖼️ Images

### Placeholder Images (External Recipes)
- Use **https://placehold.co** for placeholder icons when no image available
- Format: `https://placehold.co/400x300/BACKGROUND_COLOR/TEXT_COLOR?text=RECIPE+NAME`
- Examples:
  - `https://placehold.co/400x300/8B0000/white?text=Tataki+de+Boeuf` (dark red)
  - `https://placehold.co/400x300/DAA520/white?text=Vol-au-Vent` (golden)
  - `https://placehold.co/400x300/FFF8DC/8B4513?text=Glace+Vanille` (cream with brown text)
- **Note**: External placeholder services may be blocked by some networks or ad blockers. For production, consider hosting images locally.

### YouTube Thumbnails (Auto-fetched)
- Format: `https://img.youtube.com/vi/VIDEO_ID/0.jpg`
- These are automatically fetched from YouTube's thumbnail service
- Most reliable as they come from YouTube's CDN

### Local Images (Recommended for Production)
- Save images to `/public/images/` folder
- Reference with relative paths: `./images/recipe-name.jpg`
- More reliable than external services
- Works offline and won't be blocked by networks

## 🎯 Requirements
1. ✅ Use a centralized logic for the markdown rendering. The recipe pages must be as simple as possible
2. ✅ For markdown recipes, use the dynamic viewer URL format: `recipes/index.html?md=RECIPE-NAME.md`. The recipe.md files are stored in `recipes/[recipe-name]/recipe.md`
3. ✅ Create a sample recipe. 

    For youtube use those videos:
  - https://www.youtube.com/watch?v=F_53yUD3Je4
  - https://www.youtube.com/watch?v=UMBw5_pzcQI
  - https://www.youtube.com/watch?v=DN4T2M84UbI
  - https://www.youtube.com/watch?v=I4Szo0odIDo
  - https://www.youtube.com/watch?v=MdjABUNOx4A
  - https://www.youtube.com/watch?v=yg7U199gbxo
  - https://www.youtube.com/watch?v=xqsojPVS7v8
      
    For external links use those links:
  - https://www.atelierdeschefs.fr/recettes/29252/tataki-de-boeuf/ (https://www.atelierdeschefs.fr/_next/image/?url=https%3A%2F%2Fadc-dev-images-recipes.s3.eu-west-1.amazonaws.com%2Ftataki_8_bd.jpg&w=1920&q=80 for image)
  - https://www.colruyt.be/fr/recettes/vol-au-vent-1/ (https://fgdjrynm.filerobot.com/recipes/43764cf814d5e1e9c3dde13c43af3419bab206d26ac3439834e1a858448c9d64.jpg?h=1200&w=1200&q=60 for image)
  - https://empreintesucree.fr/glace-vanille/ (https://empreintesucree.fr/wp-content/uploads/2016/05/1-glace-vanille-patisserie-empreinte-sucree-1.jpg.webp for image)
4. ✅ Home page displays recipe as clickable icon
5. ✅ Click navigates to dedicated recipe page
6. ✅ All paths must be relative for GitHub Pages compatibility
7. ✅ Use context7 for the documentation
8. ✅ Reference the most up to date packages
9. ✅ Create README.md that describes this project
10. ✅ **Maintain exactly ONE recipes.json file** - Located in project root, add `dist/` to `.gitignore` to prevent build output from creating duplicates
11. ✅ Update the packages to their latest version
12. ✅ **Use Tailwind CSS via PostCSS/Vite plugin - NEVER use the CDN in production**

## 🔧 Troubleshooting

### Images Not Displaying
If recipe images are not showing:
1. **Check browser console** for 404 or CORS errors
2. **Test image URL directly** in browser to verify it loads
3. **Check network tab** to see if requests are being blocked
4. **Common causes**:
   - Ad blockers blocking `placehold.co` or `img.youtube.com`
   - Corporate firewalls restricting external image URLs
   - CORS policy issues with external domains
5. **Solution**: Use local images in `/public/images/` folder instead of external URLs

### Markdown Not Rendering
If markdown recipes show raw text instead of formatted content:
1. Verify the `path` field uses the correct format: `recipes/index.html?md=recipe-name.md`
2. Check that the `.md` file exists in the expected location
3. Ensure the `recipes/index.html` viewer page is properly configured

### Duplicate recipes.json Files
If you find multiple `recipes.json` files in the project:
1. **Check git status**: Run `git ls-files | grep recipes.json` to see tracked files
2. **Remove duplicates**: Delete any recipes.json files outside the project root
3. **Update .gitignore**: Ensure `dist/` is in `.gitignore` to prevent build output from being committed
4. **Clean build**: Run `rm -rf dist/` and rebuild with `pnpm run build`
5. **Best practice**: Only the source `recipes.json` in the project root should exist in the repository

---
*Let's build something amazing!* 🌟
