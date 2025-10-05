import React, { useState, useEffect } from 'react';
import { StartupService, StartupSettings } from '../services/startupService';

interface StartupSettingsDemoProps {
  className?: string;
}

export const StartupSettingsDemo: React.FC<StartupSettingsDemoProps> = ({ className }) => {
  const [settings, setSettings] = useState<StartupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid' | 'unknown'>('unknown');
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Partial<StartupSettings> | null>(null);

  const startupService = StartupService.getInstance();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const currentSettings = await startupService.getStartupSettings();
      setSettings(currentSettings);
      
      // Validate settings integrity
      const isValid = await startupService.validateSettings();
      setValidationStatus(isValid ? 'valid' : 'invalid');
    } catch (error) {
      console.error('Failed to load startup settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (key: keyof StartupSettings, value: boolean) => {
    const changes = { [key]: value };
    setPendingChanges(changes);
    setShowConsentDialog(true);
  };

  const confirmChanges = async () => {
    if (!pendingChanges) return;

    try {
      // Update with explicit user consent
      await startupService.updateStartupSettings(pendingChanges, true);
      await loadSettings(); // Reload to get updated settings
      setShowConsentDialog(false);
      setPendingChanges(null);
    } catch (error) {
      console.error('Failed to update startup settings:', error);
      alert('Failed to update settings: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const cancelChanges = () => {
    setShowConsentDialog(false);
    setPendingChanges(null);
  };

  const resetToDefaults = async () => {
    const confirmed = confirm('Are you sure you want to reset all startup settings to defaults?');
    if (confirmed) {
      try {
        await startupService.resetToDefaults(true);
        await loadSettings();
      } catch (error) {
        console.error('Failed to reset startup settings:', error);
        alert('Failed to reset settings: ' + (error instanceof Error ? error.message : String(error)));
      }
    }
  };

  if (loading) {
    return <div className={`p-4 ${className}`}>Loading startup settings...</div>;
  }

  if (!settings) {
    return <div className={`p-4 text-red-500 ${className}`}>Failed to load startup settings</div>;
  }

  return (
    <div className={`p-6 bg-white rounded-lg shadow-lg ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">🔒 Isolated Startup Settings</h2>
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded text-sm ${
            validationStatus === 'valid' ? 'bg-green-100 text-green-800' :
            validationStatus === 'invalid' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {validationStatus === 'valid' ? '✅ Validated' :
             validationStatus === 'invalid' ? '⚠️ Mismatch' : '❓ Unknown'}
          </span>
          {settings.isDevelopment && (
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
              🚧 Dev Mode
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Start Fullscreen</label>
          <button
            onClick={() => handleSettingChange('startFullscreen', !settings.startFullscreen)}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${
              settings.startFullscreen ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
              settings.startFullscreen ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Start Minimized</label>
          <button
            onClick={() => handleSettingChange('startMinimized', !settings.startMinimized)}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${
              settings.startMinimized ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
              settings.startMinimized ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Auto Start on Login</label>
          <button
            onClick={() => handleSettingChange('autoStart', !settings.autoStart)}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${
              settings.autoStart ? 'bg-blue-500' : 'bg-gray-300'
            }`}
            disabled={settings.isDevelopment}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
              settings.autoStart ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Check for Updates</label>
          <button
            onClick={() => handleSettingChange('checkUpdates', !settings.checkUpdates)}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${
              settings.checkUpdates ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
              settings.checkUpdates ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Auto Start MCP Servers</label>
          <button
            onClick={() => handleSettingChange('autoStartMCP', !settings.autoStartMCP)}
            className={`w-12 h-6 rounded-full p-1 transition-colors ${
              settings.autoStartMCP ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
              settings.autoStartMCP ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

      <div className="flex space-x-3 mt-6">
        <button
          onClick={loadSettings}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          🔄 Refresh
        </button>
        <button
          onClick={resetToDefaults}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          🔄 Reset to Defaults
        </button>
      </div>

      {/* Settings Metadata */}
      <div className="mt-6 p-3 bg-gray-50 rounded text-xs text-gray-600">
        <div>Version: {settings.version || 'Unknown'}</div>
        <div>Last Modified: {settings.lastModified ? new Date(settings.lastModified).toLocaleString() : 'Unknown'}</div>
        <div>Checksum: {settings.checksum ? settings.checksum.substring(0, 8) + '...' : 'None'}</div>
      </div>

      {/* Consent Dialog */}
      {showConsentDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">🔒 Confirm Settings Change</h3>
            <p className="text-gray-600 mb-4">
              You are about to modify startup settings. This change will be saved to an isolated, 
              protected configuration file that only the startup system can access.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Changes: {pendingChanges && Object.entries(pendingChanges)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ')}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={confirmChanges}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                ✅ Confirm & Save
              </button>
              <button
                onClick={cancelChanges}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StartupSettingsDemo;