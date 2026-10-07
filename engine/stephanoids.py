# SPDX-License-Identifier: GPL-3.0-only
"""Literal n,a,b crown polyhedra, following Antiprism's published face orbit."""
from collections import Counter
from copy import deepcopy
import math
import uuid
import numpy as np
from .geometry import GeometryError,TOLERANCE,identity,validate,canonical_cycle
from .history import _json_bytes
from .specialized_catalog import surface_topology

# Face orbit adapted from Antiprism make_crown_full:
# Copyright (c) 2003-2021, Adrian Rossiter
# 
#    Antiprism - http://www.antiprism.com
# 
#    Permission is hereby granted, free of charge, to any person obtaining a
#    copy of this software and associated documentation files (the "Software"),
#    to deal in the Software without restriction, including without limitation
#    the rights to use, copy, modify, merge, publish, distribute, sublicense,
#    and/or sell copies of the Software, and to permit persons to whom the
#    Software is furnished to do so, subject to the following conditions:
# 
#       The above copyright notice and this permission notice shall be included
#       in all copies or substantial portions of the Software.
# 
#   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
#   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
#   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
#   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
#   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
#   FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
#   IN THE SOFTWARE.

VERSION='0.1.0'
MAX_N=128
REFERENCE='https://github.com/antiprism/antiprism/blob/7805b34d3f8860857fb9ac10a1917d1bf4c7888d/base/polygon.cc'


def _orbit(n,a,b):
    """make_crown_full: integer first/second steps, retained without reduction."""
    faces=[]
    if (a+b)%2==0:
        offset=(b-a)//2
        for i in range(n):
            faces.extend([[(i-offset)%n,(i+a)%n+n,(i+a+offset)%n,i+n],
                          [(i-offset)%n+n,(i+a)%n,(i+a+offset)%n+n,i]])
    else:
        odd1=a%2;odd2=b%2
        for i in range(n):
            faces.extend([[i,(i-1+(b+odd2)//2+(a+odd1)//2)%n+n,(i+b)%n,(i-1+(b+odd2)//2-(a-odd1)//2)%n+n],
                          [i,(i-1+(a+odd1)//2+(b+odd2)//2)%n+n,(i+a)%n,(i-1+(a+odd1)//2-(b-odd2)//2)%n+n]])
    return faces


def _points(n,anti,z,radius=1.):
    phase=math.pi/(2*n) if anti else 0.
    return [[radius*math.cos(math.tau*i/n-sign*phase),-radius*math.sin(math.tau*i/n-sign*phase),sign*radius*z]
            for sign in (1,-1) for i in range(n)]


def _self_dual_match(model):
    from .incidence_dual import incidence_dual
    dual=incidence_dual(model,center=[0,0,0],radius=1)
    source=np.asarray(model['vertices']);points=np.asarray(dual['vertices'])
    scale=float(np.linalg.norm(source[0])/np.linalg.norm(points[0]));points*=scale
    expected={canonical_cycle(face) for face in model['faces']}
    # Both reciprocal vertex sets lie on coaxial regular rings. Try their
    # finite axial rotations/reflections, then verify every ordered dual face.
    for target in source:
        if abs(target[2]-points[0,2])>1e-6*max(1,float(np.max(abs(source)))):continue
        angle=math.atan2(target[1],target[0])-math.atan2(points[0,1],points[0,0])
        c,s=math.cos(angle),math.sin(angle)
        rotation=np.array([[c,-s,0],[s,c,0],[0,0,1]])
        aligned=points@rotation.T;distance=np.linalg.norm(aligned[:,None]-source[None,:],axis=2)
        mapping=np.argmin(distance,axis=1).tolist();residual=float(max(distance[i,j] for i,j in enumerate(mapping)))
        if len(set(mapping))==len(source) and residual<=1e-7*float(np.max(np.ptp(source,axis=0))) and {canonical_cycle([mapping[v] for v in face]) for face in dual['faces']}==expected:
            return {'verified':True,'certified':False,'dualVertexToSourceVertex':mapping,'reciprocalScale':scale,'rotationRadians':angle,'maximumCoordinateResidual':residual,'definition':'Origin-centered unit-radius plane reciprocation, axial rotation and positive common similarity; all ordered face cycles verified.'}
    raise GeometryError('Self-dual crown reciprocal similarity/incidence could not be resolved.')


def stephanoid(n=7,a=1,b=4,mode='uniform-hull',radius=1.,height=None):
    if any(type(v) is not int or not 1<=v<=MAX_N for v in (n,a,b)) or n<=3 or a==b or a+b>=n:
        raise GeometryError('Stephanoid needs integer 4 <= n <= 128, positive distinct a,b, and a+b < n.')
    if type(radius) not in (int,float) or not 1e-4<=radius<=1e4 or not math.isfinite(radius):
        raise GeometryError('Stephanoid radius must be finite from 0.0001 to 10000.')
    if mode not in ('uniform-hull','self-dual','height') or (mode=='height')!=(height is not None):
        raise GeometryError('Choose uniform-hull, self-dual, or height with an explicit total height.')
    anti=(a+b)%2==1;faces=_orbit(n,a,b)
    if mode=='height':
        if type(height) not in (int,float) or not 1e-4<=height<=1e4 or not math.isfinite(height):raise GeometryError('Stephanoid total height must be finite from 0.0001 to 10000.')
        z=height/(2*radius)
    elif mode=='uniform-hull':
        ring=2*math.sin(math.pi/n);lateral=2*math.sin(math.pi/(2*n)) if anti else 0.
        z=math.sqrt((ring-lateral)*(ring+lateral))/2
    else:
        p=np.asarray(_points(n,anti,1.))[faces[0]];normal=np.cross(p[1]-p[0],p[2]-p[0])
        horizontal=float(np.linalg.norm(normal[:2]));vertical=abs(float(normal[2]))
        if min(horizontal,vertical)<=1e-12:raise GeometryError('Self-dual aspect is numerically unresolved.')
        z=math.sqrt(vertical/horizontal)
    vertices=_points(n,anti,z,float(radius));edges=sorted({tuple(sorted((u,v))) for f in faces for u,v in zip(f,f[1:]+f[:1])})
    counts=Counter(tuple(sorted((u,v))) for f in faces for u,v in zip(f,f[1:]+f[:1]))
    if len({canonical_cycle(f) for f in faces})!=2*n or set(counts.values())!={2}:raise GeometryError('Crown orbit has duplicate/nonmanifold source incidence.')
    adjacency=[set() for _ in vertices]
    for u,v in edges:adjacency[u].add(v);adjacency[v].add(u)
    remaining=set(range(2*n));parts=[]
    while remaining:
        seen=set();pending=[min(remaining)]
        while pending:
            i=pending.pop()
            if i not in seen:seen.add(i);pending.extend(adjacency[i]-seen)
        remaining-=seen;parts.append(sorted(seen))
    parameters={'n':n,'a':a,'b':b,'mode':mode,'radius':float(radius)}
    if height is not None:parameters['height']=float(height)
    model={'id':str(uuid.uuid4()),'name':f'Stephanoid {n},{a},{b} ({mode})','dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
           'vertices':vertices,'edges':[list(e) for e in edges],'faces':faces,'cells':[],
           'numeric':{'mode':'float64-approximate','tolerance':TOLERANCE,'certified':False},
           'provenance':{'operation':'stephanoid','algorithmVersion':VERSION,'parameters':deepcopy(parameters),'generator':{'kind':'stephanoid','parameters':deepcopy(parameters)},'definitionSource':REFERENCE},
           'metadata':{'family':'Noble','stephanoid':{'schemaVersion':1,'algorithmVersion':VERSION,'parameters':deepcopy(parameters),'symmetryFamily':'antiprismatic' if anti else 'prismatic',
               'resolvedTotalHeight':2*radius*z,'commonInputDivisor':math.gcd(n,math.gcd(a,b)),'componentCount':len(parts),'definitionSource':REFERENCE,
               'parameterCrosswalk':'Antiprism polygon crown n/a -A b; make_crown_full integer first/second steps. Named prismatic 7-1-3 and antiprismatic 7-1-4 match the independent published edge graphs.',
               'heightDefinition':'Custom full axial height, regular-edge convex vertex hull, or aspect z/r=sqrt(abs(n_z)/norm(n_xy)) evaluated from a face normal at z/r=1.',
               'vertexMaps':[{'ring':'upper' if i<n else 'lower','angularIndex':i%n} for i in range(2*n)],
               'faceMaps':[{'orbitIndex':i//2,'representative':i%2} for i in range(2*n)],
               'interpretation':'Literal self-crossing bow-tie face cycles; crossings are not extra vertices. No hull repair or filled-solid content claim.'}}}
    model['validation']=validate(model)
    if not model['validation']['passed']:raise GeometryError('Stephanoid native validation failed: '+'; '.join(model['validation']['errors']))
    model['fingerprint']=identity(model);model['components']=[]
    for number,vs in enumerate(parts):
        owned=set(vs);fs=[i for i,f in enumerate(faces) if f[0] in owned];es=[i for i,e in enumerate(edges) if e[0] in owned]
        report=surface_topology(vertices,[faces[i] for i in fs])
        if not report['closedVertexManifold']:raise GeometryError('Stephanoid source vertex links are not simple closed cycles.')
        model['components'].append({'id':str(uuid.uuid5(uuid.UUID(model['id']),str(number))),'name':f'Stephanoid constituent {number+1}','sourceModelId':model['id'],'sourceFingerprint':model['fingerprint'],'sourcePath':[],'maps':{'vertices':vs,'edges':es,'faces':fs,'cells':[]}})
    info=model['metadata']['stephanoid'];info.update({'sourceModelId':model['id'],'sourceFingerprint':model['fingerprint'],'evidenceScope':'Generated source geometry only; maps remain bound to this source fingerprint.'})
    if mode=='self-dual':info['selfDualEvidence']=_self_dual_match(model)
    _json_bytes(model,16*1024*1024)
    return model
