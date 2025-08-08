import React, { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import confetti from "canvas-confetti";
import { v4 as uuidv4 } from "uuid";
import { Toaster, toast } from "sonner";

// Firebase Auth
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

const STAGES = [
  { id: "research", label: "Research" },
  { id: "pipeline", label: "Pipeline" },
  { id: "won", label: "Closed – Won" },
  { id: "lost", label: "Closed – Lost" },
];

const STORAGE_KEY = "lilipad_grants_crm_v1";

const emptyGrant = () => ({
  id: uuidv4(),
  grantName: "",
  funder: "",
  website: "",
  deadline: "",
  region: "",
  sector: "Education / Children",
  amount: "",
  contactName: "",
  contactEmail: "",
  notes: "",
  stage: "research",
  lastActivity: new Date().toISOString(),
});

const defaultTemplates = [
  {
    id: "t1",
    name: "Intro + Fit",
    subject: "LiliPad Library x {Funder}: Grant inquiry for {Grant}",
    body:
      "Hi {FirstName},\n\nI'm Aadi from LiliPad Library (lilipadlibrary.org). We help kids from marginalized communities build reading habits through community-led libraries. I noticed {Funder}'s focus on {Sector} and thought {Grant} could be a strong fit.\n\nQuick context:\n• Impact: 10,000+ books in rotation, {Region} focus\n• Model: Community libraries inside schools & shelters\n• What we seek: Support for {Grant} ({Amount})\n\nIf helpful, I can share a one-pager and brief impact metrics. Would you be open to a 20-min chat next week?\n\nThanks,\nAadi\nPartner, LiliPad Library\n",
  },
  {
    id: "t2",
    name: "Warm intro / follow-up",
    subject: "Following up on {Grant} at {Funder}",
    body:
      "Hi {FirstName},\n\nCircling back on {Grant}. Given your portfolio's focus on {Sector}, we'd love to explore alignment. We can tailor outcomes (literacy hours, libraries launched) to your reporting needs.\n\nOpen to a quick call?\n\nBest,\nAadi",
  },
];

// ---- tiny UI helpers (no external UI lib) ----
const Btn = ({ children, onClick, kind = "default", disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: "8px 12px",
      borderRadius: 10,
      border: "1px solid #cbd5e1",
      background: disabled ? "#e2e8f0" : kind === "primary" ? "#0f172a" : "#fff",
      color: disabled ? "#94a3b8" : kind === "primary" ? "#fff" : "#0f172a",
      cursor: disabled ? "not-allowed" : "pointer",
      ...style,
    }}
  >
    {children}
  </button>
);
const Input = (p) => <input {...p} style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 10 }} />;
const Textarea = (p) => <textarea {...p} style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 10 }} />;
const Card = ({ children }) => <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}>{children}</div>;
const CardHeader = ({ children }) => <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>{children}</div>;
const CardTitle = ({ children }) => <div style={{ fontWeight: 600 }}>{children}</div>;
const CardContent = ({ children }) => <div style={{ padding: 24 }}>{children}</div>;
const Badge = ({ children }) => <span style={{ border: "1px solid #cbd5e1", borderRadius: 999, padding: "2px 8px", fontSize: 12, background: "#f8fafc" }}>{children}</span>;
// ------------------------------------------------

function useLocalState(key, initial) {
  const [s, setS] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(s)); } catch {} }, [key, s]);
  return [s, setS];
}

function mergeTemplate(tpl, g) {
  const firstName = (g.contactName || "").split(" ")[0] || "there";
  const map = {
    "{FirstName}": firstName,
    "{Grant}": g.grantName || "your grant",
    "{Funder}": g.funder || "your foundation",
    "{Sector}": g.sector || "education",
    "{Amount}": g.amount || "requested support",
    "{Region}": g.region || "our regions",
  };
  let subject = tpl.subject, body = tpl.body;
  Object.entries(map).forEach(([k, v]) => { subject = subject.split(k).join(v); body = body.split(k).join(v); });
  return { subject, body };
}

function StageBadge({ stage }) {
  const label = STAGES.find(s => s.id === stage)?.label || stage;
  return <Badge>{label}</Badge>;
}

function GrantRow({ g, selected, onToggle }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "60px 1.5fr 1fr 1fr 1fr 100px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
      <div><input type="checkbox" checked={!!selected} onChange={() => onToggle(g.id)} /></div>
      <div>
        <div style={{ fontWeight: 600 }}>{g.grantName || "—"}</div>
        <a href={g.website || "#"} target="_blank" rel="noreferrer" style={{ color: "#64748b", fontSize: 12, textDecoration: "underline" }}>{g.funder || g.website || ""}</a>
      </div>
      <div style={{ color: "#64748b", fontSize: 13 }}>{g.deadline || "—"}</div>
      <div style={{ color: "#64748b", fontSize: 13 }}>{g.region || "—"}</div>
      <div style={{ color: "#64748b", fontSize: 13 }}>{g.contactName || "—"}</div>
      <div style={{ textAlign: "right" }}><StageBadge stage={g.stage} /></div>
    </div>
  );
}

function EmailComposer({ grant, templates, onSent }) {
  const [tplId, setTplId] = useState(templates[0]?.id || "");
  const chosen = templates.find(t => t.id === tplId) || templates[0];
  const merged = useMemo(() => mergeTemplate(chosen, grant), [chosen, grant]);
  const [subject, setSubject] = useState(merged.subject);
  const [body, setBody] = useState(merged.body);
  useEffect(() => { setSubject(merged.subject); setBody(merged.body); }, [merged.subject, merged.body]);

  function handleSendGmail() {
    if (!grant.contactEmail) { toast.error("No contact email on this grant."); return; }
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(grant.contactEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank"); onSent?.();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Template</div>
          <select value={tplId} onChange={e => setTplId(e.target.value)} style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 10 }}>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>To</div>
          <Input value={grant.contactEmail || ""} readOnly />
        </div>
      </div>
      <div><div style={{ fontSize: 12, color: "#64748b" }}>Subject</div><Input value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div><div style={{ fontSize: 12, color: "#64748b" }}>Body</div><Textarea rows={10} value={body} onChange={e => setBody(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={() => navigator.clipboard.writeText(body)}>Copy Body</Btn>
        <Btn onClick={handleSendGmail} kind="primary">Open in Gmail</Btn>
      </div>
    </div>
  );
}

function SortableCard({ grant, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: grant.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={{ ...style, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)" }} {...attributes} {...listeners}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{grant.grantName || "Untitled grant"}</div>
          <div style={{ color: "#64748b", fontSize: 12 }}>{grant.funder}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => onEdit(grant)}>Edit</Btn>
          <Btn onClick={() => onDelete(grant.id)}>Delete</Btn>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 14 }}>
        <div>Deadline: {grant.deadline || "—"}</div>
        <div>Contact: {grant.contactName || "—"} ({grant.contactEmail || "—"})</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {grant.region && <Badge>{grant.region}</Badge>}
        {grant.sector && <Badge>{grant.sector}</Badge>}
        {grant.amount && <Badge>{grant.amount}</Badge>}
      </div>
    </div>
  );
}

function AppInner() {
  const [grants, setGrants] = useLocalState(STORAGE_KEY, {
    items: [
      { ...emptyGrant(), grantName: "Amazon – Meet & Code", funder: "Amazon / Meet & Code", website: "https://meet-and-code.org/", region: "Europe" },
      { ...emptyGrant(), grantName: "SAP Corporate Giving", funder: "SAP", region: "Germany", website: "https://www.sap.com/" },
      // …(list trimmed; keep all your seed items here)…
    ],
    templates: defaultTemplates,
  });

  const [activeTab, setActiveTab] = useState("research");
  const [newGrant, setNewGrant] = useState(emptyGrant());
  const [selectedIds, setSelectedIds] = useState([]);
  const [editing, setEditing] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor));

  const itemsByStage = useMemo(() => {
    const by = { research: [], pipeline: [], won: [], lost: [] };
    (grants.items || []).forEach(g => by[g.stage || "research"].push(g));
    return by;
  }, [grants.items]);

  function addGrant() {
    if (!newGrant.grantName) { toast.error("Please add a grant name"); return; }
    setGrants(prev => ({ ...prev, items: [{ ...newGrant }, ...prev.items] }));
    setNewGrant(emptyGrant());
    toast.success("Grant added to Research");
  }
  function updateGrant(id, patch) {
    setGrants(prev => ({ ...prev, items: prev.items.map(g => (g.id === id ? { ...g, ...patch, lastActivity: new Date().toISOString() } : g)) }));
  }
  function deleteGrant(id) { setGrants(prev => ({ ...prev, items: prev.items.filter(g => g.id !== id) })); }
  function toggleSelect(id) { setSelectedIds(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])); }
  function bulkMoveToPipeline() {
    if (selectedIds.length === 0) return;
    setGrants(prev => ({ ...prev, items: prev.items.map(g => (selectedIds.includes(g.id) ? { ...g, stage: "pipeline" } : g)) }));
    setSelectedIds([]); setActiveTab("pipeline"); toast("Moved to Pipeline");
  }
  function handleDragEnd(event) {
    const { active, over } = event; if (!over) return;
    const grant = grants.items.find(i => i.id === active.id); if (!grant) return;
    const targetCol = over.id;
    if (STAGES.some(s => s.id === targetCol) && grant.stage !== targetCol) {
      updateGrant(grant.id, { stage: targetCol });
      if (targetCol === "won") { confetti({ particleCount: 120, spread: 70, origin: { y: 0.2 } }); toast.success("Marked as WON! 🎉"); }
    }
  }

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h1 style={{ margin: 0 }}>LiliPad Library — Grants CRM</h1>
        <div style={{ color: "#64748b", fontSize: 14 }}>Research → Pipeline → Closed. Draft outreach and celebrate wins.</div>
      </div>
      <Btn onClick={() => { localStorage.removeItem(STORAGE_KEY); window.location.reload(); }}>Reset Demo Data</Btn>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <Toaster richColors />
      {header}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 12 }}>
        {["research", "pipeline", "kanban", "settings"].map(t => (
          <Btn key={t} onClick={() => setActiveTab(t)} kind={activeTab === t ? "primary" : "default"}>{t[0].toUpperCase() + t.slice(1)}</Btn>
        ))}
      </div>

      {/* Research */}
      {activeTab === "research" && (
        <div className="space" style={{ display: "grid", gap: 16 }}>
          <Card>
            <CardHeader><CardTitle>Add to Long List</CardTitle></CardHeader>
            <CardContent>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input placeholder="Grant name" value={newGrant.grantName} onChange={e => setNewGrant({ ...newGrant, grantName: e.target.value })} />
                <Input placeholder="Funder" value={newGrant.funder} onChange={e => setNewGrant({ ...newGrant, funder: e.target.value })} />
                <Input placeholder="Website (https://)" value={newGrant.website} onChange={e => setNewGrant({ ...newGrant, website: e.target.value })} />
                <Input placeholder="Deadline (YYYY-MM-DD)" value={newGrant.deadline} onChange={e => setNewGrant({ ...newGrant, deadline: e.target.value })} />
                <Input placeholder="Region/Country" value={newGrant.region} onChange={e => setNewGrant({ ...newGrant, region: e.target.value })} />
                <Input placeholder="Sector" value={newGrant.sector} onChange={e => setNewGrant({ ...newGrant, sector: e.target.value })} />
                <Input placeholder="Amount (e.g., €25k)" value={newGrant.amount} onChange={e => setNewGrant({ ...newGrant, amount: e.target.value })} />
                <Input placeholder="Contact name" value={newGrant.contactName} onChange={e => setNewGrant({ ...newGrant, contactName: e.target.value })} />
                <Input placeholder="Contact email" value={newGrant.contactEmail} onChange={e => setNewGrant({ ...newGrant, contactEmail: e.target.value })} />
              </div>
              <div style={{ marginTop: 12 }}><Textarea placeholder="Notes" value={newGrant.notes} onChange={e => setNewGrant({ ...newGrant, notes: e.target.value })} /></div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><Btn kind="primary" onClick={addGrant}>Add to Research</Btn></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <CardTitle>Long List</CardTitle>
                <Btn onClick={bulkMoveToPipeline} disabled={selectedIds.length === 0}>Move selected to Pipeline</Btn>
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1.5fr 1fr 1fr 1fr 100px", fontWeight: 600, borderBottom: "1px solid #e5e7eb", paddingBottom: 6 }}>
                <div>Select</div><div>Grant / Funder</div><div>Deadline</div><div>Region</div><div>Contact</div><div style={{ textAlign: "right" }}>Stage</div>
              </div>
              {(grants.items || [])
                .filter(g => g.stage === "research")
                .sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""))
                .map(g => (
                  <GrantRow key={g.id} g={g} selected={selectedIds.includes(g.id)} onToggle={toggleSelect} />
                ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pipeline */}
      {activeTab === "pipeline" && (
        <Card>
          <CardHeader><CardTitle>Qualified Pipeline</CardTitle></CardHeader>
          <CardContent>
            {(grants.items || []).filter(g => g.stage === "pipeline").map(g => (
              <div key={g.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{g.grantName}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>{g.funder} • Deadline {g.deadline || "—"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn onClick={() => window.prompt("Copy this email address:", g.contactEmail || "")}>View Contact</Btn>
                    <select value={g.stage} onChange={e => updateGrant(g.id, { stage: e.target.value })}>
                      {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                {g.contactEmail && (
                  <div style={{ marginTop: 8 }}>
                    <EmailComposer grant={g} templates={grants.templates} onSent={() => updateGrant(g.id, { lastActivity: new Date().toISOString() })} />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Kanban */}
      {activeTab === "kanban" && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div style={{ display: "flex", gap: 12 }}>
            {STAGES.map(col => (
              <div key={col.id} id={col.id} style={{ flex: 1, minWidth: 260, background: "#f1f5f9", borderRadius: 16, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 600 }}>{col.label}</div>
                  <Badge>{itemsByStage[col.id]?.length || 0}</Badge>
                </div>
                <SortableContext items={(itemsByStage[col.id] || []).map(g => g.id)} strategy={rectSortingStrategy}>
                  <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
                    {(itemsByStage[col.id] || []).map(g => (
                      <SortableCard key={g.id} grant={g} onEdit={setEditing} onDelete={deleteGrant} />
                    ))}
                  </div>
                </SortableContext>
              </div>
            ))}
          </div>
        </DndContext>
      )}

      {/* Settings (email templates) */}
      {activeTab === "settings" && (
        <Card>
          <CardHeader><CardTitle>Email Templates</CardTitle></CardHeader>
          <CardContent>
            {(grants.templates || []).map(t => (
              <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Input value={t.name} onChange={e => setGrants(p => ({ ...p, templates: p.templates.map(x => x.id === t.id ? { ...x, name: e.target.value } : x) }))} />
                  <Input value={t.subject} onChange={e => setGrants(p => ({ ...p, templates: p.templates.map(x => x.id === t.id ? { ...x, subject: e.target.value } : x) }))} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <Textarea rows={6} value={t.body} onChange={e => setGrants(p => ({ ...p, templates: p.templates.map(x => x.id === t.id ? { ...x, body: e.target.value } : x) }))} />
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                  Placeholders: {"{FirstName}"}, {"{Grant}"}, {"{Funder}"}, {"{Sector}"}, {"{Amount}"}, {"{Region}"}
                </div>
              </div>
            ))}
            <Btn onClick={() => setGrants(p => ({ ...p, templates: [...p.templates, { id: uuidv4(), name: "New template", subject: "Subject", body: "Body" }] }))}>Add Template</Btn>
          </CardContent>
        </Card>
      )}
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
      <Card><CardHeader><CardTitle>LiliPad Grants CRM</CardTitle></CardHeader><CardContent><Btn kind="primary" onClick={login}>Continue with Google</Btn></CardContent></Card>
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
