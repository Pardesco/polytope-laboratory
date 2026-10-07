"""Manual 3D polygonal complexes with supplied boundary cycles.

Retains the original vertices and topology. No convexification or assertion
of stellation/faceting enumeration completeness is made.
"""
import uuid
from .geometry import GeometryError, validate, identity


def facet(model, faces, name=None):
    if model['dimension']!=3 or model.get('embeddingDimension')!=3:
        raise GeometryError('Manual facet construction currently supports 3D vertices.')
    if not isinstance(faces,list) or not 1<=len(faces)<=10000:
        raise GeometryError('Supply 1–10,000 ordered polygon boundary cycles.')
    if any(not isinstance(f,list) or len(f)<3 or any(type(v) is not int or not 0<=v<len(model['vertices']) for v in f) for f in faces):
        raise GeometryError('Every facet cycle needs at least three valid integer vertex IDs.')
    edges={tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])}
    result={'id':str(uuid.uuid4()),'name':name or 'Faceting of '+model['name'],'dimension':3,'embeddingDimension':3,
            'interpretation':'generalized-complex','vertices':model['vertices'],'edges':[list(e) for e in sorted(edges)],'faces':faces,'cells':[],
            'numeric':{**model['numeric'],'certified':False},'metadata':{'sourceVertexIds':list(range(len(model['vertices']))),'fillSemantics':'ordered cycles; generalized surfaces not triangulated'},
            'provenance':{'operation':'manual-faceting','sourceId':model['id'],'sourceFingerprint':model.get('fingerprint'),
                          'parameters':{'faces':faces},'algorithmVersion':'0.1.0'}}
    result['validation']=validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Facet geometry failed checks: '+'; '.join(result['validation']['errors']))
    result['fingerprint']=identity(result)
    return result
