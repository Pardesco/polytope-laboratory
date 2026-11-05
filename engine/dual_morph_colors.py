"""Opt-in RGBA interpolation using declared source/reciprocal incidence owners."""
from copy import deepcopy
from .dual_morph_expansion import _lattice, _mix, _color_record

KINDS=('vertices','edges','faces','cells')


def mix_rgba(a,b,t):
    a=_mix([a]);b=_mix([b])
    if a is None:return deepcopy(b)
    if b is None:return deepcopy(a)
    return {'encoding':'float','values':[(1-t)*x+t*y for x,y in zip(a['values'],b['values'])]}


def face_field(model,face_colors):
    lattice=_lattice(model);faces=lattice[2]
    result=[]
    for rank,entities in enumerate(lattice):
        result.append([_mix([face_colors[i] for i,F in enumerate(faces) if (E<=F if rank<=2 else F<=E)]) for E in entities])
    return result


def interpolate_frame_colors(frame,source,dual):
    # Endpoints preserve literal authored records, including indexed palettes.
    # Interior interpolation requires resolved RGB/RGBA, as existing morph mixing.
    if frame['endpoint']:return
    d=source['dimension'];t=frame['ratio']
    primal=face_field(source,[_color_record(source,'faces',i) for i in range(len(source['faces']))])
    dual_faces=[_color_record(dual,'faces',i) or primal[d-3][i] for i in range(len(dual['faces']))]
    reciprocal=face_field(dual,dual_faces)
    fallback=(_mix(primal[2]),_mix(reciprocal[2]))

    def pair(rank,index,component='source'):
        if component=='dual':rank=d-1-rank
        if not 0<=rank<d or not 0<=index<len(primal[rank]):return []
        return [(primal[rank][index],reciprocal[d-1-rank][index])]

    def contributions(owner):
        if not isinstance(owner,dict):return []
        values=[]
        if 'sourceVertex' in owner:
            values+=pair(0,owner['sourceVertex'])
            if 'sourceFacet' in owner:
                i=owner['sourceFacet'];values.append((primal[d-1][i],reciprocal[0][i]))
        if 'sourceRank' in owner and 'sourceElement' in owner:
            values+=pair(owner['sourceRank'],owner['sourceElement'])
        if 'dualRank' in owner and 'dualOriginElement' in owner:
            values+=pair(owner['dualRank'],owner['dualOriginElement'],'dual')
        if 'cell' in owner:values+=pair(d-1,owner['cell'],owner.get('component','source'))
        for child in owner.get('owners',[]):values+=contributions(child)
        for child in owner.get('sourceFaceIds',[]):values+=pair(2,child)
        return values

    colors={}
    for kind in KINDS:
        colors[kind]=[]
        for owner in frame['sourceMaps'].get(kind,[]):
            pairs=contributions(owner)
            a=_mix([p[0] for p in pairs]) if pairs else fallback[0]
            b=_mix([p[1] for p in pairs]) if pairs else fallback[1]
            colors[kind].append(mix_rgba(a,b,t))
    frame['model'].setdefault('metadata',{})['offColors']=colors
    frame['model']['metadata']['colorInterpolation']={'parameter':t,'policy':'Linear normalized RGBA; equal-weight incident face means at declared primal/reciprocal owners; global face mean only for ownerless elements. Literal endpoints retained.'}
