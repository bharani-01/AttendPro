#!/usr/bin/env python3
"""
Tkinter GUI for Student API Load Analyzer.

Launch:
  python scripts/student_api_load_analyzer_gui.py
"""

from __future__ import annotations

import json
import threading
import time
import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, ttk
from typing import Dict, List

from student_api_load_analyzer import (
    StudentApiLoadAnalyzer,
    generate_improvement_hints,
    summarize,
)


class AnalyzerGui(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Student API Load Analyzer")
        self.geometry("1180x760")
        self.minsize(1050, 680)

        self.running = False
        self.last_summary: Dict[str, Dict] = {}
        self.last_hints: List[str] = []
        self.last_meta: Dict[str, str] = {}

        self.style = ttk.Style(self)
        self.style.theme_use("clam")

        self._build_variables()
        self._build_layout()
        self._apply_theme()

    def _build_variables(self) -> None:
        self.base_url_var = tk.StringVar(value="http://127.0.0.1:3000")
        self.email_var = tk.StringVar(value="admin@college.edu")
        self.password_var = tk.StringVar(value="admin123")

        self.create_var = tk.IntVar(value=200)
        self.edit_var = tk.IntVar(value=200)
        self.list_var = tk.IntVar(value=100)
        self.concurrency_var = tk.IntVar(value=20)
        self.timeout_var = tk.DoubleVar(value=20.0)
        self.seed_pool_var = tk.IntVar(value=500)
        self.insecure_var = tk.BooleanVar(value=False)
        self.cleanup_var = tk.BooleanVar(value=True)

        self.theme_var = tk.StringVar(value="Light")

    def _build_layout(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        top = ttk.Frame(self, padding=10)
        top.grid(row=0, column=0, sticky="ew")
        top.columnconfigure(0, weight=1)

        cfg = ttk.LabelFrame(top, text="Load Test Configuration", padding=10)
        cfg.grid(row=0, column=0, sticky="ew")

        for i in range(8):
            cfg.columnconfigure(i, weight=1)

        ttk.Label(cfg, text="Base URL").grid(row=0, column=0, sticky="w")
        ttk.Entry(cfg, textvariable=self.base_url_var).grid(row=1, column=0, columnspan=2, sticky="ew", padx=(0, 8))

        ttk.Label(cfg, text="Admin Email").grid(row=0, column=2, sticky="w")
        ttk.Entry(cfg, textvariable=self.email_var).grid(row=1, column=2, columnspan=2, sticky="ew", padx=(0, 8))

        ttk.Label(cfg, text="Admin Password").grid(row=0, column=4, sticky="w")
        ttk.Entry(cfg, textvariable=self.password_var, show="*").grid(row=1, column=4, columnspan=2, sticky="ew", padx=(0, 8))

        ttk.Label(cfg, text="Theme").grid(row=0, column=6, sticky="w")
        theme_combo = ttk.Combobox(cfg, values=["Light", "Dark"], state="readonly", textvariable=self.theme_var)
        theme_combo.grid(row=1, column=6, sticky="ew", padx=(0, 8))
        theme_combo.bind("<<ComboboxSelected>>", lambda _e: self._apply_theme())

        ttk.Checkbutton(cfg, text="Insecure SSL", variable=self.insecure_var).grid(row=1, column=7, sticky="w")

        ttk.Label(cfg, text="Create Count").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Spinbox(cfg, from_=0, to=100000, textvariable=self.create_var).grid(row=3, column=0, sticky="ew", padx=(0, 8))

        ttk.Label(cfg, text="Edit Count").grid(row=2, column=1, sticky="w", pady=(8, 0))
        ttk.Spinbox(cfg, from_=0, to=100000, textvariable=self.edit_var).grid(row=3, column=1, sticky="ew", padx=(0, 8))

        ttk.Label(cfg, text="List Count").grid(row=2, column=2, sticky="w", pady=(8, 0))
        ttk.Spinbox(cfg, from_=0, to=100000, textvariable=self.list_var).grid(row=3, column=2, sticky="ew", padx=(0, 8))

        ttk.Label(cfg, text="Concurrency").grid(row=2, column=3, sticky="w", pady=(8, 0))
        ttk.Spinbox(cfg, from_=1, to=200, textvariable=self.concurrency_var).grid(row=3, column=3, sticky="ew", padx=(0, 8))

        ttk.Label(cfg, text="Timeout (s)").grid(row=2, column=4, sticky="w", pady=(8, 0))
        ttk.Spinbox(cfg, from_=1.0, to=120.0, increment=0.5, textvariable=self.timeout_var).grid(row=3, column=4, sticky="ew", padx=(0, 8))

        ttk.Label(cfg, text="Seed Edit Pool").grid(row=2, column=5, sticky="w", pady=(8, 0))
        ttk.Spinbox(cfg, from_=50, to=20000, textvariable=self.seed_pool_var).grid(row=3, column=5, sticky="ew", padx=(0, 8))

        ttk.Checkbutton(cfg, text="Delete Inserted Students After Run", variable=self.cleanup_var).grid(row=2, column=6, columnspan=2, sticky="w", pady=(8, 0))

        buttons = ttk.Frame(cfg)
        buttons.grid(row=3, column=6, columnspan=2, sticky="e")

        ttk.Button(buttons, text="Smoke Preset", command=self._preset_smoke).grid(row=0, column=0, padx=4)
        ttk.Button(buttons, text="Balanced Preset", command=self._preset_balanced).grid(row=0, column=1, padx=4)
        ttk.Button(buttons, text="Stress Preset", command=self._preset_stress).grid(row=0, column=2, padx=4)

        actions = ttk.Frame(top, padding=(0, 10, 0, 0))
        actions.grid(row=1, column=0, sticky="ew")

        self.run_btn = ttk.Button(actions, text="Run Load Test", command=self._start_run)
        self.run_btn.grid(row=0, column=0, padx=(0, 8))

        self.export_btn = ttk.Button(actions, text="Export JSON Report", command=self._export_report)
        self.export_btn.grid(row=0, column=1, padx=(0, 8))

        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(actions, textvariable=self.status_var).grid(row=0, column=2, sticky="w")

        middle = ttk.Frame(self, padding=(10, 0, 10, 10))
        middle.grid(row=1, column=0, sticky="nsew")
        middle.rowconfigure(0, weight=3)
        middle.rowconfigure(1, weight=2)
        middle.columnconfigure(0, weight=1)

        result_frame = ttk.LabelFrame(middle, text="Route Metrics", padding=8)
        result_frame.grid(row=0, column=0, sticky="nsew", pady=(0, 10))
        result_frame.rowconfigure(0, weight=1)
        result_frame.columnconfigure(0, weight=1)

        columns = ("route", "count", "ok", "errors", "err_rate", "avg", "p95", "p99", "max", "status")
        self.tree = ttk.Treeview(result_frame, columns=columns, show="headings", height=12)
        self.tree.grid(row=0, column=0, sticky="nsew")

        headers = {
            "route": "Route",
            "count": "Count",
            "ok": "OK",
            "errors": "Errors",
            "err_rate": "Err %",
            "avg": "Avg ms",
            "p95": "P95 ms",
            "p99": "P99 ms",
            "max": "Max ms",
            "status": "Status Codes",
        }
        widths = {
            "route": 220,
            "count": 65,
            "ok": 65,
            "errors": 65,
            "err_rate": 70,
            "avg": 80,
            "p95": 80,
            "p99": 80,
            "max": 80,
            "status": 200,
        }
        for c in columns:
            self.tree.heading(c, text=headers[c])
            self.tree.column(c, width=widths[c], anchor="w")

        yscroll = ttk.Scrollbar(result_frame, orient="vertical", command=self.tree.yview)
        yscroll.grid(row=0, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=yscroll.set)

        bottom = ttk.Frame(middle)
        bottom.grid(row=1, column=0, sticky="nsew")
        bottom.columnconfigure(0, weight=1)
        bottom.columnconfigure(1, weight=1)
        bottom.rowconfigure(0, weight=1)

        summary_frame = ttk.LabelFrame(bottom, text="Overall Summary", padding=8)
        summary_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 5))
        summary_frame.rowconfigure(0, weight=1)
        summary_frame.columnconfigure(0, weight=1)

        self.summary_text = tk.Text(summary_frame, wrap="word", height=10)
        self.summary_text.grid(row=0, column=0, sticky="nsew")
        self.summary_text.configure(state="disabled")

        hint_frame = ttk.LabelFrame(bottom, text="Improvement Suggestions", padding=8)
        hint_frame.grid(row=0, column=1, sticky="nsew", padx=(5, 0))
        hint_frame.rowconfigure(0, weight=1)
        hint_frame.columnconfigure(0, weight=1)

        self.hints_text = tk.Text(hint_frame, wrap="word", height=10)
        self.hints_text.grid(row=0, column=0, sticky="nsew")
        self.hints_text.configure(state="disabled")

    def _apply_theme(self) -> None:
        if self.theme_var.get() == "Dark":
            bg = "#111827"
            fg = "#f9fafb"
            panel = "#1f2937"
            self.configure(bg=bg)
            self.style.configure("TFrame", background=bg)
            self.style.configure("TLabelframe", background=bg, foreground=fg)
            self.style.configure("TLabelframe.Label", background=bg, foreground=fg)
            self.style.configure("TLabel", background=bg, foreground=fg)
            self.style.configure("TButton", padding=6)
            self.style.configure("TCheckbutton", background=bg, foreground=fg)
            self.style.configure("TCombobox", fieldbackground=panel)
            self.summary_text.configure(bg=panel, fg="#e5e7eb", insertbackground="#e5e7eb")
            self.hints_text.configure(bg=panel, fg="#e5e7eb", insertbackground="#e5e7eb")
        else:
            bg = "#f4f6f9"
            fg = "#0f172a"
            self.configure(bg=bg)
            self.style.configure("TFrame", background=bg)
            self.style.configure("TLabelframe", background=bg, foreground=fg)
            self.style.configure("TLabelframe.Label", background=bg, foreground=fg)
            self.style.configure("TLabel", background=bg, foreground=fg)
            self.style.configure("TButton", padding=6)
            self.style.configure("TCheckbutton", background=bg, foreground=fg)
            self.summary_text.configure(bg="#ffffff", fg="#0f172a", insertbackground="#0f172a")
            self.hints_text.configure(bg="#ffffff", fg="#0f172a", insertbackground="#0f172a")

    def _preset_smoke(self) -> None:
        self.create_var.set(20)
        self.edit_var.set(20)
        self.list_var.set(20)
        self.concurrency_var.set(5)

    def _preset_balanced(self) -> None:
        self.create_var.set(200)
        self.edit_var.set(200)
        self.list_var.set(100)
        self.concurrency_var.set(20)

    def _preset_stress(self) -> None:
        self.create_var.set(1000)
        self.edit_var.set(1000)
        self.list_var.set(500)
        self.concurrency_var.set(60)

    def _set_text(self, widget: tk.Text, content: str) -> None:
        widget.configure(state="normal")
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, content)
        widget.configure(state="disabled")

    def _start_run(self) -> None:
        if self.running:
            return

        self.running = True
        self.run_btn.configure(state="disabled")
        self.status_var.set("Running load test...")

        thread = threading.Thread(target=self._run_worker, daemon=True)
        thread.start()

    def _run_worker(self) -> None:
        started_at = time.perf_counter()
        try:
            analyzer = StudentApiLoadAnalyzer(
                base_url=self.base_url_var.get().strip(),
                admin_email=self.email_var.get().strip(),
                admin_password=self.password_var.get().strip(),
                concurrency=max(1, int(self.concurrency_var.get())),
                timeout=max(1.0, float(self.timeout_var.get())),
                verify_ssl=not self.insecure_var.get(),
            )

            results = analyzer.run_test(
                create_count=max(0, int(self.create_var.get())),
                edit_count=max(0, int(self.edit_var.get())),
                list_count=max(0, int(self.list_var.get())),
                seed_edit_pool=max(50, int(self.seed_pool_var.get())),
                cleanup_created_students=bool(self.cleanup_var.get()),
            )

            total_seconds = time.perf_counter() - started_at
            summary = summarize(results)
            hints = generate_improvement_hints(summary)

            total_requests = sum(v["count"] for v in summary.values())
            total_errors = sum(v["errors"] for v in summary.values())
            throughput = total_requests / total_seconds if total_seconds > 0 else 0

            meta = {
                "timestamp": datetime.now().isoformat(timespec="seconds"),
                "base_url": self.base_url_var.get().strip(),
                "duration_seconds": f"{total_seconds:.2f}",
                "total_requests": str(total_requests),
                "total_errors": str(total_errors),
                "throughput_rps": f"{throughput:.2f}",
                "config": {
                    "create_count": int(self.create_var.get()),
                    "edit_count": int(self.edit_var.get()),
                    "list_count": int(self.list_var.get()),
                    "concurrency": int(self.concurrency_var.get()),
                    "timeout": float(self.timeout_var.get()),
                    "seed_edit_pool": int(self.seed_pool_var.get()),
                    "cleanup_created_students": bool(self.cleanup_var.get()),
                },
            }

            self.last_summary = summary
            self.last_hints = hints
            self.last_meta = meta

            self.after(0, lambda: self._render_results(summary, hints, meta))
            self.after(0, lambda: self.status_var.set("Completed"))
        except Exception as exc:
            self.after(0, lambda: messagebox.showerror("Load Test Error", str(exc)))
            self.after(0, lambda: self.status_var.set("Failed"))
        finally:
            self.running = False
            self.after(0, lambda: self.run_btn.configure(state="normal"))

    def _render_results(self, summary: Dict[str, Dict], hints: List[str], meta: Dict) -> None:
        for item in self.tree.get_children():
            self.tree.delete(item)

        for route, data in sorted(summary.items()):
            self.tree.insert(
                "",
                tk.END,
                values=(
                    route,
                    data["count"],
                    data["ok"],
                    data["errors"],
                    f"{data['error_rate']:.2f}",
                    f"{data['avg_ms']:.1f}",
                    f"{data['p95_ms']:.1f}",
                    f"{data['p99_ms']:.1f}",
                    f"{data['max_ms']:.1f}",
                    json.dumps(data["status_codes"]),
                ),
            )

        summary_text = (
            f"Timestamp: {meta['timestamp']}\n"
            f"Base URL: {meta['base_url']}\n"
            f"Duration: {meta['duration_seconds']} seconds\n"
            f"Total Requests: {meta['total_requests']}\n"
            f"Total Errors: {meta['total_errors']}\n"
            f"Throughput: {meta['throughput_rps']} req/s\n"
            f"\nConfig:\n{json.dumps(meta['config'], indent=2)}"
        )
        self._set_text(self.summary_text, summary_text)

        hint_lines = [f"{idx}. {text}" for idx, text in enumerate(hints, start=1)]
        self._set_text(self.hints_text, "\n".join(hint_lines))

    def _export_report(self) -> None:
        if not self.last_summary:
            messagebox.showinfo("No Data", "Run a load test first.")
            return

        path = filedialog.asksaveasfilename(
            title="Save Report",
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
        )
        if not path:
            return

        payload = {
            "meta": self.last_meta,
            "summary": self.last_summary,
            "hints": self.last_hints,
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

        messagebox.showinfo("Saved", f"Report saved to:\n{path}")


def main() -> None:
    app = AnalyzerGui()
    app.mainloop()


if __name__ == "__main__":
    main()
