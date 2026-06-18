import os
import uvicorn
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.responses import FileResponse, RedirectResponse  # Added RedirectResponse
from pydantic import BaseModel

from ChatServer import ChatServer
import auth

app = FastAPI()
port = 8080
server = ChatServer()


class AuthRequest(BaseModel):
    username: str
    password: str


@app.post("/api/register")
async def register(payload: AuthRequest):
    result = auth.register_user(payload.username, payload.password)
    if not result["ok"]:
        raise HTTPException(status_code=409, detail=result["message"])
    return {"message": result["message"]}


@app.post("/api/login")
async def login(payload: AuthRequest):
    result = auth.verify_user(payload.username, payload.password)
    if not result["ok"]:
        raise HTTPException(status_code=401, detail=result["message"])
    return {"message": result["message"], "username": payload.username.strip()}


@app.websocket("/start_web_socket")
async def websocket_endpoint(websocket: WebSocket):
    await server.handle_connection(websocket)


# FIX: Explicitly intercept root hits and redirect to the purple login screen
@app.get("/")
async def root_redirect():
    return RedirectResponse(url="/login.html")


@app.get("/{catchall:path}")
async def serve_files(catchall: str):
    file_path = os.path.join(os.getcwd(), "public", catchall)
    if catchall and os.path.isfile(file_path):
        return FileResponse(file_path)

    return FileResponse(os.path.join(os.getcwd(), "public", "index.html"))


# running the server
if __name__ == "__main__":
    print(f"Server running at http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)