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

### Printing
- **print friendly** - The markdown pages must be printable with an optimized layout.

### 🔍 Smart Filtering
- **Free-text search** - Find recipes instantly
- **Tag filtering** - Drop down to filter by sauce, chicken, vegetable, etc.
- Place the free-text search and tag filtering list on the same line.

## 🛠️ Tech Stack
- ⚡ **Vite 7+** - Lightning-fast builds and minification
- 🎨 **TailwindCSS 4.1+** - Beautiful, responsive styling
- **Marked** - Use npm marked 17+ for markdown rendering 
- 📦 **GitHub Actions** - Automated deployment
- 🌐 **GitHub Pages** - Free hosting with relative paths

## 📂 Project Structure
```
/index.html              # Home page
/recipes/               # Recipe sub-folders
  index.html             # Recipe page that load the specified markdown document specified in the 'md' query string parameter
  /recipe-a/
    recipe.md            # Markdown content
/recipes.json           # Recipe index with URLs, titles, tags, images
```

## Recipe index
Example format for a recipe:
```
{
  "id": "greek-salad",
  "title": "Greek Salad",
  "type": "markdown",
  "date": "2025/12/31",
  "path": "./recipes/index.html?md=greek-salad%2Frecipe.md",
  "image": "https://placehold.co/400x300/green/white?text=Greek+Salad",
  "tags": ["vegetable", "salad", "healthy", "quick"],
  "description": "Fresh and healthy Mediterranean salad"
}
  ```
## 🖼️ Images
- Use **https://placehold.co** for placeholder icons when no image available

## 🎯 Requirements
1. ✅ Use a centralized logic for the markdown rendering. The recipe pages must be as simple as possible
2. ✅ For each recipe, reuse the shared ./recipes/index.html to load recipe.md placed in a specific folder. For example ./recipes/recipe-a/recipe.md. Make sure the relative path a correct for the mark down document because index.html is placed in the parent folder.
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
  - https://www.atelierdeschefs.fr/recettes/29252/tataki-de-boeuf/
  - https://www.colruyt.be/fr/recettes/vol-au-vent-1/
  - https://empreintesucree.fr/glace-vanille/
4. ✅ Home page displays recipe as clickable icon
5. ✅ Click navigates to dedicated recipe page
6. ✅ All paths must be relative for GitHub Pages compatibility
7. ✅ Use context7 for the documentation
8. ✅ Reference the most up to date packages
9. ✅ Create README.md that describes this project
10. ✅ Update the packages to their latest version

---
*Let's build something amazing!* 🌟
