import os
from urllib.parse import quote_plus
from sqlalchemy import Boolean, Column, Integer, BigInteger, String, Text, ForeignKey, Date, create_engine, LargeBinary, DateTime, event, func, JSON
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

class UserTokens(Base):
    __tablename__ = "user_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(255), nullable=False)
    group_id = Column(Integer,ForeignKey("user_groups.group_id"),nullable=True)
    day = Column(Date, nullable=False)
    tokens_used = Column(Integer, nullable=False, default=0)
    is_blocked = Column(Boolean, nullable=False, default=False)
    allow_sensitive_search = Column(Boolean, nullable=False, default=True, server_default="true")
    input_token_limit = Column(BigInteger, nullable=False, default=0)
    output_token_limit = Column(BigInteger, nullable=False, default=0)
    input_tokens_used = Column(BigInteger, nullable=False, default=0)
    output_tokens_used = Column(BigInteger, nullable=False, default=0)
    allowed_domains = Column(JSON, nullable=True)
    restricted_domains = Column(JSON, nullable=True)


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

class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(String, primary_key=True, index=True)
    doc_id = Column(String, index=True, nullable=False)
    filename = Column(String, nullable=False)
    filedata = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime, server_default=func.now())
    exceeds_threshold = Column(Boolean, default=False, nullable=True)
    username = Column(String, nullable=True)
    conv_id = Column(String, index=True, nullable=True)

class ChatProject(Base):
    __tablename__ = 'chat_projects'
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_name = Column(String(350), nullable=False)
    username = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=True)
    
    def to_dict(self):
        return {
            "id": self.id,
            "project_name": self.project_name,
            "username": self.username,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

class ParsedDocument(Base):
    __tablename__ = "parsed_documents"
    id = Column(String, primary_key=True, index=True)
    doc_id = Column(String, index=True, nullable=False)

    conv_id = Column(String, index=True, nullable=True)
    filename = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    token_count = Column(Integer, nullable=False)
    pii_mapping = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)


class UserGroup(Base):
    __tablename__ = "user_groups"

    group_id = Column(Integer, primary_key=True)
    group_name = Column(String(255), unique=True, nullable=False)

    input_token_limit = Column(BigInteger, default=0)
    output_token_limit = Column(BigInteger, default=0)

    overall_input_token_limit = Column(BigInteger, default=0)
    overall_output_token_limit = Column(BigInteger, default=0)

    daily_input_token_usage = Column(BigInteger, default=0)
    daily_output_token_usage = Column(BigInteger, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

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


db_type = os.getenv("DB_TYPE", "pg")

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
Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

try:
    Base.metadata.create_all(engine)
except Exception as e:
    import logging
    logging.getLogger("db").warning(f"Failed to auto-create tables on engine startup: {e}")
