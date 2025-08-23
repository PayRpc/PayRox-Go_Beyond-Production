#!/usr/bin/env python3
"""Ultra simple test server with UI for PayRox jobs"""

import sys
import os
import logging
import json
import time
import uuid
import asyncio
from pathlib import Path
from enum import Enum
from typing import Dict, Any, Optional, List

try:
    from aiohttp import web
    print("AIOHTTP imported successfully!")
except ImportError as e:
    print(f"ERROR importing aiohttp: {e}")
    print(f"Python path: {sys.path}")
    sys.exit(1)

# Configure verbose logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger('test-server')

# Create a simple job system
class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class Job:
    def __init__(self, job_id, job_type):
        self.id = job_id
        self.type = job_type
        self.status = JobStatus.PENDING
        self.created_at = time.time()
        self.started_at = None
        self.completed_at = None
        self.progress = {"current_step": 0, "total_steps": 5, "step_name": "", "progress_percent": 0, "logs": []}
        self.result = None
        self.error = None

class JobManager:
    def __init__(self):
        self.jobs = {}

    def create_job(self, job_type):
        job_id = str(uuid.uuid4())
        job = Job(job_id, job_type)
        self.jobs[job_id] = job
        return job_id

    def get_job(self, job_id):
        return self.jobs.get(job_id)

    def list_jobs(self):
        return list(self.jobs.values())

    async def run_job(self, job_id):
        job = self.jobs.get(job_id)
        if not job:
            return False

        job.status = JobStatus.RUNNING
        job.started_at = time.time()

        # Simulate 5 steps
        for i in range(1, 6):
            job.progress["current_step"] = i
            job.progress["step_name"] = f"Step {i}/5"
            job.progress["progress_percent"] = i / 5 * 100
            job.progress["logs"].append(f"[{time.strftime('%H:%M:%S')}] Processing step {i}")

            # Fake work
            await asyncio.sleep(2)

        job.status = JobStatus.COMPLETED
        job.completed_at = time.time()
        job.result = {"success": True, "message": "Job completed successfully"}
        job.progress["logs"].append(f"[{time.strftime('%H:%M:%S')}] Job completed")
        return True

job_manager = JobManager()

# HTML UI
INDEX_HTML = """<!DOCTYPE html>
<html>
<head>
    <title>PayRox Job Tester</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        button { padding: 10px; background: #4CAF50; color: white; border: none; cursor: pointer; }
        .job-card { border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
        pre { background: #f5f5f5; padding: 10px; overflow: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>PayRox Job Test</h1>

        <div>
            <button id="startButton">Start New Job</button>
        </div>

        <h2>Jobs</h2>
        <div id="jobsList"></div>

        <h2>Selected Job</h2>
        <div id="jobDetails"></div>
    </div>

    <script>
        const API_URL = '';

        // Start a new job
        document.getElementById('startButton').addEventListener('click', async () => {
            const response = await fetch('/jobs', { method: 'POST' });
            const data = await response.json();
            if (data.job_id) {
                alert('Job started with ID: ' + data.job_id);
                loadJobs();
            }
        });

        // Load jobs list
        async function loadJobs() {
            const response = await fetch('/jobs');
            const data = await response.json();
            const jobsList = document.getElementById('jobsList');

            jobsList.innerHTML = '';
            data.jobs.forEach(job => {
                const jobCard = document.createElement('div');
                jobCard.className = 'job-card';
                jobCard.innerHTML = `
                    <div><strong>ID:</strong> ${job.id}</div>
                    <div><strong>Type:</strong> ${job.type}</div>
                    <div><strong>Status:</strong> ${job.status}</div>
                    <div><strong>Created:</strong> ${new Date(job.created_at * 1000).toLocaleString()}</div>
                    <button class="view-button" data-id="${job.id}">View Details</button>
                `;
                jobsList.appendChild(jobCard);

                jobCard.querySelector('.view-button').addEventListener('click', () => {
                    loadJobDetails(job.id);
                });
            });
        }

        // Load job details and setup websocket
        async function loadJobDetails(jobId) {
            // Load initial job data
            const response = await fetch(`/jobs/${jobId}`);
            const data = await response.json();
            updateJobDetails(data.job);

            // Setup WebSocket for real-time updates
            const wsUrl = `ws://${window.location.host}/ws/jobs/${jobId}`;
            const ws = new WebSocket(wsUrl);

            ws.onmessage = (event) => {
                const job = JSON.parse(event.data);
                updateJobDetails(job);

                // Close WebSocket when job is done
                if (['completed', 'failed'].includes(job.status)) {
                    setTimeout(() => ws.close(), 1000);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            ws.onclose = () => {
                console.log('WebSocket closed');
            };
        }

        // Update job details in UI
        function updateJobDetails(job) {
            const jobDetails = document.getElementById('jobDetails');

            let progressHtml = '';
            if (job.progress) {
                const percent = Math.round(job.progress.progress_percent);
                progressHtml = `
                    <div>
                        <strong>Progress:</strong> ${job.progress.step_name} (${percent}%)
                        <div style="height: 20px; background: #eee; border-radius: 5px; overflow: hidden;">
                            <div style="height: 100%; width: ${percent}%; background: #4CAF50;"></div>
                        </div>
                    </div>
                `;

                if (job.progress.logs && job.progress.logs.length) {
                    progressHtml += `
                        <div>
                            <strong>Logs:</strong>
                            <pre>${job.progress.logs.join('\n')}</pre>
                        </div>
                    `;
                }
            }

            let resultHtml = '';
            if (job.result) {
                resultHtml = `
                    <div>
                        <strong>Result:</strong>
                        <pre>${JSON.stringify(job.result, null, 2)}</pre>
                    </div>
                `;
            }

            let errorHtml = '';
            if (job.error) {
                errorHtml = `
                    <div>
                        <strong>Error:</strong>
                        <pre>${job.error}</pre>
                    </div>
                `;
            }

            jobDetails.innerHTML = `
                <div>
                    <div><strong>ID:</strong> ${job.id}</div>
                    <div><strong>Type:</strong> ${job.type}</div>
                    <div><strong>Status:</strong> ${job.status}</div>
                    <div><strong>Created:</strong> ${new Date(job.created_at * 1000).toLocaleString()}</div>
                    ${job.started_at ? `<div><strong>Started:</strong> ${new Date(job.started_at * 1000).toLocaleString()}</div>` : ''}
                    ${job.completed_at ? `<div><strong>Completed:</strong> ${new Date(job.completed_at * 1000).toLocaleString()}</div>` : ''}
                    ${progressHtml}
                    ${resultHtml}
                    ${errorHtml}
                </div>
            `;
        }

        // Load jobs on page load
        loadJobs();
    </script>
</body>
</html>
"""

# API routes
async def index(request):
    return web.Response(text=INDEX_HTML, content_type='text/html')

async def list_jobs(request):
    jobs_list = []
    for job in job_manager.list_jobs():
        jobs_list.append({
            'id': job.id,
            'type': job.type,
            'status': job.status,
            'created_at': job.created_at,
            'started_at': job.started_at,
            'completed_at': job.completed_at
        })
    return web.json_response({'jobs': jobs_list})

async def get_job(request):
    job_id = request.match_info['id']
    job = job_manager.get_job(job_id)

    if not job:
        return web.json_response({'error': 'Job not found'}, status=404)

    job_data = {
        'id': job.id,
        'type': job.type,
        'status': job.status,
        'created_at': job.created_at,
        'started_at': job.started_at,
        'completed_at': job.completed_at,
        'progress': job.progress,
        'result': job.result,
        'error': job.error
    }
    return web.json_response({'job': job_data})

async def create_job(request):
    job_id = job_manager.create_job('test')

    # Start the job asynchronously
    asyncio.create_task(job_manager.run_job(job_id))

    return web.json_response({'job_id': job_id})

async def ws_job(request):
    job_id = request.match_info['id']
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    job = job_manager.get_job(job_id)
    if not job:
        await ws.close()
        return ws

    # Send initial data
    job_data = {
        'id': job.id,
        'type': job.type,
        'status': job.status,
        'created_at': job.created_at,
        'started_at': job.started_at,
        'completed_at': job.completed_at,
        'progress': job.progress,
        'result': job.result,
        'error': job.error
    }
    await ws.send_json(job_data)

    # Keep connection open while job is running
    try:
        while job.status not in [JobStatus.COMPLETED, JobStatus.FAILED]:
            await asyncio.sleep(0.5)
            job_data = {
                'id': job.id,
                'type': job.type,
                'status': job.status,
                'created_at': job.created_at,
                'started_at': job.started_at,
                'completed_at': job.completed_at,
                'progress': job.progress,
                'result': job.result,
                'error': job.error
            }
            await ws.send_json(job_data)

            # Check for client messages
            try:
                msg = await asyncio.wait_for(ws.receive(), timeout=0.1)
                if msg.type == web.WSMsgType.CLOSE:
                    break
            except asyncio.TimeoutError:
                pass

        # Final update
        job_data = {
            'id': job.id,
            'type': job.type,
            'status': job.status,
            'created_at': job.created_at,
            'started_at': job.started_at,
            'completed_at': job.completed_at,
            'progress': job.progress,
            'result': job.result,
            'error': job.error
        }
        await ws.send_json(job_data)

    except Exception as e:
        log.exception("WebSocket error: %s", e)
    finally:
        if not ws.closed:
            await ws.close()

    return ws

# Create app and routes
try:
    app = web.Application()
    app.router.add_get('/', index)
    app.router.add_get('/jobs', list_jobs)
    app.router.add_get('/jobs/{id}', get_job)
    app.router.add_post('/jobs', create_job)
    app.router.add_get('/ws/jobs/{id}', ws_job)

    if __name__ == '__main__':
        log.info('Starting test server on 0.0.0.0:8080')
        web.run_app(app, host='0.0.0.0', port=8080, access_log_format='%a %t "%r" %s %b "%{Referer}i" "%{User-Agent}i" %Tf')
except Exception as e:
    log.error(f"FATAL ERROR: {e}", exc_info=True)
    print(f"FATAL ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
