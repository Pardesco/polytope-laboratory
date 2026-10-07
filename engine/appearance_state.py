"""GPL-3.0-only: bounded saved Phong appearance; no geometry certification."""
from copy import deepcopy
import math

from engine.geometry import GeometryError

DEFAULTS={'version':1,'preset':'classic','theme':'dark','tint':'#ffffff','specular':'#18202a',
    'shininess':30,'ambient':.08,'hemisphere':.85,'keyIntensity':1.5,'fillIntensity':.48,
    'keyDirection':[4,7,6],'fillDirection':[-5,1,-3],'background':'#15191f',
    'edgeColor':'#9eafc0','vertexColor':'#c8d2dd'}


def validate_appearance(value):
    if type(value) is not dict or set(value)-set(DEFAULTS):
        raise GeometryError('Saved appearance requires a bounded supported record.')
    options={**DEFAULTS,**value}
    if (type(options['version']) not in (int,float) or options['version']!=1 or
        type(options['preset']) is not str or options['preset'] not in ('classic','matte','polished','warm','custom') or
        type(options['theme']) is not str or options['theme'] not in ('dark','light','paper','custom')):
        raise GeometryError('Unsupported saved appearance version or preset.')
    for key in ('tint','specular','background','edgeColor','vertexColor'):
        text=options[key]
        if type(text) is not str or len(text)!=7 or text[0]!='#' or any(c not in '0123456789abcdefABCDEF' for c in text[1:]):
            raise GeometryError('Saved '+key+' requires a six-digit hexadecimal color.')
    for key,maximum in (('shininess',512),('ambient',5),('hemisphere',5),('keyIntensity',10),('fillIntensity',10)):
        x=options[key]
        if type(x) not in (int,float) or not 0<=x<=maximum or not math.isfinite(x):
            raise GeometryError('Saved '+key+' exceeds its finite appearance range.')
    for key in ('keyDirection','fillDirection'):
        v=options[key]
        if (type(v) is not list or len(v)!=3 or any(type(x) not in (int,float) or not -100<=x<=100 or not math.isfinite(x) for x in v)
            or math.hypot(*v)<1e-6):
            raise GeometryError('Saved '+key+' requires a bounded nonzero three-coordinate direction.')
    return deepcopy(value)
