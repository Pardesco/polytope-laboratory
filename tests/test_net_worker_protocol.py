"""Net jobs keep their isolated-job results when a Python process is reused."""
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys
from engine.generators import regular
from engine.server import dispatch


def test_repeated_net_jobs_and_refusal_do_not_change_results_or_source_attributes():
    cube = regular('cube'); tesseract = regular('tesseract')
    cube['metadata']['offColors'] = {'faces': [
        {'encoding':'byte','values':[255,0,0,128]} if i % 2 else
        {'encoding':'byte','values':[0,0,255,255]} for i in range(6)]}
    original = deepcopy(cube)
    net = dispatch({'op':'net','model':cube,'params':{'root':0,'edge_length_mm':25,'tabs':True}})
    cells = dispatch({'op':'cell-net','model':tesseract,'params':{'root':0}})
    requests = [
        {'op':'net','model':cube,'params':{'root':0,'edge_length_mm':25,'tabs':True}},
        {'op':'net-edit','model':cube,'params':{'net':net,'action':'toggle-edge','edge':net['hinges'][0]}},
        {'op':'net-pack','model':cube,'params':{'net':net,'paper':'a4','color_mode':'separate','paper_color':'all','print_fill':True}},
        {'op':'cell-net','model':tesseract,'params':{'root':0}},
        {'op':'cell-net-edit','model':tesseract,'params':{'net':cells,'action':'toggle-face','face':cells['connections'][0]}},
        {'op':'net-fold','model':cube,'params':{'net':net,'fraction':1}},
        {'op':'net','model':cube,'params':{'root':99999}},
        {'op':'net','model':cube,'params':{'root':0,'edge_length_mm':25,'tabs':True}},
    ]
    requests = [dict(deepcopy(request),id=str(i)) for i, request in enumerate(requests*2)]
    expected = []
    for request in requests:
        try:
            expected.append({'id':request['id'],'ok':True,'result':dispatch(deepcopy(request))})
        except Exception as error:
            expected.append({'id':request['id'],'ok':False,'error':str(error),'type':type(error).__name__})
    root = Path(__file__).resolve().parents[1]
    completed = subprocess.run([sys.executable,'-u',str(root/'engine/server.py')],
        input=''.join(json.dumps(request)+'\n' for request in requests),capture_output=True,text=True,encoding='utf-8',cwd=root,timeout=60,
        env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1'},
        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    assert completed.returncode == 0, completed.stderr
    assert [json.loads(line) for line in completed.stdout.splitlines()] == expected
    assert cube == original
