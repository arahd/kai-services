import os
from urllib.parse import quote_plus
from sqlalchemy import Boolean, Column, Integer, BigInteger, String, Text, ForeignKey, Date, create_engine, LargeBinary, DateTime,event
from sqlalchemy.orm import relationship, declarative_base, sessionmaker
from datetime import datetime, timezone
from flask import g

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
    models = relationship("UserModel", back_populates="user")
 
    def to_dict(self):
        return {
                "_id": self._id,
                "username": self.username,
            }  
   
class UserRegDetails(Base):
    __tablename__ = 'user_reg_details'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users._id"), nullable=False, unique=True)
 
    email = Column(String(150), nullable=False, unique=True)
    role_id = Column(Integer, ForeignKey("roles._id"), nullable=True)
    role = relationship("Role")
    user = relationship("User", back_populates="details")
 
 
class LLMModel(Base):
    __tablename__ = 'llm_models'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    model_name = Column(String(100), nullable=False, unique=True)
    provider = Column(String(50), nullable=False)      # OpenAI, Anthropic, Meta
    description = Column(String(500), nullable=True)
    active = Column(Boolean, default=True)
 
    users = relationship("UserModel", back_populates="model")
 
class UserModel(Base):
    __tablename__ = 'user_models'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users._id"), nullable=False)
    model_id = Column(Integer, ForeignKey("llm_models._id"), nullable=False)
 
    user = relationship("User", back_populates="models")
    model = relationship("LLMModel", back_populates="users")
 
class Role(Base):
    __tablename__ = "roles"   # matches existing Azure SQL table name
 
    _id = Column(Integer, primary_key=True)
    role = Column(String(150), nullable=False)
 
    # relationship to user_reg_details (role_id)
    users = relationship("UserRegDetails", back_populates="role")
 
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
 
    #Rate limit fields
    requests_per_day = Column(Integer, default=500)
    tokens_per_day = Column(Integer, default=50000)
    requests_used = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)
    total_requests_used = Column(Integer, default=0)
    total_tokens_used = Column(Integer, default=0)
    revoked_at = Column(DateTime, nullable=True)
    reset_at = Column(DateTime, default=datetime.utcnow)
 
 
   
class ResumeProcessActivityLog(Base):
    print("Initializing history page table...")
    __tablename__ = "hr_portal_history_page_resume_visa_activity_log"
 
    id = Column(Integer, primary_key=True, autoincrement=True)
    email_id = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False)
    created_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    token_used = Column(Integer, nullable=False, default=0)
    process = Column(String(50), nullable=True)      # Resume / Visa
    process_type = Column(String(100), nullable=True)
    uploaded_file_name = Column(String(500), nullable=True)
    downloaded_file_name = Column(String(500), nullable=True)
    download_url = Column(Text, nullable=True)
         
    # ALL STATUS SUCCESS / FAILED
   
    upload_resume_status = Column(String(20), nullable=True)  
    download_resume_status = Column(String(20), nullable=True)  
    upload_visa_status = Column(String(20), nullable=True)  
    download_visa_status = Column(String(20), nullable=True)  
 
    def to_dict(self):
        return {
            # "id": self.id,
            # "user_name": self.user_name,
            "email_id": self.email_id,
            # "role": self.role,
            # "created_date": self.created_date,
            # "token_used": self.token_used,
            # "process": self.process,
            # "process_type": self.process_type,
            "uploaded_file_name": self.uploaded_file_name,
            "downloaded_file_name": self.downloaded_file_name,
            "download_url": self.download_url,
            "upload_resume_status": self.upload_resume_status,
            "download_resume_status": self.download_resume_status,
            "upload_visa_status": self.upload_visa_status,
            "download_visa_status": self.download_visa_status,
        }
 
 
 
# class HrPortalReportLog(Base):
#     __tablename__ = "hr_portal_report_log"
 
#     id = Column(Integer, primary_key=True, autoincrement=True)
 
#     created_date = Column(DateTime, nullable=False, default=datetime.utcnow)
 
#     user_name = Column(String(255), nullable=True)
#     email_id = Column(String(255), nullable=True)
 
#     process = Column(String(50), nullable=True)         # Resume / Visa
#     process_type = Column(String(100), nullable=True)
 
#     uploaded_file_name = Column(String(500), nullable=True)
#     downloaded_file_name = Column(String(500), nullable=True)
 
#     download_url = Column(Text, nullable=True)
 
#     status = Column(String(50), nullable=True)          # SUCCESS / FAILED
#     token_used = Column(Integer, nullable=False, default=0)
 
#     def to_dict(self):
#         return {
#             "id": self.id,
#             "created_date": self.created_date.strftime("%Y-%m-%d %H:%M:%S") if self.created_date else None,
#             "user_name": self.email_id,
#             "process": self.process,
#             "process_type": self.process_type,
#             "uploaded_file_name": self.uploaded_file_name,
#             "downloaded_file_name": self.downloaded_file_name,
#             "download_url": self.download_url,
#             "status": self.status,
#             "token_used": self.token_used
#         }
       
class HrPortalReportLog(Base):
    __tablename__ = "hr_portal_report_log"

    id = Column(Integer, primary_key=True, autoincrement=True)

    created_date = Column(
        DateTime,
        default=datetime.utcnow
    )

    user_name = Column(String(255))

    email_id = Column(String(255))

    process = Column(String(100))

    process_type = Column(String(100))

    uploaded_file_name = Column(String(500))

    downloaded_file_name = Column(String(500))

    download_url = Column(Text)

    status = Column(String(50))

    token_used = Column(Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "created_date": str(self.created_date),
            "user_name": self.user_name,
            "email_id": self.email_id,
            "process": self.process,
            "process_type": self.process_type,
            "uploaded_file_name": self.uploaded_file_name,
            "downloaded_file_name": self.downloaded_file_name,
            "download_url": self.download_url,
            "status": self.status,
            "token_used": self.token_used
        }   

class HrUsers(Base):
    __tablename__ = "hr_users"

    id = Column(Integer, primary_key=True, autoincrement=True)

    user_name = Column(String(200))

    email_id = Column(String(250), unique=True)

    is_admin = Column(Boolean, default=False)

    resume_offshore = Column(Boolean, default=False)

    resume_onsite = Column(Boolean, default=False)

    resume_internal = Column(Boolean, default=False)

    visa_ict = Column(Boolean, default=False)

    visa_business = Column(Boolean, default=False)

    visa_extension = Column(Boolean, default=False)

    created_date = Column(
        DateTime,
        default=datetime.utcnow
    )

    updated_date = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

class HrLoginHistory(Base):
    __tablename__ = "hr_login_history"

    id = Column(Integer, primary_key=True, autoincrement=True)

    user_name = Column(String(200))

    email_id = Column(String(250))

    login_time = Column(DateTime)

    logout_time = Column(DateTime)   


 
class UserTokens(Base):
    __tablename__ = "user_tokens"
 
    id = Column(Integer, primary_key=True)
    user_id = Column(String(255), nullable=False)
    day = Column(Date, nullable=False)
    tokens_used = Column(Integer, nullable=False, default=0)
    is_blocked = Column(Boolean, nullable=False, default=False)
    allow_sensitive_search = Column(Boolean,nullable=False,default=True,server_default="true")
    input_token_limit = Column(BigInteger, nullable=False, default=0)
    output_token_limit = Column(BigInteger, nullable=False, default=0)
    input_tokens_used = Column(BigInteger, nullable=False, default=0)
    output_tokens_used = Column(BigInteger, nullable=False, default=0)
 
db_type = os.getenv("DB_TYPE", "pg")
 
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
Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

from models.tablemodels import Base

Base.metadata.create_all(bind=engine)
print("Database engine created successfully.")
 
print("Database engine created successfully.")
print("engine =", engine)
print("Session =", Session)
# Create all tables
Base.metadata.create_all(engine)
 
