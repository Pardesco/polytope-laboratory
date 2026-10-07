"""Source-preserving ownership and approximate convex construction finalization.

Only verified freshly generated schemas enter this boundary. A reference hull
never supplies replacement source incidence. The frozen native persistence and
measure paths must succeed with finite positive normal-float64 measures before promotion.
"""
from copy import deepcopy
import hashlib
import json
import math
import sys
import uuid

from .antiprism_components import attach_construction_components, _numeric_schema
from .product_components import attach_product_components, _same_schema
from .podia_components import attach_podia_components
from .compounds import KINDS, MAX_PAYLOAD_BYTES, _check_source
from .convex_classification import analyze_convex_boundary
from .formats import validate_project
from .geometry import GeometryError, identity, validate
from .history import _json_bytes, canonical_model
from .step_prisms import (VERSION as STEP_VERSION, MAX_ORDER, MIN_RADIUS,
                         MAX_RADIUS)

VERSION = '0.1.0'
SCHEMAS = ('orderedProduct','rationalAntiprism','polyhedronPrism','stepPrism','rationalPodium','rationalAntipodium')


def _fail(message):
    raise GeometryError('Construction finalization: '+message)


def _canonical_fingerprint(model):
    return hashlib.sha256(json.dumps(canonical_model(model),allow_nan=False,
                                    sort_keys=True,separators=(',',':')).encode()).hexdigest()


def _checked_step(model,info):
    """Validate the established hull declaration and literal selected inputs.

    Its current full boundary is rechecked by the existing native project/
    measure gate. Reconstructing or promoting arbitrary imported hulls is not
    an entry point, and bounded classifier refusal cannot erase this declaration.
    """
    _check_source(model)
    if (model['dimension']!=4 or model.get('embeddingDimension')!=4
            or model.get('interpretation')!='convex-polytope'):
        _fail('step prisms require their established intrinsic 4D convex Hull declaration.')
    fingerprint=identity(model)
    if (type(info.get('schemaVersion')) is not int or info['schemaVersion']!=1
            or info.get('algorithmVersion')!=STEP_VERSION or info.get('certified') is not False
            or info.get('generatedSourceModelId')!=model.get('id')
            or info.get('generatedSourceFingerprint')!=fingerprint or model.get('fingerprint')!=fingerprint):
        _fail('step-prism original source identity or geometry binding is stale.')
    try:uuid.UUID(model['id'])
    except (ValueError,TypeError,AttributeError,KeyError) as error:
        raise GeometryError('Construction finalization: generated step source ID must be a UUID.') from error
    provenance=model.get('provenance')
    parameters=info.get('parameters')
    if (type(provenance) is not dict or provenance.get('operation')!='step-prism'
            or provenance.get('algorithmVersion')!=STEP_VERSION
            or type(parameters) is not dict or set(parameters)!={'n','step','radius'}
            or provenance.get('parameters')!=parameters):
        _fail('original step-prism construction parameters are unavailable.')
    n,step,radius=(parameters[key] for key in ('n','step','radius'))
    if (type(n) is not int or not 5<=n<=MAX_ORDER or type(step) is not int
            or not 0<abs(step)<n or type(radius) not in (int,float)
            or not MIN_RADIUS<=radius<=MAX_RADIUS or not math.isfinite(radius)):
        _fail('original step-prism parameters exceed the finite generated domain.')
    selected=[[i,(step*i)%n] for i in range(n)]
    points=[[radius*math.cos(math.tau*a/n),radius*math.sin(math.tau*a/n),
             radius*math.cos(math.tau*b/n),radius*math.sin(math.tau*b/n)] for a,b in selected]
    if (not _same_schema(info.get('selectedFactorVertexIds'),selected)
            or not _same_schema(info.get('resultVertexIds'),list(range(n)))
            or not _numeric_schema(info.get('sourceVertices'),points) or model['vertices']!=points):
        _fail('step-prism source selection, ordered coordinates or vertex maps are stale.')
    if not model.get('facetEquations') or not model.get('facetVertices'):
        _fail('established step-prism Hull supports are unavailable.')


def _native_roundtrip(candidate):
    """Validate detached native JSON, measures and exact current source ownership."""
    _json_bytes(candidate,MAX_PAYLOAD_BYTES)
    expected=canonical_model(candidate)
    original_id=candidate.get('id')
    original_metadata=_json_bytes(candidate.get('metadata',{}),MAX_PAYLOAD_BYTES)
    original_components=_json_bytes(candidate.get('components'),MAX_PAYLOAD_BYTES)
    original_provenance=_json_bytes(candidate.get('provenance'),MAX_PAYLOAD_BYTES)
    project={'format':'polytope-laboratory','version':1,'active':0,
             'documents':[{'id':'construction-finalization-gate','cursor':0,
                           'states':[{'model':candidate,'view':{}}]}]}
    # The native path owns and may refresh caches in this independent JSON copy.
    detached=json.loads(_json_bytes(project))
    checked=validate_project(detached)
    result=checked['documents'][0]['states'][0]['model']
    if (canonical_model(result)!=expected or result.get('id')!=original_id
            or _json_bytes(result.get('metadata',{}),MAX_PAYLOAD_BYTES)!=original_metadata
            or _json_bytes(result.get('components'),MAX_PAYLOAD_BYTES)!=original_components
            or _json_bytes(result.get('provenance'),MAX_PAYLOAD_BYTES)!=original_provenance):
        _fail('native round trip changed current geometry, ownership, colors or historical source provenance.')
    if result['interpretation']=='convex-polytope':
        measure=result.get('measure')
        if (type(measure) is not dict or measure.get('dimension')!=result['dimension']
                or any(type(measure.get(key)) not in (int,float)
                       or not math.isfinite(measure[key]) or measure[key]<sys.float_info.min
                       for key in ('content','boundaryMeasure'))):
            _fail('convex content/boundary measure overflows, underflows, is subnormal or cannot resolve a finite positive normal float64 value.')
    result['validation']=validate(result)
    if not result['validation']['passed']:
        _fail('native current geometry validation failed after cache refresh.')
    result['fingerprint']=identity(result)
    _json_bytes(result,MAX_PAYLOAD_BYTES)
    return result


def _analysis_state(evidence):
    if evidence['status']=='passed':return 'passed'
    if evidence['status']=='unresolved':return 'unresolved'
    if evidence['status']=='unsupported':
        if any('sourceVertices' in diagnostic and 'limit' in diagnostic for diagnostic in evidence['diagnostics']):
            return 'not-analyzed'
        return 'unsupported'
    return 'failed'


def _report(original,candidate,schema,ownership,classification,outcome,diagnostics):
    return {'schemaVersion':1,'algorithmVersion':VERSION,'constructionSchema':schema,
            'originalModelId':original['id'],'originalFingerprint':identity(original),
            'currentModelId':candidate['id'],'currentFingerprint':identity(candidate),
            'originalInterpretation':original['interpretation'],'finalInterpretation':candidate['interpretation'],
            'originalCanonicalFingerprint':_canonical_fingerprint(original),
            'currentCanonicalFingerprint':_canonical_fingerprint(candidate),
            'outcome':outcome,'ownership':deepcopy(ownership),
            'analysisState':_analysis_state(classification),
            # The classifier's dimension-budget mapping uses integer Python
            # keys. Persist the normal JSON representation with string keys.
            'classification':json.loads(json.dumps(classification,allow_nan=False)),
            'nativeProjectGate':{'status':'passed','measurePolicy':'Convex content and boundary measure must be finite positive normal float64 values; zero/subnormal measures are unresolved, and generalized incidence has no inferred content.',
                                 'minimumNormalMeasure':sys.float_info.min},
            'diagnostics':deepcopy(diagnostics),
            'numeric':{'mode':'float64-approximate','certified':False},
            'definition':'Fresh generated source ownership and bounded approximate boundary evidence; no replaced incidence, exact certificate or uniformity claim.',
            'evidenceScope':'Original/current geometry IDs, fingerprints and interpretations bind this generated-source report; historical source/factor snapshots are unchanged.'}


def finalize_construction(generated_model):
    """Return a detached source model, with safe promotion or explicit fallback.

    Fresh direct constructions attach true dimensional components before the
    classifier. Failed convex native-measure gates fall back to generalized only
    if that full owned source itself passes native JSON persistence. Existing
    step-prism convex declarations are retained subject to their own native gate.
    This function is not an importer or an operation on edited current geometry.
    """
    try:
        _json_bytes(generated_model,MAX_PAYLOAD_BYTES)
        if type(generated_model) is not dict or type(generated_model.get('metadata')) is not dict:
            _fail('a freshly generated source Model is required.')
        metadata=generated_model['metadata']
        schemas=[name for name in SCHEMAS if name in metadata]
        if len(schemas)!=1 or type(metadata[schemas[0]]) is not dict:
            _fail('one supported fresh construction provenance schema is required; arbitrary imported sources are not promoted.')
        if any(key in metadata for key in ('constructionFinalization','constructionComponents','productComponents','podiaComponents','compound')) or 'components' in generated_model:
            _fail('source is already owned/finalized or edited; finalize the original fresh construction only.')
        numeric=generated_model.get('numeric')
        if type(numeric) is not dict or numeric.get('mode')!='float64-approximate' or numeric.get('certified') is not False:
            _fail('these generated sources require explicitly approximate uncertified numerical settings.')
        schema=schemas[0]
        if schema=='stepPrism':
            _checked_step(generated_model,metadata[schema]);base=deepcopy(generated_model)
            ownership={'status':'not-applicable','components':0,'reason':'Established Hull-defined step prism; no construction component adapter is required.'}
        else:
            if schema=='orderedProduct':
                adapter,adapter_name=attach_product_components,'product-components'
            elif schema in ('rationalPodium','rationalAntipodium'):
                adapter,adapter_name=attach_podia_components,'podia-components'
            else:
                adapter,adapter_name=attach_construction_components,'antiprism-components'
            base=adapter(generated_model)
            ownership={'status':'attached','components':len(base['components']),
                       'adapter':adapter_name}
        classification=analyze_convex_boundary(base)
        if classification.get('sourceModelId')!=base['id'] or classification.get('sourceFingerprint')!=identity(base):
            _fail('independent classification evidence does not bind the exact current generated source.')
        if schema=='stepPrism':
            diagnostics=[]
            if classification['status']!='passed':
                diagnostics.append({'code':'additional-classification-unavailable',
                                    'message':'Existing Hull declaration is retained after its own native validation; the additional bounded classifier supplies no new convex claim.',
                                    'classificationStatus':classification['status']})
            base['metadata']['constructionFinalization']=_report(generated_model,base,schema,ownership,
                classification,'retained-existing-convex',diagnostics)
            return _native_roundtrip(base)
        diagnostics=[]
        if classification['status']=='passed':
            candidate=deepcopy(base)
            candidate['interpretation']='convex-polytope'
            candidate['facetVertices']=[deepcopy(record['vertexIds']) for record in classification['facetSupports']]
            candidate['facetEquations']=[list(record['equation']) for record in classification['facetSupports']]
            candidate['validation']=validate(candidate)
            candidate['metadata']['constructionFinalization']=_report(generated_model,candidate,schema,ownership,
                classification,'promoted-convex',[])
            try:
                return _native_roundtrip(candidate)
            except (GeometryError,ValueError,ArithmeticError,TypeError,KeyError,IndexError) as error:
                diagnostics.append({'code':'unsupported-measure',
                                    'message':'Approximate boundary agreement cannot be promoted through the finite convex measure/native project gate; literal owned generalized source is retained.',
                                    'cause':str(error)})
        else:
            diagnostics.append({'code':'boundary-not-promoted','classificationStatus':classification['status'],
                                'message':'The bounded classifier did not provide complete convex boundary agreement; literal source incidence is retained.'})
        base['metadata']['constructionFinalization']=_report(generated_model,base,schema,ownership,
            classification,'retained-generalized',diagnostics)
        return _native_roundtrip(base)
    except GeometryError:
        raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,AttributeError,RecursionError) as error:
        raise GeometryError('Construction finalization: malformed generated provenance or unsupported native persistence.') from error
