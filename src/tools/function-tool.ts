import { ToolDefinition, ToolSpecification } from './definition';

/**
 * Abstract callback interface for function-based tools.
 *
 * Implement this in any language to create a tool from a function.
 * The Python @tool decorator auto-generates this.
 *
 * @example
 *
 * In Python (with @tool decorator):
 * @tool
 * def calculator(expression: str) -> str:
 *     """Evaluate a math expression."""
 *     return str(eval(expression))
 *
 * In Java:
 * ToolHandler handler = new ToolHandler() {
 *     public String handle(String inputJson) {
 *         // parse and execute
 *     }
 * };
 * FunctionTool tool = new FunctionTool("calc", "Math eval", schemaJson, handler);
 */
export abstract class ToolHandler {
  /**
   * Handle a tool invocation.
   * @param inputJson JSON string of tool input parameters
   * @returns JSON string of tool result
   */
  public abstract handle(inputJson: string): string;
}

/**
 * A tool backed by a ToolHandler callback.
 *
 * This is the bridge between function-based tools and jsii's class-based system.
 * In Python, the @tool decorator creates these automatically.
 * In other languages, instantiate directly with a ToolHandler implementation.
 *
 * @example
 *
 * In TypeScript:
 * class MyHandler extends ToolHandler {
 *   handle(inputJson: string): string {
 *     const params = JSON.parse(inputJson);
 *     return JSON.stringify({ result: params.x + params.y });
 *   }
 * }
 * const tool = new FunctionTool("add", "Add numbers", schemaJson, new MyHandler());
 */
export class FunctionTool extends ToolDefinition {
  private readonly _handler: ToolHandler;

  /**
   * Create a function-based tool.
   * @param name Tool name
   * @param description Tool description
   * @param inputSchemaJson JSON Schema for input parameters
   * @param handler The callback that executes the tool logic
   */
  public constructor(name: string, description: string, inputSchemaJson: string, handler: ToolHandler) {
    super(new ToolSpecification(name, description, inputSchemaJson));
    this._handler = handler;
  }

  /** Execute the tool by delegating to the handler. */
  public execute(inputJson: string): string {
    try {
      return this._handler.handle(inputJson);
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      return JSON.stringify({ error: error.message });
    }
  }

  /** Get the handler. */
  public get handler(): ToolHandler {
    return this._handler;
  }
}

/**
 * Builder for creating FunctionTool instances with a fluent API.
 *
 * Useful in languages where constructors with many args are awkward.
 *
 * @example
 *
 * tool = (ToolBuilder("greet", handler)
 *     .description("Greet someone")
 *     .add_string_param("name", "Person to greet", True)
 *     .add_number_param("times", "How many times", False)
 *     .build())
 */
export class ToolBuilder {
  private readonly _name: string;
  private _handler: ToolHandler;
  private _description: string;
  private readonly _properties: Record<string, object>;
  private readonly _required: string[];

  /**
   * Start building a tool.
   * @param name Tool name
   * @param handler Tool execution handler
   */
  public constructor(name: string, handler: ToolHandler) {
    this._name = name;
    this._handler = handler;
    this._description = '';
    this._properties = {};
    this._required = [];
  }

  /** Set the tool description. */
  public description(desc: string): ToolBuilder {
    this._description = desc;
    return this;
  }

  /**
   * Add a string parameter.
   * @param name Parameter name
   * @param paramDescription Parameter description
   * @param required Whether the parameter is required
   */
  public addStringParam(name: string, paramDescription: string, required?: boolean): ToolBuilder {
    this._properties[name] = { type: 'string', description: paramDescription };
    if (required) this._required.push(name);
    return this;
  }

  /**
   * Add a number parameter.
   * @param name Parameter name
   * @param paramDescription Parameter description
   * @param required Whether the parameter is required
   */
  public addNumberParam(name: string, paramDescription: string, required?: boolean): ToolBuilder {
    this._properties[name] = { type: 'number', description: paramDescription };
    if (required) this._required.push(name);
    return this;
  }

  /**
   * Add a boolean parameter.
   * @param name Parameter name
   * @param paramDescription Parameter description
   * @param required Whether the parameter is required
   */
  public addBooleanParam(name: string, paramDescription: string, required?: boolean): ToolBuilder {
    this._properties[name] = { type: 'boolean', description: paramDescription };
    if (required) this._required.push(name);
    return this;
  }

  /**
   * Add an array parameter.
   * @param name Parameter name
   * @param paramDescription Parameter description
   * @param itemType Type of array items (string, number, etc.)
   * @param required Whether the parameter is required
   */
  public addArrayParam(name: string, paramDescription: string, itemType?: string, required?: boolean): ToolBuilder {
    this._properties[name] = {
      type: 'array',
      description: paramDescription,
      items: { type: itemType ?? 'string' },
    };
    if (required) this._required.push(name);
    return this;
  }

  /**
   * Add an object parameter with custom JSON schema.
   * @param name Parameter name
   * @param paramDescription Parameter description
   * @param schemaJson JSON schema for the object
   * @param required Whether the parameter is required
   */
  public addObjectParam(name: string, paramDescription: string, schemaJson: string, required?: boolean): ToolBuilder {
    const schema = JSON.parse(schemaJson);
    schema.description = paramDescription;
    this._properties[name] = schema;
    if (required) this._required.push(name);
    return this;
  }

  /**
   * Add a parameter with type, description, and required flag in one call.
   *
   * Universal fluent shorthand:
   *   Python:     .param("name", "string", "Description", True)
   *   TypeScript: .param("name", "string", "Description", true)
   *   Java:       .param("name", "string", "Description", true)
   *   C#:         .Param("name", "string", "Description", true)
   *   Go:         .Param("name", "string", "Description", true)
   *
   * @param name Parameter name
   * @param paramType Parameter type (string, number, boolean, array, object)
   * @param paramDescription Parameter description
   * @param required Whether the parameter is required. Default: true
   */
  public param(name: string, paramType: string, paramDescription: string, required?: boolean): ToolBuilder {
    this._properties[name] = { type: paramType, description: paramDescription };
    if (required !== false) this._required.push(name);
    return this;
  }

  /**
   * Assign the handler for this tool. Alternative to passing handler in constructor.
   *
   * Enables the fluent pattern:
   *   ToolBuilder("calc").description("Math").param(...).withHandler(h).create()
   *
   * @param handler The tool handler
   */
  public withHandler(handler: ToolHandler): ToolBuilder {
    this._handler = handler;
    return this;
  }

  /** Build the FunctionTool. */
  public create(): FunctionTool {
    const inputSchema = JSON.stringify({
      type: 'object',
      properties: this._properties,
      required: this._required.length > 0 ? this._required : undefined,
    });
    return new FunctionTool(this._name, this._description, inputSchema, this._handler);
  }
}
