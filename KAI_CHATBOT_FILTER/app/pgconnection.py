import os
from sqlalchemy import Column, Integer, String, Boolean, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from pgvector.sqlalchemy import Vector
from app.logger import logger,SERVICE_NAME,PROJECT_NAME,get_caller_frame,extras

PG_HOST = os.getenv("CHATBOT_PG_HOST")
PG_PORT = os.getenv("CHATBOT_PG_PORT")
PG_USER = os.getenv("CHATBOT_PG_USERNAME")
PG_PASSWORD = os.getenv("CHATBOT_PG_PWD")
PG_DB = os.getenv("CHATBOT_PG_DB_NAME")

Base = declarative_base()



class SensitiveTopic(Base):
    __tablename__ = "sensitive_topics"

    id = Column(Integer, primary_key=True)
    bot_type = Column(String(255))
    question = Column(String)
    feedback_flag = Column(Boolean)
    sensitivetopic_embeddings = Column(Vector(1536))


try:
    pgconnstr = os.getenv('PGDBCONNSTR')
    logger.info(f'postgres connection string:{pgconnstr}',extra=extras)
    engine = create_engine(
                pgconnstr,
                echo=False,
                pool_size=5,
                max_overflow=5,
                pool_timeout=30,
                pool_recycle=1800,
                pool_pre_ping=True
            )
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()



    Base.metadata.create_all(engine)
except Exception as e:
    logger.exception(f'exception occured in posgres connection',extra=extras)

