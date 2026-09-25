"""Reference move generator for Glinski hexagonal chess (research check for research/hexagonal.md).

Coordinates: doubled (q, h). q = file offset from f (a=-5 .. l=+5), h = 2*rank - 12 + |q|.
Cells: |q| <= 5, |q| + |h| <= 10, h = q (mod 2). f6 = (0, 0).
"""
import sys

FILES = 'abcdefghikl'
CELLS = [(q, h) for q in range(-5, 6) for h in range(-10, 11) if abs(q) + abs(h) <= 10 and (h - q) % 2 == 0]
CSET = set(CELLS)


def name(c):
    q, h = c
    return FILES[q + 5] + str((h + 12 - abs(q)) // 2)


def cell(n):
    q = FILES.index(n[0]) - 5
    rank = int(n[1:])
    c = (q, 2 * rank - 12 + abs(q))
    assert c in CSET, n
    return c


def axial(c):
    q, h = c
    return (q, (h - q) // 2)


def colour(c):
    q, r = axial(c)
    return 'MDL'[(q - r) % 3]


ROOK = [(0, 2), (0, -2), (1, 1), (1, -1), (-1, 1), (-1, -1)]
BISHOP = [(2, 0), (-2, 0), (1, 3), (1, -3), (-1, 3), (-1, -3)]
KING = ROOK + BISHOP
KNIGHT = [(a * x, b * y) for (x, y) in [(1, 5), (2, 4), (3, 1)] for a in (1, -1) for b in (1, -1)]
W_START = [cell(n) for n in 'b1 c2 d3 e4 f5 g4 h3 i2 k1'.split()]
B_START = [cell(n) for n in 'b7 c7 d7 e7 f7 g7 h7 i7 k7'.split()]
START = {0: set(W_START), 1: set(B_START)}


def add(c, v, k=1):
    return (c[0] + k * v[0], c[1] + k * v[1])


def promo_zone(side, c):
    q, h = c
    return h + abs(q) == 10 if side == 0 else h - abs(q) == -10


def setup():
    b = {}
    for n in W_START:
        b[n] = (0, 'p')
    for n in B_START:
        b[n] = (1, 'p')
    for s, pcs in ((0, 'Kg1 Qe1 Bf1 Bf2 Bf3 Nd1 Nh1 Rc1 Ri1'), (1, 'Kg10 Qe10 Bf11 Bf10 Bf9 Nd9 Nh9 Rc8 Ri8')):
        for p in pcs.split():
            b[cell(p[1:])] = (s, p[0].lower())
    return {'b': b, 'ep': None, 'epv': None, 'turn': 0}


def pos(placement, turn=0, ep=None, epv=None):
    b = {}
    for n, v in placement.items():
        s, t = v.split(':')
        b[cell(n)] = (int(s), t)
    return {'b': b, 'ep': cell(ep) if ep else None, 'epv': cell(epv) if epv else None, 'turn': turn}


def gen(P, side=None):
    """Pseudo-legal moves (no check rule): (from, to, promo, kind, captured_cell)."""
    side = P['turn'] if side is None else side
    b = P['b']
    out = []
    sgn = 1 if side == 0 else -1

    def push(f, t, cap, kind='normal', typ=None):
        if typ == 'p' and promo_zone(side, t):
            for pr in 'qrbn':
                out.append((f, t, pr, kind, cap))
        else:
            out.append((f, t, None, kind, cap))

    for f, (s, t) in list(b.items()):
        if s != side:
            continue
        if t in 'kn':
            for v in (KING if t == 'k' else KNIGHT):
                d = add(f, v)
                if d not in CSET:
                    continue
                o = b.get(d)
                if o is None:
                    push(f, d, None)
                elif o[0] != side:
                    push(f, d, d)
        elif t in 'qrb':
            dirs = ROOK + BISHOP if t == 'q' else ROOK if t == 'r' else BISHOP
            for v in dirs:
                d = add(f, v)
                while d in CSET:
                    o = b.get(d)
                    if o is None:
                        push(f, d, None)
                    else:
                        if o[0] != side:
                            push(f, d, d)
                        break
                    d = add(d, v)
        elif t == 'p':
            one = add(f, (0, 2 * sgn))
            if one in CSET and one not in b:
                push(f, one, None, typ='p')
                two = add(f, (0, 4 * sgn))
                if f in START[side] and two in CSET and two not in b:
                    out.append((f, two, None, 'double', None))
            for v in ((-1, sgn), (1, sgn)):
                d = add(f, v)
                if d not in CSET:
                    continue
                o = b.get(d)
                if o is not None and o[0] != side:
                    push(f, d, d, typ='p')
                elif o is None and P['ep'] == d and P['epv'] in b and b[P['epv']][0] != side:
                    out.append((f, d, None, 'ep', P['epv']))
    return out


def play(P, m):
    f, t, pr, kind, cap = m
    b = dict(P['b'])
    s, typ = b.pop(f)
    if cap is not None:
        del b[cap]
    b[t] = (s, pr or typ)
    ep = epv = None
    if kind == 'double':
        ep = ((f[0]), (f[1] + t[1]) // 2)
        epv = t
    return {'b': b, 'ep': ep, 'epv': epv, 'turn': 1 - P['turn']}


def attacked_king(P, side):
    """Whether `side`'s king can be captured by the side to move... helper: any enemy move captures side's king."""
    k = [c for c, (s, t) in P['b'].items() if s == side and t == 'k']
    if not k:
        return True
    return any(m[4] == k[0] for m in gen(P, 1 - side))


def legal(P):
    out = []
    for m in gen(P):
        Q = play(P, m)
        if not attacked_king(Q, P['turn']):
            out.append(m)
    return out


def perft(P, d, legal_mode):
    if d == 0:
        return 1
    ms = legal(P) if legal_mode else gen(P)
    if d == 1:
        return len(ms)
    return sum(perft(play(P, m), d - 1, legal_mode) for m in ms)


def mkey(m):
    f, t, pr, kind, cap = m
    return name(f) + '-' + name(t) + ('=' + pr if pr else '')


def targets(P, n):
    c = cell(n)
    return sorted({name(m[1]) for m in gen(P, P['b'][c][0]) if m[0] == c}, key=lambda x: (FILES.index(x[0]), int(x[1:])))


if __name__ == '__main__':
    print('cells', len(CELLS))
    from collections import Counter
    print('colours', Counter(colour(c) for c in CELLS))
    print('f-file colours', [name(c) + colour(c) for c in CELLS if c[0] == 0])
    for f in FILES:
        print(f, [name(c) for c in CELLS if name(c)[0] == f][-1], end='; ')
    print()
    S = setup()
    for n in 'f1 f2 f3 f9 f10 f11'.split():
        print(n, colour(cell(n)), end=' ')
    print()
    ms = gen(S)
    print('start pseudo moves', len(ms), 'legal', len(legal(S)))
    by = Counter(S['b'][m[0]][1] for m in ms)
    print(by)
    print(sorted(mkey(m) for m in ms))
    if '--perft' in sys.argv:
        for d in (1, 2, 3):
            print('perft legal', d, perft(S, d, True))
        for d in (1, 2, 3):
            print('perft pseudo', d, perft(S, d, False))
