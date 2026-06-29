import path from 'node:path';
import { BaseAnalyzer } from './analyzers/base-analyzer.js';
import { TsAnalyzer } from './analyzers/ts-analyzer.js';
import { TextAnalyzer } from './analyzers/text-analyzer.js';

const analyzerMap = new Map<string, BaseAnalyzer>();

export function registerAnalyzer(analyzer: BaseAnalyzer): void {
  for (const ext of analyzer.supportedExtensions) {
    analyzerMap.set(ext.toLowerCase(), analyzer);
  }
}

export function getAnalyzer(filePath: string): BaseAnalyzer | null {
  const ext = path.extname(filePath).toLowerCase();
  return analyzerMap.get(ext) || null;
}

export const getAnalyzerForExtension = getAnalyzer;

// Auto-register analyzers on import
// Adding a new language = adding one entry here only, nothing else
[
  new TsAnalyzer(),
  new TextAnalyzer()
].forEach(registerAnalyzer);
