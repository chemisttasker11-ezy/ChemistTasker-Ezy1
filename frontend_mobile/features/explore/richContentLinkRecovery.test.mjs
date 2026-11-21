import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./RichContent.tsx',import.meta.url),'utf8');
test('rich article links use the existing safe allowlist and never swallow failures',()=>{
 assert.match(source,/const link = safePublicUrl\(href\)/);
 assert.match(source,/onPress=\{link \? \(\) => openArticleLink\(link\)/);
 assert.match(source,/Alert\.alert\(/);
 assert.match(source,/Link unavailable/);
 assert.match(source,/Try again', onPress: \(\) => openArticleLink\(url\)/);
 assert.doesNotMatch(source,/Linking\.openURL\(link\)\.catch\(\(\) => \{\}\)/);
});
