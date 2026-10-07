# SPDX-License-Identifier: GPL-3.0-only
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
"""Small meaningful source/ownership/mirror checks; no exhaustive suite."""
from copy import deepcopy
from engine.specialized_catalog import specialized_catalog,load_specialized_model,noble_disphenoid,surface_topology,torus_sweep
from engine.compounds import extract_component,remove_component
from engine.geometry import validate


def main():
    records=specialized_catalog();assert len({r['key'] for r in records})==len(records)
    for key,components in [('antiprism-uc4',2),('antiprism-uc5',5),('antiprism-uc8',3),('antiprism-uc68',2)]:
        model=load_specialized_model(key);assert len(model['components'])==components
        assert validate(model)['passed'];before=deepcopy(model)
        one=extract_component(model,model['components'][0]['id']);assert validate(one)['passed']
        assert len(remove_component(model,model['components'][0]['id'])['components'])==components-1
        assert model==before
    a=noble_disphenoid();b=noble_disphenoid(hand='B')
    assert a['metadata']['noble']['vertexTransitive'] and a['metadata']['noble']['faceTransitive']
    assert a['metadata']['chirality']['status']=='numerically chiral'
    assert b['vertices']==[[-p[0],p[1],p[2]] for p in a['vertices']]
    assert surface_topology(a['vertices'],a['faces'])['genus']==0
    broken=deepcopy(a['faces']);broken.pop();assert surface_topology(a['vertices'],broken)['genus'] is None
    torus=torus_sweep();assert validate(torus)['passed'];assert torus['metadata']['specializedBoundary']['components'][0]['genus']==1
    assert [len(torus[k]) for k in ('vertices','edges','faces')]==[72,144,72]
    print(f'Specialized catalog sanity PASS: {len(records)} entries; four real compounds Keep/Delete, noble mirror/transitivity, genus refusal.')


if __name__=='__main__':main()
