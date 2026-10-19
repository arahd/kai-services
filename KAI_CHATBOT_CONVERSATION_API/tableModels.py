import os
from urllib.parse import quote_plus
from sqlalchemy import Boolean, Column, Integer, String, Text, create_engine, DateTime, event
from sqlalchemy.orm import declarative_base, sessionmaker
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

# Create all tables
Base.metadata.create_all(engine)
