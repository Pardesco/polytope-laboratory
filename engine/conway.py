"""Bounded Conway compositions on checked convex 3D sources."""
from copy import deepcopy
import re
import numpy as np
from .geometry import GeometryError, identity
from .face_subdivision import source_faces, subdivide_faces, persist_model
from .operations import dual, truncate

VERSION='0.1.0'
SEEDS={'T':'tetrahedron','C':'cube','O':'octahedron','D':'dodecahedron','I':'icosahedron'}
OPERATORS={'d':'dual','a':'ambo','k':'kis','t':'truncate','j':'join','e':'expand'}


def parse_notation(notation):
    if type(notation) is not str or len(notation)>33 or not re.fullmatch(r'[daktje]*[TCODI]?',notation) or not notation:
        raise GeometryError('Conway notation accepts d, a, k, t, j, e and optional Platonic seed T/C/O/D/I (for example tI). Gyro/snub and parameterized notation are unsupported.')
    seed=notation[-1] if notation[-1] in SEEDS else None
    operators=notation[:-1] if seed else notation
    if len(operators)>8:raise GeometryError('Conway notation supports at most eight operators.')
    return {'operators':list(reversed(operators)),'seed':seed}


def conway(source, notation='a', height=None):
    parsed=parse_notation(notation)
    if height is not None and (type(height) not in (int,float) or not np.isfinite(height) or not 0<height<=1e6):
        raise GeometryError('Conway kis height must be finite and positive, at most 1e6 source units.')
    if parsed['seed']:
        from .generators import regular
        current=regular(SEEDS[parsed['seed']])
    else:current=deepcopy(source)
    source_name=current.get('name','Model')
    source_faces(current,convex=True)
    steps=[]
    for operator in parsed['operators']:
        detail={}
        source_faces(current,convex=True)
        if len(current['edges'])*2>4096:raise GeometryError('Conway intermediate exceeds its 4096-point construction bound.')
        if operator=='d':current=dual(current)
        elif operator=='a':current=truncate(current,.5)
        elif operator=='t':current=truncate(current,1/3)
        elif operator=='j':current=dual(truncate(dual(current),.5))
        elif operator=='e':
            current=truncate(current,.5)
            if len(current['edges'])*2>4096:raise GeometryError('Conway expansion exceeds its 4096-point construction bound.')
            current=truncate(current,.5)
        elif operator=='k':
            p=np.asarray(current['vertices']);mean=float(np.mean([np.linalg.norm(p[b]-p[a]) for a,b in current['edges']]))
            resolved=mean*.25 if height is None else height
            for attempt in range(12 if height is None else 1):
                candidate=subdivide_faces(current,'kis',resolved)
                if candidate['interpretation']=='convex-polytope':break
                resolved/=2
            else:raise GeometryError('Kis height produced a nonconvex boundary; choose a smaller positive height.')
            current=candidate
            detail={'kisHeight':resolved,'heightPolicy':'automatic convex height by bounded halving' if height is None else 'explicit source-unit distance','heightAttempts':attempt+1}
        steps.append({'operator':operator,'counts':[len(current[key]) for key in ('vertices','edges','faces')],**detail})
    current['id']='conway-'+identity(current)
    from .construction_names import construction_name
    operators=notation[:-1] if parsed['seed'] else notation
    current['name']=construction_name(current,operators+'('+source_name+')' if operators else source_name)
    metadata={'family':'Conway operators','conway':{'algorithmVersion':VERSION,'notation':notation,'steps':steps,
        'definition':'right to left; a=rectify, t=one-third edge cut, j=dad, e=aa; geometric realizations need not be uniform',
        'sourceFingerprint':identity(source) if source else None,'kisHeight':height}}
    if not parsed['seed'] and 'coordinateUnits' in source.get('metadata',{}):metadata['coordinateUnits']=source['metadata']['coordinateUnits']
    current['metadata']=metadata
    current['provenance']={'operation':'conway','algorithmVersion':VERSION,'parameters':{'notation':notation,'height':height}}
    return persist_model(current)
