import os
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse

# Assuming you have a chat_server.py file with a ChatServer class
from ChatServer import ChatServer

app = FastAPI()
port = 8080
server = ChatServer()


# 1. WebSocket Route
@app.websocket("/start_web_socket")
async def websocket_endpoint(websocket: WebSocket):
    # In FastAPI, WebSocket connections must be explicitly accepted.
    # Your ChatServer.handle_connection method should call `await websocket.accept()`
    await server.handle_connection(websocket)


# 2. Static File / Fallback Route
@app.get("/{catchall:path}")
async def serve_files(catchall: str):
    # Replicating Oak's context.send() fallback behavior
    file_path = os.path.join(os.getcwd(), catchall)

    # If the exact requested file exists, serve it
    if catchall and os.path.isfile(file_path):
        return FileResponse(file_path)

    # Otherwise, default to serving the index.html
    index_path = os.path.join(os.getcwd(), "public", "index.html")
    return FileResponse(index_path)


if __name__ == "__main__":
    print(f"Listening at http://localhost:{port}")
    # Run the application using uvicorn
    uvicorn.run(app, host="0.0.0.0", port=port)