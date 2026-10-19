# Introduction 
a stripped down version of KAI_CHATBOT_CONVERSATION service

### endpoints -
- /api/chatservice
    Payload
    ```JSONC
    {
    "language_type": "en", // optional
    "query": "hello",
    "model": "gpt-5-mini", // by default it considers gpt-4o-mini
    }
    ```
    Currently supports
    - gpt-4o-mini
    - GPT 5.1
    - claude-opus-4.6
    - claude-sonnet-4.6

    Response format

    ```JSONC
    {
        "augSrc": [], // source if anything from web has been refered
        "image_responses": [],
        "response": "Hello",
        "responseType": "kumaran-questions",
        "token_usage": {
            "chat_completion_input_token": 400, //inclusive of system prompt
            "chat_completion_output_token": 21,
            "cumulative_input_token": 0,
            "cumulative_output_token": 0
        }
    }
    ```
