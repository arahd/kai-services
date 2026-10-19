from sqlalchemy import Column,Integer,String,ForeignKey,VARCHAR, Text, Date,DateTime, CheckConstraint, Boolean, VARBINARY, LargeBinary,ARRAY, JSON, func
from sqlalchemy.orm import relationship,declarative_base,sessionmaker
from datetime import datetime, timezone
from flask import g
from pgvector.sqlalchemy import Vector
import os
VECTOR_DIM = int(os.getenv("VECTOR_DIM", 1536))

Base = declarative_base()


class BotType(Base):
    __tablename__ = 'bot_types'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    bot_type = Column(String(25), nullable=False)

    conversation = relationship("Conversation", back_populates="bot_type")
    user = relationship("User", back_populates="bot_type")
    
    def to_dict(self):
        return {
            "_id": self._id,
            "bot_type": self.bot_type
        }
hours_infos = relationship("Conversation", back_populates="hour")

class Conversation(Base):
    __tablename__ = 'report_conversation'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(VARCHAR(100), nullable=False)
    start_time = Column(VARCHAR(50), nullable=False)
    end_time = Column(VARCHAR(50), nullable=False)
    no_of_questions = Column(Integer, nullable=False)
    date_timestamp = Column(DateTime,nullable=False)
    date_id = Column(Integer,ForeignKey("report_date._id"), nullable=False)
    language_type_id = Column(Integer, ForeignKey("language_types._id"),nullable=False)
    username_id = Column(Integer, ForeignKey("report_user._id"), nullable=False)
    bot_type_id = Column(Integer, ForeignKey("bot_types._id"), nullable=False)
    gpt_model_id = Column(Integer, ForeignKey("report_gpt_model._id"), nullable=True)
    hour_id = Column(Integer, ForeignKey("report_hours._id"), nullable=False)
    minute_id = Column(Integer, ForeignKey("report_minutes._id"), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    is_pinned = Column(Boolean, default=False, nullable=False)
    pinned_at = Column(DateTime, nullable=True)
    date_infos = relationship("DateInfo", back_populates="conversation")
    user = relationship("UserDetails", back_populates="conversation")
    bot_type = relationship("BotType", back_populates="conversation")
    questions = relationship("Questions", back_populates="conversation")
    language = relationship("LanguageType", back_populates="conversation")
    gpt_model = relationship("GPT_Model", back_populates="conversation")
    hours_info = relationship("Hours",back_populates="conversation")
    minutes_info = relationship("Minutes",back_populates="conversation")
    
    def to_dict(self):
        return{
            "_id":self._id,
            "conversation_id":self.conversation_id,
            "start_time":self.start_time,
            "end_time":self.end_time,
            "language_type":self.language_type_id,
            "username_id":self.username_id,
            "no_of_questions":self.no_of_questions,
            "date_id":self.date_id,
            "bot_type_id":self.bot_type_id,
            "hours_id":self.hour_id,
            "minutes_id":self.minute_id,
            "gpt_model_id":self.gpt_model_id,
            "date_timestamp":self.date_timestamp.strftime("%d/%m/%Y %H:%M:%S")
        }


class Questions(Base):
    __tablename__ = 'report_question'
    
    _id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer,ForeignKey("report_conversation._id"), nullable=False)
    date_id = Column(Integer, ForeignKey("report_date._id"), nullable=True)
    question_number = Column(Integer, nullable=False)
    question = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    rating_id = Column(Integer,ForeignKey("report_rating._id"), nullable=False)
    response_type_id = Column(Integer,ForeignKey("report_response_type._id"), nullable=False)
    response_time = Column(Integer, nullable=False)
    response_time_id = Column(Integer,ForeignKey("report_response_time._id"), nullable=False)
    input_token = Column(Integer, nullable=False)
    output_token = Column(Integer, nullable=False)
    total_token = Column(Integer, nullable=False)
    model_id = Column(Integer, ForeignKey("report_gpt_model._id"), nullable=True)

    gpt_model = relationship("GPT_Model", back_populates="questions")
    conversation = relationship("Conversation", back_populates="questions")
    rating = relationship("Rating", back_populates="questions")
    response_type = relationship("ResponseType", back_populates="questions")
    response_time_ref = relationship("ResponseTime", back_populates="questions")

class Rating(Base):
    __tablename__ = 'report_rating'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(Integer, nullable=False)

    questions = relationship("Questions", back_populates="rating")

    def to_dict(self):
        return{
            "_id":self._id,
            "value":self.value
        }

class ResponseTime(Base):
    __tablename__ = 'report_response_time'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    start_time = Column(Integer, nullable=False)
    end_time = Column(Integer, nullable=True)

    questions = relationship("Questions", back_populates="response_time_ref")

    def to_dict(self):
        return{
            "_id":self._id,
            "start_time":self.start_time,
            "end_time":self.end_time
        }


class ResponseType(Base):
    __tablename__ = 'report_response_type'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(String, nullable=False)

    questions = relationship("Questions", back_populates="response_type")

    def to_dict(self):
        return{
            "_id":self._id,
            "value":self.value
        }
    

class UserDetails(Base):
    __tablename__ = 'report_user'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(String, nullable=False)

    conversation = relationship("Conversation", back_populates="user")

    def to_dict(self):
        return{
            "_id":self._id,
            "value":self.value
        }

class DateInfo(Base):
    __tablename__ = 'report_date'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False)
    week_fk = Column(Integer,ForeignKey("report_week._id"), nullable=False)
    month_fk = Column(Integer,ForeignKey("report_month._id"), nullable=False)
    year_fk = Column(Integer,ForeignKey("report_year._id"), nullable=False)

    # Define relationships
    conversation = relationship("Conversation", back_populates="date_infos")
    month = relationship("Month", back_populates="date_infos")
    week = relationship("Week", back_populates="date_infos")
    year = relationship("Year", back_populates="date_infos")

    def to_dict(self):
        return {
            "_id": self._id,
            "date": self.date.strftime("%Y-%m-%d"),
            "week_fk": self.week_fk,
            "month_fk": self.month_fk,
            "year_fk": self.year_fk
        }

class Month(Base):
    __tablename__ = 'report_month'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(String, nullable=False)

    # Define relationships
    date_infos = relationship("DateInfo", back_populates="month")

    def to_dict(self):
        return {
            "_id": self._id,
            "value": self.value
        }

class Year(Base):
    __tablename__ = 'report_year'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(Integer, nullable=False)

    # Define relationships
    date_infos = relationship("DateInfo", back_populates="year")

    def to_dict(self):
        return {
            "_id": self._id,
            "value": self.value
        }

class Week(Base):
    __tablename__ = 'report_week'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(String, nullable=False)

    # Define relationships
    date_infos = relationship("DateInfo", back_populates="week")

    def to_dict(self):
        return {
            "_id": self._id,
            "value": self.value
        }
    
class LanguageType(Base):
    __tablename__ = 'language_types'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    language_type = Column(String, nullable=False)

    def to_dict(self):
        return {
            "_id": self._id,
            "language_type": self.language_type
        }
    conversation = relationship("Conversation", back_populates="language")


class GPT_Model(Base):
    __tablename__ = 'report_gpt_model'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    model_name = Column(String, nullable=False)
    display_name = Column(String(100), nullable=True, default=None)
    description = Column(String(255), nullable=True, default=None)
    is_default = Column(Boolean, nullable=True, default=False)
    is_enabled = Column(Boolean, nullable=True, default=True)

    # Relationships
    conversation = relationship("Conversation", back_populates="gpt_model")
    questions = relationship("Questions", back_populates="gpt_model")

    def to_dict(self):
        return {
            "_id": self._id,
            "model_name": self.model_name,
            "display_name": self.display_name,
            "description": self.description,
            "is_default": self.is_default,
            "is_enabled": self.is_enabled
        }


class Hours(Base):
    __tablename__ = 'report_hours'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(Integer, nullable=False)

    # Define relationships
    conversation = relationship("Conversation", back_populates="hours_info")

    def to_dict(self):
        return {
            "_id": self._id,
            "value": self.value
        }
    
class Minutes(Base):
    __tablename__ = 'report_minutes'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    value = Column(Integer, nullable=False)

    # Define relationships
    conversation = relationship("Conversation", back_populates="minutes_info")

    def to_dict(self):
        return {
            "_id": self._id,
            "value": self.value
        }


class UserModels(Base):
    __tablename__ = "user_models"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users._id"), nullable=False)
    model_id = Column(Integer, ForeignKey("llm_models._id"), nullable=False)

    user = relationship("User", back_populates="user_models")
    model = relationship("LLMModel", back_populates="user_models")


class User(Base):
    __tablename__ = 'users'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), nullable=False, unique=True)
    password = Column(LargeBinary, nullable=False)
    profile_picture = Column(LargeBinary, nullable=True)
    firstname = Column(String(50), nullable=False)
    lastname = Column(String(50), nullable=False)
    bot_type_id = Column(Integer,ForeignKey("bot_types._id"))
    
    bot_type = relationship("BotType", back_populates="user")
    details = relationship("UserRegDetails", back_populates="user", uselist=False)
    
    user_models = relationship("UserModels", back_populates="user", cascade="all, delete-orphan")

    llm_models = relationship(
        "LLMModel",
        secondary="user_models",
        viewonly=True,  # prevent SQLAlchemy from trying to manage this link
        back_populates="users"
    )

    def to_dict(self):
        return {
                "_id": self._id,
                "username": self.username,
            } 

    


class Role(Base):
    __tablename__ = "roles"

    _id = Column(Integer, primary_key=True)
    role = Column(String(150), nullable=False)
    value = Column(String(150), nullable=False, unique=True)

class LLMModel(Base):
    __tablename__ = "llm_models"

    _id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(100), unique=True, nullable=False)
    provider = Column(String(50), nullable=False)
    description = Column(String(500))
    active = Column(Boolean, default=True)


    user_models = relationship("UserModels", back_populates="model", cascade="all, delete-orphan")
    users = relationship(
        "User",
        secondary="user_models",
        viewonly=True,
        back_populates="llm_models"
    )

class UserRegDetails(Base):
    __tablename__ = 'user_reg_details'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users._id"), nullable=True)

    email = Column(String(150), nullable=False, unique=True)
    approved = Column(String(10), nullable=False, default="pending")
    __table_args__ = (
        CheckConstraint("approved IN ('done', 'pending')", name='chk_approved_values'),
    )
    models = Column(String(300), nullable=False)
    user = relationship("User", back_populates="details")

class Projects(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False)
    project_id = Column(String, nullable=False)

    tenant_id = Column(String, nullable=False)
    client_id = Column(String, nullable=False)
    client_secret = Column(String, nullable=False)

    jwt_secret = Column(String, nullable=False) 
    jwt_kid = Column(String, nullable=False)

    token_hash = Column(String, nullable=True)     # hashed token for revocation
    token_expiry = Column(DateTime, nullable=True)
    is_revoked = Column(Boolean, default=False)

    system_prompt = Column(Text,nullable=True)
    #Rate limit fields
    requests_per_day = Column(Integer, default=500)
    tokens_per_day = Column(Integer, default=50000)
    requests_used = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)
    total_requests_used = Column(Integer, default=0)
    total_tokens_used = Column(Integer, default=0)
    revoked_at = Column(DateTime, nullable=True)
    reset_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
                "id": self.id,
                "username": self.username,
                "project_id": self.project_id,
                "is_revoked": self.is_revoked,
                "requests_used_today": self.requests_used,
                "tokens_used_today": self.tokens_used,
                "total_requests_used": self.total_requests_used,
                "total_tokens_used": self.total_tokens_used,
                "revoked_at": self.revoked_at,
                "resetted_at": self.reset_at
            }
    
class PDFChunk(Base):
    __tablename__ = "pdf_chunks"
    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, index=True)
    source = Column(String, index=True)
    conv_id = Column(String, nullable=True)
    content = Column(Text, nullable=True)
    image_data = Column(Text, nullable=True)
    embedding = Column(Vector(VECTOR_DIM))
    is_deleted = Column(Boolean, default=False, nullable=False)

    def to_dict(self):
        return {
                "id": self.id,
                "doc_id": self.doc_id,
                "source": self.source,
                "conv_id": self.conv_id,
            }
    
class ProjectUsage(Base):
    __tablename__ = "project_usage"

    id = Column(Integer, primary_key=True)
    day = Column(DateTime, nullable=True)
    requests_used = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)
    
class User_Role(Base):
    __tablename__ = "user_role"
    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False, default=False,unique=True)
    user_roles = Column(String, nullable=False, default=False)
    
    def to_dict(self):
        return {
                "id": self.id,
                "day": self.day,
                "requests_used": self.requests_used,
                "tokens_used": self.tokens_used
            }
    
class BugReport(Base):
    __tablename__ = "bug_reports"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ticket_number = Column(String(20), unique=True, nullable=False, index=True)
    request_type = Column(String(50), nullable=False, default='BUG_REPORT')
    bug_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    
    # File storage fields
    file_name = Column(String(255), nullable=True)
    file_type = Column(String(100), nullable=True)  # MIME type (image/png, application/pdf, etc.)
    file_size = Column(Integer, nullable=True)  # Size in bytes
    file_data = Column(Text, nullable=True)  # Base64 encoded file content
    
    # Metadata
    created_by = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=lambda: datetime.now(timezone.utc))

    # Status tracking
    state = Column(String(50), default='open', nullable=False)  # open, in_progress, resolved, close)
    
    attachments = relationship(
            "BugReportAttachment",
            backref="bug_report",
            cascade="all, delete-orphan"
        )
    def to_dict(self, include_file=False):
        """Convert to dictionary, optionally excluding large file data"""
        base_dict = {
            "id": self.id,
            "ticket_number": self.ticket_number,
            "request_type": self.request_type,
            "bug_name": self.bug_name,
            "description": self.description,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "status": self.state,
        }
        attachments = []
        # OLD SINGLE FILE SUPPORT
        if self.file_name:
            old_attachment = {
                "file_name": self.file_name,
                "file_type": self.file_type,
                "file_size": self.file_size
            }
            if include_file:
                old_attachment["file_data"] = self.file_data
            attachments.append(old_attachment)
        # NEW MULTI FILE SUPPORT
        for attachment in self.attachments:
            attachment_data = {
                "id": attachment.id,
                "file_name": attachment.file_name,
                "file_type": attachment.file_type,
                "file_size": attachment.file_size
            }
            if include_file:
                attachment_data["file_data"] = attachment.file_data
            attachments.append(attachment_data)
        base_dict["attachments"] = attachments
        return base_dict
class BugReportAttachment(Base):
    __tablename__ = "bug_report_attachments"

    id = Column(Integer, primary_key=True, index=True)
    bug_report_id = Column(Integer,ForeignKey("bug_reports.id"),nullable=False)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    file_data = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True),default=lambda: datetime.now(timezone.utc))
class ProjectApiTokenUsuage(Base):
    __tablename__ = "project_api_token_usuage"

    id = Column(Integer, primary_key=True)
    username = Column(String(255),nullable=False,)
    project_id = Column(String(255),nullable=False)
    model_name = Column(String, nullable=False, default="gpt-4o-mini")
    total_input_tokens = Column(Integer, nullable=False, default=0)
    total_output_tokens = Column(Integer, nullable=False, default=0)

class ProjectAPiCalls(Base):
    __tablename__ = "project_api_calls"

    id = Column(Integer, primary_key=True)
    conv_id = Column(String(255),nullable=False)
    username = Column(String(255),nullable=False)
    project_id = Column(String(255),nullable=False)
    model_name = Column(String, nullable=False, default="gpt-4o-mini")
    date_and_time = Column(DateTime, nullable=False)
    user_query = Column(Text,nullable=False)
    response = Column(Text,nullable=False)
    generated_images = Column(ARRAY(item_type=Text),nullable=True)
    response_time=Column(Integer,nullable = False,default = 0)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)

class ConfigData(Base):
    __tablename__ = "config_data"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(200), nullable=False)
    value = Column(Text, nullable=False)
    config_id = Column(Integer, nullable=False)
    config_description = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "_id": self._id,
            "key": self.key,
            "value": self.value,
            "config_id": self.config_id,
            "config_description": self.config_description
        } 

class QueryPIIAudit(Base):
    __tablename__ = 'query_pii_audit'

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), index=True, nullable=False)
    conv_id = Column(String(255), index=True, nullable=True)
    
    masked_query = Column(Text, nullable=True)
    query_pii_mapping = Column(JSON, nullable=True)
    
    total_masked = Column(Integer, default=0)
    pii_type_counts = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now(), index=True)

class DocumentPIIAudit(Base):
    __tablename__ = 'document_pii_audit'

    id = Column(Integer, primary_key=True, autoincrement=True)
    doc_id = Column(String(255), index=True, nullable=False)
    username = Column(String(100), index=True, nullable=True) 
    filename = Column(String(255), nullable=True)
    
    doc_pii_mapping = Column(JSON, nullable=True)
    
    total_masked = Column(Integer, default=0)
    pii_type_counts = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now(), index=True)