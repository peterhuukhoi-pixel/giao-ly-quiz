#!/usr/bin/env python3
"""Collect brief RSS metadata only; never copy complete copyrighted articles."""
import json,re,datetime,html,urllib.request,urllib.parse,xml.etree.ElementTree as ET
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
OUT=BASE/'suy-niem-data.json'
UA={'User-Agent':'Mozilla/5.0 (compatible; GiaoLyQuiz/1.0; metadata-only)'}
SOURCES=[
 ('Tổng Giáo phận Sài Gòn','https://tgpsaigon.net/rss','tgpsaigon.net'),
 ('Tổng Giáo phận Sài Gòn','https://tgpsaigon.net/feed','tgpsaigon.net'),
 ('Dòng Tên Việt Nam – Manna','https://dongten.net/feed/','dongten.net'),
]
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=18) as r:return r.read(2500000)
def clean(s):
 return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',s or ''))).strip()
def parse_feed(url):
 root=ET.fromstring(get(url));items=[]
 for it in root.findall('.//item')[:70]:
  link=(it.findtext('link') or '').strip()
  if link.startswith('https://'):
   items.append(dict(title=clean(it.findtext('title')),url=link,published=clean(it.findtext('pubDate')),excerpt=clean(it.findtext('description'))[:240]))
 return items
def matches(item,host):
 hostname=urllib.parse.urlparse(item['url']).hostname
 if hostname not in (host,'www.'+host):return False
 t=(item['title']+' '+urllib.parse.urlparse(item['url']).path).lower()
 return any(x in t for x in ('suy-niem','suy-niệm','suy niệm','loi-chua','lời chúa','tin-mung','tin mừng','manna'))
def main():
 now=datetime.datetime.now(datetime.timezone.utc).isoformat()
 data={'updated_at':now,'primary':None,'others':[],'status':'no_verified_primary'}
 seen=set();groups={}
 for name,url,host in SOURCES:
  try:
   found=[dict(source=name,**x) for x in parse_feed(url) if matches(x,host)]
   groups.setdefault(name,[]).extend(found)
   print(name,url,len(found),'matching articles')
  except Exception as exc:print('Feed unavailable:',url,str(exc)[:160])
 for name in ('Tổng Giáo phận Sài Gòn','Dòng Tên Việt Nam – Manna'):
  for item in groups.get(name,[]):
   if item['url'] in seen:continue
   seen.add(item['url'])
   if data['primary'] is None:
    data['primary']=item
    data['status']='latest_article_unverified_liturgical_date'
   elif len(data['others'])<8:data['others'].append(item)
 # Preserve a previous valid article if feeds are temporarily inaccessible.
 if data['primary'] is None and OUT.exists():
  try:
   previous=json.loads(OUT.read_text(encoding='utf8'))
   old=previous.get('primary')
   if isinstance(old,dict) and old.get('url','').startswith('https://'):
    data['primary']=old;data['status']='cached_article_unverified_liturgical_date'
  except (OSError,ValueError,TypeError):pass
 OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
if __name__=='__main__':main()
