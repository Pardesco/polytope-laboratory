from copy import deepcopy
from engine.generators import regular
from engine.geometry import validate,identity
from engine.formats import parse_off,export_off

def test_cell_topology_variants_survive_without_convex_cell_assumptions():
    model=regular('cross4')
    variant=deepcopy(model);variant['interpretation']='generalized-complex'
    # An explicitly generalized open shell stays inspectable with manifold
    # diagnostics; it is never classified or certified as an ordinary polytope.
    variant['cells'][0]=variant['cells'][0][:-1]
    assert validate(variant)['passed']
    imported=parse_off(export_off(variant))
    assert imported['interpretation']=='generalized-complex'
    assert imported['cells']==variant['cells']
    assert identity(imported)!=identity(model)
    assert imported['validation']['warnings']
