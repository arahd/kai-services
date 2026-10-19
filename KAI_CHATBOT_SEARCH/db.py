from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Boolean, create_engine, Column, Integer, String, Text, LargeBinary, DateTime, func
from pgvector.sqlalchemy import Vector
from config import DATABASE_URL, VECTOR_DIM

Base = declarative_base()

class PDFChunk(Base):
    __tablename__ = "pdf_chunks"
    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, index=True)
    source = Column(String, index=True)
    conv_id = Column(String, nullable=True)
    content = Column(Text)
    embedding = Column(Vector(VECTOR_DIM))


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(String, primary_key=True, index=True)
    doc_id = Column(String, index=True, nullable=False)
    filename = Column(String, nullable=False)
    filedata = Column(LargeBinary, nullable=False)
    conv_id = Column(String, index=True, nullable=True)
    exceeds_threshold = Column(Boolean, default=False, nullable=True)
    username = Column(String, nullable=True)
    uploaded_at = Column(DateTime, server_default=func.now())

sync_engine = create_engine(
                DATABASE_URL,
                echo=False,
                pool_size=5,
                max_overflow=5,
                pool_timeout=30,
                pool_recycle=1800,
                pool_pre_ping=True
            )
Base.metadata.create_all(bind=sync_engine)

SessionLocal = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False)
