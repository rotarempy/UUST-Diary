// GFM + safe HTML tags. Preserve prose whitespace without executing pasted HTML.
const markdownParser = new marked.Marked({ gfm: true, breaks: false });
markdownParser.use({ renderer: {
  space(token) {
    const lines = (token.raw.match(/\n/g) || []).length;
    return lines > 1 ? `<div class="md-gap" style="height:${lines - 1}lh" aria-hidden="true"></div>` : '';
  }
} });
function renderMarkdown(source) {
  const text = String(source || '').replace(/\r\n?/g, '\n');
  const template = document.createElement('template');
  template.innerHTML = markdownParser.parse(text);
  const allowed = new Set('P BR HR H1 H2 H3 H4 H5 H6 STRONG EM B I U S DEL MARK SMALL SPAN DIV BLOCKQUOTE PRE CODE UL OL LI TABLE THEAD TBODY TR TH TD A IMG INPUT DETAILS SUMMARY SUP SUB KBD'.split(' '));
  const unsafe = new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH FORM BUTTON TEXTAREA SELECT META LINK BASE'.split(' '));
  function safeUrl(value, image = false) {
    try {
      const url = new URL(value, location.href);
      return ['https:', 'http:'].includes(url.protocol) || (!image && ['mailto:', 'tel:'].includes(url.protocol)) || (image && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(value));
    } catch (_) { return false; }
  }
  function clean(parent) {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.COMMENT_NODE) { node.remove(); continue; }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (unsafe.has(node.tagName)) { node.remove(); continue; }
      clean(node);
      if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); continue; }
      const gap = node.tagName === 'DIV' && node.className === 'md-gap' && /^height:\d+lh$/.test(node.getAttribute('style') || '');
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const keep = ['title', 'alt'].includes(name)
          || (name === 'href' && node.tagName === 'A' && safeUrl(attr.value))
          || (name === 'src' && node.tagName === 'IMG' && safeUrl(attr.value, true))
          || (name === 'start' && node.tagName === 'OL' && /^\d+$/.test(attr.value))
          || (['colspan', 'rowspan'].includes(name) && ['TH', 'TD'].includes(node.tagName) && /^\d{1,2}$/.test(attr.value))
          || (node.tagName === 'INPUT' && ['type', 'checked', 'disabled'].includes(name))
          || (gap && ['class', 'style', 'aria-hidden'].includes(name));
        if (!keep) node.removeAttribute(attr.name);
      }
      if (node.tagName === 'INPUT') {
        if (node.getAttribute('type') !== 'checkbox') { node.remove(); continue; }
        node.disabled = true;
      }
      if (node.tagName === 'A') { node.target = '_blank'; node.rel = 'noopener noreferrer'; }
      // Formatting newlines emitted by the parser must not become extra visible lines.
      if (['UL','OL','TABLE','THEAD','TBODY','TR'].includes(node.tagName)) {
        for (const child of Array.from(node.childNodes)) if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) child.remove();
      }
    }
  }
  clean(template.content);
  for (const child of Array.from(template.content.childNodes)) if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) child.remove();
  const leading = (text.match(/^\n+/) || [''])[0].length;
  const trailing = (text.match(/\n+$/) || [''])[0].length;
  // Paragraph lexing trims edge line feeds; keep them explicitly.
  if (leading && text.trim()) {
    const first = template.content.firstElementChild;
    if (first?.classList.contains('md-gap')) first.remove();
    template.content.prepend(gapElement(leading));
  }
  if (trailing && text.trim()) {
    const last = template.content.lastElementChild;
    if (last?.classList.contains('md-gap')) last.remove();
    template.content.append(gapElement(trailing));
  }
  if (!text.trim() && text) template.content.append(gapElement(Math.max(1, text.split('\n').length)));
  return template.innerHTML;
}
function gapElement(lines) {
  const gap = document.createElement('div');
  gap.className = 'md-gap'; gap.style.height = `${lines}lh`; gap.setAttribute('aria-hidden', 'true');
  return gap;
}
