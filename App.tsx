import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, updateDoc, onSnapshot, getDocs, deleteDoc } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'demo-pemilos';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase init error", e);
}

// --- CONSTANTS ---
const ADMIN_TOKEN = "ADMIN123";
const DEFAULT_CANDIDATES = [
  {
    id: 1, name: "Ahmad Fikri & Nisa Rahma", number: "01",
    vision: "Mewujudkan lingkungan sekolah yang inovatif, inklusif, dan berwawasan lingkungan.",
    missions: ["Mengadakan pekan inovasi digital tahunan.", "Mengoptimalkan program daur ulang sekolah.", "Membentuk forum diskusi siswa bulanan."],
    votes: 0, themeColor: "from-blue-500 to-blue-700", btnColor: "bg-blue-600 hover:bg-blue-700", img: "https://placehold.co/400x400/2563eb/ffffff?text=Paslon+01"
  },
  {
    id: 2, name: "Bima Arya & Citra Lestari", number: "02",
    vision: "Menciptakan siswa yang berprestasi dalam bidang akademik maupun non-akademik berlandaskan iman.",
    missions: ["Mengaktifkan kembali ekstrakurikuler yang vakum.", "Menyelenggarakan e-sport & sport competition antar kelas.", "Program mentoring tutor sebaya terpadu."],
    votes: 0, themeColor: "from-emerald-500 to-emerald-700", btnColor: "bg-emerald-600 hover:bg-emerald-700", img: "https://placehold.co/400x400/059669/ffffff?text=Paslon+02"
  }
];

const THEME_OPTIONS = [
  { label: 'Biru', value: 'from-blue-500 to-blue-700', btn: 'bg-blue-600 hover:bg-blue-700' },
  { label: 'Hijau', value: 'from-emerald-500 to-emerald-700', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  { label: 'Merah', value: 'from-red-500 to-red-700', btn: 'bg-red-600 hover:bg-red-700' },
  { label: 'Kuning', value: 'from-amber-400 to-amber-600', btn: 'bg-amber-500 hover:bg-amber-600' },
  { label: 'Ungu', value: 'from-purple-500 to-purple-700', btn: 'bg-purple-600 hover:bg-purple-700' },
  { label: 'Abu-abu', value: 'from-gray-500 to-gray-700', btn: 'bg-gray-800 hover:bg-gray-900' }
];

// --- MAIN COMPONENT ---
export default function PemilosApp() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [view, setView] = useState('login'); // login, voting, success, admin
  
  // Data State from Firestore
  const [candidates, setCandidates] = useState([]);
  const [tokensData, setTokensData] = useState([]); 
  
  // Voting State
  const [currentToken, setCurrentToken] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // --- FIREBASE AUTH & DATA SYNC ---
  useEffect(() => {
    const initDatabase = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined') {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
        setIsDbReady(true);
      } catch (err) {
        console.error("Gagal autentikasi database:", err);
        setErrorMsg("Gagal terhubung ke database. Silakan muat ulang halaman.");
      }
    };
    initDatabase();
  }, []);

  useEffect(() => {
    if (!isDbReady || !auth.currentUser) return;

    // Listener for Candidates
    const candRef = collection(db, 'artifacts', appId, 'public', 'data', 'candidates');
    const unsubCand = onSnapshot(candRef, (snapshot) => {
      const candList = [];
      snapshot.forEach(doc => candList.push({ id: doc.id, ...doc.data() }));
      // Sort by number
      candList.sort((a, b) => parseInt(a.number) - parseInt(b.number));
      setCandidates(candList);
    }, (error) => console.error("Error fetching candidates:", error));

    // Listener for Tokens
    const tokenRef = collection(db, 'artifacts', appId, 'public', 'data', 'tokens');
    const unsubToken = onSnapshot(tokenRef, (snapshot) => {
      const tokenList = [];
      snapshot.forEach(doc => tokenList.push({ id: doc.id, ...doc.data() }));
      setTokensData(tokenList);
    }, (error) => console.error("Error fetching tokens:", error));

    return () => {
      unsubCand();
      unsubToken();
    };
  }, [isDbReady]);

  // --- LOGIC HANDLERS ---

  const handleLogin = (e) => {
    e.preventDefault();
    const tokenInput = currentToken.trim().toUpperCase();
    setErrorMsg("");

    if (tokenInput === ADMIN_TOKEN) {
      setView('admin');
      return;
    }

    if (candidates.length === 0) {
      setErrorMsg("Sistem belum siap. Panitia belum mengunggah data kandidat.");
      return;
    }

    const foundToken = tokensData.find(t => t.token === tokenInput);

    if (!foundToken) {
      setErrorMsg("Token tidak valid atau tidak terdaftar. Hubungi Panitia KPPS.");
      return;
    }

    if (foundToken.isUsed) {
      setErrorMsg("Token ini SUDAH DIGUNAKAN untuk memilih.");
      return;
    }

    setView('voting');
  };

  const handleConfirmVote = async () => {
    if (!selectedCandidate) return;
    setIsLoading(true);

    try {
      // 1. Mark token as used
      const tokenRef = doc(db, 'artifacts', appId, 'public', 'data', 'tokens', currentToken.trim().toUpperCase());
      await updateDoc(tokenRef, { isUsed: true });

      // 2. Increment vote
      // Find current votes in our local state to increment (since we can't use complex queries/increments safely without admin sdk sometimes, this is safe for simple apps)
      const candRef = doc(db, 'artifacts', appId, 'public', 'data', 'candidates', selectedCandidate.id.toString());
      await updateDoc(candRef, { votes: selectedCandidate.votes + 1 });

      setShowConfirmModal(false);
      setView('success');
    } catch (err) {
      console.error("Gagal merekam suara:", err);
      setErrorMsg("Gagal merekam suara. Pastikan koneksi internet stabil.");
      setShowConfirmModal(false);
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    setCurrentToken("");
    setSelectedCandidate(null);
    setErrorMsg("");
    setView('login');
  };

  const getTotalVotes = () => candidates.reduce((sum, c) => sum + (c.votes || 0), 0);
  const getUsedTokensCount = () => tokensData.filter(t => t.isUsed).length;

  // --- VIEWS ---

  const renderLoginView = () => (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-indigo-600 p-6 text-center">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner overflow-hidden border-4 border-indigo-400">
            <img src="./logo-SMPN10LK.png" alt="Logo SMPN 10 Loa Kulu" className="w-full h-full object-contain p-2" />
          </div>
          <h2 className="text-2xl font-bold text-white">PEMILOS DIGITAL</h2>
          <p className="text-indigo-100 text-md mt-1 font-semibold tracking-wide">SMPN 10 LOA KULU</p>
        </div>
        
        <div className="p-8">
          {!isDbReady ? (
             <div className="text-center py-6">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Menghubungkan ke database...</p>
             </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Masukkan Token Anda
                </label>
                <input
                  type="text"
                  value={currentToken}
                  onChange={(e) => setCurrentToken(e.target.value)}
                  placeholder="Ketik token di sini..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors uppercase tracking-widest text-center text-lg font-bold"
                  required
                />
                {errorMsg && (
                  <p className="mt-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg flex items-start gap-2 border border-red-100">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    {errorMsg}
                  </p>
                )}
              </div>
              
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors duration-200 shadow-md flex items-center justify-center gap-2"
              >
                Masuk Bilik Suara
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  const renderVotingView = () => (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10 flex flex-col items-center">
          <img src="./logo-SMPN10LK.png" alt="Logo SMPN 10 Loa Kulu" className="w-20 h-20 mb-4 drop-shadow-md" />
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl tracking-tight">
            Surat Suara Digital
          </h1>
          <p className="mt-2 text-xl font-bold text-indigo-700 max-w-2xl mx-auto">
            SMPN 10 LOA KULU
          </p>
          <p className="mt-3 text-lg text-gray-600 max-w-2xl mx-auto">
            Gunakan hak pilihmu. Tekan tombol "Pilih" di bawah kandidat yang kamu yakini.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-center">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col transition-transform hover:-translate-y-1 hover:shadow-xl duration-300 border border-gray-100">
              <div className={`h-24 bg-gradient-to-r ${candidate.themeColor || 'from-gray-500 to-gray-700'} flex items-center justify-center relative`}>
                <span className="absolute -bottom-6 bg-white border-4 border-white text-gray-800 font-bold text-2xl w-14 h-14 rounded-full flex items-center justify-center shadow-md">
                  {candidate.number}
                </span>
              </div>
              <div className="p-6 pt-10 flex-grow flex flex-col">
                <h3 className="text-xl font-bold text-gray-900 text-center mb-1">{candidate.name}</h3>
                
                {candidate.img && (
                  <img src={candidate.img} alt={candidate.name} className="w-full h-48 object-cover rounded-lg my-4 shadow-sm" />
                )}
                
                <div className="flex-grow text-sm mt-2">
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 mb-1 border-b pb-1">Visi:</h4>
                    <p className="text-gray-700 italic">"{candidate.vision}"</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1 border-b pb-1">Misi:</h4>
                    <ul className="list-disc pl-4 text-gray-700 space-y-1">
                      {Array.isArray(candidate.missions) 
                        ? candidate.missions.map((mission, idx) => <li key={idx}>{mission}</li>)
                        : <li>{candidate.missions}</li>
                      }
                    </ul>
                  </div>
                </div>

                <button
                  onClick={() => { setSelectedCandidate(candidate); setShowConfirmModal(true); }}
                  className={`mt-8 w-full text-white font-bold py-3 px-4 rounded-xl shadow-md transition-colors ${candidate.btnColor || 'bg-gray-800 hover:bg-gray-900'}`}
                >
                  PILIH NOMOR {candidate.number}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900 bg-opacity-70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className={`p-6 bg-gradient-to-r ${selectedCandidate.themeColor || 'from-gray-700 to-gray-900'} text-white text-center`}>
              <h3 className="text-xl font-bold">Konfirmasi Suara</h3>
            </div>
            <div className="p-6 text-center">
              <p className="text-gray-600 mb-2">Anda akan memberikan suara untuk:</p>
              <div className="text-3xl font-black text-gray-900 mb-1">Paslon {selectedCandidate.number}</div>
              <div className="text-lg font-semibold text-gray-700 mb-6">{selectedCandidate.name}</div>
              
              <div className="bg-red-50 border-l-4 border-red-500 p-4 text-left mb-6">
                <p className="text-sm text-red-800">
                  <span className="font-bold">PERHATIAN:</span> Pilihan bersifat final dan tidak dapat dibatalkan. Token Anda akan dianggap hangus setelah ini.
                </p>
              </div>

              {errorMsg && <p className="text-red-600 mb-4 text-sm">{errorMsg}</p>}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  disabled={isLoading}
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  disabled={isLoading}
                  onClick={handleConfirmVote}
                  className="flex-1 px-4 py-3 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? 'Menyimpan...' : 'Ya, Coblos!'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderSuccessView = () => (
    <div className="flex items-center justify-center min-h-screen bg-indigo-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border-t-8 border-indigo-500">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Selesai!</h2>
        <p className="text-gray-600 mb-8 text-lg">Terima kasih telah berpartisipasi. Suara Anda berhasil direkam ke dalam database dengan aman.</p>
        <button
          onClick={handleLogout}
          className="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
        >
          Selesai & Kembali
        </button>
      </div>
    </div>
  );

  // --- ROUTER / VIEW SWITCHER ---
  return (
    <div className="font-sans text-gray-800 antialiased selection:bg-indigo-100 selection:text-indigo-900">
      {view === 'login' && renderLoginView()}
      {view === 'voting' && renderVotingView()}
      {view === 'success' && renderSuccessView()}
      {view === 'admin' && (
        <AdminPanel 
          candidates={candidates} 
          tokensData={tokensData} 
          onLogout={handleLogout} 
          getTotalVotes={getTotalVotes} 
          getUsedTokensCount={getUsedTokensCount} 
        />
      )}
    </div>
  );
}

// --- ADMIN COMPONENT ---
const AdminPanel = ({ candidates, tokensData, onLogout, getTotalVotes, getUsedTokensCount }) => {
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, candidates, tokens
  const [editingCandidates, setEditingCandidates] = useState([]);
  const [hasLoadedCandidates, setHasLoadedCandidates] = useState(false);
  const [tokenInput, setTokenInput] = useState("SISWA01, SISWA02, SISWA03\nSISWA04, SISWA05");
  const [adminMsg, setAdminMsg] = useState({ type: '', text: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync data from db to form state once
  useEffect(() => {
    if (!hasLoadedCandidates && candidates.length > 0) {
      setEditingCandidates(candidates.map(c => ({
        ...c,
        missionsText: Array.isArray(c.missions) ? c.missions.join('\n') : (c.missions || '')
      })));
      setHasLoadedCandidates(true);
    } else if (!hasLoadedCandidates && candidates.length === 0) {
       // load defaults if totally empty
       setEditingCandidates(DEFAULT_CANDIDATES.map(c => ({
        ...c,
        missionsText: Array.isArray(c.missions) ? c.missions.join('\n') : (c.missions || '')
      })));
    }
  }, [candidates, hasLoadedCandidates]);

  const showMsg = (type, text) => {
    setAdminMsg({ type, text });
    setTimeout(() => setAdminMsg({ type: '', text: '' }), 5000);
  };

  const handleCandidateChange = (index, field, value) => {
    const newCands = [...editingCandidates];
    newCands[index][field] = value;
    setEditingCandidates(newCands);
  };

  const handleAddCandidate = () => {
    const newId = Date.now();
    setEditingCandidates([...editingCandidates, {
        id: newId,
        number: "0" + (editingCandidates.length + 1),
        name: "",
        vision: "",
        missionsText: "",
        themeColor: THEME_OPTIONS[0].value,
        btnColor: THEME_OPTIONS[0].btn,
        img: "https://placehold.co/400x400/cccccc/ffffff?text=Foto+Paslon",
        votes: 0
    }]);
  };

  const handleRemoveCandidate = (index) => {
    const newCands = [...editingCandidates];
    newCands.splice(index, 1);
    setEditingCandidates(newCands);
  };

  const handleUploadCandidates = async () => {
    setIsProcessing(true);
    try {
      // 1. Delete removed candidates from DB
      const existingIds = candidates.map(c => c.id.toString());
      const newIds = editingCandidates.map(c => c.id.toString());
      const idsToDelete = existingIds.filter(id => !newIds.includes(id));
      
      for (const id of idsToDelete) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'candidates', id));
      }

      // 2. Save current candidates to DB
      for (const cand of editingCandidates) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'candidates', cand.id.toString());
        const missionsArray = (cand.missionsText || '').split('\n').filter(m => m.trim() !== '');
        
        await setDoc(docRef, {
          id: cand.id,
          number: cand.number,
          name: cand.name,
          vision: cand.vision,
          missions: missionsArray,
          themeColor: cand.themeColor,
          btnColor: cand.btnColor || 'bg-gray-800 hover:bg-gray-900',
          img: cand.img,
          votes: cand.votes !== undefined ? cand.votes : 0 // Preserve existing votes
        });
      }
      showMsg('success', 'Data kandidat berhasil disimpan ke database!');
    } catch (err) {
      showMsg('error', `Gagal menyimpan: ${err.message}`);
    }
    setIsProcessing(false);
  };

  const handleUploadTokens = async () => {
    setIsProcessing(true);
    try {
      // Parse comma or newline separated tokens
      const rawTokens = tokenInput.split(/[\n,]+/).map(t => t.trim().toUpperCase()).filter(t => t.length > 0);
      const uniqueTokens = [...new Set(rawTokens)];

      for (const t of uniqueTokens) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'tokens', t);
        await setDoc(docRef, { token: t, isUsed: false });
      }
      showMsg('success', `${uniqueTokens.length} token berhasil disimpan ke database!`);
    } catch (err) {
      showMsg('error', `Gagal menyimpan token: ${err.message}`);
    }
    setIsProcessing(false);
  };

  const handleGenerateTokens = () => {
     const newTokens = [];
     for(let i=0; i<50; i++) {
       const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
       newTokens.push(`VOTE-${randomStr}`);
     }
     setTokenInput(newTokens.join(",\n"));
     showMsg('success', '50 Token acak berhasil dibuat di kotak teks. Klik "Simpan Token ke Database" untuk menyimpan.');
  };

  const handleResetAllVotes = async () => {
     setIsProcessing(true);
     try {
       // Reset votes to 0
       for (const cand of candidates) {
         await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'candidates', cand.id.toString()), { votes: 0 });
       }
       // Reset tokens to unused
       for (const t of tokensData) {
         await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tokens', t.id), { isUsed: false });
       }
       showMsg('success', 'Semua perolehan suara dan status token telah di-reset menjadi 0 / Belum terpakai.');
     } catch (err) {
       showMsg('error', 'Gagal mereset data.');
     }
     setIsProcessing(false);
  };

  const handlePrintTokens = () => {
    if (tokensData.length === 0) {
      showMsg('error', 'Tidak ada data token di database untuk dicetak.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
       showMsg('error', 'Pop-up diblokir oleh browser. Izinkan pop-up (pop-up allowed) untuk mencetak.');
       return;
    }
    
    let html = `
      <html>
      <head>
        <title>Cetak Kartu Token Pemilos</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .token-grid { display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; }
          .token-card { 
             border: 2px dashed #666; 
             padding: 15px 10px; 
             width: 180px; 
             text-align: center;
             page-break-inside: avoid;
             border-radius: 8px;
          }
          .token-title { font-size: 11px; color: #555; margin-bottom: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;}
          .token-code { font-size: 22px; font-weight: 900; letter-spacing: 3px; color: #000; }
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print header">
           <button onclick="window.print()" style="padding: 12px 24px; font-size: 16px; cursor: pointer; background: #4f46e5; color: white; border: none; border-radius: 6px; font-weight: bold;">🖨️ Cetak Sekarang</button>
           <p style="font-size: 13px; color: #666; margin-top: 12px;">Pastikan pengaturan print Anda sudah rapi. Gunting sesuai garis putus-putus untuk dibagikan.</p>
        </div>
        <div class="token-grid">
    `;
    
    tokensData.forEach(t => {
       html += `
          <div class="token-card">
             <div class="token-title">Token Surat Suara</div>
             <div class="token-code">${t.token}</div>
          </div>
       `;
    });
    
    html += `
        </div>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleDownloadTokens = () => {
     if (tokensData.length === 0) {
       showMsg('error', 'Tidak ada data token untuk didownload.');
       return;
     }
     const header = "TOKEN,STATUS_PENGGUNAAN\n";
     const rows = tokensData.map(t => `${t.token},${t.isUsed ? 'TERPAKAI' : 'BELUM TERPAKAI'}`).join("\n");
     const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
     const link = document.createElement("a");
     const url = URL.createObjectURL(blob);
     link.setAttribute("href", url);
     link.setAttribute("download", "Data_Token_Pemilos.csv");
     link.style.visibility = 'hidden';
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-indigo-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <img src="./logo-SMPN10LK.png" alt="Logo" className="w-8 h-8 object-contain bg-white rounded-full p-0.5" />
            <h1 className="text-xl font-bold hidden sm:block">Panel Admin Pemilos</h1>
            <h1 className="text-xl font-bold sm:hidden">Admin</h1>
          </div>
          <button onClick={onLogout} className="text-sm bg-indigo-800 hover:bg-indigo-700 px-4 py-2 rounded-md font-medium transition">
            Keluar
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Tabs Nav */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
           <button onClick={() => setActiveTab('dashboard')} className={`py-3 px-6 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${activeTab === 'dashboard' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
              📊 Quick Count
           </button>
           <button onClick={() => setActiveTab('candidates')} className={`py-3 px-6 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${activeTab === 'candidates' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
              👥 Kelola Kandidat
           </button>
           <button onClick={() => setActiveTab('tokens')} className={`py-3 px-6 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${activeTab === 'tokens' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
              🔑 Kelola Token
           </button>
        </div>

        {/* Alert Message */}
        {adminMsg.text && (
           <div className={`mb-6 p-4 rounded-lg font-medium text-sm ${adminMsg.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
             {adminMsg.text}
           </div>
        )}

        {/* TAB: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow p-6 border-l-4 border-indigo-500">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Suara Masuk</h3>
                <p className="mt-2 text-4xl font-extrabold text-gray-900">{getTotalVotes()}</p>
              </div>
              <div className="bg-white rounded-xl shadow p-6 border-l-4 border-emerald-500">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Token Terpakai</h3>
                <p className="mt-2 text-4xl font-extrabold text-gray-900">{getUsedTokensCount()} <span className="text-lg font-medium text-gray-500">/ {tokensData.length}</span></p>
              </div>
              <div className="bg-white rounded-xl shadow p-6 border-l-4 border-amber-500 flex flex-col justify-center items-start">
                 <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Tindakan Bahaya</h3>
                 <button onClick={handleResetAllVotes} disabled={isProcessing} className="bg-red-100 text-red-700 hover:bg-red-200 px-4 py-2 rounded font-semibold text-sm transition disabled:opacity-50">
                   Reset Semua Suara ke 0
                 </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">Perolehan Suara Sementara (Quick Count)</h3>
              </div>
              <div className="p-6 space-y-6">
                  {candidates.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Belum ada data kandidat. Silakan upload di tab "Kelola Kandidat".</p>
                  ) : (
                    candidates.map((candidate) => {
                      const totalVotes = getTotalVotes();
                      const percentage = totalVotes === 0 ? 0 : Math.round((candidate.votes / totalVotes) * 100);
                      
                      return (
                        <div key={candidate.id}>
                          <div className="flex justify-between items-end mb-2">
                            <div>
                              <span className="text-sm font-bold text-gray-500 mr-2">#{candidate.number}</span>
                              <span className="font-semibold text-gray-900">{candidate.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-2xl font-bold text-gray-900">{candidate.votes}</span>
                              <span className="text-sm text-gray-500 ml-1">({percentage}%)</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                            <div className={`h-4 rounded-full bg-gradient-to-r ${candidate.themeColor || 'from-gray-500 to-gray-700'} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }}></div>
                          </div>
                        </div>
                      );
                    })
                  )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: KANDIDAT */}
        {activeTab === 'candidates' && (
          <div className="bg-white rounded-xl shadow overflow-hidden animate-in fade-in duration-300">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Form Data Kandidat</h3>
                <p className="text-sm text-gray-500 mt-1">Isi formulir di bawah ini untuk mengelola pasangan calon.</p>
              </div>
              <button onClick={handleAddCandidate} className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition">
                 + Tambah Kandidat
              </button>
            </div>
            <div className="p-6 space-y-8 bg-slate-50">
               {editingCandidates.map((cand, index) => (
                   <div key={cand.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm relative">
                      <div className="absolute top-4 right-4">
                         <button onClick={() => handleRemoveCandidate(index)} className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-lg transition" title="Hapus">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                         </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                              <div className="flex gap-4">
                                  <div className="w-1/3">
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Urut</label>
                                      <input type="text" value={cand.number} onChange={e => handleCandidateChange(index, 'number', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" placeholder="01" />
                                  </div>
                                  <div className="w-2/3">
                                      <label className="block text-sm font-medium text-gray-700 mb-1">Nama Paslon</label>
                                      <input type="text" value={cand.name} onChange={e => handleCandidateChange(index, 'name', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" placeholder="Misal: Ahmad & Nisa" />
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Link URL Foto</label>
                                  <input type="text" value={cand.img} onChange={e => handleCandidateChange(index, 'img', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" placeholder="https://..." />
                                  <p className="text-xs text-gray-500 mt-1">Tempel (paste) link gambar paslon. Biarkan jika ingin pakai foto bawaan.</p>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Tema Warna</label>
                                  <select 
                                      value={cand.themeColor} 
                                      onChange={e => {
                                          const sel = THEME_OPTIONS.find(t => t.value === e.target.value);
                                          handleCandidateChange(index, 'themeColor', sel.value);
                                          handleCandidateChange(index, 'btnColor', sel.btn);
                                      }} 
                                      className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                                  >
                                      {THEME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                  </select>
                              </div>
                          </div>
                          
                          <div className="space-y-4">
                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Visi</label>
                                  <textarea value={cand.vision} onChange={e => handleCandidateChange(index, 'vision', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 h-16" placeholder="Tuliskan visi..."></textarea>
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Misi</label>
                                  <textarea value={cand.missionsText} onChange={e => handleCandidateChange(index, 'missionsText', e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 h-28" placeholder="Misi 1...&#10;Misi 2...&#10;(Pisahkan setiap poin dengan menekan tombol Enter)"></textarea>
                              </div>
                          </div>
                      </div>
                   </div>
               ))}

               {editingCandidates.length === 0 && (
                   <div className="text-center py-10 text-gray-500 border-2 border-dashed border-gray-300 rounded-xl">
                      Belum ada kandidat. Klik "Tambah Kandidat" di sudut kanan atas.
                   </div>
               )}

               <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <p className="text-sm text-blue-800">Pastikan Anda mengklik simpan agar perubahan tampil di layar bilik suara.</p>
                  <button 
                    onClick={handleUploadCandidates} 
                    disabled={isProcessing}
                    className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-md transition disabled:opacity-50"
                  >
                    {isProcessing ? 'Menyimpan...' : 'Simpan Data Kandidat'}
                  </button>
               </div>
            </div>
          </div>
        )}

        {/* TAB: TOKEN */}
        {activeTab === 'tokens' && (
          <div className="bg-white rounded-xl shadow overflow-hidden animate-in fade-in duration-300">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Upload Data Token Pemilih</h3>
                <p className="text-sm text-gray-500 mt-1">Pisahkan token dengan koma atau baris baru (enter).</p>
              </div>
              <button onClick={handleGenerateTokens} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                + Generate 50 Token Acak
              </button>
            </div>
            <div className="p-6">
               <textarea 
                 className="w-full h-64 p-4 border border-gray-300 rounded-lg font-mono text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                 value={tokenInput}
                 onChange={(e) => setTokenInput(e.target.value)}
                 placeholder="SISWA01, SISWA02, SISWA03..."
               ></textarea>
               
               <div className="mt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="w-full md:w-auto">
                    <p className="font-semibold text-blue-900 text-sm">Status Database Saat Ini:</p>
                    <p className="text-blue-800 text-sm mt-1">Total Token di Database: <strong>{tokensData.length}</strong> | Terpakai: <strong>{getUsedTokensCount()}</strong></p>
                    <div className="flex flex-wrap gap-2 mt-3">
                       <button onClick={handlePrintTokens} className="bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5 shadow-sm transition">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                          Cetak Kartu Token
                       </button>
                       <button onClick={handleDownloadTokens} className="bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5 shadow-sm transition">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                          Ekspor CSV
                       </button>
                    </div>
                  </div>
                  <button 
                    onClick={handleUploadTokens} 
                    disabled={isProcessing}
                    className="w-full md:w-auto bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-md transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {isProcessing ? 'Memproses...' : 'Simpan Token ke Database'}
                  </button>
               </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};
