# Classical simplified Tri-D (fixed attack boards) move generator, FS projection rule.
FILES='zabcde'
LEVELS=['W','QL1','KL1','N','B','QL6','KL6']
def main(lv,r0):
    return [(x,y,lv) for x in range(1,5) for y in range(r0,r0+4)]
CELLS=set(main('W',1)+main('N',3)+main('B',5))
for lv,xs,ys in [('QL1',(0,1),(0,1)),('KL1',(4,5),(0,1)),('QL6',(0,1),(8,9)),('KL6',(4,5),(8,9))]:
    for x in xs:
        for y in ys: CELLS.add((x,y,lv))
COL={}
for (x,y,l) in CELLS: COL.setdefault((x,y),[]).append(l)
def name(c): x,y,l=c; return f"{FILES[x]}{y}{l}"
import re
def parse(s):
    m=re.match(r'^([zabcde])(\d)(W|N|B|QL1|KL1|QL6|KL6)$',s); assert m,s
    c=(FILES.index(m[1]),int(m[2]),m[3]); assert c in CELLS,s; return c
def inrect(x,y): return 0<=x<6 and 0<=y<10
ORTH=[(1,0),(-1,0),(0,1),(0,-1)]; DIAG=[(1,1),(1,-1),(-1,1),(-1,-1)]
KN=[(1,2),(2,1),(-1,2),(-2,1),(1,-2),(2,-1),(-1,-2),(-2,-1)]
def colfree(b,x,y): return all((x,y,l) not in b for l in COL.get((x,y),[]))
def dests(b,x,y,side,mode):
    out=[]
    for l in COL.get((x,y),[]):
        o=b.get((x,y,l))
        if mode=='move' and o is None: out.append((x,y,l))
        elif mode=='capture' and o is not None and o[0]!=side: out.append((x,y,l))
        elif mode=='both' and (o is None or o[0]!=side): out.append((x,y,l))
    return out
def lastrank(x,side):
    ys=[y for (xx,y) in COL if xx==x]
    return max(ys) if side=='w' else min(ys)
def start():
    b={}
    W=[('z0QL1','R'),('a0QL1','Q'),('z1QL1','P'),('a1QL1','P'),('d0KL1','K'),('e0KL1','R'),('d1KL1','P'),('e1KL1','P'),
       ('a1W','N'),('b1W','B'),('c1W','B'),('d1W','N'),('a2W','P'),('b2W','P'),('c2W','P'),('d2W','P')]
    for s,p in W: b[parse(s)]=('w',p,False)
    B=[('z9QL6','R'),('a9QL6','Q'),('z8QL6','P'),('a8QL6','P'),('d9KL6','K'),('e9KL6','R'),('d8KL6','P'),('e8KL6','P'),
       ('a8B','N'),('b8B','B'),('c8B','B'),('d8B','N'),('a7B','P'),('b7B','P'),('c7B','P'),('d7B','P')]
    for s,p in B: b[parse(s)]=('b',p,False)
    return b
def gen(b,side,ep=None,castle=True):
    mv=[]
    fw=1 if side=='w' else -1
    for c,(s,p,moved) in list(b.items()):
        if s!=side: continue
        x,y,l=c
        def slide(vs):
            for dx,dy in vs:
                tx,ty=x+dx,y+dy
                while inrect(tx,ty):
                    for t in dests(b,tx,ty,side,'both'): mv.append((c,t,None,''))
                    if not colfree(b,tx,ty): break
                    tx+=dx; ty+=dy
        def leap(vs):
            for dx,dy in vs:
                tx,ty=x+dx,y+dy
                if inrect(tx,ty):
                    for t in dests(b,tx,ty,side,'both'): mv.append((c,t,None,''))
        def pawnadd(t,flag=''):
            if t[1]==lastrank(t[0],side):
                for q in 'QRBN': mv.append((c,t,q,flag))
            else: mv.append((c,t,None,flag))
        if p=='R': slide(ORTH)
        elif p=='B': slide(DIAG)
        elif p=='Q': slide(ORTH+DIAG)
        elif p=='K':
            leap(ORTH+DIAG)
        elif p=='N': leap(KN)
        elif p=='P':
            for t in dests(b,x,y+fw,side,'move'): pawnadd(t)
            if not moved and (x,y+fw) in COL and colfree(b,x,y+fw) or (not moved and (x,y+fw) not in COL and False):
                for t in dests(b,x,y+2*fw,side,'move'): pawnadd(t,'double')
            for dx in (1,-1):
                for t in dests(b,x+dx,y+fw,side,'capture'): pawnadd(t)
                if ep and (x+dx,y+fw)==ep[0]:
                    for l in COL[ep[0]]:
                        if (x+dx,y+fw,l) not in b: mv.append((c,(x+dx,y+fw,l),None,'ep'))
    if castle:
        k='d0KL1' if side=='w' else 'd9KL6'; r='e0KL1' if side=='w' else 'e9KL6'
        K=b.get(parse(k)); R=b.get(parse(r))
        if K and R and K[:2]==(side,'K') and R[:2]==(side,'R') and not K[2] and not R[2]:
            mv.append((parse(k),parse(r),None,'castle'))
    return mv
def fmt(m):
    c,t,q,f=m; return name(c)+'-'+name(t)+('='+q if q else '')+(' '+f if f else '')
def targets(b,sq,**kw):
    c=parse(sq); side=b[c][0]
    return sorted(fmt(m) for m in gen(b,side,**kw) if m[0]==c)
def apply(b,m):
    c,t,q,f=m; nb=dict(b); s,p,_=nb.pop(c)
    if f=='castle':
        r=nb.pop(t); nb[t]=(s,p,True); nb[c]=(r[0],r[1],True); return nb
    nb[t]=(s,q or p,True); return nb
if __name__=='__main__':
    print('cells',len(CELLS),'columns',len(COL),'two-level cols',sorted(FILES[x]+str(y)+':'+'/'.join(ls) for (x,y),ls in COL.items() if len(ls)>1))
    b=start()
    m=gen(b,'w'); print('white perft1',len(m)); print(sorted(fmt(x) for x in m))
    mb=gen(b,'b'); print('black perft1',len(mb))
    tot=0
    for x in m: tot+=len(gen(apply(b,x),'b'))
    print('perft2',tot)
    print('lastrank w', {FILES[x]:lastrank(x,'w') for x in range(6)}, 'b',{FILES[x]:lastrank(x,'b') for x in range(6)})
