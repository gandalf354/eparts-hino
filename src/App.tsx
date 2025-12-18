import React, { useEffect, useRef, useState } from "react";
import Login from "./Login";
import * as XLSX from "xlsx";

type Part = { id: string; code: string; name: string; price?: number; additional?: string };
type HotspotSingle = { partId: string; x: number; y: number; r: number };
type HotspotMulti = { partIds: string[]; x: number; y: number; r: number };
type HotspotLike = HotspotSingle | HotspotMulti;
type Hotspot = { partIds: string[]; x: number; y: number; r: number };
type IllustrationData = {
  id: string;
  iid: number;
  name: string;
  model: string;
  posisi: string;
  nama_posisi: string;
  no_posisi: string;
  image: string;
  size: { width: number; height: number };
  parts: Part[];
  hotspots: HotspotLike[];
};
type Catalog = { illustrations: IllustrationData[] };

function Illustration({ imageSrc, size, hotspots, parts, onPick, annotate, onCreateHotspot, showLabels, onMoveHotspot, selectedIds, checkedIds }: { imageSrc: string; size: { width: number; height: number }; hotspots: Hotspot[]; parts: Part[]; onPick: (ids: string[]) => void; annotate?: boolean; onCreateHotspot?: (x: number, y: number) => void; showLabels?: boolean; onMoveHotspot?: (index: number, x: number, y: number) => void; selectedIds?: string[]; checkedIds?: string[] }) {
  const partsById = Object.fromEntries(parts.map(p => [p.id, p]));
  const [temp, setTemp] = useState<Hotspot[]>(hotspots);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);
  useEffect(() => { setTemp(hotspots); }, [hotspots]);
  function toLocal(e: React.MouseEvent<SVGSVGElement> | React.MouseEvent<SVGCircleElement>) {
    const rect = (e.currentTarget as Element).closest('svg')!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * size.width;
    const y = ((e.clientY - rect.top) / rect.height) * size.height;
    return { x, y };
  }
  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!annotate || !onCreateHotspot) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * size.width;
    const y = ((e.clientY - rect.top) / rect.height) * size.height;
    onCreateHotspot(x, y);
  }
  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!annotate || dragIdx === null || !offset) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x0 = ((e.clientX - rect.left) / rect.width) * size.width;
    const y0 = ((e.clientY - rect.top) / rect.height) * size.height;
    const x = Math.max(0, Math.min(size.width, x0 + offset.dx));
    const y = Math.max(0, Math.min(size.height, y0 + offset.dy));
    setTemp(prev => prev.map((h, i) => i === dragIdx ? { ...h, x, y } : h));
  }
  function endDrag() {
    if (dragIdx === null) return;
    const h = temp[dragIdx];
    if (onMoveHotspot) onMoveHotspot(dragIdx, h.x, h.y);
    setDragIdx(null);
    setOffset(null);
  }
  return (
    <svg viewBox={`0 0 ${size.width} ${size.height}`} style={{ width: "100%", height: "auto" }} onClick={handleClick} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
      <image href={imageSrc} xlinkHref={imageSrc} width={size.width} height={size.height} />
      {temp.map((h, idx) => {
        const picked = !!selectedIds && h.partIds.some(pid => selectedIds.includes(pid));
        const checkedAll = !!checkedIds && h.partIds.every(pid => checkedIds.includes(pid));
        const color = (picked || checkedAll) ? "green" : "red";
        return (
          <g key={`${h.partIds.join('|')}-${h.x}-${h.y}` }>
            <circle
              cx={h.x}
              cy={h.y}
              r={h.r}
              fill={color}
              stroke={color}
              strokeWidth={1}
              opacity={0.35}
              style={{ cursor: annotate ? 'move' : 'pointer' }}
              onMouseDown={e => {
                if (!annotate) return;
                e.stopPropagation();
                const p = toLocal(e);
                setDragIdx(idx);
                setOffset({ dx: h.x - p.x, dy: h.y - p.y });
              }}
              onClick={e => { if (annotate) return; e.stopPropagation(); onPick(h.partIds); }}
            />
            {showLabels && (
              <text x={h.x + h.r + 6} y={h.y - h.r} fontSize={12} fill="#000">{(h.partIds.map(pid => partsById[pid]?.code ?? pid)).join(", ")}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function PartList({ parts, selectedIds, checkedIds, qtyById, idColWidthCh, codeColWidthCh, onToggle, onToggleAll, onChangeQty }: { parts: Part[]; selectedIds: string[]; checkedIds: string[]; qtyById: Record<string, number>; idColWidthCh: number; codeColWidthCh: number; onToggle: (id: string, checked: boolean) => void; onToggleAll: (checked: boolean) => void; onChangeQty: (id: string, qty: number) => void }) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const first = selectedIds[0];
    if (first && rowRefs.current[first]) {
      rowRefs.current[first]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selectedIds]);
  

  const allChecked = parts.length > 0 && parts.every(p => checkedIds.includes(p.id));
  return (
    <div data-section="part-list" style={{ overflow: "auto", height: "100%", borderLeft: "1px solid #ddd", fontSize: 11, lineHeight: 1.1 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fafafa", borderBottom: "1px solid #ddd", display: "grid", gridTemplateColumns: `40px ${idColWidthCh}ch ${codeColWidthCh}ch 56px 5ch 1fr`, gap: 8, padding: "8px 12px", fontWeight: 600 }}>
        <div>
          <input type="checkbox" checked={allChecked} onChange={e => onToggleAll(e.target.checked)} />
        </div>
        <div style={{ textAlign: 'left' }}>ID</div>
        <div style={{ textAlign: 'left' }}>Kode</div>
        <div style={{ textAlign: 'right' }}>Pcs</div>
        <div style={{ textAlign: 'left' }}>Addt</div>
        <div style={{ textAlign: 'left' }}>Nama Part</div>
      </div>
      {parts.map(p => (
        <div key={p.id} ref={el => (rowRefs.current[p.id] = el)} style={{ display: "grid", gridTemplateColumns: `40px ${idColWidthCh}ch ${codeColWidthCh}ch 56px 5ch 1fr`, gap: 8, padding: "4px 12px", borderBottom: "1px solid #eee", background: selectedIds.includes(p.id) ? "#ffe9a8" : "transparent", alignItems: 'center' }}>
          <div>
            <input type="checkbox" checked={checkedIds.includes(p.id)} onChange={e => onToggle(p.id, e.target.checked)} />
          </div>
          <div style={{ whiteSpace: "nowrap", textAlign: 'left' }}>{p.id}</div>
          <div style={{ whiteSpace: "nowrap", textAlign: 'left' }}>{p.code}</div>
          <div style={{ textAlign: 'right' }}>
            <input
              type="number"
              min={1}
              step={1}
              value={Number.isFinite(qtyById[p.id]) ? qtyById[p.id] : 1}
              onChange={e => onChangeQty(p.id, Math.max(1, Math.floor(Number(e.target.value))))}
              onFocus={() => { if (!checkedIds.includes(p.id)) onToggle(p.id, true); }}
              disabled={!checkedIds.includes(p.id)}
              style={{ width: 48 }}
            />
          </div>
          <div style={{ textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.additional ?? ''}</div>
          <div style={{ textAlign: 'left', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{p.name}</div>
        </div>
      ))}
    </div>
  );
}

function CatalogList({ items, selectedIid, onSelect, onCreate, onEdit, onDelete, editor, onChangeEditor, onSaveEditor, onCancelEditor, onUploadImage, canWrite, isSuperadmin, jenisOptions, posisiOptions, userRole, userPosisi }: { items: IllustrationData[]; selectedIid: number | null; onSelect: (iid: number) => void; onCreate: () => void; onEdit: (iid: number) => void; onDelete: (iid: number) => void; editor: { mode: "create" | "edit"; id?: string; iid?: number; name: string; model: string; image: string; width: number; height: number; posisi?: string; nama_posisi?: string; no_posisi?: string } | null; onChangeEditor: (patch: Partial<{ id: string; iid: number; name: string; model: string; image: string; width: number; height: number; posisi: string; nama_posisi: string; no_posisi: string }>) => void; onSaveEditor: () => void; onCancelEditor: () => void; onUploadImage: (file: File) => void; canWrite: boolean; isSuperadmin: boolean; jenisOptions: string[]; posisiOptions: string[]; userRole?: string; userPosisi?: string | null }) {
  const [query, setQuery] = useState("");
  const [posisiFilter, setPosisiFilter] = useState<string>(userRole === 'partshop' && userPosisi ? userPosisi : "");
  const [namaPosisiFilter, setNamaPosisiFilter] = useState<string>("");
  const [noPosisiFilter, setNoPosisiFilter] = useState<string>("");

  useEffect(() => {
    if (userRole === 'partshop' && userPosisi) {
      setPosisiFilter(userPosisi);
      setNamaPosisiFilter("");
      setNoPosisiFilter("");
    }
  }, [userRole, userPosisi]);

  const namaPosisiOptions = Array.from(new Set(items
    .filter(it => !posisiFilter || it.posisi === posisiFilter)
    .map(it => it.nama_posisi)
    .filter(n => n && n.trim() !== "")
  )).sort();

  const noPosisiOptions = Array.from(new Set(items
    .filter(it => (!posisiFilter || it.posisi === posisiFilter) && (!namaPosisiFilter || it.nama_posisi === namaPosisiFilter))
    .map(it => it.no_posisi)
    .filter(n => n && n.trim() !== "")
  )).sort();

  const posisiSelectOptions = (userRole === 'partshop' && userPosisi) ? [userPosisi] : posisiOptions;

  // tampilkan gambar/part hanya setelah klik item: tidak auto-select ketika filter berubah

  return (
    <div style={{ overflowX: "hidden", overflowY: "auto", height: "100%", borderRight: "1px solid #ddd" }}>
      <div data-section="catalog-list" style={{ position: "sticky", top: 0, zIndex: 10, background: "#fafafa", borderBottom: "1px solid #ddd", padding: "8px 12px", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: canWrite ? "auto auto" : "auto", gap: 6, alignItems: "center" }}>
          <span>Daftar Ilustrasi</span>
          {canWrite && <button className="btn" onClick={onCreate}>Tambah</button>}
          <input placeholder="Cari jenis, nama, nama posisi, atau model" value={query} onChange={e => setQuery(e.target.value)} style={{ width: 190, marginTop: 4, gridColumn: canWrite ? "1 / span 2" : "1 / span 1" }} />
          <select value={posisiFilter} onChange={e => { setPosisiFilter(e.target.value); setNamaPosisiFilter(""); setNoPosisiFilter(""); }} disabled={userRole === 'partshop'} style={{ width: 190, marginTop: 4, gridColumn: canWrite ? "1 / span 2" : "1 / span 1" }}>
            {userRole !== 'partshop' && <option value="">Semua Posisi</option>}
            {posisiSelectOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
          <select value={namaPosisiFilter} onChange={e => { setNamaPosisiFilter(e.target.value); setNoPosisiFilter(""); }} style={{ width: 190, marginTop: 4, gridColumn: canWrite ? "1 / span 2" : "1 / span 1" }}>
            <option value="">Semua Nama Posisi</option>
            {namaPosisiOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
          <select value={noPosisiFilter} onChange={e => setNoPosisiFilter(e.target.value)} style={{ width: 190, marginTop: 4, gridColumn: canWrite ? "1 / span 2" : "1 / span 1" }}>
            <option value="">Semua No Posisi</option>
            {noPosisiOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
        </div>
      </div>
      {editor && (
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee", display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>{editor.mode === "create" ? "Tambah Ilustrasi" : "Edit Ilustrasi"}</div>
          <select value={editor.id ?? ""} onChange={e => onChangeEditor({ id: e.target.value })} style={{ width: 180, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}>
            <option value="">Pilih jenis</option>
            {jenisOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
          <input placeholder="Nama" value={editor.name} onChange={e => onChangeEditor({ name: e.target.value })} style={{ width: 180, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
          <input placeholder="Model/Variant" value={editor.model} onChange={e => onChangeEditor({ model: e.target.value })} style={{ width: 180, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
          <select value={editor.posisi ?? ""} onChange={e => onChangeEditor({ posisi: e.target.value })} style={{ width: 180, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}>
            <option value="">Pilih posisi</option>
            {posisiOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
          </select>
          <input placeholder="Nama posisi" value={editor.nama_posisi ?? ""} onChange={e => onChangeEditor({ nama_posisi: e.target.value })} style={{ width: 180, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
          <input placeholder="No posisi" value={editor.no_posisi ?? ""} onChange={e => onChangeEditor({ no_posisi: e.target.value })} style={{ width: 180, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
          <input placeholder="Path gambar" value={editor.image} onChange={e => onChangeEditor({ image: e.target.value })} style={{ width: 180, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
          <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) onUploadImage(f); }} style={{ width: "100%", fontSize: 13 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input type="number" placeholder="Lebar" value={editor.width} onChange={e => onChangeEditor({ width: Number(e.target.value) })} style={{ width: 75, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
            <input type="number" placeholder="Tinggi" value={editor.height} onChange={e => onChangeEditor({ height: Number(e.target.value) })} style={{ width: 75, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onSaveEditor}>Simpan</button>
            <button className="btn" onClick={onCancelEditor}>Batal</button>
          </div>
        </div>
      )}
      {(() => {
        const s = query.trim().toLowerCase();
        let list = items;
        if (posisiFilter) list = list.filter(it => (it.posisi ?? '') === posisiFilter);
        if (namaPosisiFilter) list = list.filter(it => (it.nama_posisi ?? '') === namaPosisiFilter);
        if (noPosisiFilter) list = list.filter(it => (it.no_posisi ?? '') === noPosisiFilter);
        if (s) list = list.filter(it => it.id.toLowerCase().includes(s) || it.name.toLowerCase().includes(s) || (it.nama_posisi ?? '').toLowerCase().includes(s) || (it.no_posisi ?? '').toLowerCase().includes(s) || (it.model ?? '').toLowerCase().includes(s));
          return list.map(item => (
            <div key={item.iid} onClick={() => onSelect(item.iid)} style={{ display: "grid", gridTemplateColumns: canWrite ? "1fr auto auto" : "1fr", alignItems: "center", width: "100%", textAlign: "left", padding: "6px 10px", border: "none", background: item.iid === selectedIid ? "#e6f0ff" : "transparent", cursor: "pointer", gap: 6 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>{item.name}</div>
                <div style={{ color: "#444", fontSize: 11, overflowWrap: "anywhere", wordBreak: "break-word" }}>{item.model}</div>
                <div style={{ color: "#666", fontSize: 11, overflowWrap: "anywhere", wordBreak: "break-word" }}>Posisi: {item.posisi}</div>
                <div style={{ color: "#666", fontSize: 11, overflowWrap: "anywhere", wordBreak: "break-word" }}>Nama Posisi: {item.nama_posisi}</div>
                <div style={{ color: "#666", fontSize: 11, overflowWrap: "anywhere", wordBreak: "break-word" }}>No Posisi: {item.no_posisi}</div>
                <div style={{ color: "#666", fontSize: 11, overflowWrap: "anywhere", wordBreak: "break-word" }}>Jenis: {item.id}</div>
              </div>
            {canWrite && <button className="btn" title="Edit" onClick={e => { e.stopPropagation(); onEdit(item.iid); }} style={{ padding: "2px 4px", transform: "translateX(-16px)", fontSize: 12 }}>✏️</button>}
            {canWrite && (
              <button
                className="btn"
                title="Hapus"
                disabled={!isSuperadmin}
                onClick={e => {
                  e.stopPropagation();
                  if (!isSuperadmin) return;
                  onDelete(item.iid);
                }}
                style={{ padding: "2px 4px", transform: "translateX(-16px)", fontSize: 12 }}
              >🗑️</button>
            )}
          </div>
        ));
      })()}
    </div>
  );
}

type User = { id: number; username: string; role: string; posisi?: string | null; created_at?: string };

export default function App() {
  const API_BASE = (import.meta.env.VITE_API_URL as string) || (location.port === '3200' ? `${location.protocol}//${location.hostname}:3300` : `${location.protocol}//${location.hostname}:5174`);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedFigureIid, setSelectedFigureIid] = useState<number | null>(null);
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [partsIndex, setPartsIndex] = useState<Record<string, Part>>({});
  const [checkedCache, setCheckedCache] = useState<Record<number, string[]>>({});
  const [qtyCache, setQtyCache] = useState<Record<number, Record<string, number>>>({});
  const [annotate, setAnnotate] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [form, setForm] = useState<{ id: string; code: string; name: string; r: number }>({ id: "", code: "", name: "", r: 16 });
  const [pending, setPending] = useState<Part[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [partsModalOpen, setPartsModalOpen] = useState(false);
  const [partsList, setPartsList] = useState<Part[]>([]);
  const [partsQuery, setPartsQuery] = useState("");
  const [partsPage, setPartsPage] = useState(1);
  const [partsCreating, setPartsCreating] = useState<{ id: string; code: string; name: string; price: number }>({ id: "", code: "", name: "", price: 0 });
  const [partsCreatePriceText, setPartsCreatePriceText] = useState("0");
  const [partsEditMap, setPartsEditMap] = useState<Record<string, { code: string; name: string; price: number }>>({});
  const [partsPriceTextMap, setPartsPriceTextMap] = useState<Record<string, string>>({});
  const [partsEditId, setPartsEditId] = useState<string | null>(null);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [usersQuery, setUsersQuery] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersEditId, setUsersEditId] = useState<number | null>(null);
  const [usersEditMap, setUsersEditMap] = useState<Record<number, { username: string; role: string; password?: string; posisi?: string }>>({});
  const [usersCreating, setUsersCreating] = useState<{ username: string; role: string; password: string; posisi?: string }>({ username: "", role: "user", password: "", posisi: "" });
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; id?: string; iid?: number; name: string; model: string; image: string; width: number; height: number; posisi?: string; nama_posisi?: string; no_posisi?: string } | null>(null);
  const [partEditMap, setPartEditMap] = useState<Record<string, { code: string; name: string; price: number }>>({});
  const [createPart, setCreatePart] = useState<{ id: string; code: string; name: string; price: number }>({ id: "", code: "", name: "", price: 0 });
  const [createPriceText, setCreatePriceText] = useState("0");
  const [priceTextMap, setPriceTextMap] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [formLocked, setFormLocked] = useState(false);
  const [createPartLocked, setCreatePartLocked] = useState(false);
  const [leftW, setLeftW] = useState(220);
  const [rightW, setRightW] = useState(420);
  const [dragResizer, setDragResizer] = useState<{ kind: 'left' | 'right'; startX: number; startLeft: number; startRight: number } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const canWrite = user?.role === 'admin' || user?.role === 'superadmin';
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [jenisOptions, setJenisOptions] = useState<string[]>([]);
  const [posisiOptions, setPosisiOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/catalog`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Catalog) => {
        setCatalog(data);
        // jangan auto pilih ilustrasi; tampilkan gambar/part hanya setelah klik
      })
      .catch(() => { notify('Gagal memuat katalog', 'error'); });
    fetch(`${API_BASE}/api/me`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setUser)
      .catch(() => {})
      .finally(() => setAuthChecked(true));
    fetch(`${API_BASE}/api/meta/illustrations/jenis-enum`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((opts: string[]) => setJenisOptions(opts))
      .catch(() => setJenisOptions(["Truck Heavy-duty","Truck Medium-duty","Truck Light-duty"]));
    fetch(`${API_BASE}/api/meta/illustrations/posisi-enum`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((opts: string[]) => setPosisiOptions(opts))
      .catch(() => setPosisiOptions(["Engine","Powertrain","Chassis/Tool","Electrical","Cabin/Rear Body"]));
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      fetch(`${API_BASE}/api/me`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(setUser)
        .catch(() => setUser(null));
    }, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedFigureIid) return;
    setCheckedIds(checkedCache[selectedFigureIid] ?? []);
    setQtyById(qtyCache[selectedFigureIid] ?? {});
    setSelectedPartIds([]);
  }, [selectedFigureIid, checkedCache, qtyCache]);
  useEffect(() => { setPartsPage(1); }, [partsQuery]);
  useEffect(() => { setPartsPage(1); }, [partsList]);
  useEffect(() => { setUsersPage(1); }, [usersQuery]);
  useEffect(() => { setUsersPage(1); }, [usersList]);

  const current = catalog ? (catalog.illustrations.find(i => i.iid === selectedFigureIid) ?? null) : null;
  function autofillById(id: string, onSuccess: (part: Part) => void, onFail: () => void) {
    const s = id.trim();
    if (!s) { onFail(); return; }
    
    // Check cache
    const cached = partsIndex[s];
    if (cached) { onSuccess(cached); return; }

    // If cache populated but not found, then it doesn't exist (assuming static full load)
    if (Object.keys(partsIndex).length > 0) { onFail(); return; }

    // Check local illustration parts (fallback)
    const local = (current?.parts ?? []).find(p => p.id === s);
    if (local) { onSuccess(local); return; }

    fetch(`${API_BASE}/api/parts`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((rows: Part[]) => {
        const idx: Record<string, Part> = {};
        for (const p of rows) idx[p.id] = p;
        setPartsIndex(idx);
        const f = idx[s];
        if (f) onSuccess(f);
        else onFail();
      })
      .catch(() => onFail());
  }
  useEffect(() => {
    const map: Record<string, { code: string; name: string; price: number }> = {};
    for (const p of current?.parts ?? []) map[p.id] = { code: p.code, name: p.name, price: Number.isFinite(p.price) ? (p.price as number) : 0 };
    setPartEditMap(map);
    const pt: Record<string, string> = {};
    for (const p of current?.parts ?? []) pt[p.id] = new Intl.NumberFormat('id-ID').format(Number.isFinite(p.price) ? (p.price as number) : 0);
    setPriceTextMap(pt);
  }, [current?.iid, current?.parts]);

  if (!catalog) return <div style={{ padding: 24 }}>Memuat katalog...</div>;

  const normalizedHotspots: Hotspot[] = (current?.hotspots ?? []).map(h => {
    const anyH = h as any;
    const ids: string[] = Array.isArray(anyH.partIds) ? anyH.partIds : [anyH.partId];
    return { partIds: ids, x: anyH.x, y: anyH.y, r: anyH.r };
  });
  const codeColWidthCh = Math.max(4, Math.max(0, ...((current?.parts ?? []).map(p => p.code.length)))) + 1;
  const idColWidthCh = Math.max(6, Math.max(0, ...((current?.parts ?? []).map(p => p.id.length)))) + 1;
  function notify(text: string, type: 'success' | 'error' = 'success') {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 2000);
  }
  function handleToggleAnnotate() {
    if (annotate) {
      const hasDraft = !!draft;
      const hasPending = pending.length > 0;
      const hasCreateFilled = !!(createPart.id || createPart.code || createPart.name);
      if (hasDraft || hasPending || hasCreateFilled) {
        if (!confirm('Keluar anotasi? Perubahan yang belum disimpan akan hilang.')) return;
      }
      setDraft(null);
      setPending([]);
      setCreatePart({ id: '', code: '', name: '', price: 0 });
    }
    setAnnotate(a => !a);
  }

  if (!user && authChecked) {
    return <Login onLoggedIn={u => setUser(u)} />;
  }

  return (
    <div
      style={{ display: "grid", gridTemplateRows: "auto 1fr", gridTemplateColumns: `${leftW}px 6px 1fr 6px ${rightW}px`, height: "100%" }}
      onMouseMove={e => {
        if (!dragResizer) return;
        const dx = e.clientX - dragResizer.startX;
        if (dragResizer.kind === 'left') {
          const next = Math.max(160, Math.min(480, dragResizer.startLeft + dx));
          setLeftW(next);
        } else {
          const next = Math.max(240, Math.min(1200, dragResizer.startRight - dx));
          setRightW(next);
        }
      }}
      onMouseUp={() => setDragResizer(null)}
      onMouseLeave={() => setDragResizer(null)}
    >
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid #eee" }}>
        <div style={{ marginRight: "auto", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/eparthino.png" alt="Logo" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <span>Part Katalog</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {canWrite && (
            <button className="btn" onClick={() => {
              setLoading(true);
              fetch(`${API_BASE}/api/users`, { credentials: 'include' })
                .then(r => r.ok ? r.json() : Promise.reject())
                .then((rows: User[]) => { setUsersList(rows); setUsersModalOpen(true); })
                .catch(() => notify('Gagal memuat users', 'error'))
                .finally(() => setLoading(false));
            }} style={{ padding: "6px 10px" }}>Manage Users</button>
          )}
          <button className="btn" onClick={() => {
            setLoading(true);
            fetch(`${API_BASE}/api/parts`)
              .then(r => r.ok ? r.json() : Promise.reject())
              .then((rows: Part[]) => {
                setPartsList(rows);
                const map: Record<string, { code: string; name: string; price: number }> = {};
                const pt: Record<string, string> = {};
                for (const p of rows) {
                  map[p.id] = { code: p.code, name: p.name, price: Number.isFinite(p.price) ? (p.price as number) : 0 };
                  pt[p.id] = new Intl.NumberFormat('id-ID').format(Number.isFinite(p.price) ? (p.price as number) : 0);
                }
                setPartsEditMap(map);
                setPartsPriceTextMap(pt);
                setPartsModalOpen(true);
              })
              .catch(() => notify('Gagal memuat parts', 'error'))
              .finally(() => setLoading(false));
          }} style={{ padding: "6px 10px" }}>List Part</button>
        </div>
        <div>{user?.username}</div>
        <button className="btn" onClick={() => { fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' }).then(() => setUser(null)); }}>Logout</button>
      </div>
      <CatalogList
        items={catalog.illustrations}
        selectedIid={current?.iid ?? null}
        onSelect={iid => { setSelectedFigureIid(iid); setSelectedPartIds([]); }}
        onCreate={() => { setEditor({ mode: "create", id: "", name: "", model: "", posisi: posisiOptions[0] ?? "", nama_posisi: "", no_posisi: "", image: "", width: 0, height: 0 }); }}
        onEdit={(iid) => {
          const base = catalog.illustrations.find(i => i.iid === iid);
          if (!base) return;
          setEditor({ mode: "edit", id: base.id, iid: base.iid, name: base.name, model: base.model ?? "", posisi: base.posisi, nama_posisi: base.nama_posisi ?? "", no_posisi: base.no_posisi ?? "", image: base.image, width: base.size.width, height: base.size.height });
        }}
        onDelete={(iid) => {
          if (!confirm("Hapus ilustrasi ini?")) return;
          fetch(`${API_BASE}/api/illustrations/iid/${iid}`, { method: "DELETE", credentials: "include" })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(() => fetch(`${API_BASE}/api/catalog`).then(r => r.json()).then(setCatalog));
        }}
        editor={editor}
        onChangeEditor={(patch) => setEditor(prev => prev ? { ...prev, ...patch } : prev)}
        onUploadImage={(file) => {
          const fd = new FormData();
          fd.append('file', file);
          fetch(`${API_BASE}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(({ path }) => setEditor(prev => prev ? { ...prev, image: path } : prev));
        }}
        onSaveEditor={() => {
          if (!editor) return;
          const { mode, id, iid, name, model, posisi, nama_posisi, no_posisi, image, width, height } = editor;
          if (mode === "create") {
            if (!id || !posisi || !name || !image || !Number.isFinite(width) || !Number.isFinite(height)) return;
            fetch(`${API_BASE}/api/illustrations`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name, model: model ?? "", posisi, nama_posisi: nama_posisi ?? "", no_posisi: no_posisi ?? "", image, width, height }) })
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(() => fetch(`${API_BASE}/api/catalog`).then(r => r.json()).then(data => { setCatalog(data); setEditor(null); }));
          } else {
            if (!posisi || !name || !image || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(iid as number)) return;
            fetch(`${API_BASE}/api/illustrations/iid/${iid}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name, model: model ?? "", posisi, nama_posisi: nama_posisi ?? "", no_posisi: no_posisi ?? "", image, width, height }) })
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(() => fetch(`${API_BASE}/api/catalog`).then(r => r.json()).then(data => { setCatalog(data); setEditor(null); }));
          }
        }}
        onCancelEditor={() => setEditor(null)}
        canWrite={canWrite}
        isSuperadmin={user?.role === 'superadmin'}
        jenisOptions={jenisOptions}
        posisiOptions={posisiOptions}
        userRole={user?.role}
        userPosisi={user?.posisi ?? null}
      />
      <div onMouseDown={e => setDragResizer({ kind: 'left', startX: e.clientX, startLeft: leftW, startRight: rightW })} style={{ cursor: 'col-resize' }} />
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {user?.role === 'superadmin' && <button className="btn" onClick={handleToggleAnnotate} style={{ padding: "6px 10px" }}>{annotate ? "Keluar mode anotasi" : "Masuk mode anotasi"}</button>}
          <button className="btn" disabled={(catalog.illustrations.flatMap(fig => checkedCache[fig.iid] ?? []).length === 0)} onClick={() => { setPreviewPage(1); setPreviewOpen(true); }} style={{ padding: "6px 10px" }}>Preview terpilih</button>
        </div>
        {current && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8, padding: "8px 10px", border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
            <div><strong>Nama:</strong> {current.name}</div>
            <div><strong>Model:</strong> {current.model}</div>
            <div><strong>Posisi:</strong> {current.posisi}</div>
            <div><strong>Nama Posisi:</strong> {current.nama_posisi}</div>
            <div><strong>No Posisi:</strong> {current.no_posisi}</div>
            <div><strong>Jenis:</strong> {current.id}</div>
          </div>
        )}
        {current && (
          <Illustration
            imageSrc={current.image && current.image.startsWith('/uploads/') ? `${API_BASE}${current.image}` : current.image}
            size={current.size}
            hotspots={normalizedHotspots}
            parts={current.parts}
            selectedIds={selectedPartIds}
            checkedIds={checkedIds}
            onPick={(ids) => {
              const related = new Set<string>(ids);
              let changed = true;
              while (changed) {
                changed = false;
                for (const h of normalizedHotspots) {
                  const intersects = h.partIds.some(pid => related.has(pid));
                  if (intersects) {
                    for (const pid of h.partIds) {
                      if (!related.has(pid)) { related.add(pid); changed = true; }
                    }
                  }
                }
              }
              const relatedIds = Array.from(related);
              setSelectedPartIds(relatedIds);
              setCheckedIds(prev => {
                const allIncluded = relatedIds.every(id => prev.includes(id));
                const next = allIncluded ? prev.filter(x => !relatedIds.includes(x)) : Array.from(new Set([...prev, ...relatedIds]));
                setCheckedCache(pc => ({ ...pc, [current!.iid]: next }));
                return next;
              });
              setQtyById(prev => {
                const nextQty = { ...prev };
                for (const id of relatedIds) nextQty[id] = 1;
                setQtyCache(qc => ({ ...qc, [current!.iid]: nextQty }));
                return nextQty;
              });
            }}
            annotate={annotate}
            onCreateHotspot={(x, y) => { setDraft({ x, y }); }}
            onMoveHotspot={(index, x, y) => {
              const next = normalizedHotspots.map((h, i) => i === index ? { ...h, x, y } : h);
              setLoading(true);
              fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}/structure`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts: current!.parts, hotspots: next }) })
                .then(r2 => r2.ok ? r2.json() : Promise.reject())
                .then(() => fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}`).then(r3 => r3.json()).then(data => {
                  setCatalog(prev => {
                    if (!prev) return prev;
                    const idx2 = prev.illustrations.findIndex(i => i.iid === current!.iid);
                    const nextCat = { ...prev, illustrations: [...prev.illustrations] };
                    nextCat.illustrations[idx2] = data;
                    return nextCat;
                  });
                  notify('Hotspot dipindahkan');
                }))
                .catch(() => notify('Gagal memindahkan hotspot', 'error'))
                .finally(() => setLoading(false));
            }}
          />
        )}
      {previewOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: 'none' }}>
            <div style={{ background: "#fff", width: "min(1000px, 96vw)", maxHeight: "90vh", overflow: "auto", borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.2)", pointerEvents: 'auto' }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #eee" }}>
                <div style={{ fontWeight: 700 }}>Estimasi</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => {
                    const items = catalog.illustrations.flatMap(fig => {
                      const ids = checkedCache[fig.iid] ?? [];
                      return ids.map(id => {
                        const p = fig.parts.find(pp => pp.id === id);
                        if (!p) return null as any;
                        const pcs = qtyCache[fig.iid]?.[id] ?? 1;
                        const harga = fig.parts.find(pp => pp.id === id)?.price ?? 0;
                        const subtotal = pcs * harga;
                        return { figName: fig.name, pid: id, code: p.code, name: p.name, pcs, harga, subtotal };
                      }).filter(Boolean);
                    });
                  const header = ["Nama Ilustrasi", "ID", "Kode", "Nama Part", "Pcs", "Harga", "Subtotal"];
                  const dataRows = items.map(it => [it.figName, it.pid, it.code, it.name, it.pcs, it.harga, it.subtotal]);
                  const grandTotal = items.reduce((sum, it) => sum + it.subtotal, 0);
                  const aoa = [header, ...dataRows, ["", "", "", "Grand Total", "", "", grandTotal]];
                  const ws = XLSX.utils.aoa_to_sheet(aoa);
                  const range = XLSX.utils.decode_range(ws["!ref"]!);
                  for (let R = 1; R <= range.e.r; R++) {
                      const hargaCell = XLSX.utils.encode_cell({ c: 5, r: R });
                      const subtotalCell = XLSX.utils.encode_cell({ c: 6, r: R });
                      if (ws[hargaCell]) ws[hargaCell].z = "#,##0";
                      if (ws[subtotalCell]) ws[subtotalCell].z = "#,##0";
                  }
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Preview");
                    XLSX.writeFile(wb, `preview_terpilih_${new Date().toISOString().slice(0,10)}.xlsx`);
                  }} style={{ padding: "6px 10px" }}>Export XLSX</button>
                  <button className="btn" onClick={() => {
                    const items = catalog.illustrations.flatMap(fig => {
                      const ids = checkedCache[fig.iid] ?? [];
                      return ids.map(id => {
                        const p = fig.parts.find(pp => pp.id === id);
                        if (!p) return null as any;
                        const pcs = qtyCache[fig.iid]?.[id] ?? 1;
                        const harga = fig.parts.find(pp => pp.id === id)?.price ?? 0;
                        const subtotal = pcs * harga;
                        return { figName: fig.name, pid: id, code: p.code, name: p.name, pcs, harga, subtotal };
                      }).filter(Boolean);
                    });
                    const fmt = new Intl.NumberFormat('id-ID');
                    const rows = items.map(it => `<tr><td style=\"text-align:left\">${it.figName}</td><td style=\"text-align:left\">${it.pid}</td><td style=\"text-align:left\">${it.code}</td><td style=\"text-align:left\">${it.name}</td><td style=\"text-align:right\">${it.pcs}</td><td style=\"text-align:right\">${fmt.format(it.harga)}</td><td style=\"text-align:right\">${fmt.format(it.subtotal)}</td></tr>`).join("");
                    const grandTotal = items.reduce((sum, it) => sum + it.subtotal, 0);
                    const html = `<!doctype html><html><head><meta charset=\"utf-8\" /><title>Estimasi</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px;font-size:12px;line-height:1.35} h3{margin:0 0 12px;font-size:14px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:6px;font-size:12px} th{text-align:left;background:#fafafa} td{text-align:right} td:nth-child(1),td:nth-child(2),td:nth-child(3),td:nth-child(4){text-align:left} .summary td{font-weight:700}</style></head><body><h3>Estimasi</h3><table><thead><tr><th>Nama Ilustrasi</th><th>ID</th><th>Kode</th><th>Nama Part</th><th>Pcs</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>${rows}<tr class=\"summary\"><td></td><td></td><td></td><td>Grand Total</td><td></td><td></td><td>${fmt.format(grandTotal)}</td></tr></tbody></table></body></html>`;
                    const iframe = document.createElement('iframe');
                    iframe.style.position = 'fixed';
                    iframe.style.right = '100%';
                    iframe.style.width = '0';
                    iframe.style.height = '0';
                    document.body.appendChild(iframe);
                    const w = iframe.contentWindow!;
                    w.document.open();
                    w.document.write(html);
                    w.document.close();
                    setTimeout(() => { w.focus(); w.print(); setTimeout(() => document.body.removeChild(iframe), 300); }, 50);
                  }} style={{ padding: "6px 10px" }}>Print Preview</button>
                  <button className="btn" onClick={() => setPreviewOpen(false)} style={{ padding: "6px 10px" }}>Tutup</button>
                </div>
              </div>
              <div style={{ padding: "10px 16px" }}>
                <div style={{ position: "sticky", top: 0, zIndex: 5, display: "grid", gridTemplateColumns: "160px 110px 110px minmax(220px, 1fr) 64px 100px 110px", gap: 12, padding: "8px 12px", fontWeight: 600, background: "#fafafa", border: "1px solid #eee", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
                  <div>Nama Ilustrasi</div>
                  <div>ID</div>
                  <div>Kode</div>
                  <div>Nama Part</div>
                  <div style={{ textAlign: "right" }}>Pcs</div>
                  <div style={{ textAlign: "right" }}>Harga</div>
                  <div style={{ textAlign: "right" }}>Subtotal</div>
                </div>
                {(() => {
                  const items = catalog.illustrations.flatMap(fig => {
                    const ids = checkedCache[fig.iid] ?? [];
                    return ids.map(id => {
                      const p = fig.parts.find(pp => pp.id === id);
                      if (!p) return null as any;
                      const pcs = qtyCache[fig.iid]?.[id] ?? 1;
                      const harga = fig.parts.find(pp => pp.id === id)?.price ?? 0;
                      const subtotal = pcs * harga;
                      return { key: `${fig.iid}-${id}`, figName: fig.name, pid: id, code: p.code, name: p.name, pcs, harga, subtotal };
                    }).filter(Boolean);
                  });
                  const grandTotal = items.reduce((sum, it) => sum + it.subtotal, 0);
                  const totalPages = Math.max(1, Math.ceil(items.length / 10));
                  const page = Math.min(previewPage, totalPages);
                  const start = (page - 1) * 10;
                  const pageItems = items.slice(start, start + 10);
                  return (
                    <>
                      {pageItems.map((it, idx) => (
                        <div key={it.key} style={{ display: "grid", gridTemplateColumns: "160px 110px 110px minmax(220px, 1fr) 64px 100px 110px", gap: 12, padding: "8px 12px", borderBottom: "1px solid #f0f0f0", background: (((start + idx) % 2) === 1) ? "#fbfbfb" : "#fff" }}>
                          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={it.figName}>{it.figName}</div>
                          <div style={{ whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>{it.pid}</div>
                          <div style={{ whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>{it.code}</div>
                          <div style={{ whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>{it.name}</div>
                          <div style={{ textAlign: "right" }}>{it.pcs}</div>
                          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat('id-ID').format(it.harga)}</div>
                          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat('id-ID').format(it.subtotal)}</div>
                        </div>
                      ))}
                      <div style={{ position: "sticky", bottom: 0, zIndex: 4, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "8px 12px", background: "#fff", borderTop: "1px solid #eee" }}>
                        <button className="btn" disabled={page <= 1} onClick={() => setPreviewPage(p => Math.max(1, p - 1))} style={{ padding: "4px 8px" }}>Prev</button>
                        <span>Halaman {page}/{totalPages}</span>
                        <button className="btn" disabled={page >= totalPages} onClick={() => setPreviewPage(p => Math.min(totalPages, p + 1))} style={{ padding: "4px 8px" }}>Next</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "160px 110px minmax(220px, 1fr) 64px 100px 110px", gap: 12, padding: "12px 12px", fontWeight: 700, background: "#f6f8ff", borderTop: "1px solid #e5e7eb" }}>
                        <div></div>
                        <div></div>
                        <div style={{ textAlign: "right" }}>Grand Total</div>
                        <div></div>
                        <div></div>
                        <div style={{ textAlign: "right" }}>{new Intl.NumberFormat('id-ID').format(grandTotal)}</div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        {annotate && draft && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateRows: "auto auto", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8 }}>
              <input placeholder="Part ID" value={form.id} onChange={e => { 
                const v = e.target.value; 
                setForm({ ...form, id: v, code: "", name: "" }); 
                setFormLocked(false);
                autofillById(v, 
                  (part) => {
                    setForm(prev => {
                      if (prev.id !== v) return prev;
                      setFormLocked(true);
                      return { ...prev, code: part.code, name: part.name };
                    });
                  },
                  () => {
                    setForm(prev => {
                      if (prev.id !== v) return prev;
                      setFormLocked(false);
                      return prev;
                    });
                  }
                ); 
              }} />
              <input placeholder="Kode" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} disabled={formLocked} style={{ background: formLocked ? '#eee' : '#fff' }} />
              <input placeholder="Nama" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={formLocked} style={{ background: formLocked ? '#eee' : '#fff' }} />
              <button className="btn" onClick={() => {
                if (!form.id.trim()) return;
                const part: Part = { id: form.id.trim(), code: (form.code || form.id).trim(), name: (form.name || form.id).trim() };
                setPending(prev => {
                  const exists = prev.some(p => p.id === part.id);
                  return exists ? prev.map(p => (p.id === part.id ? part : p)) : [...prev, part];
                });
                setForm({ ...form, id: "", code: "", name: "" });
              }}>Tambah item</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px auto auto", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pending.map(p => (
                  <span key={p.id} style={{ padding: "4px 8px", background: "#eef3ff", border: "1px solid #c9d7ff", borderRadius: 12 }}>
                    {p.code} — {p.name}
                    <button style={{ marginLeft: 8 }} onClick={() => setPending(prev => prev.filter(x => x.id !== p.id))}>×</button>
                  </span>
                ))}
              </div>
              <input type="number" placeholder="Radius" min={1} step={1} value={form.r} onChange={e => setForm({ ...form, r: Number(e.target.value) })} />
              <button className="btn" onClick={() => { setPending([]); setDraft(null); }}>Batal</button>
              <button className="btn" disabled={pending.length === 0 || loading} onClick={() => {
                if (!current || pending.length === 0) return;
                const ids = pending.map(p => p.id);
                const r = Math.max(1, Math.floor(form.r));
                const mergedPartsMap = new Map<string, Part>();
                for (const p of current.parts) mergedPartsMap.set(p.id, p);
                for (const p of pending) mergedPartsMap.set(p.id, p);
                const updated: IllustrationData = {
                  ...current,
                  parts: Array.from(mergedPartsMap.values()),
                  hotspots: [...current.hotspots, { partIds: ids, x: draft.x, y: draft.y, r }]
                };
                setCatalog(prev => {
                  if (!prev) return prev;
                  const idx = prev.illustrations.findIndex(i => i.iid === current.iid);
                  const next = { ...prev, illustrations: [...prev.illustrations] };
                  next.illustrations[idx] = updated;
                  return next;
                });
                setLoading(true);
                fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}/structure`, {
                  method: 'PUT',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ parts: updated.parts, hotspots: updated.hotspots })
                })
                  .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(j => Promise.reject({ status: r.status, error: j?.error })))
                  .then(() => fetch(`${API_BASE}/api/catalog`).then(r => r.json()).then(setCatalog).then(() => notify('Hotspot tersimpan')))
                  .catch((err) => {
                    if (err && err.status === 401) notify('Harus login untuk menyimpan', 'error');
                    else if (err && err.status === 400) notify('Data tidak lengkap', 'error');
                    else notify('Gagal menyimpan hotspot', 'error');
                  })
                  .finally(() => setLoading(false));
                setSelectedPartIds(ids);
                setDraft(null);
                setPending([]);
                setForm({ id: "", code: "", name: "", r: 16 });
              }}>Simpan hotspot ({pending.length})</button>
            </div>
          </div>
        )}
        {annotate && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateRows: "auto auto", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 140px auto", gap: 8 }}>
              <input placeholder="Part ID" value={createPart.id} onChange={e => { 
                const v = e.target.value; 
                setCreatePart({ ...createPart, id: v, code: "", name: "" }); 
                setCreatePartLocked(false);
                autofillById(v, 
                  (part) => {
                    setCreatePart(prev => {
                      if (prev.id !== v) return prev;
                      setCreatePartLocked(true);
                      return { ...prev, code: part.code, name: part.name };
                    });
                  },
                  () => {
                    setCreatePart(prev => {
                      if (prev.id !== v) return prev;
                      setCreatePartLocked(false);
                      return prev;
                    });
                  }
                ); 
              }} />
              <input placeholder="Kode" value={createPart.code} onChange={e => setCreatePart({ ...createPart, code: e.target.value })} disabled={createPartLocked} style={{ background: createPartLocked ? '#eee' : '#fff' }} />
              <input placeholder="Nama" value={createPart.name} onChange={e => setCreatePart({ ...createPart, name: e.target.value })} disabled={createPartLocked} style={{ background: createPartLocked ? '#eee' : '#fff' }} />
              <input placeholder="Harga" value={createPriceText} onChange={e => {
                const s = e.target.value;
                const digits = s.replace(/[^0-9]/g, '');
                const n = Math.max(0, Math.floor(Number(digits || '0')));
                setCreatePart({ ...createPart, price: n });
                setCreatePriceText(new Intl.NumberFormat('id-ID').format(n));
              }} />
              <button className="btn" disabled={loading} onClick={() => {
                const id = createPart.id.trim();
                const code = (createPart.code || id).trim();
                const name = (createPart.name || id).trim();
                const price = Number.isFinite(createPart.price) ? createPart.price : 0;
                if (!current || !id) return;
                setLoading(true);
                fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}/parts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partId: id, code, name, price }) })
                  .then(r => r.ok ? r.json() : Promise.reject())
                  .then(() => fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}`).then(r => r.json()).then(data => {
                    setCatalog(prev => {
                      if (!prev) return prev;
                      const idx = prev.illustrations.findIndex(i => i.iid === current!.iid);
                      const next = { ...prev, illustrations: [...prev.illustrations] };
                      next.illustrations[idx] = data;
                      return next;
                    });
                    setCreatePart({ id: "", code: "", name: "", price: 0 });
                    setCreatePriceText("0");
                    notify('Part ditambahkan');
                  })).catch(() => notify('Gagal tambah part', 'error')).finally(() => setLoading(false));
              }}>Tambah/Link Part</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {(current?.parts ?? []).map(p => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 140px auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ whiteSpace: "nowrap" }}>{p.id}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="Kode" value={partEditMap[p.id]?.code ?? p.code} onChange={e => setPartEditMap(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { code: p.code, name: p.name, price: p.price ?? 0 }), code: e.target.value } }))} />
                    <input placeholder="Nama" value={partEditMap[p.id]?.name ?? p.name} onChange={e => setPartEditMap(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { code: p.code, name: p.name, price: p.price ?? 0 }), name: e.target.value } }))} />
                  </div>
                  <input placeholder="Harga" value={priceTextMap[p.id] ?? new Intl.NumberFormat('id-ID').format(partEditMap[p.id]?.price ?? (p.price ?? 0))} onChange={e => {
                    const s = e.target.value;
                    const digits = s.replace(/[^0-9]/g, '');
                    const n = Math.max(0, Math.floor(Number(digits || '0')));
                    setPartEditMap(prev => ({
                      ...prev,
                      [p.id]: { ...(prev[p.id] ?? { code: p.code, name: p.name, price: p.price ?? 0 }), price: n }
                    }));
                    setPriceTextMap(prev => ({ ...prev, [p.id]: new Intl.NumberFormat('id-ID').format(n) }));
                  }} />
                  <button className="btn" disabled={loading} onClick={() => {
                    const base = partEditMap[p.id] ?? { code: p.code, name: p.name, price: p.price ?? 0 };
                    const patch = { ...base, price: Number.isFinite(base.price) ? Math.max(0, Math.floor(base.price)) : 0 };
                    setLoading(true);
                    fetch(`${API_BASE}/api/parts/${p.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
                      .then(r => r.ok ? r.json() : Promise.reject())
                      .then(() => fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}`).then(r => r.json()).then(data => {
                        setCatalog(prev => {
                          if (!prev) return prev;
                          const idx = prev.illustrations.findIndex(i => i.iid === current!.iid);
                          const next = { ...prev, illustrations: [...prev.illustrations] };
                          next.illustrations[idx] = data;
                          return next;
                        });
                        notify('Part disimpan');
                      })).catch(() => notify('Gagal simpan part', 'error')).finally(() => setLoading(false));
                  }}>Simpan</button>
                  <button className="btn" disabled={loading} onClick={() => {
                    setLoading(true);
                    fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}/parts/${p.id}`, { method: 'DELETE', credentials: 'include' })
                      .then(r => r.ok ? r.json() : Promise.reject())
                      .then(() => fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}`).then(r => r.json()).then(data => {
                        setCatalog(prev => {
                          if (!prev) return prev;
                          const idx = prev.illustrations.findIndex(i => i.iid === current!.iid);
                          const next = { ...prev, illustrations: [...prev.illustrations] };
                          next.illustrations[idx] = data;
                          return next;
                        });
                        notify('Part dihapus dari ilustrasi');
                      })).catch(() => notify('Gagal hapus part', 'error')).finally(() => setLoading(false));
                  }}>Hapus dari ilustrasi</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontWeight: 600 }}>Hotspot</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {normalizedHotspots.map((h, idx) => (
                <div key={`${h.partIds.join('|')}-${h.x}-${h.y}`} style={{ display: 'grid', gridTemplateColumns: '1fr 160px auto auto', gap: 8, alignItems: 'center' }}>
                  <div>{h.partIds.map(pid => (current!.parts.find(pp => pp.id === pid)?.code ?? pid)).join(', ')}</div>
                  <input type="number" value={h.r} onChange={e => {
                    const r = Math.max(1, Math.floor(Number(e.target.value)));
                    const next = normalizedHotspots.map((x, i) => i === idx ? { ...x, r } : x);
                    setLoading(true);
                    fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}/structure`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts: current!.parts, hotspots: next }) })
                      .then(r2 => r2.ok ? r2.json() : Promise.reject())
                      .then(() => fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}`).then(r3 => r3.json()).then(data => {
                        setCatalog(prev => {
                          if (!prev) return prev;
                          const idx2 = prev.illustrations.findIndex(i => i.iid === current!.iid);
                          const nextCat = { ...prev, illustrations: [...prev.illustrations] };
                          nextCat.illustrations[idx2] = data;
                          return nextCat;
                        });
                        notify('Radius hotspot disimpan');
                      }))
                      .catch(() => notify('Gagal menyimpan radius', 'error'))
                      .finally(() => setLoading(false));
                  }} />
                  <button className="btn" disabled={loading} onClick={() => {
                    const next = normalizedHotspots.filter((_, i) => i !== idx);
                    setLoading(true);
                    fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}/structure`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts: current!.parts, hotspots: next }) })
                      .then(r2 => r2.ok ? r2.json() : Promise.reject())
                      .then(() => fetch(`${API_BASE}/api/illustrations/iid/${current!.iid}`).then(r3 => r3.json()).then(data => {
                        setCatalog(prev => {
                          if (!prev) return prev;
                          const idx2 = prev.illustrations.findIndex(i => i.iid === current!.iid);
                          const nextCat = { ...prev, illustrations: [...prev.illustrations] };
                          nextCat.illustrations[idx2] = data;
                          return nextCat;
                        });
                        notify('Hotspot dihapus');
                      }))
                      .catch(() => notify('Gagal menghapus hotspot', 'error'))
                      .finally(() => setLoading(false));
                  }}>Hapus hotspot</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div onMouseDown={e => setDragResizer({ kind: 'right', startX: e.clientX, startLeft: leftW, startRight: rightW })} style={{ cursor: 'col-resize' }} />
      {notice && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, padding: '10px 12px', borderRadius: 8, color: notice.type === 'error' ? '#7f1d1d' : '#064e3b', background: notice.type === 'error' ? '#fee2e2' : '#d1fae5', border: '1px solid #fca5a5' }}>
          {notice.text}
        </div>
      )}
      {partsModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
          <div style={{ background: "#fff", width: "min(820px, 96vw)", maxHeight: "88vh", overflow: "hidden", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", fontSize: 11, lineHeight: 1.2, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid #eee", position: "sticky", top: 0, background: "#fff", zIndex: 2 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>List Part</div>
              <div style={{ display: "flex", gap: 6 }}>
                {canWrite && (
                  <>
                    <button className="btn" onClick={() => {
                      const header = ["Part ID", "Kode", "Nama", "Harga"];
                      const ws = XLSX.utils.aoa_to_sheet([header, ["", "", "", ""]]);
                      const range = XLSX.utils.decode_range(ws["!ref"]!);
                      for (let R = 2; R <= range.e.r; R++) {
                        const hargaCell = XLSX.utils.encode_cell({ c: 3, r: R });
                        if (ws[hargaCell]) ws[hargaCell].z = "#,##0";
                      }
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template");
                      XLSX.writeFile(wb, "template_import_parts.xlsx");
                    }} style={{ padding: "2px 6px", fontSize: 10 }}>Download Template</button>
                    <input type="file" ref={importFileRef} accept=".xlsx,.xls" style={{ display: 'none' }} />
                    <button className="btn" onClick={() => importFileRef.current?.click()} style={{ padding: "2px 6px", fontSize: 10 }}>Browse</button>
                    <button className="btn" disabled={loading} onClick={() => {
                      const file = importFileRef.current?.files?.[0];
                      if (!file) return;
                      setLoading(true);
                      file.arrayBuffer()
                        .then(ab => {
                          const wb = XLSX.read(ab, { type: 'array' });
                          const ws = wb.Sheets[wb.SheetNames[0]];
                          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                          const header = (rows[0] ?? []).map(x => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ''));
                          const idx = (names: string[]) => header.findIndex(h => names.includes(h));
                          const idIdx = idx(['partid','id','part_id']);
                          const codeIdx = idx(['kode','code']);
                          const nameIdx = idx(['nama','name']);
                          const priceIdx = idx(['harga','price']);
                          const additionalIdx = idx(['additional']);
                          const exists = new Set(partsList.map(p => p.id));
                          const ops: { id: string; code: string; name: string; price: number; exists: boolean }[] = [];
                          for (let r = 1; r < rows.length; r++) {
                            const row = rows[r] || [];
                            const id = String(row[idIdx] ?? '').trim();
                            if (!id) continue;
                            const code = String(row[codeIdx] ?? id).trim();
                            const name = String(row[nameIdx] ?? id).trim();
                            const priceRaw = row[priceIdx];
                            const priceDigits = String(priceRaw ?? '').replace(/[^0-9]/g, '');
                            const price = Math.max(0, Math.floor(Number(priceDigits || '0')));
                            const additional = String(row[additionalIdx] ?? '').trim();
                            ops.push({ id, code, name, price, additional, exists: exists.has(id) } as any);
                          }
                          let chain = Promise.resolve();
                          ops.forEach(op => {
                            if (op.exists) {
                              chain = chain.then(() => fetch(`${API_BASE}/api/parts/${op.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: op.code, name: op.name, price: op.price, additional: (op as any).additional ?? '' }) }).then(r => r.ok ? r.json() : Promise.reject()));
                            } else {
                              chain = chain.then(() => fetch(`${API_BASE}/api/parts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: op.id, code: op.code, name: op.name, price: op.price, additional: (op as any).additional ?? '' }) }).then(r => r.ok ? r.json() : Promise.reject()));
                            }
                          });
                          return chain;
                        })
                        .then(() => fetch(`${API_BASE}/api/parts`).then(r => r.json()).then(rows => { setPartsList(rows); notify('Import selesai'); }))
                        .then(() => fetch(`${API_BASE}/api/catalog`).then(r => r.json()).then(data => { setCatalog(data); }))
                        .catch(() => notify('Gagal import', 'error'))
                        .finally(() => { setLoading(false); if (importFileRef.current) importFileRef.current.value = ''; });
                    }} style={{ padding: "2px 6px", fontSize: 10 }}>Import XLSX</button>
                    <div style={{ width: 1, height: 22, background: "#eee", marginLeft: 6, marginRight: 6 }} />
                  </>
                )}
                <input placeholder="Cari Part ID/kode/nama" value={partsQuery} onChange={e => setPartsQuery(e.target.value)} style={{ padding: "3px 6px", border: "1px solid #ddd", borderRadius: 6, fontSize: 11, height: 22 }} />
                <button className="btn" onClick={() => setPartsModalOpen(false)} style={{ padding: "2px 6px", fontSize: 10 }}>Tutup</button>
              </div>
            </div>
            <div style={{ padding: "6px 10px", display: "grid", gap: 6, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px 120px minmax(240px, 1fr) 100px 86px", gap: 6, padding: "4px 6px", fontWeight: 600, background: "#fafafa", border: "1px solid #eee", position: "sticky", top: 0, zIndex: 1 }}>
                <div>Part ID</div>
                <div>Kode</div>
                <div>Nama</div>
                <div style={{ textAlign: 'right' }}>Harga</div>
                <div style={{ textAlign: 'center' }}>Aksi</div>
              </div>
              {(() => {
                const q = partsQuery.trim().toLowerCase();
                const list = q ? partsList.filter(p => p.id.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) : partsList;
                const pageSize = 10;
                const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
                const page = Math.min(Math.max(partsPage, 1), totalPages);
                const start = (page - 1) * pageSize;
                const pageItems = list.slice(start, start + pageSize);
                return (
                  <>
                    {pageItems.map(p => (
                      <div key={p.id} style={{ display: "grid", gridTemplateColumns: "120px 120px minmax(240px, 1fr) 100px 86px", gap: 4, padding: "1px 4px", borderBottom: "1px solid #f0f0f0", alignItems: 'center' }}>
                        <div style={{ whiteSpace: 'nowrap' }}>{p.id}</div>
                        {partsEditId === p.id ? (
                          <input placeholder="Kode" value={partsEditMap[p.id]?.code ?? p.code} onChange={e => setPartsEditMap(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { code: p.code, name: p.name, price: p.price ?? 0 }), code: e.target.value } }))} style={{ padding: "3px 6px", height: 22 }} />
                        ) : (
                          <div style={{ whiteSpace: 'nowrap' }}>{p.code}</div>
                        )}
                        {partsEditId === p.id ? (
                          <input placeholder="Nama" value={partsEditMap[p.id]?.name ?? p.name} onChange={e => setPartsEditMap(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { code: p.code, name: p.name, price: p.price ?? 0 }), name: e.target.value } }))} style={{ padding: "3px 6px", height: 22 }} />
                        ) : (
                          <div style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{p.name}</div>
                        )}
                        {partsEditId === p.id ? (
                          <input placeholder="Harga" value={partsPriceTextMap[p.id] ?? new Intl.NumberFormat('id-ID').format(partsEditMap[p.id]?.price ?? (p.price ?? 0))} onChange={e => {
                            const s = e.target.value;
                            const digits = s.replace(/[^0-9]/g, '');
                            const n = Math.max(0, Math.floor(Number(digits || '0')));
                            setPartsEditMap(prev => ({ ...prev, [p.id]: { ...(prev[p.id] ?? { code: p.code, name: p.name, price: p.price ?? 0 }), price: n } }));
                            setPartsPriceTextMap(prev => ({ ...prev, [p.id]: new Intl.NumberFormat('id-ID').format(n) }));
                          }} style={{ padding: "3px 6px", height: 22, textAlign: 'right' }} />
                        ) : (
                          <div style={{ textAlign: 'right' }}>{new Intl.NumberFormat('id-ID').format(Number.isFinite(p.price) ? (p.price as number) : 0)}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          {partsEditId === p.id ? (
                            <>
                              <button className="btn" title="Simpan" disabled={loading || !canWrite} onClick={() => {
                                const base = partsEditMap[p.id] ?? { code: p.code, name: p.name, price: p.price ?? 0 };
                                const patch = { ...base, price: Number.isFinite(base.price) ? Math.max(0, Math.floor(base.price)) : 0 };
                                setLoading(true);
                                fetch(`${API_BASE}/api/parts/${p.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
                                  .then(r => r.ok ? r.json() : Promise.reject())
                                  .then(() => fetch(`${API_BASE}/api/parts`)
                                    .then(r => r.json())
                                    .then(rows => { setPartsList(rows); setPartsEditId(null); notify('Part disimpan'); }))
                                  .then(() => fetch(`${API_BASE}/api/catalog`)
                                    .then(r => r.json())
                                    .then(data => { setCatalog(data); }))
                                  .catch(() => notify('Gagal simpan part', 'error'))
                                  .finally(() => setLoading(false));
                              }} style={{ padding: '2px 4px', fontSize: 12 }}>💾</button>
                              <button className="btn" title="Batal" onClick={() => setPartsEditId(null)} style={{ padding: '2px 4px', fontSize: 12 }}>✖️</button>
                            </>
                          ) : (
                            <>
                              {canWrite && (
                                <button className="btn" title="Edit" onClick={() => {
                                  setPartsEditId(p.id);
                                  setPartsEditMap(prev => ({ ...prev, [p.id]: { code: p.code, name: p.name, price: Number.isFinite(p.price) ? (p.price as number) : 0 } }));
                                  setPartsPriceTextMap(prev => ({ ...prev, [p.id]: new Intl.NumberFormat('id-ID').format(Number.isFinite(p.price) ? (p.price as number) : 0) }));
                                }} style={{ padding: '2px 4px', fontSize: 12 }}>✏️</button>
                              )}
                              {canWrite && (
                                <button
                                  className="btn"
                                  title="Hapus"
                                  disabled={user?.role !== 'superadmin'}
                                  onClick={() => {
                                    if (user?.role !== 'superadmin') return;
                                    if (!confirm('Hapus part ini?')) return;
                                    setLoading(true);
                                    fetch(`${API_BASE}/api/parts/${p.id}`, { method: 'DELETE', credentials: 'include' })
                                      .then(r => r.ok ? r.json() : Promise.reject())
                                      .then(() => fetch(`${API_BASE}/api/parts`)
                                        .then(r => r.json())
                                        .then(rows => { setPartsList(rows); notify('Part dihapus'); }))
                                      .then(() => fetch(`${API_BASE}/api/catalog`)
                                        .then(r => r.json())
                                        .then(data => { setCatalog(data); }))
                                      .catch(() => notify('Gagal hapus part', 'error'))
                                      .finally(() => setLoading(false));
                                  }}
                                  style={{ padding: '2px 4px', fontSize: 12 }}
                                >🗑️</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '6px 10px' }}>
                      <div>Halaman {page} dari {totalPages}</div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button className="btn" disabled={page <= 1} onClick={() => setPartsPage(page - 1)} style={{ padding: '2px 6px', fontSize: 10 }}>Prev</button>
                        <button className="btn" disabled={page >= totalPages} onClick={() => setPartsPage(page + 1)} style={{ padding: '2px 6px', fontSize: 10 }}>Next</button>
                      </div>
                      <div />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {usersModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', width: 'min(900px, 96vw)', maxHeight: '88vh', overflow: 'hidden', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'grid', gridTemplateRows: 'auto 1fr', gap: 6, fontSize: 11, lineHeight: 1.2 }}>
            <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #eee' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Manage Users</div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input placeholder="Cari username/role" value={usersQuery} onChange={e => setUsersQuery(e.target.value)} style={{ padding: '3px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 11, height: 22 }} />
                <button className="btn" onClick={() => setUsersModalOpen(false)} style={{ padding: '2px 6px', fontSize: 10 }}>Tutup</button>
              </div>
            </div>
            <div style={{ padding: '6px 10px', display: 'grid', gap: 6, overflowY: 'auto', overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '50px minmax(120px, 1fr) 100px 140px 140px 90px', gap: 6, alignItems: 'center', padding: '4px 6px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 2, background: '#fff', height: 36, boxSizing: 'border-box' }}>
                <div />
                <input placeholder="Username baru" value={usersCreating.username} onChange={e => setUsersCreating({ ...usersCreating, username: e.target.value })} style={{ padding: '3px 6px', height: 24, width: '100%', border: '1px solid #ddd', borderRadius: 6, fontSize: 11 }} />
              <select value={usersCreating.role} onChange={e => setUsersCreating({ ...usersCreating, role: e.target.value })} style={{ padding: '3px 6px', height: 24, width: '100%', border: '1px solid #ddd', borderRadius: 6, fontSize: 11 }}>
                  <option value="user">user</option>
                  {user?.role === 'superadmin' && <option value="admin">admin</option>}
                  {user?.role === 'superadmin' && <option value="partshop">partshop</option>}
                  {user?.role === 'superadmin' && <option value="superadmin">superadmin</option>}
                </select>
                <select value={usersCreating.posisi || ""} onChange={e => setUsersCreating({ ...usersCreating, posisi: e.target.value })} style={{ padding: '3px 6px', height: 24, width: '100%', border: '1px solid #ddd', borderRadius: 6, fontSize: 11 }}>
                  <option value="">Pilih Posisi</option>
                  {posisiOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
                <input placeholder="Password" type="password" value={usersCreating.password} onChange={e => setUsersCreating({ ...usersCreating, password: e.target.value })} style={{ padding: '3px 6px', height: 24, width: '100%', border: '1px solid #ddd', borderRadius: 6, fontSize: 11 }} />
                <button className="btn" disabled={loading || !canWrite} onClick={() => {
                  const { username, role, password, posisi } = usersCreating;
                  if (!username.trim() || !password) return;
                  setLoading(true);
                  fetch(`${API_BASE}/api/users`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), role, password, posisi: posisi || null }) })
                    .then(r => r.ok ? r.json() : Promise.reject())
                    .then(() => fetch(`${API_BASE}/api/users`, { credentials: 'include' }).then(r => r.json()).then(rows => { setUsersList(rows); setUsersCreating({ username: '', role: 'user', password: '', posisi: '' }); notify('User dibuat'); }))
                    .catch(() => notify('Gagal membuat user', 'error'))
                    .finally(() => setLoading(false));
                }} style={{ padding: '2px 6px', fontSize: 10, width: '100%', height: 24, borderRadius: 6, whiteSpace: 'nowrap' }}>Tambah</button>
              </div>
               <div style={{ display: 'grid', gridTemplateColumns: '50px minmax(120px, 1fr) 100px 140px 140px 90px', gap: 6, padding: '4px 6px', fontWeight: 600, background: '#fafafa', border: '1px solid #eee', position: 'sticky', top: 36, zIndex: 1 }}>
                <div style={{ textAlign: 'center' }}>No</div>
                <div>Username</div>
                <div>Role</div>
                <div>Posisi</div>
                <div>Dibuat</div>
                <div style={{ textAlign: 'center' }}>Aksi</div>
              </div>
              {(() => {
                const q = usersQuery.trim().toLowerCase();
                let list = usersList;
                if (user?.role !== 'superadmin') {
                  list = list.filter(u => u.role !== 'partshop');
                }
                if (q) {
                  list = list.filter(u => u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
                }
                const pageSize = 10;
                const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
                const page = Math.min(Math.max(usersPage, 1), totalPages);
                const start = (page - 1) * pageSize;
                const pageItems = list.slice(start, start + pageSize);
                return (
                  <>
                    {pageItems.map((u, idx) => (
                      <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '50px minmax(120px, 1fr) 100px 140px 140px 90px', gap: 6, padding: '1px 4px', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
                        <div style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{start + idx + 1}</div>
                        {usersEditId === u.id ? (
                          <input placeholder="Username" value={usersEditMap[u.id]?.username ?? u.username} onChange={e => setUsersEditMap(prev => ({ ...prev, [u.id]: { ...(prev[u.id] ?? { username: u.username, role: u.role, posisi: u.posisi }), username: e.target.value } }))} style={{ padding: '3px 6px', height: 22, width: '100%' }} />
                        ) : (
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.username}</div>
                        )}
                        {usersEditId === u.id ? (
                          <select value={usersEditMap[u.id]?.role ?? u.role} onChange={e => setUsersEditMap(prev => ({ ...prev, [u.id]: { ...(prev[u.id] ?? { username: u.username, role: u.role, posisi: u.posisi }), role: e.target.value } }))} style={{ padding: '3px 6px', height: 22, width: '100%' }}>
                            <option value="user">user</option>
                            {user?.role === 'superadmin' && <option value="admin">admin</option>}
                            {user?.role === 'superadmin' && <option value="partshop">partshop</option>}
                            {user?.role === 'superadmin' && <option value="superadmin">superadmin</option>}
                          </select>
                        ) : (
                          <div style={{ whiteSpace: 'nowrap' }}>{u.role}</div>
                        )}
                        {usersEditId === u.id ? (
                          <select value={usersEditMap[u.id]?.posisi ?? u.posisi ?? ""} onChange={e => setUsersEditMap(prev => ({ ...prev, [u.id]: { ...(prev[u.id] ?? { username: u.username, role: u.role, posisi: u.posisi }), posisi: e.target.value } }))} style={{ padding: '3px 6px', height: 22, width: '100%' }}>
                            <option value="">Pilih Posisi</option>
                            {posisiOptions.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        ) : (
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.posisi ?? '-'}</div>
                        )}
                        {usersEditId === u.id ? (
                          <input placeholder="Password baru (opsional)" type="password" value={usersEditMap[u.id]?.password ?? ''} onChange={e => setUsersEditMap(prev => ({ ...prev, [u.id]: { ...(prev[u.id] ?? { username: u.username, role: u.role, posisi: u.posisi }), password: e.target.value } }))} style={{ padding: '3px 6px', height: 22, width: '100%' }} />
                        ) : (
                          <div style={{ whiteSpace: 'nowrap' }}>{u.created_at ? new Date(u.created_at).toLocaleString('id-ID') : ''}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          {usersEditId === u.id ? (
                            <>
                              <button className="btn" title="Simpan" disabled={loading || !canWrite} onClick={() => {
                                const base = usersEditMap[u.id] ?? { username: u.username, role: u.role, posisi: u.posisi, password: '' };
                                const payload: any = { username: base.username, role: base.role, posisi: base.posisi || null };
                                if (base.password && base.password.length > 0) payload.password = base.password;
                                setLoading(true);
                                fetch(`${API_BASE}/api/users/${u.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                                  .then(r => r.ok ? r.json() : Promise.reject())
                                  .then(() => fetch(`${API_BASE}/api/users`, { credentials: 'include' }).then(r => r.json()).then(rows => { setUsersList(rows); setUsersEditId(null); notify('User disimpan'); }))
                                  .catch(() => notify('Gagal simpan user', 'error'))
                                  .finally(() => setLoading(false));
                              }} style={{ padding: '2px 4px', fontSize: 12 }}>💾</button>
                              <button className="btn" title="Batal" onClick={() => setUsersEditId(null)} style={{ padding: '2px 4px', fontSize: 12 }}>✖️</button>
                            </>
                          ) : (
                            <>
                              {canWrite && (
                                <button
                                  className="btn"
                                  title="Edit"
                                  disabled={(user?.role === 'admin' && u.role !== 'user') || !canWrite}
                                  onClick={() => {
                                    if (user?.role === 'admin' && u.role === 'superadmin') return;
                                    setUsersEditId(u.id);
                                    setUsersEditMap(prev => ({ ...prev, [u.id]: { username: u.username, role: u.role } }));
                                  }}
                                  style={{ padding: '2px 4px', fontSize: 12 }}
                                >✏️</button>
                              )}
                              {canWrite && (
                                <button
                                  className="btn"
                                  title="Hapus"
                                  disabled={(user?.role === 'admin' && u.role !== 'user') || !canWrite}
                                  onClick={() => {
                                    if (user?.role === 'admin' && u.role === 'superadmin') return;
                                    if (!confirm('Hapus user ini?')) return;
                                    setLoading(true);
                                    fetch(`${API_BASE}/api/users/${u.id}`, { method: 'DELETE', credentials: 'include' })
                                      .then(r => r.ok ? r.json() : Promise.reject())
                                      .then(() => fetch(`${API_BASE}/api/users`, { credentials: 'include' }).then(r => r.json()).then(rows => { setUsersList(rows); notify('User dihapus'); }))
                                      .catch(() => notify('Gagal hapus user', 'error'))
                                      .finally(() => setLoading(false));
                                  }}
                                  style={{ padding: '2px 4px', fontSize: 12 }}
                                >🗑️</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '6px 10px' }}>
                      <div>Halaman {page} dari {totalPages}</div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button className="btn" disabled={page <= 1} onClick={() => setUsersPage(page - 1)} style={{ padding: '2px 6px', fontSize: 10 }}>Prev</button>
                        <button className="btn" disabled={page >= totalPages} onClick={() => setUsersPage(page + 1)} style={{ padding: '2px 6px', fontSize: 10 }}>Next</button>
                      </div>
                      <div />
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {loading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.4)', zIndex: 90, pointerEvents: 'none' }} />
      )}
      {current && (
        <PartList
          key={current.iid}
          parts={current.parts ?? []}
          selectedIds={selectedPartIds}
          checkedIds={checkedIds}
          qtyById={qtyById}
          idColWidthCh={idColWidthCh}
          codeColWidthCh={codeColWidthCh}
          onToggle={(id, checked) => {
            setCheckedIds(prev => {
              const next = checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id);
              setCheckedCache(pc => ({ ...pc, [current.iid]: next }));
              return next;
            });
            if (!checked) {
              setQtyById(prev => {
                const nextQty = { ...prev, [id]: 1 };
                setQtyCache(qc => ({ ...qc, [current.iid]: nextQty }));
                return nextQty;
              });
            } else {
              setQtyById(prev => {
                const nextQty = { ...prev, [id]: Math.max(1, Math.floor(prev[id] ?? 1)) };
                setQtyCache(qc => ({ ...qc, [current.iid]: nextQty }));
                return nextQty;
              });
            }
          }}
          onToggleAll={(checked) => {
            const next = checked ? (current.parts ?? []).map(p => p.id) : [];
            setCheckedIds(next);
            setCheckedCache(pc => ({ ...pc, [current.iid]: next }));
            if (!checked) {
              setQtyById(prev => {
                const reset = { ...prev };
                for (const p of (current.parts ?? [])) reset[p.id] = 1;
                setQtyCache(qc => ({ ...qc, [current.iid]: reset }));
                return reset;
              });
            } else {
              setQtyById(prev => {
                const nextQty = { ...prev };
                for (const p of (current.parts ?? [])) nextQty[p.id] = Math.max(1, Math.floor(prev[p.id] ?? 1));
                setQtyCache(qc => ({ ...qc, [current.iid]: nextQty }));
                return nextQty;
              });
            }
          }}
          onChangeQty={(id, qty) => {
            setQtyById(prev => {
              const next = { ...prev, [id]: qty };
              setQtyCache(qc => ({ ...qc, [current.iid]: next }));
              return next;
            });
          }}
        />
      )}
    </div>
  );
}
