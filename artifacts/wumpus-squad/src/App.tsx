import { useState, useRef, useEffect, useCallback } from "react";

/* ─── CONFIG ─────────────────────────────────────────────────────
   Replace these with your real OAuth credentials from:
   Google:   https://console.cloud.google.com
   Facebook: https://developers.facebook.com
──────────────────────────────────────────────────────────────── */
const GOOGLE_CLIENT_ID   = import.meta.env.VITE_GOOGLE_CLIENT_ID   || "YOUR_GOOGLE_CLIENT_ID";
const FACEBOOK_APP_ID    = import.meta.env.VITE_FACEBOOK_APP_ID    || "YOUR_FACEBOOK_APP_ID";
const REDIRECT_ORIGIN    = window.location.origin;

/* ─── PIXEL AVATARS ─────────────────────────────────────────── */
const PixelNelly = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering:"pixelated", flexShrink:0, display:"block" }}>
    <rect width="16" height="16" fill="#2a1f40" rx="3"/>
    <rect x="5" y="1" width="6" height="2" fill="#cc88ff"/><rect x="4" y="2" width="8" height="1" fill="#aa66dd"/>
    <rect x="3" y="3" width="10" height="6" fill="#f0d8ff"/>
    <rect x="5" y="5" width="2" height="2" fill="#111"/><rect x="9" y="5" width="2" height="2" fill="#111"/>
    <rect x="5" y="5" width="1" height="1" fill="#fff" opacity="0.5"/><rect x="9" y="5" width="1" height="1" fill="#fff" opacity="0.5"/>
    <rect x="7" y="7" width="2" height="1" fill="#ffaa44"/><rect x="6" y="8" width="4" height="1" fill="#ff8822"/>
    <rect x="4" y="9" width="8" height="5" fill="#c890f8"/><rect x="5" y="9" width="6" height="3" fill="#f0d8ff"/>
    <rect x="2" y="9" width="2" height="4" fill="#aa66dd"/><rect x="12" y="9" width="2" height="4" fill="#aa66dd"/>
    <rect x="5" y="14" width="2" height="1" fill="#ffaa44"/><rect x="9" y="14" width="2" height="1" fill="#ffaa44"/>
  </svg>
);
const PixelWumpus = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering:"pixelated", flexShrink:0, display:"block" }}>
    <rect width="16" height="16" fill="#1e1535" rx="3"/>
    <rect x="3" y="3" width="10" height="9" fill="#9b6dff"/><rect x="2" y="5" width="12" height="6" fill="#9b6dff"/>
    <rect x="3" y="4" width="10" height="7" fill="#b890ff"/>
    <rect x="5" y="6" width="2" height="2" fill="#fff"/><rect x="9" y="6" width="2" height="2" fill="#fff"/>
    <rect x="5" y="6" width="1" height="1" fill="#222"/><rect x="9" y="6" width="1" height="1" fill="#222"/>
    <rect x="5" y="9" width="6" height="1" fill="#6633bb"/><rect x="6" y="10" width="4" height="1" fill="#6633bb"/>
    <rect x="6" y="9" width="1" height="1" fill="#fff"/><rect x="8" y="9" width="1" height="1" fill="#fff"/>
    <rect x="4" y="12" width="2" height="2" fill="#9b6dff"/><rect x="7" y="12" width="2" height="2" fill="#9b6dff"/><rect x="10" y="12" width="2" height="2" fill="#9b6dff"/>
  </svg>
);

/* ─── HELPERS ───────────────────────────────────────────────── */
const COLORS = ["#9b6dff","#e040fb","#00e5ff","#ff6644","#44ff88","#ffdd00","#ff4488","#44ddff"];
const colorFor = (n) => COLORS[(n||"?").split("").reduce((a,c)=>a+c.charCodeAt(0),0) % COLORS.length];

/* ─── ROLES ─────────────────────────────────────────────────── */
const ROLE_META: Record<string, { label: string; color: string; bg: string; glow: string }> = {
  DEV:  { label:"DEV",  color:"#00e5ff", bg:"#00e5ff1a", glow:"#00e5ff66" },
  MOD:  { label:"MOD",  color:"#44ff88", bg:"#44ff881a", glow:"#44ff8866" },
  ADMIN:{ label:"ADMIN",color:"#ff4488", bg:"#ff44881a", glow:"#ff448866" },
  VIP:  { label:"VIP",  color:"#ffdd00", bg:"#ffdd001a", glow:"#ffdd0066" },
};

const RoleBadge = ({ role }: { role: string }) => {
  const meta = ROLE_META[role];
  if (!meta) return null;
  return (
    <span style={{
      fontSize:8, fontWeight:800, letterSpacing:1,
      color: meta.color, background: meta.bg,
      border:`1px solid ${meta.color}55`,
      borderRadius:3, padding:"1px 5px",
      boxShadow:`0 0 6px ${meta.glow}`,
      fontFamily:"monospace", flexShrink:0,
    }}>{meta.label}</span>
  );
};

const UserAvatar = ({ name, size=32, photo }) => {
  if (photo) return (
    <img src={photo} alt={name}
      style={{ width:size, height:size, borderRadius:4, objectFit:"cover", flexShrink:0 }}
      onError={e => { e.target.style.display="none"; }}
    />
  );
  const col = colorFor(name);
  return (
    <div style={{ width:size, height:size, borderRadius:4, background:`linear-gradient(135deg,${col}99,${col}44)`,
      border:`2px solid ${col}66`, display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.38, fontWeight:700, color:"#fff", flexShrink:0, fontFamily:"monospace" }}>
      {(name||"?").slice(0,2).toUpperCase()}
    </div>
  );
};

/* ─── LOCAL STORAGE (works offline + as fallback) ───────────── */
  const lsGet = (key: string) => { try { const v=localStorage.getItem(key); return v?JSON.parse(v):null; } catch { return null; } };
  const lsSet = (key: string, val: unknown) => { try { localStorage.setItem(key,JSON.stringify(val)); } catch {} };
  const lsDel = (key: string) => { try { localStorage.removeItem(key); } catch {} };

  /* ─── SHARED STORAGE (cross-user via API) ────────── */
  const API_BASE = "/api";

  const sGet = async (key: string) => {
    try {
      const r = await fetch(`${API_BASE}/storage/get/${encodeURIComponent(key)}`);
      const data = await r.json() as { value: string | null };
      return data.value != null ? JSON.parse(data.value) : null;
    } catch { return null; }
  };
  const sSet = async (key: string, val: unknown) => {
    try {
      await fetch(`${API_BASE}/storage/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(val) }),
      });
    } catch {}
  };
  const sList = async (prefix: string) => {
    try {
      const r = await fetch(`${API_BASE}/storage/list?prefix=${encodeURIComponent(prefix)}`);
      const data = await r.json() as { keys: string[] };
      return data.keys || [];
    } catch { return []; }
  };

  /* ─── OAUTH HELPERS ─────────────────────────────────────────── */
const openOAuthPopup = (url, name) => {
  const w=500, h=600;
  const left=(window.screen.width-w)/2;
  const top=(window.screen.height-h)/2;
  return window.open(url, name, `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);
};

const googleAuthURL = () => {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${REDIRECT_ORIGIN}/auth/google/callback`,
    response_type: "token",
    scope: "email profile",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

const facebookAuthURL = () => {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: `${REDIRECT_ORIGIN}/auth/facebook/callback`,
    response_type: "token",
    scope: "email,public_profile",
  });
  return `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
};

/* ─── AUTH SCREEN ───────────────────────────────────────────── */
const AuthScreen = ({ onLogin }) => {
  const [mode, setMode]     = useState("login");
  const [form, setForm]     = useState({ name:"", email:"", password:"", confirm:"" });
  const [err, setErr]       = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthMsg, setOauthMsg] = useState("");

  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  /* Email sign up */
  const doSignup = async () => {
    if (!form.name.trim())                return setErr("Display name is required");
    if (!form.email.includes("@"))        return setErr("Enter a valid email");
    if (form.password.length < 6)         return setErr("Password must be at least 6 characters");
    if (form.password !== form.confirm)   return setErr("Passwords don't match");
    setLoading(true); setErr("");
    const key = `account:${form.email.toLowerCase().trim()}`;
    const existing = await sGet(key);
    if (existing) { setLoading(false); return setErr("An account with that email already exists."); }
    const acct = { name:form.name.trim(), email:form.email.toLowerCase().trim(), password:form.password, photo:null, provider:"email", createdAt:Date.now() };
    await sSet(key, acct);
    lsSet("wumpus_session", { name:acct.name, email:acct.email, photo:null, provider:"email" });
    setLoading(false);
    onLogin({ name:acct.name, email:acct.email, photo:null, provider:"email" });
  };

  /* Email login */
  const doLogin = async () => {
    if (!form.email.includes("@")) return setErr("Enter a valid email");
    if (!form.password)            return setErr("Password is required");
    setLoading(true); setErr("");
    const key = `account:${form.email.toLowerCase().trim()}`;
    const acct = await sGet(key);
    if (!acct)               { setLoading(false); return setErr("No account found. Sign up first."); }
    if (acct.provider !== "email") { setLoading(false); return setErr(`This email uses ${acct.provider} login.`); }
    if (acct.password !== form.password) { setLoading(false); return setErr("Incorrect password."); }
    lsSet("wumpus_session", { name:acct.name, email:acct.email, photo:acct.photo||null, provider:"email" });
    setLoading(false);
    onLogin({ name:acct.name, email:acct.email, photo:acct.photo||null, provider:"email" });
  };

  /* Google OAuth */
  const doGoogle = () => {
    if (GOOGLE_CLIENT_ID === "YOUR_GOOGLE_CLIENT_ID") {
      // Demo mode — show setup instructions
      setOauthMsg("google");
      return;
    }
    setLoading(true);
    const popup = openOAuthPopup(googleAuthURL(), "google_auth");
    const timer = setInterval(async () => {
      try {
        if (popup.closed) { clearInterval(timer); setLoading(false); return; }
        const hash = popup.location.hash;
        if (hash.includes("access_token")) {
          clearInterval(timer);
          popup.close();
          const params = new URLSearchParams(hash.slice(1));
          const token = params.get("access_token");
          const res = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`);
          const info = await res.json();
          const acct = { name:info.name, email:info.email, photo:info.picture, provider:"google" };
          await sSet(`account:${info.email}`, acct);
          lsSet("wumpus_session", acct);
          setLoading(false);
          onLogin(acct);
        }
      } catch {}
    }, 500);
  };

  /* Facebook OAuth */
  const doFacebook = () => {
    if (FACEBOOK_APP_ID === "YOUR_FACEBOOK_APP_ID") {
      setOauthMsg("facebook");
      return;
    }
    setLoading(true);
    const popup = openOAuthPopup(facebookAuthURL(), "fb_auth");
    const timer = setInterval(async () => {
      try {
        if (popup.closed) { clearInterval(timer); setLoading(false); return; }
        const hash = popup.location.hash;
        if (hash.includes("access_token")) {
          clearInterval(timer);
          popup.close();
          const params = new URLSearchParams(hash.slice(1));
          const token = params.get("access_token");
          const res = await fetch(`https://graph.facebook.com/me?fields=name,email,picture&access_token=${token}`);
          const info = await res.json();
          const email = info.email || `fb_${info.id}@facebook.com`;
          const acct = { name:info.name, email, photo:info.picture?.data?.url||null, provider:"facebook" };
          await sSet(`account:${email}`, acct);
          lsSet("wumpus_session", acct);
          setLoading(false);
          onLogin(acct);
        }
      } catch {}
    }, 500);
  };

  /* OAuth setup instructions popup */
  if (oauthMsg) return (
    <div style={{ background:"#0d0a1a", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif", padding:20 }}>
      <div style={{ background:"#1a1430", border:"1px solid #9b6dff55", borderRadius:16, padding:32, maxWidth:480, width:"100%" }}>
        <div style={{ fontWeight:800, fontSize:18, marginBottom:12, color:"#e8e0ff" }}>
          {oauthMsg==="google" ? "🔑 Set up Google Login" : "🔑 Set up Facebook Login"}
        </div>
        <div style={{ color:"#c8b0ff", fontSize:13, lineHeight:1.8, marginBottom:16 }}>
          To enable real {oauthMsg==="google"?"Google":"Facebook"} login, you need to register this app:
        </div>
        {oauthMsg==="google" ? (
          <ol style={{ color:"#a898cc", fontSize:12, lineHeight:2, paddingLeft:20 }}>
            <li>Go to <strong style={{color:"#9b6dff"}}>console.cloud.google.com</strong></li>
            <li>Create a project → APIs & Services → Credentials</li>
            <li>Create OAuth 2.0 Client ID (Web application)</li>
            <li>Add your domain to Authorized redirect URIs:<br/><code style={{background:"#0d0a1a",padding:"2px 6px",borderRadius:4,color:"#44ff88"}}>{REDIRECT_ORIGIN}/auth/google/callback</code></li>
            <li>Copy the Client ID</li>
            <li>Add to your <code style={{color:"#44ff88"}}>.env</code>:<br/><code style={{background:"#0d0a1a",padding:"2px 6px",borderRadius:4,color:"#44ff88"}}>VITE_GOOGLE_CLIENT_ID=your_id_here</code></li>
          </ol>
        ) : (
          <ol style={{ color:"#a898cc", fontSize:12, lineHeight:2, paddingLeft:20 }}>
            <li>Go to <strong style={{color:"#9b6dff"}}>developers.facebook.com</strong></li>
            <li>My Apps → Create App → Consumer</li>
            <li>Add Facebook Login product</li>
            <li>Settings → Valid OAuth Redirect URIs:<br/><code style={{background:"#0d0a1a",padding:"2px 6px",borderRadius:4,color:"#44ff88"}}>{REDIRECT_ORIGIN}/auth/facebook/callback</code></li>
            <li>Copy App ID</li>
            <li>Add to your <code style={{color:"#44ff88"}}>.env</code>:<br/><code style={{background:"#0d0a1a",padding:"2px 6px",borderRadius:4,color:"#44ff88"}}>VITE_FACEBOOK_APP_ID=your_id_here</code></li>
          </ol>
        )}
        <div style={{ display:"flex", gap:8, marginTop:16 }}>
          <button onClick={()=>setOauthMsg("")} style={{ flex:1, background:"#9b6dff", border:"none", borderRadius:8, padding:"10px", color:"#fff", fontWeight:700, cursor:"pointer" }}>Got it, go back</button>
          <button onClick={()=>window.open(oauthMsg==="google"?"https://console.cloud.google.com":"https://developers.facebook.com","_blank")} style={{ flex:1, background:"#1e1535", border:"1px solid #9b6dff44", borderRadius:8, padding:"10px", color:"#c8a8ff", fontWeight:600, cursor:"pointer" }}>Open Console →</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background:"#0d0a1a", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif", padding:20 }}>
      <div style={{ background:"#1a1430", border:"1px solid #9b6dff44", borderRadius:18, padding:36, width:380, maxWidth:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ animation:"glow 2s infinite", display:"inline-block", marginBottom:10 }}><PixelNelly size={56}/></div>
          <div style={{ fontWeight:800, fontSize:22, color:"#e8e0ff" }}>Wumpus Squad</div>
          <div style={{ color:"#7766aa", fontSize:12, marginTop:4 }}>{mode==="login"?"Welcome back, soldier!":"Join the squad"}</div>
        </div>

        {/* Google */}
        <button onClick={doGoogle} disabled={loading} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:"#fff", border:"none", borderRadius:10, padding:"11px", cursor:"pointer", fontSize:14, fontWeight:600, color:"#333", marginBottom:10 }}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        {/* Facebook */}
        <button onClick={doFacebook} disabled={loading} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:"#1877F2", border:"none", borderRadius:10, padding:"11px", cursor:"pointer", fontSize:14, fontWeight:600, color:"#fff", marginBottom:18 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Continue with Facebook
        </button>

        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
          <div style={{ flex:1, height:1, background:"#2e2050" }}/><span style={{ color:"#5544aa", fontSize:11 }}>or with email</span><div style={{ flex:1, height:1, background:"#2e2050" }}/>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {mode==="signup" && <input value={form.name} onChange={e=>upd("name",e.target.value)} placeholder="Display name" maxLength={24} style={{ background:"#0d0a1a", border:"1px solid #2e2050", borderRadius:8, padding:"10px 12px", color:"#e8e0ff", fontSize:13, width:"100%", outline:"none" }}/>}
          <input value={form.email} onChange={e=>upd("email",e.target.value)} placeholder="Email address" type="email" style={{ background:"#0d0a1a", border:"1px solid #2e2050", borderRadius:8, padding:"10px 12px", color:"#e8e0ff", fontSize:13, width:"100%", outline:"none" }}/>
          <input value={form.password} onChange={e=>upd("password",e.target.value)} placeholder="Password" type="password" onKeyDown={e=>e.key==="Enter"&&(mode==="signup"?doSignup():doLogin())} style={{ background:"#0d0a1a", border:"1px solid #2e2050", borderRadius:8, padding:"10px 12px", color:"#e8e0ff", fontSize:13, width:"100%", outline:"none" }}/>
          {mode==="signup" && <input value={form.confirm} onChange={e=>upd("confirm",e.target.value)} placeholder="Confirm password" type="password" onKeyDown={e=>e.key==="Enter"&&doSignup()} style={{ background:"#0d0a1a", border:"1px solid #2e2050", borderRadius:8, padding:"10px 12px", color:"#e8e0ff", fontSize:13, width:"100%", outline:"none" }}/>}
          {err && <div style={{ color:"#ff8888", fontSize:12, background:"#ff444420", border:"1px solid #ff444440", borderRadius:6, padding:"7px 10px" }}>{err}</div>}
          <button onClick={mode==="signup"?doSignup:doLogin} disabled={loading} style={{ background:"#9b6dff", border:"none", borderRadius:9, padding:"12px", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", opacity:loading?0.7:1 }}>
            {loading?"Please wait…":mode==="signup"?"Create Account":"Log In"}
          </button>
          <div style={{ textAlign:"center", fontSize:12, color:"#7766aa" }}>
            {mode==="login"?"Don't have an account? ":"Already have one? "}
            <span onClick={()=>{setMode(mode==="login"?"signup":"login");setErr("");}} style={{ color:"#9b6dff", cursor:"pointer", fontWeight:600 }}>
              {mode==="login"?"Sign Up":"Log In"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── REST OF APP (stream, chat, voice, channels) ───────────── */
/* [Same full app code as before — included in the full build] */

export default function App() {
  const [user, setUser] = useState(() => lsGet("wumpus_session"));

  const handleLogin = (acct) => {
    lsSet("wumpus_session", acct);
    setUser(acct);
  };

  const handleLogout = async () => {
    if (user) { try { await fetch(`${API_BASE}/storage/delete/${encodeURIComponent(`presence:${user.email}`)}`, { method: "DELETE" }); } catch {} }
    lsDel("wumpus_session");
    setUser(null);
  };

  if (!user) return <AuthScreen onLogin={handleLogin} />;
  return <MainApp user={user} onLogout={handleLogout} />;
}

/* ─── MAIN APP COMPONENT ─────────────────────────────────────── */
const CHANNELS = [
  {id:"general",label:"general",icon:"#"},{id:"tactics",label:"tactics",icon:"#"},
  {id:"clips",label:"clips",icon:"#"},{id:"voice",label:"voice",icon:"🎙"},
  {id:"memes",label:"memes",icon:"#"},{id:"off-topic",label:"off-topic",icon:"#"},
];

const StreamBg = () => (
  <div style={{position:"absolute",inset:0,overflow:"hidden"}}>
    <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#1a0800 0%,#3d1500 40%,#6b2800 70%,#4a1e00 100%)"}}/>
    <div style={{position:"absolute",top:"15%",left:"50%",transform:"translateX(-50%)",width:180,height:80,background:"radial-gradient(ellipse,#ff660055 0%,transparent 70%)"}}/>
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:"42%",background:"linear-gradient(180deg,#3a1a00 0%,#5c2800 100%)"}}/>
    <div style={{position:"absolute",bottom:"22%",left:"12%"}}>
      <svg width="52" height="68" viewBox="0 0 14 18" style={{imageRendering:"pixelated"}}>
        <rect x="3" y="0" width="7" height="3" fill="#5a5a6a"/><rect x="2" y="2" width="9" height="4" fill="#6a6a7a"/>
        <rect x="2" y="7" width="9" height="7" fill="#5a5a6a"/><rect x="0" y="7" width="2" height="6" fill="#5a5a6a"/>
        <rect x="12" y="7" width="2" height="6" fill="#5a5a6a"/><rect x="2" y="14" width="3" height="4" fill="#4a4a5a"/>
        <rect x="8" y="14" width="3" height="4" fill="#4a4a5a"/>
      </svg>
    </div>
    <div style={{position:"absolute",bottom:"20%",left:"40%"}}>
      <svg width="68" height="88" viewBox="0 0 16 20" style={{imageRendering:"pixelated"}}>
        <rect x="4" y="0" width="8" height="3" fill="#4a4a5a"/><rect x="3" y="2" width="10" height="5" fill="#5a5a6a"/>
        <rect x="3" y="8" width="10" height="8" fill="#5a5a6a"/><rect x="0" y="8" width="3" height="7" fill="#5a5a6a"/>
        <rect x="13" y="8" width="3" height="7" fill="#5a5a6a"/><rect x="3" y="16" width="4" height="4" fill="#4a4a5a"/>
        <rect x="9" y="16" width="4" height="4" fill="#4a4a5a"/>
      </svg>
    </div>
    <div style={{position:"absolute",bottom:"20%",right:"18%"}}>
      <svg width="52" height="68" viewBox="0 0 14 18" style={{imageRendering:"pixelated"}}>
        <rect x="3" y="0" width="7" height="3" fill="#5a5a6a"/><rect x="2" y="2" width="9" height="4" fill="#6a6a7a"/>
        <rect x="2" y="7" width="9" height="7" fill="#5a5a6a"/><rect x="0" y="7" width="2" height="6" fill="#5a5a6a"/>
        <rect x="12" y="7" width="2" height="6" fill="#5a5a6a"/><rect x="2" y="14" width="3" height="4" fill="#4a4a5a"/>
        <rect x="8" y="14" width="3" height="4" fill="#4a4a5a"/>
      </svg>
    </div>
    <div style={{position:"absolute",bottom:"18%",right:"6%"}}>
      <svg width="96" height="52" viewBox="0 0 24 13" style={{imageRendering:"pixelated"}}>
        <rect x="0" y="4" width="24" height="8" fill="#3a3a3a"/><rect x="2" y="1" width="16" height="6" fill="#4a4a4a"/>
        <rect x="16" y="3" width="10" height="2" fill="#2a2a2a"/>
        <rect x="0" y="10" width="5" height="3" fill="#2a2a2a" rx="1"/><rect x="7" y="10" width="5" height="3" fill="#2a2a2a" rx="1"/>
      </svg>
    </div>
  </div>
);

const Waveform = () => {
  const pts=[0,4,8,3,11,6,9,14,7,16,12,8,15,10,5,13,9,6,12,8,4,10,7,15,9,5,11,8,3,12];
  let d=`M 0 ${20-pts[0]}`;
  pts.forEach((v,i)=>{d+=` L ${i*6} ${20-v}`;});
  return (
    <svg width="100%" height="48" viewBox={`0 0 ${(pts.length-1)*6} 20`} preserveAspectRatio="none" style={{display:"block"}}>
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e040fb" stopOpacity="0.1"/><stop offset="35%" stopColor="#9b6dff" stopOpacity="1"/>
          <stop offset="65%" stopColor="#e040fb" stopOpacity="0.9"/><stop offset="100%" stopColor="#9b6dff" stopOpacity="0.1"/>
        </linearGradient>
        <linearGradient id="wf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9b6dff" stopOpacity="0.3"/><stop offset="100%" stopColor="#9b6dff" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={d+` L ${(pts.length-1)*6} 20 L 0 20 Z`} fill="url(#wf)"/>
      <path d={d} fill="none" stroke="url(#wg)" strokeWidth="1.5"/>
    </svg>
  );
};

const VoiceWave = ({ active }) => (
  <div style={{display:"flex",alignItems:"center",gap:2,height:22}}>
    {[5,9,6,13,8,15,11,7,13,9,6,11].map((h,i)=>(
      <div key={i} style={{width:3,height:active?h:3,borderRadius:2,background:active?"linear-gradient(to top,#9b6dff,#e040fb)":"#3a2a55",transition:"height 0.3s",animation:active?`vp ${0.5+i*0.07}s ease-in-out infinite alternate`:"none"}}/>
    ))}
  </div>
);

const ChanGraph = ({ channels, active, onSelect }) => {
  const nodes=[
    {cx:100,cy:45,r:9,col:"#e040fb"},{cx:42,cy:24,r:5,col:"#9b6dff"},{cx:162,cy:20,r:5,col:"#9b6dff"},
    {cx:157,cy:68,r:7,col:"#00e5ff"},{cx:46,cy:70,r:4,col:"#9b6dff"},{cx:132,cy:45,r:4,col:"#6644aa"},
  ];
  return (
    <svg width="100%" height="88" viewBox="0 0 200 90" style={{cursor:"pointer"}}>
      <defs><filter id="ng"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      {[[0,1],[0,2],[0,3],[0,4],[0,5],[5,2],[5,3]].map(([a,b],i)=>(
        <line key={i} x1={nodes[a].cx} y1={nodes[a].cy} x2={nodes[b].cx} y2={nodes[b].cy} stroke="#2e2050" strokeWidth="1.5"/>
      ))}
      {nodes.map((n,i)=>{
        const ch=channels[i]; const on=ch&&active===ch.id;
        return (
          <g key={i} onClick={()=>ch&&onSelect(ch.id)} style={{cursor:"pointer"}}>
            <circle cx={n.cx} cy={n.cy} r={n.r+4} fill="transparent"/>
            <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.col} fillOpacity={on?1:0.6} stroke={n.col} strokeWidth={on?2:1} filter="url(#ng)"/>
            {on&&<circle cx={n.cx} cy={n.cy} r={n.r+5} fill="none" stroke={n.col} strokeWidth="1" opacity="0.4"/>}
            <text x={n.cx} y={n.cy+n.r+8} textAnchor="middle" fontSize="6" fill="#8877aa">{ch?.label||""}</text>
          </g>
        );
      })}
    </svg>
  );
};

const LIVE = () => <span style={{background:"#ff3333",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,letterSpacing:1.5,animation:"blink 2s infinite"}}>LIVE</span>;

function MainApp({ user, onLogout }) {
  const [activeNav, setActiveNav]   = useState(1);
  const [activeChannel, setChannel] = useState("general");
  const [msgs, setMsgs]             = useState({});
  const [dmMsgs, setDmMsgs]         = useState({});
  const [dmTarget, setDmTarget]     = useState(null);
  const [online, setOnline]         = useState([]);
  const [msg, setMsg]               = useState("");
  const [dmInput, setDmInput]       = useState("");
  const [voiceOn, setVoiceOn]       = useState(true);
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [streamPlaying, setStreamPlaying] = useState(true);
  const [progress, setProgress]     = useState(35);
  const [showMap, setShowMap]       = useState(false);
  const [showLoadout, setShowLoadout] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [loadoutSel, setLoadoutSel] = useState({weapon:"Rifle",armor:"Heavy",perk:"Stealth"});
  const [roles, setRoles] = useState<Record<string,string>>({});
  /* ── screen share / stream (club-scoped) ── */
  const [screenStream, setScreenStream] = useState<MediaStream|null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCamLive, setIsCamLive]       = useState(false);
  const [camStream, setCamStream]       = useState<MediaStream|null>(null);
  const [streamClubId, setStreamClubId] = useState<string|null>(null);
  const [clubStreams, setClubStreams]    = useState<Record<string,{name:string;email:string;type:string;ts:number}|null>>({});
  const screenVideoRef  = useRef<HTMLVideoElement>(null);
  const camVideoRef     = useRef<HTMLVideoElement>(null);
  /* ── create group ── */
  const [customChannels, setCustomChannels] = useState<{id:string;label:string;icon:string}[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("🎮");
  /* ── clubs ── */
  type Club = {id:string;name:string;icon:string;color:string;description:string;createdBy:string;members:string[];ts:number};
  const [clubs, setClubs] = useState<Club[]>([]);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const [newClubDesc, setNewClubDesc] = useState("");
  const [newClubIcon, setNewClubIcon] = useState("🎮");
  const [newClubColor, setNewClubColor] = useState("#9b6dff");
  const [clubView, setClubView] = useState<Club|null>(null);
  const chatRef = useRef();
  const pollRef = useRef();

  useEffect(()=>{ if(chatRef.current) chatRef.current.scrollTop=chatRef.current.scrollHeight; },[msgs,dmMsgs,activeChannel,dmTarget]);

  useEffect(()=>{
    if(!streamPlaying) return;
    const t=setInterval(()=>setProgress(p=>p>=100?0:p+0.05),200);
    return()=>clearInterval(t);
  },[streamPlaying]);

  useEffect(()=>{
    const beat=()=>sSet(`presence:${user.email}`,{name:user.name,email:user.email,photo:user.photo,ts:Date.now()});
    beat();
    const t=setInterval(beat,7000);
    return()=>clearInterval(t);
  },[user]);

  useEffect(()=>{
    const loadRoles = async () => {
      let data = await sGet("roles:config") as Record<string,string> | null;
      if (!data) {
        data = { "zenxoy": "DEV" };
        await sSet("roles:config", data);
      } else if (!data["zenxoy"]) {
        data = { ...data, "zenxoy": "DEV" };
        await sSet("roles:config", data);
      }
      setRoles(data);
    };
    loadRoles();
  },[]);

  const getRole = (name: string) => roles[name?.toLowerCase()] || null;

  /* ── load custom channels ── */
  useEffect(()=>{
    const load=async()=>{
      const data=await sGet("channels:custom");
      if(Array.isArray(data)) setCustomChannels(data);
    };
    load();
  },[]);

  /* ── load clubs ── */
  useEffect(()=>{
    const load=async()=>{
      const data=await sGet("clubs:list");
      if(Array.isArray(data)) setClubs(data);
    };
    load();
    const t=setInterval(async()=>{
      const data=await sGet("clubs:list");
      if(Array.isArray(data)) setClubs(data);
    },5000);
    return()=>clearInterval(t);
  },[]);

  const saveClubs=async(updated:Club[])=>{
    setClubs(updated);
    await sSet("clubs:list",updated);
  };

  const createClub=async()=>{
    const name=newClubName.trim();
    if(!name) return;
    const id=`club-${Date.now()}`;
    const club:Club={id,name,icon:newClubIcon,color:newClubColor,description:newClubDesc.trim(),createdBy:user.name,members:[user.email],ts:Date.now()};
    await saveClubs([...clubs,club]);
    setNewClubName(""); setNewClubDesc(""); setNewClubIcon("🎮"); setNewClubColor("#9b6dff");
    setShowCreateClub(false);
    setClubView(club);
  };

  const joinClub=async(id:string)=>{
    const updated=clubs.map(c=>c.id===id&&!c.members.includes(user.email)?{...c,members:[...c.members,user.email]}:c);
    await saveClubs(updated);
    const found=updated.find(c=>c.id===id);
    if(found) setClubView(found);
  };

  const leaveClub=async(id:string)=>{
    const updated=clubs.map(c=>c.id===id?{...c,members:c.members.filter(e=>e!==user.email)}:c);
    await saveClubs(updated);
    setClubView(null);
  };

  const allChannels = [...CHANNELS, ...customChannels];

  /* ── screen share ── */
  const startScreenShare = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video:true, audio:true });
      setScreenStream(stream);
      setIsScreenSharing(true);
      setActiveNav(0);
      await sSet("stream:active", { name:user.name, email:user.email, type:"screen", ts:Date.now() });
      stream.getVideoTracks()[0].onended = stopScreenShare;
      setTimeout(()=>{ if(screenVideoRef.current){ screenVideoRef.current.srcObject=stream; screenVideoRef.current.play().catch(()=>{}); } },100);
    } catch {}
  };

  const stopScreenShare = async () => {
    if(screenStream){ screenStream.getTracks().forEach(t=>t.stop()); setScreenStream(null); }
    setIsScreenSharing(false);
    await sSet("stream:active", null);
  };

  /* ── camera / go live ── */
  const startCamLive = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
      setCamStream(stream);
      setIsCamLive(true);
      setActiveNav(0);
      await sSet("stream:active", { name:user.name, email:user.email, type:"cam", ts:Date.now() });
      setTimeout(()=>{ if(camVideoRef.current){ camVideoRef.current.srcObject=stream; camVideoRef.current.play().catch(()=>{}); } },100);
    } catch {}
  };

  const stopCamLive = async () => {
    if(camStream){ camStream.getTracks().forEach(t=>t.stop()); setCamStream(null); }
    setIsCamLive(false);
    await sSet("stream:active", null);
  };

  /* ── create group ── */
  const createGroup = async () => {
    const name = newGroupName.trim();
    if(!name) return;
    const id = name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");
    if(allChannels.find(c=>c.id===id)) return;
    const updated = [...customChannels, { id, label:name, icon:newGroupIcon }];
    setCustomChannels(updated);
    await sSet("channels:custom", updated);
    setNewGroupName(""); setNewGroupIcon("🎮"); setShowCreateGroup(false);
    setChannel(id);
  };

  /* ── attach streams to video elements ── */
  useEffect(()=>{
    if(screenVideoRef.current&&screenStream){
      screenVideoRef.current.srcObject=screenStream;
      screenVideoRef.current.play().catch(()=>{});
    }
  },[isScreenSharing,screenStream]);

  useEffect(()=>{
    if(camVideoRef.current&&camStream){
      camVideoRef.current.srcObject=camStream;
      camVideoRef.current.play().catch(()=>{});
    }
  },[isCamLive,camStream]);

  /* ── poll active streamer ── */
  useEffect(()=>{
    const t=setInterval(async()=>{
      const data=await sGet("stream:active");
      setActiveStreamer(data&&Date.now()-data.ts<15000?data:null);
    },3000);
    return()=>clearInterval(t);
  },[]);

  const poll = useCallback(async()=>{
    const newMsgs={};
    for(const ch of allChannels){
      const data=await sGet(`chan:${ch.id}`);
      newMsgs[ch.id]=Array.isArray(data)?data:[];
    }
    setMsgs(newMsgs);
    if(dmTarget){
      const key=`dm:${[user.email,dmTarget].sort().join("|")}`;
      const data=await sGet(key);
      setDmMsgs(p=>({...p,[dmTarget]:Array.isArray(data)?data:[]}));
    }
    const keys=await sList("presence:");
    const now=Date.now(); const users=[];
    for(const k of keys){
      const u=await sGet(k);
      if(u&&now-u.ts<18000) users.push(u);
    }
    setOnline(users);
  },[user,dmTarget,customChannels]);

  useEffect(()=>{
    poll();
    pollRef.current=setInterval(poll,2500);
    return()=>clearInterval(pollRef.current);
  },[poll]);

  const sendMsg=async()=>{
    if(!msg.trim()) return;
    const ch=activeChannel==="voice"?"general":activeChannel;
    const existing=await sGet(`chan:${ch}`)||[];
    const m={id:Date.now(),name:user.name,email:user.email,photo:user.photo,text:msg.trim(),ts:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};
    await sSet(`chan:${ch}`,[...(Array.isArray(existing)?existing:[]).slice(-99),m]);
    setMsg(""); poll();
  };

  const sendDm=async()=>{
    if(!dmInput.trim()||!dmTarget) return;
    const key=`dm:${[user.email,dmTarget].sort().join("|")}`;
    const existing=await sGet(key)||[];
    const m={id:Date.now(),name:user.name,email:user.email,photo:user.photo,text:dmInput.trim(),ts:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};
    await sSet(key,[...(Array.isArray(existing)?existing:[]).slice(-199),m]);
    setDmInput(""); poll();
  };

  const curMsgs=msgs[activeChannel==="voice"?"general":activeChannel]||[];
  const curDms=dmMsgs[dmTarget]||[];
  const others=online.filter(u=>u.email!==user.email);

  const navItems=[
    {icon:"📺",tip:"Stream"},{icon:"〜",tip:"Pulse"},{icon:"💬",tip:"Messages"},
    {icon:"🌐",tip:"Discover"},{icon:"👥",tip:"Members"},{icon:"👤",tip:"Profile"},
    {icon:"🏆",tip:"Clubs"},
  ];

  const sidebar=()=>{
    if(activeNav===0) return (
      <div style={{display:"flex",flexDirection:"column",gap:8,padding:8,flex:1,overflowY:"auto"}}>
        <div style={{color:"#9b6dff",fontWeight:700,fontSize:13}}>📺 Stream</div>

        {/* My stream controls */}
        <div style={{background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7766aa",marginBottom:8}}>GO LIVE</div>
          <div style={{display:"flex",gap:6}}>
            {!isScreenSharing&&!isCamLive&&(
              <button onClick={startScreenShare} style={{flex:1,background:"#9b6dff22",border:"1px solid #9b6dff55",borderRadius:7,padding:"7px 4px",color:"#c8a8ff",fontSize:11,fontWeight:700,cursor:"pointer"}}>🖥 Share Screen</button>
            )}
            {!isScreenSharing&&!isCamLive&&(
              <button onClick={startCamLive} style={{flex:1,background:"#e040fb22",border:"1px solid #e040fb55",borderRadius:7,padding:"7px 4px",color:"#e8a0ff",fontSize:11,fontWeight:700,cursor:"pointer"}}>📷 Camera</button>
            )}
            {isScreenSharing&&(
              <button onClick={stopScreenShare} style={{flex:1,background:"#ff444422",border:"1px solid #ff4444",borderRadius:7,padding:"7px 4px",color:"#ff8888",fontSize:11,fontWeight:700,cursor:"pointer"}}>⏹ Stop Sharing</button>
            )}
            {isCamLive&&(
              <button onClick={stopCamLive} style={{flex:1,background:"#ff444422",border:"1px solid #ff4444",borderRadius:7,padding:"7px 4px",color:"#ff8888",fontSize:11,fontWeight:700,cursor:"pointer"}}>⏹ End Stream</button>
            )}
          </div>
          {(isScreenSharing||isCamLive)&&(
            <div style={{marginTop:8,display:"flex",alignItems:"center",gap:6}}>
              <LIVE/>
              <span style={{fontSize:10,color:"#c8a8ff"}}>{isScreenSharing?"Sharing screen":"Camera live"}</span>
            </div>
          )}
        </div>

        {/* Active streamer card */}
        {activeStreamer&&activeStreamer.email!==user.email&&(
          <div style={{background:"#1a1430",border:"1px solid #ff333355",borderRadius:10,padding:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <UserAvatar name={activeStreamer.name} size={32}/>
              <div><div style={{fontWeight:700,fontSize:12}}>{activeStreamer.name}</div><div style={{fontSize:10,color:"#7766aa"}}>{activeStreamer.type==="screen"?"Screen sharing":"Camera"}</div></div>
            </div>
            <LIVE/>
            <div style={{marginTop:6,fontSize:10,color:"#7766aa"}}>🎮 Wumpus Squad · {online.length} watching</div>
          </div>
        )}

        {/* Default Nelly card when nobody is live */}
        {!activeStreamer&&!isScreenSharing&&!isCamLive&&(
          <div style={{background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,padding:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{animation:"glow 2.5s infinite"}}><PixelNelly size={38}/></div>
              <div><div style={{fontWeight:700,fontSize:13}}>Nelly</div><div style={{fontSize:10,color:"#7766aa"}}>Streaming</div></div>
            </div>
            <LIVE/>
            <div style={{marginTop:8,fontSize:11,color:"#7766aa"}}>🎮 Wumpus Squad · {online.length} watching</div>
          </div>
        )}

        <div style={{background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,padding:12}}>
          <div style={{fontWeight:600,fontSize:12,marginBottom:8}}>Playlist</div>
          {["Wumpus Squad Map 3","Battle Royale Ranked","Solo Queue Grind"].map((t,i)=>(
            <div key={i} style={{fontSize:11,color:i===0?"#c8a8ff":"#7766aa",padding:"4px 0",borderBottom:i<2?"1px solid #2e205030":"none"}}>{i===0?"▶ ":""}{t}</div>
          ))}
        </div>
      </div>
    );
    if(activeNav===1) return (
      <div style={{display:"flex",flexDirection:"column",gap:7,padding:7,flex:1,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <svg viewBox="0 0 20 14" width="14" height="10" fill="none" stroke="#9b6dff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,7 4,7 6,2 8,12 11,4 13,9 15,7 19,7"/></svg>
          <span style={{fontWeight:700,fontSize:13}}>Pulse</span>
        </div>
        <div style={{background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,padding:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{animation:"glow 2.5s infinite"}}><UserAvatar name={user.name} size={38} photo={user.photo}/></div>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{user.name}</div><div style={{fontSize:10,color:"#44ff88"}}>● Online</div></div>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {user.provider==="google"&&<span style={{background:"#4285F422",color:"#4285F4",fontSize:9,padding:"2px 6px",borderRadius:3}}>Google</span>}
            {user.provider==="facebook"&&<span style={{background:"#1877F222",color:"#1877F2",fontSize:9,padding:"2px 6px",borderRadius:3}}>Facebook</span>}
            <span style={{background:"#9b6dff22",color:"#c8a8ff",fontSize:9,padding:"2px 6px",borderRadius:3}}>Wumpus Squad</span>
          </div>
        </div>
        <div style={{background:"#1a1430",border:"1px solid #2e2050",borderRadius:10}}>
          <div style={{display:"flex",alignItems:"center",padding:"9px 12px 7px",borderBottom:"1px solid #2e205025"}}>
            <span style={{fontWeight:600,fontSize:12,flex:1}}>Tactical Map</span>
          </div>
          <div style={{padding:"7px 8px 4px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
            <button onClick={()=>setShowMap(true)} style={{background:"#9b6dff18",border:"1px solid #2e2050",borderRadius:7,padding:"9px 0",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <svg viewBox="0 0 18 18" width="18" height="18"><polygon points="0,2 6,0 12,2 18,0 18,16 12,18 6,16 0,18" fill="#9b6dff" opacity="0.6"/></svg>
            </button>
            <button onClick={()=>setChannel("general")} style={{background:"#9b6dff18",border:"1px solid #2e2050",borderRadius:7,padding:"9px 0",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="#9b6dff" strokeWidth="1.8" strokeLinecap="round"><line x1="9" y1="1" x2="9" y2="17"/><line x1="1" y1="9" x2="17" y2="9"/></svg>
            </button>
            <button style={{background:"#9b6dff18",border:"1px solid #2e2050",borderRadius:7,padding:"9px 0",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <svg viewBox="0 0 18 18" width="18" height="18" fill="#9b6dff" opacity="0.8"><rect x="2" y="3" width="14" height="2" rx="1"/><rect x="2" y="8" width="14" height="2" rx="1"/><rect x="2" y="13" width="9" height="2" rx="1"/></svg>
            </button>
          </div>
          <div style={{padding:"0 8px 8px"}}>
            <button onClick={()=>setShowLoadout(true)} style={{width:"100%",background:"#9b6dff18",border:"1px solid #2e2050",borderRadius:7,padding:"7px 10px",color:"#e8e0ff",display:"flex",alignItems:"center",gap:8,fontSize:11,cursor:"pointer"}}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="#9b6dff"><rect x="0" y="0" width="7" height="16" rx="1"/><rect x="9" y="3" width="7" height="10" rx="1" opacity="0.6"/></svg>
              Unit Loadout
            </button>
          </div>
        </div>
        <div style={{background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,flex:1}}>
          <div style={{display:"flex",alignItems:"center",padding:"9px 12px 7px",borderBottom:"1px solid #2e205025"}}>
            <span style={{fontWeight:600,fontSize:12,flex:1}}>Activity Pulse</span>
          </div>
          <div style={{padding:"4px 5px 8px"}}><Waveform/></div>
        </div>
        <div style={{background:voiceJoined?"#44ff8822":"#9b6dff18",border:`1px solid ${voiceJoined?"#44ff8855":"#9b6dff33"}`,borderRadius:9,padding:"8px 11px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>setVoiceJoined(v=>!v)}>
          <div style={{width:8,height:8,borderRadius:"50%",background:voiceJoined?"#44ff88":"#9b6dff",animation:"blink 1.5s infinite"}}/>
          <div><div style={{fontSize:11,fontWeight:600}}>{voiceJoined?"Voice Connected":"Join Voice"}</div><div style={{fontSize:9,color:"#7766aa"}}>gametime / Wumpus Squad</div></div>
          <span style={{marginLeft:"auto",color:"#6655aa"}}>∨</span>
        </div>
      </div>
    );
    if(activeNav===2) return (
      <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
        <div style={{padding:"12px 12px 8px",borderBottom:"1px solid #1e1535",flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>💬 Direct Messages</div>
          <input value={friendSearch} onChange={e=>setFriendSearch(e.target.value)} placeholder="Search users…" style={{width:"100%",background:"#0d0a1a",border:"1px solid #2e2050",borderRadius:6,padding:"6px 9px",color:"#e8e0ff",fontSize:11,outline:"none"}}/>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
          {others.length===0&&<div style={{textAlign:"center",color:"#5544aa",fontSize:12,padding:20}}>No other users online.<br/>Share this app!</div>}
          {others.filter(u=>u.name.toLowerCase().includes(friendSearch.toLowerCase())).map(u=>(
            <button key={u.email} onClick={()=>{setDmTarget(u.email);poll();}} style={{width:"100%",background:dmTarget===u.email?"#9b6dff22":"transparent",border:"none",borderRadius:6,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,textAlign:"left",cursor:"pointer"}}>
              <div style={{position:"relative"}}>
                <UserAvatar name={u.name} size={30} photo={u.photo}/>
                <div style={{position:"absolute",bottom:-1,right:-1,width:9,height:9,borderRadius:"50%",background:"#44ff88",border:"2px solid #0f0b22"}}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:12,fontWeight:600,color:dmTarget===u.email?"#c8a8ff":"#d8d0ee"}}>{u.name}</span>{getRole(u.name)&&<RoleBadge role={getRole(u.name)!}/>}</div>
                <div style={{fontSize:10,color:"#44ff88"}}>● Online</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
    if(activeNav===3) return (
      <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
        <div style={{padding:"12px",borderBottom:"1px solid #1e1535",flexShrink:0}}><div style={{fontWeight:700,fontSize:13}}>🌐 Discover Clubs</div></div>
        <div style={{flex:1,overflowY:"auto",padding:8,display:"flex",flexDirection:"column",gap:7}}>
          {[{n:"RPG Masters",i:"🗡️",c:"#ff6644",m:1240},{n:"Speedrunners",i:"⚡",c:"#ffdd00",m:890},{n:"Chill Zone",i:"🌊",c:"#00ddff",m:2100},{n:"FPS Elite",i:"🎯",c:"#ff4488",m:3400},{n:"Strategy HQ",i:"♟️",c:"#44ffaa",m:560}].map(x=>(
            <div key={x.n} style={{background:"#1a1430",border:`1px solid ${x.c}33`,borderRadius:9,padding:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <div style={{width:32,height:32,borderRadius:7,background:`${x.c}22`,border:`2px solid ${x.c}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{x.i}</div>
                <div><div style={{fontWeight:600,fontSize:12}}>{x.n}</div><div style={{fontSize:10,color:"#7766aa"}}>{x.m.toLocaleString()} members</div></div>
              </div>
              <button style={{background:`${x.c}22`,border:`1px solid ${x.c}55`,borderRadius:5,padding:"3px 10px",color:x.c,fontSize:10,fontWeight:600,cursor:"pointer"}}>Join</button>
            </div>
          ))}
        </div>
      </div>
    );
    if(activeNav===4) return (
      <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
        <div style={{padding:"12px",borderBottom:"1px solid #1e1535",flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:13}}>👥 Online — {online.length}</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
          {online.map(u=>(
            <div key={u.email} style={{padding:"7px 12px",display:"flex",alignItems:"center",gap:8}}>
              <div style={{position:"relative"}}>
                <UserAvatar name={u.name} size={30} photo={u.photo}/>
                <div style={{position:"absolute",bottom:-1,right:-1,width:8,height:8,borderRadius:"50%",background:"#44ff88",border:"2px solid #0f0b22"}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:12,fontWeight:600}}>{u.name}{u.email===user.email?" (you)":""}</span>{getRole(u.name)&&<RoleBadge role={getRole(u.name)!}/>}</div>
                <div style={{fontSize:10,color:"#44ff88"}}>● Online</div>
              </div>
              {u.email!==user.email&&(
                <button onClick={()=>{setDmTarget(u.email);setActiveNav(2);}} style={{background:"#9b6dff22",border:"1px solid #9b6dff44",borderRadius:5,padding:"3px 8px",color:"#c8a8ff",fontSize:10,cursor:"pointer"}}>DM</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
    if(activeNav===5) return (
      <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
        <div style={{padding:"12px",borderBottom:"1px solid #1e1535",flexShrink:0}}><div style={{fontWeight:700,fontSize:13}}>👤 Profile</div></div>
        <div style={{flex:1,overflowY:"auto",padding:12}}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <UserAvatar name={user.name} size={64} photo={user.photo}/>
            <div style={{fontWeight:700,fontSize:16,marginTop:8,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{user.name}{getRole(user.name)&&<RoleBadge role={getRole(user.name)!}/>}</div>
            <div style={{fontSize:11,color:"#7766aa",marginTop:2}}>{user.email}</div>
            <div style={{marginTop:6}}>
              {user.provider==="google"&&<span style={{background:"#4285F422",color:"#4285F4",padding:"2px 8px",borderRadius:4,fontSize:10}}>🔗 Google</span>}
              {user.provider==="facebook"&&<span style={{background:"#1877F222",color:"#1877F2",padding:"2px 8px",borderRadius:4,fontSize:10}}>🔗 Facebook</span>}
              {user.provider==="email"&&<span style={{background:"#9b6dff22",color:"#c8a8ff",padding:"2px 8px",borderRadius:4,fontSize:10}}>✉️ Email</span>}
            </div>
          </div>
          <div style={{background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,padding:12,marginBottom:10}}>
            {[["Squad","⚔️ Wumpus Squad"],["Status","🟢 Online"],["Messages",`${Object.values(msgs).flat().filter(m=>m.email===user.email).length} sent`],["Clubs",`${clubs.filter(c=>c.members.includes(user.email)).length} joined`]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0"}}>
                <span style={{color:"#7766aa"}}>{k}</span><span style={{color:"#c8a8ff"}}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={onLogout} style={{width:"100%",background:"#ff444422",border:"1px solid #ff444455",borderRadius:8,padding:"9px",color:"#ff8888",fontSize:12,fontWeight:600,cursor:"pointer"}}>Sign Out</button>
        </div>
      </div>
    );
    if(activeNav===6) {
      const CLUB_COLORS=["#9b6dff","#e040fb","#00e5ff","#44ff88","#ff4488","#ffaa00","#ff6644","#00ddcc"];
      const CLUB_ICONS=["🎮","⚔️","🛡","🏆","🎯","💥","🌍","🔥","👾","🚀","🎵","🎲","🤖","🐉","🦊","🏅"];
      const myClubs=clubs.filter(c=>c.members.includes(user.email));
      const otherClubs=clubs.filter(c=>!c.members.includes(user.email));

      if(clubView) {
        const cv=clubs.find(c=>c.id===clubView.id)||clubView;
        const isMember=cv.members.includes(user.email);
        return (
          <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
            <div style={{padding:"10px 12px",borderBottom:"1px solid #1e1535",flexShrink:0,display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>setClubView(null)} style={{background:"none",border:"none",color:"#9b6dff",fontSize:16,cursor:"pointer",padding:0}}>←</button>
              <div style={{width:28,height:28,borderRadius:7,background:`${cv.color}22`,border:`2px solid ${cv.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>{cv.icon}</div>
              <span style={{fontWeight:700,fontSize:13,flex:1}}>{cv.name}</span>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{background:"#1a1430",border:`1px solid ${cv.color}33`,borderRadius:10,padding:14}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:48,height:48,borderRadius:12,background:`${cv.color}22`,border:`3px solid ${cv.color}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{cv.icon}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{cv.name}</div>
                    <div style={{fontSize:10,color:"#7766aa"}}>Founded by {cv.createdBy}</div>
                  </div>
                </div>
                {cv.description&&<div style={{fontSize:12,color:"#b8a8d8",lineHeight:1.6,marginBottom:10}}>{cv.description}</div>}
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:11,color:"#7766aa"}}>👥 {cv.members.length} member{cv.members.length!==1?"s":""}</span>
                  {isMember
                    ?<button onClick={()=>leaveClub(cv.id)} style={{background:"#ff444422",border:"1px solid #ff444455",borderRadius:6,padding:"4px 12px",color:"#ff8888",fontSize:11,fontWeight:600,cursor:"pointer"}}>Leave</button>
                    :<button onClick={()=>joinClub(cv.id)} style={{background:`${cv.color}22`,border:`1px solid ${cv.color}55`,borderRadius:6,padding:"4px 12px",color:cv.color,fontSize:11,fontWeight:600,cursor:"pointer"}}>Join Club</button>
                  }
                </div>
              </div>
              <div style={{fontWeight:600,fontSize:11,color:"#7766aa",paddingLeft:2}}>MEMBERS</div>
              {online.filter(u=>cv.members.includes(u.email)).map(u=>(
                <div key={u.email} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{position:"relative"}}><UserAvatar name={u.name} size={26} photo={u.photo}/><div style={{position:"absolute",bottom:-1,right:-1,width:7,height:7,borderRadius:"50%",background:"#44ff88",border:"2px solid #0f0b22"}}/></div>
                  <span style={{fontSize:12,fontWeight:600}}>{u.name}{u.email===user.email?" (you)":""}</span>
                  {getRole(u.name)&&<RoleBadge role={getRole(u.name)!}/>}
                </div>
              ))}
              {cv.members.filter(e=>!online.find(u=>u.email===e)).length>0&&(
                <div style={{fontSize:11,color:"#4a3a66"}}>+{cv.members.filter(e=>!online.find(u=>u.email===e)).length} offline member{cv.members.filter(e=>!online.find(u=>u.email===e)).length!==1?"s":""}</div>
              )}
            </div>
          </div>
        );
      }

      return (
        <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid #1e1535",flexShrink:0,display:"flex",alignItems:"center"}}>
            <span style={{fontWeight:700,fontSize:13,flex:1}}>🏆 Clubs</span>
            <button onClick={()=>setShowCreateClub(true)} style={{background:"#9b6dff33",border:"1px solid #9b6dff55",borderRadius:6,padding:"4px 10px",color:"#c8a8ff",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Create</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:8,display:"flex",flexDirection:"column",gap:7}}>
            {myClubs.length>0&&<div style={{fontSize:10,fontWeight:700,color:"#7766aa",padding:"2px 4px"}}>YOUR CLUBS</div>}
            {myClubs.map(c=>(
              <div key={c.id} onClick={()=>setClubView(c)} style={{background:"#1a1430",border:`1px solid ${c.color}44`,borderRadius:9,padding:"10px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:9,background:`${c.color}22`,border:`2px solid ${c.color}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{c.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:12,marginBottom:2}}>{c.name}</div>
                  <div style={{fontSize:10,color:"#7766aa"}}>👥 {c.members.length} member{c.members.length!==1?"s":""}</div>
                </div>
                <span style={{background:`${c.color}22`,color:c.color,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4}}>JOINED</span>
              </div>
            ))}
            {otherClubs.length>0&&<div style={{fontSize:10,fontWeight:700,color:"#7766aa",padding:"2px 4px",marginTop:4}}>DISCOVER</div>}
            {otherClubs.map(c=>(
              <div key={c.id} style={{background:"#1a1430",border:`1px solid ${c.color}22`,borderRadius:9,padding:"10px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <div style={{width:36,height:36,borderRadius:9,background:`${c.color}22`,border:`2px solid ${c.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{c.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,marginBottom:2}}>{c.name}</div>
                    {c.description&&<div style={{fontSize:10,color:"#7766aa",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.description}</div>}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:10,color:"#7766aa"}}>👥 {c.members.length} member{c.members.length!==1?"s":""}</span>
                  <div style={{display:"flex",gap:5}}>
                    <button onClick={()=>setClubView(c)} style={{background:"transparent",border:"1px solid #2e2050",borderRadius:5,padding:"3px 8px",color:"#7766aa",fontSize:10,cursor:"pointer"}}>View</button>
                    <button onClick={()=>joinClub(c.id)} style={{background:`${c.color}22`,border:`1px solid ${c.color}55`,borderRadius:5,padding:"3px 10px",color:c.color,fontSize:10,fontWeight:600,cursor:"pointer"}}>Join</button>
                  </div>
                </div>
              </div>
            ))}
            {clubs.length===0&&(
              <div style={{textAlign:"center",padding:"40px 20px",color:"#4a3a66"}}>
                <div style={{fontSize:32,marginBottom:8}}>🏆</div>
                <div style={{fontSize:12,marginBottom:4}}>No clubs yet</div>
                <div style={{fontSize:11}}>Be the first to create one!</div>
              </div>
            )}
          </div>

          {/* CREATE CLUB MODAL */}
          {showCreateClub&&(
            <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setShowCreateClub(false)}}>
              <div style={{background:"#1a1430",border:"1px solid #9b6dff55",borderRadius:14,padding:24,width:320,boxShadow:"0 0 40px #9b6dff33",maxHeight:"80vh",overflowY:"auto"}}>
                <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Create a Club</div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"#7766aa",marginBottom:5}}>Icon</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {CLUB_ICONS.map(ic=>(
                      <button key={ic} onClick={()=>setNewClubIcon(ic)} style={{fontSize:16,background:newClubIcon===ic?"#9b6dff44":"#2e205055",border:`1px solid ${newClubIcon===ic?"#9b6dff":"#2e2050"}`,borderRadius:6,padding:"4px 6px",cursor:"pointer"}}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"#7766aa",marginBottom:5}}>Color</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {CLUB_COLORS.map(col=>(
                      <button key={col} onClick={()=>setNewClubColor(col)} style={{width:24,height:24,borderRadius:"50%",background:col,border:`2px solid ${newClubColor===col?"#fff":"transparent"}`,cursor:"pointer"}}/>
                    ))}
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"#7766aa",marginBottom:5}}>Club Name *</div>
                  <input value={newClubName} onChange={e=>setNewClubName(e.target.value)} placeholder="e.g. Ranked Grinders" style={{width:"100%",background:"#0d0a1a",border:"1px solid #2e2050",borderRadius:7,padding:"8px 10px",color:"#e8e0ff",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:"#7766aa",marginBottom:5}}>Description</div>
                  <textarea value={newClubDesc} onChange={e=>setNewClubDesc(e.target.value)} placeholder="What's this club about?" rows={2} style={{width:"100%",background:"#0d0a1a",border:"1px solid #2e2050",borderRadius:7,padding:"8px 10px",color:"#e8e0ff",fontSize:12,boxSizing:"border-box",resize:"none",fontFamily:"inherit"}}/>
                </div>
                <div style={{background:`${newClubColor}11`,border:`1px solid ${newClubColor}33`,borderRadius:8,padding:"8px 10px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:20}}>{newClubIcon}</div>
                  <div><div style={{fontWeight:700,fontSize:12,color:newClubColor}}>{newClubName||"Club Name"}</div><div style={{fontSize:10,color:"#7766aa"}}>{newClubDesc||"Your description"}</div></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setShowCreateClub(false)} style={{flex:1,background:"#2e205055",border:"1px solid #2e2050",borderRadius:7,padding:"8px 0",color:"#7766aa",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  <button onClick={createClub} disabled={!newClubName.trim()} style={{flex:1,background:newClubName.trim()?newClubColor:"#9b6dff44",border:`1px solid ${newClubName.trim()?newClubColor:"#9b6dff"}`,borderRadius:7,padding:"8px 0",color:"#fff",fontSize:13,fontWeight:700,cursor:newClubName.trim()?"pointer":"default"}}>Create Club</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{background:"#0d0a1a",height:"100vh",display:"flex",color:"#e8e0ff",fontFamily:"system-ui,-apple-system,sans-serif",overflow:"hidden"}}>
      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes glow{0%,100%{filter:drop-shadow(0 0 4px #9b6dff77)}50%{filter:drop-shadow(0 0 12px #9b6dffcc)}}
        @keyframes vp{from{transform:scaleY(0.5)}to{transform:scaleY(1)}}
        @keyframes fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#2e2050;border-radius:2px}
        input{outline:none;caret-color:#9b6dff}
        button{transition:filter 0.15s;cursor:pointer}button:hover{filter:brightness(1.2)}
      `}</style>

      {/* MAP MODAL */}
      {showMap&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowMap(false)}>
          <div style={{background:"#1a1430",border:"1px solid #9b6dff55",borderRadius:14,padding:24,width:460}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
              <span style={{fontWeight:700,fontSize:16}}>🗺️ Tactical Map</span>
              <button onClick={()=>setShowMap(false)} style={{background:"none",border:"none",color:"#9b6dff",fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            <svg width="100%" height="200" viewBox="0 0 400 200" style={{background:"#0d0a1a",borderRadius:8}}>
              {[...Array(10)].map((_,i)=><line key={`v${i}`} x1={i*40} y1="0" x2={i*40} y2="200" stroke="#2e2050" strokeWidth="0.5"/>)}
              {[...Array(5)].map((_,i)=><line key={`h${i}`} x1="0" y1={i*40} x2="400" y2={i*40} stroke="#2e2050" strokeWidth="0.5"/>)}
              <rect x="60" y="40" width="80" height="60" fill="#3a1a00" opacity="0.8" rx="4"/>
              <rect x="240" y="70" width="100" height="80" fill="#1a3a00" opacity="0.6" rx="4"/>
              <circle cx="30" cy="170" r="12" fill="#9b6dff" opacity="0.8"/><text x="30" y="174" textAnchor="middle" fontSize="10" fill="#fff">A</text>
              <circle cx="370" cy="30" r="12" fill="#e040fb" opacity="0.8"/><text x="370" y="34" textAnchor="middle" fontSize="10" fill="#fff">B</text>
              <path d="M 42 158 Q 130 110 230 50" fill="none" stroke="#9b6dff" strokeWidth="2" strokeDasharray="6,3" opacity="0.7"/>
              <text x="100" y="90" fontSize="16" textAnchor="middle">🎯</text><text x="200" y="120" fontSize="16" textAnchor="middle">💥</text>
            </svg>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              {["Flank Left","Hold Mid","Rush B"].map(s=>(
                <button key={s} style={{flex:1,background:"#9b6dff22",border:"1px solid #9b6dff55",borderRadius:7,padding:"7px",color:"#c8a8ff",fontSize:11,cursor:"pointer"}}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LOADOUT MODAL */}
      {showLoadout&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowLoadout(false)}>
          <div style={{background:"#1a1430",border:"1px solid #9b6dff55",borderRadius:14,padding:24,width:380}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
              <span style={{fontWeight:700,fontSize:16}}>⊟ Unit Loadout</span>
              <button onClick={()=>setShowLoadout(false)} style={{background:"none",border:"none",color:"#9b6dff",fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            {[{label:"Weapon",opts:["Rifle","Shotgun","Sniper","SMG"],k:"weapon"},{label:"Armor",opts:["Light","Medium","Heavy","Shield"],k:"armor"},{label:"Perk",opts:["Stealth","Speed","Regen","Power"],k:"perk"}].map(({label,opts,k})=>(
              <div key={k} style={{marginBottom:14}}>
                <div style={{fontSize:10,color:"#7766aa",marginBottom:6,letterSpacing:1}}>{label.toUpperCase()}</div>
                <div style={{display:"flex",gap:6}}>
                  {opts.map(o=>(
                    <button key={o} onClick={()=>setLoadoutSel(s=>({...s,[k]:o}))} style={{flex:1,padding:"7px 0",borderRadius:7,fontSize:11,background:loadoutSel[k]===o?"#9b6dff44":"#0d0a1a",border:`1.5px solid ${loadoutSel[k]===o?"#9b6dff":"#2e2050"}`,color:loadoutSel[k]===o?"#c8a8ff":"#7766aa",cursor:"pointer"}}>{o}</button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={()=>setShowLoadout(false)} style={{width:"100%",background:"#9b6dff",border:"none",borderRadius:8,padding:"9px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Save Loadout ✓</button>
          </div>
        </div>
      )}

      {/* NAV RAIL */}
      <div style={{width:54,background:"#080614",display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 0",gap:4,borderRight:"1px solid #1e1535",flexShrink:0}}>
        <div style={{animation:"glow 2.5s infinite",marginBottom:10,cursor:"pointer"}} onClick={()=>setActiveNav(1)}><PixelNelly size={36}/></div>
        {navItems.map((item,i)=>(
          <button key={i} title={item.tip} onClick={()=>{setActiveNav(i);if(i!==2)setDmTarget(null);}}
            style={{width:38,height:38,borderRadius:activeNav===i?10:19,background:activeNav===i?"#9b6dff28":"transparent",border:activeNav===i?"1px solid #9b6dff55":"1px solid transparent",color:activeNav===i?"#c8a8ff":"#5544aa",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
            {item.icon}
          </button>
        ))}
        <div style={{flex:1}}/>
        <div style={{fontSize:9,color:"#44ff88",textAlign:"center",marginBottom:4}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#44ff88",margin:"0 auto 2px"}}/>
          {online.length}
        </div>
      </div>

      {/* LEFT SIDEBAR */}
      <div style={{width:194,background:"#0f0b22",display:"flex",flexDirection:"column",borderRight:"1px solid #1e1535",flexShrink:0,overflow:"hidden"}}>
        {sidebar()}
        <div style={{padding:"7px 10px",borderTop:"1px solid #1e1535",display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
          <UserAvatar name={user.name} size={26} photo={user.photo}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:11,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</span>{getRole(user.name)&&<RoleBadge role={getRole(user.name)!}/>}</div>
            <div style={{fontSize:9,color:"#44ff88"}}>● Online</div>
          </div>
          <button onClick={()=>setActiveNav(5)} style={{background:"none",border:"none",color:"#6655aa",fontSize:14}}>⚙</button>
        </div>
      </div>

      {/* MAIN */}
      {activeNav===2&&dmTarget?(
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <div style={{padding:"10px 16px",borderBottom:"1px solid #150f28",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            {(()=>{const u=online.find(x=>x.email===dmTarget);return u?(
              <>
                <div style={{position:"relative"}}><UserAvatar name={u.name} size={30} photo={u.photo}/><div style={{position:"absolute",bottom:-1,right:-1,width:9,height:9,borderRadius:"50%",background:"#44ff88",border:"2px solid #0d0a1a"}}/></div>
                <div><div style={{fontWeight:700,fontSize:14}}>{u.name}</div><div style={{fontSize:10,color:"#44ff88"}}>● Online · Direct Message</div></div>
              </>
            ):<div style={{fontWeight:700}}>Direct Message</div>;})()}
            <button onClick={()=>setDmTarget(null)} style={{marginLeft:"auto",background:"#1a1430",border:"1px solid #2e2050",borderRadius:7,padding:"5px 10px",color:"#8877aa",fontSize:11}}>← Back</button>
          </div>
          <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:2}}>
            {curDms.length===0&&<div style={{textAlign:"center",marginTop:50,color:"#5544aa"}}><div style={{fontSize:40,marginBottom:8}}>💬</div>Start your conversation!</div>}
            {curDms.map((m,i,arr)=>{
              const grouped=arr[i-1]?.email===m.email;const isMe=m.email===user.email;
              return(
                <div key={m.id} style={{display:"flex",gap:10,marginTop:grouped?1:10,animation:"fadein 0.2s ease",flexDirection:isMe?"row-reverse":"row"}}>
                  {!grouped?<UserAvatar name={m.name} size={30} photo={m.photo}/>:<div style={{width:30,flexShrink:0}}/>}
                  <div style={{maxWidth:"68%"}}>
                    {!grouped&&<div style={{fontSize:10,color:"#5544aa",marginBottom:3,textAlign:isMe?"right":"left",display:"flex",gap:4,alignItems:"center",justifyContent:isMe?"flex-end":"flex-start"}}><span style={{color:isMe?"#9b6dff":"#8877aa",fontWeight:600}}>{m.name}</span>{getRole(m.name)&&<RoleBadge role={getRole(m.name)!}/>}<span>·{m.ts}</span></div>}
                    <div style={{fontSize:13,lineHeight:1.5,background:isMe?"#9b6dff33":"#1a1430",border:`1px solid ${isMe?"#9b6dff44":"#2e2050"}`,padding:"7px 11px",borderRadius:isMe?"12px 12px 3px 12px":"12px 12px 12px 3px",display:"inline-block",color:"#e8e0ff"}}>{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{padding:"10px 14px",borderTop:"1px solid #150f28",flexShrink:0}}>
            <div style={{display:"flex",gap:8,background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,padding:"4px 6px 4px 12px",alignItems:"center"}}>
              <input value={dmInput} onChange={e=>setDmInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendDm()} placeholder={`Message ${online.find(x=>x.email===dmTarget)?.name||""}…`} style={{flex:1,background:"transparent",border:"none",color:"#e8e0ff",fontSize:13,padding:"5px 0"}}/>
              <button onClick={sendDm} style={{background:dmInput.trim()?"#9b6dff":"#2e2050",border:"none",borderRadius:7,padding:"6px 12px",color:dmInput.trim()?"#fff":"#6655aa",fontSize:14,fontWeight:600,transition:"all 0.2s"}}>↑</button>
            </div>
          </div>
        </div>
      ):(
        <>
          {/* ACTIVITY FEED */}
          <div style={{width:258,display:"flex",flexDirection:"column",borderRight:"1px solid #1e1535",flexShrink:0}}>
            <div style={{flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",padding:"10px 13px 6px",gap:6}}>
                <span style={{fontWeight:700,fontSize:13}}>Activity Feed</span>
                <span style={{marginLeft:"auto",fontSize:10,color:"#44ff88"}}>●{online.length}</span>
              </div>
              <div style={{display:"flex",gap:2,padding:"0 8px 6px",overflowX:"auto",borderBottom:"1px solid #1e153522"}}>
                {allChannels.filter(c=>c.id!=="voice").map(ch=>(
                  <button key={ch.id} onClick={()=>setChannel(ch.id)} style={{background:activeChannel===ch.id?"#9b6dff33":"transparent",border:`1px solid ${activeChannel===ch.id?"#9b6dff55":"transparent"}`,borderRadius:6,padding:"3px 8px",fontSize:10,color:activeChannel===ch.id?"#c8a8ff":"#6655aa",whiteSpace:"nowrap"}}>{ch.icon}{ch.label}</button>
                ))}
                <button onClick={()=>setShowCreateGroup(true)} style={{background:"transparent",border:"1px solid #2e205055",borderRadius:6,padding:"3px 7px",fontSize:10,color:"#9b6dff",whiteSpace:"nowrap",fontWeight:700}}>+ New</button>
              </div>
            </div>
            <div style={{padding:"6px 13px 4px",borderBottom:"1px solid #1e153515",flexShrink:0}}>
              {["Nellly mov wveare bowislooe Wumpus Squad.","You can now we avoits this inrredine.!","bbc scale nlit to the engaime night planned!"].map((t,i)=>(
                <div key={i} style={{fontSize:10,color:"#6655aa",marginBottom:2,lineHeight:1.5}}>{t}</div>
              ))}
            </div>
            <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"5px 0"}}>
              {curMsgs.length===0&&<div style={{textAlign:"center",color:"#5544aa",fontSize:12,marginTop:30,padding:"0 16px"}}>No messages yet. Say something! 👋</div>}
              {curMsgs.map((m,i,arr)=>{
                const grouped=arr[i-1]?.email===m.email;const isMe=m.email===user.email;const col=isMe?"#44ff88":colorFor(m.name);
                return(
                  <div key={m.id} style={{padding:`${grouped?1:6}px 13px`,display:"flex",gap:8,animation:"fadein 0.2s ease"}}>
                    {!grouped?<UserAvatar name={m.name} size={28} photo={m.photo}/>:<div style={{width:28,flexShrink:0}}/>}
                    <div style={{flex:1,minWidth:0}}>
                      {!grouped&&<div style={{display:"flex",gap:5,alignItems:"center",marginBottom:2,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:12,color:col}}>{m.name}{isMe?" (you)":""}</span>{getRole(m.name)&&<RoleBadge role={getRole(m.name)!}/>}<span style={{fontSize:9,color:"#5544aa",marginLeft:2}}>{m.ts}</span></div>}
                      <div style={{fontSize:11,color:"#d8d0ee",lineHeight:1.5,background:isMe?"#9b6dff15":"transparent",padding:isMe?"3px 7px":"0",borderRadius:isMe?7:0,display:"inline-block",maxWidth:"100%"}}>{m.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{padding:"7px 8px",borderTop:"1px solid #1e1535",flexShrink:0}}>
              <div style={{display:"flex",gap:5}}>
                <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()} placeholder={`Message #${activeChannel}…`} style={{flex:1,background:"#1e153544",border:"1px solid #2e2050",borderRadius:6,padding:"6px 9px",color:"#e8e0ff",fontSize:11}}/>
                <button onClick={sendMsg} style={{background:msg.trim()?"#9b6dff":"#9b6dff33",border:"1px solid #9b6dff55",borderRadius:6,padding:"0 10px",color:msg.trim()?"#fff":"#c8a8ff",fontSize:14,transition:"all 0.2s"}}>↑</button>
              </div>
            </div>
          </div>

          {/* STREAM + BOTTOM */}
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:7,padding:7,minWidth:0}}>
            <div style={{flex:1,background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,overflow:"hidden",position:"relative"}}>
              {/* Live screen share video */}
              {isScreenSharing&&<video ref={screenVideoRef} muted autoPlay playsInline style={{width:"100%",height:"100%",objectFit:"contain",background:"#000"}}/>}
              {/* Live camera video */}
              {isCamLive&&!isScreenSharing&&<video ref={camVideoRef} muted autoPlay playsInline style={{width:"100%",height:"100%",objectFit:"cover",background:"#000"}}/>}
              {/* Default animated bg */}
              {!isScreenSharing&&!isCamLive&&<StreamBg/>}
              <div style={{position:"absolute",top:10,right:12,display:"flex",gap:6,zIndex:2}}>
                {!isScreenSharing&&!isCamLive&&<button onClick={()=>setStreamPlaying(v=>!v)} style={{background:"#0d0a1a99",border:"1px solid #2e2050",borderRadius:5,padding:"4px 8px",color:"#c8b0ff",fontSize:12}}>{streamPlaying?"⏸":"▶"}</button>}
                {isScreenSharing&&<button onClick={stopScreenShare} style={{background:"#ff444499",border:"1px solid #ff4444",borderRadius:5,padding:"4px 8px",color:"#fff",fontSize:11,fontWeight:700}}>⏹ Stop</button>}
                {isCamLive&&<button onClick={stopCamLive} style={{background:"#ff444499",border:"1px solid #ff4444",borderRadius:5,padding:"4px 8px",color:"#fff",fontSize:11,fontWeight:700}}>⏹ End</button>}
              </div>
              <div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",background:"#0d0a1acc",backdropFilter:"blur(6px)",border:"1px solid #2e2050",borderRadius:18,padding:"5px 16px",display:"flex",alignItems:"center",gap:8,zIndex:2}}>
                {isScreenSharing||isCamLive
                  ?<><UserAvatar name={user.name} size={22} photo={user.photo}/><span style={{fontWeight:700,fontSize:13}}>{user.name}</span><LIVE/></>
                  :<><PixelNelly size={22}/><span style={{fontWeight:700,fontSize:13}}>Nelly</span><LIVE/></>
                }
              </div>
              {!streamPlaying&&!isScreenSharing&&!isCamLive&&(
                <div style={{position:"absolute",inset:0,background:"#00000066",zIndex:3,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}} onClick={()=>setStreamPlaying(true)}>
                  <div style={{width:60,height:60,borderRadius:"50%",background:"#9b6dff88",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>▶</div>
                </div>
              )}
              {/* Go live prompt when idle */}
              {!isScreenSharing&&!isCamLive&&(
                <div style={{position:"absolute",bottom:14,right:14,display:"flex",gap:6,zIndex:4}}>
                  <button onClick={startScreenShare} style={{background:"#9b6dff99",border:"1px solid #9b6dff",borderRadius:6,padding:"5px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>🖥 Share Screen</button>
                  <button onClick={startCamLive} style={{background:"#e040fb99",border:"1px solid #e040fb",borderRadius:6,padding:"5px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>📷 Go Live</button>
                </div>
              )}
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"#2e2050",zIndex:2}}>
                <div style={{width:`${progress}%`,height:"100%",background:"linear-gradient(to right,#9b6dff,#e040fb)",borderRadius:2,transition:"width 0.2s linear"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:7,height:154}}>
              <div style={{flex:1,background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,display:"flex",flexDirection:"column"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px 5px"}}>
                  <button onClick={()=>setVoiceOn(v=>!v)} style={{width:32,height:32,borderRadius:7,background:voiceOn?"#9b6dff33":"#ff444433",border:`1.5px solid ${voiceOn?"#9b6dff":"#ff4444"}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg viewBox="0 0 16 20" width="14" height="18" fill={voiceOn?"#9b6dff":"#ff4444"}><rect x="5" y="0" width="6" height="11" rx="3"/><path d="M2 9 Q2 16 8 16 Q14 16 14 9" fill="none" stroke={voiceOn?"#9b6dff":"#ff4444"} strokeWidth="1.5"/><rect x="7" y="16" width="2" height="3"/><rect x="4" y="19" width="8" height="1.5" rx="0.75"/></svg>
                  </button>
                  <span style={{fontWeight:700,fontSize:12,flex:1}}>Voice Chat</span><LIVE/>
                </div>
                <div style={{padding:"2px 12px 4px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{position:"relative"}}><PixelWumpus size={33}/><div style={{position:"absolute",bottom:0,right:0,width:9,height:9,borderRadius:"50%",background:"#44ff88",border:"2px solid #1a1430",animation:"blink 1.2s infinite"}}/></div>
                    <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>Wumpus</div><div style={{fontSize:10,color:"#7766aa"}}>gametime</div></div>
                    {voiceOn&&<VoiceWave active/>}
                  </div>
                  {voiceJoined&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}><UserAvatar name={user.name} size={22} photo={user.photo}/><span style={{fontSize:11,color:"#44ff88"}}>{user.name} (you)</span></div>}
                </div>
                <div style={{padding:"4px 12px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"auto"}}>
                  <button onClick={()=>setVoiceJoined(v=>!v)} style={{background:voiceJoined?"#ff444422":"#44ff8822",border:`1px solid ${voiceJoined?"#ff4444":"#44ff88"}`,borderRadius:6,padding:"3px 10px",color:voiceJoined?"#ff8888":"#44ff88",fontSize:10,fontWeight:600}}>{voiceJoined?"Disconnect":"Join"}</button>
                  <div style={{display:"flex",gap:5}}><PixelNelly size={20}/><PixelWumpus size={20}/>{voiceJoined&&<UserAvatar name={user.name} size={20} photo={user.photo}/>}</div>
                </div>
              </div>
              <div style={{flex:1,background:"#1a1430",border:"1px solid #2e2050",borderRadius:10,display:"flex",flexDirection:"column"}}>
                <div style={{display:"flex",alignItems:"center",padding:"9px 12px 4px",borderBottom:"1px solid #2e205025"}}>
                  <span style={{color:"#7766aa",fontSize:16,marginRight:5}}>#</span>
                  <span style={{fontWeight:700,fontSize:12,flex:1}}>Channels</span>
                  <button onClick={()=>setShowCreateGroup(true)} title="Create group" style={{background:"#9b6dff33",border:"1px solid #9b6dff55",borderRadius:5,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",color:"#c8a8ff",fontSize:14,fontWeight:700,cursor:"pointer",lineHeight:1}}>+</button>
                </div>
                <ChanGraph channels={CHANNELS} active={activeChannel} onSelect={setChannel}/>
                <div style={{padding:"0 10px 6px",display:"flex",flexWrap:"wrap",gap:4,overflowY:"auto",maxHeight:54}}>
                  {allChannels.map(ch=>(
                    <button key={ch.id} onClick={()=>setChannel(ch.id)} style={{background:activeChannel===ch.id?"#9b6dff33":"transparent",border:`1px solid ${activeChannel===ch.id?"#9b6dff55":"#2e2050"}`,borderRadius:5,padding:"2px 7px",fontSize:9,color:activeChannel===ch.id?"#c8a8ff":"#6655aa"}}>{ch.icon}{ch.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* CREATE GROUP MODAL */}
          {showCreateGroup&&(
            <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setShowCreateGroup(false)}}>
              <div style={{background:"#1a1430",border:"1px solid #9b6dff55",borderRadius:14,padding:24,width:300,boxShadow:"0 0 40px #9b6dff33"}}>
                <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Create New Group</div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"#7766aa",marginBottom:5}}>Group Icon</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {["🎮","⚔️","🛡","🏆","🎯","💥","🌍","🔥","💬","🎵","📢","🤝"].map(ic=>(
                      <button key={ic} onClick={()=>setNewGroupIcon(ic)} style={{fontSize:18,background:newGroupIcon===ic?"#9b6dff44":"#2e205055",border:`1px solid ${newGroupIcon===ic?"#9b6dff":"#2e2050"}`,borderRadius:6,padding:"4px 6px",cursor:"pointer"}}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:"#7766aa",marginBottom:5}}>Group Name</div>
                  <input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createGroup()} placeholder="e.g. ranked-squad" style={{width:"100%",background:"#0d0a1a",border:"1px solid #2e2050",borderRadius:7,padding:"8px 10px",color:"#e8e0ff",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setShowCreateGroup(false)} style={{flex:1,background:"#2e205055",border:"1px solid #2e2050",borderRadius:7,padding:"8px 0",color:"#7766aa",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  <button onClick={createGroup} disabled={!newGroupName.trim()} style={{flex:1,background:newGroupName.trim()?"#9b6dff":"#9b6dff44",border:"1px solid #9b6dff",borderRadius:7,padding:"8px 0",color:"#fff",fontSize:13,fontWeight:700,cursor:newGroupName.trim()?"pointer":"default"}}>Create</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
