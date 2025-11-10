import { WebContainer } from '@webcontainer/api';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  files: Record<string, string>;
  installCommand?: string[];
  devCommand?: string[];
}

export interface ScaffoldProgress {
  currentStep: number;
  totalSteps: number;
  stepName: string;
  stepDescription: string;
  isComplete: boolean;
  error?: string;
}

export class ProjectScaffolderV2 {
  private webContainer: WebContainer;
  private writeToTerminal: (data: string) => void;

  constructor(webContainer: WebContainer, writeToTerminal: (data: string) => void) {
    this.webContainer = webContainer;
    this.writeToTerminal = writeToTerminal;
  }

  async scaffoldProject(
    template: ProjectTemplate,
    projectName: string,
    onProgress?: (progress: ScaffoldProgress) => void
  ): Promise<boolean> {
    const steps = [
      'Creating project structure',
      'Writing project files',
      'Installing dependencies',
    ];
    
    try {
      this.writeToTerminal(`\x1b[36m🚀 Scaffolding ${template.name} project: ${projectName}\x1b[0m\n`);
      this.writeToTerminal(`\x1b[33m📋 Steps to execute: ${steps.length}\x1b[0m\n\n`);

      // Step 1: Create project structure
      if (onProgress) {
        onProgress({
          currentStep: 1,
          totalSteps: steps.length,
          stepName: steps[0],
          stepDescription: 'Creating directories...',
          isComplete: false
        });
      }

      this.writeToTerminal(`\x1b[33m📦 Step 1/${steps.length}: ${steps[0]}\x1b[0m\n`);
      
      // Get all unique directories from file paths
      const directories = new Set<string>();
      Object.keys(template.files).forEach(path => {
        const parts = path.split('/');
        parts.pop(); // Remove filename
        let currentPath = '';
        parts.forEach(part => {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          if (currentPath) directories.add(currentPath);
        });
      });

      // Create directories
      for (const dir of directories) {
        try {
          await this.webContainer.fs.mkdir(dir, { recursive: true });
          this.writeToTerminal(`\x1b[90m   ✓ Created directory: ${dir}\x1b[0m\n`);
        } catch (error) {
          // Directory might already exist, that's okay
        }
      }

      this.writeToTerminal(`\x1b[32m   ✅ Project structure created\x1b[0m\n\n`);

      // Step 2: Write files
      if (onProgress) {
        onProgress({
          currentStep: 2,
          totalSteps: steps.length,
          stepName: steps[1],
          stepDescription: 'Writing files...',
          isComplete: false
        });
      }

      this.writeToTerminal(`\x1b[33m📦 Step 2/${steps.length}: ${steps[1]}\x1b[0m\n`);
      
      const fileCount = Object.keys(template.files).length;
      let filesCreated = 0;

      for (const [path, content] of Object.entries(template.files)) {
        try {
          await this.webContainer.fs.writeFile(path, content);
          filesCreated++;
          this.writeToTerminal(`\x1b[90m   ✓ (${filesCreated}/${fileCount}) ${path}\x1b[0m\n`);
        } catch (error) {
          this.writeToTerminal(`\x1b[31m   ✗ Failed to create ${path}: ${error}\x1b[0m\n`);
          throw error;
        }
      }

      this.writeToTerminal(`\x1b[32m   ✅ ${filesCreated} files created\x1b[0m\n\n`);

      // Step 3: Install dependencies
      if (template.installCommand && template.installCommand.length > 0) {
        if (onProgress) {
          onProgress({
            currentStep: 3,
            totalSteps: steps.length,
            stepName: steps[2],
            stepDescription: 'Installing dependencies...',
            isComplete: false
          });
        }

        this.writeToTerminal(`\x1b[33m📦 Step 3/${steps.length}: ${steps[2]}\x1b[0m\n`);
        this.writeToTerminal(`\x1b[90m   Command: ${template.installCommand.join(' ')}\x1b[0m\n`);

        const [command, ...args] = template.installCommand;
        const installProcess = await this.webContainer.spawn(command, args);

        installProcess.output.pipeTo(new WritableStream({
          write: (data) => {
            const lines = data.split('\n');
            lines.forEach((line) => {
              if (line.trim()) {
                this.writeToTerminal(`\x1b[90m   │ \x1b[0m${line}\n`);
              }
            });
          }
        }));

        const exitCode = await installProcess.exit;

        if (exitCode !== 0) {
          this.writeToTerminal(`\x1b[31m   ❌ Installation failed with exit code ${exitCode}\x1b[0m\n`);
          throw new Error(`Installation failed with exit code ${exitCode}`);
        }

        this.writeToTerminal(`\x1b[32m   ✅ Dependencies installed\x1b[0m\n\n`);
      }

      // Final success
      if (onProgress) {
        onProgress({
          currentStep: steps.length,
          totalSteps: steps.length,
          stepName: 'Complete',
          stepDescription: 'Project setup complete',
          isComplete: true
        });
      }

      this.writeToTerminal(`\x1b[32m🎉 Project ${projectName} scaffolded successfully!\x1b[0m\n`);
      this.writeToTerminal(`\x1b[36m💡 Run the project using the Start button\x1b[0m\n\n`);
      
      return true;

    } catch (error) {
      const errorDetails = error instanceof Error ? error.message : String(error);
      this.writeToTerminal(`\x1b[31m❌ Project scaffolding failed: ${errorDetails}\x1b[0m\n`);
      
      if (onProgress) {
        onProgress({
          currentStep: 0,
          totalSteps: steps.length,
          stepName: 'Failed',
          stepDescription: errorDetails,
          isComplete: false,
          error: errorDetails
        });
      }
      
      return false;
    }
  }
}

// Project templates
export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  'react-vite-tailwind': {
    id: 'react-vite-tailwind',
    name: 'React + Vite + Tailwind',
    description: 'Modern React app with Vite and Tailwind CSS',
    icon: '⚛️',
    category: 'React',
    files: {
      'package.json': JSON.stringify({
        name: 'react-vite-tailwind-app',
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc && vite build',
          preview: 'vite preview'
        },
        dependencies: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0'
        },
        devDependencies: {
          '@types/react': '^18.2.43',
          '@types/react-dom': '^18.2.17',
          '@vitejs/plugin-react': '^4.2.1',
          'typescript': '^5.2.2',
          'vite': '^5.0.8',
          'tailwindcss': '^3.4.0',
          'postcss': '^8.4.32',
          'autoprefixer': '^10.4.16'
        }
      }, null, 2),
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + Tailwind</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`,
      'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noFallthroughCasesInSwitch: true
        },
        include: ['src'],
        references: [{ path: './tsconfig.node.json' }]
      }, null, 2),
      'tsconfig.node.json': JSON.stringify({
        compilerOptions: {
          composite: true,
          skipLibCheck: true,
          module: 'ESNext',
          moduleResolution: 'bundler',
          allowSyntheticDefaultImports: true
        },
        include: ['vite.config.ts']
      }, null, 2),
      'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
      'src/App.tsx': `import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            React + Vite + Tailwind
          </h1>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-6">
              <button 
                onClick={() => setCount((count) => count + 1)}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Count is {count}
              </button>
            </div>
            <p className="text-gray-600 text-sm">
              Edit <code className="bg-gray-100 px-2 py-1 rounded text-blue-600">src/App.tsx</code> and save to test HMR
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App`,
      'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;`,
      'src/vite-env.d.ts': `/// <reference types="vite/client" />`
    },
    installCommand: ['npm', 'install']
  }
};
