import re
from typing import List

# Pre-compiled regex for performance
KV_PATTERN = re.compile(
    r"([A-Za-z0-9\s\-_]+)\s*[:\-–]\s*([A-Za-z0-9,./@#()$%&\s'\"+\\\[\]\{\}:;<>?!=]*)"
)

def chunk_text(text: str, words_per_chunk: int = 300) -> List[str]:
    """
    Split a long text into chunks of `words_per_chunk` words.
    Args:
        text (str): Input text to split.
        words_per_chunk (int): Number of words per chunk (default 300).
    Returns:
        List[str]: List of text chunks.
    """
    words = text.split()
    if not words:
        return []
    if len(words) <= words_per_chunk:
        return [" ".join(words)]
    return [" ".join(words[i:i + words_per_chunk]) for i in range(0, len(words), words_per_chunk)]

def extract_key_values(lines: List[str]) -> List[str]:
    """
    Extract key-value pairs from a list of text lines using regex.
    Args:
        lines (List[str]): List of lines from the document.
    Returns:
        List[str]: List of formatted key-value pairs like 'Key: Value'.
    """
    key_value_pairs = []
    for line in lines:
        for match in KV_PATTERN.findall(line):
            key, value = match
            key, value = key.strip().title(), value.strip()
            if len(key) > 1 and len(value) > 1:
                key_value_pairs.append(f"{key}: {value}")
    return key_value_pairs
