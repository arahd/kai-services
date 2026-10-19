from requests import Session
from logger import logger, extras
from table_models import LLMModel, UserRegDetails, UserLatestModel ,Conversation, UserDetails, GPT_Model
from db import db_session  
from datetime import datetime
from logger import logger, get_caller_frame,extras

def fetch_models():
    extras['functionname'] = get_caller_frame().f_code.co_name
    try:
        model_names = db_session.query(LLMModel.model_name).all()

        # .all() returns list of tuples so converted to list of strings
        return [name for (name,) in model_names]

    except Exception as e:
        logger.error(f"Error fetching models: {e}",extra=extras)
        return []


def store_user(user_email, models, db: Session = db_session):
    extras['functionname'] = get_caller_frame().f_code.co_name
    try:

        logger.info(f"Storing user {user_email} with models={models}",extra=extras)

        user = db_session.query(UserRegDetails).filter(UserRegDetails.email == user_email).first()

        if not user:
            user = UserRegDetails(
                email=user_email,
                models=str(models),
                approved="pending"
            )
            db_session.add(user)
            logger.info(f"New user created: {user._id}",extra=extras)
        else:
            logger.info(f"User already exists: {user._id}",extra=extras)

        db_session.flush()   
        db_session.commit()
        return user

    except Exception as e:
        db_session.rollback()
        logger.exception(f"store_user ERROR: {e}",extra=extras)
        raise


def upsert_user_latest_model(user_email, latest_model,default_model):
    extras['functionname'] = get_caller_frame().f_code.co_name
    try:
        updated_at = datetime.utcnow()
        user_latest = db_session.query(UserLatestModel).filter(UserLatestModel.email == user_email).first()

        if user_latest:
            user_latest.latest_model = latest_model
            user_latest.default_model = default_model
            user_latest.updated_at = updated_at
            message = f"Updated user_latest_model for {user_email} with latest_model={latest_model}"
            logger.info(
                message,
                extra=extras
            )
        else:
            user_latest = UserLatestModel(
                email=user_email,
                default_model=default_model,
                latest_model=latest_model,
                updated_at=updated_at
            )
            db_session.add(user_latest)
            message = f"Inserted new user_latest_model for {user_email} with latest_model={latest_model}"
            logger.info(
                message,
                extra=extras
            )

        db_session.commit()
        
        return {
            "message": "updated successfully",
            "userId": user_email,
            "latest_model": latest_model,
            "default_model": default_model
        }


    except Exception as e:
        db_session.rollback()
        logger.exception(f"upsert_user_latest_model ERROR: {e}", extra=extras)
        raise


def fetch_user_latest_model(user_email):
    extras['functionname'] = get_caller_frame().f_code.co_name
    try:
        user_latest = db_session.query(UserLatestModel).filter(UserLatestModel.email == user_email).first()
        if not user_latest:
            return None

        conversations = (
            db_session.query(
                Conversation.conversation_id,
                GPT_Model.model_name
            )
            .join(
                UserDetails,
                Conversation.username_id == UserDetails._id
            )
            .join(
                GPT_Model,
                Conversation.gpt_model_id == GPT_Model._id
            )
            .filter(UserDetails.value == user_email)
            .all()
        )

        return {
            "message": "fetched successfully",
            "userId": user_latest.email,
            "default_model": user_latest.default_model,
            "latest_model": user_latest.latest_model,
            "conversations": [
                {
                    "conversation_id": c.conversation_id,
                    "model_name": c.model_name
                }
                for c in conversations
            ]
        }

    except Exception as e:
        logger.exception(f"fetch_user_latest_model ERROR: {e}", extra=extras)
        return None
