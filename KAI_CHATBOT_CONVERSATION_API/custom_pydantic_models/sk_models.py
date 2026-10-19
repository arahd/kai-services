from semantic_kernel.kernel_pydantic import KernelBaseModel
from pydantic import Field

class GeneralResponseModel(KernelBaseModel):
    response: str = Field(description="The main response content")
