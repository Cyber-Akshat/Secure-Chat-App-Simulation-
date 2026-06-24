import os #for file paths
import uvicorn #runs FastAPI app
from fastapi import FastAPI, WebSocket, HTTPException #routing, handling, throwing errors
from fastapi.responses import FileResponse, RedirectResponse  #serves files and redirects to other urls
from pydantic import BaseModel #json validation
from ChatServer import ChatServer #class that handles chat logic
import auth #module that handles registration and login credentials

#creates the app instance and sets the port, as well as booting a shared chatserver
app = FastAPI()
port = 8080
server = ChatServer()

#requests username & password
class AuthRequest(BaseModel):
    username: str
    password: str



@app.post("/api/register")
#Uses the user & pass from AuthRequest to try register an account
#also handles conflicts such as duplicate usernames (409)
async def register(payload: AuthRequest):
    result = auth.register_user(payload.username, payload.password)
    if not result["ok"]:
        raise HTTPException(status_code=409, detail=result["message"])
    return {"message": result["message"]}


@app.post("/api/login")
#uses auth to verify credentials, returns error 401 on failure
#returns stripped username if right for the frontend
async def login(payload: AuthRequest):
    result = auth.verify_user(payload.username, payload.password)
    if not result["ok"]:
        raise HTTPException(status_code=401, detail=result["message"])
    return {"message": result["message"], "username": payload.username.strip()}


@app.websocket("/start_web_socket")
#browser opens websocket connection here
async def websocket_endpoint(websocket: WebSocket):
    await server.handle_connection(websocket)


# FIX: Explicitly intercept root hits and redirect to the purple login screen
@app.get("/")
async def root_redirect():
    #when someone hits the root url, redirect them to the login page
    return RedirectResponse(url="/login.html")


@app.get("/{catchall:path}")
#handles miscellanious get requests and serves directly to css/js/images
async def serve_files(catchall: str):
    file_path = os.path.join(os.getcwd(), "public", catchall)
    if catchall and os.path.isfile(file_path):
        return FileResponse(file_path)

    return FileResponse(os.path.join(os.getcwd(), "public", "index.html"))


# running the server
if __name__ == "__main__": #only runs from this file
    print(f"Server running at http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port) #this would allow other devices on the network to use it, if the college let us