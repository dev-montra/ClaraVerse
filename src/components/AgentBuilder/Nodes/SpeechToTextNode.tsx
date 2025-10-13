import { memo, useState, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Mic, Settings, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import BaseNode from './BaseNode';

interface SpeechToTextNodeData {
  baseUrl?: string;
  language?: string;
  beamSize?: number;
  initialPrompt?: string;
  lastResponse?: any;
  lastError?: string | null;
  latestText?: string;
  latestSegments?: any[];
  onUpdate?: (updates: any) => void;
}

interface TestResult {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

const DEFAULT_URL = 'http://localhost:5001/transcribe';

const convertBase64ToBlob = (base64: string) => {
  let cleaned = base64.trim();
  let mimeType = 'audio/wav';
  let extension = 'wav';

  if (cleaned.startsWith('data:')) {
    const match = cleaned.match(/^data:(.*?);base64,/);
    if (match) {
      mimeType = match[1] || mimeType;
      cleaned = cleaned.substring(match[0].length);
    }
  }

  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
    extension = 'mp3';
  } else if (mimeType.includes('ogg')) {
    extension = 'ogg';
  } else if (mimeType.includes('wav')) {
    extension = 'wav';
  } else if (mimeType.includes('webm')) {
    extension = 'webm';
  }

  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mimeType });
  return {
    blob,
    mimeType,
    fileName: `audio.${extension}`
  };
};

const SpeechToTextNode = memo<NodeProps<SpeechToTextNodeData>>((props) => {
  const { data } = props;

  const [baseUrl, setBaseUrl] = useState(data.baseUrl || DEFAULT_URL);
  const [language, setLanguage] = useState(data.language || 'en');
  const [beamSize, setBeamSize] = useState(typeof data.beamSize === 'number' ? data.beamSize : 5);
  const [initialPrompt, setInitialPrompt] = useState(data.initialPrompt || '');
  const [testBase64, setTestBase64] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle' });

  const updateData = useCallback((updates: Partial<SpeechToTextNodeData>) => {
    if (!data.onUpdate) return;

    const hasChange = Object.entries(updates).some(([key, value]) => {
      const prevValue = (data as Record<string, any>)[key];

      if (Array.isArray(value) && Array.isArray(prevValue)) {
        if (value.length !== prevValue.length) return true;
        return value.some((item, idx) => !Object.is(item, prevValue[idx]));
      }

      if (
        value !== null &&
        prevValue !== null &&
        typeof value === 'object' &&
        typeof prevValue === 'object'
      ) {
        try {
          return JSON.stringify(value) !== JSON.stringify(prevValue);
        } catch (error) {
          return true;
        }
      }

      return !Object.is(prevValue, value);
    });

    if (!hasChange) {
      return;
    }

    data.onUpdate({ data: { ...data, ...updates } });
  }, [data]);

  const handleConfigChange = useCallback((field: keyof SpeechToTextNodeData, value: any) => {
    switch (field) {
      case 'baseUrl':
        setBaseUrl(value);
        break;
      case 'language':
        setLanguage(value);
        break;
      case 'beamSize':
        setBeamSize(value);
        break;
      case 'initialPrompt':
        setInitialPrompt(value);
        break;
    }

    updateData({
      baseUrl: field === 'baseUrl' ? value : baseUrl,
      language: field === 'language' ? value : language,
      beamSize: field === 'beamSize' ? value : beamSize,
      initialPrompt: field === 'initialPrompt' ? value : initialPrompt
    });
  }, [baseUrl, language, beamSize, initialPrompt, updateData]);

  const runTestTranscription = useCallback(async () => {
    if (!testBase64.trim()) {
      setTestResult({ status: 'error', message: 'Provide a base64 audio payload to test.' });
      return;
    }

    try {
      setIsTesting(true);
      setTestResult({ status: 'idle' });

      const { blob, fileName } = convertBase64ToBlob(testBase64);
      const formData = new FormData();
      formData.append('file', blob, fileName);
      if (language) {
        formData.append('language', language);
      }
      if (beamSize) {
        formData.append('beam_size', String(beamSize));
      }
      if (initialPrompt) {
        formData.append('initial_prompt', initialPrompt);
      }

      const response = await fetch(baseUrl || DEFAULT_URL, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      updateData({
        lastResponse: result,
        latestText: result?.transcription?.text || '',
        latestSegments: result?.transcription?.segments || [],
        lastError: null
      });

      setTestResult({ status: 'success', message: 'Transcription successful.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transcription error';
      setTestResult({ status: 'error', message });
      updateData({ lastError: message });
    } finally {
      setIsTesting(false);
    }
  }, [testBase64, baseUrl, language, beamSize, initialPrompt, updateData]);

  const latestText = data.latestText;
  const lastError = data.lastError;

  return (
    <BaseNode
      {...props}
      title="Speech to Text"
      category="ai"
      icon={<Mic className="w-4 h-4" />}
      inputs={[
        { id: 'audioBase64', name: 'Audio (Base64)', type: 'input', dataType: 'string', required: true },
        { id: 'languageOverride', name: 'Language Override', type: 'input', dataType: 'string', required: false }
      ]}
      outputs={[
        { id: 'transcription', name: 'Transcription', type: 'output', dataType: 'string' },
        { id: 'segments', name: 'Segments', type: 'output', dataType: 'array' },
        { id: 'raw', name: 'Raw Response', type: 'output', dataType: 'object' }
      ]}
      executing={isTesting}
      success={!!latestText && !lastError}
      error={lastError || undefined}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Settings className="w-4 h-4" />
            Endpoint Configuration
          </div>
          {testResult.status === 'success' && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle className="w-3 h-3" />
              Ready
            </span>
          )}
          {testResult.status === 'error' && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3" />
              Check Config
            </span>
          )}
        </div>

        <div className="space-y-3 p-3 bg-gray-50/60 dark:bg-gray-800/40 rounded-lg border border-gray-200 dark:border-gray-700">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Transcription Endpoint URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => handleConfigChange('baseUrl', e.target.value)}
              placeholder={DEFAULT_URL}
              className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-sakura-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Language (ISO code)
              </label>
              <input
                type="text"
                value={language}
                onChange={(e) => handleConfigChange('language', e.target.value)}
                placeholder="en"
                className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-sakura-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Beam Size
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={beamSize}
                onChange={(e) => handleConfigChange('beamSize', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-sakura-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Initial Prompt (Optional)
            </label>
            <textarea
              value={initialPrompt}
              onChange={(e) => handleConfigChange('initialPrompt', e.target.value)}
              rows={3}
              placeholder="Provide any guiding prompt for the transcription service..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-sakura-500 resize-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Quick Test (Base64 Audio)</label>
          <textarea
            value={testBase64}
            onChange={(e) => setTestBase64(e.target.value)}
            rows={4}
            placeholder="Paste base64 audio payload here to test..."
            className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-gray-900/70 text-gray-100 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-sakura-500 resize-none"
          />
          <button
            onClick={runTestTranscription}
            disabled={isTesting || !testBase64.trim()}
            className="w-full px-3 py-2 text-sm font-medium bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Transcribing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Test Transcription
              </>
            )}
          </button>
          {testResult.status === 'error' && (
            <div className="text-xs text-red-500 dark:text-red-400 flex items-start gap-1">
              <AlertCircle className="w-3 h-3 mt-0.5" />
              <span>{testResult.message}</span>
            </div>
          )}
          {testResult.status === 'success' && (
            <div className="text-xs text-green-600 dark:text-green-400 flex items-start gap-1">
              <CheckCircle className="w-3 h-3 mt-0.5" />
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {latestText && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Latest Transcription</div>
            <div className="text-sm text-emerald-800 dark:text-emerald-100 whitespace-pre-wrap break-words">
              {latestText}
            </div>
          </div>
        )}

        {lastError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-300">
            {lastError}
          </div>
        )}
      </div>
    </BaseNode>
  );
});

SpeechToTextNode.displayName = 'SpeechToTextNode';

export default SpeechToTextNode;
