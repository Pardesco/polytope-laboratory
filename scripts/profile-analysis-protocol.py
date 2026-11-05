"""Measure sequential JSON-lines round trips against the sealed old server.

Both Python workers stay warm, but only one request runs at a time. This is the
actual native protocol, not Electron IPC or end-to-end desktop navigation.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['OMP_NUM_THREADS']='1'
from engine.generators import regular


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summary(values):
    q=statistics.quantiles(values,n=4,method='inclusive')
    return dict(samplesMs=values,medianMs=statistics.median(values),iqrMs=q[2]-q[0])


class Worker:
    def __init__(self, command, stderr):
        self.stderr=stderr.open('w',encoding='utf-8')
        self.proc=subprocess.Popen(command,cwd=ROOT,env=os.environ.copy(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                                   stderr=self.stderr,text=True,encoding='utf-8',bufsize=1,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        self.reader=ThreadPoolExecutor(max_workers=1)
        self.serial=0

    def request(self, model):
        self.serial+=1
        payload=json.dumps(dict(id=str(self.serial),op='analyze',params={},model=model),ensure_ascii=False,allow_nan=False,separators=(',', ':'))+'\n'
        started=time.perf_counter()
        self.proc.stdin.write(payload);self.proc.stdin.flush()
        pending=self.reader.submit(self.proc.stdout.readline,128*1024**2+1)
        try:line=pending.result(timeout=30)
        except Exception:
            self.proc.kill();raise
        assert line and len(line)<=128*1024**2,'Native worker returned no bounded response'
        reply=json.loads(line)
        assert reply['id']==str(self.serial) and reply['ok'] is True,reply
        return reply['result'],(time.perf_counter()-started)*1000

    def close(self):
        if self.proc.poll() is None:
            self.proc.stdin.close()
            try:self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:self.proc.kill();self.proc.wait()
        self.reader.shutdown(wait=True);self.proc.stdout.close();self.stderr.close()


def main():
    baseline=Path(sys.argv[1]).resolve()
    frozen=json.loads((ROOT/'artifacts/preview-build-source-0.27.20.json').read_text(encoding='utf-8'))
    assert sha(baseline)==frozen['sourceHashes']['engine/server.py']
    for name in ('engine/geometry.py','engine/measurements.py','engine/generators.py'):
        assert sha(ROOT/name)==frozen['sourceHashes'][name],name
    folder=Path(tempfile.mkdtemp(prefix='analysis-protocol-profile-',dir=ROOT/'artifacts'))
    workers=[];rows=[]
    try:
        workers.append(Worker([sys.executable,'-B',str(baseline)],folder/'baseline.stderr.log'))
        workers.append(Worker([sys.executable,'-B','-m','engine.server'],folder/'candidate.stderr.log'))
        for key in ('cell120','cell600','miratope-grand-hexacosichoron'):
            model=json.loads(json.dumps(regular(key)))
            expected,cold_baseline=workers[0].request(model)
            first,cold_candidate=workers[1].request(model);assert first==expected
            samples=[[],[]]
            for repeat in range(7):
                for index in ([0,1] if repeat%2==0 else [1,0]):
                    reply,elapsed=workers[index].request(model);assert reply==expected
                    samples[index].append(elapsed)
            rows.append(dict(key=key,coldBaselineMs=cold_baseline,coldCandidateMs=cold_candidate,
                             baseline=summary(samples[0]),candidate=summary(samples[1]),allDecodedReportsEqual=True))
    finally:
        for worker in workers:worker.close()
    assert all(worker.proc.returncode==0 for worker in workers)
    inputs=[baseline,ROOT/'engine/server.py',ROOT/'engine/analysis_cache.py',ROOT/'engine/section_validation.py',ROOT/'engine/geometry.py',ROOT/'engine/measurements.py',Path(__file__).resolve()]
    result=dict(passed=True,version=json.loads((ROOT/'package.json').read_text())['version'],baselineVersion='0.27.20',
                passes=7,rows=rows,sourceHashes={str(path.relative_to(ROOT)):sha(path) for path in inputs},
                hardware=dict(platform=platform.platform(),python=sys.version,openblasThreads='1',ompThreads='1'),
                scope='Seven alternating-order repeat-analysis JSON-lines round trips. Request encoding excluded; pipe/native computation/response encoding/decoding included. Cold/startup samples recorded separately once. No Electron IPC, UI, GPU, FPS or independent model-load claim.')
    (folder/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(folder=str(folder),**result),indent=2))


if __name__=='__main__':
    main()
