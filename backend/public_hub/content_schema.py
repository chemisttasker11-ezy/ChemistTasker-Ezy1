"""Small, explicit rich-text schema shared by editorial storage and renderers."""
import json
from urllib.parse import urlsplit
from rest_framework.exceptions import ValidationError

BLOCKS = {'doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'hardBreak', 'image', 'text'}
MARKS = {'bold', 'italic', 'strike', 'code', 'link'}


def safe_url(value, image=False):
    value = str(value or '').strip()
    try:
        parsed = urlsplit(value)
    except ValueError:
        raise ValidationError("Invalid URL.")
    if parsed.scheme not in ({'https', 'http'} if image else {'https', 'http', 'mailto'}) or not parsed.path and not parsed.netloc:
        raise ValidationError('Use an absolute http(s) URL, or a mailto link.')
    if parsed.username or parsed.password:
        raise ValidationError('URLs must not contain credentials.')
    return value


def validate_document(value):
    if not isinstance(value, dict) or value.get('type') != 'doc':
        raise ValidationError('A rich-text document is required.')
    if len(json.dumps(value)) > 500000:
        raise ValidationError('Content is too large.')
    count = 0

    def walk(node, depth=0):
        nonlocal count
        count += 1
        if count > 5000 or depth > 12 or not isinstance(node, dict) or node.get('type') not in BLOCKS:
            raise ValidationError('Unsupported or overly complex content.')
        kind = node['type']
        result = {'type': kind}
        if kind == 'text':
            if not isinstance(node.get('text'), str):
                raise ValidationError('Text must be a string.')
            result['text'] = node['text']
        attrs = node.get('attrs') or {}
        if not isinstance(attrs, dict) or not isinstance(node.get('marks', []), list):
            raise ValidationError('Invalid formatting attributes.')
        if kind == 'heading':
            level = attrs.get('level', 2)
            if level not in [2, 3, 4]:
                raise ValidationError('Use heading levels 2–4.')
            result['attrs'] = {'level': level}
        if kind == 'image':
            if not str(attrs.get('alt', '')).strip():
                raise ValidationError('Images require descriptive alt text.')
            result['attrs'] = {'src': safe_url(attrs.get('src'), image=True), 'alt': str(attrs['alt'])[:240]}
        if kind == 'orderedList':
            result['attrs'] = {'start': 1}
        marks = []
        for mark in node.get('marks', []):
            if not isinstance(mark, dict) or mark.get('type') not in MARKS:
                raise ValidationError('Unsupported text formatting.')
            item = {'type': mark['type']}
            if not isinstance(mark.get('attrs') or {}, dict):
                raise ValidationError('Invalid link attributes.')
            if mark['type'] == 'link':
                item['attrs'] = {'href': safe_url((mark.get('attrs') or {}).get('href'))}
            marks.append(item)
        if marks:
            result['marks'] = marks
        if 'content' in node:
            if not isinstance(node['content'], list):
                raise ValidationError('Invalid content structure.')
            result['content'] = [walk(child, depth + 1) for child in node['content']]
        return result

    return walk(value)


def plain_text(node):
    if node.get('type') == 'text':
        return node.get('text', '')
    if node.get('type') == 'image':
        return node.get('attrs', {}).get('alt', '')
    separator = '' if node.get('type') in {'paragraph', 'heading'} else '\n\n'
    return separator.join(plain_text(child) for child in node.get('content', []))
