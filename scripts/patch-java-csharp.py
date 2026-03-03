#!/usr/bin/env python3
"""
Post-build: patches Java/C# with thin idiomatic sugar.

Most DX now lives in the TypeScript source (Strands.*, .ask(), .toolCall(), ToolBuilder).
These patches add ONLY what jsii can't express:
  - Java: @ToolMethod annotation, lambda-friendly toolOf(), static import helper
  - C#:   Extension methods, lambda-friendly ToolOf(), record-style ToolParam
"""

import sys
from pathlib import Path

# ─────────────────────────────────────────────────────────────
# Java sugar — thin layer on top of jsii-generated Strands.*
# ─────────────────────────────────────────────────────────────
SUGAR_JAVA = '''package io.github.strands.agents.jsii;

import java.util.*;
import java.lang.reflect.*;
import java.lang.annotation.*;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

/**
 * Idiomatic Java sugar for Strands Agents SDK.
 *
 * <h3>The 2-Line Agent (using jsii-native Strands class):</h3>
 * <pre>{@code
 * var agent = Strands.agent();                    // Bedrock default
 * agent.ask("What is 42 * 17?");                  // .ask() is on StrandsAgent
 *
 * // With model
 * var agent = Strands.agentWith(Strands.bedrock("us.anthropic.claude-sonnet-4-20250514-v1:0"), calc);
 *
 * // Fluent tool creation (jsii-native ToolBuilder)
 * var calc = Strands.tool("calculator", "Evaluate math")
 *     .param("expression", "string", "Math expression")
 *     .withHandler(handler)
 *     .create();
 *
 * // Direct tool call
 * agent.toolCall("calculator", "{\\"expression\\": \\"6 * 7\\"}");
 * }</pre>
 *
 * <h3>Java-only extras (things jsii can't generate):</h3>
 * <pre>{@code
 * // Lambda tool creation (Java-specific convenience)
 * var calc = Sugar.toolOf("calculator", "Evaluate math",
 *     params -> Map.of("result", eval((String) params.get("expression"))),
 *     Sugar.param("expression", "string", "Math expression", true));
 *
 * // @ToolMethod annotation on classes
 * List<FunctionTool> tools = Sugar.toolsFromClass(new MyToolClass());
 * }</pre>
 */
public final class Sugar {

    private static final Gson GSON = new GsonBuilder().create();

    private Sugar() {}

    // ── Lambda tool creation (Java can't do this via jsii) ──

    /**
     * Parameter definition for tool schema.
     */
    public static class Param {
        public final String name;
        public final String type;
        public final String description;
        public final boolean required;

        public Param(String name, String type, String description, boolean required) {
            this.name = name; this.type = type;
            this.description = description; this.required = required;
        }
    }

    /** Create a parameter definition. */
    public static Param param(String name, String type, String description, boolean required) {
        return new Param(name, type, description, required);
    }

    /** Shorthand: required string parameter. */
    public static Param param(String name, String description) {
        return new Param(name, "string", description, true);
    }

    /** Functional interface for tool execution. */
    @FunctionalInterface
    public interface ToolFunction {
        Object execute(Map<String, Object> params) throws Exception;
    }

    /**
     * Create a tool from a Java lambda.
     *
     * <pre>{@code
     * var greet = Sugar.toolOf("greet", "Greet someone",
     *     params -> "Hello, " + params.get("name") + "!",
     *     Sugar.param("name", "Person to greet"));
     * }</pre>
     */
    public static FunctionTool toolOf(String name, String description, ToolFunction fn, Param... params) {
        Map<String, Object> properties = new LinkedHashMap<>();
        List<String> required = new ArrayList<>();
        for (Param p : params) {
            properties.put(p.name, Map.of("type", p.type, "description", p.description));
            if (p.required) required.add(p.name);
        }
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        if (!required.isEmpty()) schema.put("required", required);
        String schemaJson = GSON.toJson(schema);

        ToolHandler handler = new ToolHandler() {
            @Override
            public String handle(String inputJson) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> input = GSON.fromJson(inputJson, Map.class);
                    Object result = fn.execute(input);
                    if (result instanceof String) {
                        try { GSON.fromJson((String) result, Object.class); return (String) result; }
                        catch (Exception e) { return GSON.toJson(Map.of("result", result)); }
                    }
                    return GSON.toJson(result);
                } catch (Exception e) {
                    return GSON.toJson(Map.of("error", e.getMessage()));
                }
            }
        };

        return new FunctionTool(name, description, schemaJson, handler);
    }

    // ── @ToolMethod annotation (Java-only reflection magic) ──

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    public @interface ToolMethod {
        String name() default "";
        String description() default "";
    }

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.PARAMETER)
    public @interface ToolParam {
        String name();
        String type() default "string";
        String description() default "";
        boolean required() default true;
    }

    /** Extract tools from an annotated class instance. */
    public static List<FunctionTool> toolsFromClass(Object instance) {
        List<FunctionTool> tools = new ArrayList<>();
        for (Method method : instance.getClass().getMethods()) {
            ToolMethod ann = method.getAnnotation(ToolMethod.class);
            if (ann == null) continue;

            String name = ann.name().isEmpty() ? method.getName() : ann.name();
            String desc = ann.description().isEmpty() ? "Tool: " + name : ann.description();

            List<Param> params = new ArrayList<>();
            for (Parameter p : method.getParameters()) {
                ToolParam tp = p.getAnnotation(ToolParam.class);
                if (tp != null) {
                    params.add(new Param(tp.name(), tp.type(), tp.description(), tp.required()));
                } else {
                    params.add(new Param(p.getName(), "string", p.getName(), true));
                }
            }

            final Object inst = instance;
            final Method m = method;
            FunctionTool tool = toolOf(name, desc, p -> {
                Object[] args = new Object[m.getParameterCount()];
                Parameter[] methodParams = m.getParameters();
                for (int i = 0; i < methodParams.length; i++) {
                    ToolParam tp = methodParams[i].getAnnotation(ToolParam.class);
                    String paramName = tp != null ? tp.name() : methodParams[i].getName();
                    args[i] = p.get(paramName);
                }
                return m.invoke(inst, args);
            }, params.toArray(new Param[0]));

            tools.add(tool);
        }
        return tools;
    }
}
''';

# ─────────────────────────────────────────────────────────────
# C# sugar — thin layer on top of jsii-generated Strands.*
# ─────────────────────────────────────────────────────────────
SUGAR_CSHARP = '''using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace Strands.Agents.Jsii
{
    /// <summary>
    /// Idiomatic C# sugar for Strands Agents SDK.
    ///
    /// <para>The 2-Line Agent (using jsii-native Strands class):</para>
    /// <code>
    /// var agent = Strands.Agent();                  // Bedrock default
    /// agent.Ask("What is 42 * 17?");                // .Ask() is on StrandsAgent
    ///
    /// // With model
    /// var agent = Strands.AgentWith(Strands.Bedrock(), calc);
    ///
    /// // Fluent tool creation (jsii-native ToolBuilder)
    /// var calc = Strands.Tool("calculator", "Evaluate math")
    ///     .Param("expression", "string", "Math expression")
    ///     .WithHandler(handler)
    ///     .Create();
    ///
    /// // Direct tool call
    /// agent.ToolCall("calculator", "{\"expression\": \"6 * 7\"}");
    /// </code>
    ///
    /// <para>C#-only extras (things jsii can't generate):</para>
    /// <code>
    /// // Lambda tool creation (C#-specific convenience)
    /// var calc = Sugar.ToolOf("calculator", "Evaluate math",
    ///     p => new { result = Eval((string)p["expression"]) },
    ///     new Sugar.ToolParam("expression", "string", "Math expression"));
    /// </code>
    /// </summary>
    public static class Sugar
    {
        // ── Lambda tool creation (C# can't do this via jsii) ──

        /// <summary>Parameter definition.</summary>
        public record ToolParam(string Name, string Type, string Description, bool Required = true);

        /// <summary>Shorthand: required string parameter.</summary>
        public static ToolParam Param(string name, string description)
            => new ToolParam(name, "string", description);

        /// <summary>Create a tool from a C# delegate.</summary>
        public static FunctionTool ToolOf(
            string name,
            string description,
            Func<Dictionary<string, object>, object> fn,
            params ToolParam[] parameters)
        {
            var properties = new Dictionary<string, object>();
            var required = new List<string>();

            foreach (var p in parameters)
            {
                properties[p.Name] = new { type = p.Type, description = p.Description };
                if (p.Required) required.Add(p.Name);
            }

            var schema = new Dictionary<string, object>
            {
                ["type"] = "object",
                ["properties"] = properties,
            };
            if (required.Count > 0) schema["required"] = required;

            var schemaJson = JsonSerializer.Serialize(schema);
            var handler = new LambdaToolHandler(fn);
            return new FunctionTool(name, description, schemaJson, handler);
        }
    }

    /// <summary>Lambda-backed ToolHandler for C# delegates.</summary>
    public class LambdaToolHandler : ToolHandler
    {
        private readonly Func<Dictionary<string, object>, object> _fn;

        public LambdaToolHandler(Func<Dictionary<string, object>, object> fn)
        {
            _fn = fn;
        }

        public override string Handle(string inputJson)
        {
            try
            {
                var input = JsonSerializer.Deserialize<Dictionary<string, object>>(inputJson);
                var result = _fn(input!);
                return result is string s ? s : JsonSerializer.Serialize(result);
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { error = ex.Message });
            }
        }
    }
}
''';


def patch_java(dist_dir="dist/java"):
    """Write Java sugar file."""
    java_dir = Path(dist_dir)
    java_dir.mkdir(parents=True, exist_ok=True)
    sugar_path = java_dir / "Sugar.java"
    print(f"Writing Java sugar to {sugar_path}")
    sugar_path.write_text(SUGAR_JAVA)
    print("✅ Java sugar written (thin layer — Strands.*, .ask(), .toolCall(), ToolBuilder are jsii-native)")


def patch_csharp(dist_dir="dist/dotnet"):
    """Write C# sugar file."""
    cs_dir = Path(dist_dir)
    cs_dir.mkdir(parents=True, exist_ok=True)
    sugar_path = cs_dir / "Sugar.cs"
    print(f"Writing C# sugar to {sugar_path}")
    sugar_path.write_text(SUGAR_CSHARP)
    print("✅ C# sugar written (thin layer — Strands.*, .Ask(), .ToolCall(), ToolBuilder are jsii-native)")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target in ("java", "all"):
        patch_java()
    if target in ("csharp", "dotnet", "all"):
        patch_csharp()
