"""Review and mount only manifest-qualified element-content changes.

Three-way merges use the preserved release baseline and retain production
diagram, morph, animation guards and signed-normal changes. Protected importers
are checked but never written. --review prepares files without mounting them.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'development/element-content-continuation-0.22'
BASE = ROOT / 'artifacts/frozen-0.21.0-release-qualified-source/source'
REVIEW = ROOT / 'artifacts/element-content-reviewed-merge-0.22'
CONFLICT = re.compile(r'^<<<<<<< current\n(.*?)^\|\|\|\|\|\|\| baseline\n(.*?)^=======\n(.*?)^>>>>>>> proposal\n', re.M | re.S)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resolve(name, index, current, proposal):
    if name == 'ui/app.js':
        if index == 0:
            return current + proposal
        if index == 1:
            assert 'facetingDiagram?.sync();}' in current
            return current.replace('facetingDiagram?.sync();}', 'facetingDiagram?.sync();elementContent?.sync();}')
        if index == 2:
            assert 'segmentotopeAnalysis?.sync();},showSection:' in current
            return current.replace('segmentotopeAnalysis?.sync();},showSection:', 'segmentotopeAnalysis?.sync();elementContent?.sync();},showSection:')
        if index == 3:
            return current + '  elementContent.invalidate();\n'
        if index == 4:
            return current.replace('facetingDiagram.sync();compoundControls.sync();', 'facetingDiagram.sync();elementContent.sync();compoundControls.sync();')
        if index == 5:
            return current.replace('dualMorph?.cancel();workspaceNumeric.cancel();', 'dualMorph?.cancel();elementContent.invalidate();netEditor.sequence++;workspaceNumeric.cancel();')
    if name == 'ui/viewer.js':
        if index == 0:
            assert 'async setElementContent' in proposal
            return proposal.replace('this.model=null;this.projected=null;', 'this.model=null;this.morphSource=null;this.morphFrame=null;this.morphSelectedSourceIds=null;this.projected=null;').replace('  setModel(model){', '  setModel(model,{normalization=null,morphSource=null,morphFrame=null}={}){')
        if index == 1:
            assert 'contentRecipe:' in proposal
            return proposal.replace('this.publishedPickState={view:', 'this.publishedPickState={morphFrame:this.morphFrame,view:')
    if name == 'desktop/main.cjs' and index == 0:
        return current + "allowed.add('element-content-describe');\n"
    raise RuntimeError(f'Unreviewed conflict: {name} #{index}')


def main():
    assert sys.argv[1:] in (['--review'], ['--mount'])
    manifest = json.loads((STAGE / 'TRANSPLANT_MANIFEST.json').read_text(encoding='utf-8'))
    for row in manifest['protectedImporters']:
        assert sha(ROOT / row['file']) == row['sha256']
        assert sha(STAGE / row['file']) == row['sha256']
    normals = ['ui/stereographic-normals.mjs', 'ui/stereographic-dense-refiner.mjs', 'ui/stereographic-conforming-surface.mjs', 'ui/viewer-stereographic.mjs']
    normal_hashes = {name: sha(ROOT / name) for name in normals}
    changes, before, resolutions = {}, {}, {}
    REVIEW.mkdir(exist_ok=True)
    for row in manifest['existingFilePatches']:
        name = row['file']
        assert sha(STAGE / name) == row['stagingSHA256'], name
        baseline = BASE / name
        if not baseline.exists():
            baseline = ROOT / name
        assert sha(baseline) == row['baselineSHA256'], name
        target = REVIEW / name
        target.parent.mkdir(parents=True, exist_ok=True)
        paths = []
        for label, source in [('current', ROOT / name), ('baseline', baseline), ('proposal', STAGE / name)]:
            path = target.with_name(target.name + '.' + label)
            path.write_bytes(source.read_bytes().replace(b'\r\n', b'\n'))
            paths.append(str(path))
        result = subprocess.run(['git', 'merge-file', '-p', '--diff3', '-L', 'current', '-L', 'baseline', '-L', 'proposal', *paths], capture_output=True)
        assert result.returncode >= 0, result.stderr
        merged = result.stdout.decode('utf-8')
        count = 0
        def choose(match):
            nonlocal count
            output = resolve(name, count, match[1], match[3])
            count += 1
            return output
        merged = CONFLICT.sub(choose, merged)
        assert count == result.returncode, (name, count, result.returncode)
        assert not re.search(r'^(<<<<<<<|=======|>>>>>>>)', merged, re.M), name
        resolutions[name] = count
        changes[name] = merged.encode('utf-8')
        before[name] = sha(ROOT / name)
        target.write_bytes(changes[name])
    for row in manifest['newFiles'] + manifest['newTests'] + manifest['fixtureMounts']:
        name = row['target']
        assert not (ROOT / name).exists(), name
        assert sha(STAGE / row['source']) == row['sha256'], row['source']
        data = (STAGE / row['source']).read_bytes()
        for old, new in row.get('rewrites', {}).items():
            data = data.replace(old.encode(), new.encode())
        changes[name] = data
        target = REVIEW / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    proof = {'manifestSHA256': sha(STAGE / 'TRANSPLANT_MANIFEST.json'), 'reviewedConflicts': resolutions, 'beforeHashes': before, 'normalHashes': normal_hashes, 'reviewedHashes': {name: hashlib.sha256(data).hexdigest() for name, data in changes.items()}, 'mounted': False}
    if sys.argv[1] == '--mount':
        backup = ROOT / 'artifacts/element-content-before-mount-0.22'
        backup.mkdir(exist_ok=False)
        for name, expected in before.items():
            assert sha(ROOT / name) == expected, name
            target = backup / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / name).read_bytes())
        for name, data in changes.items():
            target = ROOT / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        assert {name: sha(ROOT / name) for name in normals} == normal_hashes
        proof['mounted'] = True
        destination = ROOT / 'artifacts/element-content-mounted-0.22.json'
        assert not destination.exists()
    else:
        destination = REVIEW / 'review.json'
    destination.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'mounted': proof['mounted'], 'files': len(changes), 'reviewedConflicts': sum(resolutions.values()), 'proof': str(destination)}))


if __name__ == '__main__':
    main()
