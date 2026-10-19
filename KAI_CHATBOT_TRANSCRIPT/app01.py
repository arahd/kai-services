from flask import Flask, jsonify, request
import os
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
APP_VERSION = "1.0.0"

@app.route('/', methods=['GET'])
def home():
    return jsonify(
        message = "Transcript service for K-AI",
        version = APP_VERSION
    )

@app.route('/getenv', methods=['Post'])
def get_env_value():
    data = request.get_json()
    key = data.get("key")
    value = os.getenv('key', None)
    return jsonify(key=key, value=value)

if __name__ == '__main__':
    app.run(debug=True)