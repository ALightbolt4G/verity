import fs from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeStore } from './knowledge-store.js';
import { BaseAnalyzer } from '../analyzers/base-analyzer.js';

export class Indexer {
  constructor(
    private store: KnowledgeStore,
    private getAnalyzer: (filePath: string) => BaseAnalyzer | null
  ) {}

  public async indexFile(filePath: string): Promise<void> {
    const analyzer = this.getAnalyzer(filePath);
    if (!analyzer) return;

    this.store.clearFile(filePath);

    try {
      const result = await analyzer.analyze(filePath);

      for (const entity of result.entities) {
        this.store.upsertEntity(entity);
      }
      
      for (const relation of result.relations) {
        this.store.upsertRelation(relation);
      }
      
      for (const fact of result.facts) {
        this.store.upsertFact(filePath, fact);
      }
    } catch (error) {
      console.error(`Failed to index file ${filePath}:`, error);
    }
  }

  public async indexDirectory(dirPath: string, extensions?: string[]): Promise<void> {
    const skipFolders = new Set(['node_modules', '.git', 'dist', 'build']);

    const walk = async (currentPath: string) => {
      let entries;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch (err) {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          if (!skipFolders.has(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (extensions) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!extensions.includes(ext)) {
              continue;
            }
          }

          const analyzer = this.getAnalyzer(fullPath);
          if (analyzer) {
            await this.indexFile(fullPath);
          }
        }
      }
    };

    await walk(dirPath);

    // Cross-file pass
    const allEntities = this.store.getAllEntities();
    const nameMap = new Map<string, any[]>();
    for (const e of allEntities) {
      if (!nameMap.has(e.name)) {
        nameMap.set(e.name, []);
      }
      nameMap.get(e.name)!.push(e);
    }

    for (const [name, entities] of nameMap.entries()) {
      if (entities.length > 1) {
        for (let i = 0; i < entities.length; i++) {
          for (let j = i + 1; j < entities.length; j++) {
            const e1 = entities[i];
            const e2 = entities[j];
            if (e1.filePath !== e2.filePath) {
              this.store.upsertRelation({
                from: e1.id,
                to: e2.filePath,
                type: 'also_in'
              });
              this.store.upsertRelation({
                from: e2.id,
                to: e1.filePath,
                type: 'also_in'
              });

              if (e1.type !== e2.type) {
                this.store.upsertFact(e1.filePath, JSON.stringify({
                  type: 'contradiction',
                  message: `Entity '${name}' has type '${e1.type}' in ${e1.filePath} but type '${e2.type}' in ${e2.filePath}`
                }));
              }
            }
          }
        }
      }
    }
  }
}
