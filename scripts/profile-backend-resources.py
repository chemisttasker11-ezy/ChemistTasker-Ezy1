"""Bounded synthetic PDF/OCR resource probe; use only inside a capped test container."""
import argparse
import json
from multiprocessing import Process, Queue
from pathlib import Path
import resource
import tempfile
import time
from types import SimpleNamespace
from unittest.mock import patch


def workload(queue, repeats):
    import django
    django.setup()
    import fitz
    from django.test import override_settings
    from core.test_pdf_rendering_contract import PdfRenderingRuntimeContracts
    from onboarding.verification.documents import azure_ocr, pdf_first_page_to_png

    start=time.monotonic()
    case=PdfRenderingRuntimeContracts()
    for _ in range(repeats):
        case.test_worker_finance_document_renders_with_supported_weasyprint()
        case.test_legacy_invoice_renders_with_supported_weasyprint()
        with tempfile.TemporaryDirectory(prefix='ct-resource-probe-') as directory:
            path=Path(directory)/'synthetic.pdf'
            with fitz.open() as document:
                page=document.new_page(width=900,height=1200)
                page.insert_text((50,50),'Synthetic document: no personal data')
                document.save(path)
            png=Path(pdf_first_page_to_png(str(path)))
            try:
                response=SimpleNamespace(read=SimpleNamespace(blocks=[SimpleNamespace(
                    lines=[SimpleNamespace(text='Synthetic OCR line') for _ in range(2000)])]))
                with override_settings(AZURE_OCR_ENDPOINT='https://example.invalid',AZURE_OCR_KEY='disposable'), \
                     patch('azure.ai.vision.imageanalysis.ImageAnalysisClient') as client:
                    client.return_value.analyze.return_value=response
                    assert len(azure_ocr(str(png))['lines'])==2000
                    assert client.return_value.analyze.call_count==1
            finally:
                png.unlink(missing_ok=True)
    queue.put({'max_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
               'seconds':round(time.monotonic()-start,2),'repeats':repeats})


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run-disposable-workload',action='store_true',required=True)
    p.add_argument('--workers',type=int,default=2)
    p.add_argument('--repeats',type=int,default=3)
    args=p.parse_args()
    if not 1<=args.workers<=2 or not 1<=args.repeats<=10:p.error('Bounded to 1..2 workers and 1..10 repeats')
    group=Path('/sys/fs/cgroup')
    maximum=group/'memory.max'
    if not maximum.exists() or maximum.read_text().strip()=='max':
        p.error('A finite cgroup memory limit is required')
    limit=int(maximum.read_text())
    if limit>2*1024**3:p.error('Use a disposable container capped at 2 GiB or less')
    queue=Queue()
    children=[Process(target=workload,args=(queue,args.repeats)) for _ in range(args.workers)]
    try:
        for child in children:child.start()
        for child in children:
            child.join(timeout=120)
            if child.exitcode!=0:raise RuntimeError(f'Workload failed or timed out (exit={child.exitcode})')
        results=[queue.get(timeout=5) for _ in children]
        peak=int((group/'memory.peak').read_text())
        events=dict(line.split() for line in (group/'memory.events').read_text().splitlines())
        assert int(events.get('oom_kill',0))==0,events
        print(json.dumps({'workers':results,'cgroup_peak_bytes':peak,'limit_bytes':limit,
                          'headroom_fraction':round(1-peak/limit,3),'oom_kills':0,
                          'cpu_max':(group/'cpu.max').read_text().strip(),
                          'pids_max':(group/'pids.max').read_text().strip(),
                          'scope':'Synthetic invoices + first-page PDF conversion + captured OCR response; no live provider, DB or queue. Not a production-load acceptance test.'},indent=2))
    finally:
        for child in children:
            if child.is_alive():child.terminate();child.join(timeout=5)


if __name__=='__main__':main()
