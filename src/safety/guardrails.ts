export class GuardrailConfig {
  public readonly guardrailId: string;
  public readonly guardrailVersion: string;
  public readonly trace: string;
  public readonly streamProcessingMode: string;
  public constructor(guardrailId: string, guardrailVersion: string, trace?: string, streamProcessingMode?: string) {
    this.guardrailId = guardrailId; this.guardrailVersion = guardrailVersion;
    this.trace = trace ?? 'enabled'; this.streamProcessingMode = streamProcessingMode ?? '';
  }
}
