from sqlalchemy import Column,Integer,String,ForeignKey,VARCHAR, Text, Date,DateTime, Boolean,ARRAY, JSON, func,BigInteger
from sqlalchemy.orm import relationship,declarative_base
from datetime import datetime

Base = declarative_base()

class BotType(Base):
    __tablename__ = 'bot_types'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    bot_type = Column(String(25), nullable=False)

    conversation = relationship("Conversation", back_populates="bot_type")
    
    def to_dict(self):
        return {
            "_id": self._id,
            "bot_type": self.bot_type
        }
hours_infos = relationship("Conversation", back_populates="hour")

class ChatProject(Base):
    __tablename__ = 'chat_projects'
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_name = Column(String(350), nullable=False)
    username = Column(String(255), nullable=False)
    created_at = Column(DateTime)

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
    project_id = Column(Integer,ForeignKey("chat_projects.id"), nullable=True)
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
            "date_timestamp":self.date_timestamp.strftime("%d/%m/%Y %H:%M:%S"),
            "is_deleted": self.is_deleted,
            "deleted_at": self.deleted_at.strftime("%d/%m/%Y %H:%M:%S") if self.deleted_at else None,
            "is_pinned": self.is_pinned,
            "pinned_at": self.pinned_at.strftime("%d/%m/%Y %H:%M:%S") if self.pinned_at else None
        }


class Questions(Base):
    __tablename__ = 'report_question'
    
    _id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer,ForeignKey("report_conversation._id"), nullable=False)
    message_id = Column(String(100), nullable=True)
    question_number = Column(Integer, nullable=False)
    question = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    model_id = Column(Integer, ForeignKey("report_gpt_model._id"), nullable=True)
    rating_id = Column(Integer,ForeignKey("report_rating._id"), nullable=False)
    response_type_id = Column(Integer,ForeignKey("report_response_type._id"), nullable=False)
    response_time = Column(Integer, nullable=False)
    response_time_id = Column(Integer,ForeignKey("report_response_time._id"), nullable=False)
    input_token = Column(Integer, nullable=False)
    output_token = Column(Integer, nullable=False)
    total_token = Column(Integer, nullable=False)
    date_id = Column(Integer,ForeignKey("report_date._id"), nullable=False)

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

    def to_dict(self):
        return {
            "_id": self._id,
            "model_name": self.model_name
        }
    conversation = relationship("Conversation", back_populates="gpt_model")


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
    
class UserTokens(Base):
    __tablename__ = "user_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(255), nullable=False)
    group_id = Column(Integer, nullable=True)
    day = Column(Date, nullable=False)
    tokens_used = Column(Integer, nullable=False, default=0)
    input_token_limit = Column(Integer, default=0)
    output_token_limit = Column(Integer, default=0)
    input_tokens_used = Column(Integer, default=0)
    output_tokens_used = Column(Integer, default=0)
    is_blocked = Column(Boolean, nullable=False, default=False)
    allow_sensitive_search = Column(Boolean,nullable=False,default=True,server_default="true")
    overall_input_token_usage = Column(BigInteger,nullable=False,default=0)
    overall_output_token_usage = Column(BigInteger,nullable=False,default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "day": self.day,
            "tokens_used": self.tokens_used,
            "group_id": self.group_id,
            "input_token_limit": self.input_token_limit,
            "output_token_limit": self.output_token_limit,
            "input_tokens_used": self.input_tokens_used,
            "output_tokens_used": self.output_tokens_used
        }
    
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

    #system_prompt
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
            "tenant_id": self.tenant_id,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "jwt_secret": self.jwt_secret,
            "jwt_kid": self.jwt_kid,
            "token_hash": self.token_hash,
            "token_expiry": self.token_expiry,
            "is_revoked": self.is_revoked,
            "system_prompt": self.system_prompt,
            "requests_per_day": self.requests_per_day,
            "tokens_per_day": self.tokens_per_day,
            "requests_used": self.requests_used,
            "tokens_used": self.tokens_used,
            "total_requests_used": self.total_requests_used,
            "total_tokens_used": self.total_tokens_used,
            "revoked_at": self.revoked_at,
            "reset_at": self.reset_at,
        }

class ProjectApiTokenUsuage(Base):
    __tablename__ = "project_api_token_usuage"

    id = Column(Integer, primary_key=True)
    username = Column(String(255),nullable=False,)
    project_id = Column(String(255),nullable=False)
    model_name = Column(String, nullable=False, default="gpt-4o-mini")
    total_input_tokens = Column(Integer, nullable=False, default=0)
    total_output_tokens = Column(Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "project_id": self.project_id,
            "model_name": self.model_name,
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
        }

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
    def to_dict(self):
        return {
            "id": self.id,
            "conv_id": self.conv_id,
            "username": self.username,
            "project_id": self.project_id,
            "model_name": self.model_name,
            "date_and_time": self.date_and_time,
            "user_query": self.user_query,
            "response": self.response,
            "generated_images": self.generated_images,
            "response_time": self.response_time,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
        }
        
class UserGroup(Base):
    __tablename__ = "user_groups"

    id = Column(Integer, primary_key=True)
    group_name = Column(String(255))
    input_token_limit = Column(Integer, default=0)
    output_token_limit = Column(Integer, default=0)
    overall_input_token_usage = Column(Integer, default=0)
    overall_output_token_usage = Column(Integer, default=0)
    daily_input_token_usage = Column(Integer, default=0)
    daily_output_token_usage = Column(Integer, default=0)

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