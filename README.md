# Verity

An MCP server that builds a real-time knowledge graph from your codebase and text files, giving AI agents factual memory across long sessions.

## Features
- **Real-Time Indexing**: Continuously watches your directory for file changes and updates the knowledge graph instantly.
- **Deep Contextual Analysis**: Extracts entities, relationships, semantic facts, causal patterns, and temporal markers.
- **Cross-File Integrity**: Detects and reports contradictions or conflicting facts across different files.
- **Persistent Storage**: Utilizes SQLite for robust, atomic, and persistent knowledge storage.
- **MCP Integration**: Fully integrates with the Model Context Protocol (MCP) exposing standard tools for seamless AI agent querying.

## Supported File Types
- **TypeScript / JavaScript** (`.ts`, `.js`): Static AST analysis for functions, classes, interfaces, and variables.
- **Markdown / Text** (`.md`, `.txt`): Deep semantic NLP analysis, character state tracking, and relational mapping.

## Installation
```bash
npm install
npm run build
```

## Usage
Start the server by passing the target directory to watch and analyze:
```bash
node dist/main.js /path/to/your/project
```
Connect your MCP client to the server via standard I/O.

### MCP Tools
- `index_directory(dirPath)`: Force re-index a specific directory.
- `query_knowledge(keyword)`: Semantic search over the extracted facts.
- `get_entity(name)`: Retrieve a specific entity and its known relationships.
- `get_related(entityId, relationType?)`: Traverse the knowledge graph for a specific entity.

## How It Works
Verity orchestrates an analysis pipeline utilizing a central `Indexer` and `KnowledgeStore`. It parses supported files through specialized `Analyzers` (e.g., `TsAnalyzer`, `TextAnalyzer`). The extracted AST and NLP metadata are mapped into Entities, Relations, and Facts, which are persisted in a fast, local SQLite database (`verity.db`). A `Watcher` monitors file system events to dynamically update or clear stale data.

## Adding a New Language
Verity is built with modularity in mind. Adding a new language analyzer requires exactly one step:
1. Create a class extending `BaseAnalyzer` in `src/analyzers/` and add it to `src/registry.ts`.
The registry auto-registers all instantiated analyzers on import.

## License
MIT License
