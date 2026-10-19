from datetime import datetime, time
import pytz
from flask import request

def convert_utc_to_timezone(utc_dt, target_tz_name=None):
    """
    Converts a naive or aware UTC datetime into a target timezone.
    Defaults to 'UTC' if target_tz_name is missing or invalid.
    """
    if not utc_dt:
        return None
        
    # If the database returns naive datetime objects, assume they are UTC
    if utc_dt.tzinfo is None:
        utc_dt = pytz.utc.localize(utc_dt)
        
    if not target_tz_name:
        # Retrieve timezone from request header, fallback to UTC if not specified
        target_tz_name = request.headers.get('X-Timezone', 'UTC')
        
    try:
        target_tz = pytz.timezone(target_tz_name)
    except pytz.UnknownTimeZoneError:
        target_tz = pytz.utc
        
    return utc_dt.astimezone(target_tz)

def get_utc_range_for_local_date(date_str, tz_name):
    """
    Converts a local date string (YYYY-MM-DD) into its exact starting and ending 
    UTC timestamps based on the user's timezone.
    """
    if not date_str:
        return None, None
    try:
        local_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.utc
        
    # Parse the YYYY-MM-DD string
    local_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    
    # Create local start of day (00:00:00) and end of day (23:59:59.999999)
    local_start = local_tz.localize(datetime.combine(local_date, time.min))
    local_end = local_tz.localize(datetime.combine(local_date, time.max))
    
    # Convert both boundaries back to UTC for safe database matching
    return local_start.astimezone(pytz.utc), local_end.astimezone(pytz.utc)
