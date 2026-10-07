"""Validate persisted observer/display data without certifying source geometry."""
import numpy as np
import math
import json
from .geometry import GeometryError, identity
from .animation_state import validate_animation_sequence


def validate_view(model, view):
    if not isinstance(view,dict):
        raise GeometryError('Saved view must be an object.')
    if 'generalizedDensity' in view:
        from .generalized_density import validate_density_state
        validate_density_state(model,view['generalizedDensity'],unit=view.get('coordinateUnit','model'))
    if 'coincidentAssembly' in view:
        from .coincident_edge_assembly import validate_assembly_state
        validate_assembly_state(model,view['coincidentAssembly'],element_annotations=view.get('elementAnnotations'))
    if 'coincidicComparison' in view:
        from .coincidic_regiments import validate_record
        validate_record(model,view['coincidicComparison'])
    if 'appearance' in view:
        from .appearance_state import validate_appearance
        validate_appearance(view['appearance'])
    if 'materialEffects' in view:
        from .material_effects_state import validate_material_effects
        validate_material_effects(view['materialEffects'])
    def finite(value):
        return type(value) in (int,float) and math.isfinite(value)
    if 'angles' in view and (not isinstance(view['angles'],list) or len(view['angles'])!=6 or not all(finite(x) for x in view['angles'])):
        raise GeometryError('Saved rotation requires six finite coordinate-plane angles.')
    for field,options in {'projection':{'orthographic','perspective','stereographic'},
                          'cameraProjection':{'orthographic','perspective'},
                          'stereoMode':{'none','anaglyph','parallel','cross-eyed'},
                          'coordinateUnit':{'model','mm','cm','m','in','ft'},
                          'vertexStyle':{'point','sphere'},
                          'edgeStyle':{'line','cylinder'},
                          'pickKind':{'vertex','edge','face','cell'},
                          'cellFacing':{'all','hide-front','hide-back','front','back'}}.items():
        if field in view and (type(view[field]) is not str or view[field] not in options):
            raise GeometryError('Saved '+field+' is unsupported.')
    for field in ('surfaceOpacity','sectionOffset','rotationSpeed'):
        if field in view and not finite(view[field]):
            raise GeometryError('Saved '+field+' must be finite.')
    if 'surfaceOpacity' in view and not 0<=view['surfaceOpacity']<=1:
        raise GeometryError('Saved surface opacity must lie between zero and one.')
    distance=view.get('perspectiveDistance4D',3)
    near=view.get('perspectiveNear4D',.08)
    if not finite(distance) or not 0<distance<=100 or not finite(near) or not 0<near<distance:
        raise GeometryError('Saved 4D perspective requires distance in (0,100] and near depth in (0,distance).')
    if 'projectiveDual' in view:
        from .projective_dual_workflow import validate_saved_projective
        validate_saved_projective(model,view)
    if 'dualMorph' in view:
        from .dual_morph import normalize_settings
        view['dualMorph']=normalize_settings(model,view['dualMorph'])
    if 'documentMetadata' in view:
        metadata=view['documentMetadata']
        if type(metadata) is not dict or any(key in metadata and type(metadata[key]) is not str for key in ('title','author','reference','description')):
            raise GeometryError('Saved project metadata needs text fields in a JSON object.')
        if 'custom' in metadata and type(metadata['custom']) is not dict:
            raise GeometryError('Saved additional project metadata needs a JSON object.')
        try:
            metadata_bytes=json.dumps(metadata,allow_nan=False,ensure_ascii=False).encode('utf-8')
        except (ValueError,TypeError) as exc:
            raise GeometryError('Saved project metadata must contain finite JSON values.') from exc
        if len(metadata_bytes)>131072:
            raise GeometryError('Saved project metadata exceeds the size limit.')
    if 'animation' in view:
        view['animation']=validate_animation_sequence(view['animation'])
    for field,maximum in (('explosionAmount',10),('foldFraction',1)):
        if field in view and (not finite(view[field]) or not 0<=view[field]<=maximum):
            raise GeometryError('Saved '+field+' is outside its presentation range.')
    for field,maximum in (('vertexRadius',.5),('edgeRadius',.5),('cellShrink',1)):
        if field in view and (not finite(view[field]) or not 0<view[field]<=maximum):
            raise GeometryError('Saved '+field+' is outside its positive display range.')
    validate_orientation_frame(model,view.get('orientationFrame'))
    if 'elementAnnotations' in view:
        from .element_annotations import validate_document
        validate_document(view['elementAnnotations'], model)
    if 'elementContentDetached' in view or 'elementContentTransfer' in view:
        from .element_content_ownership import validate_content_ownership
        validate_content_ownership(model, view)


def validate_orientation_frame(model, frame):
    if frame is None:
        return
    if not isinstance(frame, dict) or model.get('dimension') != 4 or model.get('embeddingDimension') != 4:
        raise GeometryError('A saved entity orientation requires an intrinsic 4D model.')
    if frame.get('sourceFingerprint') != identity(model):
        raise GeometryError('Saved entity orientation belongs to different source geometry.')
    try:
        matrix = np.asarray(frame.get('matrix'), dtype=float)
        if (matrix.shape != (4, 4) or not np.isfinite(matrix).all()
                or np.max(np.abs(matrix @ matrix.T - np.eye(4))) > 1e-8
                or abs(float(np.linalg.det(matrix)) - 1) > 1e-8):
            raise GeometryError('Saved entity orientation must be a finite proper orthogonal 4D matrix.')
    except (TypeError, ValueError) as exc:
        if isinstance(exc, GeometryError):
            raise
        raise GeometryError('Saved entity orientation matrix is malformed.') from exc
    entity = frame.get('entity')
    if not isinstance(entity, dict) or entity.get('kind') not in ('vertex', 'edge', 'face', 'cell', 'line', 'plane', 'hyperplane') or frame.get('mode') not in ('first', 'last'):
        raise GeometryError('Saved entity orientation requires its source entity and First/Last mode.')
    references = frame.get('sourceVertexIds')
    if not isinstance(references, list) or not references or any(type(v) is not int or not 0 <= v < len(model['vertices']) for v in references):
        raise GeometryError('Saved entity orientation has invalid source vertex references.')
