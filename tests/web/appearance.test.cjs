const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const docs=path.join(__dirname,'../../docs');
function setup(saved){
 const dom=new JSDOM(fs.readFileSync(path.join(docs,'index.html'),'utf8'),{url:'http://localhost',runScripts:'outside-only'});
 if(saved)dom.window.localStorage.setItem('lecture_app_appearance_v1',JSON.stringify(saved));
 dom.window.eval(fs.readFileSync(path.join(docs,'js/settings.js'),'utf8')+';window.testThemes=THEMES;');return dom;
}
function lum(hex){const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){let x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('six themes: light/dark palettes, readable text, saved state',()=>{
 const dom=setup(),w=dom.window,d=w.document,themes=w.testThemes;assert.equal(d.querySelectorAll('[data-theme-choice]').length,6);assert.ok(themes.uunit);
 for(const theme of Object.keys(themes))for(const mode of ['light','dark']){
  w.applyAppearance({theme,mode,scale:110});
  assert.equal(d.documentElement.dataset.theme,theme);assert.equal(d.documentElement.dataset.appearance,mode);assert.equal(d.querySelector('[data-theme-choice][aria-pressed="true"]').dataset.themeChoice,theme);
  for (const card of d.querySelectorAll('[data-theme-choice]')) {
    const preview=card.querySelector('.theme-preview');
    assert.equal(preview.style.getPropertyValue('--preview-bg'),themes[card.dataset.themeChoice][mode][0]);
    assert.equal(preview.style.getPropertyValue('--preview-accent'),themes[card.dataset.themeChoice][mode][6]);
  }
  assert.equal(d.querySelector('[data-appearance-mode="'+mode+'"]').getAttribute('aria-pressed'),'true');
  const c=themes[theme][mode];assert.equal(d.documentElement.style.getPropertyValue('--surface'),c[1]);
  assert.ok(mode==='light'?lum(c[0])>.75:lum(c[0])<.04,theme+' '+mode);
  for(const fg of [c[4],c[5],c[6]])for(const bg of [c[0],c[1]])assert.ok(contrast(fg,bg)>=4.5,theme+' '+mode+' '+fg+' '+bg);
  assert.deepEqual(JSON.parse(w.localStorage.getItem('lecture_app_appearance_v1')),{theme,mode,scale:110});
 }dom.window.close();
});
test('old settings migrate; explicit new mode and scale survive',()=>{
 for(const [old,theme,mode] of [['light','neutral','light'],['gray','neutral','dark'],['uunit','uunit','light'],['uunit-dark','uunit','dark'],['coffee','coffee','dark'],['paper','paper','light']]){
  const dom=setup({theme:old,scale:115});assert.equal(dom.window.document.documentElement.dataset.theme,theme);assert.equal(dom.window.document.documentElement.dataset.appearance,mode);assert.equal(dom.window.document.querySelector('#scaleRange').value,'115');dom.window.close();
 }const dom=setup({theme:'uunit',mode:'dark',scale:90});assert.equal(dom.window.document.documentElement.dataset.appearance,'dark');dom.window.close();
});

test('fresh install defaults to light UUNIT with reference violet',()=>{
 const dom=setup(),d=dom.window.document;
 assert.equal(d.documentElement.dataset.theme,'uunit');
 assert.equal(d.documentElement.dataset.appearance,'light');
 assert.equal(d.documentElement.style.getPropertyValue('--accent'),'#4e48e7');
 dom.window.close();
});
