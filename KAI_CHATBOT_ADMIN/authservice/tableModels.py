import json
import os
from urllib.parse import quote_plus
from sqlalchemy import VARBINARY,LargeBinary,DateTime,Date,BINARY,Column,Integer,BigInteger,String,ForeignKey,create_engine,Boolean,event,Text
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
    role = Column(String(50), unique=True)
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

class UserTokens(Base):
    __tablename__ = "user_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(255), nullable=False)

    group_id = Column(
        Integer,
        ForeignKey("user_groups.id"),
        nullable=True
    )

    day = Column(Date, nullable=False)
    tokens_used = Column(Integer, nullable=False)
    is_blocked = Column(Boolean, nullable=False, default=False)
    allow_sensitive_search = Column(Boolean, nullable=False, default=True)
    input_token_limit = Column(BigInteger, nullable=False, default=0)
    output_token_limit = Column(BigInteger, nullable=False, default=0)
    input_tokens_used = Column(BigInteger, nullable=False, default=0)
    output_tokens_used = Column(BigInteger, nullable=False, default=0)
    overall_input_token_usage = Column(BigInteger,nullable=False,default=0)
    overall_output_token_usage = Column(BigInteger,nullable=False,default=0)

class UserRoleMapping(Base):
    __tablename__ = "user_role"

    id = Column(Integer, primary_key=True)
    username = Column(String(255), nullable=False)
    user_roles = Column(String, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "user_roles": self.user_roles
        }


class PrivacyPolicy(Base):
    __tablename__ = "privacy_policy"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(100), nullable=True)
    policy_key = Column(String(255), unique=True, nullable=False)
    policy_value = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

    def to_dict(self):
        return {
            "key": self.policy_key,
            "value": self.policy_value,
            "description": self.description,
            "category": self.category
        }


class UserGroup(Base):
    __tablename__ = "user_groups"

    id = Column(Integer, primary_key=True)

    group_name = Column(String(255), unique=True, nullable=False)

    input_token_limit = Column(BigInteger, default=0)
    output_token_limit = Column(BigInteger, default=0)

    overall_input_token_usage = Column(BigInteger, default=0)
    overall_output_token_usage = Column(BigInteger, default=0)

    daily_input_token_usage = Column(BigInteger, default=0)
    daily_output_token_usage = Column(BigInteger, default=0)

    created_at = Column(DateTime)
    updated_at = Column(DateTime)
 

db_type = os.getenv("DB_TYPE", "sql")

if db_type.upper() == "SQL":
    SQLUSERNAME = os.getenv("SQLUSERNAME")
    SQLPWD = os.getenv("SQLPWD")
    SQLHOST = os.getenv("SQLHOST")
    # SQLHOST="20.84.105.168"`
    SQLPORT = os.getenv("SQLPORT")
    SQLDBNAME = os.getenv("DB_NAME")
    print(f'db credentials: SQLUSERNAME:{SQLUSERNAME},SQLPWD:{SQLPWD},SQLHOST:{SQLHOST},DB_NAME:{SQLDBNAME},SQLPORT:{SQLPORT}')
    connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{SQLDBNAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
if db_type.upper() == "PG":
    connection_string = os.getenv("PGDBCONNSTR")
engine = create_engine(
                connection_string,
                echo=False,
                pool_size=10,
                max_overflow=20,
                pool_timeout=30,
                pool_recycle=600,
                pool_pre_ping=True
            )
Session = sessionmaker(bind=engine)
# Create all tables
Base.metadata.create_all(engine)
       
 
 