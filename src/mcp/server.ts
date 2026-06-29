import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { KnowledgeStore } from '../core/knowledge-store.js';
import { Indexer } from '../core/indexer.js';
import { Watcher } from '../core/watcher.js';
import { getAnalyzerForExtension } from '../registry.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export class McpServer {
  private server: Server;
  private store: KnowledgeStore;
  private indexer: Indexer;
  private watcher: Watcher;

  constructor() {
    this.server = new Server(
      { name: 'verity-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.store = new KnowledgeStore('./verity.db');
    this.indexer = new Indexer(this.store, getAnalyzerForExtension);
    this.watcher = new Watcher(this.indexer, this.store);

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'query_knowledge',
          description: 'Searches facts by keyword',
          inputSchema: {
            type: 'object',
            properties: {
              keyword: { type: 'string' }
            },
            required: ['keyword']
          }
        },
        {
          name: 'get_entity',
          description: 'Returns entity details and its relations',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            },
            required: ['name']
          }
        },
        {
          name: 'get_related',
          description: 'Returns all relations for an entity',
          inputSchema: {
            type: 'object',
            properties: {
              entityId: { type: 'string' },
              relationType: { type: 'string' }
            },
            required: ['entityId']
          }
        },
        {
          name: 'index_directory',
          description: 'Triggers indexing of a directory and returns count of files indexed',
          inputSchema: {
            type: 'object',
            properties: {
              dirPath: { type: 'string' }
            },
            required: ['dirPath']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'query_knowledge': {
          const keyword = request.params.arguments?.keyword as string;
          if (!keyword) throw new McpError(ErrorCode.InvalidParams, 'keyword is required');
          const facts = this.store.searchFacts(keyword);
          const formattedFacts = facts.map((f, i) => {
            try {
              const parsed = JSON.parse(f);
              if (parsed.heading && parsed.fact) {
                return `${i + 1}. [${parsed.heading}] ${parsed.fact}`;
              }
            } catch (e) {}
            return `${i + 1}. ${f}`;
          }).join('\n');
          return { content: [{ type: 'text', text: formattedFacts || 'No facts found.' }] };
        }
        case 'get_entity': {
          const name = request.params.arguments?.name as string;
          if (!name) throw new McpError(ErrorCode.InvalidParams, 'name is required');
          const entity = this.store.getEntity(name);
          if (!entity) return { content: [{ type: 'text', text: 'null' }] };
          let text = `Name: ${entity.name}\nType: ${entity.type}\nFile: ${entity.filePath}\nLine: ${entity.line}\nRelations:\n`;
          if (entity.relations && entity.relations.length > 0) {
            text += entity.relations.map(r => `${r.from} → ${r.to} (${r.type})`).join('\n');
          } else {
            text += 'None';
          }
          return { content: [{ type: 'text', text }] };
        }
        case 'get_related': {
          const entityId = request.params.arguments?.entityId as string;
          const relationType = request.params.arguments?.relationType as string | undefined;
          if (!entityId) throw new McpError(ErrorCode.InvalidParams, 'entityId is required');
          const relations = this.store.getRelated(entityId, relationType);
          const formattedRels = relations.map(r => `${r.from} → ${r.to} (${r.type})`).join('\n');
          return { content: [{ type: 'text', text: formattedRels || 'No relations found.' }] };
        }
        case 'index_directory': {
          const dirPath = request.params.arguments?.dirPath as string;
          if (!dirPath) throw new McpError(ErrorCode.InvalidParams, 'dirPath is required');
          
          let count = 0;
          const skipFolders = new Set(['node_modules', '.git', 'dist', 'build']);
          
          const walk = async (currentPath: string) => {
            let entries;
            try {
              entries = await fs.readdir(currentPath, { withFileTypes: true });
            } catch (e) {
              return;
            }
            for (const entry of entries) {
              const fullPath = path.join(currentPath, entry.name);
              if (entry.isDirectory()) {
                if (!skipFolders.has(entry.name)) {
                  await walk(fullPath);
                }
              } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (getAnalyzerForExtension(ext)) {
                  count++;
                }
              }
            }
          };
          
          await walk(dirPath);
          await this.indexer.indexDirectory(dirPath);
          
          return { content: [{ type: 'text', text: `Indexed ${count} files.` }] };
        }
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    });
  }

  public async start(): Promise<void> {
    const targetDir = process.argv[2] || process.cwd();
    this.watcher.watch(targetDir);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  public async stop(): Promise<void> {
    this.watcher.stop();
    await this.server.close();
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const server = new McpServer();
  server.start().catch((err) => {
    console.error('Fatal error in server:', err);
    process.exit(1);
  });
}
