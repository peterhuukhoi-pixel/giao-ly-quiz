#!/usr/bin/env python3
"""Refresh link metadata; do not republish copyrighted full articles."""
import json,re,datetime,html,urllib.request,urllib.parse,xml.etree.ElementTree as ET
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
OUT=BASE/'suy-niem-data.json'
UA={'User-Agent':'GiaoLyQuiz/0.9 (+GitHub Pages; metadata only)'}
def get(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=18) as r:return r.read(2500000)
def clean(t):
    t=re.sub(r'<[^>]+>',' ',t or '')
    return re.sub(r'\s+',' ',html.unescape(t)).strip()
def parse_feed(url):
    root=ET.fromstring(get(url));res=[]
    for it in root.findall('.//item')[:40]:
        title=clean(it.findtext('title'))
        link=(it.findtext('link') or '').strip()
        date=clean(it.findtext('pubDate'))
        desc=clean(it.findtext('description'))[:240]
        if link.startswith('https://'):
            res.append({'title':title,'url':link,'published':date,'excerpt':desc})
    return res

def main():
    data={'updated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'primary':None,'others':[]}
    # A feed might be disabled or change without notice; failures do not produce fabricated posts.
    feeds=[('Dòng Tên Việt Nam – Manna','https://dongten.net/feed/','dongten.net'),('Tổng Giáo phận Sài Gòn','https://tgpsaigon.net/rss','tgpsaigon.net')]
    for name,url,host in feeds:
        try:
            items=parse_feed(url)
            candidates=[x for x in items if urllib.parse.urlparse(x['url']).hostname in (host,'www.'+host) and ('manna' in x['title'].lower() or 'suy niệm' in x['title'].lower())]
            if name.startswith('Dòng Tên') and candidates:
                data['primary']={'source':name,**candidates[0]}
                data['others'] += [{'source':name,**x} for x in candidates[1:3]]
            else:data['others'] += [{'source':name,**x} for x in candidates[:3]]
            print(name,len(candidates),'matches')
        except Exception as exc:print('Source unavailable:',name,str(exc)[:180])
    OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
if __name__=='__main__':main()
