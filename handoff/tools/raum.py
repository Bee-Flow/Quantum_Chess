# Classical Raumschach move generator (no check; king capture wins) for test numbers.
import itertools
N=5
LV='ABCDE'; FL='abcde'
def name(c): x,y,z=c; return f"{LV[z]}{FL[x]}{y+1}"
def parse(s): return (FL.index(s[1]), int(s[2])-1, LV.index(s[0]))
def inb(c): return all(0<=v<N for v in c)
ROOK=[v for v in itertools.product((-1,0,1),repeat=3) if sum(map(abs,v))==1]
BISH=[v for v in itertools.product((-1,0,1),repeat=3) if sum(map(abs,v))==2]
UNI=[v for v in itertools.product((-1,0,1),repeat=3) if sum(map(abs,v))==3]
KING=ROOK+BISH+UNI
KN=set()
for p in itertools.permutations((0,1,2)):
    for s in itertools.product((-1,1),repeat=3):
        v=tuple(a*b for a,b in zip(p,s)); KN.add(v)
KN=sorted(KN)
PMOVE=[(0,1,0),(0,0,1)]
PCAP=[(1,1,0),(-1,1,0),(1,0,1),(-1,0,1),(0,1,1)]
def orient(v,side): return v if side=='w' else (v[0],-v[1],-v[2])
def add(a,b): return tuple(x+y for x,y in zip(a,b))
def start():
    b={}
    for s,p in [('Aa1','R'),('Ab1','N'),('Ac1','K'),('Ad1','N'),('Ae1','R'),('Ba1','B'),('Bb1','U'),('Bc1','Q'),('Bd1','B'),('Be1','U')]:
        b[parse(s)]=('w',p)
    for f in FL:
        b[parse('A'+f+'2')]=('w','P'); b[parse('B'+f+'2')]=('w','P')
    for s,p in [('Ea5','R'),('Eb5','N'),('Ec5','K'),('Ed5','N'),('Ee5','R'),('Da5','U'),('Db5','B'),('Dc5','Q'),('Dd5','U'),('De5','B')]:
        b[parse(s)]=('b',p)
    for f in FL:
        b[parse('E'+f+'4')]=('b','P'); b[parse('D'+f+'4')]=('b','P')
    return b
def promo_sq(c,side):
    x,y,z=c
    return (y==4 and z==4) if side=='w' else (y==0 and z==0)
def gen(b,side):
    mv=[]
    for c,(s,p) in list(b.items()):
        if s!=side: continue
        def slide(vs):
            for v in vs:
                t=add(c,v)
                while inb(t):
                    o=b.get(t)
                    if o is None: mv.append((c,t,None))
                    else:
                        if o[0]!=side: mv.append((c,t,None))
                        break
                    t=add(t,v)
        def leap(vs):
            for v in vs:
                t=add(c,v)
                if inb(t):
                    o=b.get(t)
                    if o is None or o[0]!=side: mv.append((c,t,None))
        if p=='R': slide(ROOK)
        elif p=='B': slide(BISH)
        elif p=='U': slide(UNI)
        elif p=='Q': slide(KING)
        elif p=='K': leap(KING)
        elif p=='N': leap(KN)
        elif p=='P':
            for v in PMOVE:
                t=add(c,orient(v,side))
                if inb(t) and t not in b:
                    if promo_sq(t,side):
                        for q in 'QRBNU': mv.append((c,t,q))
                    else: mv.append((c,t,None))
            for v in PCAP:
                t=add(c,orient(v,side))
                if inb(t) and t in b and b[t][0]!=side:
                    if promo_sq(t,side):
                        for q in 'QRBNU': mv.append((c,t,q))
                    else: mv.append((c,t,None))
    return mv
def apply(b,m):
    c,t,q=m; nb=dict(b); s,p=nb.pop(c); nb[t]=(s,q or p); return nb
def targets(b,sq):
    c=parse(sq); side=b[c][0]
    return sorted(name(t)+('='+q if q else '') for (f,t,q) in gen(b,side) if f==c)
if __name__=='__main__':
    b=start()
    print('cells',N**3,'pieces',len(b))
    m=gen(b,'w'); print('perft1 white',len(m))
    tot=0
    for x in m:
        nb=apply(b,x); tot+=len(gen(nb,'b'))
    print('perft2',tot)
    print('black perft1',len(gen(b,'b')))
    from collections import Counter
    print(Counter(b[f][1] for f,t,q in m))
    for sq in ['Ab1','Ad1','Bc1','Bb1','Be1','Ba1','Bd1','Ac1','Aa1','Ac2','Bc2']:
        print(sq, b[parse(sq)], targets(b,sq))
    # empty board mobility
    for p in 'RBUQKN':
        for sq in ['Aa1','Cc3']:
            e={parse(sq):('w',p)}
            print(p,sq,len(gen(e,'w')))
    e={parse('Aa1'):('w','B')}; print('B Aa1',targets(e,'Aa1'))
    e={parse('Aa1'):('w','N')}; print('N Aa1',targets(e,'Aa1'))
    e={parse('Cc3'):('w','U')}; print('U Cc3',targets(e,'Cc3'))
    # unicorn classes
    from collections import defaultdict
    cls=defaultdict(int)
    for c in itertools.product(range(5),repeat=3):
        k=tuple(v%2 for v in c); 
        if k[0]==1: k=tuple(1-v for v in k)
        cls[k]+=1
    print(dict(cls))
    for sq in ['Bb1','Be1','Da5','Dd5']:
        c=parse(sq); k=tuple(v%2 for v in c)
        if k[0]==1: k=tuple(1-v for v in k)
        print(sq,k)
    for sq in ['Ba1','Bd1','Db5','De5']:
        c=parse(sq); print(sq,'parity',sum(c)%2)
