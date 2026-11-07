exec(open('base.py').read())
import json
RULE=json.load(open(os.environ.get('DC_RULE', '../frozen-rule.json')))
def couple_ledger(c, anchor, k, p, upto=8):
    S=0; Vprev=0; out=[]
    for w in range(anchor, upto+1):
        x=weekly_input(c,w)
        x=(x or 0)+bonus[(c,w)]
        S+=x; V=rnd(k*S**p) if S>0 else 0.0
        out.append((w,x,S,V,round(V-Vprev,2))); Vprev=V
    return out
def league_tables(p=None,kk=None):
    p=p or RULE['exponent_p']; res={}
    for l in LEAGUES:
        s=SET[l['id']]; N=l['roster_size']; k=kk or RULE['k_by_roster_size'][str(N)]
        wj,we,wb=s['judges_score_category_weight'],s['eliminations_category_weight'],s['bonus_picks_category_weight']
        rows=[]
        for mid,cs in ROSTER[l['id']].items():
            st=STORED[(l['id'],mid)]
            dc_old=sum(float(r['roster_points']) for r in st.values())
            cc=sum(float(r['prediction_points']) for r in st.values())
            gf=sum(float(r['grand_finale_points']) for r in st.values())
            tot_old=sum(float(r['total_points']) for r in st.values())
            recombined=sum(rnd(float(r['roster_points'])*wj+float(r['prediction_points'])*we+float(r['grand_finale_points'])*wb) for r in st.values())
            dc_new=0; weekly_new={}
            for w in PUB_WEEKS:
                inc=sum(dict((x[0],x[4]) for x in couple_ledger(c,s['judges_score_starts_week'],k,p)).get(w,0) for c in cs)
                weekly_new[w]=round(inc,2); dc_new+=inc
            tot_new=sum(rnd(weekly_new[w]*wj+float(st[w]['prediction_points'])*we+float(st[w]['grand_finale_points'])*wb) if w in st else rnd(weekly_new[w]*wj) for w in PUB_WEEKS)
            rows.append(dict(manager=mname(l['id'],mid),couples=[CN[c] for c in cs],dc_old=round(dc_old,2),dc_new=round(dc_new,2),cc=round(cc,2),gf=round(gf,2),tot_old=round(tot_old,2),recomb_ok=abs(recombined-tot_old)<0.011,tot_new=round(tot_new,2)))
        def rank(key):
            srt=sorted(rows,key=lambda r:-r[key]); 
            for r in rows: r[key+'_rank']=1+sum(1 for o in rows if o[key]>r[key])
        rank('tot_old'); rank('tot_new'); rank('dc_old'); rank('dc_new')
        res[l['name']]=dict(weights=(wj,we,wb),k=k,rows=sorted(rows,key=lambda r:r['tot_new_rank']))
    return res
