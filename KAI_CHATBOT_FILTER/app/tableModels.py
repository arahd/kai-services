import base64
import json
from MySQLdb import Date
import pyodbc
import bcrypt
import os
from urllib.parse import quote_plus
from fastapi import FastAPI, Depends
from sqlalchemy import JSON, Boolean, Column, Integer, String, BINARY, ForeignKey, create_engine, VARBINARY, LargeBinary, DateTime, Text, event, Table
from sqlalchemy.orm import relationship, declarative_base, sessionmaker
from datetime import datetime, timezone

Base = declarative_base()

class AuditMixin:
    @staticmethod
    def register_event_listeners(cls):
        @event.listens_for(cls, 'after_insert')
        def after_insert(mapper, connection, target):
            AuditMixin.log_event(target, 'insert')

        @event.listens_for(cls, 'after_update')
        def after_update(mapper, connection, target):
            AuditMixin.log_event(target, 'update')

        @event.listens_for(cls, 'before_delete')
        def before_delete(mapper, connection, target):
            AuditMixin.log_event(target, 'delete')

    @staticmethod
    def log_event(target, action):
        log_entry = {
            'action': action,
            'record_id': target._id,
            'changed_by': "System", 
            'timestamp': datetime.now(timezone.utc),
            **target.to_audit_dict()
        }
        
        audit_entry = None
   
 
        if isinstance(target, UserFeedback):
            audit_entry = UserFeedbackAudit(**log_entry)
        elif isinstance(target, FeedbackOptions):
            audit_entry = FeedbackOptionsAudit(**log_entry)
        
        if audit_entry:
            session = Session()
            try:
                session.add(audit_entry)
                session.commit()
            except Exception as e:
                session.rollback()
                print(f"Error occurred while logging audit: {e}")
            finally:
                session.close()


class BotType(Base):
    __tablename__ = 'bot_types'
    _id = Column(Integer, primary_key=True)
    bot_type = Column(String(25), nullable=False)

    users = relationship("User", back_populates="bot_type")
    user_feedbacks = relationship("UserFeedback", back_populates="bot_type")
    feedback_option=relationship("FeedbackOptions",back_populates="bot_type")

class User(Base):
    __tablename__ = 'users'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), nullable=False, unique=True)
    password = Column(LargeBinary, nullable=False)
    profile_picture = Column(LargeBinary, nullable=True)
    firstname = Column(String(50), nullable=False)
    lastname = Column(String(50), nullable=False)
    bot_type_id = Column(Integer, ForeignKey('bot_types._id'))
    is_deleted=Column(Boolean,nullable=False)
    user_feedback = relationship("UserFeedback", back_populates="user", foreign_keys="[UserFeedback.given_by]")
    approved_feedback = relationship("UserFeedback", back_populates="approver", foreign_keys="[UserFeedback.approved_rejected_by]")
    bot_type = relationship("BotType", back_populates="users")

    def to_dict(self):
        return {
            "_id": self._id,
            "username": self.username,
            "password": self.password,
            "profile_picture": self.profile_picture,
            "firstname": self.firstname,
            "lastname": self.lastname,
            "bot_type_id": self.bot_type_id
        }


class UserFeedbackAudit(Base):
    __tablename__ = 'user_feedback_audit'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    rating = Column(Integer, nullable=True)
    additional_comment = Column(Text, nullable=True)
    feedback_comment = Column(String(200), nullable=True)
    question = Column(Text, nullable=True)
    response = Column(Text, nullable=True)
    feedback_type = Column(String(50), nullable=True)
    feedback_flag = Column(Integer, nullable=True)
    bot_type_id = Column(Integer, nullable=True)
    given_by = Column(Integer, nullable=True)
    given_timestamp = Column(DateTime, nullable=True)
    feedback_comment_id = Column(Integer,nullable=True)
    approved_rejected_by=Column(Integer,nullable=True)
    approval_status = Column(String(50),nullable=True)
    feedback_options_id=Column(Integer,nullable=True)
    language_type=Column(String(10),nullable=True)
    response_type=Column(String(50),nullable=True)
    model_update_status = Column(Boolean,nullable=True)
    approveRejectComments=Column(Text,nullable=True)



class UserFeedback(Base,AuditMixin):
    __tablename__ = "user_feedback"
    
    _id = Column(Integer, primary_key=True)
    rating = Column(Integer, nullable=True)
    additional_comment = Column(Text, nullable=True)
    feedback_comment = Column(String(200), nullable=True)
    question = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    feedback_type = Column(String(50), nullable=False)
    response_type=Column(String(50), nullable=False)
    feedback_flag = Column(Integer, nullable=False)
    bot_type_id = Column(Integer, ForeignKey('bot_types._id'))
    given_by = Column(Integer, ForeignKey('users._id'))
    given_timestamp = Column(DateTime, nullable=False)
    language_type=Column(String(10),nullable=False)
    feedback_options_id=Column(Integer,ForeignKey('feedback_options._id'),nullable=True)
    approved_rejected_by=Column(Integer,ForeignKey('users._id'),nullable=True)
    approval_status = Column(String(50),nullable=False,default="unapproved")
    model_update_status = Column(Boolean,nullable=False,default=False)
    approveRejectComments=Column(Text,nullable=True)
    
    bot_type = relationship("BotType", back_populates="user_feedbacks")
    user = relationship("User", back_populates="user_feedback", foreign_keys=[given_by])
    approver = relationship("User", back_populates="approved_feedback", foreign_keys=[approved_rejected_by])
    feedback_options=relationship("FeedbackOptions",back_populates="user_feedback")
    
    def to_dict(self):
        return {
            "_id": self._id,
            "rating": self.rating,
            "additional_comment": self.additional_comment if self.additional_comment else "",
            "feedback_comment": self.feedback_comment if self.feedback_comment else "",
            "feedback_flag": self.feedback_flag,
            "feedback_type": self.feedback_type,
            "username": self.user.username,
            "question": self.question,
            "response": self.response,
            "bot_type": self.bot_type.bot_type,
            "given_timestamp": self.given_timestamp.strftime("%d/%m/%Y %H:%M:%S"),
            "approved_rejected_by": self.approver.username if self.approver else "",
            "approval_status": self.approval_status,
            "model_update_status": self.model_update_status,
            "feedback_options_id":self.feedback_options_id,
            "language_type":self.language_type,
            "response_type":self.response_type,
            "approveRejectComments":self.approveRejectComments
        }
        
    def to_audit_dict(self):
        return {
            "rating": self.rating,
            "additional_comment": self.additional_comment,
            "feedback_comment": self.feedback_comment,
            "feedback_flag": self.feedback_flag,
            "feedback_type": self.feedback_type,
            "given_by": self.given_by,
            "question": self.question,
            "response": self.response,
            "bot_type_id": self.bot_type_id,
            "given_timestamp": self.given_timestamp,
            "approved_rejected_by": self.approved_rejected_by,
            "approval_status": self.approval_status,
            "model_update_status": self.model_update_status,
            "feedback_options_id":self.feedback_options_id,
            "language_type":self.language_type,
            "response_type":self.response_type,
            "approveRejectComments":self.approveRejectComments
        }


AuditMixin.register_event_listeners(UserFeedback)

class FeedbackOptionsAudit(Base):
    __tablename__ = 'feedback_options_audit'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=lambda:datetime.now(timezone.utc), nullable=False)
    feedback_type = Column(String(50), nullable=True)
    response_type = Column(String(50),nullable=True)
    feedback_comment_english = Column(Text, nullable=True)
    feedback_comment_french = Column(Text, nullable=True)
    feedback_flag = Column(Boolean, nullable=True)
    additional_comments_required = Column(Boolean,nullable=True)
    updated_timestamp= Column(DateTime, nullable=True)
    bot_type_id = Column(Integer,nullable=True)
    is_deleted=Column(Boolean, nullable=True)
    display_index=Column(Integer,nullable=True)

class FeedbackOptions(Base,AuditMixin):
    __tablename__ = 'feedback_options'
    
    _id = Column(Integer, primary_key=True)
    feedback_type = Column(String(50), nullable=False)
    response_type = Column(String(50),nullable=False)
    feedback_comment_english = Column(Text, nullable=False)
    feedback_comment_french = Column(Text, nullable=False)
    feedback_flag = Column(Boolean, default=False)
    additional_comments_required = Column(Boolean, default=False)
    updated_timestamp= Column(DateTime, default=datetime.now(timezone.utc))
    bot_type_id = Column(Integer, ForeignKey('bot_types._id'), nullable=False)
    is_deleted=Column(Boolean, default=False)
    display_index=Column(Integer,nullable=True)
    

    bot_type = relationship('BotType', back_populates='feedback_option')
    user_feedback = relationship('UserFeedback',back_populates='feedback_options')
    
    def to_dict(self):
       return {
            "_id" : self._id,
            "feedback_type" : self.feedback_type,
            "response_type" : self.response_type,
            "feedback_comment_english" : self.feedback_comment_english,
            "feedback_comment_french" : self.feedback_comment_french,
            "feedback_flag" : self.feedback_flag,
            "additional_comments_required" : self.additional_comments_required,
            "updated_timestamp" : self.updated_timestamp,
            "bot_type" : self.bot_type.bot_type,
            "is_deleted" : self.is_deleted,
            "display_index":self.display_index,
        }
    
    def to_audit_dict(self):
        return {
            "feedback_type" : self.feedback_type,
            "response_type" : self.response_type,
            "feedback_comment_english" : self.feedback_comment_english,
            "feedback_comment_french" : self.feedback_comment_french,
            "feedback_flag" : self.feedback_flag,
            "additional_comments_required" : self.additional_comments_required,
            "updated_timestamp" : self.updated_timestamp,
            "bot_type_id" : self.bot_type_id,
            "is_deleted" : self.is_deleted,
            "display_index":self.display_index,
        }
    
AuditMixin.register_event_listeners(FeedbackOptions)

db_type = os.getenv("DB_TYPE", "sql")

if db_type.upper() == "SQL":
    SQLUSERNAME = os.getenv("SQLUSERNAME")
    SQLPWD = os.getenv("SQLPWD")
    SQLHOST = os.getenv("SQLHOST")
    SQLPORT = os.getenv("SQLPORT")
    SQLDBNAME = os.getenv("DB_NAME")
    connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{SQLDBNAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
if db_type.upper() == "PG":
    connection_string = os.getenv("PGDBCONNSTR")
engine = create_engine(
                connection_string,
                echo=False,
                pool_size=5,
                max_overflow=5,
                pool_timeout=30,
                pool_recycle=1800,
                pool_pre_ping=True
            )
Session = sessionmaker(bind=engine)

# Create all tables
Base.metadata.create_all(engine)



