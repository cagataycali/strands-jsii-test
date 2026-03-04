#!/usr/bin/env python3
"""
Benchmark: strands-jsii (JSII Python bindings)

Same agent, same input, same runtime.
Profiles: cProfile flamegraph, viztracer call tree, pyinstrument tree.
Measures BOTH Python process AND Node.js child process memory.
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
import subprocess

# ── Config ──
PROMPT = "say hello 50 times."
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "results", "jsii")
os.makedirs(OUTPUT_DIR, exist_ok=True)

os.environ.setdefault("BYPASS_TOOL_CONSENT", "true")


def get_node_process_info():
    """Find the JSII Node.js child process and get its memory info.

    Returns dict with pid, rss_mb, vsz_mb or None if not found.
    """
    try:
        # The JSII runtime stores the Node.js process in the kernel provider.
        # We can access it through the jsii module internals.
        import jsii._kernel

        kernel = jsii._kernel.Kernel()
        provider = kernel.provider

        # The provider has a _process attribute which is a _NodeProcess
        # _NodeProcess has a _process attribute which is subprocess.Popen
        node_proc = None

        # Try to get the process from the provider chain
        if hasattr(provider, '_process'):
            proc_obj = provider._process
            if hasattr(proc_obj, '_process'):
                node_proc = proc_obj._process  # subprocess.Popen
            elif hasattr(proc_obj, 'pid'):
                node_proc = proc_obj

        if node_proc and hasattr(node_proc, 'pid'):
            pid = node_proc.pid
            return _get_process_memory(pid)
    except Exception as e:
        pass

    # Fallback: find node process by scanning ps
    return _find_node_process_by_ps()


def _get_process_memory(pid):
    """Get memory info for a specific PID using ps."""
    try:
        result = subprocess.run(
            ["ps", "-o", "pid,rss,vsz,command", "-p", str(pid)],
            capture_output=True, text=True, timeout=5
        )
        lines = result.stdout.strip().split("\n")
        if len(lines) >= 2:
            parts = lines[1].split(None, 3)
            if len(parts) >= 3:
                rss_kb = int(parts[1])
                vsz_kb = int(parts[2])
                return {
                    "pid": pid,
                    "rss_mb": rss_kb / 1024,
                    "vsz_mb": vsz_kb / 1024,
                    "command": parts[3] if len(parts) > 3 else "node",
                }
    except Exception:
        pass
    return None


def _find_node_process_by_ps():
    """Fallback: find jsii node process via ps + grep."""
    try:
        result = subprocess.run(
            ["ps", "aux"], capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.split("\n"):
            if "jsii-runtime" in line and "node" in line.lower():
                parts = line.split(None, 10)
                if len(parts) >= 6:
                    pid = int(parts[1])
                    rss_kb = int(parts[5])
                    vsz_kb = int(parts[4])
                    return {
                        "pid": pid,
                        "rss_mb": rss_kb / 1024,
                        "vsz_mb": vsz_kb / 1024,
                        "command": parts[10] if len(parts) > 10 else "node (jsii)",
                    }
    except Exception:
        pass
    return None


def get_all_child_processes(parent_pid=None):
    """Get memory for all child processes (Node.js + any workers)."""
    if parent_pid is None:
        parent_pid = os.getpid()

    children = []
    try:
        # Use pgrep to find children
        result = subprocess.run(
            ["pgrep", "-P", str(parent_pid)],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.strip().split("\n"):
            if line.strip():
                child_pid = int(line.strip())
                info = _get_process_memory(child_pid)
                if info:
                    children.append(info)
                    # Also check grandchildren (worker threads show as threads, not processes,
                    # but any sub-spawned processes would show here)
                    grandchildren_result = subprocess.run(
                        ["pgrep", "-P", str(child_pid)],
                        capture_output=True, text=True, timeout=5
                    )
                    for gc_line in grandchildren_result.stdout.strip().split("\n"):
                        if gc_line.strip():
                            gc_pid = int(gc_line.strip())
                            gc_info = _get_process_memory(gc_pid)
                            if gc_info:
                                children.append(gc_info)
    except Exception:
        pass

    return children


def build_agent():
    """Build the agent using strands-jsii SDK."""
    from strands_jsii import Agent, tool

    @tool
    def hello(text: str) -> str:
        """Say hello to someone."""
        return f"Hello {text}"

    return Agent(tools=[hello])


def run_benchmark():
    print("=" * 60)
    print("BENCHMARK: strands-jsii (JSII Python bindings)")
    print("  Worker Threads + Atomics.wait architecture")
    print("  Measures: Python process + Node.js child process")
    print("=" * 60)

    metrics = {
        "sdk": "strands-jsii",
        "prompt": PROMPT,
        "python_version": sys.version,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }

    # ── 1. Import time ──
    t0 = time.perf_counter()
    from strands_jsii import Agent, tool
    import_time = time.perf_counter() - t0
    metrics["import_time_s"] = import_time
    print(f"  Import time: {import_time:.4f}s")

    # ── 2. Agent construction time ──
    t0 = time.perf_counter()
    agent = build_agent()
    construct_time = time.perf_counter() - t0
    metrics["construct_time_s"] = construct_time
    print(f"  Agent construction: {construct_time:.4f}s")

    # ── Snapshot Node.js memory BEFORE invoke ──
    node_before = get_all_child_processes()
    node_rss_before = sum(c["rss_mb"] for c in node_before) if node_before else 0

    # ── 3. Memory baseline ──
    tracemalloc.start()
    mem_before = tracemalloc.get_traced_memory()
    ru_before = resource.getrusage(resource.RUSAGE_SELF)
    # Also track children resource usage
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

    # Children (Node.js) resource usage from getrusage
    metrics["children_user_cpu_s"] = ru_children_after.ru_utime - ru_children_before.ru_utime
    metrics["children_system_cpu_s"] = ru_children_after.ru_stime - ru_children_before.ru_stime
    metrics["children_max_rss_mb"] = ru_children_after.ru_maxrss / (1024 * 1024) if sys.platform == "darwin" else ru_children_after.ru_maxrss / 1024

    # ── Snapshot Node.js memory AFTER invoke ──
    node_after = get_all_child_processes()
    node_rss_after = sum(c["rss_mb"] for c in node_after) if node_after else 0

    metrics["nodejs_processes"] = node_after
    metrics["nodejs_total_rss_mb"] = node_rss_after
    metrics["nodejs_rss_delta_mb"] = node_rss_after - node_rss_before

    # Combined totals
    metrics["combined_rss_mb"] = metrics["python_max_rss_mb"] + node_rss_after
    metrics["combined_cpu_user_s"] = metrics["python_user_cpu_s"] + metrics["children_user_cpu_s"]
    metrics["combined_cpu_system_s"] = metrics["python_system_cpu_s"] + metrics["children_system_cpu_s"]

    # Legacy keys for backward compat
    metrics["memory_peak_mb"] = metrics["python_memory_peak_mb"]
    metrics["max_rss_mb"] = metrics["python_max_rss_mb"]
    metrics["user_cpu_time_s"] = metrics["python_user_cpu_s"]
    metrics["system_cpu_time_s"] = metrics["python_system_cpu_s"]
    metrics["result_length"] = len(str(result))

    # ── Print results ──
    print()
    print("  ── Python Process ──")
    print(f"  Memory peak (tracemalloc): {metrics['python_memory_peak_mb']:.2f} MB")
    print(f"  Max RSS: {metrics['python_max_rss_mb']:.2f} MB")
    print(f"  User CPU: {metrics['python_user_cpu_s']:.3f}s")
    print(f"  System CPU: {metrics['python_system_cpu_s']:.3f}s")

    print()
    print("  ── Node.js Child Process ──")
    if node_after:
        for proc in node_after:
            print(f"  PID {proc['pid']}: RSS={proc['rss_mb']:.2f} MB, VSZ={proc['vsz_mb']:.2f} MB")
    else:
        print("  (could not measure — using RUSAGE_CHILDREN)")
    print(f"  Children Max RSS (getrusage): {metrics['children_max_rss_mb']:.2f} MB")
    print(f"  Children User CPU: {metrics['children_user_cpu_s']:.3f}s")
    print(f"  Children System CPU: {metrics['children_system_cpu_s']:.3f}s")

    print()
    print("  ── Combined (Python + Node.js) ──")
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
