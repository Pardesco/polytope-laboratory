from copy import deepcopy
from math import sqrt
import numpy as np
import pytest
from engine.basic_solids import basic_solid
from engine.geometry import GeometryError
from engine.formats import validate_project

def test_analytic_dimensions_incidence_units_and_native_project():
    lengths=[3,4,5,5,sqrt(34),sqrt(41)];before=deepcopy(lengths)
    tetra=basic_solid('edge-tetrahedron',edges=lengths,coordinate_unit='mm')
    for length,(a,b) in zip(lengths,[(0,1),(0,2),(0,3),(1,2),(1,3),(2,3)]):
        assert np.linalg.norm(np.asarray(tetra['vertices'][a])-tetra['vertices'][b])==pytest.approx(length)
    assert tetra['measure']['content']==pytest.approx(10) and lengths==before
    prism=basic_solid('triangular-prism',sides=[3,4,5],height=2,shear=[2,-1])
    assert [len(prism[k]) for k in ('vertices','edges','faces')]==[6,9,5]
    assert prism['measure']['content']==pytest.approx(12)
    grid=basic_solid('triangular-grid',subdivisions=4,edge_length=2)
    assert [len(grid[k]) for k in ('vertices','edges','faces')]==[15,30,16]
    assert grid['metadata']['basicConstruction']['tiledArea']==pytest.approx(16*sqrt(3))
    for model in (tetra,prism,grid):
        project={'format':'polytope-laboratory','version':1,'active':0,'documents':[{'id':'test','cursor':0,'states':[{'model':model,'view':{},'notes':'Analytic source'}]}]}
        validate_project(project)

def test_impossible_and_degenerate_dimensions_are_refused():
    for kind,params in [('edge-tetrahedron',{'edges':[1,1,1,3,1,1]}),('edge-tetrahedron',{'edges':[1,1,2,1,1,1]}),('triangular-prism',{'sides':[1,1,2]}),('triangular-grid',{'subdivisions':True})]:
        with pytest.raises(GeometryError):basic_solid(kind,**params)
