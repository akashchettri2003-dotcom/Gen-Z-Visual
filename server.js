require("dotenv").config();
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET;
const IS_PROD = process.env.NODE_ENV === "production";

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn("WARNING: JWT_SECRET is missing/too short. Set a random secret of at least 32 characters.");
}

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));

function signToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}
function setAuthCookie(res, token) {
  res.cookie("gv_session", token, { httpOnly: true, secure: IS_PROD, sameSite: "lax", maxAge: 7*24*60*60*1000, path: "/" });
}
async function auth(req,res,next) {
  try {
    const token=req.cookies.gv_session;
    if(!token) return res.status(401).json({error:"Please sign in."});
    const payload=jwt.verify(token,JWT_SECRET);
    const user=await prisma.user.findUnique({where:{id:payload.sub}});
    if(!user) return res.status(401).json({error:"Session expired."});
    req.user=user; next();
  } catch { return res.status(401).json({error:"Please sign in again."}); }
}
function creator(req,res,next){ if(!["CREATOR","ADMIN"].includes(req.user.role)) return res.status(403).json({error:"Creator access required."}); next(); }
function slugify(s){return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)+"-"+crypto.randomBytes(3).toString("hex");}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"gen-visual",time:new Date().toISOString()}));

app.post("/api/auth/register", async (req,res)=>{
  try{
    const {email,password,displayName,creator}=req.body;
    if(!email||!password||!displayName) return res.status(400).json({error:"Name, email and password are required."});
    if(password.length<8) return res.status(400).json({error:"Password must be at least 8 characters."});
    const normalized=email.trim().toLowerCase();
    if(await prisma.user.findUnique({where:{email:normalized}})) return res.status(409).json({error:"Email already registered."});
    const passwordHash=await bcrypt.hash(password,12);
    const user=await prisma.user.create({data:{email:normalized,displayName:displayName.trim().slice(0,80),passwordHash,role:creator?"CREATOR":"READER"}});
    setAuthCookie(res,signToken(user));
    res.status(201).json({user:{id:user.id,email:user.email,displayName:user.displayName,role:user.role}});
  }catch(e){console.error(e);res.status(500).json({error:"Could not create account."});}
});

app.post("/api/auth/login",async(req,res)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
    const user=await prisma.user.findUnique({where:{email}});
    if(!user||!(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({error:"Invalid email or password."});
    setAuthCookie(res,signToken(user)); res.json({user:{id:user.id,email:user.email,displayName:user.displayName,role:user.role}});
  }catch(e){res.status(500).json({error:"Login failed."});}
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("gv_session",{path:"/"});res.json({ok:true})});
app.get("/api/auth/me",async(req,res)=>{
  try{const token=req.cookies.gv_session;if(!token)return res.status(401).json({error:"Not signed in"});const p=jwt.verify(token,JWT_SECRET);const u=await prisma.user.findUnique({where:{id:p.sub}});if(!u)return res.status(401).json({error:"Not signed in"});res.json({user:{id:u.id,email:u.email,displayName:u.displayName,role:u.role}})}catch{res.status(401).json({error:"Not signed in"});}
});

app.get("/api/stories",async(req,res)=>{
  const type=req.query.type?.toUpperCase();
  const where={status:"PUBLISHED",...(type==="NOVEL"||type==="COMIC"?{type}: {})};
  const stories=await prisma.story.findMany({where,include:{creator:{select:{displayName:true}},chapters:{select:{id:true,number:true,title:true,isFree:true},orderBy:{number:"asc"}}},orderBy:{createdAt:"desc"}});
  res.json({stories});
});

app.post("/api/stories",auth,creator,async(req,res)=>{
  try{
    const {title,description,type,priceRupees,coverUrl}=req.body;
    if(!title||!description||!["NOVEL","COMIC"].includes(type))return res.status(400).json({error:"Title, description and valid type are required."});
    const pricePaise=Math.round(Number(priceRupees||0)*100);
    if(!Number.isInteger(pricePaise)||pricePaise<0||pricePaise>10000000)return res.status(400).json({error:"Invalid price."});
    const story=await prisma.story.create({data:{title:title.trim().slice(0,160),slug:slugify(title),description:description.trim().slice(0,2000),type,pricePaise,coverUrl:coverUrl?.trim()||null,creatorId:req.user.id,status:"DRAFT"}});
    res.status(201).json({story});
  }catch(e){console.error(e);res.status(500).json({error:"Could not create story."});}
});

app.post("/api/stories/:id/publish",auth,creator,async(req,res)=>{
  const story=await prisma.story.findUnique({where:{id:req.params.id}});
  if(!story||story.creatorId!==req.user.id)return res.status(404).json({error:"Story not found."});
  const updated=await prisma.story.update({where:{id:story.id},data:{status:"PUBLISHED"}});
  res.json({story:updated});
});

app.post("/api/stories/:id/chapters",auth,creator,async(req,res)=>{
  try{
    const story=await prisma.story.findUnique({where:{id:req.params.id}});
    if(!story||story.creatorId!==req.user.id)return res.status(404).json({error:"Story not found."});
    const {number,title,content,isFree}=req.body;
    if(!Number.isInteger(Number(number))||Number(number)<1||!title||!content)return res.status(400).json({error:"Chapter number, title and content are required."});
    const chapter=await prisma.chapter.create({data:{storyId:story.id,number:Number(number),title:title.trim(),content,isFree:Boolean(isFree)}});
    res.status(201).json({chapter});
  }catch(e){res.status(400).json({error:"Could not save chapter. Chapter numbers must be unique per story."});}
});

async function hasAccess(userId,story){
  if(!story||story.pricePaise===0)return true;
  if(!userId)return false;
  const p=await prisma.purchase.findUnique({where:{userId_storyId:{userId,storyId:story.id}}});
  return p?.status==="PAID";
}
app.get("/api/stories/:slug",async(req,res)=>{
  const story=await prisma.story.findUnique({where:{slug:req.params.slug},include:{creator:{select:{displayName:true}},chapters:{orderBy:{number:"asc"}}}});
  if(!story||story.status!=="PUBLISHED")return res.status(404).json({error:"Story not found."});
  let userId=null;try{const t=req.cookies.gv_session;if(t)userId=jwt.verify(t,JWT_SECRET).sub}catch{}
  const access=await hasAccess(userId,story);
  const chapters=story.chapters.map(c=>({id:c.id,number:c.number,title:c.title,isFree:c.isFree,content:(c.isFree||access)?c.content:null}));
  res.json({story:{...story,priceRupees:story.pricePaise/100,chapters}});
});

function razorpay(){
  if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET) throw new Error("Razorpay is not configured.");
  return new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
}
app.post("/api/payments/order",auth,async(req,res)=>{
  try{
    const story=await prisma.story.findUnique({where:{id:req.body.storyId}});
    if(!story||story.status!=="PUBLISHED")return res.status(404).json({error:"Story not found."});
    if(story.pricePaise<=0)return res.status(400).json({error:"This story is free."});
    const existing=await prisma.purchase.findUnique({where:{userId_storyId:{userId:req.user.id,storyId:story.id}}});
    if(existing?.status==="PAID")return res.json({alreadyPaid:true});
    const rp=razorpay();
    const order=await rp.orders.create({amount:story.pricePaise,currency:"INR",receipt:`gv_${story.id.slice(0,10)}_${Date.now()}`});
    await prisma.purchase.upsert({where:{userId_storyId:{userId:req.user.id,storyId:story.id}},update:{amountPaise:story.pricePaise,razorpayOrderId:order.id,status:"CREATED"},create:{userId:req.user.id,storyId:story.id,amountPaise:story.pricePaise,razorpayOrderId:order.id,status:"CREATED"}});
    res.json({keyId:process.env.RAZORPAY_KEY_ID,orderId:order.id,amount:order.amount,currency:order.currency,storyId:story.id});
  }catch(e){console.error(e);res.status(503).json({error:"Payments are not configured yet. Add Razorpay keys in Render Environment."});}
});

app.post("/api/payments/verify",auth,async(req,res)=>{
  try{
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature,storyId}=req.body;
    const purchase=await prisma.purchase.findUnique({where:{userId_storyId:{userId:req.user.id,storyId}});
    if(!purchase||purchase.razorpayOrderId!==razorpay_order_id)return res.status(400).json({error:"Order mismatch."});
    const expected=crypto.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if(expected!==razorpay_signature)return res.status(400).json({error:"Payment signature verification failed."});
    await prisma.purchase.update({where:{id:purchase.id},data:{razorpayPaymentId:razorpay_payment_id,status:"PAID"}});
    res.json({ok:true});
  }catch(e){console.error(e);res.status(500).json({error:"Could not verify payment."});}
});

app.use(express.static(path.join(__dirname,"public")));
app.use((req,res,next)=>req.path.startsWith("/api/")?res.status(404).json({error:"API route not found"}):res.sendFile(path.join(__dirname,"public","index.html")));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Unexpected server error."})});

app.listen(PORT,()=>console.log(`Gen-visual running on port ${PORT}`));
