"""Compare unchanged-model analysis with the original protected analyzer.

This isolates repeat native computation when revisiting existing documents. It
does not measure first model generation, IPC, renderer work or desktop latency.
"""
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
# Use a documented, reproducible native scheduling configuration, as in the
# existing section profiler. It is not a claim about desktop-process settings.
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['OMP_NUM_THREADS']='1'
from engine.analysis_cache import AnalysisCache
from engine.generators import regular
from engine.geometry import analyze


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summary(samples):
    quartiles=statistics.quantiles(samples,n=4,method='inclusive')
    return dict(samplesMs=samples,medianMs=statistics.median(samples),iqrMs=quartiles[2]-quartiles[0])


def main():
    folder=Path(tempfile.mkdtemp(prefix='native-analysis-profile-',dir=ROOT/'artifacts'))
    frozen=json.loads((ROOT/'artifacts/preview-build-source-0.27.20.json').read_text(encoding='utf-8'))
    geometry_hash=sha(ROOT/'engine/geometry.py')
    assert geometry_hash==frozen['sourceHashes']['engine/geometry.py']
    rows=[]
    for key in ('cell120','cell600','miratope-grand-hexacosichoron'):
        model=json.loads(json.dumps(regular(key)));before=deepcopy(model)
        cache=AnalysisCache();started=time.perf_counter();expected=analyze(model)
        cold_baseline=(time.perf_counter()-started)*1000
        started=time.perf_counter();first=cache.resolve(model,analyze)
        cold_candidate=(time.perf_counter()-started)*1000
        assert first==expected and len(cache.entries)==1
        functions=[lambda:analyze(model),lambda:cache.resolve(model,analyze)];samples=[[],[]]
        for repeat in range(7):
            for index in ([0,1] if repeat%2==0 else [1,0]):
                started=time.perf_counter();result=functions[index]()
                samples[index].append((time.perf_counter()-started)*1000)
                assert result==expected
        assert model==before
        rows.append(dict(key=key,model=model['name'],counts={k:len(model[k]) for k in ('vertices','edges','faces','cells')},
                         literalSourceSha256=hashlib.sha256(json.dumps(model,sort_keys=True,allow_nan=False).encode()).hexdigest(),
                         coldBaselineMs=cold_baseline,coldCandidateMs=cold_candidate,baseline=summary(samples[0]),candidate=summary(samples[1]),
                         allResultsEqual=True,sourceUnchanged=True,retainedSerializedBytes=cache.bytes))
    inputs=['engine/geometry.py','engine/analysis_cache.py','engine/section_validation.py','engine/server.py','scripts/profile-native-analysis.py']
    result=dict(passed=True,version=json.loads((ROOT/'package.json').read_text())['version'],baselineVersion='0.27.20',
                protectedAnalyzerMatchesSealedBaseline=True,passes=7,rows=rows,sourceHashes={name:sha(ROOT/name) for name in inputs},
                hardware=dict(platform=platform.platform(),python=sys.version,openblasThreads=os.environ['OPENBLAS_NUM_THREADS'],ompThreads=os.environ['OMP_NUM_THREADS']),
                scope='Seven alternating-order passes of repeat analysis on an unchanged native JSON source. Cold setup recorded separately once. No first-generation, IPC, renderer, GPU, FPS or desktop latency claim.')
    (folder/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(folder=str(folder),**result),indent=2))


if __name__=='__main__':
    main()
