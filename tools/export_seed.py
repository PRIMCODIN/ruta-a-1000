import json, sys, chess, chess.pgn, io, hashlib
sys.path.insert(0,".")
U="hustlehard619"
games={g["idx"]:g for g in map(json.loads,open("./analysis.jsonl"))}
f=open("./games.pgn"); pg=[]
while True:
    g=chess.pgn.read_game(f)
    if g is None: break
    pg.append(g)
out=[]; ext={}
for i,g in enumerate(pg):
    a=games[i]; h=g.headers; white=h["White"]==U
    d=h["Date"].replace(".","-"); t=":".join(x.zfill(2) for x in h["EndTime"].split(" ")[0].split(":"))
    played=f"{d}T{t}Z"
    eid="seed:"+hashlib.sha1(f'{h["Date"]}|{h["EndTime"]}|{h["White"]}|{h["Black"]}'.encode()).hexdigest()[:16]
    ext[i]=eid
    pl=a["plies"]; n=len(pl)
    evals=[]; pvs=[]
    for k,p in enumerate(pl):
        cp=p["before"]["cp"]; evals.append(cp if k%2==0 else -cp); pvs.append(p["before"]["pv"][:4])
    if n:
        last=pl[-1]; ac=last["after_cp"]; evals.append(ac if (n-1)%2==0 else -ac); pvs.append(last["reply_pv"][:4])
    else:
        evals.append(0); pvs.append([])
    r=h["Result"]; res="D" if r=="1/2-1/2" else ("W" if (r=="1-0")==white else "L")
    exporter=chess.pgn.StringExporter(headers=True,variations=False,comments=False)
    out.append(dict(ext_id=eid,source="seed",played_at=played,time_control=h["TimeControl"],color="w" if white else "b",result=res,
        termination=h["Termination"],my_elo=int(h["WhiteElo" if white else "BlackElo"]),opp_elo=int(h["BlackElo" if white else "WhiteElo"]),
        pgn=g.accept(exporter),analysis=dict(v=1,evals=evals,pv=pvs)))
P=json.load(open("./puzzles.json"))
pz=[]
for p in P:
    gi=int(p["id"][1:].split("-")[0]); k=int(p["id"].split("-")[1]); p=dict(p); p["game_ext_id"]=ext[gi]
    p["refutation"]=games[gi]["plies"][k]["reply_pv"][:3]; p["bestPv"]=[x for x in [p["best"],p.get("reply")] if x]; p.pop("checklist",None)
    if p["motif"]=="mate":
        import re
        if int(re.search(r"mate en (\d+)",p["explain"]).group(1))>3: p["motif"]="tactica"; p["prompt"]="Hay una táctica. Encuéntrala."; p["hint"]="Busca jaques y piezas rivales sin defender."
    pz.append(p)
json.dump(dict(games=out,puzzles=pz),open("../public/seed.json","w"),ensure_ascii=False,separators=(",",":"))
print(len(out),len(pz))
