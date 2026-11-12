"""Bound JSON-lines before decoding, draining one refused record at a time."""

import json


def bounded_lines(stream, limit=128 * 1024 * 1024):
    chunks, size, refused = [], 0, False
    while True:
        chunk = stream.readline(min(65536, limit + 1))
        if not chunk:
            if size:
                yield None if refused else b''.join(chunks)
            return
        size += len(chunk)
        if size > limit:
            chunks.clear()
            refused = True
        elif not refused:
            chunks.append(chunk)
        if chunk.endswith(b'\n'):
            yield None if refused else b''.join(chunks)
            chunks, size, refused = [], 0, False


def correlation_id(request):
    value = request.get('id') if type(request) is dict else None
    if type(value) is int and 0 <= value <= 2**53 - 1:
        return value
    if type(value) is str and 1 <= len(value) <= 128:
        try:
            value.encode('utf-8')
            return value
        except UnicodeError:
            pass
    return None


def response_line(output):
    try:
        result = json.dumps(output, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
        result.encode('utf-8')
        return result
    except (UnicodeError, ValueError, TypeError, RecursionError):
        return json.dumps(
            {
                'id': correlation_id(output),
                'ok': False,
                'type': 'GeometryError',
                'error': 'Native response requires finite UTF-8 JSON values.',
            }
        )
