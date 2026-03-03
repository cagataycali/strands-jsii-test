export class Identifier {
  private constructor() {}
  public static generate(prefix?: string): string {
    const p = prefix ?? 'strands';
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${p}-${ts}-${rand}`;
  }
}
