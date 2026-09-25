from hexchess import *
import itertools
def bp_ok(c):  # black pawn plausible cell
    q,h=c; return h <= 2+abs(q) and not (h-abs(q)==-10)
def wp_ok(c):
    q,h=c; return h >= -2-abs(q) and not (h+abs(q)==10)
best=[None]
def dfs(b, depth):
    if best[0] and len(b)>=len(best[0]): return
    if depth>14: return
    P={'b':b,'ep':None,'epv':None,'turn':1}
    ms=gen(P)
    if not ms:
        best[0]=dict(b); return
    f,t,pr,kind,cap=ms[0]
    opts=[]
    if cap is None:
        # block target t with white piece (pawn if plausible else knight) or black pawn
        for piece in [(0,'p') if wp_ok(t) else (0,'n'), (1,'p') if bp_ok(t) else None, (1,'b')]:
            if piece: opts.append(piece)
    else:
        for piece in [(1,'p') if bp_ok(t) else None, (1,'b')]:
            if piece: opts.append(piece)
    for pc in opts:
        nb=dict(b); nb[t]=pc
        dfs(nb, depth+1)
for k in ['a6','l6','b7','f11','a5','c8']:
    best[0]=None
    kc=cell(k)
    b={kc:(1,'k'), cell('f1'):(0,'k')}
    dfs(b,0)
    if best[0]: print(k,len(best[0]),sorted(name(c)+':'+str(s)+t for c,(s,t) in best[0].items()))
