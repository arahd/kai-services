# from flask import Blueprint, request, jsonify
# from token_utils import verify_id_token, generate_app_token

# sso_bp = Blueprint('sso', __name__)

# @sso_bp.route('/auth/sso', methods=['POST'])
# def sso_auth():
#     id_token = request.json.get('id_token')
#     if not id_token:
#         return jsonify({'error': 'Missing id_token'}), 400

#     try:
#         claims = verify_id_token(id_token)
#         user_id = claims.get('upn') or claims.get('email')
#         jwt_token = generate_app_token(user_id)
#         return jsonify({'token': jwt_token, 'user': user_id}), 200
#     except Exception as e:
#         return jsonify({'error': str(e)}), 401
