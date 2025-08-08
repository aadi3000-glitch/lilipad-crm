import React, { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import confetti from "canvas-confetti";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const STORAGE_KEY = "lilipad_grants_crm_v1";

const STAGES = [
  { id: "research", label: "Research" },
  { id: "pipeline", label: "Pipeline" },
  { id: "won", label: "Closed – Won" },
  { id: "lost", label: "Closed – Lost" },
];

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

function useLocalState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch (e) {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

function mergeTemplate(tpl, grant) {
  const firstName = (grant.contactName || "").split(" ")[0] || "there";
  const map = {
    "{FirstName}": firstName,
    "{Grant}": grant.grantName || "your grant",
    "{Funder}": grant.funder || "your foundation",
    "{Sector}": grant.sector || "education",
    "{Amount}": grant.amount || "requested support",
    "{Region}": grant.region || "our regions",
  };
  let subject = tpl.subject;
  let body = tpl.body;
  Object.entries(map).forEach(([k, v]) => {
    subject = subject.replaceAll(k, v);
    body = body.replaceAll(k, v);
  });
  return { subject, body };
}

function StageBadge({ stage }) {
  const label = STAGES.find((s) => s.id === stage)?.label || stage;
  const tone =
    stage === "research" ? "secondary" : stage === "pipeline" ? "default" : stage === "won" ? "success" : "destructive";
  return <Badge variant={tone}>{label}</Badge>;
}

function GrantRow({ g, selected, onToggle }) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center py-2 border-b">
      <div className="col-span-1 flex items-center gap-2">
        <Checkbox checked={selected} onCheckedChange={() => onToggle(g.id)} />
      </div>
      <div className="col-span-3">
        <div className="font-medium">{g.grantName || "—"}</div>
        <a href={g.website || "#"} target="_blank" className="text-xs underline text-muted-foreground">
          {g.funder || g.website || ""}
        </a>
      </div>
      <div className="col-span-2 text-sm">{g.deadline || "—"}</div>
      <div className="col-span-2 text-sm">{g.region || "—"}</div>
      <div className="col-span-2 text-sm">{g.contactName || "—"}</div>
      <div className="col-span-2 flex justify-end"><StageBadge stage={g.stage} /></div>
    </div>
  );
}

function EmailComposer({ grant, templates, onSent }) {
  const [tplId, setTplId] = useState(templates[0]?.id || "");
  const chosen = templates.find((t) => t.id === tplId) || templates[0];
  const merged = useMemo(() => mergeTemplate(chosen, grant), [chosen, grant]);
  const [subject, setSubject] = useState(merged.subject);
  const [body, setBody] = useState(merged.body);

  useEffect(() => {
    setSubject(merged.subject);
    setBody(merged.body);
  }, [merged.subject, merged.body]);

  function handleSend() {
    if (!grant.contactEmail) {
      toast.error("No contact email on this grant.");
      return;
    }
    const mailto = `mailto:${encodeURIComponent(grant.contactEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    onSent?.();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Template</label>
          <Select value={tplId} onValueChange={setTplId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input value={grant.contactEmail || ""} readOnly />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Subject</label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Body</label>
        <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(body)}>Copy Body</Button>
        <Button onClick={handleSend}>Send Email</Button>
      </div>
    </div>
  );
}

function SortableCard({ grant, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: grant.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="rounded-2xl border p-3 bg-card shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold leading-tight">{grant.grantName || "Untitled grant"}</div>
          <div className="text-xs text-muted-foreground">{grant.funder}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(grant)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(grant.id)}>Delete</Button>
        </div>
      </div>
      <div className="mt-2 text-sm">
        <div>Deadline: {grant.deadline || "—"}</div>
        <div>Contact: {grant.contactName || "—"} ({grant.contactEmail || "—"})</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {grant.region && <Badge variant="secondary">{grant.region}</Badge>}
        {grant.sector && <Badge variant="secondary">{grant.sector}</Badge>}
        {grant.amount && <Badge variant="secondary">{grant.amount}</Badge>}
      </div>
    </div>
  );
}

export default function App() {
  const [grants, setGrants] = useLocalState(STORAGE_KEY, {
    items: [
      {
        ...emptyGrant(),
        grantName: "Education Equity Fund 2025",
        funder: "Acme Foundation",
        website: "https://example.org/grants/eef",
        deadline: "2025-10-01",
        region: "Germany / Morocco",
        amount: "€50k",
        contactName: "Jane Doe",
        contactEmail: "jane@example.org",
        notes: "Focus on literacy; good alignment.",
      },
      {
        ...emptyGrant(),
        grantName: "Children First Microgrants",
        funder: "Bright Futures Trust",
        website: "https://example.org/grants/cfm",
        deadline: "2025-09-15",
        region: "EU",
        amount: "€10–25k",
        contactName: "Marc Dupont",
        contactEmail: "marc@example.org",
        stage: "pipeline",
      },
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
    (grants.items || []).forEach((g) => by[g.stage || "research"].push(g));
    return by;
  }, [grants.items]);

  function addGrant() {
    if (!newGrant.grantName) {
      toast.error("Please add a grant name");
      return;
    }
    setGrants((prev) => ({ ...prev, items: [ { ...newGrant }, ...prev.items ] }));
    setNewGrant(emptyGrant());
    toast.success("Grant added to Research");
  }

  function updateGrant(id, patch) {
    setGrants((prev) => ({
      ...prev,
      items: prev.items.map((g) => (g.id === id ? { ...g, ...patch, lastActivity: new Date().toISOString() } : g)),
    }));
  }

  function deleteGrant(id) {
    setGrants((prev) => ({ ...prev, items: prev.items.filter((g) => g.id !== id) }));
  }

  function toggleSelect(id) {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function bulkMoveToPipeline() {
    if (selectedIds.length === 0) return;
    setGrants((prev) => ({
      ...prev,
      items: prev.items.map((g) => (selectedIds.includes(g.id) ? { ...g, stage: "pipeline" } : g)),
    }));
    setSelectedIds([]);
    setActiveTab("pipeline");
    toast("Moved to Pipeline");
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;

    const sourceId = active.id;
    const targetCol = over.id;
    const grant = grants.items.find((i) => i.id === sourceId);

    if (STAGES.some((s) => s.id === targetCol)) {
      // Move across columns
      if (grant.stage !== targetCol) {
        updateGrant(grant.id, { stage: targetCol });
        if (targetCol === "won") {
          confetti({ particleCount: 120, spread: 70, origin: { y: 0.2 } });
          toast.success("Marked as WON! 🎉");
        }
      }
      return;
    }
  }

  function KanbanColumn({ id, label, children }) {
    return (
      <div className="flex-1 min-w-[260px] bg-muted/30 rounded-2xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">{label}</div>
          <Badge variant="secondary">{children?.length || 0}</Badge>
        </div>
        <div id={id} className="space-y-3">
          <SortableContext items={(children || []).map((c) => c.key)} strategy={rectSortingStrategy}>
            {children}
          </SortableContext>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LiliPad Library — Grants CRM</h1>
          <p className="text-sm text-muted-foreground">Research → Pipeline → Closed. Draft outreach, send emails, and celebrate wins.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            window.location.reload();
          }}>Reset Demo Data</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="settings">Templates & Settings</TabsTrigger>
        </TabsList>

        {/* Research Tab */}
        <TabsContent value="research" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add to Long List</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <Input placeholder="Grant name" value={newGrant.grantName} onChange={(e) => setNewGrant({ ...newGrant, grantName: e.target.value })} />
                <Input placeholder="Funder" value={newGrant.funder} onChange={(e) => setNewGrant({ ...newGrant, funder: e.target.value })} />
                <Input placeholder="Website (https://)" value={newGrant.website} onChange={(e) => setNewGrant({ ...newGrant, website: e.target.value })} />
                <Input placeholder="Deadline (YYYY-MM-DD)" value={newGrant.deadline} onChange={(e) => setNewGrant({ ...newGrant, deadline: e.target.value })} />
                <Input placeholder="Region/Country" value={newGrant.region} onChange={(e) => setNewGrant({ ...newGrant, region: e.target.value })} />
                <Input placeholder="Sector" value={newGrant.sector} onChange={(e) => setNewGrant({ ...newGrant, sector: e.target.value })} />
                <Input placeholder="Amount (e.g., €25k)" value={newGrant.amount} onChange={(e) => setNewGrant({ ...newGrant, amount: e.target.value })} />
                <Input placeholder="Contact name" value={newGrant.contactName} onChange={(e) => setNewGrant({ ...newGrant, contactName: e.target.value })} />
                <Input placeholder="Contact email" value={newGrant.contactEmail} onChange={(e) => setNewGrant({ ...newGrant, contactEmail: e.target.value })} />
              </div>
              <Textarea placeholder="Notes" value={newGrant.notes} onChange={(e) => setNewGrant({ ...newGrant, notes: e.target.value })} />
              <div className="flex justify-end"><Button onClick={addGrant}>Add to Research</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Long List</CardTitle>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={bulkMoveToPipeline} disabled={selectedIds.length === 0}>Move selected to Pipeline</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
                <div className="col-span-1">Select</div>
                <div className="col-span-3">Grant / Funder</div>
                <div className="col-span-2">Deadline</div>
                <div className="col-span-2">Region</div>
                <div className="col-span-2">Contact</div>
                <div className="col-span-2 text-right">Stage</div>
              </div>
              {(grants.items || [])
                .filter((g) => g.stage === "research")
                .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
                .map((g) => (
                  <GrantRow key={g.id} g={g} selected={selectedIds.includes(g.id)} onToggle={toggleSelect} />
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Qualified Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(grants.items || []).filter((g) => g.stage === "pipeline").map((g) => (
                <div key={g.id} className="border rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{g.grantName}</div>
                      <div className="text-xs text-muted-foreground">{g.funder} • Deadline {g.deadline || '—'}</div>
                    </div>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm">Draft Email</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Email to {g.contactName || 'Contact'}</DialogTitle>
                          </DialogHeader>
                          <EmailComposer
                            grant={g}
                            templates={grants.templates}
                            onSent={() => updateGrant(g.id, { lastActivity: new Date().toISOString() })}
                          />
                          <DialogFooter></DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Select value={g.stage} onValueChange={(v) => updateGrant(g.id, { stage: v })}>
                        <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (<SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {g.notes && <p className="mt-2 text-sm">{g.notes}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Kanban Tab */}
        <TabsContent value="kanban" className="space-y-4">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="grid md:flex gap-4">
              {STAGES.map((col) => (
                <KanbanColumn key={col.id} id={col.id} label={col.label}>
                  {itemsByStage[col.id].map((g) => (
                    <SortableCard
                      key={g.id}
                      grant={g}
                      onEdit={(grant) => setEditing(grant)}
                      onDelete={deleteGrant}
                    />
                  ))}
                </KanbanColumn>
              ))}
            </div>
          </DndContext>
        </TabsContent>

        {/* Templates & Settings */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(grants.templates || []).map((t) => (
                <div key={t.id} className="border rounded-2xl p-3 space-y-2">
                  <div className="grid md:grid-cols-2 gap-2">
                    <Input value={t.name} onChange={(e) => setGrants((p) => ({ ...p, templates: p.templates.map((x) => x.id === t.id ? { ...x, name: e.target.value } : x) }))} />
                    <Input value={t.subject} onChange={(e) => setGrants((p) => ({ ...p, templates: p.templates.map((x) => x.id === t.id ? { ...x, subject: e.target.value } : x) }))} />
                  </div>
                  <Textarea rows={6} value={t.body} onChange={(e) => setGrants((p) => ({ ...p, templates: p.templates.map((x) => x.id === t.id ? { ...x, body: e.target.value } : x) }))} />
                  <div className="text-xs text-muted-foreground">Supported placeholders: {"{FirstName}"}, {"{Grant}"}, {"{Funder}"}, {"{Sector}"}, {"{Amount}"}, {"{Region}"}</div>
                </div>
              ))}
              <Button onClick={() => setGrants((p) => ({ ...p, templates: [...p.templates, { id: uuidv4(), name: "New template", subject: "Subject", body: "Body" }] }))}>Add Template</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit drawer (simple dialog) */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit grant</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <Input value={editing.grantName} onChange={(e) => setEditing({ ...editing, grantName: e.target.value })} />
                <Input value={editing.funder} onChange={(e) => setEditing({ ...editing, funder: e.target.value })} />
                <Input value={editing.website} onChange={(e) => setEditing({ ...editing, website: e.target.value })} />
                <Input value={editing.deadline} onChange={(e) => setEditing({ ...editing, deadline: e.target.value })} />
                <Input value={editing.region} onChange={(e) => setEditing({ ...editing, region: e.target.value })} />
                <Input value={editing.sector} onChange={(e) => setEditing({ ...editing, sector: e.target.value })} />
                <Input value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
                <Input value={editing.contactName} onChange={(e) => setEditing({ ...editing, contactName: e.target.value })} />
                <Input value={editing.contactEmail} onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })} />
              </div>
              <Textarea rows={6} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              <div className="flex items-center justify-between">
                <Select value={editing.stage} onValueChange={(v) => setEditing({ ...editing, stage: v })}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (<SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={() => { deleteGrant(editing.id); setEditing(null); }}>Delete</Button>
                  <Button onClick={() => { updateGrant(editing.id, editing); if (editing.stage === "won") { confetti({ particleCount: 120, spread: 70, origin: { y: 0.2 } }); } setEditing(null); }}>Save</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
