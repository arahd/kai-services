from urllib.parse import quote_plus
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, scoped_session
import os
from contextlib import contextmanager


ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
# HOST_NAME_ENV = "AZURE"
if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

db_type = os.getenv("DB_TYPE", "PG")

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

# Scoped session
db_session = scoped_session(sessionmaker(autocommit=False,
                                         autoflush=False,
                                         bind=engine))

Base = declarative_base()
Base.query = db_session.query_property()

@contextmanager
def get_db():
    """Provide a transactional scope around a series of operations."""
    session = db_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        db_session.remove()
