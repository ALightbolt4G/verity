import Database from 'better-sqlite3';
import { Entity, Relation } from '../analyzers/base-analyzer.js';

export class KnowledgeStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        filePath TEXT,
        line INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS relations (
        "from" TEXT,
        "to" TEXT,
        type TEXT,
        UNIQUE("from", "to", type)
      );

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filePath TEXT,
        content TEXT
      );
    `);
  }

  public upsertEntity(entity: Entity): void {
    const stmt = this.db.prepare(`
      INSERT INTO entities (id, name, type, filePath, line)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        filePath = excluded.filePath,
        line = excluded.line
    `);
    stmt.run(entity.id, entity.name, entity.type, entity.filePath, entity.line);
  }

  public upsertRelation(relation: Relation): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO relations ("from", "to", type)
      VALUES (?, ?, ?)
    `);
    stmt.run(relation.from, relation.to, relation.type);
  }

  public upsertFact(filePath: string, content: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO facts (filePath, content)
      VALUES (?, ?)
    `);
    stmt.run(filePath, content);
  }

  public getEntity(name: string): Entity | null {
    const stmt = this.db.prepare(`SELECT * FROM entities WHERE name LIKE '%' || ? || '%'`);
    const row = stmt.get(name) as any;
    if (!row) return null;
    
    const relations = this.getRelated(row.id);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      filePath: row.filePath,
      line: row.line,
      relations
    };
  }

  public getSummary(): { entitiesByType: Record<string, Entity[]>, contradictions: any[] } {
    const entitiesByType: Record<string, Entity[]> = {};
    const entities = this.db.prepare(`SELECT * FROM entities`).all() as any[];
    for (const row of entities) {
      if (!entitiesByType[row.type]) {
        entitiesByType[row.type] = [];
      }
      entitiesByType[row.type].push({
        id: row.id,
        name: row.name,
        type: row.type,
        filePath: row.filePath,
        line: row.line,
        relations: this.getRelated(row.id)
      });
    }

    const facts = this.db.prepare(`SELECT content FROM facts`).all() as any[];
    const contradictions = facts
      .map(r => {
        try {
          const parsed = JSON.parse(r.content);
          return parsed;
        } catch (e) {
          if (r.content.startsWith('Conflict:')) {
             return { type: 'contradiction', message: r.content };
          }
          return null;
        }
      })
      .filter(f => f && (f.type === 'contradiction' || f.conflict === true));

    return { entitiesByType, contradictions };
  }

  public getAllEntities(): Entity[] {
    const rows = this.db.prepare(`SELECT * FROM entities`).all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      filePath: row.filePath,
      line: row.line,
      relations: []
    }));
  }

  public getRelated(entityId: string, relationType?: string): Relation[] {
    if (relationType) {
      const stmt = this.db.prepare(`
        SELECT "from" as "from", "to" as "to", type 
        FROM relations 
        WHERE ("from" = ? OR "to" = ?) AND type = ?
      `);
      return stmt.all(entityId, entityId, relationType) as Relation[];
    } else {
      const stmt = this.db.prepare(`
        SELECT "from" as "from", "to" as "to", type 
        FROM relations 
        WHERE "from" = ? OR "to" = ?
      `);
      return stmt.all(entityId, entityId) as Relation[];
    }
  }

  public searchFacts(keyword: string): string[] {
    const stmt = this.db.prepare(`SELECT content FROM facts WHERE content LIKE ?`);
    const rows = stmt.all(`%${keyword}%`) as any[];
    return rows.map(r => r.content);
  }

  public clearFile(filePath: string): void {
    const deleteRelations = this.db.prepare(`
      DELETE FROM relations 
      WHERE "from" = ? 
         OR "to" = ? 
         OR "from" IN (SELECT id FROM entities WHERE filePath = ?)
         OR "to" IN (SELECT id FROM entities WHERE filePath = ?)
    `);
    deleteRelations.run(filePath, filePath, filePath, filePath);

    const deleteEntities = this.db.prepare(`DELETE FROM entities WHERE filePath = ?`);
    deleteEntities.run(filePath);

    const deleteFacts = this.db.prepare(`DELETE FROM facts WHERE filePath = ?`);
    deleteFacts.run(filePath);
  }
}
