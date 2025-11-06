import React from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';

export interface ProjectLoadingState {
  isLoading: boolean;
  phase: 'idle' | 'cleanup' | 'loading-files' | 'mounting-ui' | 'initializing-monaco' | 'ready';
  filesLoaded: boolean;
  monacoReady: boolean;
  webContainerReady: boolean;
  error: string | null;
  startedAt: number | null;
}

interface ProjectLoadingOverlayProps {
  loadingState: ProjectLoadingState;
  projectName: string;
}

const phaseMessages = {
  'idle': 'Preparing...',
  'cleanup': 'Cleaning up previous project...',
  'loading-files': 'Loading project files from database...',
  'mounting-ui': 'Initializing editor components...',
  'initializing-monaco': 'Setting up code editor...',
  'ready': 'Project ready!'
};

const phaseProgress = {
  'idle': 0,
  'cleanup': 20,
  'loading-files': 40,
  'mounting-ui': 60,
  'initializing-monaco': 80,
  'ready': 100
};

const ChecklistItem: React.FC<{ label: string; checked: boolean }> = ({ label, checked }) => (
  <div className="flex items-center gap-2">
    <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
      checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
    }`}>
      {checked && <Check className="w-3 h-3 text-white" />}
    </div>
    <span className={`text-sm transition-colors ${
      checked ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'
    }`}>
      {label}
    </span>
  </div>
);

const ProjectLoadingOverlay: React.FC<ProjectLoadingOverlayProps> = ({
  loadingState,
  projectName
}) => {
  if (!loadingState.isLoading && !loadingState.error) return null;

  const elapsedTime = loadingState.startedAt ? Date.now() - loadingState.startedAt : 0;
  const isSlowLoading = elapsedTime > 15000; // 15 seconds

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glassmorphic rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
        <div className="text-center">
          {/* Icon */}
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            {loadingState.error ? (
              <AlertCircle className="w-8 h-8 text-white" />
            ) : (
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            )}
          </div>

          {/* Title */}
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            {loadingState.error ? 'Error Loading Project' : `Opening ${projectName}`}
          </h3>

          {/* Status Message */}
          {!loadingState.error && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {phaseMessages[loadingState.phase]}
            </p>
          )}

          {/* Progress Bar */}
          {!loadingState.error && (
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-6 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${phaseProgress[loadingState.phase]}%` }}
              />
            </div>
          )}

          {/* Readiness Checklist */}
          {!loadingState.error && (
            <div className="space-y-2 text-left mb-4">
              <ChecklistItem
                label="Project files loaded"
                checked={loadingState.filesLoaded}
              />
              <ChecklistItem
                label="Code editor initialized"
                checked={loadingState.monacoReady}
              />
              <ChecklistItem
                label="Environment ready"
                checked={loadingState.webContainerReady}
              />
            </div>
          )}

          {/* Error State */}
          {loadingState.error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-left">
              <p className="text-sm text-red-700 dark:text-red-400 font-medium mb-2">
                {loadingState.error}
              </p>
              <p className="text-xs text-red-600 dark:text-red-500">
                Please try selecting the project again or check the browser console for details.
              </p>
            </div>
          )}

          {/* Slow Loading Warning */}
          {!loadingState.error && isSlowLoading && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                This is taking longer than usual. The project will open shortly...
              </p>
            </div>
          )}

          {/* Helpful Tip */}
          {!loadingState.error && loadingState.phase === 'loading-files' && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-700 dark:text-blue-400">
                💡 Tip: Larger projects may take a few seconds to load all files
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectLoadingOverlay;
