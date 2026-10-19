import os
from datetime import datetime, timezone
from urllib.parse import quote_plus

from flask import g
from sqlalchemy import (VARBINARY, LargeBinary, Boolean, Column, DateTime, ForeignKey,
                        Integer, String, Text, create_engine, event)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

Base = declarative_base()

DB_TYPE = os.getenv('DB_TYPE')

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
   
        if isinstance(target, Config):
            audit_entry = Config_Audit(**log_entry)
        elif isinstance(target, ConfigData):
            audit_entry = ConfigData_Audit(**log_entry)
        elif isinstance(target, Bot_Config):
            audit_entry = Bot_Config_Audit(**log_entry)

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

class User(Base):
    __tablename__ = 'users'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), nullable=False, unique=True)
    password = Column(LargeBinary, nullable=False)
    firstname = Column(String(50), nullable=False)
    lastname = Column(String(50), nullable=False)
    bot_type_id = Column(Integer,ForeignKey("bot_types._id"))
    is_deleted = Column(Boolean,nullable=False,default=False)
    is_default_password = Column(Boolean,nullable=False,default=False)
    
    bot_type = relationship("BotType", back_populates="users")
    user_session_details = relationship("UserSessionDetails",back_populates ="user")

    def to_dict(self):
        firstname = self.firstname if self.firstname is not None else ""
        lastname = self.lastname if self.lastname is not None else ""
        bot_type=self.bot_type.bot_type if self.bot_type is not None else ""
        
        user_dict = {
            "_id": self._id,
            "username": self.username,
            "password": self.password,
            "firstname": firstname,
            "lastname": lastname,
            "bot_type": bot_type
        }
        return dict(user_dict)


class BotType(Base):
    __tablename__ = 'bot_types'

    _id = Column(Integer, primary_key=True, autoincrement=True)
    bot_type = Column(String(25), nullable=False)
    users = relationship("User", back_populates="bot_type", cascade="all, delete")
    bot_config_id = relationship("Bot_Config", back_populates="bot_type", cascade="all, delete")
    bot_config_id_ocp = relationship("Bot_ConfigOCP", back_populates="bot_type_ocp")    
    def to_dict(self):
        return {
            "_id": self._id,
            "bot_type": self.bot_type
        }
class Config_Audit(Base):
    __tablename__ = "config_audit"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    environmentName = Column(String(50), nullable=False)
    applicationName = Column(String(50), nullable=False)
    createdTime = Column(DateTime, nullable=False)
    modifiedTime = Column(DateTime, nullable=False)

class Config(Base,AuditMixin):
    __tablename__ = 'config'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    environmentName = Column("environmentName", String(50), nullable=False)
    applicationName = Column("applicationName",String(50), nullable=False)
    createdTime = Column("createdTime", DateTime, nullable=False)
    modifiedTime = Column("modifiedTime", DateTime, nullable=False)

    config_data = relationship('ConfigData', back_populates='config', cascade="all, delete")

    def to_dict(self):
        return {
            '_id': self._id,
            'environmentName': self.environmentName,
            'applicationName': self.applicationName,
            'createdTime': self.createdTime.strftime('%d/%m/%Y %H:%M:%S'),
            'modifiedTime': self.modifiedTime.strftime('%d/%m/%Y %H:%M:%S'),
            'data': [{"_id": data._id ,'key': data.key, 'value': data.value,'config_description': data.config_description} for data in self.config_data]
        }
    def to_dict_audit(self):
        return {
            'environmentName' : self.environmentName,
            'applicationName' : self.applicationName,
            'createdTime' : self.createdTime,
            'modifiedTime' : self.modifiedTime,
            }
AuditMixin.register_event_listeners(Config)
class ConfigData_Audit(Base):
    __tablename__ = "config_data_audit"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    key = Column(String(200), nullable=False)
    value = Column(String(500), nullable=False)
    config_id = Column(Integer, nullable=False)
    config_description = Column(Text, nullable=True)
    
class ConfigData(Base,AuditMixin):
    __tablename__ = 'config_data'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(200), nullable=False)
    value = Column(Text, nullable=False)
    config_id = Column(Integer, ForeignKey('config._id', ondelete='CASCADE'), nullable=False)
    config_description = Column(Text,nullable=True)

    config = relationship('Config', back_populates='config_data')

    def to_dict_audit(self):
        return {
            'key': self.key,
            'value': self.value,
            'config_id':self.config_id,
            'config_description':self.config_description
            }
AuditMixin.register_event_listeners(ConfigData)

class Bot_Config_Audit(Base):
    __tablename__ = "bot_specific_configurations_audit"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    key = Column(String(200), nullable=False)
    value = Column(String(500), nullable=False)
    environmentName = Column(String(50), nullable=False)
    input_options = Column(Text, nullable= True)
    input_type = Column(String(50), nullable= False)
    label = Column(String(50), nullable= False)
    description = Column(Text,nullable=False)
    bot_id = Column(Integer,nullable=False)

class Bot_Config(Base,AuditMixin):
    __tablename__ = 'bot_specific_configurations'
    
    _id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(200), nullable=False)
    value = Column(String(500), nullable=False)
    environmentName = Column(String(50), nullable=False)
    input_options = Column(Text, nullable= True)
    input_type = Column(String(50), nullable= False)
    label = Column(String(50), nullable= False)
    description = Column(Text,nullable=False)
    bot_id = Column(Integer, ForeignKey('bot_types._id', ondelete='CASCADE'), nullable=False)

    bot_type = relationship("BotType", back_populates="bot_config_id")
    
    def to_dict(self):
        # if "," in self.value:
        #     self.value = self.value.split(",")

        if self.description is None:
            self.description = ""
            
        if self.input_options is None or self.input_options == "":
            options = []
        elif "," in self.input_options:
            options = self.input_options.split(",")
        else:
            options = [self.input_options]
        return {
            "_id": self._id,
            "key" : self.key,
            "value" : self.value,
            "input_options": options,
            "input_type": self.input_type,
            "label": self.label,
            "description":self.description,
            "bot_type": self.bot_type.bot_type
        }
    
    def to_dict_audit(self):
        if self.description is None:
            self.description = ""
            
        if self.input_options is None or self.input_options == "":
            options = []
        elif "," in self.input_options:
            options = self.input_options.split(",")
        else:
            options = [self.input_options]
        return {
            "key":self.key,
            "value":self.value,
            "environmentName":self.environmentName,
            "input_options":options,
            "input_type":self.input_type,
            "label":self.label,
            "description":self.description,
            "bot_id":self.bot_id
        }
AuditMixin.register_event_listeners(Bot_Config)

class UserSessionDetails(Base):
    __tablename__ = 'user_session_details'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer,ForeignKey('users._id'),nullable=False)
    session_id = Column(String(600),nullable=False)
    is_active = Column(Boolean,nullable=False)
    created_at = Column(DateTime,nullable=False)
    user = relationship("User",back_populates ="user_session_details")

    def to_dict(self):
        return {
            "_id": self._id,
            "user_id" : self.user_id, 
            "session_id" : self.session_id, 
            "is_active" : self.is_active,
            "created_at": self.created_at
        }
    
class ConfigOCP_Audit(Base):
    __tablename__ = "config_ocp_audit"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    environmentName = Column(String(50), nullable=False)
    applicationName = Column(String(50), nullable=False)
    createdTime = Column(DateTime, nullable=False)
    modifiedTime = Column(DateTime, nullable=False)

class ConfigOCP(Base,AuditMixin):
    __tablename__ = 'config_ocp'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    environmentName = Column(String(50), nullable=False)
    applicationName = Column(String(50), nullable=False)
    createdTime = Column(DateTime, nullable=False)
    modifiedTime = Column(DateTime, nullable=False)

    config_data_ocp = relationship('ConfigDataOCP', back_populates='config_ocp', cascade="all, delete")

    def to_dict(self):
        return {
            '_id': self._id,
            'environmentName': self.environmentName,
            'applicationName': self.applicationName,
            'createdTime': self.createdTime.strftime('%d/%m/%Y %H:%M:%S'),
            'modifiedTime': self.modifiedTime.strftime('%d/%m/%Y %H:%M:%S'),
            'data': [{"_id": data._id ,'key': data.key, 'value': data.value,'config_description': data.config_description} for data in self.config_data_ocp]
        }
    def to_dict_audit(self):
        return {
            'environmentName' : self.environmentName,
            'applicationName' : self.applicationName,
            'createdTime' : self.createdTime,
            'modifiedTime' : self.modifiedTime,
            }
AuditMixin.register_event_listeners(ConfigOCP)

class ConfigDataOCP_Audit(Base):
    __tablename__ = "config_data_ocp_audit"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    key = Column(String(200), nullable=False)
    value = Column(String(500), nullable=False)
    config_id = Column(Integer, nullable=False)
    config_description = Column(Text, nullable=True)
    
class ConfigDataOCP(Base,AuditMixin):
    __tablename__ = 'config_data_ocp'
    _id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(200), nullable=False)
    value = Column(String(500), nullable=False)
    config_id = Column(Integer, ForeignKey('config_ocp._id', ondelete='CASCADE'), nullable=False)
    config_description = Column(Text,nullable=True)

    config_ocp = relationship('ConfigOCP', back_populates='config_data_ocp')

    def to_dict_audit(self):
        return {
            'key': self.key,
            'value': self.value,
            'config_id':self.config_id,
            'config_description':self.config_description
            }
AuditMixin.register_event_listeners(ConfigDataOCP)

class Bot_ConfigOCP_Audit(Base):
    __tablename__ = "bot_specific_configurations_ocp_audit"

    _id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String(10), nullable=False)
    record_id = Column(Integer, nullable=False)
    changed_by = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.now(timezone.utc), nullable=False)
    key = Column(String(200), nullable=False)
    value = Column(String(500), nullable=False)
    environmentName = Column(String(50), nullable=False)
    input_options = Column(Text, nullable= True)
    input_type = Column(String(50), nullable= False)
    label = Column(String(50), nullable= False)
    description = Column(Text,nullable=False)
    bot_id = Column(Integer,nullable=False)

class Bot_ConfigOCP(Base,AuditMixin):
    __tablename__ = 'bot_specific_configurations_ocp'
    
    _id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(200), nullable=False)
    value = Column(String(500), nullable=False)
    environmentName = Column(String(50), nullable=False)
    input_options = Column(Text, nullable= True)
    input_type = Column(String(50), nullable= False)
    label = Column(String(50), nullable= False)
    description = Column(Text,nullable=False)
    bot_id = Column(Integer, ForeignKey('bot_types._id', ondelete='CASCADE'), nullable=False)

    bot_type_ocp = relationship("BotType", back_populates="bot_config_id_ocp")
    
    def to_dict(self):
        # if "," in self.value:
        #     self.value = self.value.split(",")

        if self.description is None:
            self.description = ""
            
        if self.input_options is None or self.input_options == "":
            options = []
        elif "," in self.input_options:
            options = self.input_options.split(",")
        else:
            options = [self.input_options]
        return {
            "_id": self._id,
            "key" : self.key,
            "value" : self.value,
            "input_options": options,
            "input_type": self.input_type,
            "label": self.label,
            "description":self.description,
            "bot_type": self.bot_type_ocp.bot_type
        }
    
    def to_dict_audit(self):
        if self.description is None:
            self.description = ""
            
        if self.input_options is None or self.input_options == "":
            options = []
        elif "," in self.input_options:
            options = self.input_options.split(",")
        else:
            options = [self.input_options]
        return {
            "key":self.key,
            "value":self.value,
            "environmentName":self.environmentName,
            "input_options":self.input_options,
            "input_type":self.input_type,
            "label":self.label,
            "description":self.description,
            "bot_id":self.bot_id
        }
AuditMixin.register_event_listeners(Bot_ConfigOCP)

if DB_TYPE.upper()=='SQL':
    SQLUSERNAME =  os.getenv("SQLUSERNAME")
    SQLPWD = os.getenv("SQLPWD")
    SQLHOST = os.getenv("SQLHOST")
    SQLPORT = os.getenv("SQLPORT")
    # SQLPORT = "1543"
    DB_NAME = os.getenv("SQLDBNAME")
    connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{DB_NAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"

if DB_TYPE.upper()=='PG':
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
Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# # Create all tables
Base.metadata.create_all(engine)