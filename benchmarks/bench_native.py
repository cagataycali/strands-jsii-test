#!/usr/bin/env python3
"""
Benchmark: strands-agents (native Python SDK)

Same agent, same input, same runtime.
Profiles: cProfile flamegraph, viztracer call tree, pyinstrument tree.
"""

import os
import sys
import time
import json
import cProfile
import pstats
import io
import tracemalloc
import resource

# ── Config ──
PROMPT = "say hello 50 times."
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "results", "native")
os.makedirs(OUTPUT_DIR, exist_ok=True)

os.environ.setdefault("BYPASS_TOOL_CONSENT", "true")


def build_agent():
    """Build the agent using native strands-agents SDK."""
    from strands import Agent, tool

    @tool
    def hello(text: str) -> str:
        """Say hello to someone."""
        return f"Hello {text}"

    return Agent(tools=[hello])


def run_benchmark():
    print("=" * 60)
    print("BENCHMARK: strands-agents (native Python SDK)")
    print("  Single-process architecture (no child processes)")
    print("=" * 60)

    metrics = {
        "sdk": "strands-agents",
        "prompt": PROMPT,
        "python_version": sys.version,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    # ── 1. Import time ──
    t0 = time.perf_counter()
    from strands import Agent, tool
    import_time = time.perf_counter() - t0
    metrics["import_time_s"] = import_time
    print(f"  Import time: {import_time:.4f}s")

    # ── 2. Agent construction time ──
    t0 = time.perf_counter()
    agent = build_agent()
    construct_time = time.perf_counter() - t0
    metrics["construct_time_s"] = construct_time
    print(f"  Agent construction: {construct_time:.4f}s")

    # ── 3. Memory baseline ──
    tracemalloc.start()
    mem_before = tracemalloc.get_traced_memory()
    ru_before = resource.getrusage(resource.RUSAGE_SELF)
    ru_children_before = resource.getrusage(resource.RUSAGE_CHILDREN)

    # ── 4. cProfile the agent invocation ──
    profiler = cProfile.Profile()
    profiler.enable()

    t0 = time.perf_counter()
    result = agent(PROMPT)
    invoke_time = time.perf_counter() - t0

    profiler.disable()

    metrics["invoke_time_s"] = invoke_time
    print(f"  Invoke time: {invoke_time:.4f}s")

    # ── 5. Memory after ──
    mem_after = tracemalloc.get_traced_memory()
    ru_after = resource.getrusage(resource.RUSAGE_SELF)
    ru_children_after = resource.getrusage(resource.RUSAGE_CHILDREN)
    tracemalloc.stop()

    # Python process memory
    metrics["python_memory_peak_mb"] = mem_after[1] / (1024 * 1024)
    metrics["python_memory_current_mb"] = mem_after[0] / (1024 * 1024)
    metrics["python_max_rss_mb"] = ru_after.ru_maxrss / (1024 * 1024) if sys.platform == "darwin" else ru_after.ru_maxrss / 1024
    metrics["python_user_cpu_s"] = ru_after.ru_utime - ru_before.ru_utime
    metrics["python_system_cpu_s"] = ru_after.ru_stime - ru_before.ru_stime

    # Children (should be ~0 for native SDK)
    metrics["children_user_cpu_s"] = ru_children_after.ru_utime - ru_children_before.ru_utime
    metrics["children_system_cpu_s"] = ru_children_after.ru_stime - ru_children_before.ru_stime
    metrics["children_max_rss_mb"] = ru_children_after.ru_maxrss / (1024 * 1024) if sys.platform == "darwin" else ru_children_after.ru_maxrss / 1024

    # Combined totals (for native, combined == python-only since no children)
    metrics["combined_rss_mb"] = metrics["python_max_rss_mb"]  # No child processes
    metrics["combined_cpu_user_s"] = metrics["python_user_cpu_s"] + metrics["children_user_cpu_s"]
    metrics["combined_cpu_system_s"] = metrics["python_system_cpu_s"] + metrics["children_system_cpu_s"]
    metrics["nodejs_total_rss_mb"] = 0  # No Node.js process
    metrics["nodejs_processes"] = []

    # Legacy keys
    metrics["memory_peak_mb"] = metrics["python_memory_peak_mb"]
    metrics["max_rss_mb"] = metrics["python_max_rss_mb"]
    metrics["user_cpu_time_s"] = metrics["python_user_cpu_s"]
    metrics["system_cpu_time_s"] = metrics["python_system_cpu_s"]
    metrics["result_length"] = len(str(result))

    # ── Print results ──
    print()
    print("  ── Python Process (single process) ──")
    print(f"  Memory peak (tracemalloc): {metrics['python_memory_peak_mb']:.2f} MB")
    print(f"  Max RSS: {metrics['python_max_rss_mb']:.2f} MB")
    print(f"  User CPU: {metrics['python_user_cpu_s']:.3f}s")
    print(f"  System CPU: {metrics['python_system_cpu_s']:.3f}s")

    print()
    print("  ── Child Processes ──")
    print(f"  (none — native SDK is single-process)")

    print()
    print("  ── Combined Total ──")
    print(f"  Total RSS: {metrics['combined_rss_mb']:.2f} MB")
    print(f"  Total CPU (user): {metrics['combined_cpu_user_s']:.3f}s")
    print(f"  Total CPU (system): {metrics['combined_cpu_system_s']:.3f}s")

    # ── 6. Save cProfile stats ──
    stats_path = os.path.join(OUTPUT_DIR, "profile.prof")
    profiler.dump_stats(stats_path)

    s = io.StringIO()
    ps = pstats.Stats(profiler, stream=s).sort_stats("cumulative")
    ps.print_stats(80)
    stats_text = s.getvalue()
    with open(os.path.join(OUTPUT_DIR, "profile_stats.txt"), "w") as f:
        f.write(stats_text)

    s2 = io.StringIO()
    ps2 = pstats.Stats(profiler, stream=s2).sort_stats("tottime")
    ps2.print_stats(30)
    metrics["top_functions"] = s2.getvalue()

    # ── 7. Save metrics ──
    json_metrics = {k: v for k, v in metrics.items() if k != "top_functions"}
    with open(os.path.join(OUTPUT_DIR, "metrics.json"), "w") as f:
        json.dump(json_metrics, f, indent=2)

    with open(os.path.join(OUTPUT_DIR, "top_functions.txt"), "w") as f:
        f.write(metrics["top_functions"])

    # ── 8. Save result sample ──
    with open(os.path.join(OUTPUT_DIR, "result.txt"), "w") as f:
        f.write(str(result))

    print(f"\n  Results saved to: {OUTPUT_DIR}")
    print(f"  Profile: {stats_path}")
    return metrics


if __name__ == "__main__":
    run_benchmark()
