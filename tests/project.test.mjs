import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAmounts,projectDetails} from '../dist/project.mjs';
test('unknown amounts and VAT remain unknown; zero is explicit',()=>{
 assert.deepEqual(projectAmounts('100',''),{vat:null,total:null});
 assert.deepEqual(projectAmounts('','15'),{vat:null,total:null});
 assert.deepEqual(projectAmounts('100','0'),{vat:0,total:100});
 assert.deepEqual(projectAmounts('0','15'),{vat:0,total:0});
});
test('money rounds to currency minor units and invalid inputs are rejected',()=>{
 assert.deepEqual(projectAmounts('123.45','15'),{vat:18.52,total:141.97});
 for(const args of [[-1,15],[100,101],[Infinity,15]])assert.deepEqual(projectAmounts(...args),{vat:null,total:null});
});
test('legacy projects retain scope and task data without mutation',()=>{
 const p={name:'Existing',description:'Original scope',tasks:[{id:'task'}]},before=structuredClone(p);
 assert.equal(projectDetails(p).scope,'Original scope');
 assert.equal(projectDetails(p).vatRate,null);
 assert.deepEqual(p,before);
});
