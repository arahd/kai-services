from contextvars import ContextVar

current_conv_id:ContextVar[str] =ContextVar('current_conv_id',default="KAI_TEMP_CONV")
current_model_name:ContextVar[str] =ContextVar('current_conv_id',default="KAI_TEMP_MODEL")
current_generated_document_ids:ContextVar[list] = ContextVar('current_generated_document_ids',default=list())
current_generated_image_ids:ContextVar[list] = ContextVar('current_generated_image_ids',default=list())
current_uploaded_filenames:ContextVar[list] = ContextVar('current_uploaded_filenames',default=list())
current_aug_source:ContextVar[list] = ContextVar('current_aug_source', default=list())
current_aug_content:ContextVar[list] = ContextVar('current_aug_content', default=list())
current_aug_tables:ContextVar[list] = ContextVar('current_aug_tables', default=list())
current_domain_filters:ContextVar[dict] = ContextVar('current_domain_filters', default=dict())
current_user_id:ContextVar[str] = ContextVar('current_user_id', default='')