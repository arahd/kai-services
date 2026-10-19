# Conversational AI Chatbot Transcript Service

## Overview
The Conversational AI Chatbot Transcript Service is part of a chatbot system designed to handle chat transcripts effectively. It retrieves chat history based on user input and leverages Azure storage and SQL to manage and store transcript data.

### Key Components
- **chat_transcript.py**: The main file governing the chat transcript retrieval endpoint and managing its requests.
- **chat.py**: Contains the logic for handling chat transcript storage and blob data operations.
- **mainqueries.py**: Handles interactions with the SQL database for various query operations.
- **tableModels.py**: Defines the database table models used throughout the application.
- **keyvault.py**: Manages the retrieval of configuration values and secrets from Azure Key Vault.

## Endpoint: `/chat/history`

### Description
The `/chat/history` endpoint retrieves the chat history for a user. To access this endpoint, a valid bearer token must be included in the request headers for authentication.

### Request Method
- **POST**

### Request Headers
- **Authorization**: `Bearer <token>`

### Request Body
The request should include a JSON payload with the following structure:
```json
{
    "user_string": "user@example.com",
    "bot_type": "kumaran"
}
```

#### Required Fields
- `user_string`: The identifier for the user, typically their email.
- `bot_type`: The type of bot associated with the conversation.

### Example Request
```bash
curl -X POST \
  http://localhost:4000/chat/history \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
        "user_string": "user@example.com",
        "bot_type": "kumaran"
      }'
```

### Response
Upon successful retrieval, the endpoint returns a JSON response containing the chat history data. The response object structure is subject to the implementation in the `chat.py` file by the `use_blob` method. 

### Example Response
```json
{
    "data": [
        {
            "conversation_id": "1",
            "start_time": "2023-10-07T08:30:00Z",
            "end_time": "2023-10-07T09:30:00Z",
            "messages": [
                "Hello!",
                "How can I help you today?"
            ]
        }
    ],
    "total_pages": 1,
    "conversation_limit_reached": false
}
```

### Error Handling
In case of missing parameters, the service will return:
```json
{
    "error": "Missing required fields: user_string, bot_type"
}
```

If unauthorized, it responds with:
```json
{
    "error": "Unauthorized access"
}
```

### Detailed Workflow
1. **Authorization Check**:
   Upon receiving a request to `/chat/history`, the `requires_authorization` decorator checks for the existence of an authorization token. It validates this token through the `validate_bearer_token` function. The token must be valid to proceed.

2. **Data Retrieval**:
   After passing the authorization check, the `chat_history` function extracts the user string and bot type from the request body. It then invokes the `chatRetrival` method, passing in the data and bearer token.

   - The `chatRetrival` method creates a new `Client` instance from `chat.py`, which encapsulates the logic for accessing the storage where chat data is kept.
   - It uses the blob storage mechanism to fetch the relevant chat transcripts based on the provided user string and bot type.

3. **Querying the Database**:
   The `Client` calls methods in `mainqueries.py` to perform necessary queries against the database, gathering the relevant data based on the filtering criteria (user ID and bot type).

4. **Response Construction**:
   After collecting the data from the storage and processing it as per the requirements, the service constructs and sends a response back to the client, which includes the chat data in a paginated format if necessary.

### Conclusion
The `/chat/history` endpoint efficiently combines multiple modules and services, ensuring secure access and streamlined retrieval of chat history for users in the Conversational AI Chatbot ecosystem. This setup provides a robust infrastructure for handling conversations while keeping logging and error-handling as integral parts of the workflow.