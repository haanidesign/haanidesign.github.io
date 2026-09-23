/* アイコンを Hugeicons から 取り直して icons.js を 作りなおす。

   つかいかた（このフォルダで）
     npm i --no-save @hugeicons/core-free-icons
     node build-icons.mjs

   どこから 取るか
     https://hugeicons.com の ただの ぶん（@hugeicons/core-free-icons / MIT）。
     npm から いちばん 新しいのを 取ってくるので、
     走らせ直す たびに 新しい 形に なる。

   なにを 変える とき
     ・絵文字を 足す / ちがう アイコンに する … icons.map.json を 直す
     ・線の 太さ                              … 下の STROKE を 直す
   そのあと この ファイルを 走らせる だけ。 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STROKE = '1.6';

const map = JSON.parse(fs.readFileSync(path.join(HERE, 'icons.map.json'), 'utf8'));
const pack = await import('@hugeicons/core-free-icons');

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

const icons = {};
const missing = [];
for (const [glyph, name] of Object.entries(map)) {
  if (glyph.startsWith('_')) continue;                 // おぼえ書きの 行
  const node = pack[name + 'Icon'] || pack[name];
  if (!node) { missing.push(glyph + ' → ' + name); continue; }
  icons[glyph] = node.map(([tag, attr]) => {
    const a = Object.entries(attr)
      .filter(([k]) => k !== 'key')
      .map(([k, v]) => `${kebab(k)}="${v}"`).join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
}
if (missing.length) console.warn('見つからない:', missing.join(', '));

const items = Object.entries(icons)
  .map(([g, b]) => `  '${g}': '${b.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
  .join(',\n');

const src = fs.readFileSync(path.join(HERE, 'icons.js'), 'utf8');
const head = src.split('const ICONS = {')[0];
const tail = src.split('\n};').slice(1).join('\n};');
fs.writeFileSync(path.join(HERE, 'icons.js'),
  head + 'const ICONS = {\n' + items + '\n};' + tail.replace(
    /stroke-width="[\d.]+"/, `stroke-width="${STROKE}"`));

console.log('できた:', Object.keys(icons).length, 'こ /', pack.default ? '' : '',
            'Hugeicons', JSON.parse(
              fs.readFileSync(path.join(HERE, 'node_modules/@hugeicons/core-free-icons/package.json'), 'utf8')
            ).version);
