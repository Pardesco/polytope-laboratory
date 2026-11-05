const test=require('node:test'),assert=require('node:assert/strict');
const {profileVersions}=require('../scripts/model-view-profile-versions.cjs');

test('historical profile commands keep their original version pair',()=>assert.deepEqual(profileVersions(),['0.27.19','0.27.20']));
test('later comparisons explicitly bind baseline and candidate versions',()=>assert.deepEqual(profileVersions(['--baseline-version=0.27.20','--candidate-version=0.27.21']),['0.27.20','0.27.21']));
for(const options of [
  ['--candidate-version=0.27.19'],
  ['--baseline-version=0.27.20','--candidate-version=0.27.20'],
  ['--candidate-version=../old'],
  ['--candidate-version=0.27.21','--candidate-version=0.27.22'],
  ['--unexpected=0.27.21'],
])test('invalid profile version selection is refused: '+options.join(' '),()=>assert.throws(()=>profileVersions(options)));
