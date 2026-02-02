- Use Context7 for the documentation
- Use the latest version of the packages
- I want to create a website to store my cooking receipts.
- the web site is static. no server side rendering or backend.
- There are two parts for the site
  1. the home page that list all receipts. Each receipts is shown as a clickable icon. 
  2. a receitps can be 
    - a link to another site.
    - a youtube video and the icon is the thumnail of the video.
    - a page stored in a dedicated sub folders. One sub folder by receipts because it will be easier to organize. In this case, the receipts is a markdown document => the link to that receipt is a page that will show a markdown document.
- all receipts are indexed in a receipts.json file. This file contains for each receipt: the url, title, list of tags, image to show in the home page.
- the home page permits to filter the receipts displayed in the list. I want a free text search box and the possibility to filter by tags. For example the tag sauce, chicken, vegetable etc.
- each icons is highlighted when the mouse is over.
- on desktop, I propose to display 4 icons per row. The display must be adapted on phone etc (responsive ui).
- use tailwindcss for styling
- the project will be automated using github actions.
- use vite to publish the site, minifying etc.
- create a sample receipt. the home page must display the receipt as an icon and when I click on the receipt I go to the page dedicated for that receipt.
- use https://placehold.co to create icons when no image are available.

For example the home page is /index.html and when I click on the receipt A, the browser display /receipts/receipt-a/index.html
- the project will be hosted on github pages. The paths must be relative and the home page will be stored in a virtual folder.

