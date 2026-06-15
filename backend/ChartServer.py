import json
from fastapi import WebSocket, WebSocketDisconnect

class ChatServer:
    def __init__(self):
        # Maps username (str) -> WebSocket instance
        self.connected_clients: dict[str, WebSocket] = {}

    async def handle_connection(self, websocket: WebSocket):
        # Extract the username query parameter from the URL
        username = websocket.query_params.get("username")

        #1. Check if the username exists
        if username in self.connected_clients:
            # Accepts and immediately close with a custom policy violation code
            await websocket.accept()
            await websocket.close(code=1008, reason=f"Username {username} is already taken")
            return
