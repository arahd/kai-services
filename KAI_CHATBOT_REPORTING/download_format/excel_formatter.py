import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, Border, Side
from io import BytesIO 
from flask import make_response,jsonify
from flask import send_file
from datetime import datetime
from zoneinfo import ZoneInfo
import re

# Regex matching all illegal XML characters for openpyxl
ILLEGAL_CHARACTERS_RE = re.compile(
    r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]'
)

def sanitize_for_excel(value):
    """Strip illegal XML control characters from a string."""
    if isinstance(value, str):
        return ILLEGAL_CHARACTERS_RE.sub('', value)
    return value

def sanitize_dataframe(df):
    """Apply sanitization to all string columns in a DataFrame."""
    for col in df.select_dtypes(include=['object']).columns:
        df[col] = df[col].map(sanitize_for_excel)
    return df

def excel_formatter(data, name, timezone_offset=None, start_date=None, end_date=None):
    try:
        tz = ZoneInfo(timezone_offset)
        df = pd.DataFrame(data)
        df.rename(
            columns={
                "response_time": "Response Time Taken",
                "input_token": "Input Tokens Used",
                "output_token": "Output Tokens Used",
            },
            inplace=True,
        )
        if "username" in df.columns and "conversation_date" in df.columns:
            df = df.sort_values(
                by=["username", "conversation_date"], ascending=[True, True]
            )
        df.insert(0, "S.No", range(1, len(df) + 1))
        df = sanitize_dataframe(df)
        output = BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Users", index=False)
        mimetype = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        filename = (
            f"{name}_{start_date.replace('-', '')}_To_{end_date.replace('-', '')}.xlsx"
            if start_date and end_date
            else f"{name}_{datetime.now(tz).strftime('%Y%m%d_%H%M%S')}.xlsx"
        )

        output.seek(0)
        response = send_file(
            output,
            mimetype=mimetype,
            as_attachment=True,
            download_name=filename
        )
        response.headers["Cache-Control"] = "no-store"
        return response
    except Exception as e:
        return make_response(jsonify(error=f"Error in download excel {e}"),500)

def excel_construction(applied_filters,df_data,type,platform_language):
    try:
        report_type_translations_french = {
            'performance': 'performance',
            'feedback': 'retours',
            'tokenutilized': 'tokens_utilisés',
            'usage': 'utilisation'
        }
        if platform_language=="en":
            report_types = [rt for rt in type]
        elif platform_language=="fr":
            report_types = [report_type_translations_french.get(rt, rt) for rt in type]
            
        report_header = ",".join(report_types)
        df_data.index = df_data.index + 1
        filter_data = [{'Filter': key, 'Value': applied_filters.get(key, 'ALL')} for key in ['usernames', 'response_time', 'response_types','ratings', 'year', 'week', 'month', 'start_date', 'end_date', 'language_type','model']]
        if platform_language!='en':
            filter_data =language_based_headers(filter_data=filter_data)
        df_filters = pd.DataFrame(filter_data)
        output = BytesIO()
        df_filters.to_excel(output, index=False, startrow=2)
        with pd.ExcelWriter(output, engine='openpyxl', mode='a', if_sheet_exists='overlay') as writer:
            df_data.to_excel(writer, index=True, startrow=15, startcol=0)
        output.seek(0)
        wb = load_workbook(output)
        ws = wb.active
        thin_border = Border(left=Side(border_style="thin"), 
                    right=Side(border_style="thin"), 
                    top=Side(border_style="thin"), 
                    bottom=Side(border_style="thin"))
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=2)
        ws['A1'] = f"{report_header}"
        ws['A1'].alignment = Alignment(horizontal='center', vertical='center')
        ws['A1'].font = Font(size=14, bold=True)
        if 'group_by' in applied_filters and applied_filters['group_by'] and not df_data.empty:
            ws.merge_cells(start_row=15, start_column=1, end_row=15, end_column=2)
            ws['A15'] = "Grouper par" if platform_language == 'fr' else "Group By"
            ws['A15'].alignment = Alignment(horizontal='left', vertical='center')
            ws['A15'].font = Font(size=14, bold=True)
        ws.merge_cells(start_row=15, start_column=1, end_row=15, end_column=2)
        ws['A16'] = "Sortie du rapport" if platform_language == 'fr' else "Report Output"
        ws['A16'].alignment = Alignment(horizontal='center', vertical='center')
        ws['A16'].font = Font(size=14, bold=True)
        for row in ws.iter_rows(min_row=3, max_row=ws.max_row, min_col=1, max_col=ws.max_column):
            for cell in row:
                cell.alignment = Alignment(horizontal='left', vertical='center')
                cell.border = thin_border
        output.seek(0)
        wb.save(output)
        output.seek(0)
        response = make_response(output.getvalue())
        response.headers['Content-Disposition'] = 'attachment; filename=Reportdata.xlsx'
        response.headers['Content-type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        return response
    except Exception as e:
        return make_response(jsonify(error=f"Error in download excel {e}"),500)
    
def language_based_headers(filter_data):
    df = pd.DataFrame(filter_data)
    french_mapping = {'usernames':'noms_utilisateurs', 'response_time':'temps_de_réponse', 'response_types':'types_de_réponse', 'ratings':'évaluations', 'year':'année', 'week':'semaine', 'month':'mois', 'start_date':'date_de_début', 'end_date':'date_de_fin', 'language_type':'type_de_langue', 'model':'modèle'}
    df['Filter'] = df['Filter'].map(french_mapping).fillna(df['Filter'])
    df = df.rename(columns={'Filter': 'Filtre', 'Value': 'Valeur'})
    filter = df.to_dict(orient='records')
    return filter