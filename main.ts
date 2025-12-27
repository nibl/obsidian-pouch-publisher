import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, Modal } from 'obsidian';

interface PublishLogEntry {
	timestamp: string;
	title: string;
	slug: string;
	url: string;
	success: boolean;
	errorCode?: string;
	errorMessage?: string;
}

interface DebugLogEntry {
	timestamp: string;
	type: 'request' | 'response' | 'error' | 'info';
	endpoint?: string;
	method?: string;
	requestData?: any;
	responseStatus?: number;
	responseBody?: any;
	errorDetails?: any;
	message: string;
}

interface PublishedPostMapping {
	filePath: string;
	filenameBase: string;
	lastPublished: string;
}

interface PouchDestination {
	name: string;  // shortname (max 7 chars, no spaces)
	url: string;   // Pouch URL
	apiKey: string; // API key for this destination
	magazineMode: boolean; // Whether this destination uses magazine mode
}

interface PouchPublisherSettings {
	// Legacy settings (for migration)
	pouchUrl?: string;
	apiKey?: string;
	// New: Multiple destinations
	destinations: PouchDestination[];
	selectedDestinationIndex: number;
	// Publishing preferences
	publishInternal: boolean;
	publishPublic: boolean;
	publishExcerpt: boolean;
	publishHidden: boolean;
	defaultTags: string;
	defaultTemplate: string;
	rememberSettings: boolean;
	// Ribbon icon visibility
	showOneClickIcon: boolean;
	showOptionsIcon: boolean;
	// Publishing log
	publishLog: PublishLogEntry[];
	// Track published posts for updates (maps file path to filename_base)
	publishedPosts: Record<string, PublishedPostMapping>;
	// Debug logging
	enableDebugLogging: boolean;
	debugLog: DebugLogEntry[];
	// Audio settings
	includeInPodcast: boolean;
	publishImmediately: boolean;
	enableTranscription: boolean;
}

const DEFAULT_SETTINGS: PouchPublisherSettings = {
	// New: Multiple destinations (empty by default)
	destinations: [],
	selectedDestinationIndex: 0,
	// Default publishing preferences
	publishInternal: true,
	publishPublic: false,
	publishExcerpt: false,
	publishHidden: false,
	defaultTags: '',
	defaultTemplate: '',
	rememberSettings: true,
	// Default ribbon icon visibility
	showOneClickIcon: true,
	showOptionsIcon: true,
	// Empty log by default
	publishLog: [],
	// Empty published posts mapping by default
	publishedPosts: {},
	// Debug logging disabled by default
	enableDebugLogging: false,
	debugLog: [],
	// Audio settings
	includeInPodcast: false,
	publishImmediately: false,
	enableTranscription: true
}

// No custom icon needed - using Lucide's cloud-cog icon instead


export default class PouchPublisherPlugin extends Plugin {
	settings: PouchPublisherSettings;
	oneClickRibbonIcon: HTMLElement | null = null;
	optionsRibbonIcon: HTMLElement | null = null;
	statusBarItem: HTMLElement | null = null;
	
	// Audio file validation constants (matching audio_recorder.js)
	private readonly AUDIO_EXTENSIONS = ['wav', 'mp3', 'm4a', 'caf', 'aac', 'ogg', 'oga', 'flac', 'webm', 'opus', 'aif', 'aiff', 'amr'];
	private readonly VIDEO_EXTENSIONS = ['m4v', 'mp4', 'mov', 'avi', 'mkv', '3gp', '3g2'];
	
	// Cached regex pattern for audio embed removal (performance optimization)
	private audioEmbedPattern: RegExp | null = null;
	
	// AI transcript improvement defaults (matching Pouch server defaults)
	static readonly DEFAULT_AI_MODEL = 'mistral-ai/mistral-small-2503';
	static readonly DEFAULT_AI_PROVIDER = 'github-models';
	
	// MIME type mapping for audio files
	private readonly MIME_TYPES: Record<string, string> = {
		'wav': 'audio/wav',
		'mp3': 'audio/mpeg',
		'm4a': 'audio/mp4',
		'caf': 'audio/x-caf',
		'aac': 'audio/aac',
		'ogg': 'audio/ogg',
		'oga': 'audio/ogg',
		'flac': 'audio/flac',
		'webm': 'audio/webm',
		'opus': 'audio/opus',
		'aif': 'audio/aiff',
		'aiff': 'audio/aiff',
		'amr': 'audio/amr'
	};

	async onload() {
		await this.loadSettings();

		// Add status bar item
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('pouch-status-bar');
		
		// Register event to update status bar when active file changes
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				this.updateStatusBar(file);
				this.updateFileTitle(file);
			})
		);
		
		// Register event to update title decoration when switching panes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				const file = this.app.workspace.getActiveFile();
				this.updateFileTitle(file);
			})
		);
		
		// Register event to update when metadata changes (e.g., frontmatter update)
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && file.path === activeFile.path) {
					this.updateStatusBar(file);
					this.updateFileTitle(file);
				}
			})
		);
		
		// Initial status bar and title update
		this.updateStatusBar(this.app.workspace.getActiveFile());
		this.updateFileTitle(this.app.workspace.getActiveFile());

		// Add ribbon icons based on settings
		this.updateRibbonIcons();

		// Add command to publish current note (one-click)
		this.addCommand({
			id: 'publish-to-pouch',
			name: 'Publish current note to Pouch (One-Click)',
			callback: async () => {
				await this.publishCurrentNote();
			}
		});

		// Add command to publish with options
		this.addCommand({
			id: 'publish-to-pouch-with-options',
			name: 'Publish to Pouch with Options',
			callback: async () => {
				await this.publishWithOptions();
			}
		});

		// Add settings tab
		this.addSettingTab(new PouchPublisherSettingTab(this.app, this));
	}

	updateRibbonIcons() {
		// Remove existing icons
		if (this.oneClickRibbonIcon) {
			this.oneClickRibbonIcon.remove();
			this.oneClickRibbonIcon = null;
		}
		if (this.optionsRibbonIcon) {
			this.optionsRibbonIcon.remove();
			this.optionsRibbonIcon = null;
		}

		// Add one-click icon if enabled
		if (this.settings.showOneClickIcon) {
			this.oneClickRibbonIcon = this.addRibbonIcon('upload-cloud', 'Publish to Pouch (One-Click)', async (evt: MouseEvent) => {
				await this.publishCurrentNote();
			});
			this.oneClickRibbonIcon.addClass('pouch-publisher-ribbon-class');
		}

		// Add options icon if enabled
		if (this.settings.showOptionsIcon) {
			this.optionsRibbonIcon = this.addRibbonIcon('cloud-cog', 'Publish to Pouch with Options', async (evt: MouseEvent) => {
				await this.publishWithOptions();
			});
			this.optionsRibbonIcon.addClass('pouch-publisher-options-ribbon-class');
		}
	}

	updateStatusBar(file: TFile | null) {
		if (!this.statusBarItem) return;

		if (!file) {
			this.statusBarItem.setText('');
			this.statusBarItem.style.display = 'none';
			return;
		}

		// Check if this file has frontmatter with publishing info
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		
		if (frontmatter && frontmatter.pouch_destination) {
			const destination = frontmatter.pouch_destination;
			const url = frontmatter.pouch_url || '';
			
			// Show status with icon and destination
			this.statusBarItem.setText(`📤 ${destination}`);
			this.statusBarItem.style.display = 'inline-block';
			this.statusBarItem.style.cursor = 'pointer';
			
			// Clear previous click handler
			this.statusBarItem.onclick = null;
			
			// Add click handler to open publish options
			this.statusBarItem.onclick = async () => {
				await this.publishWithOptions();
			};
			
			// Add tooltip
			this.statusBarItem.setAttribute('aria-label', `Published to ${destination}${url ? ': ' + url : ''}`);
		} else {
			this.statusBarItem.setText('');
			this.statusBarItem.style.display = 'none';
		}
	}

	updateFileTitle(file: TFile | null) {
		// Remove any existing pouch status icons from all view titles
		const existingIcons = document.querySelectorAll('.pouch-publish-status-icon');
		existingIcons.forEach(icon => icon.remove());
		
		if (!file) return;

		// Check if this file has frontmatter with publishing info
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		
		if (frontmatter && frontmatter.pouch_destination) {
			// Find the active view title element
			const activeLeaf = this.app.workspace.activeLeaf;
			if (!activeLeaf) return;
			
			// Get the view title container
			const viewHeaderTitle = activeLeaf.view.containerEl.querySelector('.view-header-title');
			if (!viewHeaderTitle) return;
			
			// Create and prepend the publish status icon
			const icon = document.createElement('span');
			icon.classList.add('pouch-publish-status-icon');
			icon.textContent = '📤 ';
			icon.style.marginRight = '4px';
			icon.setAttribute('aria-label', `Published to ${frontmatter.pouch_destination}`);
			
			// Insert at the beginning of the title
			viewHeaderTitle.insertBefore(icon, viewHeaderTitle.firstChild);
		}
	}

	getSelectedDestination(): PouchDestination | null {
		if (this.settings.destinations.length === 0) {
			return null;
		}
		const index = Math.min(this.settings.selectedDestinationIndex, this.settings.destinations.length - 1);
		return this.settings.destinations[index];
	}

	async publishCurrentNote() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile) {
			new Notice('No active file to publish');
			return;
		}

		// Validate settings
		const destination = this.getSelectedDestination();
		if (!destination) {
			new Notice('Please configure at least one Pouch destination in settings');
			return;
		}

		try {
			// Get the file content (markdown)
			let content = await this.app.vault.read(activeFile);
			
			// Get the title from the file name (without extension)
			const title = activeFile.basename;

			// Generate slug from title
			const slug = this.generateSlug(title);

			// Check if this file has been published before
			const filePath = activeFile.path;
			const existingPost = this.settings.publishedPosts[filePath];
			
			let isUpdate = false;
			if (existingPost && existingPost.filenameBase) {
				isUpdate = true;
				new Notice('Updating existing post in Pouch...');
				console.log('[Pouch Publisher] Updating existing post with filename_base:', existingPost.filenameBase);
			} else {
				new Notice('Publishing to Pouch...');
				console.log('[Pouch Publisher] Starting one-click publish for:', title);
			}

			// Detect audio file in content (before removing embeds)
			let audioFilename: string | null = null;
			const audioPath = this.detectAudioFile(content);
			
			// Remove audio file embeds from content before sending to Pouch
			content = this.removeAudioEmbeds(content);
			
			if (audioPath) {
				new Notice('Preparing audio for upload...');
				console.log('[Pouch Publisher] Detected audio file:', audioPath);
				
				// Resolve audio file
				const audioFile = await this.resolveAudioFile(audioPath, activeFile);
				
				if (!audioFile) {
					new ErrorModal(
						this.app,
						'Audio File Not Found',
						`Audio file not found: ${audioPath}. Please ensure the file exists in your vault.`
					).open();
					
					this.addToPublishLog({
						timestamp: new Date().toISOString(),
						title: title,
						slug: slug,
						url: '',
						success: false,
						errorMessage: `Audio file not found: ${audioPath}`
					});
					return;
				}
				
				// Validate audio file
				const validation = await this.validateAudioFile(audioFile);
				if (!validation.valid) {
					new ErrorModal(this.app, 'Invalid Audio File', validation.error || 'Unknown validation error').open();
					
					this.addToPublishLog({
						timestamp: new Date().toISOString(),
						title: title,
						slug: slug,
						url: '',
						success: false,
						errorMessage: validation.error
					});
					return;
				}
				
				// Upload audio file
				try {
					audioFilename = await this.uploadAudioFile(audioFile, slug, destination);
					console.log('[Pouch Publisher] Audio uploaded, filename:', audioFilename);
				} catch (error) {
					new ErrorModal(
						this.app,
						'Audio Upload Failed',
						`Failed to upload audio: ${error.message}`
					).open();
					
					this.addToPublishLog({
						timestamp: new Date().toISOString(),
						title: title,
						slug: slug,
						url: '',
						success: false,
						errorMessage: `Audio upload failed: ${error.message}`
					});
					return;
				}
			}

			// Build publish options
			// Derive editing_status from publish flags to ensure consistency in magazine mode
			let editingStatus = 'draft';
			if (this.settings.publishPublic) {
				editingStatus = 'submission'; // Request publication
			} else if (this.settings.publishInternal) {
				editingStatus = 'feedback'; // Share internally
			}
			
			const publishOptions: any = {
				title: title,
				slug: slug,
				markdown: content,
				publish_internal: this.settings.publishInternal ? '1' : '0',
				publish_public: this.settings.publishPublic ? '1' : '0',
				excerpt: this.settings.publishExcerpt ? '1' : '0',
				hidden: this.settings.publishHidden ? '1' : '0',
				tags: this.settings.defaultTags,
				post_template: this.settings.defaultTemplate,
				editing_status: editingStatus,
				shortname: destination.name // Send shortname for API logging
			};
			
			// If this is an update, include the filename_base
			if (isUpdate && existingPost.filenameBase) {
				publishOptions.filename_base = existingPost.filenameBase;
			}
			
			// Add audio metadata if audio was uploaded
			if (audioFilename) {
				publishOptions.audio_file = audioFilename;
				publishOptions.include_in_podcast = this.settings.includeInPodcast ? '1' : '0';
				publishOptions.publish_immediately = this.settings.publishImmediately ? '1' : '0';
			}

			console.log('[Pouch Publisher] Publishing with options:', publishOptions);

			const result = await this.sendToPouch(publishOptions, destination);
			
			if (result.success) {
				// Store or update the filename_base mapping
				if (result.response && result.response.filename_base) {
					this.settings.publishedPosts[filePath] = {
						filePath: filePath,
						filenameBase: result.response.filename_base,
						lastPublished: new Date().toISOString()
					};
					await this.saveSettings();
					console.log('[Pouch Publisher] Stored filename_base for future updates:', result.response.filename_base);
				}
				
				// Update frontmatter with publishing info including editing status
				const url = this.getPostUrl(result.response, publishOptions, destination);
				await this.updateFrontmatter(activeFile, destination.name, url, publishOptions.editing_status);
				
				// Update status bar and title
				this.updateStatusBar(activeFile);
				this.updateFileTitle(activeFile);
				
				// Log successful publish
				this.addToPublishLog({
					timestamp: new Date().toISOString(),
					title: title,
					slug: slug,
					url: url,
					success: true
				});
				
				// Trigger transcription if audio was uploaded and transcription is enabled
				if (audioFilename && this.settings.enableTranscription) {
					await this.triggerTranscription(audioFilename, slug, destination);
				} else if (audioFilename && !this.settings.enableTranscription) {
					new Notice('Post saved! Transcription skipped as requested.');
				}
				
				await this.showSuccessDialog(result.response, publishOptions, destination);
			} else {
				// Log failed publish
				this.addToPublishLog({
					timestamp: new Date().toISOString(),
					title: title,
					slug: slug,
					url: '',
					success: false,
					errorMessage: result.error
				});
			}
		} catch (error) {
			// Log exception
			this.addToPublishLog({
				timestamp: new Date().toISOString(),
				title: activeFile?.basename || 'Unknown',
				slug: '',
				url: '',
				success: false,
				errorMessage: error.message
			});
			
			new Notice(`Error publishing to Pouch: ${error.message}`);
			console.error('[Pouch Publisher] Publish error:', error);
		}
	}

	async publishWithOptions() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile) {
			new Notice('No active file to publish');
			return;
		}

		// Validate settings
		if (this.settings.destinations.length === 0) {
			new Notice('Please configure at least one Pouch destination in settings');
			return;
		}

		// Get the file content (markdown)
		const content = await this.app.vault.read(activeFile);
		
		// Get the title from the file name (without extension)
		const title = activeFile.basename;

		// Open the publishing options modal with file info
		// The modal will handle audio detection and embed removal
		new PublishOptionsModal(this.app, this, activeFile, title, content).open();
	}

	/**
	 * Remove audio file embeds from markdown content
	 * Removes: ![[audio.mp3]] embed syntax
	 * Keeps: [[audio.mp3]] wiki links and [text](audio.mp3) markdown links
	 * 
	 * @param content The markdown content to clean
	 * @return The cleaned content with audio embeds removed
	 */
	removeAudioEmbeds(content: string): string {
		// Compile pattern once and cache it for performance
		if (!this.audioEmbedPattern) {
			const extensionPattern = this.AUDIO_EXTENSIONS.join('|');
			this.audioEmbedPattern = new RegExp(`!\\[\\[([^\\]]+\\.(${extensionPattern}))\\]\\]`, 'gi');
		}
		
		// Remove Obsidian embed syntax ![[file.ext]]
		content = content.replace(this.audioEmbedPattern, '');
		
		// Note: We keep [[file.ext]] wiki links as they might be intentional links
		// and [text](file.ext) markdown links as they could be download links
		
		// Reset lastIndex to avoid issues with global regex
		this.audioEmbedPattern.lastIndex = 0;
		
		return content;
	}

	/**
	 * Detect audio file embeds in markdown content
	 * Looks for: ![[audio.mp3]], [[audio.mp3]], [text](audio.mp3)
	 * Returns the first audio file path found, or null
	 */
	detectAudioFile(content: string): string | null {
		const extensionPattern = this.AUDIO_EXTENSIONS.join('|');
		
		// Pattern 1: Obsidian embed syntax ![[file.ext]]
		const embedPattern = new RegExp(`!\\[\\[([^\\]]+\\.(${extensionPattern}))\\]\\]`, 'i');
		let match = content.match(embedPattern);
		if (match) {
			return match[1];
		}
		
		// Pattern 2: Obsidian wiki link [[file.ext]]
		const wikiPattern = new RegExp(`\\[\\[([^\\]]+\\.(${extensionPattern}))\\]\\]`, 'i');
		match = content.match(wikiPattern);
		if (match) {
			return match[1];
		}
		
		// Pattern 3: Standard markdown link [text](file.ext)
		const mdPattern = new RegExp(`\\[([^\\]]+)\\]\\(([^)]+\\.(${extensionPattern}))\\)`, 'i');
		match = content.match(mdPattern);
		if (match) {
			return match[2];
		}
		
		return null;
	}

	/**
	 * Validate audio file
	 * Checks extension, MIME type, and size
	 */
	async validateAudioFile(file: TFile): Promise<{valid: boolean, error?: string}> {
		const extension = file.extension.toLowerCase();
		
		// Check video blocklist first
		if (this.VIDEO_EXTENSIONS.includes(extension)) {
			return {
				valid: false,
				error: 'Video files are not allowed. Please select an audio file (e.g., MP3, WAV, M4A, OGG, FLAC).'
			};
		}
		
		// Check audio allowlist
		if (!this.AUDIO_EXTENSIONS.includes(extension)) {
			return {
				valid: false,
				error: 'Please select a valid audio file (e.g., MP3, WAV, M4A, OGG, FLAC).'
			};
		}
		
		// Check file size (25 MB limit)
		const maxSize = 25 * 1024 * 1024; // 25 MB
		const stat = await this.app.vault.adapter.stat(file.path);
		if (stat && stat.size > maxSize) {
			const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
			return {
				valid: false,
				error: `File size (${sizeMB} MB) exceeds the 25 MB limit. Please select a smaller file.`
			};
		}
		
		return {valid: true};
	}

	/**
	 * Resolve audio file path relative to the current note
	 */
	async resolveAudioFile(audioPath: string, currentFile: TFile): Promise<TFile | null> {
		try {
			// Try to get the file directly (handles vault-absolute paths)
			let audioFile = this.app.vault.getAbstractFileByPath(audioPath);
			
			// If not found, try relative to current file's directory
			if (!audioFile) {
				const currentDir = currentFile.parent?.path || '';
				const relativePath = currentDir ? `${currentDir}/${audioPath}` : audioPath;
				audioFile = this.app.vault.getAbstractFileByPath(relativePath);
			}
			
			// Check if it's a file (not a folder)
			if (audioFile instanceof TFile) {
				return audioFile;
			}
			
			return null;
		} catch (error) {
			console.error('[Pouch Publisher] Error resolving audio file:', error);
			return null;
		}
	}

	/**
	 * Upload audio file to Pouch
	 * Returns the filename if successful, or throws an error
	 */
	async uploadAudioFile(audioFile: TFile, slug: string, destination: PouchDestination, removeSilence: boolean = false): Promise<string> {
		try {
			// Read audio file as binary
			const audioData = await this.app.vault.readBinary(audioFile);
			
			// Get file size for status message
			const sizeMB = (audioData.byteLength / (1024 * 1024)).toFixed(2);
			new Notice(`Uploading audio file (${sizeMB} MB)...`);
			
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'info',
				message: `Uploading audio file: ${audioFile.name} (${sizeMB} MB)`
			});
			
			// Create multipart form data manually
			const boundary = '----ObsidianFormBoundary' + Math.random().toString(36).substring(2);
			const parts: Uint8Array[] = [];
			
			// Helper to add string part
			const addPart = (name: string, value: string) => {
				const encoder = new TextEncoder();
				parts.push(encoder.encode(`--${boundary}\r\n`));
				parts.push(encoder.encode(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
				parts.push(encoder.encode(`${value}\r\n`));
			};
			
			// Add form fields
			addPart('filename_base', slug);
			addPart('api_key', destination.apiKey);
			addPart('remove_silence', removeSilence ? 'true' : 'false');
			
			// Add audio file with proper MIME type based on extension
			const mimeType = this.MIME_TYPES[audioFile.extension.toLowerCase()] || 'audio/mpeg';
			const encoder = new TextEncoder();
			parts.push(encoder.encode(`--${boundary}\r\n`));
			parts.push(encoder.encode(`Content-Disposition: form-data; name="audio"; filename="${audioFile.name}"\r\n`));
			parts.push(encoder.encode(`Content-Type: ${mimeType}\r\n\r\n`));
			parts.push(new Uint8Array(audioData));
			parts.push(encoder.encode(`\r\n`));
			
			// Add closing boundary
			parts.push(encoder.encode(`--${boundary}--\r\n`));
			
			// Combine all parts
			const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
			const body = new Uint8Array(totalLength);
			let offset = 0;
			for (const part of parts) {
				body.set(part, offset);
				offset += part.length;
			}
			
			// Upload audio
			const uploadUrl = destination.url.replace(/\/$/, '') + '/modules/audio_recording/upload_audio.php';
			
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'request',
				endpoint: uploadUrl,
				method: 'POST',
				message: 'Uploading audio to server'
			});
			
			const response = await requestUrl({
				url: uploadUrl,
				method: 'POST',
				body: body.buffer,
				headers: {
					'Content-Type': `multipart/form-data; boundary=${boundary}`
				}
			});
			
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'response',
				endpoint: uploadUrl,
				responseStatus: response.status,
				responseBody: response.json,
				message: `Audio upload response: ${response.status}`
			});
			
			if (response.status === 200) {
				const result = response.json;
				if (result.success && result.filename) {
					new Notice('Audio uploaded successfully. Saving post...');
					return result.filename;
				} else {
					throw new Error(result.error || 'Audio upload failed');
				}
			} else {
				const errorMsg = response.json?.error || `HTTP ${response.status}`;
				throw new Error(errorMsg);
			}
		} catch (error) {
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'error',
				errorDetails: {
					name: error.name,
					message: error.message
				},
				message: `Audio upload error: ${error.message}`
			});
			throw error;
		}
	}

	/**
	 * Trigger transcription for uploaded audio
	 * @param audioFilename - The filename of the uploaded audio
	 * @param slug - The slug of the post
	 * @param destination - The Pouch destination
	 * @param aiModel - Optional AI model to use for transcript improvement (e.g., 'mistral-ai/mistral-small-2503')
	 * @param aiProvider - Optional AI provider to use for transcript improvement (e.g., 'github-models')
	 */
	async triggerTranscription(audioFilename: string, slug: string, destination: PouchDestination, aiModel?: string, aiProvider?: string): Promise<void> {
		try {
			const formData = new URLSearchParams();
			formData.append('audio_filename', audioFilename);
			formData.append('json_filename', slug + '.json');
			formData.append('api_key', destination.apiKey);
			
			// Add AI model and provider if specified for LLM transcript improvement
			if (aiModel) {
				formData.append('ai_model', aiModel);
			}
			if (aiProvider) {
				formData.append('ai_provider', aiProvider);
			}
			
			const transcribeUrl = destination.url.replace(/\/$/, '') + '/modules/transcription/trigger_transcription.php';
			
			const logMessage = aiModel && aiProvider 
				? 'Triggering audio transcription with AI improvement' 
				: 'Triggering audio transcription';
			
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'request',
				endpoint: transcribeUrl,
				method: 'POST',
				message: logMessage
			});
			
			const response = await requestUrl({
				url: transcribeUrl,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: formData.toString()
			});
			
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'response',
				endpoint: transcribeUrl,
				responseStatus: response.status,
				responseBody: response.json,
				message: `Transcription trigger response: ${response.status}`
			});
			
			if (response.status === 200 && response.json?.success) {
				const noticeText = aiModel && aiProvider 
					? 'Post saved! Transcription started with AI improvement.'
					: 'Post saved! Transcription started in background.';
				new Notice(noticeText);
			} else {
				// Don't fail the post save if transcription fails
				console.warn('[Pouch Publisher] Transcription trigger failed:', response.json?.error);
				new Notice('Post saved! Transcription may have failed to start.');
			}
		} catch (error) {
			// Don't fail the post save if transcription fails
			console.warn('[Pouch Publisher] Transcription error:', error);
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'error',
				errorDetails: {
					name: error.name,
					message: error.message
				},
				message: `Transcription error: ${error.message}`
			});
		}
	}

	async sendToPouch(options: any, destination: PouchDestination): Promise<{success: boolean, response?: any, error?: string, statusCode?: number}> {
		try {
			// Prepare the API request
			const formData = new URLSearchParams();
			formData.append('api_key', destination.apiKey);
			
			// Add all options to the form data
			for (const key in options) {
				if (options[key] !== '' && options[key] !== undefined && options[key] !== null) {
					formData.append(key, options[key]);
				}
			}

			console.log('[Pouch Publisher] Sending to API endpoint');
			console.log('[Pouch Publisher] API URL:', destination.url);
			console.log('[Pouch Publisher] Form data keys:', Object.keys(Object.fromEntries(formData.entries())));

			// Make the API request
			const apiUrl = destination.url.replace(/\/$/, '') + '/php/api_create_post.php';
			console.log('[Pouch Publisher] Full API URL:', apiUrl);
			
			// Log request details for debugging
			const requestData = Object.fromEntries(formData.entries());
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'request',
				endpoint: apiUrl,
				method: 'POST',
				requestData: this.sanitizeForLogging(requestData),
				message: 'Sending API request to Pouch'
			});
			
			const response = await requestUrl({
				url: apiUrl,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: formData.toString()
			});

			console.log('[Pouch Publisher] API response status:', response.status);
			console.log('[Pouch Publisher] API response body:', response.json);
			
			// Log response details for debugging
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'response',
				endpoint: apiUrl,
				responseStatus: response.status,
				responseBody: response.json,
				message: `Received API response with status ${response.status}`
			});

			if (response.status === 200) {
				const result = response.json;
				if (result.status === 'success') {
					console.log('[Pouch Publisher] API request successful');
					this.addToDebugLog({
						timestamp: new Date().toISOString(),
						type: 'info',
						message: 'API request successful',
						responseBody: result
					});
					return { success: true, response: result };
				} else {
					const errorMsg = result.error || result.message || 'Unknown error';
					console.error('[Pouch Publisher] API returned error status:', result.status);
					console.error('[Pouch Publisher] API error message:', errorMsg);
					
					this.addToDebugLog({
						timestamp: new Date().toISOString(),
						type: 'error',
						responseStatus: 200,
						responseBody: result,
						message: `API returned error: ${errorMsg}`
					});
					
					new ErrorModal(this.app, 'Publish Failed', errorMsg).open();
					return { success: false, error: errorMsg };
				}
			} else {
				// Handle non-200 HTTP responses
				const result = response.json;
				const errorMsg = result.error || result.message || `HTTP ${response.status}`;
				console.error('[Pouch Publisher] HTTP error status:', response.status);
				console.error('[Pouch Publisher] HTTP error response:', result);
				
				// Parse status code from error response if available
				let statusCode = response.status;
				if (result.status && typeof result.status === 'string' && result.status.startsWith('ERROR_')) {
					const code = parseInt(result.status.replace('ERROR_', ''));
					if (!isNaN(code)) {
						statusCode = code;
					}
				}
				
				this.addToDebugLog({
					timestamp: new Date().toISOString(),
					type: 'error',
					responseStatus: statusCode,
					responseBody: result,
					message: `HTTP error ${statusCode}: ${errorMsg}`
				});
				
				new ErrorModal(this.app, `Publish Failed (HTTP ${statusCode})`, errorMsg).open();
				return { success: false, error: errorMsg, statusCode: statusCode };
			}
		} catch (error) {
			console.error('[Pouch Publisher] Network/request exception:', error);
			console.error('[Pouch Publisher] Exception details:', {
				name: error.name,
				message: error.message,
				stack: error.stack
			});
			
			this.addToDebugLog({
				timestamp: new Date().toISOString(),
				type: 'error',
				errorDetails: {
					name: error.name,
					message: error.message,
					stack: error.stack
				},
				message: `Network/request exception: ${error.message}`
			});
			
			new ErrorModal(this.app, 'Network Error', error.message).open();
			return { success: false, error: error.message };
		}
	}

	async showSuccessDialog(apiResponse: any, publishOptions: any, destination: PouchDestination) {
		const url = this.getPostUrl(apiResponse, publishOptions, destination);
		const isPublic = publishOptions.publish_public === '1';
		const isHidden = publishOptions.hidden === '1';
		const urlType = isPublic ? (isHidden ? 'Hidden Post URL' : 'Public Post URL') : 'Internal Post URL';

		if (url) {
			new SuccessModal(this.app, url, urlType).open();
		} else {
			new Notice('✓ Published successfully to Pouch!');
			console.log('[Pouch Publisher] Published successfully, no URL available');
		}
	}

	getPostUrl(apiResponse: any, publishOptions: any, destination: PouchDestination): string {
		const isPublic = publishOptions.publish_public === '1';
		const baseUrl = destination.url.replace(/\/$/, '');
		
		let url = '';
		if (isPublic && apiResponse.public_url) {
			url = baseUrl + apiResponse.public_url;
			console.log('[Pouch Publisher] Constructed public URL:', url);
		} else if (apiResponse.internal_url) {
			url = baseUrl + apiResponse.internal_url;
			console.log('[Pouch Publisher] Constructed internal URL:', url);
		}
		
		return url;
	}

	generateSlug(title: string): string {
		// Convert title to URL-friendly slug
		return title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-/, '')
			.replace(/-$/, '');
	}

	/**
	 * Add entry to debug log if debug logging is enabled
	 */
	addToDebugLog(entry: DebugLogEntry) {
		if (!this.settings.enableDebugLogging) {
			return;
		}
		
		// Add new entry to the beginning of the log
		this.settings.debugLog.unshift(entry);
		
		// Keep only the last 50 entries to prevent excessive memory usage
		if (this.settings.debugLog.length > 50) {
			this.settings.debugLog = this.settings.debugLog.slice(0, 50);
		}
		
		// Save settings with updated log
		this.saveSettings();
		
		console.log('[Pouch Publisher Debug]', entry);
	}

	/**
	 * Sanitize sensitive data for logging
	 */
	sanitizeForLogging(data: any): any {
		if (!data) return data;
		
		const sanitized = { ...data };
		
		// Remove sensitive fields
		if (sanitized.api_key) {
			sanitized.api_key = '[REDACTED]';
		}
		
		// Truncate large content fields
		if (sanitized.content && sanitized.content.length > 500) {
			sanitized.content = sanitized.content.substring(0, 500) + `... [truncated, total length: ${sanitized.content.length}]`;
		}
		if (sanitized.markdown && sanitized.markdown.length > 500) {
			sanitized.markdown = sanitized.markdown.substring(0, 500) + `... [truncated, total length: ${sanitized.markdown.length}]`;
		}
		
		return sanitized;
	}

	addToPublishLog(entry: PublishLogEntry) {
		// Add new entry to the beginning of the log
		this.settings.publishLog.unshift(entry);
		
		// Keep only the last 100 entries
		if (this.settings.publishLog.length > 100) {
			this.settings.publishLog = this.settings.publishLog.slice(0, 100);
		}
		
		// Save settings with updated log
		this.saveSettings();
		
		console.log('[Pouch Publisher] Log entry added:', entry);
	}

	async updateFrontmatter(file: TFile, destinationName: string, url: string, editingStatus?: string) {
		try {
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			let hasFrontmatter = false;
			let frontmatterEnd = -1;
			let newFrontmatter: string[] = [];
			
			// Check if file has frontmatter
			if (lines[0] === '---') {
				hasFrontmatter = true;
				for (let i = 1; i < lines.length; i++) {
					if (lines[i] === '---') {
						frontmatterEnd = i;
						break;
					}
				}
			}
			
			if (hasFrontmatter && frontmatterEnd > 0) {
				// Parse existing frontmatter
				const frontmatterLines = lines.slice(1, frontmatterEnd);
				let hasDestination = false;
				let hasUrl = false;
				let hasEditingStatus = false;
				
				// Update existing properties or mark for addition
				for (const line of frontmatterLines) {
					if (line.startsWith('pouch_destination:')) {
						newFrontmatter.push(`pouch_destination: "${destinationName}"`);
						hasDestination = true;
					} else if (line.startsWith('pouch_url:')) {
						newFrontmatter.push(`pouch_url: "${url}"`);
						hasUrl = true;
					} else if (line.startsWith('editing_status:')) {
						if (editingStatus) {
							newFrontmatter.push(`editing_status: "${editingStatus}"`);
						} else {
							newFrontmatter.push(line); // Keep existing value when no new status provided
						}
						hasEditingStatus = true;
					} else {
						newFrontmatter.push(line);
					}
				}
				
				// Add new properties if they don't exist
				if (!hasDestination) {
					newFrontmatter.push(`pouch_destination: "${destinationName}"`);
				}
				if (!hasUrl) {
					newFrontmatter.push(`pouch_url: "${url}"`);
				}
				if (!hasEditingStatus && editingStatus) {
					newFrontmatter.push(`editing_status: "${editingStatus}"`);
				}
				
				// Reconstruct the file
				const newContent = [
					'---',
					...newFrontmatter,
					'---',
					...lines.slice(frontmatterEnd + 1)
				].join('\n');
				
				await this.app.vault.modify(file, newContent);
			} else {
				// Create new frontmatter
				const frontmatterLines = [
					'---',
					`pouch_destination: "${destinationName}"`,
					`pouch_url: "${url}"`
				];
				
				if (editingStatus) {
					frontmatterLines.push(`editing_status: "${editingStatus}"`);
				}
				
				frontmatterLines.push('---');
				
				const newContent = [
					...frontmatterLines,
					...lines
				].join('\n');
				
				await this.app.vault.modify(file, newContent);
			}
			
			console.log('[Pouch Publisher] Updated frontmatter for:', file.path);
		} catch (error) {
			console.error('[Pouch Publisher] Error updating frontmatter:', error);
			new Notice('Warning: Could not update frontmatter');
		}
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		
		// Migrate legacy settings if they exist
		if (this.settings.pouchUrl && this.settings.apiKey) {
			// Only migrate if destinations array is empty
			if (this.settings.destinations.length === 0) {
				this.settings.destinations.push({
					name: 'default',
					url: this.settings.pouchUrl,
					apiKey: this.settings.apiKey,
					magazineMode: false
				});
				this.settings.selectedDestinationIndex = 0;
				
				// Clean up legacy properties
				delete this.settings.pouchUrl;
				delete this.settings.apiKey;
				
				await this.saveSettings();
				console.log('[Pouch Publisher] Migrated legacy settings to destinations');
			}
		}
		
		// Migrate existing destinations to add magazineMode property if missing
		let needsSave = false;
		this.settings.destinations.forEach((dest) => {
			if (dest.magazineMode === undefined) {
				dest.magazineMode = false;
				needsSave = true;
			}
		});
		
		if (needsSave) {
			await this.saveSettings();
			console.log('[Pouch Publisher] Added magazineMode property to existing destinations');
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PublishOptionsModal extends Modal {
	plugin: PouchPublisherPlugin;
	file: TFile;
	title: string;
	content: string;
	
	// Form values
	slug: string;
	tags: string;
	template: string;
	publishInternal: boolean;
	publishPublic: boolean;
	publishExcerpt: boolean;
	publishHidden: boolean;
	rememberSettings: boolean;
	selectedDestinationIndex: number;
	editingStatus: string; // Magazine mode: draft, feedback, submission
	initialEditingStatus: string; // Track initial status for confirmation
	
	// Audio options (only relevant when audio file is detected)
	includeInPodcast: boolean;
	publishImmediately: boolean;
	enableTranscription: boolean; // false = skip transcription
	improveTranscriptWithAI: boolean; // true = use LLM to format transcript
	removeSilence: boolean; // true = remove silence from audio
	hasAudioFile: boolean; // Track if content has embedded audio
	
	// Track if this is an update
	existingFilenameBase: string | null;

	constructor(app: App, plugin: PouchPublisherPlugin, file: TFile, title: string, content: string) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.title = title;
		this.content = content;
		
		// Check if this file has been published before
		const existingPost = plugin.settings.publishedPosts[file.path];
		this.existingFilenameBase = existingPost?.filenameBase || null;
		
		// Initialize with current settings
		this.slug = this.plugin.generateSlug(title);
		this.tags = plugin.settings.defaultTags;
		this.template = plugin.settings.defaultTemplate;
		this.publishInternal = plugin.settings.publishInternal;
		this.publishPublic = plugin.settings.publishPublic;
		this.publishExcerpt = plugin.settings.publishExcerpt;
		this.publishHidden = plugin.settings.publishHidden;
		this.rememberSettings = plugin.settings.rememberSettings;
		this.selectedDestinationIndex = plugin.settings.selectedDestinationIndex;
		
		// Initialize audio options from plugin settings
		this.includeInPodcast = plugin.settings.includeInPodcast;
		this.publishImmediately = plugin.settings.publishImmediately;
		this.enableTranscription = plugin.settings.enableTranscription;
		this.improveTranscriptWithAI = false; // Default to false for privacy - requires explicit user consent
		this.removeSilence = false; // Default to false - user must explicitly enable
		
		// Check if content has an audio file embedded
		this.hasAudioFile = plugin.detectAudioFile(content) !== null;
		
		// Read editing_status from frontmatter if available
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (frontmatter && frontmatter.editing_status) {
			const status = frontmatter.editing_status;
			if (status === 'draft' || status === 'feedback' || status === 'submission') {
				this.editingStatus = status;
			} else {
				this.editingStatus = 'draft'; // Default to draft if invalid
			}
		} else {
			this.editingStatus = 'draft'; // Default to draft if not set
		}
		
		// Store initial status for confirmation check
		this.initialEditingStatus = this.editingStatus;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		
		const isUpdate = this.existingFilenameBase !== null;
		const headerText = isUpdate ? 'Update Post in Pouch' : 'Publish to Pouch';
		
		contentEl.createEl('h2', {text: headerText});
		contentEl.createEl('p', {text: `${isUpdate ? 'Updating' : 'Publishing'}: ${this.title}`, cls: 'pouch-publish-title'});
		
		if (isUpdate) {
			contentEl.createEl('p', {text: 'This note has been published before and will be updated.', cls: 'pouch-update-notice'});
		}

		// Create form
		const formEl = contentEl.createDiv({cls: 'pouch-publish-form'});

		// Destination dropdown
		if (this.plugin.settings.destinations.length > 1) {
			new Setting(formEl)
				.setName('Publishing Destination')
				.setDesc('Select where to publish this post')
				.addDropdown(dropdown => {
					this.plugin.settings.destinations.forEach((dest, index) => {
						dropdown.addOption(index.toString(), `${dest.name} (${dest.url})`);
					});
					dropdown.setValue(this.selectedDestinationIndex.toString());
					dropdown.onChange((value) => {
						this.selectedDestinationIndex = parseInt(value);
						// Refresh the modal to show correct magazine mode state
						this.onOpen();
					});
				});
		} else if (this.plugin.settings.destinations.length === 1) {
			const dest = this.plugin.settings.destinations[0];
			new Setting(formEl)
				.setName('Publishing Destination')
				.setDesc(`${dest.name} (${dest.url})`)
				.setDisabled(true);
		}

		// Slug field
		new Setting(formEl)
			.setName('Post Slug')
			.setDesc('URL-friendly identifier for this post')
			.addText(text => text
				.setValue(this.slug)
				.onChange((value) => {
					this.slug = value;
				}));

		// Tags field
		new Setting(formEl)
			.setName('Tags')
			.setDesc('Comma-separated tags')
			.addText(text => text
				.setValue(this.tags)
				.setPlaceholder('tag1, tag2, tag3')
				.onChange((value) => {
					this.tags = value;
				}));

		// Template field
		new Setting(formEl)
			.setName('Custom Template')
			.setDesc('Optional custom Pouch template name')
			.addText(text => text
				.setValue(this.template)
				.setPlaceholder('post_custom')
				.onChange((value) => {
					this.template = value;
				}));

		// Publishing options header
		formEl.createEl('h3', {text: 'Publishing Options'});

		// Check if selected destination has magazine mode enabled
		const selectedDestination = this.plugin.settings.destinations[this.selectedDestinationIndex];
		const isMagazineMode = selectedDestination?.magazineMode || false;

		// Magazine mode: Show editing status buttons
		if (isMagazineMode) {
			const statusDiv = formEl.createDiv({cls: 'pouch-magazine-status'});
			statusDiv.createEl('p', {text: 'Editing Status:', cls: 'pouch-status-label'});
			
			const statusButtonsDiv = statusDiv.createDiv({cls: 'pouch-status-buttons'});
			
			// Helper function to handle status button clicks with confirmation
			const handleStatusClick = async (newStatus: string) => {
				// Confirm if changing from submission
				if (this.initialEditingStatus === 'submission' && newStatus !== 'submission') {
					const confirmed = await this.confirmStatusChange(newStatus);
					if (!confirmed) return;
				}
				this.editingStatus = newStatus;
				this.updateStatusButtons(statusButtonsDiv);
			};
			
			// Draft button
			const draftBtn = statusButtonsDiv.createEl('button', {
				text: 'Draft',
				cls: 'pouch-status-btn' + (this.editingStatus === 'draft' ? ' pouch-status-active' : '')
			});
			draftBtn.type = 'button';
			draftBtn.addEventListener('click', () => handleStatusClick('draft'));
			
			// Feedback button
			const feedbackBtn = statusButtonsDiv.createEl('button', {
				text: 'Feedback',
				cls: 'pouch-status-btn' + (this.editingStatus === 'feedback' ? ' pouch-status-active' : '')
			});
			feedbackBtn.type = 'button';
			feedbackBtn.addEventListener('click', () => handleStatusClick('feedback'));
			
			// Submission button
			const submissionBtn = statusButtonsDiv.createEl('button', {
				text: 'Submission',
				cls: 'pouch-status-btn' + (this.editingStatus === 'submission' ? ' pouch-status-active' : '')
			});
			submissionBtn.type = 'button';
			submissionBtn.addEventListener('click', () => handleStatusClick('submission'));
			
			// Status descriptions
			const statusDesc = statusDiv.createEl('p', {cls: 'pouch-status-desc'});
			statusDesc.innerHTML = `
				<strong>Draft:</strong> Work in progress, visible only to you.<br>
				<strong>Feedback:</strong> Visible to other writers for discussion (not public).<br>
				<strong>Submission:</strong> Request to editor/admin to publish publicly.
			`;
		}

		// Internal checkbox (hidden in magazine mode as it's controlled by editing_status)
		const internalSetting = new Setting(formEl)
			.setName('Internal Post')
			.setDesc('Make visible to logged-in users')
			.addToggle(toggle => toggle
				.setValue(this.publishInternal)
				.onChange((value) => {
					this.publishInternal = value;
				}));
		if (isMagazineMode) {
			internalSetting.settingEl.style.display = 'none';
		}

		// Public checkbox (hidden in magazine mode as it's controlled by editing_status)
		const publicSetting = new Setting(formEl)
			.setName('Public Post')
			.setDesc('Make visible to everyone')
			.addToggle(toggle => toggle
				.setValue(this.publishPublic)
				.onChange((value) => {
					this.publishPublic = value;
					// Update dependent options visibility
					this.updatePublicOptions();
				}));
		if (isMagazineMode) {
			publicSetting.settingEl.style.display = 'none';
		}

		// Excerpt checkbox (only visible when public is checked)
		let excerptToggle: any;
		const excerptSetting = new Setting(formEl)
			.setName('Excerpt')
			.setDesc('Show only first 50 words publicly')
			.addToggle(toggle => {
				excerptToggle = toggle;
				toggle
					.setValue(this.publishExcerpt)
					.onChange((value) => {
						this.publishExcerpt = value;
						// Mutual exclusivity with hidden
						if (value && this.publishHidden) {
							this.publishHidden = false;
							hiddenToggle.setValue(false);
						}
					});
			});
		excerptSetting.settingEl.addClass('pouch-public-option');

		// Hidden checkbox (only visible when public is checked)
		let hiddenToggle: any;
		const hiddenSetting = new Setting(formEl)
			.setName('Hidden')
			.setDesc('Exclude from public lists and RSS (shareable via URL)')
			.addToggle(toggle => {
				hiddenToggle = toggle;
				toggle
					.setValue(this.publishHidden)
					.onChange((value) => {
						this.publishHidden = value;
						// Mutual exclusivity with excerpt
						if (value && this.publishExcerpt) {
							this.publishExcerpt = false;
							excerptToggle.setValue(false);
						}
					});
			});
		hiddenSetting.settingEl.addClass('pouch-public-option');

		// Remember settings checkbox
		new Setting(formEl)
			.setName('Remember Settings')
			.setDesc('Save these settings for future one-click publishing (except title and slug)')
			.addToggle(toggle => toggle
				.setValue(this.rememberSettings)
				.onChange((value) => {
					this.rememberSettings = value;
				}));

		// Audio options section (only shown when audio file is detected)
		if (this.hasAudioFile) {
			formEl.createEl('h3', {text: 'Audio Options'});
			formEl.createEl('p', {text: 'Audio file detected in this note.', cls: 'pouch-audio-detected'});

			// Include in podcast RSS feed checkbox
			new Setting(formEl)
				.setName('Include in Podcast RSS Feed')
				.setDesc('Add this audio post to your podcast RSS feed (internal and/or public)')
				.addToggle(toggle => toggle
					.setValue(this.includeInPodcast)
					.onChange((value) => {
						this.includeInPodcast = value;
					}));

			// Publish immediately checkbox (shown when include in podcast is checked)
			new Setting(formEl)
				.setName('Publish Immediately')
				.setDesc('Automatically inserts intro and outro clips and publishes as a podcast episode. You can still edit the episode later.')
				.addToggle(toggle => toggle
					.setValue(this.publishImmediately)
					.onChange((value) => {
						this.publishImmediately = value;
					}));

			// Remove Silence checkbox
			new Setting(formEl)
				.setName('Remove Silence')
				.setDesc('Automatically remove silence from the beginning and end of the audio')
				.addToggle(toggle => toggle
					.setValue(this.removeSilence)
					.onChange((value) => {
						this.removeSilence = value;
					}));

			// Enable Transcription checkbox (inverted logic: unchecked = transcribe, checked = skip)
			let improveAiSetting: Setting | null = null;
			let privacyNoticeEl: HTMLElement | null = null;
			
			const transcriptionSetting = new Setting(formEl)
				.setName('Skip Transcription')
				.setDesc('Do not transcribe this audio (transcription is done locally on the server)')
				.addToggle(toggle => toggle
					.setValue(!this.enableTranscription) // Inverted: enableTranscription=true means checkbox unchecked
					.onChange((value) => {
						this.enableTranscription = !value; // Inverted
						// Update AI improvement option visibility
						if (improveAiSetting) {
							if (value) {
								// Transcription disabled - hide AI option
								improveAiSetting.settingEl.style.display = 'none';
								if (privacyNoticeEl) privacyNoticeEl.style.display = 'none';
								this.improveTranscriptWithAI = false;
							} else {
								// Transcription enabled - show AI option
								improveAiSetting.settingEl.style.display = '';
								if (privacyNoticeEl) privacyNoticeEl.style.display = '';
							}
						}
					}));

			// Improve transcript with AI checkbox (only shown when transcription is enabled)
			improveAiSetting = new Setting(formEl)
				.setName('Improve Transcript with AI')
				.setDesc('Use an external AI service to improve transcript formatting, spelling and grammar')
				.addToggle(toggle => toggle
					.setValue(this.improveTranscriptWithAI)
					.onChange((value) => {
						this.improveTranscriptWithAI = value;
					}));
			improveAiSetting.settingEl.addClass('pouch-ai-transcript-option');
			
			// Privacy notice for AI transcript improvement (using safe DOM methods to avoid XSS)
			privacyNoticeEl = formEl.createDiv({cls: 'pouch-privacy-notice'});
			privacyNoticeEl.createEl('strong', {text: 'Privacy notice:'});
			privacyNoticeEl.appendText(' This service requires sending the transcript text of your recording (not your audio) to an external service to improve readability, spelling and grammar. This may send your text to a service located in the USA (Microsoft Azure, or Ollama Cloud). See our ');
			
			// Create privacy policy link using the selected destination's URL
			const privacyLink = privacyNoticeEl.createEl('a', {text: 'privacy policy'});
			const currentDestination = this.plugin.settings.destinations[this.selectedDestinationIndex];
			const destinationUrl = currentDestination?.url?.replace(/\/$/, '') || '';
			privacyLink.href = destinationUrl ? `${destinationUrl}/legal/privacy.html` : '/legal/privacy.html';
			privacyLink.target = '_blank';
			privacyLink.rel = 'noopener noreferrer';
			privacyNoticeEl.appendText(' for details.');
			
			// Set initial visibility based on transcription setting
			if (!this.enableTranscription) {
				improveAiSetting.settingEl.style.display = 'none';
				privacyNoticeEl.style.display = 'none';
			}
		}

		// Initial visibility update
		this.updatePublicOptions();

		// Buttons
		const buttonDiv = contentEl.createDiv({cls: 'pouch-publish-buttons'});
		
		const publishButton = buttonDiv.createEl('button', {text: isUpdate ? 'Update' : 'Publish', cls: 'mod-cta'});
		publishButton.addEventListener('click', async () => {
			await this.handlePublish();
		});

		const cancelButton = buttonDiv.createEl('button', {text: 'Cancel'});
		cancelButton.addEventListener('click', () => {
			this.close();
		});

		// Add some styling
		contentEl.createEl('style', {
			text: `
				.pouch-publish-form { margin: 1em 0; }
				.pouch-publish-title { color: var(--text-muted); font-size: 0.9em; }
				.pouch-update-notice { color: var(--text-accent); font-size: 0.9em; font-style: italic; margin-top: 0.5em; }
				.pouch-publish-buttons { display: flex; gap: 0.5em; justify-content: flex-end; margin-top: 1em; }
				.pouch-publish-buttons button { padding: 0.5em 1em; }
				.pouch-public-option { margin-left: 1.5em; }
				.pouch-public-option-hidden { display: none; }
				.pouch-magazine-status { margin-bottom: 1.5em; }
				.pouch-status-label { font-weight: 600; margin-bottom: 0.5em; }
				.pouch-status-buttons { display: flex; gap: 0.5em; margin-bottom: 1em; }
				.pouch-status-btn { padding: 0.5em 1em; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); cursor: pointer; }
				.pouch-status-btn:hover { background: var(--background-modifier-hover); }
				.pouch-status-btn.pouch-status-active { background: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent); }
				.pouch-status-desc { font-size: 0.85em; color: var(--text-muted); line-height: 1.6; }
				.pouch-audio-detected { color: var(--text-accent); font-size: 0.9em; margin-bottom: 0.5em; }
				.pouch-ai-transcript-option { margin-left: 1.5em; }
				.pouch-privacy-notice { margin-left: 1.5em; margin-top: 0.5em; margin-bottom: 1em; padding: 0.75em; background: var(--background-secondary); border-radius: 4px; font-size: 0.85em; color: var(--text-muted); line-height: 1.5; border-left: 3px solid var(--interactive-accent); }
				.pouch-privacy-notice a { color: var(--text-accent); font-weight: 600; }
			`
		});
	}

	updatePublicOptions() {
		const publicOptions = this.contentEl.querySelectorAll('.pouch-public-option');
		publicOptions.forEach((el) => {
			if (this.publishPublic) {
				el.removeClass('pouch-public-option-hidden');
			} else {
				el.addClass('pouch-public-option-hidden');
			}
		});
	}

	updateStatusButtons(container: HTMLElement) {
		const buttons = container.querySelectorAll('.pouch-status-btn');
		buttons.forEach((btn) => {
			const buttonEl = btn as HTMLElement;
			const status = buttonEl.textContent?.toLowerCase();
			if (status === this.editingStatus) {
				buttonEl.addClass('pouch-status-active');
			} else {
				buttonEl.removeClass('pouch-status-active');
			}
		});
	}

	async confirmStatusChange(newStatus: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('Confirm Status Change');
			
			const message = modal.contentEl.createDiv();
			message.createEl('p', {
				text: `You are about to change the status from "Submission" to "${newStatus === 'draft' ? 'Draft' : 'Feedback'}".`
			});
			message.createEl('p', {
				text: 'This will unpublish the post if it was public. The post will be removed from public view.',
				cls: 'pouch-warning-text'
			});
			message.createEl('p', {
				text: 'Are you sure you want to continue?'
			});
			
			const buttonDiv = modal.contentEl.createDiv({cls: 'pouch-confirm-buttons'});
			
			const confirmBtn = buttonDiv.createEl('button', {text: 'Yes, Change Status', cls: 'mod-warning'});
			confirmBtn.addEventListener('click', () => {
				modal.close();
				resolve(true);
			});
			
			const cancelBtn = buttonDiv.createEl('button', {text: 'Cancel'});
			cancelBtn.addEventListener('click', () => {
				modal.close();
				resolve(false);
			});
			
			// Add styling
			modal.contentEl.createEl('style', {
				text: `
					.pouch-warning-text {
						color: var(--text-error);
						font-weight: 600;
					}
					.pouch-confirm-buttons {
						display: flex;
						gap: 0.5em;
						justify-content: flex-end;
						margin-top: 1em;
					}
					.pouch-confirm-buttons button {
						padding: 0.5em 1em;
					}
				`
			});
			
			modal.open();
		});
	}

	async handlePublish() {
		const isUpdate = this.existingFilenameBase !== null;
		console.log('[Pouch Publisher] Publishing with options from modal, isUpdate:', isUpdate);
		
		// Validate mutual exclusivity
		if (this.publishExcerpt && this.publishHidden) {
			new Notice('Error: Excerpt and Hidden cannot both be enabled');
			return;
		}

		// Get selected destination
		const destination = this.plugin.settings.destinations[this.selectedDestinationIndex];
		if (!destination) {
			new Notice('Error: Invalid destination selected');
			return;
		}

		new Notice(isUpdate ? 'Updating post in Pouch...' : 'Publishing to Pouch...');

		// Save settings if remember is checked
		if (this.rememberSettings) {
			this.plugin.settings.publishInternal = this.publishInternal;
			this.plugin.settings.publishPublic = this.publishPublic;
			this.plugin.settings.publishExcerpt = this.publishExcerpt;
			this.plugin.settings.publishHidden = this.publishHidden;
			this.plugin.settings.defaultTags = this.tags;
			this.plugin.settings.defaultTemplate = this.template;
			this.plugin.settings.rememberSettings = this.rememberSettings;
			this.plugin.settings.selectedDestinationIndex = this.selectedDestinationIndex;
			await this.plugin.saveSettings();
			console.log('[Pouch Publisher] Settings saved for future use');
		}

		// Detect audio file in content (before removing embeds)
		let audioFilename: string | null = null;
		const audioPath = this.plugin.detectAudioFile(this.content);
		
		// Remove audio embeds from content before sending to Pouch
		const cleanedContent = this.plugin.removeAudioEmbeds(this.content);
		
		if (audioPath) {
			new Notice('Preparing audio for upload...');
			console.log('[Pouch Publisher] Detected audio file:', audioPath);
			
			// Resolve audio file
			const audioFile = await this.plugin.resolveAudioFile(audioPath, this.file);
			
			if (!audioFile) {
				new ErrorModal(
					this.app,
					'Audio File Not Found',
					`Audio file not found: ${audioPath}. Please ensure the file exists in your vault.`
				).open();
				
				this.plugin.addToPublishLog({
					timestamp: new Date().toISOString(),
					title: this.title,
					slug: this.slug,
					url: '',
					success: false,
					errorMessage: `Audio file not found: ${audioPath}`
				});
				return;
			}
			
			// Validate audio file
			const validation = await this.plugin.validateAudioFile(audioFile);
			if (!validation.valid) {
				new ErrorModal(this.app, 'Invalid Audio File', validation.error || 'Unknown validation error').open();
				
				this.plugin.addToPublishLog({
					timestamp: new Date().toISOString(),
					title: this.title,
					slug: this.slug,
					url: '',
					success: false,
					errorMessage: validation.error
				});
				return;
			}
			
			// Upload audio file
			try {
				audioFilename = await this.plugin.uploadAudioFile(audioFile, this.slug, destination, this.removeSilence);
				console.log('[Pouch Publisher] Audio uploaded, filename:', audioFilename);
			} catch (error) {
				new ErrorModal(
					this.app,
					'Audio Upload Failed',
					`Failed to upload audio: ${error.message}`
				).open();
				
				this.plugin.addToPublishLog({
					timestamp: new Date().toISOString(),
					title: this.title,
					slug: this.slug,
					url: '',
					success: false,
					errorMessage: `Audio upload failed: ${error.message}`
				});
				return;
			}
		}

		// Prepare publish options using cleaned content (with audio embeds removed)
		const publishOptions: any = {
			title: this.title,
			slug: this.slug,
			markdown: cleanedContent,
			publish_internal: this.publishInternal ? '1' : '0',
			publish_public: this.publishPublic ? '1' : '0',
			excerpt: this.publishExcerpt ? '1' : '0',
			hidden: this.publishHidden ? '1' : '0',
			tags: this.tags,
			post_template: this.template,
			editing_status: this.editingStatus,
			shortname: destination.name // Send shortname for API logging
		};
		
		// If this is an update, include the filename_base
		if (isUpdate && this.existingFilenameBase) {
			publishOptions.filename_base = this.existingFilenameBase;
			console.log('[Pouch Publisher] Including filename_base for update:', this.existingFilenameBase);
		}
		
		// Add audio metadata if audio was uploaded
		if (audioFilename) {
			publishOptions.audio_file = audioFilename;
			publishOptions.include_in_podcast = this.includeInPodcast ? '1' : '0';
			publishOptions.publish_immediately = this.publishImmediately ? '1' : '0';
		}

		console.log('[Pouch Publisher] Publishing with options:', publishOptions);

		const result = await this.plugin.sendToPouch(publishOptions, destination);
		
		if (result.success) {
			// Store or update the filename_base mapping
			if (result.response && result.response.filename_base) {
				this.plugin.settings.publishedPosts[this.file.path] = {
					filePath: this.file.path,
					filenameBase: result.response.filename_base,
					lastPublished: new Date().toISOString()
				};
				await this.plugin.saveSettings();
				console.log('[Pouch Publisher] Stored filename_base for future updates:', result.response.filename_base);
			}
			
			// Update frontmatter with publishing info including editing status
			const url = this.plugin.getPostUrl(result.response, publishOptions, destination);
			await this.plugin.updateFrontmatter(this.file, destination.name, url, publishOptions.editing_status);
			
			// Update status bar and title
			this.plugin.updateStatusBar(this.file);
			this.plugin.updateFileTitle(this.file);
			
			// Log successful publish
			this.plugin.addToPublishLog({
				timestamp: new Date().toISOString(),
				title: this.title,
				slug: this.slug,
				url: url,
				success: true
			});
			
			// Trigger transcription if audio was uploaded and transcription is enabled (using modal settings)
			if (audioFilename && this.enableTranscription) {
				// Pass AI model/provider if user requested AI improvement
				const aiModel = this.improveTranscriptWithAI ? PouchPublisherPlugin.DEFAULT_AI_MODEL : undefined;
				const aiProvider = this.improveTranscriptWithAI ? PouchPublisherPlugin.DEFAULT_AI_PROVIDER : undefined;
				await this.plugin.triggerTranscription(audioFilename, this.slug, destination, aiModel, aiProvider);
			} else if (audioFilename && !this.enableTranscription) {
				new Notice('Post saved! Transcription skipped as requested.');
			}
			
			// Display success message in the modal instead of closing
			this.displaySuccessMessage(url, publishOptions);
		} else {
			// Log failed publish
			this.plugin.addToPublishLog({
				timestamp: new Date().toISOString(),
				title: this.title,
				slug: this.slug,
				url: '',
				success: false,
				errorMessage: result.error
			});
		}
	}

	displaySuccessMessage(url: string, publishOptions: any) {
		const {contentEl} = this;
		contentEl.empty();
		
		contentEl.createEl('h2', {text: '✓ Published Successfully!'});
		
		const isPublic = publishOptions.publish_public === '1';
		const isHidden = publishOptions.hidden === '1';
		const urlType = isPublic ? (isHidden ? 'Hidden Post URL' : 'Public Post URL') : 'Internal Post URL';
		
		contentEl.createEl('p', {text: `Published: ${this.title}`, cls: 'pouch-publish-title'});
		
		if (url) {
			contentEl.createEl('p', {text: urlType});
			
			const urlDiv = contentEl.createDiv({cls: 'pouch-success-url'});
			urlDiv.createEl('code', {text: url});

			// Buttons
			const buttonDiv = contentEl.createDiv({cls: 'pouch-success-buttons'});
			
			const visitButton = buttonDiv.createEl('button', {text: 'Visit Post', cls: 'mod-cta'});
			visitButton.addEventListener('click', () => {
				window.open(url, '_blank');
			});

			const copyButton = buttonDiv.createEl('button', {text: 'Copy URL'});
			copyButton.addEventListener('click', async () => {
				await this.copyToClipboard(url);
			});

			const closeButton = buttonDiv.createEl('button', {text: 'Close'});
			closeButton.addEventListener('click', () => {
				this.close();
			});
		} else {
			const closeButton = contentEl.createEl('button', {text: 'Close', cls: 'mod-cta'});
			closeButton.addEventListener('click', () => {
				this.close();
			});
		}

		// Add styling
		contentEl.createEl('style', {
			text: `
				.pouch-publish-title { color: var(--text-muted); font-size: 0.9em; }
				.pouch-success-url { 
					background: var(--background-secondary); 
					padding: 1em; 
					border-radius: 4px; 
					margin: 1em 0;
					word-break: break-all;
				}
				.pouch-success-url code { 
					font-size: 0.9em; 
					color: var(--text-normal);
				}
				.pouch-success-buttons { 
					display: flex; 
					gap: 0.5em; 
					justify-content: flex-end; 
					margin-top: 1em; 
				}
				.pouch-success-buttons button { 
					padding: 0.5em 1em; 
				}
			`
		});
	}

	async copyToClipboard(text: string) {
		try {
			// Try modern clipboard API first
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(text);
				new Notice('URL copied to clipboard!');
				console.log('[Pouch Publisher] URL copied using Clipboard API');
			} else {
				// Fallback for mobile or older browsers
				const textArea = document.createElement('textarea');
				textArea.value = text;
				textArea.style.position = 'fixed';
				textArea.style.left = '-999999px';
				textArea.style.top = '-999999px';
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				
				try {
					const successful = document.execCommand('copy');
					if (successful) {
						new Notice('URL copied to clipboard!');
						console.log('[Pouch Publisher] URL copied using execCommand');
					} else {
						throw new Error('execCommand failed');
					}
				} catch (err) {
					new Notice('Failed to copy URL. Please copy manually.');
					console.error('[Pouch Publisher] Copy failed:', err);
				}
				
				document.body.removeChild(textArea);
			}
		} catch (err) {
			new Notice('Failed to copy URL. Please copy manually.');
			console.error('[Pouch Publisher] Copy error:', err);
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class ErrorModal extends Modal {
	title: string;
	errorMessage: string;

	constructor(app: App, title: string, errorMessage: string) {
		super(app);
		this.title = title;
		this.errorMessage = errorMessage;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		
		contentEl.createEl('h2', {text: `⚠️ ${this.title}`});
		
		const errorDiv = contentEl.createDiv({cls: 'pouch-error-message'});
		errorDiv.createEl('p', {text: this.errorMessage});
		
		// Close button
		const buttonDiv = contentEl.createDiv({cls: 'pouch-error-buttons'});
		const closeButton = buttonDiv.createEl('button', {text: 'Close', cls: 'mod-cta'});
		closeButton.addEventListener('click', () => {
			this.close();
		});

		// Add styling
		contentEl.createEl('style', {
			text: `
				.pouch-error-message { 
					background: var(--background-secondary); 
					padding: 1em; 
					border-radius: 4px; 
					margin: 1em 0;
					border-left: 3px solid var(--text-error);
				}
				.pouch-error-message p { 
					color: var(--text-error);
					margin: 0;
					word-wrap: break-word;
				}
				.pouch-error-buttons { 
					display: flex; 
					gap: 0.5em; 
					justify-content: flex-end; 
					margin-top: 1em; 
				}
				.pouch-error-buttons button { 
					padding: 0.5em 1em; 
				}
			`
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SuccessModal extends Modal {
	url: string;
	urlType: string;

	constructor(app: App, url: string, urlType: string) {
		super(app);
		this.url = url;
		this.urlType = urlType;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		
		contentEl.createEl('h2', {text: '✓ Published Successfully!'});
		
		contentEl.createEl('p', {text: this.urlType});
		
		const urlDiv = contentEl.createDiv({cls: 'pouch-success-url'});
		urlDiv.createEl('code', {text: this.url});

		// Buttons
		const buttonDiv = contentEl.createDiv({cls: 'pouch-success-buttons'});
		
		const visitButton = buttonDiv.createEl('button', {text: 'Visit Post', cls: 'mod-cta'});
		visitButton.addEventListener('click', () => {
			window.open(this.url, '_blank');
		});

		const copyButton = buttonDiv.createEl('button', {text: 'Copy URL'});
		copyButton.addEventListener('click', async () => {
			await this.copyToClipboard(this.url);
		});

		const closeButton = buttonDiv.createEl('button', {text: 'Close'});
		closeButton.addEventListener('click', () => {
			this.close();
		});

		// Add styling
		contentEl.createEl('style', {
			text: `
				.pouch-success-url { 
					background: var(--background-secondary); 
					padding: 1em; 
					border-radius: 4px; 
					margin: 1em 0;
					word-break: break-all;
				}
				.pouch-success-url code { 
					font-size: 0.9em; 
					color: var(--text-normal);
				}
				.pouch-success-buttons { 
					display: flex; 
					gap: 0.5em; 
					justify-content: flex-end; 
					margin-top: 1em; 
				}
				.pouch-success-buttons button { 
					padding: 0.5em 1em; 
				}
			`
		});
	}

	async copyToClipboard(text: string) {
		try {
			// Try modern clipboard API first
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(text);
				new Notice('URL copied to clipboard!');
				console.log('[Pouch Publisher] URL copied using Clipboard API');
			} else {
				// Fallback for mobile or older browsers
				const textArea = document.createElement('textarea');
				textArea.value = text;
				textArea.style.position = 'fixed';
				textArea.style.left = '-999999px';
				textArea.style.top = '-999999px';
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				
				try {
					const successful = document.execCommand('copy');
					if (successful) {
						new Notice('URL copied to clipboard!');
						console.log('[Pouch Publisher] URL copied using execCommand');
					} else {
						throw new Error('execCommand failed');
					}
				} catch (err) {
					new Notice('Failed to copy URL. Please copy manually.');
					console.error('[Pouch Publisher] Copy failed:', err);
				}
				
				document.body.removeChild(textArea);
			}
		} catch (err) {
			new Notice('Failed to copy URL. Please copy manually.');
			console.error('[Pouch Publisher] Copy error:', err);
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class PouchPublisherSettingTab extends PluginSettingTab {
	plugin: PouchPublisherPlugin;

	constructor(app: App, plugin: PouchPublisherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Pouch Publisher Settings'});

		// Destinations Section
		containerEl.createEl('h3', {text: 'Publishing Destinations'});
		containerEl.createEl('p', {
			text: 'Configure up to 5 Pouch destinations. Each destination requires a shortname (max 7 characters, no spaces), URL, and API key.',
			cls: 'setting-item-description'
		});

		// Display existing destinations
		this.plugin.settings.destinations.forEach((dest, index) => {
			const destContainer = containerEl.createDiv({cls: 'pouch-destination-container'});
			
			const destHeader = destContainer.createEl('h4', {text: `Destination ${index + 1}: ${dest.name}`});
			
			new Setting(destContainer)
				.setName('Shortname')
				.setDesc('Max 7 characters, no spaces')
				.addText(text => text
					.setPlaceholder('default')
					.setValue(dest.name)
					.onChange(async (value) => {
						// Validate shortname
						const sanitized = value.replace(/\s+/g, '').substring(0, 7);
						if (sanitized !== value) {
							text.setValue(sanitized);
						}
						dest.name = sanitized;
						await this.plugin.saveSettings();
						// Update header text without refreshing the entire page
						destHeader.setText(`Destination ${index + 1}: ${sanitized}`);
					}));
			
			new Setting(destContainer)
				.setName('Pouch URL')
				.setDesc('Your Pouch instance URL')
				.addText(text => text
					.setPlaceholder('https://your-pouch-domain.com')
					.setValue(dest.url)
					.onChange(async (value) => {
						dest.url = value;
						await this.plugin.saveSettings();
					}));
			
			new Setting(destContainer)
				.setName('API Key')
				.setDesc('Your Pouch API key')
				.addText(text => text
					.setPlaceholder('Enter your API key')
					.setValue(dest.apiKey)
					.onChange(async (value) => {
						dest.apiKey = value;
						await this.plugin.saveSettings();
					}));
			
			new Setting(destContainer)
				.setName('Magazine Mode')
				.setDesc('Enable magazine mode for this destination (shows Feedback and Submission editing states)')
				.addToggle(toggle => toggle
					.setValue(dest.magazineMode || false)
					.onChange(async (value) => {
						dest.magazineMode = value;
						await this.plugin.saveSettings();
					}));
			
			new Setting(destContainer)
				.setName('Remove Destination')
				.setDesc('Delete this publishing destination')
				.addButton(button => button
					.setButtonText('Remove')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.destinations.splice(index, 1);
						// Adjust selected index if needed
						if (this.plugin.settings.selectedDestinationIndex >= this.plugin.settings.destinations.length) {
							this.plugin.settings.selectedDestinationIndex = Math.max(0, this.plugin.settings.destinations.length - 1);
						}
						await this.plugin.saveSettings();
						this.display(); // Refresh
					}));
		});

		// Add new destination button (limit to 5)
		if (this.plugin.settings.destinations.length < 5) {
			new Setting(containerEl)
				.setName('Add New Destination')
				.setDesc(`Add another Pouch destination (${this.plugin.settings.destinations.length}/5)`)
				.addButton(button => button
					.setButtonText('Add Destination')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.destinations.push({
							name: `dest${this.plugin.settings.destinations.length + 1}`,
							url: '',
							apiKey: '',
							magazineMode: false
						});
						await this.plugin.saveSettings();
						this.display(); // Refresh
					}));
		} else {
			containerEl.createEl('p', {
				text: 'Maximum of 5 destinations reached.',
				cls: 'setting-item-description'
			});
		}

		containerEl.createEl('p', {
			text: 'To get your API key, log into your Pouch instance and navigate to Settings or API Keys section.',
			cls: 'setting-item-description'
		});

		// Ribbon Icons Section
		containerEl.createEl('h3', {text: 'Ribbon Icons'});

		new Setting(containerEl)
			.setName('Show One-Click Publishing Icon')
			.setDesc('Display the cloud upload icon in the sidebar ribbon')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showOneClickIcon)
				.onChange(async (value) => {
					this.plugin.settings.showOneClickIcon = value;
					await this.plugin.saveSettings();
					this.plugin.updateRibbonIcons();
				}));

		new Setting(containerEl)
			.setName('Show Publishing with Options Icon')
			.setDesc('Display the settings icon in the sidebar ribbon')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showOptionsIcon)
				.onChange(async (value) => {
					this.plugin.settings.showOptionsIcon = value;
					await this.plugin.saveSettings();
					this.plugin.updateRibbonIcons();
				}));

		// Audio File Settings Section
		containerEl.createEl('h3', {text: 'Audio File Settings'});

		new Setting(containerEl)
			.setName('Include in Podcast by Default')
			.setDesc('Automatically include audio posts in podcast RSS feed')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeInPodcast)
				.onChange(async (value) => {
					this.plugin.settings.includeInPodcast = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Publish Immediately by Default')
			.setDesc('Automatically generate and publish podcast episodes with intro/outro clips')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.publishImmediately)
				.onChange(async (value) => {
					this.plugin.settings.publishImmediately = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Transcription')
			.setDesc('Automatically transcribe uploaded audio files')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTranscription)
				.onChange(async (value) => {
					this.plugin.settings.enableTranscription = value;
					await this.plugin.saveSettings();
				}));

		// Publishing Log Section
		containerEl.createEl('h3', {text: 'Publishing Log'});
		
		const logDesc = containerEl.createEl('p', {
			text: 'Recent publishing activity (most recent first):',
			cls: 'setting-item-description'
		});

		if (this.plugin.settings.publishLog.length === 0) {
			containerEl.createEl('p', {
				text: 'No publishing activity yet.',
				cls: 'pouch-log-empty'
			});
		} else {
			const logContainer = containerEl.createDiv({cls: 'pouch-log-container'});
			
			this.plugin.settings.publishLog.forEach((entry, index) => {
				const logEntry = logContainer.createDiv({cls: 'pouch-log-entry'});
				
				const timestamp = new Date(entry.timestamp);
				const formattedTime = timestamp.toLocaleString();
				
				if (entry.success) {
					logEntry.addClass('pouch-log-success');
					logEntry.createEl('div', {
						text: `✓ ${formattedTime}`,
						cls: 'pouch-log-timestamp'
					});
					logEntry.createEl('div', {
						text: `Title: ${entry.title}`,
						cls: 'pouch-log-title'
					});
					logEntry.createEl('div', {
						text: `Slug: ${entry.slug}`,
						cls: 'pouch-log-slug'
					});
					if (entry.url) {
						const urlDiv = logEntry.createDiv({cls: 'pouch-log-url'});
						const urlLink = urlDiv.createEl('a', {
							text: entry.url,
							href: entry.url
						});
						urlLink.setAttribute('target', '_blank');
					}
				} else {
					logEntry.addClass('pouch-log-error');
					logEntry.createEl('div', {
						text: `✗ ${formattedTime}`,
						cls: 'pouch-log-timestamp'
					});
					logEntry.createEl('div', {
						text: `Title: ${entry.title}`,
						cls: 'pouch-log-title'
					});
					if (entry.slug) {
						logEntry.createEl('div', {
							text: `Slug: ${entry.slug}`,
							cls: 'pouch-log-slug'
						});
					}
					if (entry.errorMessage) {
						logEntry.createEl('div', {
							text: `Error: ${entry.errorMessage}`,
							cls: 'pouch-log-error-msg'
						});
					}
				}
			});
			
			// Add clear log button
			new Setting(containerEl)
				.setName('Clear Log')
				.setDesc('Remove all entries from the publishing log')
				.addButton(button => button
					.setButtonText('Clear Log')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.publishLog = [];
						await this.plugin.saveSettings();
						this.display(); // Refresh the display
					}));
		}

		// Debug Logging Section
		containerEl.createEl('h3', {text: 'Debug Logging'});
		
		new Setting(containerEl)
			.setName('Enable Debug Logging')
			.setDesc('Enable detailed logging of API requests and responses for troubleshooting. Logs are stored locally in the plugin settings.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugLogging)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugLogging = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide debug log
				}));
		
		if (this.plugin.settings.enableDebugLogging) {
			const debugLogDesc = containerEl.createEl('p', {
				text: 'Debug log entries (most recent first):',
				cls: 'setting-item-description'
			});
			
			if (this.plugin.settings.debugLog.length === 0) {
				containerEl.createEl('p', {
					text: 'No debug log entries yet. Perform an API action to see logs here.',
					cls: 'pouch-log-empty'
				});
			} else {
				const debugLogContainer = containerEl.createDiv({cls: 'pouch-debug-log-container'});
				
				this.plugin.settings.debugLog.forEach((entry, index) => {
					const logEntry = debugLogContainer.createDiv({cls: 'pouch-debug-log-entry'});
					logEntry.addClass(`pouch-debug-${entry.type}`);
					
					const timestamp = new Date(entry.timestamp);
					const formattedTime = timestamp.toLocaleString();
					
					// Header with timestamp and type
					const headerDiv = logEntry.createDiv({cls: 'pouch-debug-header'});
					headerDiv.createEl('span', {
						text: `[${entry.type.toUpperCase()}] ${formattedTime}`,
						cls: 'pouch-debug-timestamp'
					});
					
					// Message
					logEntry.createEl('div', {
						text: entry.message,
						cls: 'pouch-debug-message'
					});
					
					// Request details
					if (entry.endpoint) {
						logEntry.createEl('div', {
							text: `Endpoint: ${entry.endpoint}`,
							cls: 'pouch-debug-detail'
						});
					}
					
					if (entry.method) {
						logEntry.createEl('div', {
							text: `Method: ${entry.method}`,
							cls: 'pouch-debug-detail'
						});
					}
					
					if (entry.responseStatus) {
						logEntry.createEl('div', {
							text: `Status: ${entry.responseStatus}`,
							cls: 'pouch-debug-detail'
						});
					}
					
					// Expandable request data
					if (entry.requestData) {
						const requestToggle = logEntry.createDiv({cls: 'pouch-debug-toggle'});
						requestToggle.createEl('span', {text: '▶ Show Request Data'});
						const requestData = logEntry.createEl('pre', {
							text: JSON.stringify(entry.requestData, null, 2),
							cls: 'pouch-debug-json'
						});
						requestData.style.display = 'none';
						
						requestToggle.addEventListener('click', () => {
							if (requestData.style.display === 'none') {
								requestData.style.display = 'block';
								requestToggle.querySelector('span')!.textContent = '▼ Hide Request Data';
							} else {
								requestData.style.display = 'none';
								requestToggle.querySelector('span')!.textContent = '▶ Show Request Data';
							}
						});
					}
					
					// Expandable response data
					if (entry.responseBody) {
						const responseToggle = logEntry.createDiv({cls: 'pouch-debug-toggle'});
						responseToggle.createEl('span', {text: '▶ Show Response Data'});
						const responseData = logEntry.createEl('pre', {
							text: JSON.stringify(entry.responseBody, null, 2),
							cls: 'pouch-debug-json'
						});
						responseData.style.display = 'none';
						
						responseToggle.addEventListener('click', () => {
							if (responseData.style.display === 'none') {
								responseData.style.display = 'block';
								responseToggle.querySelector('span')!.textContent = '▼ Hide Response Data';
							} else {
								responseData.style.display = 'none';
								responseToggle.querySelector('span')!.textContent = '▶ Show Response Data';
							}
						});
					}
					
					// Error details
					if (entry.errorDetails) {
						const errorToggle = logEntry.createDiv({cls: 'pouch-debug-toggle'});
						errorToggle.createEl('span', {text: '▶ Show Error Details'});
						const errorData = logEntry.createEl('pre', {
							text: JSON.stringify(entry.errorDetails, null, 2),
							cls: 'pouch-debug-json pouch-debug-error-details'
						});
						errorData.style.display = 'none';
						
						errorToggle.addEventListener('click', () => {
							if (errorData.style.display === 'none') {
								errorData.style.display = 'block';
								errorToggle.querySelector('span')!.textContent = '▼ Hide Error Details';
							} else {
								errorData.style.display = 'none';
								errorToggle.querySelector('span')!.textContent = '▶ Show Error Details';
							}
						});
					}
				});
				
				// Add clear debug log button
				new Setting(containerEl)
					.setName('Clear Debug Log')
					.setDesc('Remove all entries from the debug log')
					.addButton(button => button
						.setButtonText('Clear Debug Log')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.debugLog = [];
							await this.plugin.saveSettings();
							this.display(); // Refresh the display
						}));
			}
		}

		// Add styling for the log
		containerEl.createEl('style', {
			text: `
				.pouch-destination-container {
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					padding: 1em;
					margin: 1em 0;
					background: var(--background-secondary);
				}
				.pouch-destination-container h4 {
					margin-top: 0;
					margin-bottom: 0.5em;
					color: var(--text-accent);
				}
				.pouch-log-container {
					max-height: 400px;
					overflow-y: auto;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					padding: 0.5em;
					margin: 1em 0;
					background: var(--background-secondary);
				}
				.pouch-log-entry {
					padding: 0.75em;
					margin-bottom: 0.5em;
					border-radius: 4px;
					background: var(--background-primary);
					border-left: 3px solid var(--interactive-accent);
				}
				.pouch-log-entry.pouch-log-error {
					border-left-color: var(--text-error);
				}
				.pouch-log-timestamp {
					font-weight: bold;
					margin-bottom: 0.25em;
					font-size: 0.9em;
				}
				.pouch-log-title, .pouch-log-slug {
					margin-bottom: 0.25em;
					font-size: 0.85em;
				}
				.pouch-log-url {
					margin-top: 0.25em;
					font-size: 0.85em;
				}
				.pouch-log-url a {
					color: var(--interactive-accent);
					text-decoration: none;
				}
				.pouch-log-url a:hover {
					text-decoration: underline;
				}
				.pouch-log-error-msg {
					color: var(--text-error);
					margin-top: 0.25em;
					font-size: 0.85em;
				}
				.pouch-log-empty {
					color: var(--text-muted);
					font-style: italic;
					margin: 1em 0;
				}
				.pouch-debug-log-container {
					max-height: 500px;
					overflow-y: auto;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					padding: 0.5em;
					margin: 1em 0;
					background: var(--background-secondary);
				}
				.pouch-debug-log-entry {
					padding: 0.75em;
					margin-bottom: 0.5em;
					border-radius: 4px;
					background: var(--background-primary);
					border-left: 3px solid var(--text-muted);
					font-size: 0.9em;
				}
				.pouch-debug-log-entry.pouch-debug-error {
					border-left-color: var(--text-error);
				}
				.pouch-debug-log-entry.pouch-debug-request {
					border-left-color: var(--interactive-accent);
				}
				.pouch-debug-log-entry.pouch-debug-response {
					border-left-color: var(--interactive-success);
				}
				.pouch-debug-log-entry.pouch-debug-info {
					border-left-color: var(--text-accent);
				}
				.pouch-debug-header {
					font-weight: bold;
					margin-bottom: 0.5em;
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
				.pouch-debug-timestamp {
					font-size: 0.85em;
					color: var(--text-muted);
				}
				.pouch-debug-message {
					margin-bottom: 0.5em;
					font-weight: 500;
				}
				.pouch-debug-detail {
					font-size: 0.85em;
					color: var(--text-muted);
					margin-bottom: 0.25em;
				}
				.pouch-debug-toggle {
					cursor: pointer;
					color: var(--interactive-accent);
					font-size: 0.85em;
					margin-top: 0.5em;
					user-select: none;
				}
				.pouch-debug-toggle:hover {
					text-decoration: underline;
				}
				.pouch-debug-json {
					background: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					padding: 0.5em;
					margin-top: 0.5em;
					font-size: 0.8em;
					overflow-x: auto;
					white-space: pre-wrap;
					word-wrap: break-word;
				}
				.pouch-debug-error-details {
					border-color: var(--text-error);
					background: var(--background-modifier-error);
				}
			`
		});
	}
}
