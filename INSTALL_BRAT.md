# Quick Start - Beta Testing with BRAT

This guide explains how to install the Pouch Publisher plugin for beta testing using the BRAT (Beta Reviewers Auto-update Tester) plugin.

## What is BRAT?

BRAT is an Obsidian plugin that allows you to easily install and test beta versions of plugins directly from GitHub repositories. It automatically checks for updates and keeps your beta plugins current.

## Prerequisites

Before you begin, you need:
- An active Pouch account
- A Pouch API key (see [Getting Your API Key](#getting-your-pouch-api-key) below)

## Step 1: Install BRAT

1. Open Obsidian Settings (gear icon ⚙️)
2. Go to **Community plugins**
3. Click **Browse** to open the Community Plugins browser
4. Search for **"BRAT"** (Beta Reviewers Auto-update Tester)
5. Click **Install**
6. After installation, click **Enable**

## Step 2: Add Pouch Publisher via BRAT

1. Open Obsidian Settings
2. Navigate to **Community plugins** → **BRAT**
3. Click **Add Beta plugin**
4. In the popup, enter the GitHub repository URL:
   https://github.com/nibl/obsidian-pouch-publisher
5. Click **Add Plugin**
6. BRAT will download and install the Pouch Publisher plugin
7. When prompted, click **Enable** to activate the plugin

## Step 3: Configure Pouch Publisher

1. Still in Settings, find **Pouch Publisher** under Community plugins
2. Click on it to open the plugin settings
3. Configure your publishing destinations:

### Adding Your First Destination

1. The plugin supports up to 5 different Pouch instances
2. Click the **Add Destination** button
3. Fill in the following:
   - **Shortname**: A brief identifier (max 7 characters, no spaces) - e.g., "blog", "main"
   - **Pouch URL**: Your Pouch instance URL (e.g., `https://mysubdomain.pouch.website`, or your custom domain)
   - **API Key**: Your Pouch API key (see below for how to get this)

### Getting Your Pouch API Key

1. Log in to your Pouch instance in a web browser
2. Click Dashboard in the menu in the top right.
3. Look for the **API Keys** section
4. Click **Generate API Key** or **Create New Key**
5. Copy the key (save it securely - you won't see it again!)
6. Paste it into the Obsidian plugin settings

**Important**: Keep your API key secure and never share it publicly.

## Step 4: Start Publishing!

Once configured, you have two ways to publish:

### Method 1: One-Click Publishing

1. Open any note you want to publish
2. Click **Publish to Pouch (One-Click)** in the left sidebar ribbon, select it in the menu
3. The note will be published with your saved preferences
4. You'll see a success dialog with the post URL

### Method 2: Publish with Options

1. Open any note you want to publish
2. Click **Publish to Pouch with Options** in the left sidebar ribbon, or select it in the menu
3. Configure publishing options:
   - Select publishing destination
   - Set post visibility (Internal, Public, Excerpt, Hidden)
   - Add tags
   - Set custom template
   - Choose whether to include audio in podcast RSS (if applicable)
4. Click **Publish**
5. You'll see a success dialog with the post URL

### Command Palette

You can also use the command palette:
1. Press `Ctrl/Cmd + P`
2. Type "Publish to Pouch"
3. Choose either:
   - **Publish current note to Pouch (One-Click)**
   - **Publish to Pouch with Options**

## Publishing Audio Posts

Pouch Publisher automatically detects and uploads embedded audio files:

1. Embed audio in your note using Obsidian syntax:
   - `![[recording.mp3]]` (Obsidian-style)
   - `![](recording.mp3)` (Markdown-style)

2. When you publish, the plugin will:
   - Detect the first audio file (up to 70 MB)
   - Upload it to your Pouch instance
   - Remove the audio embed from the published content
   - Display the audio with Pouch's built-in player

3. For podcast episodes, check **"Include in Podcast RSS Feed"** in the publishing options dialog

**Supported formats**: MP3, M4A, WAV, OGG, WebM, FLAC, AAC

## Beta Testing Updates

BRAT automatically checks for updates to beta plugins:

- Updates are checked when Obsidian starts
- You can manually check for updates in BRAT settings
- When an update is available, BRAT will download and install it automatically
- You'll be notified when updates are installed

To manually check for updates:
1. Go to Settings → Community plugins → BRAT
2. Click **Check for updates**
3. Any available updates will be downloaded and installed

## Troubleshooting

### "Please configure Pouch URL and API Key in settings"
- Make sure you've added at least one destination in the plugin settings
- Verify both the URL and API key are filled in

### "Authentication failed"
- Check that your API key is correct (copy it again from Pouch)
- Ensure you're using the correct Pouch URL
- Verify the API key hasn't expired

### "No active file to publish"
- Make sure you have a note open and active in the editor
- Click on the note to ensure it's the active file

### BRAT plugin not appearing in settings
- Make sure you enabled BRAT after installing it
- Try reloading Obsidian (Settings → Community plugins → Reload)

### Pouch Publisher not installing via BRAT
- Check your internet connection
- Verify the repository URL is correct: https://github.com/nibl/obsidian-pouch-publisher
- Try removing and re-adding the plugin in BRAT settings

## Getting Help

If you encounter issues during beta testing:

1. Check the Obsidian console for errors (Ctrl/Cmd + Shift + I)
2. Report bugs and questions at https://github.com/nibl/obsidian-pouch-publisher/issues

## Beta Testing Feedback

Your feedback is valuable! When testing, please note:
- Any bugs or unexpected behavior
- Features that work well
- Features that could be improved
- Documentation that's unclear or missing

Report feedback through:
- GitHub issues in the Plugin repository


