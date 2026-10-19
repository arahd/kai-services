class DocumentLimitException(Exception):
    def __init__(
        self,
        message="Document limit exceeded",
        status_code=413,
        error_code="DOCUMENT_LIMIT_EXCEEDED"
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code

        super().__init__(self.message)