import ts from 'typescript';
import fs from 'node:fs/promises';
import { BaseAnalyzer, AnalysisResult, Entity, Relation } from './base-analyzer.js';

export class TsAnalyzer extends BaseAnalyzer {
  public readonly supportedExtensions = ['.ts', '.js'];

  public async analyze(filePath: string): Promise<AnalysisResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const entities: Entity[] = [];
    const relations: Relation[] = [];
    const facts: string[] = [];

    const getJSDoc = (node: ts.Node): void => {
      const fullText = sourceFile.text;
      const commentRanges = ts.getLeadingCommentRanges(fullText, node.pos);
      if (commentRanges) {
        for (const range of commentRanges) {
          if (range.kind === ts.SyntaxKind.MultiLineCommentTrivia && fullText.charAt(range.pos + 2) === '*') {
            facts.push(fullText.substring(range.pos, range.end));
          }
        }
      }
    };

    const isExported = (node: ts.Node): boolean => {
      return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
    };

    let currentFunction: string | null = null;

    const visit = (node: ts.Node) => {
      let prevFunction = currentFunction;

      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        currentFunction = name;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const exported = isExported(node);
        entities.push(this.createEntity(name, exported ? 'exported function' : 'function', filePath, line, []));
        getJSDoc(node);
      } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
          currentFunction = node.parent.name.text;
        }
      } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
        currentFunction = node.name.text;
      }

      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const exported = isExported(node);
        entities.push(this.createEntity(name, exported ? 'exported class' : 'class', filePath, line, []));
        getJSDoc(node);

        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
              for (const type of clause.types) {
                const extendsName = type.expression.getText(sourceFile);
                relations.push(this.createRelation(this.generateEntityId(filePath, name), extendsName, 'extends'));
              }
            } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
              for (const type of clause.types) {
                const implementsName = type.expression.getText(sourceFile);
                relations.push(this.createRelation(this.generateEntityId(filePath, name), implementsName, 'implements'));
              }
            }
          }
        }
      }

      if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const exported = isExported(node);
        entities.push(this.createEntity(name, exported ? 'exported interface' : 'interface', filePath, line, []));
        getJSDoc(node);
      }

      if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const exported = isExported(node);
        entities.push(this.createEntity(name, exported ? 'exported type' : 'type', filePath, line, []));
        getJSDoc(node);
      }

      if (ts.isVariableStatement(node)) {
        const exported = isExported(node);
        getJSDoc(node);
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.text;
            const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1;
            entities.push(this.createEntity(name, exported ? 'exported variable' : 'variable', filePath, line, []));
          }
        }
      }

      if (ts.isCallExpression(node)) {
        if (currentFunction) {
          let callee = '';
          if (ts.isIdentifier(node.expression)) {
            callee = node.expression.text;
          } else if (ts.isPropertyAccessExpression(node.expression)) {
            callee = node.expression.name.text;
          }
          if (callee) {
            relations.push(this.createRelation(this.generateEntityId(filePath, currentFunction), callee, 'calls'));
          }
        }
      }

      if (ts.isImportDeclaration(node)) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          const moduleSpecifier = node.moduleSpecifier.text;
          relations.push(this.createRelation(filePath, moduleSpecifier, 'imports'));
        }
      }

      ts.forEachChild(node, visit);

      currentFunction = prevFunction;
    };

    visit(sourceFile);

    return { entities, relations, facts };
  }
}
