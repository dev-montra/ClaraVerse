import { memo, useState } from 'react';
import { NodeProps } from 'reactflow';
import { FileText, Settings } from 'lucide-react';
import BaseNode from './BaseNode';

interface JsonStringifyNodeData {
  label?: string;
  prettyPrint?: boolean;
  indent?: number;
  nullFallback?: string;
  inputs?: any[];
  outputs?: any[];
  onUpdate?: (updates: any) => void;
}

type JsonStringifyNodeProps = NodeProps<JsonStringifyNodeData>;

const JsonStringifyNode = memo<JsonStringifyNodeProps>((props) => {
  const { data } = props;
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [prettyPrint, setPrettyPrint] = useState(data.prettyPrint ?? true);
  const [indent, setIndent] = useState<number>(data.indent ?? 2);
  const [nullFallback, setNullFallback] = useState<string>(data.nullFallback ?? '');

  const updateData = (updates: Partial<JsonStringifyNodeData>) => {
    if (data.onUpdate) {
      data.onUpdate({ data: { ...data, ...updates } });
    }
  };

  const handlePrettyPrintChange = (value: boolean) => {
    setPrettyPrint(value);
    updateData({ prettyPrint: value });
  };

  const handleIndentChange = (value: number) => {
    const nextIndent = Number.isNaN(value) ? 2 : Math.min(Math.max(Math.round(value), 0), 8);
    setIndent(nextIndent);
    updateData({ indent: nextIndent });
  };

  const handleNullFallbackChange = (value: string) => {
    setNullFallback(value);
    updateData({ nullFallback: value });
  };

  return (
    <BaseNode
      {...props}
      title={data.label || 'JSON → Text'}
      category="data"
      icon={<FileText className="w-4 h-4" />}
      inputs={data.inputs}
      outputs={data.outputs}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded border">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
            <FileText className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            JSON stringify options
          </div>
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="p-1 hover:bg-white/50 dark:hover:bg-gray-600/50 rounded transition-colors"
            title="Toggle configuration"
            type="button"
          >
            <Settings className="w-3 h-3 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {isConfigOpen && (
          <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded border">
            <div className="flex items-center gap-2">
              <input
                id={`pretty-print-${props.id}`}
                type="checkbox"
                checked={prettyPrint}
                onChange={(event) => handlePrettyPrintChange(event.target.checked)}
                className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor={`pretty-print-${props.id}`} className="text-xs text-gray-700 dark:text-gray-300">
                Pretty print output
              </label>
            </div>

            {prettyPrint && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Indent spaces
                </label>
                <input
                  type="number"
                  min={0}
                  max={8}
                  step={1}
                  value={indent}
                  onChange={(event) => handleIndentChange(Number(event.target.value))}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Number of spaces to use for indentation (0-8)
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fallback text for null/undefined
              </label>
              <input
                type="text"
                value={nullFallback}
                onChange={(event) => handleNullFallbackChange(event.target.value)}
                placeholder="Leave empty to output empty string"
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Output this text when the input value is null or undefined
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400">
          Converts any JSON-compatible value into a string for LLM prompts or display components.
        </div>
      </div>
    </BaseNode>
  );
});

JsonStringifyNode.displayName = 'JsonStringifyNode';

export default JsonStringifyNode;
