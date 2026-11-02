// Bundles src/ into one self-contained file: lab-tracker.html
const fs = require('fs'), path = require('path');
const src = p => path.join(__dirname, 'src', p);
const js = fs.readdirSync(src('js')).filter(f => f.endsWith('.js')).sort()
  .map(f => `// ---- ${f}\n` + fs.readFileSync(src('js/' + f), 'utf8')).join('\n');
const html = fs.readFileSync(src('shell.html'), 'utf8')
  .replace('/*__CSS__*/', () => fs.readFileSync(src('style.css'), 'utf8'))
  .replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(path.join(__dirname, 'lab-tracker.html'), html);
console.log('Built lab-tracker.html', (html.length / 1024).toFixed(0) + ' KB');
