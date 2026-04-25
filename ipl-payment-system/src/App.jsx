import { useState, useReducer, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 KONFIGURASI
// ─────────────────────────────────────────────────────────────────────────────
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbydeHVLpF2CKzTdbiPO7eHnBfBiGOJECE1MaTp2NjpaVJdwb49v1mFSVv5SN4FV9MpD6g/exec";

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

  uploadBukti: (payload) =>
    fetch(APPSCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "uploadBukti", ...payload }),
    }).then(r => r.json()),

  autoMatch: () =>
    fetch(`${APPSCRIPT_URL}?action=autoMatch`)
      .then(r => r.json()),
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
  config: {},
  currentWarga: null,
  session: null,
  notification: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_LOADING":   return { ...state, loading: action.payload };
    case "SET_SAVING":    return { ...state, saving: action.payload };
    case "SET_ERROR":     return { ...state, error: action.payload, loading: false, saving: false };

    case "LOGIN":
      sessionStorage.setItem("ipl_session", JSON.stringify(action.payload));
      return { ...state, session: action.payload, currentWarga: action.payload };

    case "LOGOUT":
      sessionStorage.removeItem("ipl_session");
      return { ...state, session: null, currentWarga: null };

    case "HYDRATE":
      return {
        ...state,
        loading: false,
        error: null,
        warga:        action.payload.warga      || [],
        tagihan:      action.payload.tagihan    || [],
        pembayaran:   action.payload.pembayaran || [],
        mutasi:       action.payload.mutasi     || [],
        config:       action.payload.config     || {},
        currentWarga: state.session || action.payload.warga?.[0] || null,
      };

    case "SET_WARGA":
      return { ...state, currentWarga: action.payload };

    case "ADD_PEMBAYARAN":
      return {
        ...state,
        saving: false,
        pembayaran: [...state.pembayaran, action.payload],
        notification: { type: "success", msg: "✅ Konfirmasi pembayaran terkirim! Status: PENDING" },
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

// Normalize nomor rumah untuk automatch
const normalizeRumah = (str) => {
  if (!str) return "";
  return str.toUpperCase().replace(/[\s\-_.]/g, "").trim();
};

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
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────
function Notification({ notif, onClose }) {
  if (!notif) return null;
  const colors = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
  };
  return (
    <div className={`fixed top-4 right-4 ${colors[notif.type] || colors.success} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 z-40 animate-pulse`}>
      <span>{notif.msg}</span>
      <button onClick={onClose} className="font-bold">×</button>
    </div>
  );
}

// ─── LOADING & ERROR SCREENS ──────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600 font-semibold">Loading...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Terjadi Kesalahan</h1>
        <p className="text-slate-600 text-sm mb-6">{error}</p>
        <button onClick={onRetry} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-xl">
          Coba Lagi
        </button>
      </div>
    </div>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage({ state, dispatch }) {
  const [searchText, setSearchText] = useState("");
  const [pin, setPin]               = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [showPin, setShowPin]       = useState(false);

  const filteredWarga = state.warga.filter(w =>
    w.nama.toLowerCase().includes(searchText.toLowerCase()) ||
    (w.blok + (w.nomor || "")).toLowerCase().includes(searchText.toLowerCase())
  );

  const selectedWarga = filteredWarga.length === 1 ? filteredWarga[0] : null;
  const selectedId = selectedWarga?.id || "";

  const handleLogin = async () => {
    if (!selectedId) { setError("Cari dan pilih warga dulu"); return; }
    if (!pin)        { setError("Masukkan PIN"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `${APPSCRIPT_URL}?action=login&id_warga=${selectedId}&pin=${pin}`
      ).then(r => r.json());

      if (!res.ok) { setError(res.msg || "Login gagal"); }
      else         { dispatch({ type: "LOGIN", payload: res.data }); }
    } catch {
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-yellow-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-md">⭐</div>
          <h1 className="text-xl font-bold text-slate-800">Mandalika Residence</h1>
          <p className="text-slate-500 text-sm">Sistem Iuran IPL</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">Cari Warga</label>
            <input
              type="text"
              placeholder="Ketik nama atau blok nomor..."
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setError(""); }}
              autoFocus
            />
            {searchText && (
              <div className="mt-2 bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
                {filteredWarga.length === 0
                  ? <p>❌ Tidak ada yang cocok</p>
                  : filteredWarga.length === 1
                    ? <p>✅ {filteredWarga[0].nama} — Blok {filteredWarga[0].blok}{filteredWarga[0].nomor || ""}</p>
                    : <p>📋 {filteredWarga.length} hasil ditemukan</p>
                }
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">PIN</label>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                maxLength={6}
                placeholder="Masukkan PIN (6 digit)"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 pr-12 tracking-widest font-mono"
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
              <button
                type="button"
                onClick={() => setShowPin(s => !s)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg">
                {showPin ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm font-medium">⚠️ {error}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || state.loading || !selectedId}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-sm">
            {loading ? "🔄 Memverifikasi…" : "Masuk"}
          </button>

          <p className="text-center text-xs text-slate-400 mt-4">
            Lupa PIN? Hubungi pengurus RT
          </p>
        </div>
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
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
        Selamat datang, {currentWarga.nama} 👋
      </h1>
      <p className="text-slate-600 text-sm">
        Blok {currentWarga.blok}{currentWarga.nomor || ""} — {currentWarga.alamat || ""}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardCard icon="📋" label="Tagihan Belum Lunas" value={belumLunas.length} sub={fmt(totalTagihan)} color="rose" />
        <DashboardCard icon="✅" label="Total Sudah Dibayar" value={fmt(totalBayar)} color="emerald" />
        <DashboardCard icon="⏳" label="Menunggu Persetujuan" value={myPembayaran.filter(p => p.status === "PENDING").length} color="amber" />
      </div>

      {belumLunas.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-700 mb-4">Tagihan Aktif</h3>
          <div className="space-y-3">
            {belumLunas.map(t => (
              <div key={t.id} className="flex items-center justify-between p-4 bg-rose-50 rounded-xl border border-rose-200">
                <div>
                  <p className="font-semibold text-slate-700">{t.keterangan || "Iuran IPL"}</p>
                  <p className="text-xs text-slate-500">Jatuh tempo: {fmtDate(t.jatuhTempo)}</p>
                </div>
                <p className="font-bold text-rose-600">{fmt(t.nominal)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── USER: QRIS PAGE ──────────────────────────────────────────────────────────
function QRISPage({ state }) {
  const config = state.config;
  const nominalIpl = config.nominal_ipl || 40000;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Cara Bayar IPL</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-3xl">🏦</div>
          <div>
            <h2 className="font-bold text-slate-800">Informasi Rekening</h2>
            <p className="text-sm text-slate-500">{config.bank_name || "BCA"}</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <p className="text-xs text-slate-500 uppercase">Nomor Rekening</p>
          <p className="text-lg font-bold text-teal-600 font-mono">{config.bank_rekening || "1234567890"}</p>
          <p className="text-xs text-slate-500">Atas Nama: {config.bank_atas_nama || "Yayasan Griya Asri"}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase">Nominal Transfer</p>
          <p className="text-3xl font-bold text-emerald-600">{fmt(nominalIpl)}</p>
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg space-y-3">
          <p className="text-sm font-semibold text-yellow-800">📌 PERATURAN PEMBAYARAN IPL BULANAN</p>
          <ul className="text-xs text-yellow-700 space-y-2">
            <li>✓ Pembayaran dilakukan setiap bulan (batas: 25 Mei setiap bulan)</li>
            <li>✓ Wajib menggunakan media transfer bank</li>
            <li>✓ <strong>Cantumkan nomor rumah di catatan bank (A1**, tanpa spasi/karakter lain)</strong></li>
            <li>✓ Gagal terbaca? Hubungi operator:</li>
            <li className="ml-4">• Hari: 085795172272</li>
            <li className="ml-4">• Egi: 08133344003</li>
          </ul>

          <div className="bg-white rounded-lg p-3 mt-4">
            <p className="text-xs font-semibold text-yellow-800 mb-2">💰 RINCIAN NOMINAL {fmt(nominalIpl)}:</p>
            <ul className="text-xs text-yellow-700 space-y-1">
              <li>• Rp 15.000 — Biaya pengambilan sampah</li>
              <li>• Rp 15.000 — Biaya lokasi pembuangan sampah</li>
              <li>• Rp 10.000 — Kas warga</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── USER: KONFIRMASI PEMBAYARAN (FIXED) ──────────────────────────────────────
function UserKonfirmasi({ state, dispatch }) {
  const { currentWarga, pembayaran, tagihan } = state;
  if (!currentWarga) return null;

  const [modal, setModal] = useState(null);
  const [selectedTagihan, setSelectedTagihan] = useState("");
  const [buktiFile, setBuktiFile] = useState(null);
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef();

  const tagihanBelumLunas = tagihan.filter(t => t.wargaId === currentWarga.id && !pembayaran.find(p => p.tagihanId === t.id && p.status === "APPROVED"));

  const handleSubmit = async () => {
    if (!selectedTagihan) { 
      alert("Pilih tagihan dulu"); 
      return; 
    }
    
    setSaving(true);
    
    try {
      const tgh = tagihan.find(t => t.id === selectedTagihan);
      if (!tgh) {
        alert("Tagihan tidak ditemukan");
        setSaving(false);
        return;
      }

      let buktiUrl = null;

      if (buktiFile) {
        try {
          const reader = new FileReader();
          
          const uploadPromise = new Promise((resolve, reject) => {
            reader.onload = async (e) => {
              try {
                const fileDataUrl = e.target.result;
                const base64Data = fileDataUrl.split(",")[1];

                const buktiRes = await api.uploadBukti({
                  fileName: buktiFile.name,
                  fileData: base64Data,
                  wargaId: currentWarga.id,
                  tagihanId: selectedTagihan,
                });

                if (!buktiRes.ok) {
                  reject(new Error("Upload bukti gagal: " + buktiRes.msg));
                } else {
                  buktiUrl = buktiRes.buktiUrl;
                  resolve(buktiUrl);
                }
              } catch (err) {
                reject(err);
              }
            };
            
            reader.onerror = () => {
              reject(new Error("Gagal membaca file"));
            };
            
            reader.readAsDataURL(buktiFile);
          });

          await uploadPromise;
        } catch (err) {
          throw new Error("Upload bukti gagal: " + err.message);
        }
      }

      const submitRes = await api.submitPembayaran({
        id_warga: currentWarga.id,
        id_tagihan: selectedTagihan,
        nominal: tgh.nominal,
        catatan: catatan,
        bukti: buktiUrl || null,
        tanggal: new Date().toISOString().split("T")[0],
      });

      if (!submitRes.ok) {
        throw new Error("Submit pembayaran gagal: " + submitRes.msg);
      }

      dispatch({ 
        type: "ADD_PEMBAYARAN", 
        payload: submitRes.data 
      });

      setModal(null);
      setSelectedTagihan("");
      setBuktiFile(null);
      setCatatan("");

      alert("✅ Konfirmasi pembayaran berhasil dikirim!\nStatus: PENDING (menunggu persetujuan admin)");

    } catch (error) {
      console.error("Error:", error);
      alert("❌ " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const myPembayaran = pembayaran.filter(p => p.wargaId === currentWarga.id);
  const cols = [
    { key: "tanggal", label: "Tgl" },
    { key: "nominal", label: "Nominal", render: (r) => fmt(r.nominal) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { 
      key: "bukti", 
      label: "Bukti", 
      render: (r) => r.bukti ? (
        <a href={r.bukti} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 underline">
          📎 Lihat
        </a>
      ) : "—"
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Konfirmasi Pembayaran</h1>
        {tagihanBelumLunas.length > 0 && (
          <button onClick={() => setModal("submit")} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-xl">
            + Konfirmasi Pembayaran
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 mb-4">Riwayat Konfirmasi</h3>
        <PaymentTable rows={myPembayaran} columns={cols} />
      </div>

      {modal === "submit" && (
        <Modal title="Konfirmasi Pembayaran" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Pilih Tagihan</label>
              <select value={selectedTagihan} onChange={e => setSelectedTagihan(e.target.value)} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">— Pilih tagihan —</option>
                {tagihanBelumLunas.map(t => (
                  <option key={t.id} value={t.id}>{t.keterangan} — {fmt(t.nominal)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Catatan (Nomor Rumah)</label>
              <input type="text" placeholder="Contoh: B234" value={catatan} onChange={e => setCatatan(e.target.value)} className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              <p className="text-xs text-slate-500 mt-1">Masukkan nomor rumah Anda (sesuai di catatan transfer bank)</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Upload Bukti Transfer (Opsional)</label>
              <button 
                onClick={() => fileInputRef.current.click()}
                className="w-full border-2 border-dashed border-teal-300 rounded-xl p-4 text-center hover:bg-teal-50 transition-colors">
                <p className="text-sm text-teal-600 font-semibold">{buktiFile ? buktiFile.name : "📸 Click untuk upload bukti"}</p>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={e => setBuktiFile(e.target.files?.[0])} className="hidden" />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 border border-slate-300 text-slate-600 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50">Batal</button>
              <button onClick={handleSubmit} disabled={saving || !selectedTagihan} className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-semibold">
                {saving ? "⏳ Mengirim..." : "✅ Konfirmasi"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── USER: RIWAYAT ────────────────────────────────────────────────────────────
function UserRiwayat({ state }) {
  const { currentWarga, pembayaran } = state;
  if (!currentWarga) return null;

  const myPembayaran = pembayaran.filter(p => p.wargaId === currentWarga.id).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  const cols = [
    { key: "tanggal", label: "Tanggal", render: (r) => fmtDate(r.tanggal) },
    { key: "nominal", label: "Nominal", render: (r) => fmt(r.nominal) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "catatan", label: "Catatan" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Riwayat Pembayaran</h1>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <PaymentTable rows={myPembayaran} columns={cols} />
      </div>
    </div>
  );
}

// ─── USER: PENGATURAN (GANTI PIN) ────────────────────────────────────────────
function UserPengaturan({ state, dispatch }) {
  const { currentWarga } = state;
  if (!currentWarga) return null;

  const [pinLama, setPinLama] = useState("");
  const [pinBaru, setPinBaru] = useState("");
  const [pinBaru2, setPinBaru2] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const handleGantiPin = async () => {
    setError("");
    setSuccess(false);

    if (!pinLama) { setError("PIN lama wajib diisi"); return; }
    if (!pinBaru) { setError("PIN baru wajib diisi"); return; }
    if (pinBaru.length !== 6) { setError("PIN harus 6 digit"); return; }
    if (!pinBaru2) { setError("Konfirmasi PIN wajib diisi"); return; }
    if (pinBaru !== pinBaru2) { setError("PIN baru tidak cocok"); return; }
    if (pinLama === pinBaru) { setError("PIN baru harus berbeda dengan PIN lama"); return; }

    setLoading(true);
    try {
      const loginRes = await fetch(
        `${APPSCRIPT_URL}?action=login&id_warga=${currentWarga.id}&pin=${pinLama}`
      ).then(r => r.json());

      if (!loginRes.ok) {
        setError("PIN lama salah");
        setLoading(false);
        return;
      }

      const updateRes = await fetch(APPSCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "updatePin",
          id_warga: currentWarga.id,
          pin_baru: pinBaru,
        }),
      }).then(r => r.json());

      if (!updateRes.ok) {
        setError("Gagal update PIN: " + updateRes.msg);
      } else {
        setSuccess(true);
        setPinLama("");
        setPinBaru("");
        setPinBaru2("");
        setTimeout(() => setSuccess(false), 5000);
      }
    } catch (e) {
      setError("Terjadi kesalahan: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Pengaturan</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4">🔐 Ganti PIN</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">PIN Lama</label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  maxLength={6}
                  placeholder="Masukkan PIN lama"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 pr-10 tracking-widest"
                  value={pinLama}
                  onChange={e => { setPinLama(e.target.value); setError(""); }}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm">
                  {showPin ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">PIN Baru (6 digit)</label>
              <input
                type={showPin ? "text" : "password"}
                maxLength={6}
                placeholder="Masukkan PIN baru"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 tracking-widest"
                value={pinBaru}
                onChange={e => { setPinBaru(e.target.value); setError(""); }}
              />
              <p className="text-xs text-slate-400 mt-1">Gunakan 6 digit angka</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Konfirmasi PIN Baru</label>
              <input
                type={showPin ? "text" : "password"}
                maxLength={6}
                placeholder="Ketik ulang PIN baru"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 tracking-widest"
                value={pinBaru2}
                onChange={e => { setPinBaru2(e.target.value); setError(""); }}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-red-600 text-sm">⚠️ {error}</p>
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <p className="text-emerald-600 text-sm">✅ PIN berhasil diubah! Gunakan PIN baru untuk login selanjutnya.</p>
              </div>
            )}

            <button
              onClick={handleGantiPin}
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
              {loading ? "Memproses…" : "Ganti PIN"}
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-800">💡 Tips Keamanan:</p>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Jangan bagikan PIN ke siapapun</li>
            <li>• Gunakan PIN yang mudah diingat tapi sulit ditebak</li>
            <li>• Jangan gunakan tanggal lahir atau nomor rumah</li>
            <li>• Ganti PIN secara berkala untuk keamanan</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN: DASHBOARD ─────────────────────────────────────────────────────────
function AdminDashboard({ state }) {
  const { pembayaran, mutasi, tagihan } = state;
  const totalTagihan = tagihan.reduce((s, t) => s + t.nominal, 0);
  const totalBayarApproved = pembayaran.filter(p => p.status === "APPROVED").reduce((s, p) => s + p.nominal, 0);
  const totalPending = pembayaran.filter(p => p.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Dashboard Admin</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardCard icon="📋" label="Total Tagihan" value={fmt(totalTagihan)} color="rose" />
        <DashboardCard icon="✅" label="Pembayaran Disetujui" value={fmt(totalBayarApproved)} color="emerald" />
        <DashboardCard icon="⏳" label="Menunggu Review" value={totalPending} color="amber" />
        <DashboardCard icon="🏦" label="Mutasi Bank" value={mutasi.length} color="blue" />
        <DashboardCard icon="🔗" label="Matched" value={mutasi.filter(m => m.matched).length} color="teal" />
      </div>
    </div>
  );
}

// ─── ADMIN: UPLOAD MUTASI ─────────────────────────────────────────────────────
function UploadForm({ onUpload, saving }) {
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef();

  const parseCSV = (text) =>
    text.trim().split("\n").slice(1)
      .map(l => {
        const [tanggal, keterangan, nominal, pengirim] = l.split(",").map(s => s.trim().replace(/"/g, ""));
        return { tanggal, keterangan, nominal: parseInt(nominal) || 0, pengirim };
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
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${drag ? "border-teal-400 bg-teal-50" : "border-slate-300 bg-slate-50 hover:border-teal-300"} ${saving ? "opacity-60 pointer-events-none" : ""}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
      onClick={() => fileRef.current.click()}
    >
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
      <div className="text-4xl mb-3">{saving ? "⏳" : fileName ? "✅" : "📂"}</div>
      {saving
        ? <p className="text-teal-600 font-semibold">Mengupload…</p>
        : fileName
          ? <p className="text-teal-700 font-semibold">{fileName} berhasil dipilih</p>
          : <>
              <p className="text-slate-600 font-semibold">Drag & drop file CSV mutasi bank</p>
              <p className="text-slate-400 text-sm mt-1">atau klik untuk browse</p>
            </>
      }
    </div>
  );
}

function AdminUploadMutasi({ state, dispatch }) {
  const { saving } = state;
  const handleUpload = async (rows) => {
    dispatch({ type: "SET_SAVING", payload: true });
    try {
      const res = await api.uploadMutasi(rows);
      if (res.ok) {
        dispatch({ type: "ADD_MUTASI", payload: res.data || rows });
        const matchRes = await api.autoMatch();
        if (matchRes.ok && matchRes.matched > 0) {
          dispatch({ type: "SET_NOTIFICATION", payload: { type: "success", msg: `${matchRes.matched} pembayaran otomatis ter-match!` } });
        }
      }
    } catch (e) {
      dispatch({ type: "SET_ERROR", payload: "Gagal upload mutasi: " + e.message });
    }
    dispatch({ type: "SET_SAVING", payload: false });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Upload Mutasi Bank</h1>
      <UploadForm onUpload={handleUpload} saving={saving} />
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-semibold mb-2">📋 Format CSV:</p>
        <p className="font-mono text-xs">tanggal,keterangan,nominal,pengirim</p>
        <p className="text-xs mt-1">Contoh: 2025-04-01,TRF IPL APR BUDI A2,40000,BUDI SANTOSO</p>
      </div>
    </div>
  );
}

// ─── ADMIN: MATCHING ──────────────────────────────────────────────────────────
function AdminMatching({ state, dispatch }) {
  const { pembayaran, mutasi, warga } = state;
  const [assignModal, setAssignModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const getWarga = (id) => warga.find(w => w.id === id);

  const unmatched = mutasi.filter(m => !m.matched);
  const pendingPembayaran = pembayaran.filter(p => p.status === "PENDING");

  const handleAssign = async (mutasiId) => {
    if (!assignModal) return;
    setSaving(true);
    try {
      const res = await api.assignMutasi({
        pembayaranId: assignModal.id,
        mutasiId,
      });
      if (res.ok) {
        dispatch({ type: "UPDATE_PEMBAYARAN", payload: { id: assignModal.id, changes: { id_mutasi: mutasiId, status: "MATCHED" }, mutasiId, msg: "Mutasi berhasil di-assign!", notifType: "success" } });
        setAssignModal(null);
      }
    } catch (e) {
      alert("Gagal assign: " + e.message);
    }
    setSaving(false);
  };

  const cols = [
    { key: "catatan", label: "Warga/Keterangan" },
    { key: "tanggal", label: "Tanggal", render: (r) => fmtDate(r.tanggal) },
    { key: "nominal", label: "Nominal", render: (r) => fmt(r.nominal) },
    { 
      key: "action", 
      label: "Action", 
      render: (r) => (
        <button onClick={() => setAssignModal(r)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg">
          Assign
        </button>
      )
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Matching Pembayaran</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 mb-4">Pembayaran Pending (Belum Match)</h3>
        <PaymentTable rows={pendingPembayaran} columns={cols} />
      </div>

      {assignModal && (
        <Modal title="Assign Mutasi ke Pembayaran" onClose={() => setAssignModal(null)}>
          <p className="text-sm text-slate-600 mb-3">
            Pilih mutasi untuk <strong>{getWarga(assignModal.wargaId)?.nama || "—"}</strong> ({fmt(assignModal.nominal)}):
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {unmatched.length === 0
              ? <p className="text-center text-slate-400 text-sm py-4">Tidak ada mutasi tersedia</p>
              : unmatched.map(m => (
                  <button key={m.id} onClick={() => handleAssign(m.id)} disabled={saving} className="w-full text-left p-3 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50">
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

// ─── ADMIN: KONFIRMASI PEMBAYARAN ─────────────────────────────────────────────
function AdminKonfirmasi({ state, dispatch }) {
  const { pembayaran, warga } = state;
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [saving, setSaving] = useState(false);

  const getWarga = (id) => warga.find(w => w.id === id);

  const handleApprove = async (id) => {
    setSaving(true);
    try {
      const res = await api.approvePembayaran({ pembayaranId: id });
      if (res.ok) {
        dispatch({ type: "UPDATE_PEMBAYARAN", payload: { id, changes: { status: "APPROVED" }, msg: "Pembayaran disetujui!", notifType: "success" } });
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setSaving(true);
    try {
      const res = await api.rejectPembayaran({ pembayaranId: rejectModal.id, note: rejectNote });
      if (res.ok) {
        dispatch({ type: "UPDATE_PEMBAYARAN", payload: { id: rejectModal.id, changes: { status: "REJECTED" }, msg: "Pembayaran ditolak", notifType: "warning" } });
        setRejectModal(null);
        setRejectNote("");
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  };

  const cols = [
    { key: "wargaNama", label: "Warga", render: (r) => getWarga(r.wargaId)?.nama || "—" },
    { key: "nominal", label: "Nominal", render: (r) => fmt(r.nominal) },
    { key: "tanggal", label: "Tgl", render: (r) => fmtDate(r.tanggal) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { 
      key: "bukti", 
      label: "Bukti", 
      render: (r) => r.bukti ? (
        <a href={r.bukti} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 underline text-xs">
          📎 Lihat
        </a>
      ) : "—"
    },
    {
      key: "action",
      label: "Action",
      render: (r) => r.status === "PENDING" ? (
        <div className="flex gap-2">
          <button onClick={() => handleApprove(r.id)} disabled={saving} className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2 py-1 rounded-lg">
            ✓
          </button>
          <button onClick={() => setRejectModal(r)} disabled={saving} className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2 py-1 rounded-lg">
            ✕
          </button>
        </div>
      ) : "—"
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Konfirmasi Pembayaran</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 mb-4">Semua Pembayaran</h3>
        <div className="overflow-x-auto">
          <PaymentTable rows={pembayaran} columns={cols} />
        </div>
      </div>

      {rejectModal && (
        <Modal title="Tolak Pembayaran" onClose={() => setRejectModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Berikan alasan penolakan:</p>
            <textarea className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" rows={3} value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Contoh: Nominal tidak sesuai, nama pengirim berbeda…" />
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 border border-slate-300 text-slate-600 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50">Batal</button>
              <button onClick={handleReject} disabled={saving} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-semibold">
                {saving ? "Memproses…" : "Tolak"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ADMIN: LAPORAN PEMBAYARAN ────────────────────────────────────────────────
function AdminLaporan({ state }) {
  const { pembayaran, warga, mutasi } = state;

  // Filter state
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterBulan, setFilterBulan] = useState("");
  const [searchWarga, setSearchWarga] = useState("");
  const [sortBy, setSortBy] = useState("tanggal-desc");

  // Get warga detail
  const getWarga = (id) => warga.find(w => w.id === id);

  // Apply filters
  let filtered = pembayaran;

  if (filterStatus !== "ALL") {
    filtered = filtered.filter(p => p.status === filterStatus);
  }

  if (filterBulan) {
    filtered = filtered.filter(p => p.tanggal?.startsWith(filterBulan));
  }

  if (searchWarga) {
    const search = searchWarga.toLowerCase();
    filtered = filtered.filter(p => {
      const w = getWarga(p.wargaId);
      return w && (w.nama.toLowerCase().includes(search) || w.blok.toLowerCase().includes(search));
    });
  }

  // Sort
  if (sortBy === "tanggal-desc") {
    filtered = [...filtered].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  } else if (sortBy === "tanggal-asc") {
    filtered = [...filtered].sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
  } else if (sortBy === "nominal-desc") {
    filtered = [...filtered].sort((a, b) => b.nominal - a.nominal);
  } else if (sortBy === "nominal-asc") {
    filtered = [...filtered].sort((a, b) => a.nominal - b.nominal);
  }

  // Summary stats
  const stats = {
    total: pembayaran.length,
    pending: pembayaran.filter(p => p.status === "PENDING").length,
    matched: pembayaran.filter(p => p.status === "MATCHED").length,
    approved: pembayaran.filter(p => p.status === "APPROVED").length,
    rejected: pembayaran.filter(p => p.status === "REJECTED").length,
    totalNominal: pembayaran.reduce((s, p) => s + p.nominal, 0),
    approvedNominal: pembayaran.filter(p => p.status === "APPROVED").reduce((s, p) => s + p.nominal, 0),
    filteredCount: filtered.length,
    filteredNominal: filtered.reduce((s, p) => s + p.nominal, 0),
  };

  // Export CSV
  const handleExport = () => {
    const headers = ["ID Pembayaran", "Warga", "Blok", "Nominal", "Tanggal", "Status", "Mutasi ID", "Catatan"];
    const rows = filtered.map(p => {
      const w = getWarga(p.wargaId);
      return [
        p.id,
        w?.nama || "—",
        w?.blok || "—",
        p.nominal,
        p.tanggal,
        p.status,
        p.mutasiId || "—",
        p.catatan || "—",
      ];
    });

    const csv = [
      headers.join(","),
      ...rows.map(r => r.map(v => `"${v}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-pembayaran-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const cols = [
    { key: "id", label: "ID", width: "80px" },
    { key: "warga", label: "Warga", render: (r) => {
      const w = getWarga(r.wargaId);
      return w ? `${w.nama} (${w.blok})` : "—";
    }},
    { key: "nominal", label: "Nominal", render: (r) => fmt(r.nominal) },
    { key: "tanggal", label: "Tanggal", render: (r) => fmtDate(r.tanggal) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "bukti", label: "Bukti", render: (r) => r.bukti ? (
      <a href={r.bukti} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 underline text-xs">
        📎 Lihat
      </a>
    ) : "—" },
    { key: "catatan", label: "Catatan", render: (r) => <span className="text-xs">{r.catatan || "—"}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Laporan Pembayaran</h1>
        <button onClick={handleExport} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-2">
          📥 Export CSV
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <DashboardCard icon="📊" label="Total" value={stats.total} color="blue" />
        <DashboardCard icon="⏳" label="Pending" value={stats.pending} color="amber" />
        <DashboardCard icon="🔗" label="Matched" value={stats.matched} color="purple" />
        <DashboardCard icon="✅" label="Approved" value={stats.approved} color="emerald" />
        <DashboardCard icon="❌" label="Rejected" value={stats.rejected} color="rose" />
      </div>

      {/* NOMINAL SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Total Nominal (Semua)</p>
          <p className="text-2xl font-bold text-slate-800">{fmt(stats.totalNominal)}</p>
          <p className="text-xs text-slate-400 mt-2">{stats.total} pembayaran</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Total Approved</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt(stats.approvedNominal)}</p>
          <p className="text-xs text-slate-400 mt-2">{stats.approved} pembayaran</p>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <h3 className="font-bold text-slate-700">Filter & Cari</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Status</label>
            <select 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="ALL">Semua</option>
              <option value="PENDING">PENDING</option>
              <option value="MATCHED">MATCHED</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>

          {/* Month Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Bulan</label>
            <input 
              type="month" 
              value={filterBulan} 
              onChange={e => setFilterBulan(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
          </div>

          {/* Search Warga */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Cari Warga/Blok</label>
            <input 
              type="text" 
              placeholder="Nama atau blok..." 
              value={searchWarga} 
              onChange={e => setSearchWarga(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"/>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Urutkan</label>
            <select 
              value={sortBy} 
              onChange={e => setSortBy(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="tanggal-desc">Tanggal (Terbaru)</option>
              <option value="tanggal-asc">Tanggal (Terlama)</option>
              <option value="nominal-desc">Nominal (Terbesar)</option>
              <option value="nominal-asc">Nominal (Terkecil)</option>
            </select>
          </div>
        </div>

        {/* Reset Button */}
        <button 
          onClick={() => {
            setFilterStatus("ALL");
            setFilterBulan("");
            setSearchWarga("");
            setSortBy("tanggal-desc");
          }}
          className="text-sm text-slate-500 hover:text-slate-700 border border-slate-300 hover:border-slate-400 px-4 py-2 rounded-lg transition-colors">
          🔄 Reset Filter
        </button>
      </div>

      {/* FILTERED RESULT INFO */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-sm text-slate-600">
          <strong>{stats.filteredCount}</strong> pembayaran ditemukan 
          {filterStatus !== "ALL" && ` dengan status <strong>${filterStatus}</strong>`}
          {filterBulan && ` pada bulan <strong>${filterBulan}</strong>`}
          {searchWarga && ` untuk <strong>${searchWarga}</strong>`}
          <br />
          <strong>Total nominal:</strong> {fmt(stats.filteredNominal)}
        </p>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 mb-4">Detail Pembayaran</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {cols.map(c => (
                  <th key={c.key} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap" style={{ width: c.width }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={cols.length} className="text-center py-10 text-slate-400 italic">Tidak ada data</td></tr>
                : filtered.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    {cols.map(c => (
                      <td key={c.key} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {c.render ? c.render(row) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EXPORT NOTE */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-2">
        <p className="font-semibold">💡 Tips:</p>
        <ul className="text-xs space-y-1 ml-4">
          <li>✓ Filter & sort untuk lihat data spesifik</li>
          <li>✓ Export CSV untuk laporan ke finance/accounting</li>
          <li>✓ Klik link 📎 untuk verify bukti transfer di Google Drive</li>
          <li>✓ Reset filter untuk lihat semua data lagi</li>
        </ul>
      </div>
    </div>
  );
}

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const USER_MENU = [
  { id: "dashboard",  label: "Dashboard", icon: "🏠" },
  { id: "qris",       label: "Cara Bayar", icon: "🏦" },
  { id: "konfirmasi", label: "Konfirmasi", icon: "📤" },
  { id: "riwayat",    label: "Riwayat",   icon: "📜" },
  { id: "pengaturan", label: "Pengaturan", icon: "⚙️" },
];
const ADMIN_MENU = [
  { id: "admin-dashboard", label: "Dashboard",   icon: "📊" },
  { id: "admin-mutasi",    label: "Mutasi Bank", icon: "📁" },
  { id: "admin-laporan", label: "Laporan", icon: "📋" },
  { id: "admin-matching",  label: "Matching",    icon: "🔗" },
  { id: "admin-konfirmasi", label: "Konfirmasi", icon: "✅" },
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [role, setRole]   = useState("user");
  const [page, setPage]   = useState("dashboard");

  useEffect(() => {
    if (!state.notification) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_NOTIF" }), 4000);
    return () => clearTimeout(t);
  }, [state.notification]);

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

  useEffect(() => {
    const saved = sessionStorage.getItem("ipl_session");
    if (saved) dispatch({ type: "LOGIN", payload: JSON.parse(saved) });
  }, []);

  useEffect(() => {
    if (state.session?.isAdmin === true) {
      setRole("admin");
      setPage("admin-dashboard");
    }
  }, [state.session?.isAdmin]);

  const handleRoleSwitch = (r) => {
    setRole(r);
    setPage(r === "admin" ? "admin-dashboard" : "dashboard");
  };

  if (state.loading) return <LoadingScreen />;
  if (state.error)   return <ErrorScreen error={state.error} onRetry={loadData} />;

  if (!state.session && role === "user") return <LoginPage state={state} dispatch={dispatch} />;

  const menu = role === "admin" ? ADMIN_MENU : USER_MENU;

  const renderPage = () => {
    if (role === "user") switch (page) {
      case "dashboard":  return <UserDashboard  state={state} />;
      case "qris":       return <QRISPage state={state} />;
      case "konfirmasi": return <UserKonfirmasi state={state} dispatch={dispatch} />;
      case "riwayat":    return <UserRiwayat    state={state} />;
      case "pengaturan": return <UserPengaturan state={state} dispatch={dispatch} />;
      default:           return null;
    }
    switch (page) {
      case "admin-dashboard": return <AdminDashboard    state={state} />;
      case "admin-mutasi":    return <AdminUploadMutasi state={state} dispatch={dispatch} />;
      case "admin-laporan": return <AdminLaporan state={state} />;
      case "admin-matching":  return <AdminMatching     state={state} dispatch={dispatch} />;
      case "admin-konfirmasi": return <AdminKonfirmasi  state={state} dispatch={dispatch} />;
      default:                return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <Notification notif={state.notification} onClose={() => dispatch({ type: "CLEAR_NOTIF" })} />

      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-full px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0">🏘</div>
            <div className="hidden sm:block min-w-0">
              <p className="font-bold text-slate-800 text-sm leading-tight">{state.config.nama_perumahan || "MANDALIKA"}</p>
              <p className="text-xs text-slate-400 leading-tight">Sistem Iuran IPL</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {role === "user" && state.session && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-700">{state.session.nama}</p>
                  <p className="text-xs text-slate-400">Blok {state.session.blok}{state.session.nomor}</p>
                </div>
                <button
                  onClick={() => { dispatch({ type: "LOGOUT" }); setRole("user"); setPage("dashboard"); }}
                  className="text-xs border border-slate-300 text-slate-500 hover:text-red-500 hover:border-red-300 px-2 py-1.5 rounded-lg transition-colors">
                  Keluar
                </button>
              </div>
            )}
            
            {role === "admin" && (
              <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-semibold">
                {[["user","👤 Warga"],["admin","🔑 Admin"]].map(([r, label]) => (
                  <button key={r} onClick={() => handleRoleSwitch(r)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${role === r ? "bg-white shadow text-teal-700" : "text-slate-500 hover:text-slate-700"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-full px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-6 pb-24 sm:pb-6">
        <aside className="w-full sm:w-52 flex-shrink-0">
          <nav className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 sticky top-20">
            {menu.map(m => (
              <button key={m.id} onClick={() => setPage(m.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 ${page === m.id ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
                <span>{m.icon}</span>
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 z-30 flex justify-around">
          {menu.map(m => (
            <button key={m.id} onClick={() => setPage(m.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-xs transition-all ${page === m.id ? "text-teal-600 font-bold" : "text-slate-400"}`}>
              <span className="text-xl">{m.icon}</span>
              <span className="truncate max-w-[50px]">{m.label}</span>
            </button>
          ))}
          
          {role === "user" && state.session && (
            <button onClick={() => { dispatch({ type: "LOGOUT" }); setRole("user"); setPage("dashboard"); }}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-xs text-red-500 hover:bg-red-50">
              <span className="text-xl">🚪</span>
              <span className="truncate max-w-[50px]">Keluar</span>
            </button>
          )}
        </div>

        <main className="flex-1 min-w-0 pb-20 sm:pb-0">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}