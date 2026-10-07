"""Explicit coordinate units and source-only export preparation."""
from copy import deepcopy
from fractions import Fraction
import math
import json
import numpy as np

from .geometry import GeometryError, identity, validate
from .operations import transform

METERS = {'mm':Fraction(1,1000), 'cm':Fraction(1,100), 'm':Fraction(1),
          'in':Fraction(127,5000), 'ft':Fraction(381,1250)}
UNIT_NAMES = frozenset(METERS) | {'model'}
FORMATS = frozenset({'off','json','obj','dxf','vrml','stl','pov'})


def prepare_export(model, format, source_unit='model', target_unit='model', document_metadata=None, notes=None):
    if format not in FORMATS or source_unit not in UNIT_NAMES or target_unit not in UNIT_NAMES:
        raise GeometryError('Choose a supported format and coordinate units.')
    if not validate(model)['passed']:
        raise GeometryError('Export preparation requires valid source geometry.')
    if (source_unit=='model') != (target_unit=='model'):
        raise GeometryError('Declare physical source units before converting export coordinates.')
    if format=='vrml' and source_unit!='model' and target_unit!='m':
        raise GeometryError('Physical VRML output uses meters; choose m as output units.')
    factor=Fraction(1) if source_unit==target_unit else METERS[source_unit]/METERS[target_unit]
    result=deepcopy(model) if factor==1 else transform(model,scale=float(factor))
    result['name']=model['name']
    result.setdefault('metadata',{})['coordinateUnits']=target_unit
    colors=model.get('metadata',{}).get('offColors',{})
    losses=[]
    if document_metadata is not None:
        if type(document_metadata) is not dict:
            raise GeometryError('Project metadata must be a JSON object.')
        try:
            metadata_bytes=json.dumps(document_metadata,allow_nan=False,ensure_ascii=False).encode('utf-8')
        except (ValueError,TypeError) as exc:
            raise GeometryError('Project metadata must contain finite JSON values.') from exc
        if len(metadata_bytes)>131072:
            raise GeometryError('Project metadata exceeds the export limit.')
        result['metadata']['documentMetadata']=deepcopy(document_metadata)
    if notes is not None:
        if type(notes) is not str or len(notes.encode('utf-8'))>1024*1024:
            raise GeometryError('Project notes exceed the export limit or are not text.')
        result['metadata']['documentNotes']=notes
    if format!='json' and (document_metadata or notes):
        losses.append('Project metadata and notes require JSON or a native project to retain them.')
    if any(color is not None for rows in colors.values() for color in rows) and format not in ('off','json'):
        losses.append('Source boundary colors are not represented by this exporter.')
    if format=='dxf' and model.get('faces'):
        losses.append('DXF output contains source edges; faces and cells are omitted.')
    if format not in ('off','json') and model.get('cells'):
        losses.append('This format cannot retain intrinsic 4D cells.')
    report={'sourceFingerprint':identity(model),'sourceUnit':source_unit,
            'targetUnit':target_unit,'scaleFactor':float(factor),
            'exactFactor':str(factor),'coordinateDomain':'intrinsic source',
            'precision':'17 significant decimal digits for OFF, OBJ and DXF coordinates',
            'losses':losses,'numericGuarantee':result.get('numeric',{}).get('mode')}
    result.setdefault('provenance',{})['exportContext']=report
    return {'model':result,'report':report}


def scale_reference(model, index, desired_length):
    if type(index) is not int or not 0<=index<len(model['edges']):
        raise GeometryError('Choose a valid source edge for reference scaling.')
    if type(desired_length) not in (int,float) or not math.isfinite(desired_length) or desired_length<=0:
        raise GeometryError('Reference length must be positive and finite.')
    a,b=model['edges'][index]
    original=float(np.linalg.norm(np.asarray(model['vertices'][a])-model['vertices'][b]))
    if not math.isfinite(original) or original<=0:
        raise GeometryError('Selected source edge has no finite nonzero length.')
    result=transform(model,scale=desired_length/original)
    result['provenance']['referenceScale']={'kind':'edge','index':index,
        'sourceLength':original,'desiredLength':desired_length,'scaleFactor':desired_length/original}
    return result
