import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertProductionConfig} from '../src/config';
test('production rejects local defaults, unauthenticated databases, insecure TLS and wildcard proxy trust',()=>{
 assert.doesNotThrow(()=>assertProductionConfig({NODE_ENV:'development'}));
 assert.throws(()=>assertProductionConfig({NODE_ENV:'production'}));
 const env={NODE_ENV:'production',MONGODB_URI:'mongodb+srv://user:example@db.example.invalid',MONGODB_DB:'cuemaster',CORS_ORIGINS:'https://app.example.invalid'};
 assert.doesNotThrow(()=>assertProductionConfig(env));
 for(const uri of ['mongodb://localhost:27017','mongodb://user:pass@db.example.invalid','mongodb+srv://user:pass@db.example.invalid/?tls=false','mongodb+srv://user:pass@db.example.invalid/?tlsAllowInvalidCertificates=true'])assert.throws(()=>assertProductionConfig({...env,MONGODB_URI:uri}));
 assert.throws(()=>assertProductionConfig({...env,TRUST_PROXY:'true'}));
 assert.throws(()=>assertProductionConfig({...env,CORS_ORIGINS:'*'}));
});
