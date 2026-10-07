import hashlib
import pytest

from engine.catalog import get_catalog, DATA
from engine.generators import CATALOG, regular


def test_independent_catalog_stays_stable_and_sources_are_additive():
    records=get_catalog()
    assert len(CATALOG)==45
    # Public mathematical labels are additive; original key/name/counts stay.
    assert [{k:r[k] for k in old} for r,old in zip(records[:45],CATALOG)]==CATALOG
    assert len({record['key'] for record in records})==len(records)
    assert len([r for r in records if r.get('provider')=='Antiprism'])==167
    assert all(len(record['counts'])==4 for record in records if 'counts' in record)
    records[45]['counts'][0]=-1
    assert get_catalog()[45]['counts'][0]==5


@pytest.mark.parametrize('key,counts,interpretation',[
    ('antiprism-j1',[5,8,5,0],'convex-polytope'),
    ('antiprism-j84',[8,18,12,0],'convex-polytope'),
    ('antiprism-u3',[12,24,12,0],'generalized-complex'),
    ('antiprism-u75',[60,240,124,0],'generalized-complex')])
def test_catalog_generate_retains_source_geometry_and_attribution(key,counts,interpretation):
    model=regular(key)
    assert [len(model[field]) for field in ('vertices','edges','faces','cells')]==counts
    assert model['interpretation']==interpretation
    source=model['provenance']['catalogSource']
    assert source['provider']=='Antiprism'
    assert source['licenseFile']=='COPYING'
    assert hashlib.sha256((DATA/'antiprism'/source['file']).read_bytes()).hexdigest()==source['sha256']
    assert model['numeric']['certified'] is False
