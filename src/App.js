import React, { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import confetti from "canvas-confetti";
import { v4 as uuidv4 } from "uuid";
import { Toaster, toast } from "sonner";

// Firebase Auth (kept from previous build)
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBaRd3ocStvSqzHec4MHgz5IFPdetRhtCs",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "lilipad-crm.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "lilipad-crm",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:341975896867:web:eb092407b35dd580333296",
};
let app, auth;
try { app = initializeApp(firebaseConfig); auth = getAuth(app); } catch {}

// ===== UI helpers (no external UI lib) =====
const Btn = ({ children, onClick, kind = "default", disabled, style, title }) => (
  <button title={title} onClick={onClick} disabled={disabled}
    style={{
      padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5e1",
      background: disabled ? "#e2e8f0" : kind === "primary" ? "#1e293b" : "#fff",
      color: disabled ? "#94a3b8" : kind === "primary" ? "#fff" : "#0f172a",
      cursor: disabled ? "not-allowed" : "pointer", ...style,
    }}>{children}</button>
);
const Input = ({ error, label, required, ...p }) => (
  <label style={{ display: "grid", gap: 6 }}>
    {label && (
      <span style={{ fontSize: 12, color: error ? "#b91c1c" : "#64748b" }}>
        {label}{required ? " *" : ""}
      </span>
    )}
    <input {...p} style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${error ? "#b91c1c" : "#cbd5e1"}` }} />
    {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
  </label>
);
const Textarea = ({ error, label, required, ...p }) => (
  <label style={{ display: "grid", gap: 6 }}>
    {label && (
      <span style={{ fontSize: 12, color: error ? "#b91c1c" : "#64748b" }}>
        {label}{required ? " *" : ""}
      </span>
    )}
    <textarea {...p} style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${error ? "#b91c1c" : "#cbd5e1"}` }} />
    {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
  </label>
);
const Select = ({ label, required, error, children, ...p }) => (
  <label style={{ display: "grid", gap: 6 }}>
    {label && <span style={{ fontSize: 12, color: error ? "#b91c1c" : "#64748b" }}>{label}{required ? " *" : ""}</span>}
    <select {...p} style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${error ? "#b91c1c" : "#cbd5e1"}` }}>
      {children}
    </select>
    {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
  </label>
);
const Card = ({ children }) => <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}>{children}</div>;
const CardHeader = ({ children, right }) => (
  <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <div>{children}</div>
    <div>{right}</div>
  </div>
);
const CardTitle = ({ children }) => <div style={{ fontWeight: 700 }}>{children}</div>;
const CardContent = ({ children }) => <div style={{ padding: 24 }}>{children}</div>;
const Badge = ({ children }) => <span style={{ border: "1px solid #cbd5e1", borderRadius: 999, padding: "2px 8px", fontSize: 12, background: "#f8fafc" }}>{children}</span>;

// ===== Data model / constants =====
const STAGES = [
  { id: "database", label: "Database" },
  { id: "pipeline", label: "Pipeline" },
  { id: "under_progress", label: "Under Progress" },
  { id: "submitted", label: "Submitted" },
  { id: "closed_won", label: "Closed — Won" },
  { id: "closed_lost", label: "Closed — Lost" },
];

const STORAGE_KEY = "lilipad_grants_crm_v2";

const emptyGrant = () => ({
  id: uuidv4(),
  grantName: "",
  type: "", // Grant (Public) | Grant (Corporate) | Not a grant
  funder: "",
  website: "",
  deadline: "",
  country: "",
  sector: "Education / Children",
  amount: "",
  contactName: "",
  contactEmail: "",
  notes: "",
  savedEmailSubject: "",
  savedEmailBody: "",
  stage: "database",
  lastActivity: new Date().toISOString(),
});

const defaultTemplates = [
  {
    id: "t1",
    name: "Intro + Fit",
    subject: "lilipad x {Funder}: Grant inquiry for {Grant}",
    body:
      "Hi {FirstName},\n\nI'm Aadi from lilipad (lilipadlibrary.org). We help kids from marginalized communities build reading habits through community-led libraries. I noticed {Funder}'s focus on {Sector} and thought {Grant} could be a strong fit.\n\nQuick context:\n• Impact: 10,000+ books in rotation, {Region} focus\n• Model: Community libraries inside schools & shelters\n• What we seek: Support for {Grant} ({Amount})\n\nWould you be open to a 20-min chat next week?\n\nThanks,\nAadi",
  },
];

// ===== Utilities =====
function useLocalState(key, initial) {
  const [s, setS] = useState(() => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(s)); } catch {} }, [key, s]);
  return [s, setS];
}
function mergeTemplate(tpl, g) {
  const firstName = (g.contactName || "").split(" ")[0] || "there";
  const map = { "{FirstName}": firstName, "{Grant}": g.grantName || "your grant", "{Funder}": g.funder || "your foundation", "{Sector}": g.sector || "education", "{Amount}": g.amount || "support", "{Region}": g.country || "our regions" };
  let subject = tpl.subject, body = tpl.body; Object.entries(map).forEach(([k, v]) => { subject = subject.split(k).join(v); body = body.split(k).join(v); });
  return { subject, body };
}
function isValidUrl(u) { try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:"; } catch { return false; } }

// ===== Rows & Cards =====
function StageBadge({ stage }) { const label = STAGES.find(s => s.id === stage)?.label || stage; return <Badge>{label}</Badge>; }

function GrantRow({ g, selected, onToggle }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "60px 1.5fr 1fr 1fr 1fr 120px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
      <div><input type="checkbox" checked={!!selected} onChange={() => onToggle(g.id)} /></div>
      <div>
        <button onClick={g.onOpen} style={{ background: "transparent", border: "none", padding: 0, margin: 0, textAlign: "left", fontWeight: 600, cursor: "pointer" }}>{g.grantName || "—"}</button>
        <a href={g.website || "#"} target="_blank" rel="noreferrer" style={{ color: "#64748b", fontSize: 12, textDecoration: "underline" }}>{g.funder || g.website || ""}</a>
      </div>
      <div style={{ color: "#64748b", fontSize: 13 }}>{g.deadline || "—"}</div>
      <div style={{ color: "#64748b", fontSize: 13 }}>{g.country || "—"}</div>
      <div style={{ color: "#64748b", fontSize: 13 }}>{g.contactName || "—"}</div>
      <div style={{ textAlign: "right" }}><StageBadge stage={g.stage} /></div>
    </div>
  );
}

function SortableCard({ grant, onOpen, onDelete, canDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: grant.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={{ ...style, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)" }} {...attributes} {...listeners}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <button onClick={onOpen} style={{ background: "transparent", border: 0, padding: 0, margin: 0, fontWeight: 700, cursor: "pointer" }}>{grant.grantName || "Untitled grant"}</button>
          <div style={{ color: "#64748b", fontSize: 12 }}>{grant.funder}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canDelete && <Btn onClick={() => onDelete(grant.id)} title="Delete">Delete</Btn>}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 14 }}>
        <div>Deadline: {grant.deadline || "—"}</div>
        <div>Contact: {grant.contactName || "—"} ({grant.contactEmail || "—"})</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {grant.country && <Badge>{grant.country}</Badge>}
        {grant.sector && <Badge>{grant.sector}</Badge>}
        {grant.amount && <Badge>{grant.amount}</Badge>}
        {grant.type && <Badge>{grant.type}</Badge>}
      </div>
    </div>
  );
}

// ===== Dialog =====
function GrantDialog({ open, onClose, grant, onSaveEmail }) {
  const [subject, setSubject] = useState(grant?.savedEmailSubject || "");
  const [body, setBody] = useState(grant?.savedEmailBody || "");
  useEffect(() => { if (open) { setSubject(grant?.savedEmailSubject || ""); setBody(grant?.savedEmailBody || ""); } }, [open, grant]);
  if (!open) return null;
  const to = grant?.contactEmail || "";
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 720, maxWidth: "95vw", border: "1px solid #e5e7eb" }}>
        <CardHeader right={<Btn onClick={onClose}>Close</Btn>}><CardTitle>{grant?.grantName}</CardTitle></CardHeader>
        <CardContent>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Contact email" value={to} readOnly/>
            <Input label="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Textarea rows={10} label="Body" value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Btn onClick={() => { onSaveEmail(subject, body); toast.success("Saved"); }}>Save</Btn>
            <Btn kind="primary" onClick={() => window.open(gmail, "_blank")}>Open in Gmail</Btn>
          </div>
        </CardContent>
      </div>
    </div>
  );
}

// ===== Main App =====
function AppInner() {
  const [state, setState] = useLocalState(STORAGE_KEY, {
    items: [
      { ...emptyGrant(), grantName: "Amazon – Meet & Code", funder: "Amazon / Meet & Code", website: "https://meet-and-code.org/", country: "Europe" },
      { ...emptyGrant(), grantName: "SAP Corporate Giving", funder: "SAP", country: "Germany", website: "https://www.sap.com/" },
    ],
    templates: defaultTemplates,
  });

  const [activeTab, setActiveTab] = useState("database"); // database | qualified | pipeline | settings
  const [collapsedAdd, setCollapsedAdd] = useState(true);
  const [newGrant, setNewGrant] = useState(emptyGrant());
  const [errors, setErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [dialogGrant, setDialogGrant] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor));

  const itemsByStage = useMemo(() => {
    const by = { database: [], pipeline: [], under_progress: [], submitted: [], closed_won: [], closed_lost: [] };
    (state.items || []).forEach(g => { by[g.stage || "database"].push(g); });
    return by;
  }, [state.items]);

  function validate(g) {
    const e = {};
    if (!g.grantName?.trim()) e.grantName = "Required";
    if (!g.website?.trim()) e.website = "Required"; else if (!isValidUrl(g.website)) e.website = "Enter a valid URL (http/https)";
    if (!g.deadline?.trim()) e.deadline = "Required";
    if (!g.country?.trim()) e.country = "Required";
    return e;
  }

  function addGrant() {
    const e = validate(newGrant); setErrors(e);
    if (Object.keys(e).length) { toast.error("Please fix the errors"); return; }
    setState(prev => ({ ...prev, items: [{ ...newGrant }, ...prev.items] }));
    setNewGrant(emptyGrant()); setCollapsedAdd(true);
    toast.success("Added to Database");
  }

  function updateGrant(id, patch) {
    setState(prev => ({ ...prev, items: prev.items.map(g => (g.id === id ? { ...g, ...patch, lastActivity: new Date().toISOString() } : g)) }));
  }

  function deleteGrant(id) {
    const g = state.items.find(x => x.id === id);
    if (g?.stage === "database") { toast.error("Cannot delete from Database"); return; }
    setState(prev => ({ ...prev, items: prev.items.filter(g => g.id !== id) }));
  }

  function toggleSelect(id) { setSelectedIds(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])); }

  function bulkMoveToQualified() {
    if (!selectedIds.length) return;
    setState(prev => ({ ...prev, items: prev.items.map(g => (selectedIds.includes(g.id) ? { ...g, stage: "pipeline" } : g)) }));
    setSelectedIds([]); setActiveTab("qualified"); toast("Moved to Qualified");
  }

  function handleDragEnd(event) {
    const { active, over } = event; if (!over) return;
    const grant = state.items.find(i => i.id === active.id); if (!grant) return;
    const targetCol = over.id;
    const valid = STAGES.some(s => s.id === targetCol);
    if (valid && grant.stage !== targetCol) {
      updateGrant(grant.id, { stage: targetCol });
      if (targetCol === "closed_won") { confetti({ particleCount: 140, spread: 70, origin: { y: 0.2 } }); toast.success("Closed — Won 🎉"); }
    }
  }

  // ====== Header with logo ======
  const Header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.png" alt="lilipad" style={{ height: 28 }} onError={(e)=>{ e.currentTarget.style.display='none'; }} />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>lilipad — fundraising crm</h1>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={() => { localStorage.removeItem(STORAGE_KEY); window.location.reload(); }}>Reset Demo Data</Btn>
      </div>
    </div>
  );

  // ====== Tabs ======
  const Tabs = (
    <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
      <Btn kind={activeTab === "database" ? "primary" : "default"} onClick={() => setActiveTab("database")}>Database</Btn>
      <Btn kind={activeTab === "qualified" ? "primary" : "default"} onClick={() => setActiveTab("qualified")}>Qualified</Btn>
      <Btn kind={activeTab === "pipeline" ? "primary" : "default"} onClick={() => setActiveTab("pipeline")}>Pipeline</Btn>
      <Btn kind={activeTab === "settings" ? "primary" : "default"} onClick={() => setActiveTab("settings")}>Templates & Settings</Btn>
    </div>
  );

  // ====== Database Tab ======
  const DatabaseTab = (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <CardHeader right={<Btn title={collapsedAdd?"Expand":"Collapse"} onClick={()=>setCollapsedAdd(v=>!v)}>{collapsedAdd?"+":"–"}</Btn>}>
          <CardTitle>Add to Database</CardTitle>
        </CardHeader>
        {!collapsedAdd && (
          <CardContent>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input required label="Grant name" value={newGrant.grantName} error={errors.grantName}
                onChange={e => setNewGrant({ ...newGrant, grantName: e.target.value })} />
              <Input label="Funder" value={newGrant.funder} onChange={e => setNewGrant({ ...newGrant, funder: e.target.value })} />
              <Input required label="Website" placeholder="https://..." value={newGrant.website} error={errors.website}
                onChange={e => setNewGrant({ ...newGrant, website: e.target.value })} />
              <Input required label="Deadline (YYYY-MM-DD)" value={newGrant.deadline} error={errors.deadline}
                onChange={e => setNewGrant({ ...newGrant, deadline: e.target.value })} />
              <Input required label="Country" value={newGrant.country} error={errors.country}
                onChange={e => setNewGrant({ ...newGrant, country: e.target.value })} />
              <Input label="Sector" value={newGrant.sector} onChange={e => setNewGrant({ ...newGrant, sector: e.target.value })} />
              <Input label="Amount (e.g., €25k)" value={newGrant.amount} onChange={e => setNewGrant({ ...newGrant, amount: e.target.value })} />
              <Input label="Contact name" value={newGrant.contactName} onChange={e => setNewGrant({ ...newGrant, contactName: e.target.value })} />
              <Input label="Contact email (optional)" value={newGrant.contactEmail} onChange={e => setNewGrant({ ...newGrant, contactEmail: e.target.value })} />
              <Select label="Type (optional)" value={newGrant.type} onChange={e => setNewGrant({ ...newGrant, type: e.target.value })}>
                <option value="">—</option>
                <option>Grant (Public)</option>
                <option>Grant (Corporate)</option>
                <option>Not a grant</option>
              </Select>
            </div>
            <div style={{ marginTop: 12 }}>
              <Textarea label="Notes" rows={6} value={newGrant.notes} onChange={e => setNewGrant({ ...newGrant, notes: e.target.value })} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <Btn kind="primary" onClick={addGrant}>Add to Database</Btn>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader right={<Btn onClick={bulkMoveToQualified} disabled={!selectedIds.length}>Move selected to Qualified</Btn>}>
          <CardTitle>Database</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1.5fr 1fr 1fr 1fr 120px", fontWeight: 700, borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>
            <div>Select</div><div>Grant / Funder</div><div>Deadline</div><div>Country</div><div>Contact</div><div style={{ textAlign: "right" }}>Stage</div>
          </div>
          {(state.items || [])
            .filter(g => g.stage === "database")
            .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
            .map(g => (
              <GrantRow key={g.id} g={{ ...g, onOpen: () => setDialogGrant(g) }} selected={selectedIds.includes(g.id)} onToggle={toggleSelect} />
            ))}
        </CardContent>
      </Card>
    </div>
  );

  // ====== Qualified Tab (list) ======
  const QualifiedTab = (
    <Card>
      <CardHeader><CardTitle>Qualified</CardTitle></CardHeader>
      <CardContent>
        {(state.items || []).filter(g => g.stage === "pipeline").map(g => (
          <div key={g.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <button onClick={() => setDialogGrant(g)} style={{ background: "transparent", border: 0, padding: 0, margin: 0, fontWeight: 700, cursor: "pointer" }}>{g.grantName}</button>
                <div style={{ color: "#64748b", fontSize: 12 }}>{g.funder} • Deadline {g.deadline || '—'}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={g.stage} onChange={e => updateGrant(g.id, { stage: e.target.value })}>
                  {STAGES.map(s => (<option key={s.id} value={s.id}>{s.label}</option>))}
                </select>
                <Btn onClick={() => deleteGrant(g.id)}>Delete</Btn>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  // ====== Pipeline (Kanban) ======
  const PipelineTab = (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div style={{ display: "flex", gap: 12 }}>
        {STAGES.map(col => (
          <div key={col.id} id={col.id} style={{ flex: 1, minWidth: 260, background: "#f1f5f9", borderRadius: 16, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>{col.label}</div>
              <Badge>{itemsByStage[col.id]?.length || 0}</Badge>
            </div>
            <SortableContext items={(itemsByStage[col.id] || []).map(g => g.id)} strategy={rectSortingStrategy}>
              <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
                {(itemsByStage[col.id] || []).map(g => (
                  <SortableCard key={g.id} grant={g} onOpen={() => setDialogGrant(g)} onDelete={deleteGrant} canDelete={g.stage !== 'database'} />
                ))}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>
    </DndContext>
  );

  // ====== Settings ======
  const SettingsTab = (
    <Card>
      <CardHeader><CardTitle>Email Templates</CardTitle></CardHeader>
      <CardContent>
        {(state.templates || []).map(t => (
          <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Name" value={t.name} onChange={e => setState(p => ({ ...p, templates: p.templates.map(x => x.id === t.id ? { ...x, name: e.target.value } : x) }))} />
              <Input label="Subject" value={t.subject} onChange={e => setState(p => ({ ...p, templates: p.templates.map(x => x.id === t.id ? { ...x, subject: e.target.value } : x) }))} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Textarea rows={6} label="Body" value={t.body} onChange={e => setState(p => ({ ...p, templates: p.templates.map(x => x.id === t.id ? { ...x, body: e.target.value } : x) }))} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <Toaster richColors />
      {Header}
      {Tabs}
      {activeTab === "database" && DatabaseTab}
      {activeTab === "qualified" && QualifiedTab}
      {activeTab === "pipeline" && PipelineTab}
      {activeTab === "settings" && SettingsTab}

      {/* Grant dialog */}
      <GrantDialog
        open={!!dialogGrant}
        grant={dialogGrant}
        onClose={() => setDialogGrant(null)}
        onSaveEmail={(subject, body) => {
          if (!dialogGrant) return;
          updateGrant(dialogGrant.id, { savedEmailSubject: subject, savedEmailBody: body });
          setDialogGrant({ ...dialogGrant, savedEmailSubject: subject, savedEmailBody: body });
        }}
      />
    </div>
  );
}

function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u?.email?.endsWith("@lilipadlibrary.org")) setUser(u);
      else { if (u?.email) toast.error("Access restricted to @lilipadlibrary.org"); setUser(null); signOut(auth); }
      setLoading(false);
    });
    return () => unsub();
  }, []);
  const login = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch { toast.error("Login failed"); } };
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!user) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Card>
        <CardHeader><CardTitle>lilipad — fundraising crm</CardTitle></CardHeader>
        <CardContent><Btn kind="primary" onClick={login}>Continue with Google</Btn></CardContent>
      </Card>
    </div>
  );
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthGate>
      <AppInner />
    </AuthGate>
  );
}
