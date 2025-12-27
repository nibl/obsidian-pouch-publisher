# Manual Installation Guide - Pouch Publisher for Obsidian
Note: It is recommended to use the Obsidian Community  plugins feature. Or for testing beta versions, to use the BRAT plug-in, which makes testing much easier.

### Step 1: Get the Plugin Files

You need three files:
- `main.js` (the plugin code)
- `manifest.json` (plugin information)
- `styles.css` (optional styling)

These files can be obtained by:
1. Building from source (see below), or
2. Downloading from a release (if available)

### Step 2: Install the Plugin

1. Open your Obsidian vault folder
2. Navigate to `.obsidian/plugins/` 
   - If the `plugins` folder doesn't exist, create it
3. Create a new folder: `pouch-publisher`
4. Copy the three files into `.obsidian/plugins/pouch-publisher/`

Your folder structure should look like:
```
YourVault/
└── .obsidian/
    └── plugins/
        └── pouch-publisher/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

### Step 3: Enable the Plugin

1. Open Obsidian
2. Go to Settings (gear icon)
3. Navigate to: Community plugins
4. Click "Reload" if needed
5. Find "Pouch Publisher" in the list
6. Toggle it ON

### Step 4: Configure the Plugin

1. In Settings, click on "Pouch Publisher" (under Community plugins)
2. Enter your **Pouch URL** (e.g., `https://your-pouch-domain.com`)
3. Enter your **API Key** (get this from your Pouch settings)
4. Close settings

### Step 5: Start Publishing!

Method 1: Click the cloud upload icon (📤) in the left sidebar

Method 2: 
- Press `Ctrl/Cmd + P` to open command palette
- Type "Publish to Pouch"
- Press Enter

---

## For Developers - Building from Source

### Prerequisites

- Node.js (v16 or higher)
- npm

### Build Steps

```bash
# 1. Navigate to the plugin directory
cd /path/to/pouch/integrations/obsidian-plugin/

# 2. Install dependencies
npm install

# 3. Build the plugin
npm run build
```

This will create a `main.js` file in the same directory.

### Install for Testing

After building:

```bash
# Copy the plugin files to your Obsidian vault
# Replace [VAULT_PATH] with your actual vault path

mkdir -p [VAULT_PATH]/.obsidian/plugins/pouch-publisher/
cp main.js [VAULT_PATH]/.obsidian/plugins/pouch-publisher/
cp manifest.json [VAULT_PATH]/.obsidian/plugins/pouch-publisher/
cp styles.css [VAULT_PATH]/.obsidian/plugins/pouch-publisher/
```

Then reload Obsidian and enable the plugin.

### Development Mode

For active development with hot reload:

```bash
npm run dev
```

This watches for file changes and rebuilds automatically.

---

## Getting Your Pouch API Key

1. Log into your Pouch instance
2. Navigate to your user settings or profile page
3. Look for "API Keys" section
4. Click "Generate API Key"
5. Copy the key (you won't see it again!)
6. Paste it into the Obsidian plugin settings

---

## Troubleshooting

### Plugin not appearing in Obsidian
- Make sure files are in the correct folder: `.obsidian/plugins/pouch-publisher/`
- Reload Obsidian (Settings → Community plugins → Reload)
- Check that Community plugins are enabled

### Build fails
- Ensure Node.js v16+ is installed: `node --version`
- Delete `node_modules` and run `npm install` again
- Check for error messages in the console

### "No active file to publish"
- Make sure you have a note open and active in Obsidian

### "Please configure Pouch URL and API Key"
- Go to Settings → Pouch Publisher
- Enter both URL and API Key

### "Authentication failed"
- Verify your API key is correct
- Make sure the API key hasn't expired
- Check that you're using the right Pouch instance URL

---

## Need Help?

- Check the [full README](README.md)
- Review the [developer documentation](../../dev/docs/OBSIDIAN_PLUGIN.md)
- See the [Pouch API docs](../../dev/docs/API_ENDPOINT.md)
