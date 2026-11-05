"""Analytic edge-defined tetrahedra, triangular prisms and triangular meshes."""
import hashlib,json,math
from .polish_names import basic_construction_name
import numpy as np
from .geometry import GeometryError,identity,validate

KINDS={'edge-tetrahedron','triangular-prism','triangular-grid','block'}
UNITS={'model','mm','cm','m','in','ft'}

def _length(value,label):
    if type(value) not in (int,float) or not math.isfinite(value) or not 1e-4<=value<=1e4:
        raise GeometryError(label+' must be finite between 0.0001 and 10000.')
    return float(value)

def _vector(values,length,label,positive=True):
    if type(values) is not list or len(values)!=length:
        raise GeometryError(label+' needs '+str(length)+' coordinates.')
    if positive:return [_length(value,label) for value in values]
    if any(type(value) not in (int,float) or not math.isfinite(value) or abs(value)>1e4 for value in values):
        raise GeometryError(label+' needs finite coordinates within ±10000.')
    return [float(value) for value in values]

def _triangle(a,b,c):
    # AB=a, AC=b, BC=c. Normalize before subtracting squared lengths.
    scale=max(a,b,c);a,b,c=a/scale,b/scale,c/scale
    x=(a*a+b*b-c*c)/(2*a);y2=b*b-x*x
    if y2<=1e-12:
        raise GeometryError('The side lengths do not form a nondegenerate triangle.')
    return np.array([x,math.sqrt(y2)])*scale

def _model(kind,vertices,faces,parameters,unit,closed):
    vertices=np.asarray(vertices,dtype=float);dimension=vertices.shape[1]
    faces=[list(face) for face in faces]
    equations=[];area=content=0.;center=vertices.mean(axis=0)
    if closed:
        for face in faces:
            polygon=vertices[face];normal=np.cross(polygon[1]-polygon[0],polygon[2]-polygon[0]);normal/=np.linalg.norm(normal)
            if np.dot(normal,polygon[0]-center)<0:
                face.reverse();polygon=vertices[face];normal=-normal
            offset=-float(np.dot(normal,polygon[0]));equations.append([*normal.tolist(),offset])
            tolerance=max(1.,float(np.max(np.linalg.norm(vertices-center,axis=1))))*1e-9
            if max(abs(polygon@normal+offset))>tolerance or max(vertices@normal+offset)>tolerance:
                raise GeometryError('Analytic solid failed its supporting-face check.')
            face_area=sum(float(np.linalg.norm(np.cross(polygon[i]-polygon[0],polygon[i+1]-polygon[0])))/2 for i in range(1,len(face)-1))
            area+=face_area;content+=face_area*float(np.dot(normal,polygon[0]-center))/3
    else:
        for face in faces:
            for i in range(1,len(face)-1):
                a,b=vertices[face[i]]-vertices[face[0]],vertices[face[i+1]]-vertices[face[0]]
                content+=abs(float(np.linalg.det([a,b])))/2 if dimension==2 else float(np.linalg.norm(np.cross(a,b)))/2
    edges=sorted({tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1])})
    recipe={'kind':kind,'parameters':{**parameters,'coordinate_unit':unit}}
    result={'id':'basic-'+hashlib.sha256(json.dumps(recipe,sort_keys=True).encode()).hexdigest(),
        'name':basic_construction_name(kind,parameters),'dimension':dimension,'embeddingDimension':dimension,
        'interpretation':'convex-polytope' if closed else 'generalized-complex',
        'vertices':vertices.tolist(),'edges':[list(edge) for edge in edges],'faces':faces,'cells':[],
        'numeric':{'mode':'float64-approximate','certified':False,'tolerance':1e-9},
        'metadata':{'family':'Basic constructions','coordinateUnits':unit,'basicConstruction':recipe},
        'provenance':{'operation':'generate','generator':recipe,'hullRepair':False}}
    if closed:
        result.update(facetEquations=equations,facetVertices=faces,measure={'content':content,'boundary':area})
    else:result['metadata']['basicConstruction']['tiledArea']=content
    result['validation']=validate(result)
    if not result['validation']['passed']:
        raise GeometryError('Analytic construction failed incidence validation: '+'; '.join(result['validation']['errors']))
    result['fingerprint']=identity(result)
    return result

def basic_solid(kind,**parameters):
    if kind not in KINDS:raise GeometryError('Unknown basic construction.')
    allowed={'coordinate_unit'}|({'edges'} if kind=='edge-tetrahedron' else {'sides','height','shear'} if kind=='triangular-prism' else {'dimensions','subdivisions'} if kind=='block' else {'subdivisions','edge_length','shape','fold_angle'})
    if set(parameters)-allowed:raise GeometryError('Unsupported basic construction parameters.')
    unit=parameters.pop('coordinate_unit','model')
    if unit not in UNITS:raise GeometryError('Choose supported coordinate units.')
    if kind=='block':
        from .generator_grids import subdivided_block
        return subdivided_block(unit=unit,**parameters)
    if kind=='edge-tetrahedron':
        lengths=_vector(parameters.get('edges',[1]*6),6,'Edges 01, 02, 03, 12, 13, 23')
        scale=max(lengths);a,b,c,d,e,f=np.asarray(lengths)/scale
        for sides in ((a,b,d),(a,c,e),(b,c,f),(d,e,f)):_triangle(*sides)
        squared=np.array([[0,a*a,b*b,c*c],[a*a,0,d*d,e*e],[b*b,d*d,0,f*f],[c*c,e*e,f*f,0]])
        cayley=np.ones((5,5));cayley[0,0]=0;cayley[1:,1:]=squared
        determinant=float(np.linalg.det(cayley))
        if determinant<=1e-12:raise GeometryError('Cayley–Menger determinant is nonpositive or numerically unresolved; the six edges do not define a nondegenerate tetrahedron.')
        xy=_triangle(a,b,d);x=(a*a+c*c-e*e)/(2*a);y=(b*b+c*c-f*f-2*xy[0]*x)/(2*xy[1]);z2=c*c-x*x-y*y
        if z2<=1e-12:raise GeometryError('The six lengths do not form a nondegenerate tetrahedron.')
        vertices=np.array([[0,0,0],[a,0,0],[xy[0],xy[1],0],[x,y,math.sqrt(z2)]])*scale
        result=_model(kind,vertices,[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],{'edges':lengths},unit,True)
        volume=math.sqrt(determinant/288)*scale**3;residual=abs(volume-result['measure']['content'])/volume
        if residual>1e-8:raise GeometryError('Cayley–Menger and embedded tetrahedron volumes disagree at float64 tolerance.')
        result['metadata']['basicConstruction']['cayleyMenger']={'normalizedDeterminant':determinant,'lengthScale':scale,'volume':volume,'relativeVolumeResidual':residual,'certified':False}
        return result
    if kind=='triangular-prism':
        sides=_vector(parameters.get('sides',[1]*3),3,'Base sides AB, AC, BC');height=_length(parameters.get('height',1),'Height')
        shear=_vector(parameters.get('shear',[0,0]),2,'Top XY displacement',False);xy=_triangle(*sides)
        base=np.array([[0,0,0],[sides[0],0,0],[xy[0],xy[1],0]])
        vertices=np.concatenate([base,base+np.array([*shear,height])])
        return _model(kind,vertices,[[2,1,0],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]],{'sides':sides,'height':height,'shear':shear},unit,True)
    from .generator_grids import triangular_grid
    return triangular_grid(unit=unit,**parameters)
