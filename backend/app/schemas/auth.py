from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CredentialsIn(BaseModel):
    email: EmailStr
    # 8 is the floor, not a policy essay: length is what actually matters.
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    # No length floor here: a short wrong password should be a 401, not a 422
    # that tells the caller anything about the stored policy.
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordChangeIn(BaseModel):
    # No length floor on the current password: a short wrong guess must read as
    # "incorrect", not as a 422 that hints at the stored policy.
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: datetime
