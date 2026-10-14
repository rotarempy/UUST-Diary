const SOURCE='https://isu.uust.ru/module/schedule/schedule_2024_script.php';
function validateForm(body){
 if(typeof body!=='string'||Buffer.byteLength(body)>4096)throw new Error('Неверный запрос расписания');
 const params=new URLSearchParams(body),fields=Object.fromEntries(params);
 const required={filter_group:['funct','text_search_group','week'],group_name:['funct','group_id','week'],group:['funct','group_id','show_temp','week']};
 const keys=required[fields.funct];
 if(!keys||[...params].length!==keys.length||Object.keys(fields).sort().join(',')!==keys.join(','))throw new Error('Неизвестные параметры расписания');
 if(!/^\d+$/.test(fields.week)||Number(fields.week)<1||Number(fields.week)>60)throw new Error('Неверная неделя');
 if('group_id' in fields&&(!/^\d+$/.test(fields.group_id)||!Number.isSafeInteger(Number(fields.group_id))||Number(fields.group_id)<1))throw new Error('Неверная группа');
 if(fields.funct==='group'&&fields.show_temp!=='0')throw new Error('Неверный режим');
 return params.toString();
}
module.exports={SOURCE,validateForm};
