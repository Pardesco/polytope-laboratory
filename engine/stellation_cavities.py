"""Finite full-facet cavity receipts; no unrestricted visibility equivalence."""

import math
from .geometry import GeometryError, hull
from .stellation_cells import cell_graph, inaccessible_regions

VERSION = '0.1.0'


def cavity_analysis(arrangement, region_ids, source=None):
    graph = cell_graph(arrangement, source)
    cavities = inaccessible_regions(graph, region_ids)
    selected = set(region_ids)
    cavity_set = set(cavities)
    filled = selected | cavity_set
    hidden = []
    before = sum(len(arrangement['regions'][i]['model']['faces']) for i in selected)
    after = sum(len(arrangement['regions'][i]['model']['faces']) for i in filled)
    for link in graph['links']:
        a, b = link['regions']
        if a in selected and b in selected:
            before -= 2
        if a in filled and b in filled:
            after -= 2
        if (a in selected and b in cavity_set) or (b in selected and a in cavity_set):
            owner = a if a in selected else b
            hidden.append(
                {
                    'selectedRegionId': owner,
                    'cavityRegionId': b if owner == a else a,
                    'selectedFaceId': link['regionFaceIds'][str(owner)],
                    'planeIds': link['planeIds'],
                }
            )
    volumes = [hull(r['model']['vertices'])['measure']['content'] for r in arrangement['regions']]
    box_volume = math.prod(high - low for low, high in zip(*arrangement['bounds']))
    residual = abs(sum(volumes) - box_volume)
    if not math.isclose(sum(volumes), box_volume, rel_tol=1e-6, abs_tol=box_volume * 1e-8):
        raise GeometryError('Cavity analysis requires observation-box volume conservation; rebuild the arrangement.')
    volume = sum(volumes[i] for i in cavities)
    return {
        'algorithmVersion': VERSION,
        'arrangementId': graph['arrangementId'],
        'arrangementSha256': graph['arrangementSha256'],
        'sourceFingerprint': graph['sourceFingerprint'],
        'selectedRegionIds': sorted(selected),
        'cavityRegionIds': cavities,
        'filledRegionIds': sorted(filled),
        'addedVolume': volume,
        'removedBoundaryFacets': hidden,
        'boundaryFacetCounts': {'preserve': before, 'fill': after},
        'partitionVolumeResidual': residual,
        'relativePartitionVolumeResidual': residual / box_volume,
        'completeWithinObservedFacetDomain': graph['completeWithinObservedFacetDomain'],
        'unresolvedFacetRegionIds': graph['unresolvedFacetRegionIds'],
        'exteriorSeedIds': graph['exteriorSeedIds'],
        'definition': graph['fillDefinition'],
        'domain': graph['domain'],
        'numericMode': 'float64-approximate',
        'certified': False,
        'unrestrictedStellationEnumerationComplete': False,
    }


def apply_cavity_policy(arrangement, region_ids, source, policy):
    if type(policy) is not str or policy not in ('preserve', 'fill'):
        raise GeometryError('Cavity policy must be preserve or fill within the observed full-facet domain.')
    report = cavity_analysis(arrangement, region_ids, source)
    chosen = report['filledRegionIds'] if policy == 'fill' else report['selectedRegionIds']
    receipt = {
        'algorithmVersion': VERSION,
        'policy': policy,
        'inputRegionSigns': [arrangement['regions'][i]['signs'] for i in report['selectedRegionIds']],
        'cavityRegionSigns': [arrangement['regions'][i]['signs'] for i in report['cavityRegionIds']],
        'addedVolume': report['addedVolume'] if policy == 'fill' else 0,
        'boundaryFacetCounts': report['boundaryFacetCounts'],
        'completeWithinObservedFacetDomain': report['completeWithinObservedFacetDomain'],
        'partitionVolumeResidual': report['partitionVolumeResidual'],
        'definition': report['definition'],
        'domain': report['domain'],
        'numericMode': report['numericMode'],
        'certified': False,
    }
    return chosen, receipt
