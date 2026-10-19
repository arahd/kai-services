class TokenTracker:
    def __init__(self):
        self.cumulative_input_token = 0
        self.cumulative_output_token = 0
        self.chat_completion_input_token = 0
        self.chat_completion_output_token = 0

    def update_tokens(self, input_tokens=0, output_tokens=0, call_type='get_answer_gpt'):
        if call_type == 'get_answer_gpt':
            self.chat_completion_input_token += input_tokens
            self.chat_completion_output_token += output_tokens
        else:
            self.cumulative_input_token += input_tokens
            self.cumulative_output_token += output_tokens

    def get_token_counts(self):
        return {
            "cumulative_input_token": self.cumulative_input_token,
            "cumulative_output_token": self.cumulative_output_token,
            "chat_completion_input_token": self.chat_completion_input_token,
            "chat_completion_output_token": self.chat_completion_output_token
        }
