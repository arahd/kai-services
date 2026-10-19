import io
import re
import logging
import openpyxl
import pandas as pd
import tiktoken

logger = logging.getLogger("indexer.tabular_summarizer")

def generate_tabular_summary(file_bytes: bytes, filename: str) -> str:
    """
    Generates a rich structural summary and metadata profile for CSV and Excel (.xlsx, .xls) files.
    
    The summary includes:
    - Overview (filename, total sheets, dimensions)
    - Per-sheet structure:
      * Sheet dimensions (row & column counts)
      * Column schema details (Column Name, Data Type, Non-Null Count, Null Count, Missing %)
      * Preview of head sample rows (first 5-10 rows in markdown format)
      * Descriptive statistics summary for numeric columns (min, max, mean, median, std)
      * Summary for categorical columns (unique count, top frequent values)
      * Chart metadata for Excel workbooks (if present)
    - Instructions for code_interpreter standalone Python script execution.
    
    If summarization/profiling fails for any reason, falls back gracefully to raw text preview.
    """
    filename_lower = filename.lower()
    summary_parts = [
        f"# Tabular Document Data Profile & Structural Summary",
        f"**Filename:** `{filename}`",
        f"**File Format:** `{filename_lower.split('.')[-1].upper()}`",
    ]

    try:
        if filename_lower.endswith(".csv"):
            summary_parts.extend(_summarize_csv(file_bytes, filename))
        elif filename_lower.endswith((".xlsx", ".xls")):
            summary_parts.extend(_summarize_excel(file_bytes, filename))
        else:
            summary_parts.append(f"\nUnsupported tabular format for `{filename}`.")
    except Exception as e:
        logger.exception(f"Error generating automated tabular summary for {filename}: {e}")
        summary_parts.append(_fallback_raw_preview(file_bytes, filename, error_msg=str(e)))

    summary_parts.append(
        "\n---\n"
        "### Code Interpreter Usage Instructions:\n"
        f"- The full original tabular file `{filename}` is available in your current working directory.\n"
        "- The environment runs standalone Python scripts (NOT Jupyter Notebooks) with: "
        "`pandas>=2.0.0, numpy>=1.24.0, scipy>=1.10.0, matplotlib>=3.7.0, seaborn>=0.12.0, openpyxl>=3.1.0, pillow>=9.5.0`.\n"
        "- For ANY question, calculation, row lookup, aggregation, or plot regarding this dataset, call the `code_interpreter` tool.\n"
        "- **CRITICAL:** You must EXPLICITLY print your results to stdout (e.g. `print(df.to_string())`, `print(result)`). "
        "For visualizations, save to disk (`plt.savefig('output.png')`) and print a confirmation message."
    )

    return "\n\n".join(summary_parts)

def _summarize_dataframe(df: pd.DataFrame, sheet_label: str = "Data") -> list[str]:
    """Helper to profile a single pandas DataFrame."""
    parts = []
    rows, cols = df.shape
    parts.append(f"## Sheet / Table: `{sheet_label}`")
    parts.append(f"- **Dimensions:** {rows:,} rows × {cols:,} columns")

    if df.empty:
        parts.append("*Table is empty.*")
        return parts

    # Clean column names
    df.columns = [str(col).strip() for col in df.columns]

    # 1. Column Schema & Data Types
    schema_rows = ["| Column Name | Data Type | Non-Null Count | Null Count | Null % |",
                   "| --- | --- | --- | --- | --- |"]
    for col in df.columns:
        dtype = str(df[col].dtype)
        non_null = int(df[col].notnull().sum())
        null_cnt = int(df[col].isnull().sum())
        null_pct = (null_cnt / rows * 100) if rows > 0 else 0.0
        schema_rows.append(f"| `{col}` | `{dtype}` | {non_null:,} | {null_cnt:,} | {null_pct:.1f}% |")
    
    parts.append("### Column Schema & Data Types\n" + "\n".join(schema_rows))

    # 2. Sample Rows Preview (first 5 rows)
    try:
        sample_head = df.head(5).to_markdown(index=False)
        parts.append("### Sample Data Preview (First 5 Rows)\n" + sample_head)
    except Exception:
        # Fallback to to_string if to_markdown fails
        parts.append("### Sample Data Preview (First 5 Rows)\n```\n" + df.head(5).to_string(index=False) + "\n```")

    # 3. Descriptive Statistics for Numeric Columns
    num_cols = df.select_dtypes(include=["number"]).columns
    if len(num_cols) > 0:
        stat_rows = ["| Numeric Column | Min | Max | Mean | Median | Std Dev |",
                     "| --- | --- | --- | --- | --- | --- |"]
        for col in num_cols:
            s = df[col].dropna()
            if len(s) > 0:
                s_min = f"{s.min():.4g}" if isinstance(s.min(), (int, float)) else str(s.min())
                s_max = f"{s.max():.4g}" if isinstance(s.max(), (int, float)) else str(s.max())
                s_mean = f"{s.mean():.4g}"
                s_median = f"{s.median():.4g}"
                s_std = f"{s.std():.4g}" if len(s) > 1 else "0"
            else:
                s_min = s_max = s_mean = s_median = s_std = "N/A"
            stat_rows.append(f"| `{col}` | {s_min} | {s_max} | {s_mean} | {s_median} | {s_std} |")
        parts.append("### Summary Statistics (Numeric Columns)\n" + "\n".join(stat_rows))

    # 4. Categorical / Text Column Summary
    cat_cols = df.select_dtypes(include=["object", "category", "string"]).columns
    if len(cat_cols) > 0:
        cat_rows = ["| Categorical Column | Unique Values | Top Frequent Values (Count) |",
                    "| --- | --- | --- |"]
        for col in cat_cols:
            s = df[col].dropna()
            unique_cnt = s.nunique()
            top_val_str = "N/A"
            if unique_cnt > 0:
                top_counts = s.value_counts().head(3)
                top_val_str = ", ".join([f"`{val}` ({cnt:,})" for val, cnt in top_counts.items()])
            cat_rows.append(f"| `{col}` | {unique_cnt:,} | {top_val_str} |")
        parts.append("### Categorical Overview\n" + "\n".join(cat_rows))

    return parts

def _summarize_csv(file_bytes: bytes, filename: str) -> list[str]:
    """Reads CSV bytes and generates profiling summary."""
    try:
        text_data = file_bytes.decode("utf-8", errors="ignore")
        df = pd.read_csv(io.StringIO(text_data), sep=None, engine="python")
    except Exception as e:
        logger.warning(f"pd.read_csv failed for {filename}, attempting fallback read: {e}")
        text_data = file_bytes.decode("latin-1", errors="ignore")
        df = pd.read_csv(io.StringIO(text_data))

    return _summarize_dataframe(df, sheet_label=filename)

def _summarize_excel(file_bytes: bytes, filename: str) -> list[str]:
    """Reads Excel workbook bytes and generates profiling summary for all sheets."""
    parts = []
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheet_names = wb.sheetnames
    parts.append(f"**Total Sheets in Workbook:** {len(sheet_names)} (`{', '.join(sheet_names)}`)")

    # Read each sheet into DataFrame
    excel_file = pd.ExcelFile(io.BytesIO(file_bytes))
    for sheet_name in sheet_names:
        try:
            df = excel_file.parse(sheet_name)
            parts.extend(_summarize_dataframe(df, sheet_label=sheet_name))

            # Extract chart info from openpyxl sheet
            ws = wb[sheet_name]
            charts = getattr(ws, "_charts", [])
            if charts:
                chart_descriptions = []
                for idx, chart in enumerate(charts, 1):
                    title_text = "Untitled Chart"
                    if getattr(chart, "title", None):
                        try:
                            if hasattr(chart.title, "tx") and getattr(chart.title.tx, "rich", None):
                                title_parts = [r.t for p in chart.title.tx.rich.p for r in getattr(p, "r", [])]
                                title_text = " ".join(title_parts)
                            else:
                                title_text = str(chart.title)
                        except Exception:
                            pass
                    chart_descriptions.append(f"  - Chart #{idx}: Title = `{title_text}`")
                if chart_descriptions:
                    parts.append("### Embedded Charts Information\n" + "\n".join(chart_descriptions))

        except Exception as e:
            logger.warning(f"Error profiling Excel sheet '{sheet_name}' in {filename}: {e}")
            parts.append(f"## Sheet: `{sheet_name}`\n*Failed to parse sheet data: {e}*")

    wb.close()
    return parts

def _fallback_raw_preview(file_bytes: bytes, filename: str, error_msg: str) -> str:
    """Fallback when pandas/openpyxl profiling fails completely."""
    try:
        raw_text = file_bytes.decode("utf-8", errors="ignore")
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        preview = "\n".join(lines[:20])
        total_lines = len(lines)
    except Exception:
        preview = "[Binary file content - raw preview unavailable]"
        total_lines = 0

    return (
        f"### Tabular Parsing Fallback Notice\n"
        f"Automated profiling encountered an exception: `{error_msg}`.\n"
        f"**Estimated Lines:** ~{total_lines:,}\n"
        f"**Raw Text Preview (First 20 Lines):**\n```\n{preview}\n```"
    )
