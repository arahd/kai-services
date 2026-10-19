from sqlalchemy import Column, Integer, String, Text, LargeBinary, DateTime, Boolean, func, JSON
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine
from pgvector.sqlalchemy import Vector
from config import DATABASE_URL, VECTOR_DIM

Base = declarative_base()

class PDFChunk(Base):
    __tablename__ = "pdf_chunks"
    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, index=True)
    source = Column(String, index=True)
    conv_id = Column(String, nullable=True)
    content = Column(Text, nullable=True)
    image_data = Column(Text, nullable=True)
    embedding = Column(Vector(VECTOR_DIM))
    is_deleted = Column(Boolean, default=False, nullable=False)

class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(String, primary_key=True, index=True)
    doc_id = Column(String, index=True, nullable=False)
    conv_id = Column(String, index=True, nullable=True)
    filename = Column(String, nullable=False)
    filedata = Column(LargeBinary, nullable=False)
    exceeds_threshold = Column(Boolean, default=False, nullable=True)
    username = Column(String, nullable=True)
    uploaded_at = Column(DateTime, server_default=func.now())

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

sync_engine = create_engine(
                DATABASE_URL,
                echo=False,
                pool_size=5,
                max_overflow=5,
                pool_timeout=30,
                pool_recycle=1800,
                pool_pre_ping=True
            )
try:
    Base.metadata.create_all(bind=sync_engine)
except Exception as e:
    import logging
    logging.getLogger("db").warning(f"Failed to auto-create tables on sync_engine startup: {e}")

SessionLocal = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False)

