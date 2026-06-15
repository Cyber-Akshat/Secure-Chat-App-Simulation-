from flask import Flask, request, render_template_string

app = Flask(__name__)

# --- THE DEFAULT HOME PAGE ---
@app.route('/')
def home_page():
    return '''
    <h1>Welcome to Mitchell's Security Simulation!</h1>
    <p>Choose where you want to go:</p>
    <ul>
        <li><a href="/unsafe">Go to the Unsafe Website</a></li>
        <li><a href="/safe">Go to the Safe Website</a></li>
    </ul>
    '''

# --- THE UNSAFE PAGE ---
@app.route('/unsafe', methods=['GET', 'POST'])
def unsafe_page():
    user_input = ""
    if request.method == 'POST':
        # We grab exactly what the user typed in the box
        user_input = request.form.get('message', '')

    # CRITICAL VULNERABILITY: We use %s to drop raw, unchecked text right into the HTML template!
    html_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Unsafe Chat Simulator</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background-color: #f9f9f9; }
            .container { max-width: 600px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            input[type="text"] { width: 80%%; padding: 10px; margin-right: 10px; }
            input[type="submit"] { padding: 10px 20px; background-color: #ff4d4d; color: white; border: none; cursor: pointer; }
            .output { margin-top: 20px; padding: 15px; background: #ffe6e6; border-left: 5px solid #ff4d4d; min-height: 40px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🚨 Unsafe Website (Vulnerable)</h2>
            <p>Type a message below. Whatever you type will be trusted completely by the browser.</p>
            <form method="POST">
                <input type="text" name="message" placeholder="Type text or code here...">
                <input type="submit" value="Send">
            </form>

            <h3>What the server printed on your screen:</h3>
            <div class="output">
                %s
            </div>
            <br>
            <a href="/safe">Go to Safe Page &rarr;</a>
        </div>
    </body>
    </html>
    """ % user_input  # This %s placement is the security flaw

    return render_template_string(html_template)


# --- THE SAFE PAGE ---
@app.route('/safe', methods=['GET', 'POST'])
def safe_page():
    user_input = ""
    if request.method == 'POST':
        raw_input = request.form.get('message', '')

        # DEFENSE SYSTEM: We replace dangerous code characters with harmless visual text (Sanitization)
        user_input = (
            raw_input.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#x27;")
        )

    html_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Safe Chat Simulator</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background-color: #f9f9f9; }
            .container { max-width: 600px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            input[type="text"] { width: 80%%; padding: 10px; margin-right: 10px; }
            input[type="submit"] { padding: 10px 20px; background-color: #2ecc71; color: white; border: none; cursor: pointer; }
            .output { margin-top: 20px; padding: 15px; background: #e8f8f5; border-left: 5px solid #2ecc71; min-height: 40px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🛡️ Safe Website (Sanitized)</h2>
            <p>Type code here. Our Python script will sanitize it before it is rendered.</p>
            <form method="POST">
                <input type="text" name="message" placeholder="Type text or code here...">
                <input type="submit" value="Send">
            </form>

            <h3>What the server printed on your screen:</h3>
            <div class="output">
                %s
            </div>
            <br>
            <a href="/unsafe">&larr; Go back to Unsafe Page</a>
        </div>
    </body>
    </html>
    """ % user_input

    return render_template_string(html_template)


if __name__ == '__main__':
    app.run(debug=True, port=8080)