/**
 * Wraps a StrandsAgent as a tool for multi-agent patterns.
 */
import { ToolDefinition, ToolSpecification } from './definition';

export class AgentTool extends ToolDefinition {
  private readonly _innerAgent: ToolDefinition;
  public constructor(name: string, description: string, agent: ToolDefinition) {
    super(new ToolSpecification(name, description, JSON.stringify({
      type: 'object',
      properties: { prompt: { type: 'string', description: 'The prompt to send to the sub-agent' } },
      required: ['prompt'],
    })));
    this._innerAgent = agent;
  }
  public execute(inputJson: string): string {
    const params = JSON.parse(inputJson);
    const prompt = params.prompt ?? '';
    try { return this._innerAgent.execute(JSON.stringify({ prompt })); }
    catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      return JSON.stringify({ error: error.message });
    }
  }
  public get innerAgent(): ToolDefinition { return this._innerAgent; }
}
