"""One rendering path for preview/download/email; no remote assets or HTML input."""
from django.template.loader import render_to_string
from .services import serialize_record


def render_document_pdf(document):
    from weasyprint import HTML

    def deny_external_resources(url, *args, **kwargs):
        raise ValueError('External resources are not allowed in finance documents.')

    html = render_to_string('worker_finance/invoice.html', {'document': document})
    return HTML(string=html, url_fetcher=deny_external_resources).write_pdf()


def render_pdf(record):
    return render_document_pdf(serialize_record(record))
