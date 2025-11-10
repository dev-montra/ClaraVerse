import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Configure Monaco to use the local version instead of CDN
loader.config({ monaco });

export default monaco;
