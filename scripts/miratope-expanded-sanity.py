import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
# SPDX-License-Identifier: GPL-3.0-only
"""Focused representative literal-incidence checks; not a full corpus audit."""
from engine.miratope_expanded_catalog import expanded_catalog,load_expanded_model,_entries,DATA
from engine.formats import export_model,parse_off


def main():
    records=expanded_catalog();assert len(records)==980;assert len({r['key'] for r in records})==980
    wanted=['Grand antiprism','Quasicantellated tesseract','24cell_chiral_2type_0000_20260304_112802','24cell_chiral_2type_0001_20260304_112802','tesseract_chiral_all_0002_20260304_114623']
    results={}
    for name in wanted:
        entry=next(e for e in _entries().values() if e['name']==name);model=load_expanded_model(entry['key']);assert model['validation']['passed']
        # Independent literal source-row extraction checks topology preservation.
        lines=[x.split('#',1)[0].strip() for x in (DATA/entry['file']).read_text().splitlines()];lines=[x for x in lines if x]
        nv,nf,ne,nc=map(int,lines[1].split());vertices=[list(map(float,x.split())) for x in lines[2:2+nv]]
        cycles=lambda rows:[list(map(int,x.split()[1:1+int(x.split()[0])])) for x in rows]
        assert model['vertices']==vertices;assert model['faces']==cycles(lines[2+nv:2+nv+nf]);assert model['cells']==cycles(lines[2+nv+nf:])
        assert len(model['edges'])==ne
        roundtrip=parse_off(export_model(model,'off'))
        for kind in ('vertices','edges','faces','cells'):assert roundtrip[kind]==model[kind]
        assert model['metadata']['classificationVerified'] is False
        results[name]=model
    a=results[wanted[2]];b=results[wanted[3]]
    assert a['metadata']['key']!=b['metadata']['key'];assert a['faces']!=b['faces'];assert len(a['vertices'])==len(b['vertices'])==24
    print('Expanded Miratope sanity PASS:980distinct records; five literal4D imports/roundtrips; distinct24-cell topology variants retained; classification remains source-only.')


if __name__=='__main__':main()
