

export interface StartupSettings {
  startFullscreen: boolean;
  startMinimized: boolean;
  autoStart: boolean;
  checkUpdates: boolean;
  restoreLastSession: boolean;
  autoStartMCP: boolean;
  isDevelopment?: boolean;
  version?: number;
  lastModified?: number;
  checksum?: string;
}

export class StartupService {
  private static instance: StartupService;
  private settings: StartupSettings = {
    startFullscreen: false,
    startMinimized: false,
    autoStart: false,
    checkUpdates: true,
    restoreLastSession: true,
    autoStartMCP: true, // Default to true for auto-start MCP
    isDevelopment: false
  };

  private constructor() {
    this.loadSettings();
  }

  public static getInstance(): StartupService {
    if (!StartupService.instance) {
      StartupService.instance = new StartupService();
    }
    return StartupService.instance;
  }

  private async loadSettings() {
    try {
      // Check if isolated startup settings API is available
      if (!(window as any).electron?.startupSettings?.get) {
        console.warn('🔒 Isolated startup settings API not available, falling back to legacy');
        
        // Fallback to legacy API
        if ((window as any).electron?.getStartupSettings) {
          const settings = await (window as any).electron.getStartupSettings();
          this.settings = { ...this.settings, ...settings };
          console.log('📄 Loaded settings from legacy API:', this.settings);
        }
        return;
      }
      
      // Use new isolated startup settings API
      console.log('🔒 Loading startup settings from isolated system...');
      const response = await (window as any).electron.startupSettings.get();
      if (response.success) {
        this.settings = { ...this.settings, ...response.settings };
        console.log('🔒 Loaded startup settings from isolated system:', this.settings);
        
        // Store checksum for validation
        if (response.settings.checksum) {
          localStorage.setItem('clara-startup-settings-checksum', response.settings.checksum);
        }
      } else {
        console.error('🔒 Failed to load isolated startup settings:', response.error);
      }
    } catch (error) {
      console.error('Error loading startup settings:', error);
    }
  }

  public async getStartupSettings(): Promise<StartupSettings> {
    await this.loadSettings();
    return this.settings;
  }

  public async updateStartupSettings(settings: Partial<StartupSettings>, userConsent: boolean = false): Promise<void> {
    console.log('🔒 UpdateStartupSettings called with consent:', userConsent, 'settings:', settings);
    this.settings = { ...this.settings, ...settings };
    
    try {
      // Check if isolated startup settings API is available
      if (!(window as any).electron?.startupSettings?.update) {
        console.warn('🔒 Isolated startup settings API not available, falling back to legacy');
        
        // Fallback to legacy API
        if ((window as any).electron?.setStartupSettings) {
          await (window as any).electron.setStartupSettings(this.settings);
        }
        return;
      }
      
      // Use new isolated startup settings API with explicit consent
      console.log('🔒 Calling isolated startup settings update with consent:', userConsent);
      const response = await (window as any).electron.startupSettings.update(settings, userConsent);
      if (response.success) {
        this.settings = { ...this.settings, ...response.settings };
        console.log('🔒 Updated startup settings via isolated system with consent:', userConsent);
        
        // Store new checksum for validation
        if (response.settings.checksum) {
          localStorage.setItem('clara-startup-settings-checksum', response.settings.checksum);
        }
      } else {
        console.error('🔒 Failed to update isolated startup settings:', response.error);
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Error updating startup settings:', error);
      throw error;
    }
  }

  public async validateSettings(): Promise<boolean> {
    try {
      // Check if validation API is available
      if (!(window as any).electron?.startupSettings?.validate) {
        console.warn('🔒 Startup settings validation API not available');
        return true; // Assume valid if validation not available
      }
      
      const storedChecksum = localStorage.getItem('clara-startup-settings-checksum');
      if (!storedChecksum) {
        console.warn('🔒 No stored checksum for startup settings validation');
        return true; // Assume valid if no checksum stored
      }
      
      const response = await (window as any).electron.startupSettings.validate(storedChecksum);
      if (response.success) {
        if (!response.isValid) {
          console.error('⚠️ STARTUP SETTINGS MISMATCH DETECTED!');
          console.error('Backend and frontend startup settings are out of sync');
          
          if (response.settings) {
            console.log('🔧 Syncing with backend settings...');
            this.settings = { ...this.settings, ...response.settings };
            if (response.settings.checksum) {
              localStorage.setItem('clara-startup-settings-checksum', response.settings.checksum);
            }
          }
        }
        return response.isValid;
      } else {
        console.error('🔒 Failed to validate startup settings:', response.error);
        return false;
      }
    } catch (error) {
      console.error('Error validating startup settings:', error);
      return false;
    }
  }

  public async applyStartupSettings(): Promise<void> {
    try {
      // Validate settings first
      const isValid = await this.validateSettings();
      if (!isValid) {
        console.warn('🔒 Startup settings validation failed, but continuing with application');
      }
      
      // Check if isolated startup settings API is available
      if (!(window as any).electron?.startupSettings?.update) {
        console.warn('🔒 Isolated startup settings API not available, skipping startup settings application');
        return;
      }
      
      // Apply settings using isolated system (no user consent needed for read-only application)
      console.log('🔒 Applying startup settings via isolated system');
    } catch (error) {
      console.error('Error applying startup settings:', error);
    }
  }

  public async resetToDefaults(confirmed: boolean = false): Promise<void> {
    try {
      if (!(window as any).electron?.startupSettings?.reset) {
        console.warn('🔒 Startup settings reset API not available');
        return;
      }
      
      const response = await (window as any).electron.startupSettings.reset(confirmed);
      if (response.success) {
        this.settings = { ...response.settings };
        console.log('🔄 Startup settings reset to defaults');
        
        // Clear stored checksum
        localStorage.removeItem('clara-startup-settings-checksum');
      } else {
        console.error('🔒 Failed to reset startup settings:', response.error);
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Error resetting startup settings:', error);
      throw error;
    }
  }
} 