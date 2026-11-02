"""Read-only Docker/host sampler; does not emit env/log content or change services."""
import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time

NAMES = ('chemisttasker_staging_migrate', 'chemisttasker_backend_staging', 'chemisttasker_celery_staging',
         'chemisttasker_celery_beat_staging', 'chemisttasker_public_staging',
         'chemisttasker_frontend_staging', 'chemisttasker_gateway_staging',
         'chemisttasker_postgres_staging', 'chemisttasker_redis_staging',
         'chemisttasker_redis_cache_staging')

def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise RuntimeError(f'{args[0]} {args[1]} failed (exit {result.returncode}); inspect privately')
    return result.stdout

def memory_bytes(value):
    number, unit = re.fullmatch(r'([0-9.]+)\s*([A-Za-z]+)', value.strip()).groups()
    powers = {'B':1, 'kB':1000, 'KB':1000, 'MB':1000**2, 'GB':1000**3,
              'KiB':1024, 'MiB':1024**2, 'GiB':1024**3, 'TiB':1024**4}
    return round(float(number) * powers[unit])

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--samples',type=int,default=12)
    p.add_argument('--interval',type=float,default=2)
    p.add_argument('--label',default='idle')
    args=p.parse_args()
    if not 2 <= args.samples <= 60 or not 1 <= args.interval <= 10:
        p.error('Use 2..60 samples, 1..10 seconds apart')
    running=set(command(['docker','ps','--format','{{.Names}}']).splitlines())
    names=[n for n in NAMES if n in running]
    if not names:raise RuntimeError('No known staging containers running')
    report={'captured_at':datetime.now(timezone.utc).isoformat(),'label':args.label,
            'cpu_count':os.cpu_count(),'host_meminfo':{},'containers':{},'samples':args.samples}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':',1)
        if key in {'MemTotal','MemAvailable','SwapTotal','SwapFree'}:
            report['host_meminfo'][key]=int(value.split()[0])*1024
    def identities():
        rows=json.loads(command(['docker','inspect',*names]))
        return {row['Name'].lstrip('/'):{'id':row['Id'],'image':row['Image'],
                'restarts':row['RestartCount'],'oom_killed':row['State']['OOMKilled'],
                'memory_limit':row['HostConfig']['Memory'],'nano_cpus':row['HostConfig']['NanoCpus'],
                'pids_limit':row['HostConfig'].get('PidsLimit'),'logging':row['HostConfig']['LogConfig']}
                for row in rows}
    report['before']=identities()
    samples={name:[] for name in names}
    for index in range(args.samples):
        rows=command(['docker','stats','--no-stream','--format','{{json .}}',*names])
        for line in rows.splitlines():
            row=json.loads(line)
            samples[row['Name']].append({'memory_bytes':memory_bytes(row['MemUsage'].split('/')[0]),
                'cpu_percent':float(row['CPUPerc'].rstrip('%')),'pids':int(row['PIDs'])})
        if index<args.samples-1:time.sleep(args.interval)
    report['after']=identities()
    report['identities_unchanged']=report['before']==report['after']
    for name, values in samples.items():
        if len(values)!=args.samples:raise RuntimeError('Incomplete stats sample')
        ordered=sorted(v['memory_bytes'] for v in values)
        report['containers'][name]={'peak_memory_bytes':max(ordered),
            'p95_memory_bytes':ordered[math.ceil(.95*len(ordered))-1],
            'peak_cpu_percent':max(v['cpu_percent'] for v in values),
            'peak_pids':max(v['pids'] for v in values)}
    report['limits']='Observed workload only; idle sampling is insufficient for sizing PDF/OCR, concurrency, database or build peaks. No limits applied.'
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
