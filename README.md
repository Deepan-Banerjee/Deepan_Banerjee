# Deepan: portfolio website

A static portfolio site for a musician. It runs on GitHub Pages with no build step and no server. The editor at `/admin/` changes the site straight from a browser.

The visitor moves through the catalogue first (videos, Spotify, photos), then the story and services, and ends on the booking form.

## Start here (from the zip)

1. Sign in to GitHub. Turn on two-factor sign-in for the account (Settings, then Password and authentication) if it is not on yet.
2. Make a new public repository. Do not add a README or other files. If you name it `<your-username>.github.io`, the site lives at `https://<your-username>.github.io/`. Any other name gives `https://<your-username>.github.io/<name>/`.
3. Unzip the file. On the new repository page, select uploading an existing file, then drag everything inside the `deepan-portfolio` folder into the page (the files and folders, not the folder itself). Commit the upload to `main`.
4. In the repository, open Settings, then Pages. Under Build and deployment, set Source to Deploy from a branch, the branch to `main` and the folder to `/ (root)`. Save.
5. Wait one or two minutes, then open the address that GitHub shows on that page.
6. Make a token (see Make a token below), open `<site address>/admin/` and sign in. The editor fills in the website address by itself. Select Publish once so that search and sharing use the right address.
7. Replace the placeholders (see Before launch). At launch, turn off Hide the site from search engines under Search & sharing, and publish.

## Files

| Path | What it holds |
| --- | --- |
| `content.json` | All the text, links, photos, section order and SEO fields. The editor changes this file. |
| `index.html` | The page shell. The editor rewrites the part between `<!-- SEO:START -->` and `<!-- SEO:END -->` on every publish. |
| `js/site.js` | Builds the page from `content.json` and runs the effects. |
| `js/shared.js` | Link parsers and SEO helpers that the site and the editor both use. |
| `css/site.css` | The look: palette, halftone, comic panels, motion. |
| `admin/` | The editor. |
| `assets/placeholders/` | Meme placeholders. Replace them, then delete this folder. |
| `assets/uploads/` | Photos uploaded through the editor. |

## Put the site on GitHub Pages

1. Make a GitHub repository on the account of the person who will edit the site, and push the contents of this folder to the `main` branch. A fine-grained token only works on repositories that its own account (or one of its organizations) owns. A collaborator on someone else's repository cannot make one.
2. In the repository, open Settings, then Pages.
3. Under Build and deployment, set Source to Deploy from a branch. Set the branch to `main` and the folder to `/ (root)`.
4. Wait about a minute. GitHub shows the site address on the same page.
5. Open `<site address>/admin/` and sign in. The editor fills in the website address by itself. Publish once, so link previews and the sitemap use that address.

## Edit the site

1. Open `<site address>/admin/` and sign in with a GitHub token (see below).
2. Make changes. The preview on the right updates as you type. On a phone, select Preview.
3. Select Publish. The live site updates in about a minute.

After you publish, the bar at the top of the editor says "Live now" when the rebuilt site is up. If the site still looks old in your browser after that, refresh with Ctrl+Shift+R.

The editor keeps unpublished changes in the browser. If you close the tab, the changes are still there next time.

### Shortcuts and handy tricks

- In the preview, select Edit this on any section to open its settings.
- To add videos or Spotify players, paste one or many links into the paste box of that section. They are added at once, and video titles fill in by themselves.
- To add photos, drag them from your computer onto a gallery or a photo field, or copy a photo and press Ctrl+V while a gallery is open.
- Gallery photos sit in even rows and keep their own shape, so nothing is cut off. The site balances the rows by itself on every screen size. Set a photo to Featured to give it a full-width row.
- Tap a photo thumbnail to choose the part that stays in view when the site crops it (the main photo, the story photo and Featured gallery photos). The orange ring shows the point.
- Undo and redo: the arrow buttons at the top, or Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac) outside text fields. After you remove something, the message at the bottom also has an Undo button.
- Publish: Ctrl+S. The publish window lists what changed.
- Google Search Console: paste the HTML tag (or only its code) into Google verification code under Search & sharing, then publish. The editor puts it in the page head.
- Escape closes a question window without doing anything.

### Make a token

1. Sign in to GitHub as the account that owns the repository. Open Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens.
2. Select Generate new token.
3. Set Repository access to Only select repositories, and select this repository.
4. Under Permissions, set Contents to Read and write. Leave everything else at No access.
5. Set an expiry date. When the token expires, make a new one.

## How the editor is protected

The editor page is public, but it cannot change anything by itself. Every save goes to the GitHub API, and GitHub accepts it only with a token that has write access to this repository. A password check written in the page itself would not protect anything, because anyone can read and skip page code. The token is the real lock.

- The token stays in the browser tab and is cleared when the tab closes.
- If you select Remember me, the token is saved on that device, encrypted with a passphrase (AES-GCM, key from PBKDF2 with 310,000 rounds). Without the passphrase, the saved token cannot be read.
- The token can only touch this one repository, and only its files.
- If a token leaks, delete it on GitHub (Settings, then Developer settings, then Personal access tokens). It stops working at once.
- Turn on two-factor sign-in for the GitHub account. Anyone with the account can make a new token.
- `robots.txt` and a `noindex` tag keep search engines away from `/admin/`.

Risk that remains: someone who has the unlocked tab open, or malware on the computer, can use the token. Do not remember the token on a shared computer.

## How the booking form works

GitHub Pages cannot receive form data. The form has two modes:

- Without setup: Send it opens the visitor's email app with the booking details filled in.
- With a form service: make a free form at a service such as Formspree, copy its endpoint link, and paste it in the editor under Sections, then the contact section, then Form endpoint. Enquiries then go straight to the inbox. Free plans limit the number of submissions per month.

## Before launch

Every placeholder says "Placeholder". The editor warns you before publishing if any are left. Replace:

- The intro, the story, the numbers, the services and the quotes.
- All photos and videos (they are memes now).
- The Spotify links.
- The email, phone, WhatsApp and social links.
- The share image under Search & sharing.

Use real numbers only in the story section.

## Run it locally

```
python -m http.server 5173
```

Then open `http://127.0.0.1:5173/`. The editor works locally in trial mode: changes show in the preview, and Publish downloads `content.json` instead.

## Effects

- The city in the first screen has a cyberpunk layer: neon signs, searchlights, sky traffic and glowing windows. The vertical neon signs use the billboard words from Name & intro.
- Neon notes swish behind the content when you scroll. They never cover text or videos.
- A click or tap lights a fluorescent note at the pointer, in the style of a neon sign, with a faint ripple. It is gone in under a second. Starting a scroll on a phone does not set it off.
- On a computer, mouse-wheel scrolling glides (Lenis, loaded from jsDelivr). If that script does not load, the page scrolls normally. Phones keep their own scrolling.
- The city parallax, the hero note and the progress note move with the scroll on the graphics card (CSS scroll-driven animations), so they never lag behind the page. Browsers without that feature use a script instead.
- On phones (touch screens) the effects are lighter. Add `?lite` to the address to test that on a computer.
- If the visitor's system asks for reduced motion, the effects are off.
