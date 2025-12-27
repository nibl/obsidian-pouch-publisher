# Pouch Publisher - Obsidian Plugin

## Quick Start by Reading INSTALL_BRAT

---


> **Important**: Pouch is designed to publish **classic text blog posts, audio posts, and podcast episodes**. It is **not designed** to publish Obsidian vaults, "second brain" notes, or content with wiki-style links. For best results, use Pouch to publish finished articles and episodes, not interconnected note networks.

An Obsidian plugin that allows you to publish your notes directly to your Pouch instance with a single click.

## Requirements

**A Pouch account and API key are required** to use this plugin. The plugin publishes your Obsidian notes to your Pouch instance using API authentication.

### Getting Started

1. **Create a Pouch account** at your Pouch instance
2. **Generate an API key** from your Pouch user settings
3. **Install the plugin** using one of the methods below
4. **Configure the plugin** with your Pouch URL and API key

See the [Quick Start Guide](QUICK_START.md) for detailed setup instructions.

## Features

### Core Publishing Features
- 🚀 **One-click publishing** - Publish your current note to Pouch using a ribbon icon or command palette with remembered settings
- 📝 **Markdown support** - Automatically sends your markdown content to Pouch
- 🔒 **Secure** - Uses API key authentication
- ⚙️ **Easy setup** - Simple configuration through Obsidian settings

### Audio & Podcast Features
- 🎵 **Audio Post Support** - Automatically detects and uploads embedded audio files from your notes
  - **Auto-detection** - Detects the first embedded audio file in your note (mp3, m4a, wav, ogg, webm, flac, aac)
  - **Size validation** - Validates file size (max 25 MB) before upload
  - **Podcast RSS** - Optional "Include in Podcast RSS Feed" checkbox for audio posts
  - **Smart content processing** - Removes audio embed markdown from published post while keeping it in your Obsidian note
- 🎙️ **Easy Podcast Publishing** - Turn your Obsidian notes with audio into podcast episodes with a single click
- 📻 **RSS Feed Integration** - Published audio posts can be automatically included in your podcast RSS feed

### Publishing Options & Management
- 🌐 **Multiple Publishing Destinations** - Manage up to 5 different Pouch instances/domains with shortnames
- ⚙️ **Publish with Options** - Access a dialog to configure all publishing options before publishing
- 🔖 **Full Control** - Over post visibility, tags, and templates
  - **Internal** - Visible only to logged-in users
  - **Public** - Visible to everyone
  - **Excerpt** - Show only first 50 words publicly
  - **Hidden** - Shareable via URL but excluded from listings
  - **Custom slug** - Control the post URL
  - **Tags** - Add comma-separated tags
  - **Custom template** - Use a custom Pouch template
- 💾 **Remember Settings** - Save your publishing preferences for future one-click publishing

### Status & Tracking
- 📋 **Document Properties** - Publishing status stored as Obsidian frontmatter (pouch_destination and pouch_url)
- 📊 **Status Indicators** - Visual indicators showing which notes are published
  - **Status Bar** - See publishing destination in the status bar
  - **Title Icon** - Visual 📤 icon prepended to document title for published notes
- 🔗 **URL Feedback** - Get the post URL immediately after publishing with one-click copy
- 📊 **Publishing Log** - View history of all publishing attempts in settings with timestamps, URLs, and error details
- 🎨 **Customizable Ribbon Icons** - Toggle visibility of ribbon icons in settings (both shown by default)
- ✨ **Custom Icon Design** - Distinct combined icon for "Publish with Options" (upload + settings cog)

## Installation

### Beta Testing (Recommended)

**This plugin is currently in beta testing.**

The easiest way to install and test the plugin is using the BRAT (Beta Reviewers Auto-update Tester) plugin, which automatically installs and updates beta versions from GitHub.

👉 **See the [Quick Start Guide](QUICK_START.md)** for step-by-step BRAT installation instructions.

### Manual Installation

If you prefer traditional installation or don't want to use BRAT:

### Manual Installation

If you prefer traditional installation or don't want to use BRAT:

👉 **See the [Manual Installation Guide](MANUAL_INSTALLATION.md)** for detailed instructions.

Or follow these quick steps:

1. Download the latest release files:
   - `main.js`
   - `manifest.json`
   - `styles.css` (if available)

2. Create a folder in your Obsidian vault: `.obsidian/plugins/pouch-publisher/`

3. Copy the downloaded files into this folder

4. Reload Obsidian (or restart the app)

5. Go to Settings → Community Plugins and enable "Pouch Publisher"

### Building from Source

If you want to build the plugin yourself:

```bash
# Navigate to the plugin directory
cd integrations/obsidian-plugin/

# Install dependencies
npm install

# Build the plugin
npm run build

# For development with auto-rebuild
npm run dev
```

Then copy `main.js` and `manifest.json` to your vault's `.obsidian/plugins/pouch-publisher/` folder.

## Configuration

1. Open Obsidian Settings (gear icon)
2. Navigate to Community Plugins → Pouch Publisher
3. Configure your publishing destinations:

### Managing Destinations

The plugin now supports up to 5 different Pouch publishing destinations. This is useful if you:
- Manage multiple blogs or websites
- Have separate development and production instances
- Publish to different domains

**To add a destination:**
1. Click "Add Destination" in the Publishing Destinations section
2. Configure the following for each destination:
   - **Shortname**: A brief identifier (max 7 characters, no spaces) - e.g., "blog", "dev", "main"
   - **Pouch URL**: Your Pouch instance URL (e.g., `https://your-pouch-domain.com`)
   - **API Key**: Your Pouch API key for this instance

**Note**: The shortname will appear in the status bar and document frontmatter to indicate where a note has been published.

**To remove a destination:**
Click the "Remove" button next to the destination you want to delete.

### Getting Your API Key

To get your Pouch API key:

1. Log into your Pouch instance
2. Navigate to your user settings or profile page
3. Look for the API Keys section
4. Generate a new API key
5. Copy the key and paste it into the plugin settings

**Note**: Keep your API key secure and never share it publicly.

## Usage

There are two ways to publish your current note to Pouch:

### Method 1: One-Click Publishing (Cloud Icon)

Click the cloud upload icon (☁️📤) in the left sidebar ribbon to publish the currently active note with your saved preferences.

**What gets published:**
- Uses your remembered settings for visibility, tags, and template
- Generates a unique slug from the note title
- Title comes from the filename

### Method 2: Publish with Options (Combined Upload + Settings Icon)

Click the combined upload and settings icon in the left sidebar ribbon to open the publishing options dialog.

**Available options:**
- **Publishing Destination** - Select which Pouch instance to publish to (if you have multiple configured)
- **Post Slug** - URL-friendly identifier (auto-generated from title, can be customized)
- **Tags** - Comma-separated tags for categorization
- **Custom Template** - Name of a custom Pouch template (optional)
- **Internal Post** - Make visible to logged-in users only
- **Public Post** - Make visible to everyone on your blog
  - **Excerpt** - Show only the first 50 words publicly (mutual exclusive with Hidden)
  - **Hidden** - Exclude from public listings and RSS, but shareable via URL (mutual exclusive with Excerpt)
- **Remember Settings** - Save these preferences for future one-click publishing (checked by default)

**Note:** When you check "Remember Settings", your publishing preferences (Internal, Public, Excerpt, Hidden, Tags, Template, and Destination) are saved for future one-click publishing. The title and slug are always unique to each post.

**After Publishing:** The dialog stays open and displays the post URL with buttons to visit the post, copy the URL, or close the dialog. The document's frontmatter is updated with the publishing destination and URL.

### Publishing Status Indicators

After you publish a note, Obsidian displays visual indicators of the publishing status:

#### Status Bar Indicator
At the bottom of Obsidian:
- **Icon and Shortname**: Shows "📤 [shortname]" to indicate the note has been published
- **Click to Publish**: Click the status indicator to open the publishing options dialog
- **Hover for URL**: Hover over the indicator to see the full published URL

#### Document Title Icon
In the editor view:
- **Visual Icon**: A 📤 icon is prepended to the document title
- **Automatic Updates**: The icon appears/disappears when switching between published and unpublished notes
- **Non-Intrusive**: The icon is purely visual and doesn't affect the actual title or slug generation

The status is automatically stored in the document's frontmatter as:
```yaml
---
pouch_destination: "shortname"
pouch_url: "https://your-site.com/post/slug"
---
```

This frontmatter is preserved when editing the document and helps you track which notes have been published.

### Publishing Audio Posts

The plugin automatically detects and uploads embedded audio files from your notes:

#### How It Works
1. **Embed Audio in Obsidian**: Use Obsidian's standard audio embed syntax:
   - `![[recording.mp3]]` (Obsidian-style)
   - `![](recording.mp3)` (Markdown-style)

2. **Automatic Detection**: When publishing, the plugin automatically:
   - Detects the first embedded audio file in your note
   - Validates the file size (maximum 25 MB)
   - Shows the audio file name and size in the publishing dialog
   - Uploads the audio file to your Pouch instance

3. **Smart Content Processing**: 
   - The audio embed markdown is automatically removed from the published post
   - Your original Obsidian note remains unchanged with the audio embed intact
   - Pouch displays the audio with its built-in audio player

#### Supported Audio Formats
- MP3 (`.mp3`)
- M4A (`.m4a`)
- WAV (`.wav`)
- OGG (`.ogg`)
- WebM (`.webm`)
- FLAC (`.flac`)
- AAC (`.aac`)

#### Podcast RSS Feed
When publishing audio posts with the "Publish with Options" dialog:
- Check the **"Include in Podcast RSS Feed"** option to make the post available in your podcast feed
- This checkbox appears only when an audio file is detected
- If you enable "Remember Settings", this preference is saved for future audio posts

#### Example Workflow
```markdown
# My Podcast Episode

![[episode-001.mp3]]

Here are my show notes and transcript...
```

When published:
- ✅ Audio file is uploaded to Pouch
- ✅ Audio embed is removed from the post content
- ✅ Only "Here are my show notes and transcript..." appears in the published post
- ✅ Audio player is displayed above the content
- ✅ (Optional) Included in podcast RSS feed

### Method 3: Command Palette

1. Press `Ctrl/Cmd + P` to open the command palette
2. Type "Publish to Pouch" to see both options:
   - **"Publish current note to Pouch (One-Click)"** - Quick publish with saved settings
   - **"Publish to Pouch with Options"** - Open the options dialog
3. Press Enter to execute

### After Publishing

After successfully publishing, you'll see a dialog with:
- The URL of your published post (public or internal)
- **Visit Post** button - Opens the post in your browser
- **Copy URL** button - Copies the URL to your clipboard (works on mobile too!)
- **Close** button

This is especially useful for hidden posts where you need the URL to share with others.

### Publishing Log

The plugin maintains a detailed log of all publishing attempts, accessible in the plugin settings:
- **Successful publishes** show timestamp, title, slug, and URL
- **Failed publishes** show timestamp, title, slug (if available), and error message
- Log is scrollable and formatted for easy reading
- Maintains up to 100 most recent entries
- Can be cleared using the "Clear Log" button in settings

To view the log:
1. Go to Obsidian Settings
2. Navigate to Community Plugins → Pouch Publisher
3. Scroll down to the "Publishing Log" section

### Customizing Ribbon Icons

You can control which icons appear in the sidebar ribbon through the plugin settings:
- **Show One-Click Publishing Icon** - Toggle the cloud upload icon
- **Show Publishing with Options Icon** - Toggle the combined upload + settings icon
- Both icons are shown by default

To customize:
1. Go to Obsidian Settings
2. Navigate to Community Plugins → Pouch Publisher
3. Find the "Ribbon Icons" section
4. Toggle the icons on or off as desired

## Troubleshooting

### "No active file to publish"
Make sure you have a note open in the editor before trying to publish.

### "Please configure Pouch URL and API Key in settings"
You need to set up your Pouch URL and API key in the plugin settings first.

### "Authentication failed"
- Verify your API key is correct
- Make sure your API key hasn't expired
- Ensure you're using the API key for the correct Pouch instance

### "Failed to publish"
- Check your internet connection
- Verify the Pouch URL is correct and accessible
- Check the Obsidian console (Ctrl/Cmd + Shift + I) for detailed error messages

## Privacy & Security

- Your API key is stored locally in Obsidian's plugin data
- Communications with Pouch are made over HTTPS (ensure your Pouch instance uses HTTPS)
- No data is sent to any third-party services
- Only the current note's title and content are sent to your Pouch instance

## Development

### Project Structure

```
integrations/obsidian-plugin/
├── main.ts              # Main plugin code
├── manifest.json        # Plugin metadata
├── package.json         # NPM dependencies
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── versions.json        # Version compatibility
└── README.md           # This file
```

### Building

```bash
npm install          # Install dependencies
npm run build        # Build for production
npm run dev          # Build for development (watch mode)
```

### Testing

To test the plugin:

1. Build the plugin using `npm run build`
2. Copy `main.js` and `manifest.json` to your test vault's plugins folder
3. Reload Obsidian
4. Enable the plugin
5. Configure your Pouch URL and API key
6. Try publishing a test note

## API Reference

The plugin uses the Pouch API endpoint:

```
POST /php/api_create_post.php
```

Parameters sent:
- `api_key`: Your authentication key
- `title`: Note title (filename)
- `markdown`: Markdown content
- `slug`: URL-friendly post identifier
- `publish_internal`: "1" or "0" (internal visibility)
- `publish_public`: "1" or "0" (public visibility)
- `excerpt`: "1" or "0" (show only first 50 words publicly)
- `hidden`: "1" or "0" (exclude from listings but shareable via URL)
- `tags`: Comma-separated tag list (optional)
- `post_template`: Custom template name (optional)

Response includes:
- `status`: "success" or error information
- `filename_base`: The generated filename
- `internal_url`: Path to the internal view
- `public_url`: Path to the public view (if published publicly)


## Contributing

Contributions are welcome! If you find a bug or have a feature request:

1. Check existing issues or create a new one
2. Fork the plugin repository at https://github.com/nibl/obsidian-pouch-publisher
3. Make your changes
4. Submit a pull request

## License

MIT License - See the main Pouch repository for details.

## Support

For issues or questions:
- Search first if your issue or question is already logged in the [Plugin issues on GitHub](https://github.com/nibl/obsidian-pouch-publisher/issues)
- Open an issue in the Pouch repository

## Changelog

### Version 0.8.0 (Current - Beta)
- **Beta Release**: Plugin is now in beta testing phase
- Audio post support with podcast RSS integration
- Publishing log with detailed history
- Multiple Publishing Destinations (up to 5 instances)
- Document Properties (Frontmatter tracking)
- Status Indicators (Status bar and document title icons)



