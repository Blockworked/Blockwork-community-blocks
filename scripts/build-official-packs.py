#!/usr/bin/env python3
"""Build the composed official packs. Stable UUIDs keep installed calls valid.

Run this, then build-block-index.py after changing a definition below.
"""
import copy
import json
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMESPACE = uuid.UUID('3df98d0e-8bdf-47ef-b481-654a519c9d2c')
INPUT_DEFAULTS = {
    'TextBetweenMarkers': {'start': '[', 'end': ']', 'text': 'before [example] after'},
    'TextMatchingLines': {'needle': 'error', 'text': 'info: ready\nerror: example'},
    'TextKeyValue': {'key': 'name', 'text': 'name=Blockwork\nversion=1.0'},
    'CenterWindowOnMonitor': {'window': '', 'monitor': 1},
    'TileWindowsSideBySide': {'left': 'Firefox', 'right': 'Terminal', 'monitor': 1, 'gap': 16},
    'CaptureWindowGeometry': {'window': ''},
    'RestoreWindowGeometry': {'window': '', 'snapshot': '{"x":100,"y":100,"width":800,"height":600}'},
    'ClickGrid': {'x': 100, 'y': 100, 'rows': 2, 'columns': 3, 'dx': 80, 'dy': 60, 'ms': 100},
    'DragThroughPoints': {'points': '100,100\n200,100\n200,200', 'ms': 100},
    'ClickInWindow': {'window': '', 'x': 50, 'y': 50},
}


def uid(key):
    return uuid.uuid5(NAMESPACE, key).hex


def val(v):
    if isinstance(v, dict):
        return v
    return {'kind': 'Number' if isinstance(v, (int, float)) else 'Text', 'value': v}


def p(name):
    return {'kind': 'Param', 'name': name}


def op(name, *args):
    return {'kind': 'Op', 'op': name, 'args': [val(a) for a in args], 'saved': val(0)}


def join(*args):
    if len(args) <= 3:
        return op('Join', *args)
    return op('Join', args[0], join(*args[1:]))


def ins(name, value=None):
    return {'kind': name if value is None else {name: value}}


def iff(condition, *body):
    return ins('If', {'condition': condition, 'body': list(body)})


def repeat(count, body):
    return ins('Repeat', {'count': val(count), 'body': body})


def guard(condition, message):
    return iff(op('Not', condition), ins('ThrowError', val(message)))


def finite(value, message):
    # Finite values subtract from themselves to zero; NaN/Infinity do not.
    return guard(op('Eq', op('Sub', value, value), 0), message)


def normalized(text):
    return op('TextReplace', '\r', op('TextReplace', '\r\n', text, '\n'), '\n')


class Pack:
    def __init__(self, id, name, description, color, icon):
        self.id, self.name, self.description = id, name, description
        self.color, self.icon = color, icon
        self.defs, self.strands, self.vars = [], [], set()

    def name_for(self, name):
        return f'Blockworked {self.id}: {name}'

    def v(self, name):
        self.vars.add(name)
        return {'kind': 'Var', 'name': self.name_for(name)}

    def set(self, name, value):
        self.vars.add(name)
        return ins('SetVariable', [self.name_for(name), val(value)])

    def add(self, name, amount=1):
        self.vars.add(name)
        return ins('ChangeVariable', [self.name_for(name), val(amount)])

    def append_line(self, value):
        return [
            iff(op('Gt', self.v('kept'), 0), self.set('output', join(self.v('output'), '\n'))),
            self.set('output', join(self.v('output'), value)), self.add('kept'),
        ]

    def lines(self, text, body):
        return [
            self.set('source', normalized(text)), self.set('line number', 1),
            repeat(op('SplitCount', self.v('source'), '\n'), [
                self.set('line', op('SplitPart', self.v('line number'), self.v('source'), '\n')),
                *body, self.add('line number'),
            ]),
        ]

    def block(self, key, label, description, body, reporter=False, locked=True):
        block_id = uid(f'{self.id}/{key}')
        pieces = []
        for part in re.split(r'(\{[^}]+\})', label):
            if not part.strip():
                continue
            piece = {'kind': 'Input', 'name': part[1:-1], 'value_type': 'Any'} if part.startswith('{') else {'kind': 'Label', 'text': part.strip()}
            piece['id'] = uid(f'{self.id}/{key}/piece/{len(pieces)}')
            if piece['kind'] == 'Input':
                piece['default_value'] = val(INPUT_DEFAULTS[key][piece['name']])
            pieces.append(piece)
        self.defs.append({'id': block_id, 'identifier': 'Blockworked_' + key, 'description': description,
                          'color': self.color, 'icon': self.icon, 'pieces': pieces,
                          'shape': 'ReturnsValue' if reporter else 'Normal'})
        if locked:
            body = [ins('WithLock', {'name': val(f'Blockworked/{self.id}'), 'body': body})]
        # Outside try/catch the app logs many failures and skips the instruction.
        # Stop this workflow on failure instead of using a stale scratch value.
        body = [ins('TryCatch', {'body': body, 'catch_body': [ins('ThrowError', op('LastError'))]})]
        self.strands.append({'id': uid(f'{self.id}/{key}/strand'), 'x': 0, 'y': 0,
                             'instructions': [ins('BlockHeader', block_id), *body]})

    def write(self):
        # Each instruction occurrence needs its own ID, including deep-copied bodies.
        def identify(node, path):
            if isinstance(node, list):
                for i, child in enumerate(node):
                    identify(child, f'{path}/{i}')
            elif isinstance(node, dict):
                if 'kind' in node and (isinstance(node['kind'], dict) or node['kind'] in ('EscapeLoop', 'ContinueLoop')):
                    node['id'] = uid(path)
                for key, child in list(node.items()):
                    identify(child, f'{path}/{key}')
        strands = copy.deepcopy(self.strands)
        identify(strands, self.id)
        template = json.loads((ROOT / 'packs/text-helpers.json').read_text())['blocks']
        content = {**template, 'name': self.name, 'description': self.description,
                   'block_defs': self.defs, 'strands': strands, 'lists': [], 'dicts': [],
                   'variables': [{'name': self.name_for(n), 'value': {'kind': 'Number', 'value': 0}} for n in sorted(self.vars)]}
        version = '1.0.1' if any(p['kind'] == 'Input' for d in self.defs for p in d['pieces']) else '1.0.0'
        data = {'blockwork_block_pack': 1, 'id': self.id, 'name': self.name, 'description': self.description,
                'author': 'Blockworked', 'version': version, 'blocks': content}
        (ROOT / f'packs/{self.id}.json').write_text(json.dumps(data, indent=2) + '\n')


# Clipboard workflows read once and write only after the transformation finishes.
c = Pack('clipboard-tools', 'Clipboard tools',
         'Remove duplicate or blank clipboard lines and clean whitespace while preserving line breaks.', '#59C059', 'clipboard')
for key, label, description, mode in [
    ('ClipboardDeduplicateLines', 'remove duplicate clipboard lines',
     'Removes repeated lines, keeping the first occurrence in order. Matching is exact and case-sensitive; blank lines count as a line. Normalizes CRLF and CR to LF.', 'dedupe'),
    ('ClipboardRemoveBlankLines', 'remove blank clipboard lines',
     'Removes empty and whitespace-only clipboard lines, preserving the content of other lines. Normalizes CRLF and CR to LF.', 'blank'),
    ('ClipboardCleanWhitespace', 'clean clipboard whitespace',
     'Trims every line, collapses runs of spaces and tabs to one space, and removes blank lines. Keeps line breaks and normalizes CRLF and CR to LF.', 'clean'),
]:
    line = c.v('line')
    if mode == 'dedupe':
        work = [iff(op('Not', op('TextCheck', c.v('seen'), 'contains', join('\n', line, '\n'))),
                    *c.append_line(line), c.set('seen', join(c.v('seen'), line, '\n')))]
    else:
        work = ([c.set('line', op('RegexReplace', '[ \\t]+', op('Trim', line), ' '))] if mode == 'clean' else [])
        work += [iff(op('Gt', op('Length', op('Trim', line)), 0), *c.append_line(line))]
    c.block(key, label, description, [c.set('output', ''), c.set('kept', 0), c.set('seen', '\n'),
                                    *c.lines(op('ClipboardText'), work), ins('SetClipboard', c.v('output'))])
c.write()

# Literal text operations: delimiters never become regular expressions.
t = Pack('text-extraction', 'Text extraction',
         'Extract text between literal markers, collect matching lines and look up key=value entries.', '#59C059', 'type')
t.block('TextBetweenMarkers', 'text between {start} and {end} in {text}',
        'Returns text after the first literal start marker and before the next literal end marker. Case-sensitive and Unicode-aware. Empty or missing markers return empty text.', [
    iff(op('Or', op('Eq', op('Length', p('start')), 0), op('Eq', op('Length', p('end')), 0)), ins('Return', val(''))),
    t.set('start position', op('IndexOf', p('start'), p('text'))),
    iff(op('Eq', t.v('start position'), 0), ins('Return', val(''))),
    t.set('tail', op('Substring', op('Add', t.v('start position'), op('Length', p('start'))), op('Length', p('text')), p('text'))),
    t.set('end position', op('IndexOf', p('end'), t.v('tail'))),
    iff(op('Eq', t.v('end position'), 0), ins('Return', val(''))),
    ins('Return', op('Substring', 1, op('Sub', t.v('end position'), 1), t.v('tail'))),
], reporter=True)
t.block('TextMatchingLines', 'lines containing {needle} in {text}',
        'Returns all lines containing the literal needle, in order, joined with LF. Matching is case-sensitive. An empty needle includes every line. Normalizes CRLF and CR to LF.', [
    t.set('output', ''), t.set('kept', 0),
    *t.lines(p('text'), [iff(op('TextCheck', t.v('line'), 'contains', p('needle')), *t.append_line(t.v('line')))]),
    ins('Return', t.v('output')),
], reporter=True)
t.block('TextKeyValue', 'value for key {key} in {text}',
        'Looks up the first matching key=value line. Trims keys and values; keys match exactly and case-sensitively. Preserves additional = signs in the value. Ignores blank keys, # comments and lines without =. Missing keys return empty text.', [
    iff(op('Eq', op('Length', op('Trim', p('key'))), 0), ins('Return', val(''))),
    *t.lines(p('text'), [
        t.set('equals position', op('IndexOf', '=', t.v('line'))),
        iff(op('And', op('Gt', t.v('equals position'), 1), op('Not', op('TextCheck', op('Trim', t.v('line')), 'starts with', '#'))),
            t.set('key', op('Trim', op('Substring', 1, op('Sub', t.v('equals position'), 1), t.v('line')))),
            # Eq is numerically coercing; wrapping in a prefix enforces literal key matching.
            iff(op('Eq', join('key:', t.v('key')), join('key:', op('Trim', p('key')))),
                ins('Return', op('Trim', op('Substring', op('Add', t.v('equals position'), 1), op('Length', t.v('line')), t.v('line')))))),
    ]), ins('Return', val('')),
], reporter=True)
t.write()

w = Pack('window-layouts', 'Window layouts',
         'Center windows on a monitor, tile two windows side by side, and capture or restore window geometry.', '#9966FF', 'panels-top-left')


def wi(pattern, field):
    return op('WindowInfo', pattern, field)


def action(pattern, name):
    return ins('WindowAction', {'action': name, 'pattern': pattern, 'by': 'Any'})


def place(pattern, resize, x, y):
    return ins('MoveWindow', {'pattern': pattern, 'by': 'Any', 'resize': resize, 'x': x, 'y': y})


def monitor_setup():
    return [
        w.set('monitor', op('Add', p('monitor'), 0)),
        guard(op('And', op('Eq', w.v('monitor'), op('Round', w.v('monitor'))),
              op('And', op('Gte', w.v('monitor'), 1), op('Lte', w.v('monitor'), op('MonitorCount')))), 'Choose an existing monitor number (starting at 1).'),
        *[w.set('monitor ' + f, op('MonitorInfo', w.v('monitor'), f)) for f in ('x', 'y', 'width', 'height')],
    ]


w.block('CenterWindowOnMonitor', 'center window {window} on monitor {monitor}',
        'Restores a matching window, then centers it on the selected monitor without changing its restored size. Monitor numbers start at 1. Matches the first title or app containing the pattern; empty means active window. Uses full monitor bounds, including panels.', [
    *monitor_setup(), w.set('window x', wi(p('window'), 'x')),
    action(p('window'), 'Restore'), ins('Wait', val(100)),
    w.set('width', wi(p('window'), 'width')), w.set('height', wi(p('window'), 'height')),
    place(p('window'), False,
          op('Add', w.v('monitor x'), op('Div', op('Sub', w.v('monitor width'), w.v('width')), 2)),
          op('Add', w.v('monitor y'), op('Div', op('Sub', w.v('monitor height'), w.v('height')), 2))),
])
w.block('TileWindowsSideBySide', 'tile windows {left} and {right} on monitor {monitor} gap {gap}',
        'Restores, resizes and positions two windows in equal columns with the requested pixel gap. Give distinct, nonempty title/app patterns. Checks both matches before moving either. Uses full monitor bounds, including panels; window managers may enforce minimum sizes.', [
    *monitor_setup(), w.set('gap', op('Add', p('gap'), 0)),
    guard(op('And', op('Gt', op('Length', op('Trim', p('left'))), 0), op('Gt', op('Length', op('Trim', p('right'))), 0)), 'Give two nonempty window patterns.'),
    guard(op('Neq', op('Case', op('Trim', p('left')), 'Lower'), op('Case', op('Trim', p('right')), 'Lower')), 'Choose two different windows.'),
    guard(op('And', op('Gte', w.v('gap'), 0), op('Lt', w.v('gap'), op('Sub', w.v('monitor width'), 1))), 'Gap must fit between two positive-width windows.'),
    w.set('gap', op('Round', w.v('gap'))),
    w.set('left x', wi(p('left'), 'x')), w.set('right x', wi(p('right'), 'x')),
    w.set('column width', op('Math', 'Floor', op('Div', op('Sub', w.v('monitor width'), w.v('gap')), 2))),
    action(p('left'), 'Restore'), action(p('right'), 'Restore'), ins('Wait', val(100)),
    place(p('left'), True, w.v('column width'), w.v('monitor height')),
    place(p('left'), False, w.v('monitor x'), w.v('monitor y')),
    place(p('right'), True, op('Sub', op('Sub', w.v('monitor width'), w.v('gap')), w.v('column width')), w.v('monitor height')),
    place(p('right'), False, op('Add', w.v('monitor x'), op('Add', w.v('column width'), w.v('gap'))), w.v('monitor y')),
])
w.block('CaptureWindowGeometry', 'geometry snapshot of window {window}',
        'Returns JSON containing x, y, width and height of the first matching window (empty pattern means active). Save this value in your own variable and pass it to restore window geometry. Captures geometry only, not maximized/minimized state.', [
    ins('Return', join('{"x":', wi(p('window'), 'x'), ',"y":', wi(p('window'), 'y'), ',"width":', wi(p('window'), 'width'), ',"height":', wi(p('window'), 'height'), '}')),
], reporter=True, locked=False)
w.block('RestoreWindowGeometry', 'restore window {window} from geometry {snapshot}',
        'Restores a matching window, then resizes and moves it using a geometry snapshot. Validates all four numeric fields and positive dimensions before changing the window. Does not restore maximized/minimized state.', [
    *[w.set(f, op('Add', op('JsonGet', f, p('snapshot')), 0)) for f in ('x', 'y', 'width', 'height')],
    *[finite(w.v(f), 'Snapshot geometry must contain finite numbers.') for f in ('x', 'y', 'width', 'height')],
    *[w.set(f, op('Round', w.v(f))) for f in ('x', 'y', 'width', 'height')],
    guard(op('And', op('Gt', w.v('width'), 0), op('Gt', w.v('height'), 0)), 'Snapshot width and height must be positive.'),
    w.set('window x', wi(p('window'), 'x')), action(p('window'), 'Restore'), ins('Wait', val(100)),
    place(p('window'), True, w.v('width'), w.v('height')), place(p('window'), False, w.v('x'), w.v('y')),
])
w.write()

m = Pack('mouse-patterns', 'Mouse patterns',
         'Click grids, drag through a path of points and click relative to a window.', '#4C97FF', 'mouse-pointer-click')


def move(x, y):
    return ins('Token', {'MoveMouse': [val(x), val(y), 'Abs']})


def button(direction):
    return ins('Token', {'Button': ['Left', direction]})


def numeric_inputs(*names):
    return [instruction for n in names for instruction in (
        m.set(n, op('Add', p(n), 0)), finite(m.v(n), f'{n} must be a finite number.'))]


m.block('ClickGrid', 'click grid at x {x} y {y} rows {rows} columns {columns} spacing x {dx} y {dy} pause {ms} ms',
        'Left-clicks a grid in row-major order, starting at absolute screen x,y. Spacing is in pixels and may be negative or zero. Rows and columns must be nonnegative whole numbers. Pauses the given nonnegative milliseconds after each click; zero-sized grids do nothing.', [
    *numeric_inputs('x', 'y', 'rows', 'columns', 'dx', 'dy', 'ms'),
    *[guard(op('And', op('Gte', m.v(n), 0), op('Eq', m.v(n), op('Round', m.v(n)))), f'{n.title()} must be a nonnegative whole number.') for n in ('rows', 'columns')],
    guard(op('Gte', m.v('ms'), 0), 'Pause must be nonnegative.'),
    iff(op('Or', op('Eq', m.v('rows'), 0), op('Eq', m.v('columns'), 0)), ins('Return', val(0))),
    m.set('row', 0), repeat(m.v('rows'), [m.set('column', 0), repeat(m.v('columns'), [
        move(op('Add', m.v('x'), op('Mul', m.v('column'), m.v('dx'))), op('Add', m.v('y'), op('Mul', m.v('row'), m.v('dy')))),
        button('Click'), ins('Wait', m.v('ms')), m.add('column'),
    ]), m.add('row')]),
])
# Validate every coordinate before pressing the mouse button. Errors release it.
path_line = op('SplitPart', m.v('point number'), m.v('path'), '\n')
m.block('DragThroughPoints', 'drag through points {points} pause {ms} ms',
        'Left-drags through newline-separated absolute x,y pairs, pausing at each point. Needs at least two pairs and a nonnegative pause in milliseconds. Validates the entire path before pressing; releases the button if an action fails. Supports CRLF/CR lines and surrounding whitespace.', [
    *numeric_inputs('ms'), guard(op('Gte', m.v('ms'), 0), 'Pause must be nonnegative.'),
    m.set('path', op('Trim', normalized(p('points')))), m.set('point count', op('SplitCount', m.v('path'), '\n')),
    guard(op('Gte', m.v('point count'), 2), 'A drag path needs at least two x,y pairs.'),
    m.set('point number', 1), repeat(m.v('point count'), [
        m.set('point', path_line), guard(op('Eq', op('SplitCount', m.v('point'), ','), 2), 'Each path line must contain exactly one x,y pair.'),
        m.set('point x', op('Add', op('SplitPart', 1, m.v('point'), ','), 0)),
        m.set('point y', op('Add', op('SplitPart', 2, m.v('point'), ','), 0)),
        finite(m.v('point x'), 'Path coordinates must be finite numbers.'),
        finite(m.v('point y'), 'Path coordinates must be finite numbers.'), m.add('point number'),
    ]),
    m.set('point number', 1), m.set('point', path_line),
    move(op('SplitPart', 1, m.v('point'), ','), op('SplitPart', 2, m.v('point'), ',')),
    ins('TryCatch', {'body': [button('Press'), ins('Wait', m.v('ms')), m.set('point number', 2),
        repeat(op('Sub', m.v('point count'), 1), [m.set('point', path_line),
            move(op('SplitPart', 1, m.v('point'), ','), op('SplitPart', 2, m.v('point'), ',')), ins('Wait', m.v('ms')), m.add('point number')]),
        button('Release')], 'catch_body': [button('Release'), ins('ThrowError', op('LastError'))]}),
])
m.block('ClickInWindow', 'click in window {window} at offset x {x} y {y}',
        'Focuses the first matching window and left-clicks a pixel offset from its client-area top-left. Empty pattern means active window. Rechecks bounds after focusing; rejects offsets outside the client area. Window control must be supported by the desktop.', [
    *numeric_inputs('x', 'y'), m.set('x', op('Round', m.v('x'))), m.set('y', op('Round', m.v('y'))),
    m.set('window width', wi(p('window'), 'width')), m.set('window height', wi(p('window'), 'height')),
    guard(op('And', op('And', op('Gte', m.v('x'), 0), op('Lt', m.v('x'), m.v('window width'))),
          op('And', op('Gte', m.v('y'), 0), op('Lt', m.v('y'), m.v('window height')))), 'Click offset must be inside the window.'),
    action(p('window'), 'Focus'), ins('Wait', val(100)),
    m.set('window x', wi(p('window'), 'x')), m.set('window y', wi(p('window'), 'y')),
    guard(op('And', op('Lt', m.v('x'), wi(p('window'), 'width')), op('Lt', m.v('y'), wi(p('window'), 'height'))), 'Window became smaller than the click offset.'),
    move(op('Add', m.v('window x'), m.v('x')), op('Add', m.v('window y'), m.v('y'))), button('Click'),
])
m.write()
print('Built clipboard-tools, text-extraction, window-layouts and mouse-patterns')
