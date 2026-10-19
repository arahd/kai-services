import base64
import json
import pyodbc
import os
from flask import app,g
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import JSON, VARCHAR, Boolean, Column, Integer, String, BINARY, ForeignKey, create_engine, VARBINARY, DateTime, Text, event, Table, Date, LargeBinary, func
from sqlalchemy.orm import relationship, declarative_base, sessionmaker
from datetime import datetime, timezone

Base = declarative_base()

class BotType(Base):
    __tablename__ = 'bot_types'
    _id = Column(Integer, primary_key=True)
    bot_type = Column(String(25), nullable=False)
    conversation = relationship("Conversation", back_populates="bot_type")
    def to_dict(self):
        return {
            "_id":self._id,
            "bot_type":self.bot_type
        }

class ResponseTemplate(Base):
    __tablename__ = 'response_template'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    response_type = Column(String(500),nullable=False)
    response_english=Column(String(500),nullable=False)
    response_french=Column(String(500),nullable=False)

    def to_dict(self):
        return {
            "_id":self._id,
            "response_type":self.response_type,
            "response_english":self.response_english,
            "response_french":self.response_french
        }
    
class Questions(Base):
    __tablename__ = 'report_question'
    
    _id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer,ForeignKey("report_conversation._id"), nullable=False)
    message_id = Column(String(100), nullable=False)
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
    is_like = Column(Boolean, nullable=True)
    liked_at = Column(DateTime, nullable=True)

    conversation = relationship("Conversation", back_populates="questions")
    
class Conversation(Base):
    __tablename__ = 'report_conversation'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, nullable=True)
    conversation_id = Column(VARCHAR(100), nullable=False)
    start_time = Column(VARCHAR(50), nullable=False)
    end_time = Column(VARCHAR(50), nullable=False)
    date_timestamp = Column(DateTime,nullable=False)
    date_id = Column(Integer,ForeignKey("report_date._id"), nullable=False)
    username_id = Column(Integer, ForeignKey("report_user._id"), nullable=False)
    bot_type_id = Column(Integer, ForeignKey("bot_types._id"), nullable=False)
    hour_id = Column(Integer, ForeignKey("report_hours._id"), nullable=False)
    minute_id = Column(Integer, ForeignKey("report_minutes._id"), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    is_pinned = Column(Boolean, default=False, nullable=False)
    pinned_at = Column(DateTime, nullable=True)
    conversation_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=lambda: datetime.now(timezone.utc))

    questions = relationship("Questions", back_populates="conversation")
    date_infos = relationship("DateInfo", back_populates="conversation")
    user = relationship("UserDetails", back_populates="conversation")
    bot_type = relationship("BotType", back_populates="conversation")
    hours_info = relationship("Hours",back_populates="conversation")
    minutes_info = relationship("Minutes",back_populates="conversation")
    
    # FIXED: Replaced old conversation to_dict to output absolute IST timestamps to front-end view
    def to_dict(self):
        
        def to_utc_iso(dt_field):
            if not dt_field:
                return None
            # If the database datetime is naive, assume it's stored in UTC
            if dt_field.tzinfo is None:
                dt_field = dt_field.replace(tzinfo=timezone.utc)
            # Convert to UTC and replace +00:00 with browser-standard 'Z'
            return dt_field.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

        return {
            "_id": self._id,
            "conversation_id": self.conversation_id,
            "conversation_name": self.conversation_name,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "language_type": self.language_type_id,
            "username_id": self.username_id,
            "no_of_questions": self.no_of_questions,
            "date_id": self.date_id.strftime("%Y-%m-%d") if self.date_id else None,
            "bot_type_id": self.bot_type_id,
            "hours_id": self.hour_id,
            "minutes_id": self.minute_id,
            
            # FIXED: Returning clean global UTC strings instead of hardcoded IST
            "date_timestamp": to_utc_iso(self.date_timestamp), 
            "created_at": to_utc_iso(self.created_at),
            "updated_at": to_utc_iso(self.updated_at),
            "deleted_at": to_utc_iso(self.deleted_at),
            "pinned_at": to_utc_iso(self.pinned_at),
            
            "is_deleted": self.is_deleted,
            "is_pinned": self.is_pinned
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


    # Define relationships
    conversation = relationship("Conversation", back_populates="date_infos")


    def to_dict(self):
        return {
            "_id": self._id,
            "date": self.date.strftime("%Y-%m-%d"),
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
class ConversationProject(Base):
    __tablename__ = 'chat_projects'

    id = Column(Integer, primary_key=True)
    project_name = Column(String(255))
    username = Column(String(255))
    created_at = Column(DateTime)
    updated_at = Column(DateTime(timezone=True),nullable=True)

    is_deleted = Column(Boolean, default=False)
    is_pinned = Column(Boolean, default=False)

    def to_dict(self):
        return {
            "project_id": self.id,
            "project_name": self.project_name,
            }

class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(String, primary_key=True, index=True)
    doc_id = Column(String, index=True, nullable=False)
    conv_id = Column(String, index=True, nullable=True)
    filename = Column(String, nullable=False)
    filedata = Column(LargeBinary, nullable=False)
    exceeds_threshold = Column(Boolean, default=False, nullable=True)
    username = Column(String, nullable=True)
    uploaded_at = Column(DateTime, server_default=func.now())

