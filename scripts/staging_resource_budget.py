"""Validate resolved operator Compose JSON without logging its environment values."""
import json
import math
import re
import sys


def redis_maxmemory(service):
    args=service['command']
    value=args[args.index('--maxmemory')+1]
    match=re.fullmatch(r'(\d+)([kmgt]b?)?',value,re.I)
    if not match:raise ValueError('Redis maxmemory must be finite and explicit')
    suffix=(match[2] or '').lower().rstrip('b')
    return int(match[1])*1024**('kmgt'.index(suffix)+1 if suffix else 0)


def validate_budget(services):
    required={'postgres','redis','redis_cache','web','migration','celery_worker','celery_beat','frontend','landing','gateway'}
    if not required<=services.keys():raise ValueError('Resolve both workers and release profiles before validating budgets')
    memory=0
    cpu=0
    for name,service in services.items():
        try:
            size=int(service['mem_limit'])
            cores=float(service['cpus'])
            pids=int(service['pids_limit'])
        except (KeyError,ValueError,TypeError):
            raise ValueError(f'{name}: finite memory/CPU/PID values are required') from None
        if size<=0 or not math.isfinite(cores) or cores<=0 or not 0<pids<=256:
            raise ValueError(f'{name}: invalid memory/CPU/PID budget')
        logging=service.get('logging',{})
        options=logging.get('options',{})
        maximum=re.fullmatch(r'([1-9]|10)m',str(options.get('max-size','')))
        try:
            files=int(options.get('max-file',0))
        except (ValueError,TypeError):
            raise ValueError(f'{name}: invalid bounded-log file count') from None
        if logging.get('driver')!='json-file' or not maximum or not 1<=files<=5:
            raise ValueError(f'{name}: bounded json-file logs are required')
        memory+=size
        cpu+=cores
    if memory>8*1024**3 or cpu>6:
        raise ValueError('Staging aggregate exceeds reviewed 8GiB / 6CPU envelope')
    if int(services['redis']['mem_limit'])<3*redis_maxmemory(services['redis']):
        raise ValueError('Protected Redis lacks reviewed AOF/rewrite memory margin')
    if int(services['redis_cache']['mem_limit'])<1.5*redis_maxmemory(services['redis_cache']):
        raise ValueError('Disposable Redis lacks process memory margin')
    return {'memory_bytes':memory,'cpus':round(cpu,3),'owners':len(services)}


if __name__=='__main__':
    try:
        totals=validate_budget(json.load(sys.stdin)['services'])
    except (ValueError,KeyError,TypeError) as error:
        print(f'Resource budget refused: {error}',file=sys.stderr)
        raise SystemExit(1)
    print('Resolved staging resource budget validated: '+json.dumps(totals))
