import { useState, useReducer, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 KONFIGURASI — ganti URL ini setelah deploy AppScript sebagai Web App
// ─────────────────────────────────────────────────────────────────────────────
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbyBRxW7uUQerFce08kZBLzM55nNgApacQOpIkc-P-vuWNcts8rtfSenlka4csMhpB240w/exec";

// ─── API LAYER ────────────────────────────────────────────────────────────────
const api = {
  fetchAll: () =>
    fetch(`${APPSCRIPT_URL}?action=getAll`)
      .then(r => r.json()),

  submitPembayaran: (payload) =>
    fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "submitPembayaran", ...payload }),
    }).then(r => r.json()),

  approvePembayaran: (payload) =>
    fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "approvePembayaran", ...payload }),
    }).then(r => r.json()),

  rejectPembayaran: (payload) =>
    fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "rejectPembayaran", ...payload }),
    }).then(r => r.json()),

  assignMutasi: (payload) =>
    fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "assignMutasi", ...payload }),
    }).then(r => r.json()),

  uploadMutasi: (rows) =>
    fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "uploadMutasi", rows }),
    }).then(r => r.json()),
};

// ─── REDUCER ──────────────────────────────────────────────────────────────────
const initialState = {
  loading: true,
  saving: false,
  error: null,
  warga: [],
  tagihan: [],
  pembayaran: [],
  mutasi: [],
  currentWarga: null,
  notification: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_LOADING":   return { ...state, loading: action.payload };
    case "SET_SAVING":    return { ...state, saving: action.payload };
    case "SET_ERROR":     return { ...state, error: action.payload, loading: false, saving: false };

    case "HYDRATE":
      return {
        ...state,
        loading: false,
        error: null,
        warga:        action.payload.warga      || [],
        tagihan:      action.payload.tagihan    || [],
        pembayaran:   action.payload.pembayaran || [],
        mutasi:       action.payload.mutasi     || [],
        currentWarga: action.payload.warga?.[0] || null,
      };

    case "SET_WARGA":
      return { ...state, currentWarga: action.payload };

    case "ADD_PEMBAYARAN":
      return {
        ...state,
        saving: false,
        pembayaran: [...state.pembayaran, action.payload],
        notification: { type: "success", msg: "Konfirmasi pembayaran terkirim! Status: PENDING" },
      };

    case "UPDATE_PEMBAYARAN": {
      const updated = state.pembayaran.map(p =>
        p.id === action.payload.id ? { ...p, ...action.payload.changes } : p
      );
      const updMutasi = action.payload.mutasiId
        ? state.mutasi.map(m => m.id === action.payload.mutasiId ? { ...m, matched: true } : m)
        : state.mutasi;
      return {
        ...state,
        saving: false,
        pembayaran: updated,
        mutasi: updMutasi,
        notification: { type: action.payload.notifType || "success", msg: action.payload.msg },
      };
    }

    case "ADD_MUTASI":
      return {
        ...state,
        saving: false,
        mutasi: [...state.mutasi, ...action.payload],
        notification: { type: "success", msg: `${action.payload.length} baris mutasi berhasil diupload!` },
      };

    case "CLEAR_NOTIF":
      return { ...state, notification: null };

    default:
      return state;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt     = n => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
const fmtDate = d => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    PENDING:  { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400",   label: "Menunggu"  },
    MATCHED:  { bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500",    label: "Cocok"     },
    APPROVED: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", label: "Disetujui" },
    REJECTED: { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500",     label: "Ditolak"   },
  };
  const s = map[status] || map.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── DASHBOARD CARD ───────────────────────────────────────────────────────────
function DashboardCard({ icon, label, value, sub, color }) {
  const colors = {
    teal:   { border: "border-teal-500",   icon: "bg-teal-50 text-teal-600",     val: "text-teal-700"   },
    blue:   { border: "border-blue-500",   icon: "bg-blue-50 text-blue-600",     val: "text-blue-700"   },
    amber:  { border: "border-amber-500",  icon: "bg-amber-50 text-amber-600",   val: "text-amber-700"  },
    rose:   { border: "border-rose-500",   icon: "bg-rose-50 text-rose-600",     val: "text-rose-700"   },
    purple: { border: "border-purple-500", icon: "bg-purple-50 text-purple-600", val: "text-purple-700" },
  };
  const c = colors[color] || colors.teal;
  return (
    <div className={`bg-white rounded-2xl border-l-4 ${c.border} shadow-sm p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${c.icon} flex-shrink-0`}>{icon}</div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-bold ${c.val} leading-tight`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── PAYMENT TABLE ────────────────────────────────────────────────────────────
function PaymentTable({ rows, columns }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map(c => (
              <th key={c.key} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={columns.length} className="text-center py-10 text-slate-400 italic">Tidak ada data</td></tr>
            : rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                {columns.map(c => (
                  <td key={c.key} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {c.render ? c.render(row[c.key], row) : (row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ─── UPLOAD FORM ──────────────────────────────────────────────────────────────
function UploadForm({ onUpload, saving }) {
  const [drag, setDrag]         = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef();

  const parseCSV = (text) =>
    text.trim().split("\n").slice(1)
      .map(l => {
        const [tanggal, keterangan, nominal, pengirim] = l.split(",").map(s => s.trim().replace(/"/g, ""));
        return { tanggal: tanggal || "", keterangan: keterangan || "", nominal: parseInt(nominal) || 0, pengirim: pengirim || "" };
      })
      .filter(r => r.nominal > 0 && r.tanggal);

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => onUpload(parseCSV(e.target.result));
    reader.readAsText(file);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
        ${drag ? "border-teal-400 bg-teal-50" : "border-slate-300 bg-slate-50 hover:border-teal-300"}
        ${saving ? "opacity-60 pointer-events-none" : ""}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
      onClick={() => fileRef.current.click()}
    >
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
      <div className="text-4xl mb-3">{saving ? "⏳" : fileName ? "✅" : "📂"}</div>
      {saving
        ? <p className="text-teal-600 font-semibold">Mengupload ke Google Sheets…</p>
        : fileName
          ? <p className="text-teal-700 font-semibold">{fileName} berhasil dipilih</p>
          : <>
              <p className="text-slate-600 font-semibold">Drag & drop file CSV mutasi bank</p>
              <p className="text-slate-400 text-sm mt-1">atau klik untuk browse</p>
            </>
      }
      <div className="mt-4 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-3 py-2 inline-block font-mono">
        tanggal, keterangan, nominal, pengirim
      </div>
    </div>
  );
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────
function Notification({ notif, onClose }) {
  if (!notif) return null;
  return (
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium flex items-center gap-3 ${notif.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}>
      <span>{notif.type === "success" ? "✓" : "✕"}</span>
      {notif.msg}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-4">
      <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center text-2xl animate-pulse">🏘</div>
      <p className="text-slate-600 font-semibold">Memuat data dari Google Sheets…</p>
      <p className="text-slate-400 text-sm">Mohon tunggu sebentar</p>
    </div>
  );
}

// ─── ERROR SCREEN ─────────────────────────────────────────────────────────────
function ErrorScreen({ error, onRetry }) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl">⚠️</div>
      <p className="text-slate-700 font-bold text-lg">Gagal terhubung ke server</p>
      <p className="text-slate-500 text-sm max-w-sm">{error}</p>
      <p className="text-xs text-slate-400 bg-white border rounded-lg px-3 py-2 font-mono break-all max-w-sm">{APPSCRIPT_URL}</p>
      <button onClick={onRetry} className="mt-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors">
        🔄 Coba Lagi
      </button>
    </div>
  );
}

// ─── QRIS PAGE ────────────────────────────────────────────────────────────────
function QRISPage() {
  return (
    <div className="max-w-sm mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
        <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl p-1 mb-4 inline-block">
          <div className="bg-white rounded-lg p-4">
            <svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
              <rect width="180" height="180" fill="white"/>
              <rect x="10" y="10" width="50" height="50" fill="none" stroke="#0d9488" strokeWidth="4"/>
              <rect x="18" y="18" width="34" height="34" fill="#0d9488"/>
              <rect x="120" y="10" width="50" height="50" fill="none" stroke="#0d9488" strokeWidth="4"/>
              <rect x="128" y="18" width="34" height="34" fill="#0d9488"/>
              <rect x="10" y="120" width="50" height="50" fill="none" stroke="#0d9488" strokeWidth="4"/>
              <rect x="18" y="128" width="34" height="34" fill="#0d9488"/>
              {[70,78,86,94,102,110].map(x => [70,78,86,94,102,110].map(y =>
                Math.sin(x * y) > 0 ? <rect key={`${x}${y}`} x={x} y={y} width="6" height="6" fill="#0d9488"/> : null
              ))}
            </svg>
          </div>
        </div>
        <p className="font-bold text-slate-800 text-lg">Perumahan Griya Asri</p>
        <p className="text-slate-500 text-sm">Rekening IPL Warga</p>
        <div className="mt-4 bg-teal-50 rounded-xl p-3">
          <p className="text-xs text-teal-600 font-medium">Nominal Transfer</p>
          <p className="text-2xl font-bold text-teal-700">Rp 250.000</p>
          <p className="text-xs text-slate-400 mt-1">IPL Bulanan per unit</p>
        </div>
        <div className="mt-4 text-left space-y-2 text-sm">
          {[["Bank","BCA / Mandiri / BNI"],["No. Rekening","123-456-7890"],["Atas Nama","Yayasan Griya Asri"]].map(([k,v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-slate-500">{k}</span>
              <span className="font-semibold text-slate-700">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mt-4">
          ⚠️ Cantumkan nama & blok rumah pada keterangan transfer
        </p>
      </div>
    </div>
  );
}

// ─── USER: DASHBOARD ──────────────────────────────────────────────────────────
function UserDashboard({ state }) {
  const { currentWarga, pembayaran, tagihan } = state;
  if (!currentWarga) return null;

  const myPembayaran = pembayaran.filter(p => p.wargaId === currentWarga.id);
  const myTagihan    = tagihan.filter(t => t.wargaId === currentWarga.id);
  const lunasIds     = myPembayaran.filter(p => p.status === "APPROVED").map(p => p.tagihanId);
  const belumLunas   = myTagihan.filter(t => !lunasIds.includes(t.id));
  const totalTagihan = belumLunas.reduce((s, t) => s + t.nominal, 0);
  const totalBayar   = myPembayaran.filter(p => p.status === "APPROVED").reduce((s, p) => s + p.nominal, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Selamat datang, {currentWarga.nama} 👋</h2>
        <p className="text-slate-500 text-sm">Blok {currentWarga.blok} — {currentWarga.telepon}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DashboardCard icon="🏠" label="Tagihan Belum Lunas" value={`${belumLunas.length} bulan`} sub={fmt(totalTagihan)} color="rose" />
        <DashboardCard icon="✅" label="Total Sudah Dibayar" value={fmt(totalBayar)} sub={`${myPembayaran.filter(p => p.status==="APPROVED").length} pembayaran`} color="teal" />
        <DashboardCard icon="⏳" label="Menunggu Konfirmasi" value={`${myPembayaran.filter(p => p.status==="PENDING").length} transaksi`} sub="Status pending" color="amber" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 mb-4">📋 Tagihan Aktif</h3>
        {belumLunas.length === 0
          ? <div className="text-center py-8 text-emerald-600"><div className="text-4xl mb-2">🎉</div><p className="font-semibold">Semua tagihan sudah lunas!</p></div>
          : <div className="space-y-3">
              {belumLunas.map(t => {
                const paid = myPembayaran.find(p => p.tagihanId === t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <p className="font-semibold text-slate-700">{t.bulan}</p>
                      <p className="text-xs text-slate-400">Jatuh tempo: {fmtDate(t.jatuhTempo)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-rose-600">{fmt(t.nominal)}</p>
                      {paid ? <StatusBadge status={paid.status} /> : <span className="text-xs text-slate-400">Belum dibayar</span>}
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );
}

// ─── USER: KONFIRMASI ─────────────────────────────────────────────────────────
function UserKonfirmasi({ state, dispatch }) {
  const { currentWarga, tagihan, saving } = state;
  const myTagihan = tagihan.filter(t => t.wargaId === currentWarga?.id);
  const [form, setForm] = useState({ tagihanId: "", nominal: 250000, bukti: "" });

  const handleSubmit = async () => {
    if (!form.bukti) { alert("Mohon upload bukti pembayaran"); return; }
    dispatch({ type: "SET_SAVING", payload: true });
    try {
      const res = await api.submitPembayaran({
        wargaId:   currentWarga.id,
        tagihanId: form.tagihanId || null,
        nominal:   form.nominal,
        bukti:     form.bukti,
        tanggal:   new Date().toISOString().split("T")[0],
      });
      // res.data = record pembayaran baru dari AppScript (sudah ada ID dari Sheet)
      dispatch({ type: "ADD_PEMBAYARAN", payload: res.data });
      setForm({ tagihanId: "", nominal: 250000, bukti: "" });
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Gagal mengirim konfirmasi. Coba lagi." });
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <h2 className="text-xl font-bold text-slate-800">📤 Konfirmasi Pembayaran</h2>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Tagihan</label>
          <select className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            value={form.tagihanId} onChange={e => setForm(f => ({ ...f, tagihanId: e.target.value }))}>
            <option value="">— Pilih tagihan (opsional) —</option>
            {myTagihan.map(t => <option key={t.id} value={t.id}>{t.bulan} — {fmt(t.nominal)}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Nominal Transfer (Rp)</label>
          <input type="number" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            value={form.nominal} onChange={e => setForm(f => ({ ...f, nominal: parseInt(e.target.value) || 0 }))} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Upload Bukti Transfer</label>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl py-6 cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors">
            <span className="text-3xl mb-2">{form.bukti ? "🖼️" : "📎"}</span>
            <span className="text-sm text-slate-500">{form.bukti || "Klik untuk pilih foto / screenshot"}</span>
            <input type="file" className="hidden" accept="image/*"
              onChange={e => setForm(f => ({ ...f, bukti: e.target.files[0]?.name || "" }))} />
          </label>
          <p className="text-xs text-slate-400 mt-1">* Nama file dikirim ke server. Upload ke Drive bisa ditambah via AppScript.</p>
        </div>

        <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700">
          ⚠️ Pastikan nama pengirim sesuai: <strong>{currentWarga?.nama}</strong>
        </div>

        <button onClick={handleSubmit} disabled={saving}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm">
          {saving ? "Mengirim ke server…" : "Kirim Konfirmasi"}
        </button>
      </div>
    </div>
  );
}

// ─── USER: RIWAYAT ────────────────────────────────────────────────────────────
function UserRiwayat({ state }) {
  const { currentWarga, pembayaran } = state;
  const myP = pembayaran
    .filter(p => p.wargaId === currentWarga?.id)
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  const cols = [
    { key: "tanggal", label: "Tanggal",  render: v => fmtDate(v) },
    { key: "nominal", label: "Nominal",  render: v => fmt(v) },
    { key: "bukti",   label: "Bukti" },
    { key: "status",  label: "Status",   render: v => <StatusBadge status={v} /> },
    { key: "catatan", label: "Catatan",  render: v => v ? <span className="text-red-500 text-xs">{v}</span> : "—" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">📜 Riwayat Pembayaran</h2>
      <PaymentTable rows={myP} columns={cols} />
    </div>
  );
}

// ─── ADMIN: DASHBOARD ─────────────────────────────────────────────────────────
function AdminDashboard({ state }) {
  const { pembayaran, warga } = state;
  const totalKas       = pembayaran.filter(p => p.status === "APPROVED").reduce((s, p) => s + p.nominal, 0);
  const totalPemasukan = pembayaran.filter(p => ["APPROVED","MATCHED"].includes(p.status)).reduce((s, p) => s + p.nominal, 0);
  const wargaBelumBayar = warga.filter(w => !pembayaran.some(p => p.wargaId === w.id && p.status === "APPROVED")).length;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">📊 Dashboard Admin</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard icon="🏦" label="Total Kas"         value={fmt(totalKas)}        sub="Sudah diapprove"             color="teal"  />
        <DashboardCard icon="💰" label="Total Pemasukan"   value={fmt(totalPemasukan)}  sub="Termasuk matched"            color="blue"  />
        <DashboardCard icon="🏠" label="Warga Belum Bayar" value={`${wargaBelumBayar} warga`} sub={`dari ${warga.length} total`} color="rose"  />
        <DashboardCard icon="⏳" label="Menunggu Review"   value={`${pembayaran.filter(p=>p.status==="PENDING").length} pembayaran`} sub="Status PENDING" color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-700 mb-3">📈 Distribusi Status</h3>
          {["APPROVED","MATCHED","PENDING","REJECTED"].map(s => {
            const count = pembayaran.filter(p => p.status === s).length;
            const pct   = pembayaran.length > 0 ? Math.round(count / pembayaran.length * 100) : 0;
            return (
              <div key={s} className="flex items-center gap-3 mb-3">
                <StatusBadge status={s} />
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-semibold text-slate-600 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-700 mb-3">👥 Status per Warga</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {warga.map(w => {
              const latest = pembayaran
                .filter(p => p.wargaId === w.id)
                .sort((a,b) => b.tanggal.localeCompare(a.tanggal))[0];
              return (
                <div key={w.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{w.nama}</p>
                    <p className="text-xs text-slate-400">Blok {w.blok}</p>
                  </div>
                  {latest ? <StatusBadge status={latest.status} /> : <span className="text-xs text-slate-400 italic">Belum bayar</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN: UPLOAD MUTASI ─────────────────────────────────────────────────────
function AdminUploadMutasi({ state, dispatch }) {
  const { mutasi, saving } = state;

  const handleUpload = async (rows) => {
    dispatch({ type: "SET_SAVING", payload: true });
    try {
      await api.uploadMutasi(rows);
      dispatch({
        type: "ADD_MUTASI",
        payload: rows.map((r, i) => ({ ...r, id: `M_NEW_${Date.now()}_${i}`, matched: false })),
      });
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Gagal upload mutasi ke server." });
    }
  };

  const cols = [
    { key: "id",         label: "ID" },
    { key: "tanggal",    label: "Tanggal",    render: v => fmtDate(v) },
    { key: "pengirim",   label: "Pengirim" },
    { key: "keterangan", label: "Keterangan" },
    { key: "nominal",    label: "Nominal",    render: v => fmt(v) },
    { key: "matched",    label: "Status",     render: v => v
      ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-semibold">Matched</span>
      : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">Belum</span>
    },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-800">📁 Upload Mutasi Bank</h2>
      <UploadForm onUpload={handleUpload} saving={saving} />
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 mb-4">Tabel Mutasi Bank ({mutasi.length} baris)</h3>
        <PaymentTable rows={mutasi} columns={cols} />
      </div>
    </div>
  );
}

// ─── ADMIN: MATCHING ──────────────────────────────────────────────────────────
function AdminMatching({ state, dispatch }) {
  const { pembayaran, mutasi, warga, saving } = state;
  const [rejectModal, setRejectModal] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [rejectNote,  setRejectNote]  = useState("");

  const getWarga  = id => warga.find(w => w.id === id);
  const unmatched = mutasi.filter(m => !m.matched);

  const handleApprove = async (row) => {
    dispatch({ type: "SET_SAVING", payload: true });
    try {
      await api.approvePembayaran({ pembayaranId: row.id, mutasiId: row.mutasiId });
      dispatch({ type: "UPDATE_PEMBAYARAN", payload: {
        id: row.id, mutasiId: row.mutasiId,
        changes: { status: "APPROVED" },
        notifType: "success", msg: "Pembayaran disetujui!",
      }});
    } catch {
      dispatch({ type: "SET_SAVING", payload: false });
    }
  };

  const handleReject = async () => {
    dispatch({ type: "SET_SAVING", payload: true });
    try {
      await api.rejectPembayaran({ pembayaranId: rejectModal, catatan: rejectNote });
      dispatch({ type: "UPDATE_PEMBAYARAN", payload: {
        id: rejectModal, mutasiId: null,
        changes: { status: "REJECTED", catatan: rejectNote },
        notifType: "error", msg: "Pembayaran ditolak.",
      }});
      setRejectModal(null);
    } catch {
      dispatch({ type: "SET_SAVING", payload: false });
    }
  };

  const handleAssign = async (mutasiId) => {
    dispatch({ type: "SET_SAVING", payload: true });
    try {
      await api.assignMutasi({ pembayaranId: assignModal.id, mutasiId });
      dispatch({ type: "UPDATE_PEMBAYARAN", payload: {
        id: assignModal.id, mutasiId,
        changes: { status: "MATCHED", mutasiId },
        notifType: "success", msg: "Mutasi berhasil di-assign!",
      }});
      setAssignModal(null);
    } catch {
      dispatch({ type: "SET_SAVING", payload: false });
    }
  };

  const cols = [
    { key: "wargaId",  label: "Warga",         render: v => { const w = getWarga(v); return w ? <div><p className="font-semibold">{w.nama}</p><p className="text-xs text-slate-400">Blok {w.blok}</p></div> : v; }},
    { key: "tanggal",  label: "Tgl Konfirmasi", render: v => fmtDate(v) },
    { key: "nominal",  label: "Nominal",        render: v => fmt(v) },
    { key: "bukti",    label: "Bukti",          render: v => <span className="text-xs text-blue-600 underline cursor-pointer">{v}</span> },
    { key: "mutasiId", label: "Mutasi",         render: v => v ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">{v}</span> : "—" },
    { key: "status",   label: "Status",         render: v => <StatusBadge status={v} /> },
    {
      key: "id", label: "Aksi",
      render: (v, row) => (
        <div className="flex gap-2">
          {row.status === "MATCHED" && (
            <button onClick={() => handleApprove(row)} disabled={saving}
              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs rounded-lg font-semibold">
              ✓ Approve
            </button>
          )}
          {row.status === "PENDING" && (
            <button onClick={() => setAssignModal(row)} disabled={saving}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded-lg font-semibold">
              🔗 Assign
            </button>
          )}
          {["PENDING","MATCHED"].includes(row.status) && (
            <button onClick={() => { setRejectModal(v); setRejectNote(""); }} disabled={saving}
              className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs rounded-lg font-semibold">
              ✕ Reject
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-800">🔗 Matching Pembayaran</h2>

      {unmatched.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="font-semibold text-amber-700 text-sm mb-2">⚠️ {unmatched.length} Mutasi Belum di-Match</p>
          <div className="space-y-2">
            {unmatched.map(m => (
              <div key={m.id} className="bg-white rounded-xl p-3 border border-amber-200 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-slate-700">{m.pengirim}</p>
                  <p className="text-xs text-slate-400">{fmtDate(m.tanggal)} · {m.keterangan}</p>
                </div>
                <p className="font-bold text-teal-600">{fmt(m.nominal)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 mb-4">Semua Konfirmasi Pembayaran</h3>
        <PaymentTable rows={pembayaran} columns={cols} />
      </div>

      {rejectModal && (
        <Modal title="Tolak Pembayaran" onClose={() => setRejectModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Berikan alasan penolakan:</p>
            <textarea className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              rows={3} value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              placeholder="Contoh: Nominal tidak sesuai, nama pengirim berbeda…" />
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 border border-slate-300 text-slate-600 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50">Batal</button>
              <button onClick={handleReject} disabled={saving}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-semibold">
                {saving ? "Memproses…" : "Tolak"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {assignModal && (
        <Modal title="Assign Mutasi ke Pembayaran" onClose={() => setAssignModal(null)}>
          <p className="text-sm text-slate-600 mb-3">
            Pilih mutasi untuk <strong>{getWarga(assignModal.wargaId)?.nama}</strong> ({fmt(assignModal.nominal)}):
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {unmatched.length === 0
              ? <p className="text-center text-slate-400 text-sm py-4">Tidak ada mutasi tersedia</p>
              : unmatched.map(m => (
                  <button key={m.id} onClick={() => handleAssign(m.id)} disabled={saving}
                    className="w-full text-left p-3 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50">
                    <p className="font-semibold text-slate-700 text-sm">{m.pengirim}</p>
                    <p className="text-xs text-slate-400">{fmtDate(m.tanggal)} · {m.keterangan}</p>
                    <p className="text-sm font-bold text-teal-600 mt-1">{fmt(m.nominal)}</p>
                  </button>
                ))
            }
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const USER_MENU = [
  { id: "dashboard",  label: "Dashboard", icon: "🏠" },
  { id: "qris",       label: "Bayar QRIS",icon: "📱" },
  { id: "konfirmasi", label: "Konfirmasi",icon: "📤" },
  { id: "riwayat",    label: "Riwayat",   icon: "📜" },
];
const ADMIN_MENU = [
  { id: "admin-dashboard", label: "Dashboard",   icon: "📊" },
  { id: "admin-mutasi",    label: "Mutasi Bank",  icon: "📁" },
  { id: "admin-matching",  label: "Matching",     icon: "🔗" },
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [role, setRole]   = useState("user");
  const [page, setPage]   = useState("dashboard");

  // Auto-clear notifikasi
  useEffect(() => {
    if (!state.notification) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_NOTIF" }), 4000);
    return () => clearTimeout(t);
  }, [state.notification]);

  // Fetch data awal dari AppScript
  const loadData = useCallback(async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const data = await api.fetchAll();
      dispatch({ type: "HYDRATE", payload: data });
    } catch (e) {
      dispatch({
        type: "SET_ERROR",
        payload: e.message || "Koneksi ke AppScript gagal. Pastikan URL sudah benar dan Web App sudah di-publish.",
      });
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRoleSwitch = (r) => {
    setRole(r);
    setPage(r === "admin" ? "admin-dashboard" : "dashboard");
  };

  // Tampilkan loading / error sebelum render utama
  if (state.loading) return <LoadingScreen />;
  if (state.error)   return <ErrorScreen error={state.error} onRetry={loadData} />;

  const menu = role === "admin" ? ADMIN_MENU : USER_MENU;

  const renderPage = () => {
    if (role === "user") switch (page) {
      case "dashboard":  return <UserDashboard  state={state} dispatch={dispatch} />;
      case "qris":       return <QRISPage />;
      case "konfirmasi": return <UserKonfirmasi state={state} dispatch={dispatch} />;
      case "riwayat":    return <UserRiwayat    state={state} />;
      default:           return null;
    }
    switch (page) {
      case "admin-dashboard": return <AdminDashboard    state={state} />;
      case "admin-mutasi":    return <AdminUploadMutasi state={state} dispatch={dispatch} />;
      case "admin-matching":  return <AdminMatching     state={state} dispatch={dispatch} />;
      default:                return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <Notification notif={state.notification} onClose={() => dispatch({ type: "CLEAR_NOTIF" })} />

      {/* TOP BAR */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">🏘</div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">Griya Asri</p>
              <p className="text-xs text-slate-400 leading-tight">Sistem Iuran IPL</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {role === "user" && state.warga.length > 0 && (
              <select
                className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={state.currentWarga?.id || ""}
                onChange={e => dispatch({ type: "SET_WARGA", payload: state.warga.find(w => w.id === e.target.value) })}>
                {state.warga.map(w => <option key={w.id} value={w.id}>{w.nama} (Blok {w.blok})</option>)}
              </select>
            )}
            <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-semibold">
              {[["user","👤 Warga"],["admin","🔑 Admin"]].map(([r, label]) => (
                <button key={r} onClick={() => handleRoleSwitch(r)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${role === r ? "bg-white shadow text-teal-700" : "text-slate-500 hover:text-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
        {/* SIDEBAR desktop */}
        <aside className="w-52 flex-shrink-0 hidden sm:block">
          <nav className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 sticky top-20">
            {menu.map(m => (
              <button key={m.id} onClick={() => setPage(m.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 ${page === m.id ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
                <span>{m.icon}</span>{m.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* BOTTOM NAV mobile */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 z-30 flex justify-around">
          {menu.map(m => (
            <button key={m.id} onClick={() => setPage(m.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-xs transition-all ${page === m.id ? "text-teal-600 font-bold" : "text-slate-400"}`}>
              <span className="text-xl">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <main className="flex-1 min-w-0 pb-20 sm:pb-0">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}