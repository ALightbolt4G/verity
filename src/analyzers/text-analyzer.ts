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
    const lines = content.split('\n');
    const facts: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length > 0) {
        facts.push(line);
        facts.push(...this.analyzeEnglishContext(line, i + 1, null));
      }
    }
    
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

      if (!isBlank) {
        facts.push(...this.analyzeEnglishContext(line, lineNum, currentHeadingText));
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

  private analyzeEnglishContext(line: string, lineNum: number, heading: string | null): string[] {
    const extractedFacts: string[] = [];
    const quoteCount = (line.match(/["']/g) || []).length;
    if (quoteCount > 3) return extractedFacts;
    const h = heading || 'None';

    const svoRegex = /\b([A-Z][a-z]+)\s+([a-z]+(?:ed|s)?)\s+([A-Z][a-z]+)\b/g;
    let svoMatch;
    while ((svoMatch = svoRegex.exec(line)) !== null) {
      if (!['The', 'A', 'An', 'This', 'That'].includes(svoMatch[1])) {
        extractedFacts.push(JSON.stringify({ type: "action", subject: svoMatch[1], verb: svoMatch[2], object: svoMatch[3], heading: h }));
      }
    }

    const negRegex = /\b([A-Z][a-z]+)\s+(is not|never|no longer)\s+([^.!?]+)/g;
    let negMatch;
    const negatedNames = new Set<string>();
    while ((negMatch = negRegex.exec(line)) !== null) {
      extractedFacts.push(JSON.stringify({ type: "negation", name: negMatch[1], negated_state: negMatch[3].trim(), heading: h }));
      negatedNames.add(negMatch[1]);
    }

    const stateRegex = /\b([A-Z][a-z]+)\s+(is|was|had|felt|became)\s+([^.!?]+)/g;
    let stateMatch;
    while ((stateMatch = stateRegex.exec(line)) !== null) {
      if (!negatedNames.has(stateMatch[1]) && !line.substring(stateMatch.index, Math.min(stateMatch.index + 20, line.length)).includes(' not ')) {
        extractedFacts.push(JSON.stringify({ type: "character_state", name: stateMatch[1], state: stateMatch[3].trim(), heading: h }));
      }
    }

    const causalRegex = /([^.!?]+)\b(because|therefore|so|as a result)\b([^.!?]+)/gi;
    let causalMatch;
    while ((causalMatch = causalRegex.exec(line)) !== null) {
      let cause = '';
      let effect = '';
      const conj = causalMatch[2].toLowerCase();
      if (conj === 'because') {
        effect = causalMatch[1].trim();
        cause = causalMatch[3].trim();
      } else {
        cause = causalMatch[1].trim();
        effect = causalMatch[3].trim();
      }
      extractedFacts.push(JSON.stringify({ type: "causal", cause, effect, heading: h }));
    }

    const tempRegex = /\b(before|after|then|when|finally|later)\b\s+([^.!?]+)/gi;
    let tempMatch;
    while ((tempMatch = tempRegex.exec(line)) !== null) {
      extractedFacts.push(JSON.stringify({ type: "temporal", marker: tempMatch[1].toLowerCase(), context: tempMatch[2].trim(), heading: h }));
    }

    return extractedFacts;
  }
}
