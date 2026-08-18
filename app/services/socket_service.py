import socketio
import asyncio
from typing import Any

# Async Socket.IO server with wildcard CORS enabled
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

@sio.event
async def connect(sid, environ, auth=None):
    print(f"[Socket.IO] Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"[Socket.IO] Client disconnected: {sid}")

@sio.event
async def join_counter(sid, counter_id: str):
    await sio.enter_room(sid, f"counter:{counter_id}")
    print(f"[Socket.IO] Client {sid} joined room counter:{counter_id}")

@sio.event
async def join_service(sid, service_id: str):
    await sio.enter_room(sid, f"service:{service_id}")
    print(f"[Socket.IO] Client {sid} joined room service:{service_id}")

def run_async(coro):
    """
    Helper function to run async socket events from synchronous routes safely.
    Schedules the coroutine as a task on the running loop or runs it.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        loop.create_task(coro)
    else:
        asyncio.run(coro)

# Broadcast helper functions

async def _emit_queue_updated(service_id: str, payload: Any):
    # Emit uppercase (staff dashboard, active token)
    await sio.emit('QUEUE_UPDATED', payload)
    await sio.emit('QUEUE_UPDATED', payload, room=f"service:{service_id}")
    
    # Emit lowercase / camelCase (student active token and admin page support)
    await sio.emit('queueUpdate', payload)
    await sio.emit('queueUpdate', payload, room=f"service:{service_id}")
    await sio.emit('queue_updated', payload)
    await sio.emit('queue_updated', payload, room=f"service:{service_id}")

def emit_queue_updated(service_id: str, payload: Any):
    run_async(_emit_queue_updated(service_id, payload))

async def _emit_token_called(counter_id: str, token: Any):
    await sio.emit('TOKEN_CALLED', {"counterId": counter_id, "token": token})
    await sio.emit('TOKEN_CALLED', token, room=f"counter:{counter_id}")
    
    # Admin dashboard compatibility (lowercase)
    await sio.emit('token_called', {"counterId": counter_id, "token": token})
    await sio.emit('token_called', token, room=f"counter:{counter_id}")

def emit_token_called(counter_id: str, token: Any):
    run_async(_emit_token_called(counter_id, token))

async def _emit_token_completed(counter_id: str, token: Any):
    await sio.emit('TOKEN_COMPLETED', {"counterId": counter_id, "token": token})
    await sio.emit('TOKEN_COMPLETED', token, room=f"counter:{counter_id}")
    
    # Admin dashboard compatibility (lowercase)
    await sio.emit('token_completed', {"counterId": counter_id, "token": token})
    await sio.emit('token_completed', token, room=f"counter:{counter_id}")

def emit_token_completed(counter_id: str, token: Any):
    run_async(_emit_token_completed(counter_id, token))

async def _emit_token_skipped(counter_id: str, token: Any):
    await sio.emit('TOKEN_SKIPPED', {"counterId": counter_id, "token": token})
    await sio.emit('TOKEN_SKIPPED', token, room=f"counter:{counter_id}")
    
    # Admin dashboard compatibility (lowercase)
    await sio.emit('token_skipped', {"counterId": counter_id, "token": token})
    await sio.emit('token_skipped', token, room=f"counter:{counter_id}")
    await sio.emit('token_state_changed', {"counterId": counter_id, "token": token})

def emit_token_skipped(counter_id: str, token: Any):
    run_async(_emit_token_skipped(counter_id, token))

async def _emit_token_held(counter_id: str, token: Any):
    await sio.emit('TOKEN_HELD', {"counterId": counter_id, "token": token})
    await sio.emit('TOKEN_HELD', token, room=f"counter:{counter_id}")
    
    # Admin dashboard compatibility (lowercase)
    await sio.emit('token_held', {"counterId": counter_id, "token": token})
    await sio.emit('token_held', token, room=f"counter:{counter_id}")
    await sio.emit('token_state_changed', {"counterId": counter_id, "token": token})

def emit_token_held(counter_id: str, token: Any):
    run_async(_emit_token_held(counter_id, token))

async def _emit_token_resumed(counter_id: str, token: Any):
    await sio.emit('TOKEN_RESUMED', {"counterId": counter_id, "token": token})
    await sio.emit('TOKEN_RESUMED', token, room=f"counter:{counter_id}")
    
    # Admin dashboard compatibility (lowercase)
    await sio.emit('token_resumed', {"counterId": counter_id, "token": token})
    await sio.emit('token_resumed', token, room=f"counter:{counter_id}")
    await sio.emit('token_state_changed', {"counterId": counter_id, "token": token})

def emit_token_resumed(counter_id: str, token: Any):
    run_async(_emit_token_resumed(counter_id, token))

async def _emit_counter_status_changed(counter_id: str, status: str):
    await sio.emit('COUNTER_STATUS_CHANGED', {"counterId": counter_id, "status": status})
    
    # Admin dashboard compatibility (lowercase)
    await sio.emit('counter_status_changed', {"counterId": counter_id, "status": status})

def emit_counter_status_changed(counter_id: str, status: str):
    run_async(_emit_counter_status_changed(counter_id, status))
