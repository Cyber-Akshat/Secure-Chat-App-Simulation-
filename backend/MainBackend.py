import os
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse

# Import our custom ChatServer class from ChatServer.py
from ChatServer import ChatServer

# Initialize the main API applications
app = FastAPI()
port = 8080

# Instantiate our chat coordinator logic
server = ChatServer()

@app.websocket("/start_web_socket")
async def websocket_endpoint(websocket: WebSocket):
    await server.handle_connection(websocket)

@app.get("/{catchall:path}")
async def serve_files(catchall: str):
    file_path = os.path.join(os.getcwd(), "public", catchall)

    # If the exact requested file exists in public/, serve it directly (e.g., style.css, app.js)
    if catchall and os.path.isfile(file_path):
        return FileResponse(file_path)

    # Otherwise, default to serving the main index.html file
    index_path = os.path.join(os.getcwd(), "public", "index.html")
    return FileResponse(index_path)

if __name__ == "__main__":
    print(f"🚀 Hi Chat Server running at http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)