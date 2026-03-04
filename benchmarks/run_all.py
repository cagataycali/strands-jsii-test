#!/usr/bin/env python3
"""
Master benchmark runner — runs both SDKs, generates flamegraphs & comparison.

Produces:
  benchmarks/results/native/    — strands-agents profiling
  benchmarks/results/jsii/      — strands-jsii profiling
  benchmarks/results/comparison/ — side-by-side report + diff flamegraph
"""

import os
import sys
import subprocess
import json
import time

BENCH_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BENCH_DIR, "results")
COMPARISON_DIR = os.path.join(RESULTS_DIR, "comparison")
PYTHON = sys.executable

os.makedirs(COMPARISON_DIR, exist_ok=True)


def run_with_viztracer(script_name, output_name):
    """Run a benchmark with viztracer for call tree visualization."""
    output_json = os.path.join(RESULTS_DIR, output_name, "viztracer.json")
    output_html = os.path.join(RESULTS_DIR, output_name, "viztracer.html")
    
    print(f"\n{'─'*60}")
    print(f"  Running {output_name} with viztracer...")
    print(f"{'─'*60}")
    
    cmd = [
        PYTHON, "-m", "viztracer",
        "--output", output_json,
        "--max_stack_depth", "30",
        "--ignore_c_function",
        "--ignore_frozen",
        os.path.join(BENCH_DIR, script_name),
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        print(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
        if result.returncode != 0:
            print(f"  viztracer stderr: {result.stderr[-1000:]}")
    except subprocess.TimeoutExpired:
        print(f"  viztracer timed out for {output_name}")
        return
    except FileNotFoundError:
        print(f"  viztracer not found, skipping call tree")
        return

    # Convert to HTML
    if os.path.exists(output_json):
        try:
            subprocess.run([
                PYTHON, "-m", "viztracer", "--combine", output_json,
                "-o", output_html,
            ], capture_output=True, timeout=60)
            print(f"  viztracer HTML: {output_html}")
        except:
            print(f"  viztracer JSON: {output_json}")


def run_with_pyinstrument(script_name, output_name):
    """Run with pyinstrument for tree view."""
    output_html = os.path.join(RESULTS_DIR, output_name, "pyinstrument.html")
    output_txt = os.path.join(RESULTS_DIR, output_name, "pyinstrument.txt")
    
    print(f"\n{'─'*60}")
    print(f"  Running {output_name} with pyinstrument...")
    print(f"{'─'*60}")
    
    # HTML output
    cmd_html = [
        PYTHON, "-m", "pyinstrument",
        "--renderer", "html",
        "-o", output_html,
        os.path.join(BENCH_DIR, script_name),
    ]
    
    # Text output
    cmd_txt = [
        PYTHON, "-m", "pyinstrument",
        "-o", output_txt,
        os.path.join(BENCH_DIR, script_name),
    ]
    
    try:
        result = subprocess.run(cmd_html, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            print(f"  pyinstrument HTML: {output_html}")
        else:
            print(f"  pyinstrument error: {result.stderr[-500:]}")
    except Exception as e:
        print(f"  pyinstrument HTML failed: {e}")

    try:
        result = subprocess.run(cmd_txt, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            print(f"  pyinstrument text: {output_txt}")
            # Show the tree in terminal
            print(result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout)
    except Exception as e:
        print(f"  pyinstrument text failed: {e}")


def generate_flamegraph(output_name):
    """Generate flamegraph from cProfile data using flameprof or speedscope-compatible format."""
    prof_path = os.path.join(RESULTS_DIR, output_name, "profile.prof")
    
    if not os.path.exists(prof_path):
        print(f"  No profile.prof for {output_name}")
        return

    # Try flameprof (pip install flameprof)
    svg_path = os.path.join(RESULTS_DIR, output_name, "flamegraph.svg")
    try:
        result = subprocess.run(
            [PYTHON, "-m", "flameprof", prof_path],
            capture_output=True, timeout=60,
        )
        if result.returncode == 0:
            with open(svg_path, "wb") as f:
                f.write(result.stdout)
            print(f"  Flamegraph SVG: {svg_path}")
            return
    except:
        pass

    # Fallback: convert to speedscope JSON format
    speedscope_path = os.path.join(RESULTS_DIR, output_name, "profile.speedscope.json")
    try:
        # Use pstats to extract function call data
        import pstats
        stats = pstats.Stats(prof_path)
        
        frames = []
        samples = []
        frame_map = {}
        
        for key, val in stats.stats.items():
            filename, line, funcname = key
            cc, nc, tt, ct, callers = val
            frame_name = f"{funcname} ({os.path.basename(filename)}:{line})"
            
            if frame_name not in frame_map:
                frame_map[frame_name] = len(frames)
                frames.append({"name": frame_name, "file": filename, "line": line})
            
            # Weight by cumulative time (microseconds)
            weight = int(ct * 1_000_000)
            if weight > 0:
                samples.append({
                    "frame": frame_map[frame_name],
                    "weight": weight,
                })
        
        speedscope_data = {
            "$schema": "https://www.speedscope.app/file-format-schema.json",
            "shared": {"frames": frames},
            "profiles": [{
                "type": "sampled",
                "name": output_name,
                "unit": "microseconds",
                "startValue": 0,
                "endValue": int(sum(s["weight"] for s in samples)),
                "samples": [[s["frame"]] for s in samples[:500]],
                "weights": [s["weight"] for s in samples[:500]],
            }],
        }
        
        with open(speedscope_path, "w") as f:
            json.dump(speedscope_data, f)
        print(f"  Speedscope profile: {speedscope_path}")
        print(f"  Open at: https://www.speedscope.app/ (drag & drop the JSON)")
    except Exception as e:
        print(f"  Speedscope export failed: {e}")


def generate_comparison():
    """Generate side-by-side comparison report."""
    native_metrics_path = os.path.join(RESULTS_DIR, "native", "metrics.json")
    jsii_metrics_path = os.path.join(RESULTS_DIR, "jsii", "metrics.json")
    
    if not os.path.exists(native_metrics_path) or not os.path.exists(jsii_metrics_path):
        print("  Missing metrics files, skipping comparison")
        return
    
    with open(native_metrics_path) as f:
        native = json.load(f)
    with open(jsii_metrics_path) as f:
        jsii = json.load(f)
    
    # ── Text report ──
    report = []
    report.append("=" * 72)
    report.append("  BENCHMARK COMPARISON: strands-agents vs strands-jsii")
    report.append("=" * 72)
    report.append(f"  Prompt: {native['prompt']}")
    report.append(f"  Python: {native['python_version'].split()[0]}")
    report.append(f"  Date:   {native['timestamp']}")
    report.append("")
    
    comparisons = [
        ("Import Time", "import_time_s", "s"),
        ("Agent Construction", "construct_time_s", "s"),
        ("Invoke Time", "invoke_time_s", "s"),
        ("Memory Peak", "memory_peak_mb", "MB"),
        ("Memory Delta", "memory_delta_mb", "MB"),
        ("Max RSS", "max_rss_mb", "MB"),
        ("User CPU Time", "user_cpu_time_s", "s"),
        ("System CPU Time", "system_cpu_time_s", "s"),
        ("Result Length", "result_length", "chars"),
    ]
    
    report.append(f"  {'Metric':<25} {'Native':>12} {'JSII':>12} {'Δ':>12} {'Ratio':>8}")
    report.append(f"  {'─'*25} {'─'*12} {'─'*12} {'─'*12} {'─'*8}")
    
    for label, key, unit in comparisons:
        nv = native.get(key, 0)
        jv = jsii.get(key, 0)
        delta = jv - nv
        ratio = jv / nv if nv > 0 else float('inf')
        
        delta_str = f"{delta:+.4f}" if abs(delta) < 100 else f"{delta:+.1f}"
        ratio_str = f"{ratio:.2f}x"
        
        # Color indicator
        if ratio > 1.1:
            indicator = "⬆️ slower"  # jsii slower
        elif ratio < 0.9:
            indicator = "⬇️ faster"  # jsii faster
        else:
            indicator = "≈ same"
        
        report.append(f"  {label:<25} {nv:>10.4f}{unit[:2]:>2} {jv:>10.4f}{unit[:2]:>2} {delta_str:>12} {ratio_str:>8}")
    
    report.append("")
    report.append("  Legend: Ratio = JSII/Native (>1 = JSII slower, <1 = JSII faster)")
    report.append("=" * 72)
    
    report_text = "\n".join(report)
    print(report_text)
    
    # Save report
    with open(os.path.join(COMPARISON_DIR, "comparison.txt"), "w") as f:
        f.write(report_text)
    
    # Save combined JSON
    with open(os.path.join(COMPARISON_DIR, "comparison.json"), "w") as f:
        json.dump({
            "native": native,
            "jsii": jsii,
            "ratios": {
                key: jsii.get(key, 0) / native.get(key, 1) if native.get(key, 0) > 0 else None
                for _, key, _ in comparisons
            },
        }, f, indent=2)
    
    # ── Generate HTML comparison ──
    generate_html_report(native, jsii, comparisons)
    
    print(f"\n  Comparison saved to: {COMPARISON_DIR}")


def generate_html_report(native, jsii, comparisons):
    """Generate an interactive HTML comparison report."""
    rows_html = ""
    for label, key, unit in comparisons:
        nv = native.get(key, 0)
        jv = jsii.get(key, 0)
        ratio = jv / nv if nv > 0 else float('inf')
        
        if ratio > 1.1:
            color = "#ff6b6b"
            badge = "JSII slower"
        elif ratio < 0.9:
            color = "#51cf66"
            badge = "JSII faster"
        else:
            color = "#ffd43b"
            badge = "≈ same"
        
        bar_native = min(nv / max(nv, jv, 0.001) * 100, 100) if max(nv, jv) > 0 else 50
        bar_jsii = min(jv / max(nv, jv, 0.001) * 100, 100) if max(nv, jv) > 0 else 50
        
        rows_html += f"""
        <tr>
          <td><strong>{label}</strong></td>
          <td>{nv:.4f} {unit}</td>
          <td>{jv:.4f} {unit}</td>
          <td><span style="background:{color};padding:2px 8px;border-radius:4px;color:#000;font-size:0.85em">{ratio:.2f}x — {badge}</span></td>
          <td style="width:200px">
            <div style="display:flex;gap:2px;align-items:center">
              <div style="background:#339af0;height:16px;width:{bar_native}%;border-radius:3px" title="Native"></div>
              <div style="background:#f06595;height:16px;width:{bar_jsii}%;border-radius:3px" title="JSII"></div>
            </div>
          </td>
        </tr>"""
    
    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Strands SDK Benchmark — Native vs JSII</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1b26; color: #c0caf5; padding: 2rem; }}
    h1 {{ color: #7aa2f7; margin-bottom: 0.5rem; }}
    h2 {{ color: #bb9af7; margin: 1.5rem 0 0.5rem; }}
    .meta {{ color: #565f89; margin-bottom: 2rem; }}
    table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; }}
    th {{ background: #24283b; padding: 12px; text-align: left; border-bottom: 2px solid #414868; }}
    td {{ padding: 10px 12px; border-bottom: 1px solid #292e42; }}
    tr:hover {{ background: #24283b; }}
    .legend {{ display: flex; gap: 1.5rem; margin: 1rem 0; }}
    .legend-item {{ display: flex; align-items: center; gap: 0.5rem; }}
    .legend-color {{ width: 16px; height: 16px; border-radius: 3px; }}
    .card {{ background: #24283b; border-radius: 8px; padding: 1.5rem; margin: 1rem 0; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }}
    .number {{ font-size: 2rem; font-weight: bold; color: #7aa2f7; }}
    .label {{ color: #565f89; font-size: 0.9rem; }}
    iframe {{ width: 100%; height: 600px; border: 1px solid #414868; border-radius: 8px; margin: 1rem 0; }}
    a {{ color: #7aa2f7; }}
  </style>
</head>
<body>
  <h1>🔬 Strands SDK Benchmark</h1>
  <div class="meta">
    <strong>strands-agents</strong> (native Python) vs <strong>strands-jsii</strong> (JSII bindings) — 
    Prompt: "{native['prompt']}" — {native['timestamp']}
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Native Invoke Time</div>
      <div class="number">{native.get('invoke_time_s', 0):.3f}s</div>
    </div>
    <div class="card">
      <div class="label">JSII Invoke Time</div>
      <div class="number">{jsii.get('invoke_time_s', 0):.3f}s</div>
    </div>
    <div class="card">
      <div class="label">Native Memory Peak</div>
      <div class="number">{native.get('memory_peak_mb', 0):.1f} MB</div>
    </div>
    <div class="card">
      <div class="label">JSII Memory Peak</div>
      <div class="number">{jsii.get('memory_peak_mb', 0):.1f} MB</div>
    </div>
  </div>

  <h2>📊 Detailed Comparison</h2>
  <div class="legend">
    <div class="legend-item"><div class="legend-color" style="background:#339af0"></div> Native</div>
    <div class="legend-item"><div class="legend-color" style="background:#f06595"></div> JSII</div>
  </div>
  
  <table>
    <thead>
      <tr><th>Metric</th><th>Native</th><th>JSII</th><th>Verdict</th><th>Visual</th></tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>

  <h2>🔥 Profiling Artifacts</h2>
  <div class="card">
    <p>Open these files for detailed analysis:</p>
    <ul style="margin:1rem 0;padding-left:2rem">
      <li><strong>Flame Graphs:</strong> Open <code>results/native/flamegraph.svg</code> and <code>results/jsii/flamegraph.svg</code></li>
      <li><strong>Speedscope:</strong> Drag <code>results/*/profile.speedscope.json</code> into <a href="https://www.speedscope.app/">speedscope.app</a></li>
      <li><strong>Pyinstrument:</strong> Open <code>results/*/pyinstrument.html</code> for interactive call trees</li>
      <li><strong>VizTracer:</strong> Open <code>results/*/viztracer.html</code> for timeline visualization</li>
      <li><strong>cProfile:</strong> <code>python -m pstats results/*/profile.prof</code></li>
    </ul>
  </div>

  <h2>📁 File Index</h2>
  <div class="card">
    <pre style="color:#a9b1d6">
benchmarks/results/
├── native/                      # strands-agents (pure Python)
│   ├── profile.prof             # cProfile binary
│   ├── profile_stats.txt        # Top functions by cumulative time
│   ├── top_functions.txt        # Top functions by total time
│   ├── flamegraph.svg           # Flame graph (SVG)
│   ├── profile.speedscope.json  # Speedscope-compatible profile
│   ├── pyinstrument.html        # Interactive call tree
│   ├── pyinstrument.txt         # Text call tree
│   ├── viztracer.json           # VizTracer raw data
│   ├── viztracer.html           # VizTracer timeline
│   ├── metrics.json             # Timing/memory metrics
│   └── result.txt               # Agent output
├── jsii/                        # strands-jsii (JSII bindings)
│   └── ... (same structure)
└── comparison/
    ├── comparison.txt            # Side-by-side text report
    ├── comparison.json           # Machine-readable comparison
    └── comparison.html           # This file
    </pre>
  </div>
</body>
</html>"""
    
    with open(os.path.join(COMPARISON_DIR, "comparison.html"), "w") as f:
        f.write(html)
    print(f"  HTML report: {os.path.join(COMPARISON_DIR, 'comparison.html')}")


def main():
    print("\n" + "█" * 72)
    print("  STRANDS SDK BENCHMARK — Native vs JSII")
    print("█" * 72)
    
    # ── Step 1: Run native benchmark with profilers ──
    print("\n\n▶ STEP 1: Native SDK (strands-agents)")
    
    print("\n  [1/3] Basic benchmark + cProfile...")
    subprocess.run([PYTHON, os.path.join(BENCH_DIR, "bench_native.py")], timeout=300)
    
    generate_flamegraph("native")
    
    print("\n  [2/3] pyinstrument tree...")
    run_with_pyinstrument("bench_native.py", "native")
    
    print("\n  [3/3] viztracer call timeline...")
    run_with_viztracer("bench_native.py", "native")
    
    # ── Step 2: Run JSII benchmark with profilers ──
    print("\n\n▶ STEP 2: JSII SDK (strands-jsii)")
    
    print("\n  [1/3] Basic benchmark + cProfile...")
    subprocess.run([PYTHON, os.path.join(BENCH_DIR, "bench_jsii.py")], timeout=300)
    
    generate_flamegraph("jsii")
    
    print("\n  [2/3] pyinstrument tree...")
    run_with_pyinstrument("bench_jsii.py", "jsii")
    
    print("\n  [3/3] viztracer call timeline...")
    run_with_viztracer("bench_jsii.py", "jsii")
    
    # ── Step 3: Generate comparison ──
    print("\n\n▶ STEP 3: Comparison Report")
    generate_comparison()
    
    print("\n\n" + "█" * 72)
    print("  DONE! Open comparison.html for visual report")
    print(f"  {os.path.join(COMPARISON_DIR, 'comparison.html')}")
    print("█" * 72)


if __name__ == "__main__":
    main()
