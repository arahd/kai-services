import json
import os
from urllib.parse import quote_plus
from sqlalchemy import VARBINARY, LargeBinary, DateTime, BINARY,Column,Integer,String,ForeignKey,Date,create_engine,Boolean,event,exists,JSON
from sqlalchemy.orm import relationship,declarative_base,sessionmaker
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
   
        if isinstance(target, User):
            audit_entry = User_Audit(**log_entry)
        elif isinstance(target, UserRole):
            audit_entry = UserRole_Audit(**log_entry)
        elif isinstance(target, UserPreference):
            audit_entry = UserPreference_Audit(**log_entry)
        elif isinstance(target, UserSessionDetails):
            audit_entry = UserSessionDetails_Audit(**log_entry)
        elif isinstance(target, PasswordHistory):
            audit_entry = PasswordHistory_Audit(**log_entry)
 
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
               
class User_Audit(Base):
    __tablename__ = 'users_audit'
   
    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    username = Column(String(100), nullable=False)
    password = Column(LargeBinary, nullable=False)
    profile_picture = Column(LargeBinary, nullable=True)
    firstname = Column(String(50), nullable=False)
    lastname = Column(String(50), nullable=False)
    bot_type_id = Column(Integer,nullable=False)
    is_deleted = Column(Boolean,nullable=False)
    is_default_password=Column(Boolean,nullable=False)
 
class User(Base,AuditMixin):
    __tablename__ = 'users'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), nullable=False, unique=True)
    password = Column(LargeBinary, nullable=False)
    profile_picture = Column(LargeBinary, nullable=True)
    firstname = Column(String(50), nullable=False)
    lastname = Column(String(50), nullable=False)
    bot_type_id = Column(Integer,ForeignKey("bot_types._id"))
    is_deleted = Column(Boolean,nullable=False,default=False)
    is_default_password = Column(Boolean,nullable=False,default=False)
    
    bot_type = relationship("BotType", back_populates="users")
    user_roles = relationship("UserRole", back_populates="user", cascade="all, delete")
    user_preferences = relationship("UserPreference", back_populates="user", cascade="all, delete")
    user_session_details = relationship("UserSessionDetails",back_populates ="user")
    password_histories = relationship("PasswordHistory", back_populates="user")

    def to_dict(self):
        role_names = [user_role.role.role for user_role in self.user_roles]
        if self.user_preferences:
            language = self.user_preferences[0].language_type.language_type if self.user_preferences[0].language_type else ""
        else:
            language = ""
        profile_picture = self.profile_picture if self.profile_picture is not None else None
        firstname = self.firstname if self.firstname is not None else ""
        lastname = self.lastname if self.lastname is not None else ""
        bot_type=self.bot_type.bot_type if self.bot_type is not None else ""
       
        user_dict = {
            "_id": self._id,
            "username": self.username,
            "password": self.password,
            "roles": role_names,
            "firstname": firstname,
            "lastname": lastname,
            "profile_picture": profile_picture,
            "bot_type": bot_type,
            "language": language,
            "is_default_password":self.is_default_password
        }
        return dict(user_dict)
   
    def to_dict_audit(self):
        return {
            "username": self.username,
            "password": self.password,
            "firstname": self.firstname,
            "lastname": self.lastname,
            "profile_picture": self.profile_picture,
            "bot_type_id": self.bot_type_id,
            "is_deleted":self.is_deleted
        }
AuditMixin.register_event_listeners(User)
 
class Role(Base):
    __tablename__ = 'roles'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    role = Column(String(20), unique=True)
    user_roles = relationship("UserRole", back_populates="role", cascade="all, delete")

    def to_dict(self):
        return{
            "role":self.role
        }
   
class UserRole_Audit(Base):
    __tablename__ = 'user_roles_audit'
   
    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    user_id = Column(Integer,nullable=False)
    role_id = Column(Integer,nullable=False)
 
 
class UserRole(Base,AuditMixin):
    __tablename__ = 'user_roles'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users._id', ondelete='CASCADE'), nullable=False)
    role_id = Column(Integer, ForeignKey('roles._id', ondelete='CASCADE'), nullable=False)
    user = relationship("User", back_populates="user_roles")
    role = relationship("Role", back_populates="user_roles")
   
    def to_dict_audit(self):
        return{
            "user_id":self.user_id,
            "role_id":self.role_id
        }
 
AuditMixin.register_event_listeners(UserRole)
 
class BotType(Base):
    __tablename__ = 'bot_types'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    bot_type = Column(String(25), nullable=False)
    password_rest_token = relationship("PasswordResetToken", back_populates="passwordResetToken", cascade="all, delete")
    users = relationship("User", back_populates="bot_type", cascade="all, delete")
    password_historys = relationship("PasswordHistory", back_populates="passwordHistory", cascade="all, delete")

    def to_dict(self):
        return {
            "_id": self._id,
            "bot_type": self.bot_type
        }
 
class LanguageType(Base):
    __tablename__ = 'language_types'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    language_type = Column(String(50), nullable=False)
    user_preferences = relationship("UserPreference", back_populates="language_type")
   
    def to_dict(self):
        return {
            "_id": self._id,
            "language_type": self.language_type
        }
       
class UserPreference_Audit(Base):
    __tablename__ = 'user_preference_audit'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    language_id = Column(Integer,nullable=True)
    user_id = Column(Integer,nullable=False)
 
class UserPreference(Base,AuditMixin):
    __tablename__ = 'user_preference'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    language_id = Column(Integer, ForeignKey('language_types._id'), nullable=True, default=1)
    user_id = Column(Integer, ForeignKey('users._id', ondelete='CASCADE'), nullable=False)
    user = relationship("User", back_populates="user_preferences")
    language_type = relationship("LanguageType", back_populates="user_preferences")
   
    def to_dict_audit(self):
        return{
            "language_id":self.language_id,
            "user_id":self.user_id
        }
AuditMixin.register_event_listeners(UserPreference)
 
class PasswordResetToken(Base):
    __tablename__ = 'password_reset_tokens'
 
    _id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False)
    token = Column(String(50), nullable=False)
    token_expiry = Column(DateTime, nullable=False)
    is_used = Column(String(50),nullable=False,default="unused")
    bot_id = Column(Integer, ForeignKey('bot_types._id', ondelete='CASCADE'), nullable=False)
   
    passwordResetToken = relationship("BotType", back_populates= "password_rest_token")
   
    def to_dict(self):
        return {
            "_id": self._id,
            "username" : self.username,
            "token" : self.token,
            "token_expiry" : self.token_expiry,
            "is_used" : self.is_used
        }

class UserSessionDetails_Audit(Base):
    __tablename__ = 'user_session_details_audit'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    user_id = Column(Integer,nullable=False)
    session_id = Column(String(600),nullable=False)
    is_active = Column(Boolean,nullable=False)
    created_at = Column(DateTime,nullable=False)
class UserSessionDetails(Base,AuditMixin):
    __tablename__ = 'user_session_details'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer,ForeignKey('users._id'),nullable=False)
    session_id = Column(String(600),nullable=False)
    is_active = Column(Boolean,nullable=False)
    created_at = Column(DateTime,nullable=False)
    user = relationship("User",back_populates ="user_session_details")

    def to_dict(self):
        sessionID = self.session_id if self.session_id is not None else None
        return {
            "_id": self._id,
            "user_id" : self.user_id, 
            "session_id" : sessionID, 
            "is_active" : self.is_active,
            "created_at": self.created_at
        }
    def to_dict_audit(self):
        return {
            "user_id" : self.user_id, 
            "session_id" : self.session_id, 
            "is_active" : self.is_active,
            "created_at": self.created_at
        }
AuditMixin.register_event_listeners(UserSessionDetails)

       
class PasswordHistory_Audit(Base):
    __tablename__ = 'password_history_audit'
   
    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    user_id = Column(Integer, nullable=False)
    old_password = Column(LargeBinary, nullable=False)
    changed_at = Column(DateTime, nullable=False)
    bot_type_id = Column(Integer, nullable=False)


class PasswordHistory(Base,AuditMixin):
    __tablename__ = 'password_history'

    _id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users._id'), nullable=False)
    old_password = Column(LargeBinary, nullable=False)
    changed_at = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    bot_type_id = Column(Integer, ForeignKey('bot_types._id'), nullable=False)

    user = relationship("User", back_populates="password_histories")

    passwordHistory = relationship("BotType", back_populates= "password_historys")

    def to_dict(self):
        return {
            "_id": self._id,
            "user_id" : self.user_id,
            "old_password" : self.old_password,
            "changed_at" : self.changed_at,
            "bot_type_id":self.bot_type_id
        }
    def to_dict_audit(self):
        return {
            "_id": self._id,
            "user_id" : self.user_id,
            "old_password" : self.old_password,
            "changed_at" : self.changed_at,
            "bot_type_id":self.bot_type_id
        }
AuditMixin.register_event_listeners(PasswordHistory) 

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

    def to_dict(self):
        return {
            "id": self.id,
            "username" : self.username,
            "project_id" : self.project_id,
            "tenant_id" : self.tenant_id,
            "client_id" : self.client_id,
            "client_secret" : self.client_secret,
            "jwt_secret" : self.jwt_secret,
            "jwt_kid" : self.jwt_kid,
            "token_hash" : self.token_hash,
            "token_expiry" : self.token_expiry,
            "is_revoked" : self.is_revoked,
            "requests_per_day" : self.requests_per_day,
            "tokens_per_day" : self.tokens_per_day,
            "requests_used" : self.requests_used,
            "tokens_used" : self.tokens_used,
            "total_requests_used" : self.total_requests_used,
            "total_tokens_used" : self.total_tokens_used,
            "revoked_at" : self.revoked_at,
            "reset_at" : self.reset_at
        }

class UserTokens(Base):
    __tablename__ = "user_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(255), nullable=False)
    group_id = Column(Integer, nullable=True)
    day = Column(Date, nullable=False)
    tokens_used = Column(Integer, nullable=False, default=0)
    input_token_limit = Column(Integer, default=500000)
    output_token_limit = Column(Integer, default=20000)
    input_tokens_used = Column(Integer, default=0)
    output_tokens_used = Column(Integer, default=0)
    is_blocked = Column(Boolean, nullable=False, default=False)
    allow_sensitive_search = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true"
    )
    allowed_domains = Column(JSON, nullable=True)
    restricted_domains = Column(JSON, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "group_id": self.group_id,
            "day": self.day,
            "tokens_used": self.tokens_used,
            "input_token_limit": self.input_token_limit,
            "output_token_limit": self.output_token_limit,
            "input_tokens_used": self.input_tokens_used,
            "output_tokens_used": self.output_tokens_used,
            "is_blocked": self.is_blocked,
            "allow_sensitive_search": self.allow_sensitive_search
        }


class UserLatestModel(Base):
    __tablename__ = "user_latest_model"

    email = Column(String(150), primary_key=True)
    default_model = Column(String(100), nullable=False, default="gpt-3.5")
    latest_model = Column(String(100), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

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

class ChatServiceLogs(Base):
    __tablename__ = "ChatServiceLogs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(255), nullable=False)   # store username (lowercase)
    action = Column(String(100), nullable=False)
    status = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False)

class ProductUsers(Base):
    __tablename__ = "product_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(255), nullable=False)
    is_product_admin = Column(Boolean, nullable=False, default=False)
    is_k_agent_user = Column(Boolean, nullable=False, default=False)
    is_k_agent_simple = Column(Boolean, nullable=False, default=False)
    is_k_agent_admin = Column(Boolean, nullable=False, default=False)
    is_kaf_user = Column(Boolean, nullable=False, default=False)
    is_kaf_dev = Column(Boolean, nullable=False, default=False)
    is_kaf_admin = Column(Boolean, nullable=False, default=False)
    is_docspec_user = Column(Boolean, nullable=False, default=False)
    is_docspec_admin = Column(Boolean, nullable=False, default=False)
    is_k_spec_admin = Column(Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            "id": self.id,
            "username" : self.username,
            "is_product_admin" : self.is_product_admin,
            "is_k_agent_user" : self.is_k_agent_user,
            "is_k_agent_simple" : self.is_k_agent_simple,
            "is_k_agent_admin" : self.is_k_agent_admin,
            "is_kaf_user" : self.is_kaf_user,
            "is_kaf_dev" : self.is_kaf_dev,
            "is_kaf_admin" : self.is_kaf_admin,
            "is_docspec_user" : self.is_docspec_user,
            "is_docspec_admin" : self.is_docspec_admin,
            "is_k_spec_admin" : self.is_k_spec_admin,
        }

class UserGroup(Base):
    __tablename__ = "user_groups"

    id = Column(Integer, primary_key=True)
    group_name = Column(String(255))

    input_token_limit = Column(Integer, default=500000)
    output_token_limit = Column(Integer, default=20000)

    overall_input_token_usage = Column(Integer, default=0)
    overall_output_token_usage = Column(Integer, default=0)

    daily_input_token_usage = Column(Integer, default=0)
    daily_output_token_usage = Column(Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "group_name": self.group_name,
            "input_token_limit": self.input_token_limit,
            "output_token_limit": self.output_token_limit,
            "overall_input_token_usage": self.overall_input_token_usage,
            "overall_output_token_usage": self.overall_output_token_usage,
            "daily_input_token_usage": self.daily_input_token_usage,
            "daily_output_token_usage": self.daily_output_token_usage
        }

db_type = os.getenv("DB_TYPE", "sql")
if db_type.upper() == "SQL":
    SQLUSERNAME = os.getenv("SQLUSERNAME")
    SQLPWD = os.getenv("SQLPWD")
    SQLHOST = os.getenv("SQLHOST")
    SQLPORT = os.getenv("SQLPORT")
    SQLDBNAME = os.getenv("DB_NAME")
    print(f'db credentials: SQLUSERNAME:{SQLUSERNAME},SQLPWD:{SQLPWD},SQLHOST:{SQLHOST},DB_NAME:{SQLDBNAME},SQLPORT:{SQLPORT}')
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
# Create all tables
Base.metadata.create_all(engine)
       
 
 