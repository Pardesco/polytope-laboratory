"""Fresh-process CPU/index timings without Electron. Optional baseline git ref."""

import argparse
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CODE = '''
import json,time,sys
t=time.perf_counter()
if len(sys.argv)>1:
    import subprocess
    source=subprocess.check_output(['git','-c','safe.directory=*','show',sys.argv[1]+':engine/server.py'],text=True,encoding='utf-8')
    t=time.perf_counter()
    namespace={'__package__':'engine','__name__':'startup_baseline'}
    exec(compile(source,'baseline-server.py','exec'),namespace)
    import_ms=(time.perf_counter()-t)*1000
    catalog_source=subprocess.check_output(['git','-c','safe.directory=*','show',sys.argv[1]+':engine/catalog.py'],text=True,encoding='utf-8')
    catalog_namespace={'__package__':'engine','__name__':'catalog_baseline','__file__':str(__import__('pathlib').Path('engine/catalog.py').resolve())}
    exec(compile(catalog_source,'baseline-catalog.py','exec'),catalog_namespace)
    read=catalog_namespace['get_catalog']
else:
    from engine.server import dispatch
    import_ms=(time.perf_counter()-t)*1000
    read=lambda:dispatch({'op':'catalog'})
t=time.perf_counter();catalog=read();first=(time.perf_counter()-t)*1000
t=time.perf_counter();again=read();warm=(time.perf_counter()-t)*1000
assert catalog==again
print(json.dumps({'importMs':import_ms,'catalogFirstMs':first,'catalogRepeatMs':warm,'entries':len(catalog)}))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', type=int, default=5)
    parser.add_argument('--baseline-ref')
    args = parser.parse_args()
    if not 1 <= args.samples <= 20:
        parser.error('Use 1..20 samples.')
    groups = {'baseline': []} if args.baseline_ref else {}
    groups.update({'cold index': [], 'cached index': []})
    with tempfile.TemporaryDirectory(prefix='polytope-startup-') as folder:
        for sample in range(args.samples):
            env = {
                **os.environ,
                'OPENBLAS_NUM_THREADS': '1',
                'OMP_NUM_THREADS': '1',
                'POLYTOPE_CATALOG_CACHE': str(Path(folder) / f'{sample}.json'),
            }
            for group, rows in groups.items():
                command = [sys.executable, '-c', CODE] + ([args.baseline_ref] if group == 'baseline' else [])
                output = subprocess.run(
                    command, cwd=ROOT, env=env, text=True, encoding='utf-8', capture_output=True, check=True
                )
                rows.append(json.loads(output.stdout))
    print(
        json.dumps(
            {
                'samples': groups,
                'medianMs': {
                    group: {
                        key: round(statistics.median(row[key] for row in rows), 2)
                        for key in ('importMs', 'catalogFirstMs', 'catalogRepeatMs')
                    }
                    for group, rows in groups.items()
                },
            },
            indent=2,
        )
    )


if __name__ == '__main__':
    main()
