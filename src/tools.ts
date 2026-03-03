/**
 * Tool definitions for jsii multi-language bindings.
 *
 * jsii doesn't support function types or callbacks in the same way as TypeScript,
 * so tools are defined as abstract classes that users implement in their target language.
 */

/**
 * Specification for a tool that can be used by the model.
 *
 * Defines the tool's name, description, and input schema.
 * The input schema is a JSON Schema string that describes the expected input format.
 *
 * @example
 *
 * In Python:
 * spec = ToolSpecification(
 *     name="calculator",
 *     description="Performs arithmetic operations",
 *     input_schema_json='{"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]}'
 * )
 */
export class ToolSpecification {
  /**
   * The unique name of the tool.
   */
  public readonly name: string;

  /**
   * A description of what the tool does.
   */
  public readonly description: string;

  /**
   * JSON Schema for the tool's input, as a JSON string.
   *
   * jsii doesn't support arbitrary object types, so the schema is passed as a JSON string.
   * This should be a valid JSON Schema object that describes the expected input format.
   */
  public readonly inputSchemaJson: string;

  /**
   * Creates a new tool specification.
   * @param name Unique tool name
   * @param description Description of the tool
   * @param inputSchemaJson JSON Schema string for the input
   */
  public constructor(name: string, description: string, inputSchemaJson: string) {
    this.name = name;
    this.description = description;
    this.inputSchemaJson = inputSchemaJson;
  }
}

/**
 * Abstract base class for tool implementations.
 *
 * Extend this class to create tools that the agent can use.
 * Implement the `execute` method with your tool's logic.
 *
 * jsii doesn't support async generators or function callbacks, so tools
 * are modeled as abstract classes with a Promise-based execute method.
 *
 * @example
 *
 * In Python:
 * class Calculator(ToolDefinition):
 *     def __init__(self):
 *         super().__init__(ToolSpecification(
 *             "calculator",
 *             "Evaluates math expressions",
 *             '{"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]}'
 *         ))
 *
 *     def execute(self, input_json: str) -> str:
 *         import json
 *         params = json.loads(input_json)
 *         result = eval(params["expression"])
 *         return json.dumps({"result": result})
 *
 * In Java:
 * public class Calculator extends ToolDefinition {
 *     public Calculator() {
 *         super(new ToolSpecification(
 *             "calculator",
 *             "Evaluates math expressions",
 *             "{\"type\": \"object\", \"properties\": {\"expression\": {\"type\": \"string\"}}, \"required\": [\"expression\"]}"
 *         ));
 *     }
 *
 *     @Override
 *     public String execute(String inputJson) {
 *         // Parse input and compute result
 *         return "{\"result\": 4}";
 *     }
 * }
 */
export abstract class ToolDefinition {
  /**
   * The tool's specification (name, description, input schema).
   */
  public readonly spec: ToolSpecification;

  /**
   * Creates a new tool definition with the given specification.
   * @param spec The tool specification
   */
  public constructor(spec: ToolSpecification) {
    this.spec = spec;
  }

  /**
   * Execute the tool with the given input.
   *
   * Input is passed as a JSON string matching the tool's input schema.
   * The return value should be a JSON string containing the result.
   *
   * @param inputJson JSON string of the input parameters
   * @returns JSON string of the result
   */
  public abstract execute(inputJson: string): string;
}
