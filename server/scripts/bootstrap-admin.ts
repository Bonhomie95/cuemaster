import "dotenv/config";
import { MongoClient } from "mongodb";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { passwordHash } from "../src/adminAuth";
const username=process.argv[2], email=process.argv[3];
if(!username || !/^[a-z0-9@._-]{3,120}$/.test(username))throw new Error("Usage: npm run admin:bootstrap -- username [proposed-email]");
const client=new MongoClient(process.env.MONGODB_URI||"mongodb://127.0.0.1:27028");await client.connect();
try {
 const admins=client.db(process.env.MONGODB_DB||"cuemaster").collection<any>("administrators");
 await admins.createIndex({username:1},{unique:true});
 if(await admins.findOne({role:"owner"}))throw new Error("An owner already exists. This command never replaces owner credentials.");
 const password=randomBytes(24).toString("base64url"),id=randomUUID();
 const dir=resolve("../.data/admin-bootstrap");await mkdir(dir,{recursive:true,mode:0o700});
 const file=resolve(dir,`${id}.txt`);
 await writeFile(file,`CueMaster local owner setup\nUsername: ${username}\nTemporary password: ${password}\nProposed email: ${email||"not set"}\nEmail ownership has NOT been verified; no email was sent.\nChange the temporary password on first login. This is not a player account.\n`,{mode:0o600,flag:"wx"});
 await admins.insertOne({_id:id,username,email:email||null,emailVerified:false,name:"Bonhomie",role:"owner",passwordHash:await passwordHash(password),mustChangePassword:true,createdAt:new Date()});
 console.log(`Owner created. Temporary credentials are stored locally at ${file}.`);
} finally {await client.close();}
