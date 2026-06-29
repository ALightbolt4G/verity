export interface Relation {
  from: string;
  to: string;
  type: string;
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  filePath: string;
  line: number;
  relations: Relation[];
}

export interface AnalysisResult {
  entities: Entity[];
  relations: Relation[];
  facts: string[];
}

export abstract class BaseAnalyzer {
  public abstract readonly supportedExtensions: string[];

  public abstract analyze(filePath: string): Promise<AnalysisResult>;

  protected generateEntityId(filePath: string, name: string): string {
    return `${filePath}#${name}`;
  }

  protected createEntity(
    name: string,
    type: string,
    filePath: string,
    line: number,
    relations: Relation[] = []
  ): Entity {
    return {
      id: this.generateEntityId(filePath, name),
      name,
      type,
      filePath,
      line,
      relations
    };
  }

  protected createRelation(from: string, to: string, type: string): Relation {
    return { from, to, type };
  }
}
