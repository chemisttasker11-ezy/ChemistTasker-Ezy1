"""Explicit disposable Redis pressure/restart gate. Requires Docker and redis-py.

Run: python scripts/test_redis_isolation.py --run-disposable
Never connects to an existing Redis service or consumes an application queue.
"""
import argparse
import json
import subprocess
import time
from uuid import uuid4

import redis

def docker(*args):
    result=subprocess.run(['docker',*args],capture_output=True,text=True,timeout=90)
    if result.returncode:raise RuntimeError(f'Docker command failed: {result.stderr[-800:]}')
    return result.stdout.strip()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-disposable',action='store_true',required=True)
    args=parser.parse_args()
    prefix='ct-readiness-redis-'+uuid4().hex[:10]
    volume=prefix+'-data'
    names=[]
    docker('volume','create',volume)
    def start(role,policy,memory,persist=False):
        name=prefix+'-'+role
        options=['run','-d','--name',name,'--memory','128m','--cpus','0.5','--pids-limit','64',
                 '--publish','127.0.0.1::6379']
        if persist:options+=['--mount',f'type=volume,source={volume},target=/data']
        options+=['redis:8.8.2-alpine','redis-server','--save','','--appendonly','yes' if persist else 'no',
                  '--appendfsync','always','--maxmemory',memory,'--maxmemory-policy',policy]
        docker(*options);names.append(name)
        info=json.loads(docker('inspect',name))[0]
        port=int(info['NetworkSettings']['Ports']['6379/tcp'][0]['HostPort'])
        client=redis.Redis(host='127.0.0.1',port=port,socket_timeout=3,socket_connect_timeout=3)
        for _ in range(40):
            try:
                if client.ping():return name,client,port
            except redis.RedisError:time.sleep(.1)
        raise RuntimeError('Disposable Redis did not become ready')
    try:
        protected_name,protected,port=start('state','noeviction','6mb',True)
        _,cache,_=start('cache','allkeys-lru','4mb')
        state={db:redis.Redis(host='127.0.0.1',port=port,db=db,socket_timeout=3) for db in (1,2,4)}
        state[1].set('ahpra:attempts',3)
        state[4].set('security:attempts',4)
        state[2].rpush('disposable-noop-queue','{"task":"noop","id":"test-only"}')
        rejected=0
        payload=b'x'*16384
        for index in range(800):
            try:protected.set(f'pressure:{index}',payload)
            except redis.exceptions.ResponseError as error:
                assert 'memory' in str(error).lower(),type(error).__name__
                rejected+=1
                break
        assert rejected>0,'Protected writes should fail explicitly under pressure'
        for index in range(800):cache.set(f'reconstructible:{index}',payload)
        assert cache.info('stats')['evicted_keys']>0,'Cache pressure must exercise eviction'
        def verify_state():
            assert protected.info('stats')['evicted_keys']==0
            assert state[1].get('ahpra:attempts')==b'3'
            assert state[4].get('security:attempts')==b'4'
            assert state[2].lrange('disposable-noop-queue',0,-1)==[b'{"task":"noop","id":"test-only"}']
        verify_state()
        cache_evictions=cache.info('stats')['evicted_keys']
        docker('restart','--time','20',protected_name)
        # Docker may reassign an automatically published host port on restart.
        info=json.loads(docker('inspect',protected_name))[0]
        port=int(info['NetworkSettings']['Ports']['6379/tcp'][0]['HostPort'])
        protected=redis.Redis(host='127.0.0.1',port=port,socket_timeout=3)
        state={db:redis.Redis(host='127.0.0.1',port=port,db=db,socket_timeout=3) for db in (1,2,4)}
        for _ in range(40):
            try:
                if protected.ping():break
            except redis.RedisError:time.sleep(.1)
        verify_state()
        result={'protected_evictions':0,'cache_evictions':cache_evictions,'protected_write_rejected':True,
                'queue_security_ahpra_survived_restart':True,
                'limits':'Redis persistence only; not a Celery execution/exactly-once proof or production sizing test.'}
        print(json.dumps(result,indent=2))
    finally:
        for name in reversed(names):
            assert name.startswith(prefix+'-')
            subprocess.run(['docker','rm','-f',name],capture_output=True,timeout=30)
        assert volume==prefix+'-data'
        subprocess.run(['docker','volume','rm',volume],capture_output=True,timeout=30)

if __name__=='__main__':main()
