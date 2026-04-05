#!/usr/bin/env python3
"""
Student API Load Analyzer

Generates controlled high traffic for student-related API routes:
- create students
- edit students
- list students

Then prints latency/error analytics and practical improvement hints.

Usage example:
  python scripts/student_api_load_analyzer.py \
    --base-url http://127.0.0.1:3000 \
    --admin-email admin@college.edu \
    --admin-password admin123 \
    --create-count 200 \
    --edit-count 200 \
    --list-count 100 \
    --concurrency 20
"""

from __future__ import annotations

import argparse
import concurrent.futures
import random
import statistics
import string
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import requests


@dataclass
class RequestResult:
    route: str
    method: str
    status_code: int
    latency_ms: float
    ok: bool
    error: str = ""


class StudentApiLoadAnalyzer:
    def __init__(
        self,
        base_url: str,
        admin_email: str,
        admin_password: str,
        concurrency: int,
        timeout: float,
        verify_ssl: bool,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.admin_email = admin_email
        self.admin_password = admin_password
        self.concurrency = concurrency
        self.timeout = timeout
        self.verify_ssl = verify_ssl

        self.session = requests.Session()
        self.session.verify = verify_ssl
        self._lock = threading.Lock()
        self.generated_student_ids: List[str] = []

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def login(self) -> None:
        payload = {
            "email": self.admin_email,
            "password": self.admin_password,
        }
        r = self.session.post(
            self._url("/api/auth/login"),
            json=payload,
            timeout=self.timeout,
        )
        r.raise_for_status()
        data = r.json()
        token = data.get("token")
        if not token:
            raise RuntimeError("Login succeeded but no token found in response")

        self.session.headers.update({"Authorization": f"Bearer {token}"})

    def fetch_existing_students(self, limit: int = 500) -> List[Dict]:
        students: List[Dict] = []
        page = 1

        while len(students) < limit:
            params = {
                "role": "student",
                "page": page,
                "limit": min(100, limit - len(students)),
            }
            r = self.session.get(
                self._url("/api/auth/users"),
                params=params,
                timeout=self.timeout,
            )
            r.raise_for_status()
            payload = r.json()
            batch = payload.get("users", [])
            students.extend(batch)

            pagination = payload.get("pagination", {})
            if not pagination.get("hasMore"):
                break
            page += 1

        return students

    @staticmethod
    def _rand_suffix(n: int = 8) -> str:
        chars = string.ascii_lowercase + string.digits
        return "".join(random.choice(chars) for _ in range(n))

    def _create_one_student(self, i: int) -> RequestResult:
        route = "/api/auth/students/add"
        started = time.perf_counter()

        suffix = self._rand_suffix(10)
        payload = {
            "name": f"Load Student {i}",
            "email": f"load.student.{suffix}@student.edu",
            "uniqueId": f"LD{int(time.time())}{i}{random.randint(1000, 9999)}",
            "year": random.randint(1, 4),
            "department": random.choice(
                [
                    "Computer Science",
                    "Information Technology",
                    "Electronics",
                    "Mechanical",
                    "Civil",
                    "Electrical",
                ]
            ),
            "batch": str(random.randint(2022, 2026)),
        }

        try:
            r = self.session.post(self._url(route), json=payload, timeout=self.timeout)
            latency_ms = (time.perf_counter() - started) * 1000.0
            ok = 200 <= r.status_code < 300

            if ok:
                student_id = (r.json().get("student") or {}).get("_id")
                if student_id:
                    with self._lock:
                        self.generated_student_ids.append(student_id)

            return RequestResult(
                route=route,
                method="POST",
                status_code=r.status_code,
                latency_ms=latency_ms,
                ok=ok,
                error="" if ok else _safe_error(r),
            )
        except Exception as exc:
            latency_ms = (time.perf_counter() - started) * 1000.0
            return RequestResult(
                route=route,
                method="POST",
                status_code=0,
                latency_ms=latency_ms,
                ok=False,
                error=str(exc),
            )

    def _edit_one_student(self, student_id: str, i: int) -> RequestResult:
        route = f"/api/auth/users/{student_id}"
        started = time.perf_counter()

        payload = {
            "name": f"Load Student Updated {i}",
            "batch": str(random.randint(2022, 2026)),
        }

        try:
            r = self.session.put(self._url(route), json=payload, timeout=self.timeout)
            latency_ms = (time.perf_counter() - started) * 1000.0
            ok = 200 <= r.status_code < 300
            return RequestResult(
                route="/api/auth/users/:id",
                method="PUT",
                status_code=r.status_code,
                latency_ms=latency_ms,
                ok=ok,
                error="" if ok else _safe_error(r),
            )
        except Exception as exc:
            latency_ms = (time.perf_counter() - started) * 1000.0
            return RequestResult(
                route="/api/auth/users/:id",
                method="PUT",
                status_code=0,
                latency_ms=latency_ms,
                ok=False,
                error=str(exc),
            )

    def _list_students(self) -> RequestResult:
        route = "/api/auth/users?role=student"
        started = time.perf_counter()

        params = {
            "role": "student",
            "page": random.randint(1, 5),
            "limit": random.choice([50, 100, 150]),
        }

        try:
            r = self.session.get(self._url("/api/auth/users"), params=params, timeout=self.timeout)
            latency_ms = (time.perf_counter() - started) * 1000.0
            ok = 200 <= r.status_code < 300
            return RequestResult(
                route=route,
                method="GET",
                status_code=r.status_code,
                latency_ms=latency_ms,
                ok=ok,
                error="" if ok else _safe_error(r),
            )
        except Exception as exc:
            latency_ms = (time.perf_counter() - started) * 1000.0
            return RequestResult(
                route=route,
                method="GET",
                status_code=0,
                latency_ms=latency_ms,
                ok=False,
                error=str(exc),
            )

    def _delete_one_student(self, student_id: str) -> RequestResult:
        route = f"/api/auth/users/{student_id}"
        started = time.perf_counter()

        try:
            r = self.session.delete(self._url(route), timeout=self.timeout)
            latency_ms = (time.perf_counter() - started) * 1000.0
            ok = 200 <= r.status_code < 300
            return RequestResult(
                route="/api/auth/users/:id",
                method="DELETE",
                status_code=r.status_code,
                latency_ms=latency_ms,
                ok=ok,
                error="" if ok else _safe_error(r),
            )
        except Exception as exc:
            latency_ms = (time.perf_counter() - started) * 1000.0
            return RequestResult(
                route="/api/auth/users/:id",
                method="DELETE",
                status_code=0,
                latency_ms=latency_ms,
                ok=False,
                error=str(exc),
            )

    def run_test(
        self,
        create_count: int,
        edit_count: int,
        list_count: int,
        seed_edit_pool: int,
        cleanup_created_students: bool = True,
    ) -> List[RequestResult]:
        self.login()

        base_students = self.fetch_existing_students(limit=seed_edit_pool)
        existing_ids = [s.get("_id") for s in base_students if s.get("_id")]

        all_results: List[RequestResult] = []

        def run_concurrent(tasks):
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.concurrency) as exe:
                for result in exe.map(lambda f: f(), tasks):
                    all_results.append(result)

        create_tasks = [lambda i=i: self._create_one_student(i) for i in range(create_count)]
        run_concurrent(create_tasks)

        with self._lock:
            cleanup_ids = list(self.generated_student_ids)

        try:
            with self._lock:
                candidate_edit_ids = existing_ids + self.generated_student_ids

            if edit_count > 0 and not candidate_edit_ids:
                raise RuntimeError("No student IDs available for edit test")

            edit_tasks = []
            for i in range(edit_count):
                sid = random.choice(candidate_edit_ids)
                edit_tasks.append(lambda sid=sid, i=i: self._edit_one_student(sid, i))
            run_concurrent(edit_tasks)

            list_tasks = [lambda: self._list_students() for _ in range(list_count)]
            run_concurrent(list_tasks)
        finally:
            if cleanup_created_students and cleanup_ids:
                delete_tasks = [lambda sid=sid: self._delete_one_student(sid) for sid in cleanup_ids]
                run_concurrent(delete_tasks)

        return all_results


def _safe_error(response: requests.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            return data.get("error") or data.get("message") or str(data)
    except Exception:
        pass
    return response.text[:300]


def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    if pct <= 0:
        return min(values)
    if pct >= 100:
        return max(values)

    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * (pct / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return sorted_vals[f]
    d0 = sorted_vals[f] * (c - k)
    d1 = sorted_vals[c] * (k - f)
    return d0 + d1


def summarize(results: List[RequestResult]) -> Dict[str, Dict]:
    by_route: Dict[str, List[RequestResult]] = {}
    for r in results:
        key = f"{r.method} {r.route}"
        by_route.setdefault(key, []).append(r)

    summary: Dict[str, Dict] = {}
    for key, items in by_route.items():
        latencies = [x.latency_ms for x in items]
        ok_count = sum(1 for x in items if x.ok)
        err_count = len(items) - ok_count
        err_rate = (err_count / len(items)) * 100.0 if items else 0.0
        status_buckets: Dict[str, int] = {}

        for x in items:
            code = str(x.status_code)
            status_buckets[code] = status_buckets.get(code, 0) + 1

        summary[key] = {
            "count": len(items),
            "ok": ok_count,
            "errors": err_count,
            "error_rate": err_rate,
            "avg_ms": statistics.mean(latencies) if latencies else 0.0,
            "p50_ms": _percentile(latencies, 50),
            "p95_ms": _percentile(latencies, 95),
            "p99_ms": _percentile(latencies, 99),
            "max_ms": max(latencies) if latencies else 0.0,
            "status_codes": status_buckets,
        }

    return summary


def print_summary(summary: Dict[str, Dict], total_seconds: float) -> None:
    print("\n=== Load Test Summary ===")
    print(f"Total routes tested: {len(summary)}")
    print(f"Total duration: {total_seconds:.2f} seconds")

    grand_total = sum(v["count"] for v in summary.values())
    grand_errors = sum(v["errors"] for v in summary.values())
    rps = (grand_total / total_seconds) if total_seconds > 0 else 0.0
    print(f"Total requests: {grand_total}")
    print(f"Total errors: {grand_errors} ({(grand_errors / grand_total * 100.0) if grand_total else 0:.2f}%)")
    print(f"Approx throughput: {rps:.2f} req/s")

    for route, data in sorted(summary.items()):
        print(f"\n[{route}]")
        print(
            f"count={data['count']} ok={data['ok']} errors={data['errors']} "
            f"err%={data['error_rate']:.2f} avg={data['avg_ms']:.1f}ms "
            f"p50={data['p50_ms']:.1f}ms p95={data['p95_ms']:.1f}ms "
            f"p99={data['p99_ms']:.1f}ms max={data['max_ms']:.1f}ms"
        )
        print(f"status={data['status_codes']}")


def generate_improvement_hints(summary: Dict[str, Dict]) -> List[str]:
    hints: List[str] = []

    for route, data in summary.items():
        if data["error_rate"] > 1.0:
            hints.append(
                f"{route}: error rate {data['error_rate']:.2f}% is high; "
                "inspect validation, auth failures, and DB write conflicts."
            )

        if data["p95_ms"] > 800:
            hints.append(
                f"{route}: p95 {data['p95_ms']:.1f}ms is high; add query indexes, reduce payload, and profile DB."
            )
        elif data["p95_ms"] > 400:
            hints.append(
                f"{route}: p95 {data['p95_ms']:.1f}ms can improve; use selective fields and lean queries."
            )

        if "GET /api/auth/users?role=student" in route and data["p95_ms"] > 300:
            hints.append(
                "Student listing: enforce strict pagination defaults, add compound index on role+createdAt, "
                "and return only needed columns in list view."
            )

        if "POST /api/auth/students/add" in route and data["p95_ms"] > 500:
            hints.append(
                "Student creation: batch writes for bulk import, async side effects (email/audit), and pool DB connections."
            )

        if "PUT /api/auth/users/:id" in route and data["p95_ms"] > 500:
            hints.append(
                "Student update: avoid expensive populate on write response path; return minimal response for list updates."
            )

    if not hints:
        hints.append(
            "Current performance is stable for this test profile. Next: increase concurrency and run 5x duration soak tests."
        )

    return hints


def print_improvement_hints(summary: Dict[str, Dict]) -> None:
    print("\n=== Suggested Improvements ===")
    hints = generate_improvement_hints(summary)

    for i, h in enumerate(hints, start=1):
        print(f"{i}. {h}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate student API traffic and analyze backend bottlenecks")
    parser.add_argument("--base-url", default="http://127.0.0.1:3000", help="Backend base URL")
    parser.add_argument("--admin-email", required=True, help="Admin login email")
    parser.add_argument("--admin-password", required=True, help="Admin login password")
    parser.add_argument("--create-count", type=int, default=100, help="Number of create student requests")
    parser.add_argument("--edit-count", type=int, default=100, help="Number of edit student requests")
    parser.add_argument("--list-count", type=int, default=50, help="Number of list student requests")
    parser.add_argument("--concurrency", type=int, default=10, help="Concurrent workers")
    parser.add_argument("--seed-edit-pool", type=int, default=500, help="How many existing students to prefetch for edits")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout (seconds)")
    parser.add_argument("--insecure", action="store_true", help="Disable SSL verification")
    parser.add_argument("--keep-created-students", action="store_true", help="Do not delete load-test-created students after run")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    analyzer = StudentApiLoadAnalyzer(
        base_url=args.base_url,
        admin_email=args.admin_email,
        admin_password=args.admin_password,
        concurrency=args.concurrency,
        timeout=args.timeout,
        verify_ssl=not args.insecure,
    )

    started = time.perf_counter()
    try:
        results = analyzer.run_test(
            create_count=max(0, args.create_count),
            edit_count=max(0, args.edit_count),
            list_count=max(0, args.list_count),
            seed_edit_pool=max(50, args.seed_edit_pool),
            cleanup_created_students=not args.keep_created_students,
        )
    except Exception as exc:
        print(f"Load test failed: {exc}")
        return 1

    total_seconds = time.perf_counter() - started
    summary = summarize(results)

    print_summary(summary, total_seconds)
    print_improvement_hints(summary)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
