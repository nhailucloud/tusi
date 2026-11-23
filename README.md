# TUSI

**Built for the ones we plan for.**

TUSI shows how many days your money lasts and what is safe to spend today. It is a free web app you can install on your phone and laptop. It has no accounts, no bank links and no tracking, and your numbers never leave your device.

TUSI is a nickname for Deborah. Every plan in here is made with the people we love in mind.

Live app: https://nhailucloud.github.io/tusi/

## What it does

* **Safe to spend today:** what you can spend today and still cover every bill until payday, with your cushion kept aside.
* **Runway:** how many days your money lasts if you keep spending at your usual pace.
* **Balance ahead:** a 30, 90 or 180 day forecast with paydays, bills and your lowest point.
* **Can I afford this:** what a purchase does to your runway and to today's safe amount before you buy.
* **Log:** quick purchase logging with amounts and categories, plus a weekly check in.
* **Backup and restore:** save one small file and move your data between phone and laptop.
* **Works offline** and installs on an iPhone home screen like an app.
* **Light and dark** themes.

## How it is built

Plain HTML, CSS and JavaScript. There is no build step, no framework, no server and no outside service. Fonts are stored in the repo, so the app makes no requests to any other site.

| File | What it is |
| --- | --- |
| `index.html` | The app page, with a strict Content Security Policy |
| `css/app.css` | All styles, light and dark |
| `js/engine.js` | The runway and safe to spend engine. Pure functions, no page access |
| `js/store.js` | Saves your data on this device (IndexedDB, then localStorage) |
| `js/backup.js` | Makes and strictly checks backup files |
| `js/app.js` | Screens, sheets and navigation |
| `sw.js` | Service worker that lets the app open offline |
| `manifest.webmanifest` | Name, colors and icons for installing |
| `icons/` | App icons, including the iPhone home screen icon |
| `fonts/` | Outfit and Manrope, with their open font licenses |
| `test.html`, `tests/` | The test page and the tests behind it |

## Put it online with GitHub Pages

These steps use only the GitHub website. You do not need a command line or any installs.

### First time

1. Unzip `tusi-release.zip` on your computer. You get a folder named `tusi`.
2. Go to https://github.com/new while signed in as nhailucloud.
3. Set the repository name to `tusi`. Choose **Public**. Leave "Add a README file" unchecked. Click **Create repository**.
4. On the new repository page, click the link **uploading an existing file**.
5. Open the `tusi` folder on your computer and select everything inside it, including the `css`, `js`, `fonts`, `icons` and `tests` folders and the `.nojekyll` file. Drag all of it onto the upload area. Drag the contents, not the `tusi` folder itself.
   * If `.nojekyll` is hidden on your computer, it is fine to skip it. The app works without it.
6. Wait until every file shows in the list, then click **Commit changes**.
7. Open **Settings**, then **Pages** in the left menu.
8. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Set the branch to **main** and the folder to **/ (root)**. Click **Save**.
9. Wait about two minutes, then refresh the Pages settings page. When it shows "Your site is live", open https://nhailucloud.github.io/tusi/

### Check the upload

* The repository's main page lists `index.html`, `sw.js` and `manifest.webmanifest` at the top level, next to the folders. If you see a single `tusi` folder instead, the files went one level too deep. Delete that folder and upload the contents again.
* Open https://nhailucloud.github.io/tusi/test.html. Every tile should be green.

### Updating later

1. Unzip the new release.
2. On the repository page, click **Add file**, then **Upload files**.
3. Drag in the changed files and folders. Files with the same name are replaced.
4. Click **Commit changes** and wait about two minutes.
5. Open TUSI. It shows "A new version of TUSI is ready". Tap **Update**.

Each release changes the version inside `sw.js`. That is what tells installed copies an update exists.

## Install on iPhone

1. Open https://nhailucloud.github.io/tusi/ in **Safari**. Other browsers on iPhone cannot add it as an app.
2. Tap the **Share** button.
3. Scroll down, tap **Add to Home Screen**, then tap **Add**.
4. Open TUSI from the home screen icon. It opens full screen.
5. Set up inside the installed app, or restore a backup there (see below).

Good to know: on iPhone, the home screen app keeps its own data, separate from Safari. Numbers you typed in Safari do not appear in the installed app. Install first, then set up. TUSI also asks the phone to keep its data stored, and home screen apps are kept even when Safari clears website data.

### Install on a laptop

In Chrome or Edge, open the live link, then use the install icon in the address bar or the browser menu. More shows an **Install TUSI** button when the browser supports it.

## Checklists

### Upload and Pages

* [ ] Repository `nhailucloud/tusi` exists and is Public
* [ ] `index.html` is at the top level of the repository
* [ ] Pages source is main branch, root folder
* [ ] https://nhailucloud.github.io/tusi/ opens the setup screen or Home
* [ ] https://nhailucloud.github.io/tusi/test.html shows every tile green

### iPhone install

* [ ] Opened in Safari, Add to Home Screen done
* [ ] TUSI opens full screen from the icon, with the T and sun icon
* [ ] Setup finished inside the installed app, or a backup restored there
* [ ] Turn on Airplane Mode, open TUSI: it still opens and you can log a purchase
* [ ] Turn Airplane Mode off again

### Backup and restore

* [ ] In More, tap **Save a backup**. On iPhone choose **Save to Files** and pick iCloud Drive. On a laptop the file goes to Downloads.
* [ ] The More screen now says "Last backup today"
* [ ] On the other device, open More, tap **Restore from a backup**, pick the file
* [ ] The preview shows the right balance and counts, then tap **Replace my data**
* [ ] Save a fresh backup about once a month. TUSI reminds you after 30 days.

Backups are plain text files. Anyone who opens one can read your numbers, so keep them somewhere private, like your own iCloud Drive.

### Security

* [ ] No server, no database server, no accounts, no bank linking, no paid services
* [ ] No analytics or trackers. The app only loads files from its own site.
* [ ] No secrets or keys anywhere in the repository
* [ ] No real personal numbers in the code. The sample data is invented.
* [ ] Content Security Policy blocks scripts, styles, fonts and connections from any other site
* [ ] All text is placed with `textContent`, never as HTML, so typed names and notes cannot run code
* [ ] Restore refuses files that are not TUSI backups, have wrong values, are over 1 MB, or try to tamper with JavaScript objects
* [ ] Erase all data in More removes everything from the device
* [ ] Anyone holding your unlocked phone can open TUSI. Use your phone's lock screen.

### Test before each release

* [ ] test.html: engine checks, prototype match and backup checks all green
* [ ] Setup in three steps works with a fresh browser
* [ ] Log a purchase, then Undo, and the balance returns
* [ ] Add, edit and delete a bill in Plan
* [ ] Can I afford this shows the change in runway
* [ ] Light and dark both read clearly
* [ ] Works on a small phone (iPhone SE size) without sideways scrolling
* [ ] Offline still opens after one visit
* [ ] After uploading, the update notice appears on an installed copy

## Privacy

TUSI stores your numbers in your browser on your device. Nothing is sent anywhere. There is no account to create and nothing to sign in to. Deleting the app or using **Erase all data** removes your data. Backups exist only where you save them.

## Not financial advice

TUSI gives estimates from the numbers you enter. It is a planning aid, not financial advice.

## Credits

Design and build: Natu, with Claude.
Fonts: Outfit and Manrope, under the SIL Open Font License (see `fonts/`).
