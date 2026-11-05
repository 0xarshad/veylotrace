from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)
    height_cm: float = Field(gt=80, lt=250)
    weight_kg: float = Field(gt=20, lt=500)
    body_fat_percent: float | None = Field(default=None, ge=1, le=75)
    target_weight_kg: float = Field(gt=20, lt=500)
    sex_for_estimates: str
    age_years: int = Field(ge=20, le=78)
    activity_level: str

    @field_validator("sex_for_estimates")
    @classmethod
    def _sex_for_estimates(cls, v: str) -> str:
        if v not in {"female", "male"}:
            raise ValueError("Choose female or male.")
        return v

    @field_validator("activity_level")
    @classmethod
    def _activity_level(cls, v: str) -> str:
        if v not in {"sedentary", "light", "moderate", "very_active"}:
            raise ValueError("Choose an activity level.")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required.")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    remember: bool = True

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class EmailIn(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    role: str
    email_verified: bool
    created_at: datetime


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class SessionOut(BaseModel):
    id: str
    created_at: datetime
    last_used_at: datetime
    user_agent: str
    ip: str
    current: bool
