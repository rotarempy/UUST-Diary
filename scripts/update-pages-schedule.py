#!/usr/bin/env python3
"""Periodically mirror official UUST HTML via verified TLS for static GitHub Pages.

Only public schedule data is collected. Run with --batch 80 (default).
"""
import argparse
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SOURCE = 'https://isu.uust.ru/module/schedule/schedule_2024_script.php'
REFERER = 'https://isu.uust.ru/class_schedule/'
ROOT = Path(__file__).resolve().parents[1] / 'docs' / 'data' / 'schedule'

class Choices(HTMLParser):
    def __init__(self):
        super().__init__()
        self.select = None
        self.option = None
        self.weeks = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'select': self.select = attrs.get('id')
        elif tag == 'option' and self.select == 'week_choice': self.option = [attrs.get('value'), '']
    def handle_data(self, data):
        if self.option is not None: self.option[1] += data
    def handle_endtag(self, tag):
        if tag == 'option' and self.option is not None:
            value, label = self.option
            match = re.search(r'(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})', label)
            if match and value and value.isdigit():
                self.weeks.append((int(value), datetime.strptime(match[1], '%d.%m.%Y').date(), datetime.strptime(match[2], '%d.%m.%Y').date()))
            self.option = None
        elif tag == 'select': self.select = None

def request(fields):
    req = Request(SOURCE, data=urlencode(fields).encode('utf-8'), headers={'Referer':REFERER, 'Origin':'https://isu.uust.ru'})
    with urlopen(req, timeout=25) as response:
        data = response.read(8 * 1024 * 1024 + 1)
        if len(data)>8*1024*1024: raise ValueError('Ответ источника слишком большой')
        charset = response.headers.get_content_charset() or 'utf-8'
    html = data.decode(charset)
    if not html.strip(): raise ValueError('Пустой ответ')
    return html

def write(relative, body):
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding='utf-8')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch', type=int, default=80)
    args = parser.parse_args()
    if not 1<=args.batch<=1000: parser.error('--batch должен быть от 1 до 1000')
    ROOT.mkdir(parents=True,exist_ok=True)
    statefile=ROOT/'state.json'
    try: state=json.loads(statefile.read_text(encoding='utf-8'))
    except (FileNotFoundError,ValueError): state={}
    now=datetime.now(timezone(timedelta(hours=5))).date()
    # The group picker expects the original HTML containing link_group(ID, WEEK) buttons.
    html=request({'text_search_group':'','week':'7','funct':'filter_group'})
    ids=sorted(set(int(x) for x in re.findall(r'link_group\(\s*(\d+)\s*,\s*\d+\s*\)',html)))
    if not ids: raise RuntimeError('Источник не вернул список групп; старые данные сохранены')
    write('groups.html',html)
    # Fixed priority order so cursor never skips a group between runs.
    if 14380 in ids: ids.insert(0,ids.pop(ids.index(14380)))
    index=state.get('cursor',0)%len(ids)
    selected=[ids[(index+i)%len(ids)] for i in range(min(args.batch,len(ids)))]
    completed=0; failed=[]
    for gid in selected:
        try:
            choices=request({'group_id':str(gid),'week':'7','funct':'group_name'})
            parsed=Choices();parsed.feed(choices)
            relevant=[num for num,start,end in parsed.weeks if start<=now+timedelta(days=14) and end>=now-timedelta(days=7)]
            if not relevant: raise ValueError('Не найден календарь текущих недель')
            weekly=[]
            for num in sorted(set(relevant)):
                body=request({'group_id':str(gid),'week':str(num),'funct':'group','show_temp':'0'})
                if '<table' not in body.lower(): raise ValueError(f'Нет таблицы недели {num}')
                weekly.append((num,body))
            write(f'groups/{gid}.html', choices)
            for num,body in weekly: write(f'weeks/{gid}/{num}.html',body)
            completed+=1
        except Exception as exc:
            failed.append({'group':gid,'error':str(exc)[:180]})
            print(f'Warning group {gid}: {exc}',flush=True)
        time.sleep(0.15)
    state={'cursor':(index+len(selected))%len(ids),'groups':len(ids),'lastRun':datetime.now(timezone(timedelta(hours=5))).isoformat(),'completed':completed,'failures':failed[:30]}
    statefile.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Processed {completed}/{len(selected)} groups from {len(ids)}; next cursor {state["cursor"]}')
    if not completed: raise RuntimeError('Ни одна группа не обновлена; проверьте доступность источника и формат HTML')

if __name__=='__main__': main()
