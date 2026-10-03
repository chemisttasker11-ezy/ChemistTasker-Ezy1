"""Uploaded-document access and OCR for document verification (Azure Image Analysis)."""
import logging
import os
import shutil
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)


def get_local_file_or_download(filefield):
    if not filefield:
        logger.info("[get_local_file_or_download] filefield is empty.")
        return None
    try:
        if hasattr(filefield, "path") and os.path.exists(filefield.path):
            logger.info(f"[get_local_file_or_download] Using local path: {filefield.path}")
            return filefield.path
    except Exception as e:
        logger.info(f"[get_local_file_or_download] Could not access .path: {e}")
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=Path(filefield.name).suffix)
    with default_storage.open(filefield.name, "rb") as remote_file:
        shutil.copyfileobj(remote_file, temp_file)
    temp_file.close()
    logger.info(f"[get_local_file_or_download] Downloaded to temp: {temp_file.name}")
    return temp_file.name


def pdf_first_page_to_png(pdf_path):
    """
    Convert the first PDF page to a temporary PNG so Azure Image Analysis can OCR it.
    Works after get_local_file_or_download(), so the source can be local media or Azure Blob.
    """
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    try:
        if doc.page_count < 1:
            raise Exception("PDF has no pages.")
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        temp_file.close()
        pix.save(temp_file.name)
        logger.info(f"[pdf_first_page_to_png] Converted first PDF page to: {temp_file.name}")
        return temp_file.name
    finally:
        doc.close()


def is_pdf_file(local_path):
    try:
        with open(local_path, "rb") as f:
            header = f.read(5)
        if header == b"%PDF-":
            return True
    except Exception as e:
        logger.info(f"[is_pdf_file] Could not inspect file header for {local_path}: {e}")
    return str(local_path).lower().endswith(".pdf")


def ocr_input_path_for_file(local_path):
    if is_pdf_file(local_path):
        logger.info(f"[ocr_input_path_for_file] PDF detected, converting before OCR: {local_path}")
        converted_path = pdf_first_page_to_png(local_path)
        return converted_path, converted_path
    logger.info(f"[ocr_input_path_for_file] Image input detected, sending directly to OCR: {local_path}")
    return local_path, None


def azure_ocr(file_path):
    """Run OCR using Azure Vision, returns lines of text."""
    from azure.ai.vision.imageanalysis import ImageAnalysisClient
    from azure.ai.vision.imageanalysis.models import VisualFeatures
    from azure.core.credentials import AzureKeyCredential
    endpoint = settings.AZURE_OCR_ENDPOINT
    key = settings.AZURE_OCR_KEY
    if not endpoint or not key:
        raise Exception("Missing AZURE_OCR_ENDPOINT or AZURE_OCR_KEY in env")
    client = ImageAnalysisClient(
        endpoint=endpoint,
        credential=AzureKeyCredential(key)
    )
    with open(file_path, "rb") as image_stream:
        result = client.analyze(
            image_data=image_stream,
            visual_features=[VisualFeatures.READ]
        )
    lines = []
    if result.read and result.read.blocks:
        for block in result.read.blocks:
            for line in block.lines:
                lines.append(line.text)
    logger.info(f"[azure_ocr] OCR done for {file_path}, found {len(lines)} lines.")
    return {"lines": lines}
