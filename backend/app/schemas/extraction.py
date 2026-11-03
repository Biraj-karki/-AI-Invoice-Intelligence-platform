from pydantic import BaseModel, Field


class ExtractedText(BaseModel):
    filename: str
    stored_as: str
    page_count: int
    character_count: int
    preview: str = Field(description="First 300 characters of the extracted text.")
