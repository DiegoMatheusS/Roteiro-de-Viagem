import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('README documenta o aplicativo sem números ou links de Pull Requests',()=>{
  const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
  assert.doesNotMatch(readme,/\bPR\s*#?\d+\b/i);
  assert.doesNotMatch(readme,/github\.com\/[^\s)]+\/pull\/\d+/i);
  assert.doesNotMatch(readme,/\bPull Requests?\s*#?\d+\b/i);
});
