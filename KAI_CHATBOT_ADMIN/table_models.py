import os
from urllib.parse import quote_plus
from flask import g
from sqlalchemy import JSON,NVARCHAR, Boolean, CheckConstraint, Column, Integer, String, Text, BINARY, ForeignKey, create_engine, VARBINARY, LargeBinary,DateTime,event
from sqlalchemy.orm import Session, relationship, declarative_base, sessionmaker
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

        @event.listens_for(cls, 'after_delete')
        def after_delete(mapper, connection, target):
            AuditMixin.log_event(target, 'delete')

    @staticmethod
    def log_event(target, action):
        log_entry = {
            'action': action,
            'record_id': target._id,
            'changed_by': g.get('user_name', 'system'), 
            'timestamp': datetime.now(timezone.utc),
            **target.to_dict_audit()
        }
        
        audit_entry = None

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
    
    user = relationship("User", back_populates="bot_type")


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
    email = Column(String(150), nullable=False, unique=True)
    profile_picture = Column(LargeBinary, nullable=True)
    firstname = Column(String(50), nullable=False)
    lastname = Column(String(50), nullable=False)
    bot_type_id = Column(Integer,ForeignKey("bot_types._id"))
    is_deleted = Column(Boolean, nullable=False)
    is_default_password = Column(Boolean, nullable=False)
    
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
    models = Column(String(300), nullable=False)
    approved = Column(String(10), nullable=False, default="pending")
    approved_at = Column(DateTime, nullable=True)  # <-- NEW FIELD


    user = relationship("User", back_populates="details")





# Create all tables
# Base.metadata.create_all(engine)
