from flask import g
from sqlalchemy import VARCHAR,Text,Date, Boolean, CheckConstraint, Column, Integer, String, ForeignKey, VARBINARY,DateTime,event
from sqlalchemy.orm import Session, relationship, declarative_base
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
    conversation = relationship("Conversation", back_populates="bot_type")
    
    def to_dict(self):
        return {
            "_id": self._id,
            "bot_type": self.bot_type
        }
hours_infos = relationship("Conversation", back_populates="hour")


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
    password = Column(VARBINARY, nullable=False)
    profile_picture = Column(VARBINARY, nullable=True)
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

class UserLatestModel(Base):
    __tablename__ = "user_latest_model"

    email = Column(String(150), primary_key=True)
    default_model = Column(String(100), nullable=False, default="gpt-3.5")
    latest_model = Column(String(100), nullable=True)
    updated_at = Column(DateTime(timezone=False), nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "email": self.email,
            "default_model": self.default_model,
            "latest_model": self.latest_model,
            "updated_at": self.updated_at,
        }

class User_Role(Base):
    __tablename__ = "user_role"
    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False, default=False,unique=True)
    user_roles = Column(String, nullable=False, default=False)

class Questions(Base):
    __tablename__ = 'report_question'
    
    _id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer,ForeignKey("report_conversation._id"), nullable=False)
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
            "date_timestamp":self.date_timestamp.strftime("%d/%m/%Y %H:%M:%S"),
            "is_deleted": self.is_deleted,
            "deleted_at": self.deleted_at.strftime("%d/%m/%Y %H:%M:%S") if self.deleted_at else None,
            "is_pinned": self.is_pinned,
            "pinned_at": self.pinned_at.strftime("%d/%m/%Y %H:%M:%S") if self.pinned_at else None
        } 