const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateForm,SOURCE}=require('../../desktop/schedule.cjs');
test('native API only accepts exact public schedule forms',()=>{
 for(const body of ['group_id=14380&week=7&funct=group&show_temp=0','group_id=14380&week=7&funct=group_name','text_search_group=&week=7&funct=filter_group'])assert.equal(validateForm(body),body);
 for(const body of ['url=https://example.com','group_id=1&week=7&funct=group&show_temp=0&url=x','group_id=1&week=7&week=8&funct=group_name','group_id=-1&week=7&funct=group_name','group_id=1&week=61&funct=group_name'])assert.throws(()=>validateForm(body));
 assert.equal(new URL(SOURCE).hostname,'isu.uust.ru');
});
test('packaged UI includes platform bridge before schedule config; web source stays independent',()=>{
 const built=fs.readFileSync(path.join(__dirname,'../../www/index.html'),'utf8');
 assert.ok(built.indexOf('js/platform.js')<built.indexOf('js/schedule-config.js'));
 const source=fs.readFileSync(path.join(__dirname,'../../docs/index.html'),'utf8');assert.equal(source.includes('js/platform.js'),false);
 assert.ok(fs.statSync(path.join(__dirname,'../../www/js/platform.js')).size>0);
});
