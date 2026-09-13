let currentUser=null,currentStory=null,authMode="login";
const $=id=>document.getElementById(id);
function show(id){$(id).classList.remove("hide")}function hide(id){$(id).classList.add("hide")}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>hide(b.closest(".modal").id));
function msg(id,text,error=false){$(id).textContent=text;$(id).className=error?"err":""}
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Request failed");return d}
async function loadStories(type=""){
 const q=type?`?type=${type}`:"";const d=await api("/api/stories"+q);const el=$("stories");
 el.innerHTML=d.stories.length?d.stories.map(s=>`<article class="card"><div class="cover ${s.type.toLowerCase()}">${s.coverUrl?`<img src="${esc(s.coverUrl)}" alt="">`:""}<span>${s.type}</span><strong>${esc(s.title)}</strong></div><div class="body"><span class="tag">${s.creator.displayName}</span><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p><div class="row"><b>${s.pricePaise?"₹"+(s.pricePaise/100):"Free"}</b><button class="small" onclick="openStory('${s.slug}')">Read</button></div></div></article>`).join(""):"<p>No published stories yet. Create the first one.</p>";
}
async function openStory(slug){
 const d=await api("/api/stories/"+slug);currentStory=d.story;show("reader");$("rType").textContent=currentStory.type+" • "+(currentStory.priceRupees?"PAID STORY":"FREE");$("rTitle").textContent=currentStory.title;$("rDesc").textContent=currentStory.description;
 $("chapters").innerHTML=currentStory.chapters.map(c=>`<div class="chapter ${c.content===null?"locked":""}"><b>Chapter ${c.number}: ${esc(c.title)}</b>${c.content===null?"<p>🔒 Purchase the story to read this chapter.</p>":`<p>${esc(c.content)}</p>`}</div>`).join("")||"<p>No chapters published yet.</p>";
 $("buyBtn").style.display=currentStory.priceRupees&&!currentStory.chapters.every(c=>c.content!==null)?"inline-flex":"none";$("buyBtn").textContent=`Buy full story — ₹${currentStory.priceRupees}`;
 $("buyBtn").onclick=buyStory;
}
async function buyStory(){
 if(!currentUser){hide("reader");show("auth");return}
 try{
  const d=await api("/api/payments/order",{method:"POST",body:JSON.stringify({storyId:currentStory.id})});
  if(d.alreadyPaid){openStory(currentStory.slug);return}
  const options={key:d.keyId,amount:d.amount,currency:d.currency,name:"Gen-visual",description:currentStory.title,order_id:d.orderId,handler:async response=>{
   try{await api("/api/payments/verify",{method:"POST",body:JSON.stringify({...response,storyId:currentStory.id})});alert("Payment verified. Your story is unlocked.");openStory(currentStory.slug)}catch(e){alert(e.message)}
  },theme:{color:"#b9ff3c"}};
  if(!window.Razorpay)throw new Error("Payment checkout could not load.");
  new Razorpay(options).open();
 }catch(e){alert(e.message)}
}
$("accountBtn").onclick=()=>{if(currentUser){if(confirm(`Signed in as ${currentUser.displayName}. Sign out?`))api("/api/auth/logout",{method:"POST"}).then(()=>{currentUser=null;updateAccount()})}else show("auth")};
function updateAccount(){$("accountBtn").textContent=currentUser?currentUser.displayName:"Sign in"}
$("loginTab").onclick=()=>setAuthMode("login");$("registerTab").onclick=()=>setAuthMode("register");
function setAuthMode(m){authMode=m;$("loginTab").classList.toggle("active",m==="login");$("registerTab").classList.toggle("active",m==="register");document.querySelectorAll(".registerOnly").forEach(x=>x.style.display=m==="register"?"":"none");$("authSubmit").textContent=m==="register"?"Create account":"Sign in";msg("authMsg","")}
$("authForm").onsubmit=async e=>{e.preventDefault();try{const body={email:$("email").value,password:$("password").value};if(authMode==="register"){body.displayName=$("name").value;body.creator=$("creatorRole").checked}const d=await api(authMode==="register"?"/api/auth/register":"/api/auth/login",{method:"POST",body:JSON.stringify(body)});currentUser=d.user;updateAccount();hide("auth");$("authForm").reset();msg("authMsg","");}catch(e){msg("authMsg",e.message,true)}};
$("creatorBtn").onclick=async()=>{if(!currentUser){show("auth");setAuthMode("register");$("creatorRole").checked=true;return}if(!["CREATOR","ADMIN"].includes(currentUser.role)){alert("Your account is a reader. Sign out and create a creator account to publish.");return}show("storyBox")};
$("storyForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/stories",{method:"POST",body:JSON.stringify({title:$("stTitle").value,type:$("stType").value,priceRupees:$("stPrice").value,coverUrl:$("stCover").value,description:$("stDesc").value})});alert(`Draft created: ${d.story.title}. Add chapters through the creator API, then publish.`);hide("storyBox");$("storyForm").reset()}catch(e){msg("storyMsg",e.message,true)}};
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");loadStories(b.dataset.type)});
$("hamb").onclick=()=>{const n=document.querySelector("nav");n.style.display=n.style.display==="flex"?"none":"flex";n.style.position="absolute";n.style.top="74px";n.style.left="0";n.style.right="0";n.style.padding="20px";n.style.background="#07080c";n.style.flexDirection="column"};
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
(async()=>{try{currentUser=(await api("/api/auth/me")).user}catch{}updateAccount();loadStories()})();