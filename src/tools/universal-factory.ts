/**
 * UniversalToolFactory — create `use_X` style tools from jsii.
 *
 * The `use_X` pattern: wrap an ENTIRE library dynamically so the agent
 * can discover → describe → call any API in it. Zero hardcoded actions.
 *
 * Each language implements the actual resolution natively:
 * - Python: importlib.import_module + getattr + inspect.signature
 * - Java: Class.forName + reflection
 * - TypeScript: require/import + Reflect
 *
 * This factory just creates the ToolDefinition with the right schema.
 * The handler is provided by each language's native code.
 *
 * @example
 *
 * Python (via patch):
 *   # use_X tools are created with the @tool decorator or UniversalToolFactory
 *   boto3_tool = UniversalToolFactory.create("aws", "Universal AWS access via boto3")
 *   # Then register a Python-native handler that does importlib resolution
 *
 * TypeScript:
 *   const npmTool = UniversalToolFactory.create("npm_pkg", "Access any npm package");
 */

import { ToolSpecification } from './definition';
import { ToolHandler, FunctionTool } from './function-tool';

/**
 * Schema for the universal use_X pattern.
 * Every use_X tool has the same 4 parameters:
 * - module: dotted path to resolve (or "__discovery__" / "__describe__")
 * - method: method/function to call on the resolved target
 * - parameters: kwargs to pass
 * - label: human-readable description for logging
 */
const UNIVERSAL_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    module: {
      type: 'string',
      description: 'Dotted path to module/class/function. Use "__discovery__" to explore, "__describe__" to inspect.',
    },
    method: {
      type: 'string',
      description: 'Method or function to call on the resolved target. Use "__describe__" to inspect before calling.',
    },
    parameters: {
      type: 'object',
      description: 'Keyword arguments to pass to the method/function.',
    },
    label: {
      type: 'string',
      description: 'Human-readable description of this operation (for logging).',
    },
  },
  required: ['module'],
});

/**
 * Factory for creating universal `use_X` tool definitions.
 *
 * The factory creates tool definitions with the standard use_X schema.
 * The actual handler (discovery, describe, execute) is provided by the caller,
 * since each language resolves modules differently.
 */
export class UniversalToolFactory {
  /**
   * Create a use_X tool definition with the standard universal schema.
   *
   * @param libraryName - Name of the library (becomes the tool name: `use_{libraryName}`)
   * @param description - Description of what this tool provides access to
   * @param handler - The ToolHandler that implements discover/describe/execute
   * @returns A FunctionTool with the universal schema
   *
   * @example
   * // TypeScript
   * class MyHandler extends ToolHandler {
   *   handle(inputJson: string): string {
   *     const { module, method, parameters } = JSON.parse(inputJson);
   *     // resolve and call...
   *     return JSON.stringify({ status: 'success', result: '...' });
   *   }
   * }
   * const tool = UniversalToolFactory.create('my_lib', 'Access my_lib APIs', new MyHandler());
   */
  public static create(libraryName: string, description: string, handler: ToolHandler): FunctionTool {
    const toolName = `use_${libraryName}`;
    const fullDescription = `Universal ${libraryName} access — dynamically discover, inspect, and call any ${libraryName} API. ` + description;

    return new FunctionTool(toolName, fullDescription, UNIVERSAL_SCHEMA, handler);
  }

  /**
   * Create just the ToolSpecification (without a handler).
   * Useful when the handler will be attached later or from another language.
   *
   * @param libraryName - Name of the library
   * @param description - Description
   * @returns A ToolSpecification with the universal schema
   */
  public static createSpec(libraryName: string, description: string): ToolSpecification {
    const toolName = `use_${libraryName}`;
    const fullDescription = `Universal ${libraryName} access — dynamically discover, inspect, and call any ${libraryName} API. ` + description;
    return new ToolSpecification(toolName, fullDescription, UNIVERSAL_SCHEMA);
  }

  /**
   * Get the standard universal tool schema JSON.
   * Languages can use this to validate their handler implementations.
   */
  public static get schema(): string {
    return UNIVERSAL_SCHEMA;
  }

  private constructor() {}
}
