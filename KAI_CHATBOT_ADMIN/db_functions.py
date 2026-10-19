from datetime import datetime, timezone
from flask import jsonify, make_response
import json
import os
import ast
from sqlalchemy.orm import Session
from sqlalchemy.exc import NoResultFound
from sqlalchemy import func, text
from logger import logger,get_caller_frame,extras
from send_mail import send_approval_email
from table_models import LLMModel, Role, User, UserModels, UserRegDetails
from authservice.tableModels import *
import ast


def approved_emails(db: Session):
    logger.info("[approved_emails] Fetching all approved emails", extra= extras)
    email_list = db.query(UserRegDetails)\
                   .filter(UserRegDetails.approved == "done")\
                   .all()

    emails = [user.email for user in email_list]

    logger.info(f"[approved_emails] Found {len(emails)} approved users", extra= extras)
    return emails


def approve_access(email: str, approved: str, db: Session):

    logger.info(f"[approve_access] Attempting to update → email={email}, approved={approved}", extra= extras)

    if approved not in ('done', 'yes'):
        logger.error("[approve_access] Invalid 'approved' value", extra= extras)
        raise ValueError("approved value must be 'done'")

    try:
        user_reg = db.query(UserRegDetails).filter_by(email=email).first()
        if not user_reg:  
            logger.error(f"[approve_access] User details not found in user_reg_details table", extra= extras)
            raise ValueError("User details not found in user_reg_details table!")
        
        user_emails = [u.email for u in db.query(User).all()] 
        if user_reg.email not in user_emails: 
            if approved in ('done', 'yes'): 
                user_reg.approved = 'done'
                user_reg.approved_at=datetime.now(timezone.utc)

                store_user(email, db)
                logger.info(f"[approve_access] Updated user={email} approved={approved}", extra= extras)
                return make_response(jsonify(message=f"Request approved for Azure AD access token for mail id {email}"), 200)
        else:
            logger.error(f"[approve_access] User already exists in user_reg_details table")
            raise ValueError("User details not found in user_reg_details table!")

    except NoResultFound:
        logger.error(f"[approve_access] User not found: {email}", extra= extras)
        raise ValueError(f"User: {email} cannot be found!")

    except Exception as e:
        logger.exception("[approve_access] Unexpected error", extra= extras)
        raise e
    
def store_user(email:str, db: Session):
    try:
        local = email.split("@")[0]
        parts = local.split(".")

        firstname = parts[0]
        lastname = parts[1] if len(parts) > 1 else ""

        new_user = User (
            username=local,
            password=b"",    # store empty bytes
            email=email,
            firstname=firstname,
            lastname=lastname,
            bot_type_id=1,
            is_deleted=False,
            is_default_password=False
        )
        db.add(new_user)
        db.flush()
        logger.info(f"[store_user] User object sucessfully updated to User table", extra= extras)

        user_reg = db.query(UserRegDetails).filter_by(email=new_user.email).first()
        user_reg.user_id=new_user._id

        logger.info(f"User_reg_details record updated successfully", extra= extras)
        return make_response(jsonify(message=f"User record created in User table {email}"), 200)
    
    except Exception as e:
        logger.exception(f"[store user]  User record not created ERROR: {str(e)}", extra=extras)
        print("DB ERROR in store_user:", str(e))
        return []
    

def getuserdetails(db: Session):
    try:
        users = db.query(UserRegDetails.email).all()

        # .all() returns list of tuples so converted to list of strings
        return [email for (email,) in users]

    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        return []
    

def parse_model_string(model_str: str):
    if not model_str:
        return []

    try:
        # Trying with JSON 
        return json.loads(model_str)
    except:
        pass

    try:
        # Try Python literal eval
        return ast.literal_eval(model_str)
    except:
        pass

    try:
        # Fallback: manual split
        cleaned = model_str.strip("[] ").replace(" ", "")
        return cleaned.split(",") if cleaned else []
    except:
        return "unable to split the string of models"
    


def getpendinguserdetails(db: Session):
    try:
        users = db.query(UserRegDetails).filter(UserRegDetails.approved == 'pending').all()
        all_models = db.query(LLMModel).all()

        # Convert to dict for quick lookup
        model_map = {m.model_name: {"_id": m._id, "model_name": m.model_name} for m in all_models}

        output = []

        for u in users:
            raw_models = u.models      
            parsed_models = parse_model_string(raw_models)

            # match models to LLMModel.table
            model_details = []
            for m in parsed_models:
                key = m.strip()

                if key in model_map:
                    model_details.append(model_map[key])
                else:
                    # model exists in string but not in LLMModel table
                    model_details.append({
                        "_id": None,
                        "model_name": m
                    })

            output.append({
                "_id": u._id,
                "email": u.email,
                "models": model_details,
                "approved": u.approved
            })

        return output

    except Exception as e:
        logger.error(f"Error fetching user details: {e}")
        return []
    

def getmodelsofuser(email: str, user: User, db: Session):
    try:

        if not user:
            logger.info(f"[getmodelsofuser] User is not found in DB", extra= extras)
            return {"message": "User not found", "models": []}

        user_model_links = (
            db.query(UserModels)
            .filter(UserModels.user_id == user._id)
            .all()
        )

        if not user_model_links:
            logger.info(f"[getmodelsofuser] Email IDs retrieved but models are not mapped", extra= extras)
            return {"email": email, "models": []}

        model_ids = [link.model_id for link in user_model_links]

        models = (
            db.query(LLMModel)
            .filter(LLMModel._id.in_(model_ids))
            .all()
        )

        result = [
            {
                "_id": m._id,
                "model_name": m.model_name
            }
            for m in models
        ]

        return result

    except Exception as e:
        logger.error(f"Error fetching user models: {e}")
        return {"error": str(e)}


def getregisteresuserdetails(db: Session):
    try:
        users = db.query(UserRegDetails).filter(UserRegDetails.approved == "done", UserRegDetails.user_id.isnot(None)).all()
        output = []

        for u in users:
            user = db.query(User).filter(User._id == u.user_id).first()
            approved_time = u.approved_at
            models = getmodelsofuser(u.email, user, db)

            output.append({
                "email":u.email, 
                "name":user.username,
                "models": models,
                "approved_time": approved_time
            })
        
        return output
    
    except Exception as e:
        logger.error(f"Error fetching user details: {e}")
        return []
    


def approve_models(email: str, models, db: Session):

    if isinstance(models, str):
        models = [models]

    user = db.query(User).filter(User.email == email).first()
    if not user:
        logger.error(f"[approve_models] User not approved according to the table. Approve user first!", extra= extras)
        raise ValueError("User not approved according to the table. Approve user first!")

    results = []

    try:
        for model_name in models:

            model = db.query(LLMModel).filter(LLMModel.model_name == model_name).first()
            if not model:
                logger.error(f"[approve_models] Model not found in llm_models table", extra= extras)
                raise ValueError(f"Model '{model_name}' not found")

            existing_map = (
                db.query(UserModels)
                .filter(UserModels.user_id == user._id,
                        UserModels.model_id == model._id)
                .first()
            )

            if not existing_map:
                new_map = UserModels(user_id=user._id, model_id=model._id)
                db.add(new_map)
                logger.info(f"[approve_models] new model found, model added llm_models table", extra= extras)

            results.append({
                "_id": model._id,
                "model_name": model.model_name
            })

        return results
    
    except Exception as e:
        logger.error(f"[approve_models] Error in approving models: {e}", extra= extras)
        print("DB ERROR in approve_models:", str(e))
        return results


def bulk_approval(users, db: Session):
    results = []
    for email in users:
        reg = db.query(UserRegDetails).filter_by(email=email).first()
        if not reg:
            results.append({
                "email": email,
                "status": "failed",
                "reason": "UserRegDetails not found"
            })
            continue

        models_raw = reg.models or ""
        try:
            model_list = ast.literal_eval(models_raw) if models_raw else []
        except:
            model_list = []

        approve_access(email, "done", db)
        approved_models = approve_models(email, model_list, db)

        email_status = "Didn't inform the user"

        if email.endswith(".com"):
            email_status=send_approval_email(email)
        
        # email_status = send_approval_email(email) # Not yet implemented (works only on .com)

        results.append({
            "email": email,
            "approved_models": approved_models,
            "email_sent": email_status
        })

    return results

def get_user_management_users(db, page=1, page_size=10, search=None, access=None, sort_by=None, sort_order="asc", group_id=None, group_name=None):
    """Fetch user management details from user_tokens."""
    query = db.query(UserTokens)

    if search:
        query = query.filter(UserTokens.user_id.ilike(f"%{search}%"))
    if group_id:
        query = query.filter(UserTokens.group_id == int(group_id))
    if group_name:
        team = db.query(UserGroup).filter(UserGroup.group_name.ilike(f"%{group_name}%")).first()
        query = query.filter(UserTokens.group_id == team.id) if team else query.filter(False)

    sort_column_map = {
        "user_id": UserTokens.user_id,
        "group_id": UserTokens.group_id,
        "input_token_limit": UserTokens.input_token_limit,
        "output_token_limit": UserTokens.output_token_limit,
        "input_tokens_used": UserTokens.input_tokens_used,
        "output_tokens_used": UserTokens.output_tokens_used,
        "allow_sensitive_search": UserTokens.allow_sensitive_search,
        "is_blocked": UserTokens.is_blocked
    }

    if sort_by in sort_column_map:
        sort_column = sort_column_map[sort_by]
        query = query.order_by(sort_column.desc()) if sort_order.lower() == "desc" else query.order_by(sort_column.asc())

    total_records = query.count()
    users = query.offset((page - 1) * page_size).limit(page_size).all()
    response = []

    for u in users:
        team_name = None
        if u.group_id:
            team = db.query(UserGroup).filter(UserGroup.id == u.group_id).first()
            if team:
                team_name = team.group_name

        response.append({
            "user_id": u.user_id,
            "group_id": u.group_id,
            "group_name": team_name,
            "is_blocked": u.is_blocked,
            "allow_sensitive_search": u.allow_sensitive_search,
            "input_token_limit": u.input_token_limit if u.input_token_limit and u.input_token_limit > 0 else 500000,
            "output_token_limit": u.output_token_limit if u.output_token_limit and u.output_token_limit > 0 else 20000,
            "input_tokens_used": (u.input_tokens_used or 0),
            "output_tokens_used": (u.output_tokens_used or 0),
            "overall_input_token_usage": u.overall_input_token_usage or 0,
            "overall_output_token_usage": u.overall_output_token_usage or 0            
        })
    return {"total_records": total_records, "page": page, "page_size": page_size, "users": response}

def get_user_management_summary(db):
    total_users = db.query(UserTokens).count()
    disabled_access = (
        db.query(UserTokens).filter(UserTokens.is_blocked == True).count()
    )

    token_usage = db.query(
        func.sum(UserTokens.input_tokens_used),
        func.sum(UserTokens.output_tokens_used),
    ).first()

    total_input = token_usage[0] or 0
    total_output = token_usage[1] or 0

    return {
        "total_users": total_users,
        "disabled_access": disabled_access,
        "daily_tokens_consumed": total_input + total_output,
    }

def update_user_management_details(db, email, allow_sensitive_search, input_token_limit, output_token_limit):
    token_data = db.query(UserTokens).filter(func.lower(UserTokens.user_id) == func.lower(email)).first()
    if not token_data:
        raise ValueError(f"Token record not found for {email}")

    input_token_limit = int(input_token_limit)
    output_token_limit = int(output_token_limit)

    if input_token_limit < 0:
        raise ValueError("Input Token Limit cannot be negative")
    if input_token_limit > 500000:
        raise ValueError("Input Token Limit cannot exceed 500000")
    if output_token_limit < 0:
        raise ValueError("Output Token Limit cannot be negative")
    if output_token_limit > 20000:
        raise ValueError("Output Token Limit cannot exceed 20000")

    token_data.allow_sensitive_search = bool(allow_sensitive_search)
    token_data.input_token_limit = input_token_limit
    token_data.output_token_limit = output_token_limit
    db.commit()

    return {"message": "User updated successfully", "email": email}

def reset_user_tokens(db, email):
    token_data = (
        db.query(UserTokens)
        .filter(func.lower(UserTokens.user_id) == func.lower(email))
        .order_by(UserTokens.day.desc())
        .first()
    )
    if not token_data:
        raise ValueError(f"Token record not found for {email}")
    
    token_data.is_blocked = False
    token_data.tokens_used = 0
    token_data.input_tokens_used = 0
    token_data.output_tokens_used = 0
    db.commit()

    return {
        "message": "Token usage reset successfully",
        "email": email
    }


def get_grouped_privacy_policy(db):
    """Fetch and group privacy policy configurations by category."""
    try:
        policies = (
            db.query(PrivacyPolicy)
            .filter(PrivacyPolicy.is_active.is_(True))
            .order_by(PrivacyPolicy.category, PrivacyPolicy.display_order)
            .all()
        )
        grouped_policies = {}
        for policy in policies:
            category = policy.category or "GENERAL"
            if category not in grouped_policies:
                grouped_policies[category] = []
            grouped_policies[category].append({
                "key": policy.policy_key,
                "value": policy.policy_value,
                "description": policy.description
            })
        return grouped_policies
    except Exception as e:
        logger.exception(f"Error fetching grouped privacy policy: {e}", extra=extras)
        raise


def get_privacy_policy_content():
    try:
        file_path = os.path.join(os.path.dirname(__file__), "resources", "privacy_policy.json")
        with open(file_path, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception as e:
        logger.exception(f"Error reading privacy policy file: {e}", extra=extras)
        raise

def get_teams(db, sort_by=None, sort_order="asc"):
    query = db.query(UserGroup)

    sort_column_map = {
        "group_name": UserGroup.group_name,
        "input_token_limit": UserGroup.input_token_limit,
        "output_token_limit": UserGroup.output_token_limit,
        "daily_input_token_usage": UserGroup.daily_input_token_usage,
        "daily_output_token_usage": UserGroup.daily_output_token_usage,
        "overall_input_token_usage": UserGroup.overall_input_token_usage,
        "overall_output_token_usage": UserGroup.overall_output_token_usage
    }
    if sort_by in sort_column_map:
        sort_column = sort_column_map[sort_by]
        query = (
            query.order_by(sort_column.desc())
            if sort_order.lower() == "desc"
            else query.order_by(sort_column.asc())
        )
    teams = query.all()
    response = []
    for team in teams:
        member_count = (
            db.query(UserTokens)
            .filter(UserTokens.group_id == team.id)
            .count()
        )
        response.append({
            "group_id": team.id,
            "group_name": team.group_name,
            "member_count": member_count,
            "input_token_limit": team.input_token_limit,
            "output_token_limit": team.output_token_limit,
            "overall_input_token_usage": team.overall_input_token_usage,
            "overall_output_token_usage": team.overall_output_token_usage,
            "daily_input_token_usage": team.daily_input_token_usage,
            "daily_output_token_usage": team.daily_output_token_usage
        })
    return {"teams": response}


def get_team_members(db, group_id):
    team = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not team:
        raise ValueError("Team not found")

    members = db.query(UserTokens).filter(UserTokens.group_id == group_id).all()
    response = [{"email": member.user_id} for member in members]

    return {
        "group_id": team.id,
        "group_name": team.group_name,
        "member_count": len(response),
        "members": response
    }


def create_team(db, group_name, input_token_limit=0, output_token_limit=0):
    existing_team = db.query(UserGroup).filter(UserGroup.group_name == group_name).first()
    if existing_team:
        raise ValueError("Team already exists")

    team = UserGroup(
        group_name=group_name,
        input_token_limit=input_token_limit,
        output_token_limit=output_token_limit
    )
    db.add(team)
    db.commit()
    db.refresh(team)

    return {
        "message": "Team created successfully",
        "team": {
            "group_id": team.id,
            "group_name": team.group_name,
            "input_token_limit": team.input_token_limit,
            "output_token_limit": team.output_token_limit
        }
    }


def update_team(db, group_id, input_token_limit=None, output_token_limit=None):
    team = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not team:
        raise ValueError("Team not found")

    if input_token_limit is not None:
        team.input_token_limit = input_token_limit
    if output_token_limit is not None:
        team.output_token_limit = output_token_limit

    team.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(team)

    return {
        "message": "Team updated successfully",
        "team": {
            "group_id": team.id,
            "group_name": team.group_name,
            "input_token_limit": team.input_token_limit,
            "output_token_limit": team.output_token_limit
        }
    }


def delete_team(db, group_id):
    team = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not team:
        raise ValueError("Team not found")

    db.query(UserTokens).filter(UserTokens.group_id == group_id).update(
        {"group_id": None}, synchronize_session=False
    )
    db.delete(team)
    db.commit()

    return {"message": "Team deleted successfully", "group_id": group_id}


def add_team_members(db, group_id, members):
    team = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not team:
        raise ValueError("Team not found")

    updated_members = []
    for email in members:
        token_data = db.query(UserTokens).filter(
            func.lower(UserTokens.user_id) == func.lower(email)
        ).first()

        if token_data:
            token_data.group_id = group_id
            updated_members.append(email)

    db.commit()
    return {
        "message": "Members added successfully",
        "group_id": group_id,
        "members": updated_members
    }


def remove_team_members(db, group_id, members):
    team = db.query(UserGroup).filter(UserGroup.id == group_id).first()
    if not team:
        raise ValueError("Team not found")

    removed_members = []
    for email in members:
        token_data = db.query(UserTokens).filter(
            func.lower(UserTokens.user_id) == func.lower(email)
        ).first()

        if token_data and token_data.group_id == group_id:
            token_data.group_id = None
            removed_members.append(email)

    db.commit()
    return {
        "message": "Members removed successfully",
        "group_id": group_id,
        "members": removed_members
    }

