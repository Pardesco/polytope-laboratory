"""Run all current native tests with a before/after source and scope manifest."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import platform
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]


def snapshot():
    paths = sorted(set((ROOT/'engine').rglob('*.py')) |
                   set((ROOT/'engine/catalog_data').rglob('*')) |
                   set((ROOT/'tests').glob('test_*.py')) |
                   {ROOT/'development/spring_relaxation.py',ROOT/'development/test_spring_relaxation.py'})
    return {str(p.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in paths if p.is_file() and '__pycache__' not in p.parts}


def main():
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    # Leave CPU scheduling preference to the user's foreground game.
    priority = None
    if os.name == 'nt':
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.GetCurrentProcess.restype = ctypes.c_void_p
        kernel.SetPriorityClass.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        kernel.SetPriorityClass.restype = ctypes.c_int
        priority = bool(kernel.SetPriorityClass(kernel.GetCurrentProcess(), 0x4000))
        if not priority:
            raise ctypes.WinError(ctypes.get_last_error())
    os.environ['OPENBLAS_NUM_THREADS'] = '1'
    os.environ['OMP_NUM_THREADS'] = '1'
    import pytest
    import numpy
    import scipy

    before = snapshot()
    result = {'version': json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version'],
              'scope': 'All current tests/test_*.py and native engine/catalog source and frozen spring reference inputs; development qualification only',
              'startedUtc': datetime.now(timezone.utc).isoformat(), 'passed': False,
              'belowNormalPriority': priority, 'python': platform.python_version(),
              'numpy': numpy.__version__, 'scipy': scipy.__version__,
              'testFiles': [p for p in before if p.startswith('tests/')], 'sourceHashes': before,
              'qualificationScriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

    class Evidence:
        def pytest_sessionfinish(self, session, exitstatus):
            reporter = session.config.pluginmanager.getplugin('terminalreporter')
            result['collected'] = session.testscollected
            result['counts'] = {kind: len(reporter.stats.get(kind, [])) for kind in ['passed', 'failed', 'error', 'skipped', 'xfailed', 'xpassed']}

    code = pytest.main(result['testFiles']+['-q'], plugins=[Evidence()])
    after = snapshot()
    result['changedPaths'] = sorted(p for p in before.keys() | after.keys() if before.get(p) != after.get(p))
    result.update(exitCode=int(code), sourceUnchanged=before==after,
                  finishedUtc=datetime.now(timezone.utc).isoformat())
    result['passed'] = code == 0 and result['sourceUnchanged']
    destination = ROOT/'artifacts'/f"native-development-{result['version']}.json"
    destination.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print('Native source-qualified evidence:', destination)
    return 0 if result['passed'] else int(code) or 1


if __name__ == '__main__':
    raise SystemExit(main())
