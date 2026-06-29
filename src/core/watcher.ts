import chokidar from 'chokidar';
import path from 'node:path';
import { Indexer } from './indexer.js';
import { KnowledgeStore } from './knowledge-store.js';

export class Watcher {
  private watcher: chokidar.FSWatcher | null = null;
  private readonly supportedExtensions = new Set(['.ts', '.js', '.md', '.txt']);

  constructor(
    private indexer: Indexer,
    private store: KnowledgeStore
  ) {}

  public watch(dirPath: string): void {
    if (this.watcher) {
      this.stop();
    }

    this.watcher = chokidar.watch(dirPath, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**'
      ],
      persistent: true,
      ignoreInitial: true
    });

    const isSupported = (filePath: string) => {
      return this.supportedExtensions.has(path.extname(filePath).toLowerCase());
    };

    this.watcher.on('add', (filePath: string) => {
      if (isSupported(filePath)) {
        this.indexer.indexFile(filePath).catch(err => {
          console.error(`Watcher add error for ${filePath}:`, err);
        });
      }
    });

    this.watcher.on('change', (filePath: string) => {
      if (isSupported(filePath)) {
        this.indexer.indexFile(filePath).catch(err => {
          console.error(`Watcher change error for ${filePath}:`, err);
        });
      }
    });

    this.watcher.on('unlink', (filePath: string) => {
      if (isSupported(filePath)) {
        try {
          this.store.clearFile(filePath);
        } catch (err) {
          console.error(`Watcher unlink error for ${filePath}:`, err);
        }
      }
    });
  }

  public stop(): void {
    if (this.watcher) {
      // In chokidar 3.x, close() is async but can be called without awaiting if we don't need to wait for it.
      this.watcher.close().catch(() => {});
      this.watcher = null;
    }
  }
}
