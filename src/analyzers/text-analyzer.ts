import fs from 'node:fs/promises';
import path from 'node:path';
import { BaseAnalyzer, AnalysisResult, Entity, Relation } from './base-analyzer.js';

export class TextAnalyzer extends BaseAnalyzer {
  public readonly supportedExtensions = ['.md', '.txt'];

  public async analyze(filePath: string): Promise<AnalysisResult> {
    const ext = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(filePath, 'utf-8');

    if (ext === '.txt') {
      return this.analyzeTxt(content);
    } else {
      return this.analyzeMd(filePath, content);
    }
  }

  private analyzeTxt(content: string): AnalysisResult {
    const facts = content
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    return { entities: [], relations: [], facts };
  }

  private analyzeMd(filePath: string, content: string): AnalysisResult {
    const lines = content.split('\n');
    const entities: Entity[] = [];
    const relations: Relation[] = [];
    const facts: string[] = [];

    const headingStack: { level: number, id: string, text: string }[] = [];
    const seenHeadings = new Set<string>();
    
    let inCodeBlock = false;
    let currentHeadingText: string | null = null;
    let currentHeadingId: string | null = null;

    const termToHeadings = new Map<string, Set<string>>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          const lang = line.trim().slice(3).trim() || 'none';
          entities.push(this.createEntity('code_block', `code_block (${lang})`, filePath, lineNum));
        }
        continue;
      }

      if (inCodeBlock) {
         continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        const id = this.generateEntityId(filePath, text);
        
        entities.push(this.createEntity(text, `heading (h${level})`, filePath, lineNum));
        
        if (seenHeadings.has(text)) {
           facts.push(`Conflict: Heading "${text}" appears more than once.`);
        }
        seenHeadings.add(text);

        let parentId: string | null = null;
        for (let j = headingStack.length - 1; j >= 0; j--) {
          if (headingStack[j].level < level) {
            parentId = headingStack[j].id;
            break;
          }
        }

        if (parentId) {
          relations.push(this.createRelation(parentId, id, 'contains'));
        }

        while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
          headingStack.pop();
        }
        headingStack.push({ level, id, text });
        
        currentHeadingText = text;
        currentHeadingId = id;
        continue;
      }

      const isBlank = line.trim().length === 0;
      if (!isBlank && currentHeadingText) {
        let semanticType = 'general';
        
        if (/\b[A-Z][a-z]+\s+(is|was|had)\b/.test(line)) {
           semanticType = 'character';
        } else if (/(fight|argue|struggle|conflict|vs|kill|attack|resolution|agreed|peace)/i.test(line)) {
           semanticType = 'conflict';
        } else if (/(chapter\s+\d+|before|after|then|next|later|yesterday|tomorrow)/i.test(line)) {
           semanticType = 'timeline';
        }
        
        if (semanticType !== 'general') {
           facts.push(JSON.stringify({ type: semanticType, heading: currentHeadingText, fact: line.trim() }));
        } else {
           facts.push(JSON.stringify({ heading: currentHeadingText, fact: line.trim() }));
        }
      }

      const boldRegex = /\*\*(.*?)\*\*|__(.*?)__/g;
      let boldMatch;
      while ((boldMatch = boldRegex.exec(line)) !== null) {
        let text = (boldMatch[1] || boldMatch[2]).trim();
        if (!text) continue;
        
        let type = 'emphasis';
        if (text.endsWith(':')) {
          text = text.slice(0, -1).trim();
        }

        if (currentHeadingText && currentHeadingText.toLowerCase().includes('character')) {
          type = 'character';
        }
        
        entities.push(this.createEntity(text, type, filePath, lineNum));
        
        if (currentHeadingId) {
           let headings = termToHeadings.get(text);
           if (!headings) {
              headings = new Set<string>();
              termToHeadings.set(text, headings);
           }
           headings.add(currentHeadingId);
        }
      }

      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let linkMatch;
      while ((linkMatch = linkRegex.exec(line)) !== null) {
        const text = linkMatch[1].trim();
        const url = linkMatch[2].trim();
        const id = this.generateEntityId(filePath, text);
        entities.push(this.createEntity(text, 'link', filePath, lineNum));
        relations.push(this.createRelation(id, url, 'references'));
      }
    }

    for (const [term, headings] of termToHeadings.entries()) {
      if (headings.size > 1) {
        for (const headingId of headings) {
          relations.push(this.createRelation(term, headingId, 'mentioned_in'));
        }
      }
    }

    return { entities, relations, facts };
  }
}
