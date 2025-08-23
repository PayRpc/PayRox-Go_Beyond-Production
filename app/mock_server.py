#!/usr/bin/env python3
"""Lightweight aiohttp-based mock server to run the web UI and Jobs API without FastAPI.

Endpoints:
- GET  /            -> serves web-ui/index.html
- GET  /static/...  -> serves files from web-ui/
- POST /jobs/start  -> create and start job
- GET  /jobs        -> list jobs
- GET  /jobs/{id}   -> get job
- POST /jobs/{id}/cancel -> cancel job
- WS   /ws/jobs/{id} -> websocket updates for job

Run: cd app && python mock_server.py
"""

import asyncio
import json
import logging
from aiohttp import web
import os
from pathlib import Path
from typing import Dict

# Ensure cwd is repo root for relative paths
REPO_ROOT = Path(os.getenv('REPO_ROOT', str(Path(__file__).resolve().parents[1])))
WEB_UI_DIR = REPO_ROOT / 'web-ui'

# Import existing job system implemented in app/jobs.py
from jobs import job_manager, refactor_job_handler, to_dict

logging.basicConfig(level=logging.INFO)
log = logging.getLogger('mock-server')

# --- REST Handlers ---
async def list_jobs(request):
    jobs = job_manager.list_jobs()
    return web.json_response({'jobs': [to_dict(j) for j in jobs]})

async def get_job(request):
    job_id = request.match_info['id']
    job = job_manager.get_job(job_id)
    if not job:
        raise web.HTTPNotFound(text=json.dumps({'error': 'job not found'}), content_type='application/json')
    return web.json_response({'job': to_dict(job)})

async def start_job(request):
    body = await request.json()
    job_type = body.get('type', 'refactor')
    input_data = body.get('input_data', {})

    job_id = job_manager.create_job(job_type, input_data)
    started = job_manager.start_job(job_id, refactor_job_handler)
    if not started:
        raise web.HTTPBadRequest(text=json.dumps({'error': 'failed to start job'}), content_type='application/json')
    return web.json_response({'job_id': job_id})

async def cancel_job(request):
    job_id = request.match_info['id']
    ok = job_manager.cancel_job(job_id)
    return web.json_response({'ok': ok})

# --- WebSocket Handler ---
async def ws_job(request):
    job_id = request.match_info['id']
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    log.info('WebSocket connected for job %s', job_id)

    last_sent = None
    try:
        while True:
            job = job_manager.get_job(job_id)
            if not job:
                await ws.send_json({'error': 'job not found'})
                await asyncio.sleep(1)
                continue

            payload = to_dict(job)
            # Only send if changed serially (cheap check)
            s_payload = json.dumps(payload, sort_keys=True)
            if s_payload != last_sent:
                await ws.send_str(s_payload)
                last_sent = s_payload

            # If job is terminal, keep connection open a bit then close
            if job.status in ['completed', 'failed', 'cancelled']:
                await asyncio.sleep(1)
                break

            # Non-blocking wait for client messages and periodic updates
            try:
                msg = await asyncio.wait_for(ws.receive(), timeout=1.0)
                if msg.type == web.WSMsgType.TEXT:
                    # small protocol: client may send 'ping' or 'subscribe'
                    if msg.data == 'ping':
                        await ws.send_str('pong')
                elif msg.type == web.WSMsgType.CLOSE:
                    break
            except asyncio.TimeoutError:
                # timeout — loop to send updates
                continue

    except Exception as e:
        log.exception('ws error: %s', e)
    finally:
        await ws.close()
        log.info('WebSocket closed for job %s', job_id)

    return ws

# --- Static file serving ---
async def index(request):
    index_file = WEB_UI_DIR / 'index.html'
    if not index_file.exists():
        raise web.HTTPNotFound(text='web-ui/index.html not found')
    return web.FileResponse(path=index_file)

# Create app
app = web.Application()
app.router.add_get('/', index)
# Static files under /static/
app.router.add_static('/static', path=str(WEB_UI_DIR), show_index=True)

# API
app.router.add_get('/jobs', list_jobs)
app.router.add_get('/jobs/{id}', get_job)
app.router.add_post('/jobs/start', start_job)
app.router.add_post('/jobs/{id}/cancel', cancel_job)

# WebSocket
app.router.add_get('/ws/jobs/{id}', ws_job)

if __name__ == '__main__':
    port = int(os.getenv('PORT', '8080'))
    host = os.getenv('HOST', '0.0.0.0')
    log.info('Starting mock server on %s:%s (serving %s)', host, port, WEB_UI_DIR)
    web.run_app(app, host=host, port=port)
