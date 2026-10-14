/* Parses supplied official UUST HTML responses without running scripts. */
(function(root) {
  'use strict';
  const documentFrom = html => new DOMParser().parseFromString(String(html), 'text/html');
  function isoDate(value) {
    const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!match) throw new Error('Не найдена дата расписания');
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(iso+'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== iso) throw new Error('Неверная дата расписания');
    return iso;
  }
  function parseGroups(html) {
    const doc = documentFrom(html), groups = new Map();
    for (const button of doc.querySelectorAll('button[onclick]')) {
      const match = button.getAttribute('onclick').match(/^\s*link_group\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*;?\s*$/);
      const name = button.textContent.trim();
      if (match && name) groups.set(Number(match[1]), { id:Number(match[1]), name });
    }
    if (!groups.size) throw new Error('В ответе нет списка групп');
    return [...groups.values()];
  }
  function parseChoices(html) {
    const doc = documentFrom(html);
    const selected = doc.querySelector('#group_choice option[selected][value]:not([value="0"])');
    const weeks = [...doc.querySelectorAll('#week_choice option[value]:not([value="0"])')].map(option => {
      const match = option.textContent.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
      if (!match) throw new Error('Неверный формат календаря недель');
      return { number:Number(option.value), start:isoDate(match[1]), end:isoDate(match[2]) };
    });
    if (!weeks.length || weeks.some(w=>!Number.isInteger(w.number)||w.number<1)) throw new Error('Нет календаря учебных недель');
    return { group: selected ? { id:Number(selected.value), name:selected.textContent.trim().replace(/\(\d+\)$/, '') } : null,
      selectedWeek:Number(doc.querySelector('#week_choice option[selected]:not([value="0"])')?.value)||null, weeks };
  }
  function decodeLiteral(literal) {
    // Only a string literal is accepted. No eval/Function or script execution.
    const quote = literal[0];
    if (!['\'', '"'].includes(quote) || literal.at(-1)!==quote) throw new Error('Неверная строка пары');
    let output='';
    const simple = { n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0' };
    for(let i=1;i<literal.length-1;i++) {
      let char=literal[i];
      if(char!=='\\') { output+=char; continue; }
      char=literal[++i];
      if(char==='u'||char==='x') {
        const length=char==='u'?4:2, hex=literal.slice(i+1,i+1+length);
        if(!new RegExp(`^[0-9a-f]{${length}}$`,'i').test(hex)) throw new Error('Неверное экранирование строки');
        output+=String.fromCharCode(parseInt(hex,16)); i+=length;
      } else if(char==='\n') { /* JS line continuation */ }
      else if(char==='\r') { if(literal[i+1]==='\n')i++; }
      else output+=Object.hasOwn(simple,char)?simple[char]:char;
    }
    return output;
  }
  function splitTitle(label) {
    if(!label.endsWith(')'))return { title:label, type:null };
    let depth=0;
    for(let i=label.length-1;i>=0;i--) {
      if(label[i]===')')depth++;
      if(label[i]==='(' && --depth===0) return { title:label.slice(0,i).trim(), type:label.slice(i+1,-1).trim() };
    }
    return { title:label,type:null };
  }
  function parseSchedule(html, groupId) {
    if(!Number.isSafeInteger(groupId)||groupId<1)throw new Error('Неверный ID группы');
    const doc=documentFrom(html), headers=[...doc.querySelectorAll('table thead th')];
    const dates=headers.map(th=>th.textContent).filter(text=>/\d{2}\.\d{2}\.\d{4}/.test(text)).map(isoDate);
    if(!dates.length)throw new Error('В ответе нет дат недели');
    const slots=new Map(), result=[];
    for(const cell of doc.querySelectorAll('td[id]')) {
      const match=cell.id.match(/^(\d+)_(\d+)_group$/);
      if(!match)continue;
      const row=cell.closest('tr'), time=row?.children[1]?.textContent.trim().match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
      const pair=Number(match[1]), weekday=Number(match[2]);
      if(!time||!dates[weekday-1])throw new Error('Неизвестная ячейка расписания');
      slots.set(cell.id,{date:dates[weekday-1],weekday,pair,timeStart:time[1],timeEnd:time[2]});
    }
    function add(cellId, fragment) {
      const slot=slots.get(cellId); if(!slot)throw new Error('Пара указывает на неизвестную ячейку');
      const part=documentFrom(fragment);
      for(const container of part.body.children) {
        const teacher=[...container.querySelectorAll('button[onclick]')].find(b=>/^\s*link_teacher\(/.test(b.getAttribute('onclick')));
        const location=[...container.querySelectorAll('button[onclick]')].find(b=>/^\s*link_class\(/.test(b.getAttribute('onclick')));
        const clean=container.cloneNode(true); clean.querySelectorAll('button,script,style').forEach(n=>n.remove());
        const label=clean.textContent.trim(); if(!label)continue;
        const parsed=splitTitle(label); if(!parsed.title)throw new Error('Нет названия предмета');
        const sourceId=`${slot.pair}:${encodeURIComponent(parsed.title)}:${encodeURIComponent(parsed.type||'')}`;
        let occurrenceId=`uust-official:${groupId}:${slot.date}:${sourceId}`;
        const duplicate=result.filter(l=>l.occurrenceId===occurrenceId||l.occurrenceId.startsWith(occurrenceId+':variant:')).length;
        if(duplicate)occurrenceId+=`:variant:${duplicate+1}`;
        result.push({sourceId,groupId,...parsed,date:slot.date,weekday:slot.weekday,numbers:[slot.pair],timeStart:slot.timeStart,timeEnd:slot.timeEnd,
          teacher:teacher?.textContent.trim()||null,location:location?.textContent.trim()||null,comment:null,occurrenceId});
      }
    }
    // The source returns literal jQuery append statements after the table.
    const expression=/\$\(\s*(['"])(\d+_\d+_group|#\d+_\d+_group)\1\s*\)\s*\.append\(\s*('(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*")\s*\)/g;
    let matched=0;
    for(const script of doc.querySelectorAll('script')) {
      for(const match of script.textContent.matchAll(expression)) { matched++; add(match[2].replace(/^#/,''),decodeLiteral(match[3])); }
      if((script.textContent.match(/\.append\s*\(/g)||[]).length !== [...script.textContent.matchAll(expression)].length) throw new Error('Неизвестный формат добавления пары');
    }
    // Also support HTML where the cells have already been filled by the server.
    for(const cell of doc.querySelectorAll('td[id]'))if(slots.has(cell.id)&&cell.textContent.trim())add(cell.id,cell.innerHTML);
    const timeSlots=[...new Map([...slots.values()].map(s=>[s.pair,{number:s.pair,timeStart:s.timeStart,timeEnd:s.timeEnd}])).values()];
    return { dates, slots:timeSlots, lessons:result.sort((a,b)=>a.date.localeCompare(b.date)||a.timeStart.localeCompare(b.timeStart)), appendCount:matched };
  }
  root.UustOfficialParser=Object.freeze({parseGroups,parseChoices,parseSchedule});
})(globalThis);
