"""
Async job system for long-running refactor operations.
Provides background task execution with status tracking and real-time updates.
"""

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path
from typing import Dict, Any, Optional, List, Callable
from concurrent.futures import ThreadPoolExecutor
import traceback
import subprocess
import os

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class JobProgress:
    current_step: int = 0
    total_steps: int = 0
    step_name: str = ""
    progress_percent: float = 0.0
    logs: List[str] = None

    def __post_init__(self):
        if self.logs is None:
            self.logs = []

@dataclass
class Job:
    id: str
    type: str
    status: JobStatus
    created_at: float
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    progress: JobProgress = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    input_data: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        if self.progress is None:
            self.progress = JobProgress()

class JobManager:
    def __init__(self):
        self.jobs: Dict[str, Job] = {}
        self.executor = ThreadPoolExecutor(max_workers=4)
        self._running = True

    def create_job(self, job_type: str, input_data: Dict[str, Any]) -> str:
        """Create a new job and return its ID."""
        job_id = str(uuid.uuid4())
        job = Job(
            id=job_id,
            type=job_type,
            status=JobStatus.PENDING,
            created_at=time.time(),
            input_data=input_data
        )
        self.jobs[job_id] = job
        return job_id

    def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        return self.jobs.get(job_id)

    def list_jobs(self, limit: int = 50) -> List[Job]:
        """List recent jobs, most recent first."""
        jobs = sorted(self.jobs.values(), key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]

    def update_progress(self, job_id: str, step: int, total: int, step_name: str, log_message: str = ""):
        """Update job progress."""
        if job_id not in self.jobs:
            return

        job = self.jobs[job_id]
        job.progress.current_step = step
        job.progress.total_steps = total
        job.progress.step_name = step_name
        job.progress.progress_percent = (step / total * 100) if total > 0 else 0

        if log_message:
            job.progress.logs.append(f"[{time.strftime('%H:%M:%S')}] {log_message}")
            # Keep only last 100 log entries
            if len(job.progress.logs) > 100:
                job.progress.logs = job.progress.logs[-100:]

    def start_job(self, job_id: str, handler: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        """Start executing a job in background."""
        if job_id not in self.jobs:
            return False

        job = self.jobs[job_id]
        if job.status != JobStatus.PENDING:
            return False

        job.status = JobStatus.RUNNING
        job.started_at = time.time()

        # Submit to thread pool
        future = self.executor.submit(self._execute_job, job_id, handler)
        return True

    def _execute_job(self, job_id: str, handler: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        """Execute job in background thread."""
        try:
            job = self.jobs[job_id]
            self.update_progress(job_id, 0, 5, "Starting job", f"Starting {job.type} job")

            # Call the actual handler
            result = handler(job_id, job.input_data)

            job.status = JobStatus.COMPLETED
            job.completed_at = time.time()
            job.result = result
            self.update_progress(job_id, 5, 5, "Completed", "Job completed successfully")

        except Exception as e:
            job = self.jobs[job_id]
            job.status = JobStatus.FAILED
            job.completed_at = time.time()
            job.error = str(e)
            self.update_progress(job_id, 0, 5, "Failed", f"Job failed: {str(e)}")

            # Log full traceback for debugging
            tb = traceback.format_exc()
            job.progress.logs.append(f"[ERROR] {tb}")

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a job (best effort)."""
        if job_id not in self.jobs:
            return False

        job = self.jobs[job_id]
        if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            return False

        job.status = JobStatus.CANCELLED
        job.completed_at = time.time()
        self.update_progress(job_id, 0, 5, "Cancelled", "Job was cancelled")
        return True

# Global job manager instance
job_manager = JobManager()

def run_cmd_with_progress(cmd: List[str], cwd: Optional[Path] = None, job_id: str = "", step_name: str = "", timeout: int = 300) -> Dict[str, Any]:
    """Run command with progress updates."""
    try:
        if job_id:
            job_manager.update_progress(job_id, 0, 1, step_name, f"Running: {' '.join(cmd)}")

        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        output_lines = []
        while True:
            line = proc.stdout.readline()
            if not line and proc.poll() is not None:
                break
            if line:
                line = line.strip()
                output_lines.append(line)
                if job_id:
                    job_manager.update_progress(job_id, 0, 1, step_name, line)

        rc = proc.wait(timeout=timeout)
        return {
            "rc": rc,
            "stdout": "\n".join(output_lines),
            "stderr": ""
        }

    except subprocess.TimeoutExpired:
        proc.kill()
        return {"rc": 124, "stdout": "", "stderr": "timeout"}
    except Exception as e:
        return {"rc": 1, "stdout": "", "stderr": str(e)}

def refactor_job_handler(job_id: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Handle refactor job execution."""
    from pathlib import Path
    import tempfile

    # Get repo root and tools
    repo_root = Path(os.getenv('REPO_ROOT', '.')).resolve()
    node_bin = os.getenv('NODE_BIN', 'node')

    steps_result = {}
    warnings = []

    try:
        # Step 1: Analysis (rewire internal calls)
        job_manager.update_progress(job_id, 1, 5, "Analysis", "Running internal call analysis")

        rewire_cmd = [
            node_bin,
            str(repo_root / "scripts" / "tools" / "analysis" / "rewire-internal-calls.js"),
            "--root", "contracts",
            "--out", ".payrox/generated/analysis"
        ]

        rewire_result = run_cmd_with_progress(rewire_cmd, cwd=repo_root, job_id=job_id, step_name="Internal Call Analysis")
        steps_result["analysis"] = {
            "internal_calls": {
                "ok": rewire_result["rc"] == 0,
                "stdout": rewire_result["stdout"],
                "stderr": rewire_result["stderr"]
            }
        }

        if rewire_result["rc"] != 0:
            warnings.append("Internal call analysis failed")

        # Step 2: Event/Error Parity Analysis
        job_manager.update_progress(job_id, 2, 5, "Parity Analysis", "Running event/error parity analysis")

        parity_cmd = [
            node_bin,
            str(repo_root / "scripts" / "tools" / "analysis" / "event-error-parity.js"),
            "--left", "contracts/original",
            "--right", "contracts/ai",
            "--out", ".payrox/generated/analysis"
        ]

        parity_result = run_cmd_with_progress(parity_cmd, cwd=repo_root, job_id=job_id, step_name="Parity Analysis")
        steps_result["analysis"]["parity"] = {
            "ok": parity_result["rc"] == 0,
            "stdout": parity_result["stdout"],
            "stderr": parity_result["stderr"]
        }

        if parity_result["rc"] != 0:
            warnings.append("Event/error parity analysis failed")

        # Step 3: AI Refactor
        job_manager.update_progress(job_id, 3, 5, "AI Refactor", "Running AI-powered refactoring")

        ai_cmd = [
            "npx", "ts-node",
            str(repo_root / "tools" / "ai-refactor-copilot.ts"),
            "--file", input_data.get("input_file", "contracts/PayRoxMonolith.sol")
        ]

        ai_result = run_cmd_with_progress(ai_cmd, cwd=repo_root, job_id=job_id, step_name="AI Refactor", timeout=600)
        steps_result["ai_refactor"] = {
            "ok": ai_result["rc"] == 0,
            "stdout": ai_result["stdout"],
            "stderr": ai_result["stderr"]
        }

        if ai_result["rc"] != 0:
            warnings.append("AI refactoring failed")

        # Step 4: Contract Splitting
        job_manager.update_progress(job_id, 4, 5, "Contract Splitting", "Splitting contracts into facets")

        split_cmd = [
            "npx", "ts-node",
            str(repo_root / "tools" / "splitter" / "cli.ts"),
            "-i", input_data.get("input_file", "contracts/PayRoxMonolith.sol"),
            "--compile", "--deploy"
        ]

        split_result = run_cmd_with_progress(split_cmd, cwd=repo_root, job_id=job_id, step_name="Contract Splitting")
        steps_result["splitting"] = {
            "ok": split_result["rc"] == 0,
            "stdout": split_result["stdout"],
            "stderr": split_result["stderr"]
        }

        # Step 5: Generate Plan
        job_manager.update_progress(job_id, 5, 5, "Planning", "Generating deployment plan")

        # Try to read analysis data for planning
        analyze_data = steps_result.get('analysis', {}).get('internal_calls', {})
        if analyze_data.get('ok'):
            try:
                # Parse stdout for analysis JSON
                import json
                plan_input = json.loads(analyze_data.get('stdout', '{}'))
            except:
                plan_input = {}
        else:
            plan_input = {}

        # Run strict planner
        plan_js = str(repo_root / 'dist' / 'scripts' / 'cli' / 'plan.js')
        if Path(plan_js).exists():
            with tempfile.NamedTemporaryFile('w+', delete=False, suffix='.json') as tf:
                tf.write(json.dumps(plan_input))
                tmp_file = tf.name

            plan_cmd = [node_bin, plan_js, '--input', tmp_file]
            plan_result = run_cmd_with_progress(plan_cmd, cwd=repo_root, job_id=job_id, step_name="Planning")

            try:
                os.unlink(tmp_file)
            except:
                pass

            if plan_result["rc"] == 0:
                try:
                    plan_data = json.loads(plan_result["stdout"])
                    steps_result["plan"] = plan_data
                except:
                    steps_result["plan_error"] = "Failed to parse plan JSON"
                    warnings.append("Plan generation returned invalid JSON")
            else:
                steps_result["plan_error"] = plan_result["stderr"] or plan_result["stdout"]
                warnings.append("Plan generation failed")
        else:
            warnings.append("Planner not built - run npm run build")
            steps_result["plan_error"] = "Planner executable not found"

        return {
            "steps": steps_result,
            "warnings": warnings,
            "job_completed": True
        }

    except Exception as e:
        raise Exception(f"Refactor job failed: {str(e)}")

def to_dict(obj) -> Dict[str, Any]:
    """Convert dataclass to dict for JSON serialization."""
    if hasattr(obj, '__dict__'):
        result = {}
        for key, value in obj.__dict__.items():
            if isinstance(value, Enum):
                result[key] = value.value
            elif hasattr(value, '__dict__'):
                result[key] = to_dict(value)
            elif isinstance(value, list):
                result[key] = [to_dict(item) if hasattr(item, '__dict__') else item for item in value]
            else:
                result[key] = value
        return result
    return obj
