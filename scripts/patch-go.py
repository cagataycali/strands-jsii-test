#!/usr/bin/env python3
"""
Post-build: patches Go distribution with idiomatic Go sugar.

Most DX now lives in the TypeScript source (Strands.*, .Ask(), .ToolCall(), ToolBuilder).
This patch adds ONLY Go-specific idioms that jsii can't express:
  - Functional options pattern: NewAgent(WithModel(...), WithTools(...))
  - NewTool() helper for Go functions (map[string]interface{} → handler)
  - ToolFromFunc() with struct reflection
"""

import sys
from pathlib import Path

SUGAR_GO = '''package strandsagentsjsii

import (
\t"encoding/json"
\t"fmt"
\t"reflect"
\t"strings"
)

// ── Functional options for Agent ──
// Go idiom: NewAgent(WithModel(Bedrock()), WithTools(calc))

// AgentOpt configures an agent via functional options.
type AgentOpt func(*QuickAgentOptions)

// WithModel sets the model provider.
func WithModel(model ModelProvider) AgentOpt {
\treturn func(o *QuickAgentOptions) {
\t\to.Model = model
\t}
}

// WithSystemPrompt sets the system prompt.
func WithSystemPrompt(prompt string) AgentOpt {
\treturn func(o *QuickAgentOptions) {
\t\to.SystemPrompt = &prompt
\t}
}

// WithTools adds tools to the agent.
func WithTools(tools ...ToolDefinition) AgentOpt {
\treturn func(o *QuickAgentOptions) {
\t\to.Tools = append(o.Tools, tools...)
\t}
}

// WithMaxCycles sets the maximum agent loop cycles.
func WithMaxCycles(n int) AgentOpt {
\treturn func(o *QuickAgentOptions) {
\t\tn64 := float64(n)
\t\to.MaxCycles = &n64
\t}
}

// NewAgent creates an Agent with Go functional options.
// Delegates to the jsii-native Strands.Agent() underneath.
//
//   agent := NewAgent(
//       WithModel(Bedrock()),
//       WithTools(calculator),
//       WithSystemPrompt("You are helpful."),
//   )
//   response := agent.Ask("Hello!")
func NewAgent(opts ...AgentOpt) StrandsAgent {
\toptions := &QuickAgentOptions{}
\tfor _, opt := range opts {
\t\topt(options)
\t}
\treturn Strands_Agent(options)
}

// ── Bedrock/Anthropic/OpenAI/Gemini shorthands ──

// Bedrock creates a Bedrock model provider.
//   model := Bedrock()                                    // defaults
//   model := BedrockWithModel("us.anthropic.claude-sonnet-4-20250514-v1:0")
func BedrockDefault() BedrockModelProvider {
\treturn Strands_Bedrock(nil, nil)
}

func BedrockWithModel(modelId string) BedrockModelProvider {
\treturn Strands_Bedrock(&modelId, nil)
}

func BedrockWithRegion(modelId, region string) BedrockModelProvider {
\treturn Strands_Bedrock(&modelId, &region)
}

// AnthropicProvider creates an Anthropic model provider.
func AnthropicProvider(modelId, apiKey string) AnthropicModelProvider {
\treturn Strands_Anthropic(&modelId, &apiKey)
}

// OpenAIProvider creates an OpenAI model provider.
func OpenAIProvider(modelId, apiKey string) OpenAIModelProvider {
\treturn Strands_Openai(&modelId, &apiKey)
}

// GeminiProvider creates a Gemini model provider.
func GeminiProvider(modelId, apiKey string) GeminiModelProvider {
\treturn Strands_Gemini(&modelId, &apiKey)
}

// ── NewTool: create tools from Go functions ──

// ParamDef defines a tool parameter.
type ParamDef struct {
\tType        string
\tDescription string
\tRequired    bool
}

// GoToolHandler wraps a Go function as a ToolHandler.
type GoToolHandler struct {
\tToolHandler
\tfn func(map[string]interface{}) (interface{}, error)
}

// Handle implements ToolHandler.
func (h *GoToolHandler) Handle(inputJSON string) string {
\tvar params map[string]interface{}
\tif err := json.Unmarshal([]byte(inputJSON), &params); err != nil {
\t\treturn fmt.Sprintf(`{"error": "%s"}`, err.Error())
\t}
\tresult, err := h.fn(params)
\tif err != nil {
\t\treturn fmt.Sprintf(`{"error": "%s"}`, err.Error())
\t}
\tswitch v := result.(type) {
\tcase string:
\t\tif json.Valid([]byte(v)) {
\t\t\treturn v
\t\t}
\t\tb, _ := json.Marshal(map[string]string{"result": v})
\t\treturn string(b)
\tdefault:
\t\tb, err := json.Marshal(result)
\t\tif err != nil {
\t\t\treturn fmt.Sprintf(`{"result": "%v"}`, result)
\t\t}
\t\treturn string(b)
\t}
}

// NewTool creates a FunctionTool from a Go function.
//
//   calculator := NewTool("calculator", "Evaluate math",
//       func(params map[string]interface{}) (interface{}, error) {
//           expr := params["expression"].(string)
//           return map[string]interface{}{"result": 42}, nil
//       },
//       map[string]ParamDef{
//           "expression": {Type: "string", Description: "Math expression", Required: true},
//       },
//   )
func NewTool(
\tname string,
\tdescription string,
\tfn func(map[string]interface{}) (interface{}, error),
\tparams map[string]ParamDef,
) FunctionTool {
\tproperties := make(map[string]interface{})
\trequired := []string{}

\tfor pName, pDef := range params {
\t\tpType := pDef.Type
\t\tif pType == "" {
\t\t\tpType = "string"
\t\t}
\t\tproperties[pName] = map[string]string{
\t\t\t"type":        pType,
\t\t\t"description": pDef.Description,
\t\t}
\t\tif pDef.Required {
\t\t\trequired = append(required, pName)
\t\t}
\t}

\tschema := map[string]interface{}{
\t\t"type":       "object",
\t\t"properties": properties,
\t}
\tif len(required) > 0 {
\t\tschema["required"] = required
\t}
\tschemaJSON, _ := json.Marshal(schema)

\thandler := &GoToolHandler{fn: fn}
\treturn *NewFunctionTool(name, description, string(schemaJSON), handler)
}

// ── ToolFromFunc: auto-detect params via reflection ──

// ToolFromFunc creates a tool from a Go function using struct reflection.
//
//   type CalcInput struct {
//       Expression string `json:"expression" desc:"Math expression"`
//   }
//   calculator := ToolFromFunc("calculator", "Evaluate math",
//       func(input CalcInput) (interface{}, error) {
//           return map[string]interface{}{"result": input.Expression}, nil
//       },
//   )
func ToolFromFunc(name, description string, fn interface{}) FunctionTool {
\tfnType := reflect.TypeOf(fn)
\tif fnType.Kind() != reflect.Func || fnType.NumIn() != 1 {
\t\tpanic("ToolFromFunc: fn must be a function with exactly 1 struct parameter")
\t}

\tinputType := fnType.In(0)
\tproperties := make(map[string]interface{})
\trequired := []string{}

\tfor i := 0; i < inputType.NumField(); i++ {
\t\tfield := inputType.Field(i)
\t\tjsonName := field.Tag.Get("json")
\t\tif jsonName == "" || jsonName == "-" {
\t\t\tjsonName = strings.ToLower(field.Name)
\t\t}
\t\tdesc := field.Tag.Get("desc")
\t\tif desc == "" {
\t\t\tdesc = field.Name
\t\t}

\t\tvar jType string
\t\tswitch field.Type.Kind() {
\t\tcase reflect.String:
\t\t\tjType = "string"
\t\tcase reflect.Int, reflect.Int64, reflect.Float64:
\t\t\tjType = "number"
\t\tcase reflect.Bool:
\t\t\tjType = "boolean"
\t\tdefault:
\t\t\tjType = "string"
\t\t}

\t\tproperties[jsonName] = map[string]string{"type": jType, "description": desc}
\t\trequired = append(required, jsonName)
\t}

\tschema := map[string]interface{}{"type": "object", "properties": properties}
\tif len(required) > 0 {
\t\tschema["required"] = required
\t}
\tschemaJSON, _ := json.Marshal(schema)

\tfnValue := reflect.ValueOf(fn)
\thandler := &GoToolHandler{fn: func(params map[string]interface{}) (interface{}, error) {
\t\tinputVal := reflect.New(inputType).Elem()
\t\tb, _ := json.Marshal(params)
\t\tjson.Unmarshal(b, inputVal.Addr().Interface())
\t\tresults := fnValue.Call([]reflect.Value{inputVal})
\t\tvar result interface{}
\t\tvar err error
\t\tif len(results) > 0 {
\t\t\tresult = results[0].Interface()
\t\t}
\t\tif len(results) > 1 && !results[1].IsNil() {
\t\t\terr = results[1].Interface().(error)
\t\t}
\t\treturn result, err
\t}}

\treturn *NewFunctionTool(name, description, string(schemaJSON), handler)
}
'''


def patch(dist_dir="dist/go"):
    go_dir = Path(dist_dir) / "strandsagentsjsii"
    if not go_dir.exists():
        print(f"Go dist not found at {go_dir}, creating...")
        go_dir.mkdir(parents=True, exist_ok=True)

    sugar_path = go_dir / "sugar.go"
    print(f"Writing Go sugar to {sugar_path}")
    sugar_path.write_text(SUGAR_GO)
    print("✅ Go sugar written (thin layer — Strands.*, .Ask(), .ToolCall(), ToolBuilder are jsii-native)")
    print()
    print("Usage:")
    print("  agent := NewAgent(WithModel(BedrockDefault()), WithTools(calc))")
    print('  agent.Ask("What is 42 * 17?")')


if __name__ == "__main__":
    patch(sys.argv[1] if len(sys.argv) > 1 else "dist/go")
