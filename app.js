/**
 * Core Application Engine & Firebase Sync
 * Mengontrol logika registrasi, login, absensi mengajar, pencairan dana, dan sync data Realtime DB.
 */

// Konfigurasi Firebase Realtime Database Resmi
const firebaseConfig = {
  apiKey: "AIzaSyCX_lNiA1LcGBBZe7ouQ16mdIGzyGyQtIY",
  authDomain: "gaji-36cc2.firebaseapp.com",
  databaseURL: "https://gaji-36cc2-default-rtdb.firebaseio.com",
  projectId: "gaji-36cc2",
  storageBucket: "gaji-36cc2.firebasestorage.app",
  messagingSenderId: "939605055331",
  appId: "1:939605055331:web:49453cf6ff9dbe36032556",
  measurementId: "G-66Y7NTLCYY"
};

// Inisialisasi Firebase jika belum diinisialisasi
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// Helper Format Rupiah
function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);
}

// Helper Format Tanggal Indonesia
function formatTanggalIndo(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][d.getDay()];
    const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][d.getMonth()];
    return `${hari}, ${d.getDate()} ${bulan} ${d.getFullYear()}`;
}

function formatTanggalRingkas(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][d.getDay()];
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"][d.getMonth()];
    return `${hari}, ${d.getDate()} ${bulan} ${d.getFullYear()}`;
}

// ==========================================
// SYSTEM LOGGING & AUDIT TRAIL ENGINE (INSTANT & SYNCHRONOUS)
// ==========================================
// Pre-fetch battery level in background
try {
    if (navigator.getBattery) {
        navigator.getBattery().then(b => {
            const pct = Math.round(b.level * 100);
            const status = b.charging ? "⚡ Charging" : "🔋 Discharging";
            window.lastBatteryInfo = `${pct}% (${status})`;
        });
    }
} catch(e) {}

function getImmediateDeviceInfo() {
    let batteryInfo = window.lastBatteryInfo || "90% (Standard)";
    let networkInfo = navigator.onLine ? "📶 Wi-Fi Active" : "Offline";
    let deviceName = "Unknown Device";
    let ipAddress = "Web Access";

    // 1. Network Info API (Wi-Fi vs Selular & Speed)
    try {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
            const typeStr = conn.type ? conn.type.toUpperCase() : (conn.effectiveType ? conn.effectiveType.toUpperCase() : "WIFI");
            const speed = conn.downlink ? `${conn.downlink} Mbps` : "";
            const rtt = conn.rtt ? `Ping ${conn.rtt}ms` : "";
            
            if (conn.type === 'wifi') {
                networkInfo = `📶 Wi-Fi Network (${speed} ${rtt})`.trim();
            } else if (conn.type === 'cellular') {
                networkInfo = `📱 Data Selular ${typeStr} (${speed})`.trim();
            } else {
                networkInfo = `📶 Wi-Fi / ${typeStr} (${speed} ${rtt})`.trim();
            }
        }
    } catch(e) {}

    // 2. Device / OS Info
    try {
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) {
            deviceName = "Android Device";
            const match = ua.match(/Android\s+([0-9\.]+)/i);
            if (match) deviceName += ` (v${match[1]})`;
        } else if (/iPhone|iPad|iPod/i.test(ua)) {
            deviceName = "Apple iOS Device";
        } else if (/Windows/i.test(ua)) {
            deviceName = "Windows PC";
        } else if (/Macintosh/i.test(ua)) {
            deviceName = "Mac OS Device";
        } else if (/Linux/i.test(ua)) {
            deviceName = "Linux Device";
        }
    } catch(e) {}

    return {
        battery: batteryInfo,
        network: networkInfo,
        device: deviceName,
        ip: ipAddress
    };
}

function recordSystemLog(userNama, userHp, role, aksi, deskripsi) {
    return new Promise((resolve) => {
        try {
            const info = getImmediateDeviceInfo();
            const now = new Date().toISOString();
            const logId = "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
            const cleanHp = (userHp || "-").toString().trim().replace(/[^0-9]/g, '');

            const logData = {
                id: logId,
                userNama: userNama || "Anonim",
                userHp: userHp || "-",
                role: role || "Pelatih",
                aksi: aksi || "AKTIVITAS",
                deskripsi: deskripsi || "-",
                baterai: info.battery,
                jaringan: info.network,
                device: info.device,
                ip: info.ip,
                timestamp: now
            };

            let finished = false;
            const done = () => {
                if (!finished) {
                    finished = true;
                    resolve(logData);
                }
            };

            // SIMPAN HANYA KE DATABASE FIREBASE CLOUD REALTIME DB
            if (typeof db !== 'undefined' && db) {
                db.ref(`keuangan/logs/${logId}`).set(logData).then(done).catch(done);
                db.ref(`keuangan/activity_logs/${logId}`).set(logData).catch(e => {});
                if (cleanHp && cleanHp.length >= 8) {
                    db.ref(`keuangan/pelatih/${cleanHp}/activityLogs/${logId}`).set(logData).catch(e => {});
                }
            } else {
                done();
            }

            setTimeout(done, 800);

        } catch(err) {
            console.error("Gagal mencatat log ke Firebase:", err);
            resolve(null);
        }
    });
}

// ==========================================
// GLOBAL FAST LOADING MODAL (MAX 10 DETIK)
// ==========================================
let loadingTimer = null;
let loadingInterval = null;

function ensureLoadingModalExists() {
    if (!document.getElementById("globalLoadingModal")) {
        const div = document.createElement("div");
        div.id = "globalLoadingModal";
        div.className = "loading-backdrop";
        div.innerHTML = `
            <div class="loading-box">
                <div class="spinner-icon"></div>
                <div class="loading-text" id="globalLoadingTitle">Memproses Data...</div>
                <div class="loading-subtext" id="globalLoadingSub">Mohon tunggu sebentar (Max 10 detik)</div>
                <div class="loading-progress-bar">
                    <div class="loading-progress-fill" id="globalLoadingProgress"></div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }
}

function showLoading(title = "Memproses Data...", maxSeconds = 10) {
    ensureLoadingModalExists();
    const modal = document.getElementById("globalLoadingModal");
    const titleEl = document.getElementById("globalLoadingTitle");
    const progressEl = document.getElementById("globalLoadingProgress");
    
    if (titleEl) titleEl.innerText = title;
    if (progressEl) progressEl.style.width = "0%";
    if (modal) modal.classList.add("active");

    if (loadingTimer) clearTimeout(loadingTimer);
    if (loadingInterval) clearInterval(loadingInterval);

    let startTime = Date.now();
    let durationMs = maxSeconds * 1000;

    loadingInterval = setInterval(() => {
        let elapsed = Date.now() - startTime;
        let pct = Math.min(100, (elapsed / durationMs) * 100);
        if (progressEl) progressEl.style.width = `${pct}%`;
    }, 100);

    loadingTimer = setTimeout(() => {
        hideLoading();
        alert("⚠️ Waktu koneksi habis (Timeout 10s). Mohon periksa jaringan internet Anda dan coba lagi.");
    }, durationMs);
}

function hideLoading() {
    if (loadingTimer) {
        clearTimeout(loadingTimer);
        loadingTimer = null;
    }
    if (loadingInterval) {
        clearInterval(loadingInterval);
        loadingInterval = null;
    }
    const modal = document.getElementById("globalLoadingModal");
    if (modal) modal.classList.remove("active");
}

// ==========================================
// AUTHENTICATION MODULE (USER & ADMIN)
// ==========================================

// Register Pelatih Baru
function registerPelatih(nama, noHp, tglLahir) {
    const cleanHp = noHp.trim().replace(/[^0-9]/g, '');
    const cleanPw = tglLahir.trim().replace(/[^0-9]/g, ''); // format DDMMYY

    if (!nama || !cleanHp || !cleanPw) {
        alert("❌ Semua field registrasi wajib diisi!");
        return;
    }

    if (cleanPw.length !== 6) {
        alert("❌ Format Tanggal Lahir harus 6 digit DDMMYY! Contoh lahir 16 Sep 2005 = 160905");
        return;
    }

    showLoading("Mendaftarkan Akun Pelatih...", 10);
    const userRef = db.ref(`keuangan/pelatih/${cleanHp}`);
    userRef.once('value', snapshot => {
        if (snapshot.exists()) {
            hideLoading();
            alert("⚠️ Nomor HP ini sudah terdaftar sebagai akun pelatih. Silakan langsung login!");
        } else {
            const userData = {
                nama: nama.trim(),
                noHp: cleanHp,
                tglLahir: cleanPw,
                saldoTerkumpul: 0,
                statusAccount: "active",
                createdAt: new Date().toISOString()
            };
            userRef.set(userData).then(() => {
                hideLoading();
                alert("🎉 Akun Berhasil Dibuat! Silakan Login menggunakan No HP & Tanggal Lahir.");
                if (typeof showLoginView === 'function') {
                    showLoginView();
                } else if (typeof switchAuthTab === 'function') {
                    switchAuthTab('login');
                }
            }).catch(err => {
                hideLoading();
                alert("❌ Gagal mendaftar: " + err.message);
            });
        }
    }).catch(err => {
        hideLoading();
        alert("❌ Koneksi terhambat: " + err.message);
    });
}

// Login Pelatih (Auto Detect Superadmin)
function loginPelatih(noHp, tglLahir) {
    const cleanHp = noHp.trim().replace(/[^0-9]/g, '');
    const cleanPw = tglLahir.trim().replace(/[^0-9]/g, '');

    if (!cleanHp || !cleanPw) {
        alert("❌ Masukkan No HP dan Tanggal Lahir!");
        return;
    }

    // CEK KHUSUS KREDENSIAL SUPERADMIN
    if (cleanHp === "24214160905" && cleanPw === "160905") {
        sessionStorage.setItem("pelatih_superadmin_auth", "true");
        showLoading("Mencatat Aktivitas Superadmin & Mengalihkan...", 10);
        
        recordSystemLog("Super Administrator", cleanHp, "Superadmin", "LOGIN", "Superadmin (24214160905) berhasil login via Portal Utama").then(() => {
            hideLoading();
            alert("👑 Login Superadmin Berhasil! Mengalihkan ke Control Center...");
            window.location.href = "superadmin.html";
        });
        return;
    }

    showLoading("Memverifikasi Akun Pelatih...", 10);
    db.ref(`keuangan/pelatih/${cleanHp}`).once('value', snapshot => {
        hideLoading();
        if (snapshot.exists()) {
            const user = snapshot.val();
            if (user.statusAccount === "disabled" && cleanHp !== "24214160905") {
                alert("🚫 Akun Anda telah dinonaktifkan oleh Admin. Silakan hubungi pengelola!");
                return;
            }
            if (user.tglLahir === cleanPw) {
                // Simpan Sesi Login
                const sessionToken = PelatihSecurity.hashStr(cleanHp + cleanPw);
                sessionStorage.setItem("pelatih_user_hp", cleanHp);
                sessionStorage.setItem("pelatih_user_nama", user.nama);
                sessionStorage.setItem("pelatih_session_token", sessionToken);
                
                recordSystemLog(user.nama, cleanHp, "Pelatih", "LOGIN", `Coach ${user.nama} berhasil login ke Portal Pelatih`).then(() => {
                    alert(`✅ Selamat Datang, Coach ${user.nama}!`);
                    window.location.href = "pelatih.html";
                });
            } else {
                recordSystemLog("-", cleanHp, "Pelatih", "LOGIN_GAGAL", `Percobaan login gagal (Password salah) untuk No HP: ${cleanHp}`);
                alert("❌ Tanggal Lahir (Password) Salah! Contoh format: 160905");
            }
        } else {
            recordSystemLog("-", cleanHp, "Pelatih", "LOGIN_GAGAL", `Percobaan login gagal (No HP belum terdaftar): ${cleanHp}`);
            alert("❌ Nomor HP belum terdaftar! Silakan klik tab 'Buat Akun' terlebih dahulu.");
        }
    }).catch(err => {
        hideLoading();
        alert("❌ Koneksi terhambat: " + err.message);
    });
}

// Login Admin
function loginAdmin(adminId, adminPw) {
    if (adminId === "admin" && adminPw === "admin123") {
        sessionStorage.setItem("pelatih_admin_auth", "true");
        recordSystemLog("Admin Pengelola", "admin", "Admin", "LOGIN", "Admin berhasil login ke Dashboard Admin").then(() => {
            alert("✅ Login Admin Berhasil!");
            window.location.href = "dashboard.html";
        });
    } else {
        recordSystemLog("Admin", adminId || "-", "Admin", "LOGIN_GAGAL", `Percobaan login Admin gagal dengan ID: ${adminId}`);
        alert("❌ ID atau Password Admin salah!");
    }
}

// Logout
function logoutUser() {
    const userHp = sessionStorage.getItem("pelatih_user_hp");
    const userNama = sessionStorage.getItem("pelatih_user_nama");
    recordSystemLog(userNama || "Pelatih", userHp || "-", "Pelatih", "LOGOUT", "Pelatih logout dari aplikasi").then(() => {
        sessionStorage.removeItem("pelatih_user_hp");
        sessionStorage.removeItem("pelatih_user_nama");
        sessionStorage.removeItem("pelatih_session_token");
        window.location.href = "index.html";
    });
}

function logoutAdmin() {
    recordSystemLog("Admin Pengelola", "admin", "Admin", "LOGOUT", "Admin logout dari aplikasi").then(() => {
        sessionStorage.removeItem("pelatih_admin_auth");
        window.location.href = "index.html";
    });
}

// ==========================================
// PELATIH DASHBOARD & TARIK TUNAI MODULE
// ==========================================

function initPelatihDashboard() {
    const userHp = sessionStorage.getItem("pelatih_user_hp");
    if (!userHp) {
        window.location.href = "auth.html";
        return;
    }

    // Ambil data config global hide dana
    db.ref(`keuangan/config/hideDanaGlobal`).on('value', globalHideSnap => {
        const isHideGlobal = globalHideSnap.val() === true;

        // Bind User Profile Info
        db.ref(`keuangan/pelatih/${userHp}`).on('value', snapshot => {
            const user = snapshot.val() || {};
            const isHideAccount = user.hideDana === true;
            const isDanaHidden = isHideGlobal || isHideAccount;

            document.getElementById("userNamaHeader").innerText = user.nama || "Pelatih";
            document.getElementById("userHpHeader").innerText = user.noHp || userHp;
            
            // Avatar rendering
            const avatarImg = document.getElementById("userAvatarHeader");
            const avatarPlaceholder = document.getElementById("userAvatarPlaceholder");
            if (avatarImg && avatarPlaceholder) {
                if (user.fotoUrl) {
                    avatarImg.src = user.fotoUrl;
                    avatarImg.style.display = "block";
                    avatarPlaceholder.style.display = "none";
                } else {
                    avatarImg.style.display = "none";
                    avatarPlaceholder.style.display = "flex";
                }
            }

            // Auto fill modal edit
            if (document.getElementById("editHpInput")) document.getElementById("editHpInput").value = user.noHp || userHp;
            if (document.getElementById("editNamaInput")) document.getElementById("editNamaInput").value = user.nama || "";
            if (document.getElementById("editBankDefault")) document.getElementById("editBankDefault").value = user.bankDefault || "";
            if (document.getElementById("editNorekDefault")) document.getElementById("editNorekDefault").value = user.norekDefault || "";
            if (document.getElementById("editPemilikDefault")) document.getElementById("editPemilikDefault").value = user.pemilikDefault || "";
            
            const previewImg = document.getElementById("editAvatarPreview");
            const previewPlaceholder = document.getElementById("editAvatarPlaceholder");
            if (previewImg && previewPlaceholder) {
                if (user.fotoUrl) {
                    previewImg.src = user.fotoUrl;
                    previewImg.style.display = "block";
                    previewPlaceholder.style.display = "none";
                }
            }

            // Validation & Mandatory Profile Enforcement
            const isProfileIncomplete = !user.nama || !user.bankDefault || !user.norekDefault || !user.pemilikDefault || !user.fotoUrl;
            if (isProfileIncomplete) {
                setTimeout(() => {
                    const modalProfil = document.getElementById("modalEditProfil");
                    if (modalProfil && !modalProfil.classList.contains("active")) {
                        modalProfil.classList.add("active");
                        // Hide close button so user MUST fill form first
                        const closeBtn = modalProfil.querySelector(".btn-close-modal");
                        if (closeBtn) closeBtn.style.display = "none";
                        
                        const msgNotice = document.getElementById("profilNoticeMsg");
                        if (!msgNotice) {
                            const headerBox = modalProfil.querySelector(".modal-header");
                            if (headerBox) {
                                const notice = document.createElement("div");
                                notice.id = "profilNoticeMsg";
                                notice.style.cssText = "background:rgba(239, 68, 68, 0.15); border:1px solid rgba(239, 68, 68, 0.4); color:#f87171; padding:10px 14px; border-radius:8px; font-size:12px; margin-top:10px; font-weight:700;";
                                notice.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Perhatian:</strong> Harap lengkapi Foto Profil, Nama Lengkap, dan Data Rekening Default (Bank, No Rekening, & Nama Pemilik) sebelum melanjutkan!`;
                                headerBox.after(notice);
                            }
                        }
                    }
                }, 400);
            } else {
                const modalProfil = document.getElementById("modalEditProfil");
                if (modalProfil) {
                    const closeBtn = modalProfil.querySelector(".btn-close-modal");
                    if (closeBtn) closeBtn.style.display = "block";
                }
            }

            // Fetch Master Sekolah for Kode Mapping
            db.ref(`keuangan/sekolah`).once('value', snapshotSekolah => {
                let sekolahKodeMap = new Map();
                if (snapshotSekolah.exists()) {
                    snapshotSekolah.forEach(c => {
                        const s = c.val();
                        if (s) {
                            sekolahKodeMap.set(c.key, s.kodeSekolah || (c.key.substring(0, 6).toLowerCase() + "sch"));
                        }
                    });
                }

                // Sync Kehadiran & Total Gaji
                db.ref(`keuangan/kehadiran`).orderByChild("noHp").equalTo(userHp).on('value', snapshotKehadiran => {
                    let totalDatang = 0;
                    let totalHonor = 0;
                    const tbody = document.getElementById("tabelJadwalUser");
                    if (!tbody) return;

                    tbody.innerHTML = "";
                    let list = [];
                    snapshotKehadiran.forEach(child => {
                        list.push({ id: child.key, ...child.val() });
                    });

                    // Sort descending by timestamp
                    list.reverse();

                    if (list.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Belum ada catatan kehadiran/mengajar.</td></tr>`;
                    } else {
                        list.forEach(item => {
                            totalDatang += 1;
                            totalHonor += Number(item.honor || 0);

                            const honorDisplay = isDanaHidden 
                                ? `<span style="color:#94a3b8; font-style:italic;">***</span>` 
                                : formatRupiah(item.honor);

                            const sklId = item.sekolahId || "";
                            const kodeDisplay = (sklId && sekolahKodeMap.has(sklId))
                                ? sekolahKodeMap.get(sklId)
                                : (sklId ? sklId.substring(0, 6).toLowerCase() + "sch" : "REGULAR");

                            const tr = document.createElement("tr");
                            tr.innerHTML = `
                                <td><strong>${formatTanggalIndo(item.tanggal)}</strong></td>
                                <td><code style="background:rgba(56, 189, 248, 0.15); color:#38bdf8; padding:3px 10px; border-radius:6px; font-weight:800; border:1px dashed rgba(56, 189, 248, 0.4);"><i class="fa-solid fa-key" style="font-size:10px;"></i> ${kodeDisplay}</code></td>
                                <td><span class="badge-status success"><i class="fa-solid fa-check"></i> ${item.statusAbsen || 'Hadir'}</span></td>
                                <td>${item.durasiJam || 2} Jam</td>
                                <td style="color:#10b981; font-weight:700;">${honorDisplay}</td>
                            `;
                            tbody.appendChild(tr);
                        });
                    }

                    if (document.getElementById("totalKehadiranUser")) document.getElementById("totalKehadiranUser").innerText = `${totalDatang} Kali`;
                    if (document.getElementById("totalGajiUser")) document.getElementById("totalGajiUser").innerText = isDanaHidden ? "***" : formatRupiah(totalHonor);

                    // Sync Penarikan Tunai & Hitung Saldo Siap Cair
                    syncPenarikanAndSaldoUser(userHp, totalHonor, isDanaHidden);
                });
            });
        });
    });
}

// Sync Penarikan & Aktivasi Tombol Tarik Tunai
function syncPenarikanAndSaldoUser(userHp, totalHonor, isDanaHidden = false) {
    // Ambil Pengaturan Tanggal Pencairan Admin
    db.ref(`keuangan/config/tglCair`).on('value', configSnap => {
        const tglCairAdmin = configSnap.val() || ""; // Format YYYY-MM-DD
        const nowStr = new Date().toISOString().split('T')[0];

        db.ref(`keuangan/penarikan`).orderByChild("noHp").equalTo(userHp).on('value', snapshot => {
            let totalTelahDicairkan = 0;
            let totalPending = 0;
            const tbodyPenarikan = document.getElementById("tabelRiwayatPenarikan");
            if (tbodyPenarikan) tbodyPenarikan.innerHTML = "";

            snapshot.forEach(child => {
                const item = child.val();
                if (item.status === "disetujui") {
                    totalTelahDicairkan += Number(item.nominal || 0);
                } else if (item.status === "menunggu") {
                    totalPending += Number(item.nominal || 0);
                }

                if (tbodyPenarikan) {
                    let badgeClass = item.status === "disetujui" ? "success" : (item.status === "ditolak" ? "rejected" : "pending");
                    let statusText = item.status === "disetujui" ? "Cair (Selesai)" : (item.status === "ditolak" ? "Ditolak" : "Proses Admin");
                    
                    const nominalDisplay = isDanaHidden ? `<span style="color:#94a3b8; font-style:italic;">***</span>` : formatRupiah(item.nominal);

                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td>${formatTanggalIndo(item.waktuPengajuan)}</td>
                        <td><strong>${item.bank}</strong> - ${item.norek} (${item.namaPemilik})</td>
                        <td style="font-weight:700;">${nominalDisplay}</td>
                        <td><span class="badge-status ${badgeClass}">${statusText}</span></td>
                    `;
                    tbodyPenarikan.appendChild(tr);
                }
            });

            // Sisa Saldo Belum Dicairkan
            const sisaBelumCair = Math.max(0, totalHonor - totalTelahDicairkan - totalPending);
            
            // Cek data user untuk izin pencairan khusus
            db.ref(`keuangan/pelatih/${userHp}`).once('value', userSnap => {
                const user = userSnap.val() || {};
                const allowKhusus = user.allowCairKhusus === true;

                // Cek Apakah Jadwal Pencairan Sudah Tiba atau Memiliki Akses Izin Khusus Admin
                const isBolehedCair = (!tglCairAdmin || nowStr >= tglCairAdmin || allowKhusus);

                // Saldo Siap Cair yang tampil di UI & Form
                const saldoSiapCair = (isBolehedCair && sisaBelumCair > 0 && !isDanaHidden) ? sisaBelumCair : 0;

                const saldoCairElement = document.getElementById("saldoSiapCairUser");
                if (saldoCairElement) saldoCairElement.innerText = isDanaHidden ? "***" : formatRupiah(saldoSiapCair);

                // KONTROL TOMBOL TARIK TUNAI (MENYALA ATAU MATI)
                const btnTarik = document.getElementById("btnTarikTunai");
                const tarikStatusTxt = document.getElementById("tarikStatusNotice");

                if (btnTarik) {
                    if (isDanaHidden) {
                        btnTarik.disabled = true;
                        if (tarikStatusTxt) tarikStatusTxt.innerHTML = `<span style="color:#f59e0b;"><i class="fa-solid fa-eye-slash"></i> Tampilan nominal saldo & fitur pencairan dana sedang disembunyikan oleh Admin.</span>`;
                    } else if (sisaBelumCair <= 0) {
                        btnTarik.disabled = true;
                        if (tarikStatusTxt) tarikStatusTxt.innerHTML = `<span style="color:#94a3b8;">✅ Honor sebelumnya sudah ditarik semua. Jika ada sesi mengajar baru, saldo akan otomatis bertambah kembali!</span>`;
                    } else if (!isBolehedCair) {
                        btnTarik.disabled = true;
                        if (tarikStatusTxt) tarikStatusTxt.innerHTML = `<span style="color:#f59e0b;">⏳ Jadwal pencairan honor diatur Admin pada tanggal: <strong>${formatTanggalIndo(tglCairAdmin)}</strong>. Tombol tarik tunai akan menyala saat tanggal tersebut tiba.</span>`;
                    } else {
                        btnTarik.disabled = false;
                        if (allowKhusus && tglCairAdmin && nowStr < tglCairAdmin) {
                            if (tarikStatusTxt) tarikStatusTxt.innerHTML = `<span style="color:#10b981;">🎉 Admin memberikan <strong>Akses Pencairan Khusus</strong> untuk akun Anda! Saldo <strong>${formatRupiah(sisaBelumCair)}</strong> siap dicairkan.</span>`;
                        } else {
                            if (tarikStatusTxt) tarikStatusTxt.innerHTML = `<span style="color:#10b981;">🎉 Honor sebesar <strong>${formatRupiah(sisaBelumCair)}</strong> dari sesi mengajar Anda siap dicairkan hari ini! Silakan klik tombol di samping.</span>`;
                        }
                    }
                }

                // Simpan nominal siap cair untuk modal form
                window.currentSaldoSiapCair = (isDanaHidden || !isBolehedCair) ? 0 : sisaBelumCair;
            });
        });
    });
}

// Pengajuan Tarik Tunai Form
function submitPenarikanForm(bank, norek, namaPemilik, customNominal) {
    const userHp = sessionStorage.getItem("pelatih_user_hp");
    const userNama = sessionStorage.getItem("pelatih_user_nama");
    const maxSaldo = window.currentSaldoSiapCair || 0;
    const nominalTarik = Number(customNominal || maxSaldo);

    if (!bank || !norek || !namaPemilik) {
        alert("❌ Harap isi data wajib: Bank, No Rekening/HP, dan Nama Pemilik Rekening!");
        return;
    }

    if (isNaN(nominalTarik) || nominalTarik <= 0) {
        alert("❌ Nominal pencairan tidak valid! Masukkan nominal angka lebih dari 0.");
        return;
    }

    if (nominalTarik > maxSaldo) {
        alert(`❌ Nominal yang ingin ditarik (${formatRupiah(nominalTarik)}) melebihi saldo yang siap dicairkan (${formatRupiah(maxSaldo)})!`);
        return;
    }

    showLoading("Mengajukan Pencairan Dana...", 10);
    const penarikanRef = db.ref(`keuangan/penarikan`).push();
    const dataPenarikan = {
        id: penarikanRef.key,
        noHp: userHp,
        namaPelatih: userNama,
        bank: bank.trim(),
        norek: norek.trim(),
        namaPemilik: namaPemilik.trim(),
        nominal: nominalTarik,
        status: "menunggu",
        waktuPengajuan: new Date().toISOString()
    };

    penarikanRef.set(dataPenarikan).then(() => {
        hideLoading();
        recordSystemLog(userNama, userHp, "Pelatih", "TARIK_TUNAI", `Pengajuan pencairan Rp ${nominalTarik} ke ${bank} (${norek} a.n ${namaPemilik})`);
        alert(`🎉 Pengajuan Pencairan Sebesar ${formatRupiah(nominalTarik)} Berhasil Dibuat! Admin akan segera memproses dana ke rekening Anda.`);
        closeModalTarikTunai();
    }).catch(err => {
        hideLoading();
        alert("❌ Gagal mengajukan pencairan: " + err.message);
    });
}

// Update Edit Data Profil Pelatih
function updateProfilPelatih(namaBaru, bankDef, norekDef, pemilikDef, fotoBase64, pwBaru) {
    const userHp = sessionStorage.getItem("pelatih_user_hp");
    if (!userHp) return;

    const cleanNama = namaBaru.trim();
    const cleanBank = bankDef.trim();
    const cleanNorek = norekDef.trim().replace(/[^0-9]/g, ''); // hanya angka
    const cleanPemilik = pemilikDef.trim();
    const cleanPw = pwBaru ? pwBaru.trim().replace(/[^0-9]/g, '') : "";

    if (!cleanNama || !cleanBank || !cleanNorek || !cleanPemilik) {
        alert("❌ Semua field wajib diisi (Nama Lengkap, Nama Bank, No Rekening, & Nama Pemilik)!");
        return;
    }

    if (cleanBank.length < 3) {
        alert("❌ Nama Bank / E-Wallet minimal 3 huruf! Contoh: BCA / BRI / Mandiri / DANA");
        return;
    }

    if (cleanNorek.length < 7) {
        alert("❌ Nomor Rekening / No E-Wallet minimal 7 digit angka!");
        return;
    }

    if (cleanPemilik.length < 5) {
        alert("❌ Nama Pemilik Rekening minimal 5 huruf!");
        return;
    }

    if (cleanPw && cleanPw.length !== 6) {
        alert("❌ Password / PIN Baru wajib tepat 6 digit angka DDMMYY! Contoh: 160905");
        return;
    }

    db.ref(`keuangan/pelatih/${userHp}`).once('value', snapshot => {
        const userCur = snapshot.val() || {};
        const finalFoto = fotoBase64 || userCur.fotoUrl;

        if (!finalFoto) {
            alert("❌ Harap upload Foto Profil Anda sebelum menyimpan!");
            return;
        }

        const payload = {
            nama: cleanNama,
            bankDefault: cleanBank,
            norekDefault: cleanNorek,
            pemilikDefault: cleanPemilik,
            fotoUrl: finalFoto
        };

        if (cleanPw && cleanPw.length === 6) {
            payload.tglLahir = cleanPw;
        }

        showLoading("Memperbarui Profil Anda...", 10);
        db.ref(`keuangan/pelatih/${userHp}`).update(payload).then(() => {
            hideLoading();
            sessionStorage.setItem("pelatih_user_nama", namaBaru.trim());
            recordSystemLog(namaBaru.trim(), userHp, "Pelatih", "EDIT_PROFIL", `Memperbarui foto/profil pelatih (${userHp})`);
            alert("✅ Data profil berhasil diperbarui!");
            closeModalEditProfil();
        }).catch(err => {
            hideLoading();
            alert("❌ Gagal menyimpan profil: " + err.message);
        });
    });
}

// ==========================================
// ADMIN MODULE (MANAGEMENT & SAT SET ACC)
// ==========================================

function initAdminDashboard() {
    if (sessionStorage.getItem("pelatih_admin_auth") !== "true") {
        window.location.href = "index.html";
        return;
    }

    // Load Realtime Pengaturan Tanggal Pencairan Admin
    db.ref(`keuangan/config/tglCair`).on('value', snapshot => {
        const tglInput = document.getElementById("adminSettingTglCair");
        if (tglInput) {
            tglInput.value = snapshot.val() || "";
        }
    });

    // Load Realtime Global Hide Dana Config
    db.ref(`keuangan/config/hideDanaGlobal`).on('value', snapshot => {
        const isHideGlobal = snapshot.val() === true;
        const btnGlobal = document.getElementById("btnToggleHideDanaGlobal");
        if (btnGlobal) {
            if (isHideGlobal) {
                btnGlobal.style.background = "#f59e0b";
                btnGlobal.style.color = "#000";
                btnGlobal.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Global Hide Dana: AKTIF (Uang Disembunyikan u/ Semua)`;
            } else {
                btnGlobal.style.background = "#6366f1";
                btnGlobal.style.color = "#fff";
                btnGlobal.innerHTML = `<i class="fa-solid fa-eye"></i> Sembunyikan Dana SEMUA Akun Pelatih`;
            }
        }
    });

    // Load Master Sekolah & Auto Fill Select Dropdown & Render Rekap Statistik Sekolah
    db.ref(`keuangan/sekolah`).on('value', snapshotSekolah => {
        const selectSekolah = document.getElementById("selectSekolahAdmin");
        let htmlOptions = `<option value="">-- Pilih Sekolah (Opsional) --</option>`;

        let masterSekolahMap = new Map();
        if (snapshotSekolah.exists()) {
            snapshotSekolah.forEach(c => {
                const val = c.val();
                const namaSekolah = (typeof val === 'string') ? val : (val ? val.namaSekolah : "");
                if (namaSekolah) {
                    const status = (typeof val === 'object' && val.status) ? val.status : "active";
                    const kode = (typeof val === 'object' && val.kodeSekolah) ? val.kodeSekolah : (c.key.substring(0, 6).toLowerCase() + "sch");
                    masterSekolahMap.set(c.key, namaSekolah);
                    if (status === "active") {
                        htmlOptions += `<option value="${c.key}">🔑 ${kode} — (${namaSekolah})</option>`;
                    }
                }
            });
        }

        if (selectSekolah) {
            selectSekolah.innerHTML = htmlOptions;
        }

        window.masterSekolahMap = masterSekolahMap;
        renderRekapSekolahAdmin();
    });

    // Load Select Option Pelatih & Master Data Pelatih
    db.ref(`keuangan/pelatih`).on('value', snapshot => {
        const selectPelatih = document.getElementById("selectPelatihAdmin");
        const listPelatihTable = document.getElementById("tabelMasterPelatih");
        if (selectPelatih) selectPelatih.innerHTML = `<option value="">-- Pilih Pelatih --</option>`;
        if (listPelatihTable) listPelatihTable.innerHTML = "";

        snapshot.forEach(child => {
            const p = child.val();
            const hp = p.noHp || child.key;
            if (hp === "24214160905") return; // Sembunyikan Superadmin dari Master Pelatih

            const isAktif = p.statusAccount !== "disabled";
            const isHideAccount = p.hideDana === true;

            if (selectPelatih && isAktif) {
                selectPelatih.innerHTML += `<option value="${p.noHp}">${p.nama} (${p.noHp})</option>`;
            }

            if (listPelatihTable) {
                const badgeStatus = isAktif 
                    ? '<span class="badge-status success">Aktif</span>'
                    : '<span class="badge-status rejected">Nonaktif</span>';

                const badgeHideDana = isHideAccount
                    ? '<span class="badge-status pending" style="margin-left:4px;"><i class="fa-solid fa-eye-slash"></i> Dana Hidden</span>'
                    : '';

                const btnToggleStatus = isAktif
                    ? `<button class="btn-action-danger" style="padding:5px 10px; font-size:11px; margin:0;" onclick="adminToggleStatusPelatih('${p.noHp}', 'disabled')"><i class="fa-solid fa-ban"></i> Nonaktifkan</button>`
                    : `<button class="btn-action-satset" style="padding:5px 10px; font-size:11px; margin:0;" onclick="adminToggleStatusPelatih('${p.noHp}', 'active')"><i class="fa-solid fa-check"></i> Aktifkan</button>`;

                const btnToggleHideDana = isHideAccount
                    ? `<button class="btn-action-satset" style="background:#8b5cf6; color:#fff; padding:5px 10px; font-size:11px; margin:0;" onclick="adminToggleHideDanaPelatih('${p.noHp}', false)"><i class="fa-solid fa-eye"></i> Show Dana</button>`
                    : `<button class="btn-action-satset" style="background:rgba(139, 92, 246, 0.2); color:#c084fc; border:1px solid rgba(139, 92, 246, 0.4); padding:5px 10px; font-size:11px; margin:0;" onclick="adminToggleHideDanaPelatih('${p.noHp}', true)"><i class="fa-solid fa-eye-slash"></i> Hide Dana</button>`;

                const fotoHTML = p.fotoUrl 
                    ? `<div style="display:flex; align-items:center; gap:10px;">
                        <img src="${p.fotoUrl}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid #10b981; cursor:pointer;" onclick="previewFotoPelatihAdmin('${p.fotoUrl}', '${p.nama.replace(/'/g, "\\'")}')" title="Klik untuk memperbesar foto">
                        <div>
                            <strong style="font-size:13px;">${p.nama}</strong><br>
                            <span class="badge-status success" style="font-size:9px; padding:1px 6px;"><i class="fa-solid fa-camera"></i> Foto Terpasang</span>
                        </div>
                       </div>`
                    : `<div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:40px; height:40px; border-radius:50%; background:rgba(100, 116, 139, 0.2); color:#64748b; display:flex; align-items:center; justify-content:center; border:1px dashed #64748b; font-size:16px;">
                            <i class="fa-solid fa-user-xmark"></i>
                        </div>
                        <div>
                            <strong style="font-size:13px;">${p.nama}</strong><br>
                            <span class="badge-status pending" style="font-size:9px; padding:1px 6px; background:rgba(100,116,139,0.15); color:#94a3b8; border-color:rgba(100,116,139,0.3);"><i class="fa-solid fa-circle-minus"></i> Belum Ada Foto</span>
                        </div>
                       </div>`;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><input type="checkbox" class="cb-pelatih" value="${p.noHp}" data-nama="${p.nama}" onclick="updateSelectedPelatihCount()"></td>
                    <td>${fotoHTML}</td>
                    <td>${p.noHp}</td>
                    <td><code style="background:rgba(59, 130, 246, 0.15); color:#60a5fa; padding:2px 8px; border-radius:4px; font-weight:700;">${p.tglLahir || '-'}</code></td>
                    <td>${badgeStatus} ${badgeHideDana}</td>
                    <td>${p.bankDefault ? `${p.bankDefault} - ${p.norekDefault} a.n ${p.pemilikDefault}` : '<span style="color:#64748b;">Belum set</span>'}</td>
                    <td>
                        <div style="display:inline-flex; gap:6px; flex-wrap:wrap; align-items:center;">
                            ${btnToggleHideDana}
                            ${btnToggleStatus}
                        </div>
                    </td>
                `;
                listPelatihTable.appendChild(tr);
            }
        });
        updateSelectedPelatihCount();
    });

    // Load All Kehadiran Admin
    db.ref(`keuangan/kehadiran`).on('value', snapshot => {
        const tbody = document.getElementById("tabelAdminKehadiran");
        if (!tbody) return;
        tbody.innerHTML = "";

        let list = [];
        snapshot.forEach(child => {
            list.push({ id: child.key, ...child.val() });
        });
        list.reverse();

        window.cachedKehadiranList = list;
        renderRekapSekolahAdmin();

        list.forEach(item => {
            const tr = document.createElement("tr");
            const nmSekolah = item.namaSekolah || "Sekolah Regular";
            const sklId = item.sekolahId || "";
            tr.innerHTML = `
                <td><input type="checkbox" class="cb-kehadiran" value="${item.id}" onclick="updateSelectedKehadiranCount()"></td>
                <td><strong>${formatTanggalIndo(item.tanggal)}</strong></td>
                <td>${item.namaPelatih} (${item.noHp})</td>
                <td><span style="color:#38bdf8; font-weight:700;"><i class="fa-solid fa-school"></i> ${nmSekolah}</span></td>
                <td>${item.kegiatan}</td>
                <td>${item.durasiJam} Jam</td>
                <td style="color:#10b981; font-weight:700;">${formatRupiah(item.honor)}</td>
                <td>
                    <button class="btn-action-satset" style="background:#f59e0b; color:#000;" onclick="openEditKehadiranModal('${item.id}', '${item.noHp}', '${item.tanggal}', '${item.kegiatan.replace(/'/g, "\\'")}', ${item.durasiJam}, ${item.honor}, '${sklId}', '${nmSekolah.replace(/'/g, "\\'")}')">
                        <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                    <button class="btn-action-danger" style="margin-left:4px;" onclick="hapusKehadiranAdmin('${item.id}')">
                        <i class="fa-solid fa-trash"></i> Hapus
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        updateSelectedKehadiranCount();
    });

    // Load Pengajuan Pencairan Admin (Fitur SAT SET)
    db.ref(`keuangan/penarikan`).on('value', snapshot => {
        const tbody = document.getElementById("tabelAdminPenarikan");
        if (!tbody) return;
        tbody.innerHTML = "";

        let pendingCount = 0;
        snapshot.forEach(child => {
            const item = child.val();
            if (item.status === "menunggu") pendingCount++;

            let statusBadge = item.status === "disetujui" 
                ? '<span class="badge-status success">DITRANSFER (SELESAI)</span>'
                : (item.status === "ditolak" ? '<span class="badge-status rejected">DITOLAK</span>' : '<span class="badge-status pending">MENUNGGU ACC ADMIN</span>');

            let actionBtns = item.status === "menunggu" ? `
                <button class="btn-action-satset" onclick="accPenarikanSatSet('${child.key}', 'disetujui')">
                    <i class="fa-solid fa-bolt"></i> SETUJUI & CAIRKAN (SAT SET)
                </button>
                <button class="btn-action-danger" style="margin-left:6px;" onclick="accPenarikanSatSet('${child.key}', 'ditolak')">
                    Tolak
                </button>
            ` : `<span style="color:#64748b; font-size:12px;">Selesai Diproses</span>`;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><input type="checkbox" class="cb-penarikan" value="${child.key}" onclick="updateSelectedPenarikanCount()"></td>
                <td>${formatTanggalIndo(item.waktuPengajuan)}</td>
                <td><strong>${item.namaPelatih}</strong><br><small style="color:#94a3b8;">${item.noHp}</small></td>
                <td style="background:rgba(59, 130, 246, 0.1); border-radius:8px;">
                    <strong>${item.bank}</strong><br>
                    <span style="color:#60a5fa; font-size:14px; font-weight:700;">${item.norek}</span><br>
                    <small>a.n ${item.namaPemilik}</small>
                </td>
                <td style="color:#34d399; font-weight:800; font-size:15px;">${formatRupiah(item.nominal)}</td>
                <td>${statusBadge}</td>
                <td>${actionBtns}</td>
            `;
            tbody.appendChild(tr);
        });

        const badgePending = document.getElementById("countPendingPenarikan");
        if (badgePending) badgePending.innerText = pendingCount;
        const badgeTabPending = document.getElementById("countTabPendingPenarikan");
        if (badgeTabPending) badgeTabPending.innerText = pendingCount;
        updateSelectedPenarikanCount();
    });

    // REALTIME SYSTEM LOGS LISTENER (MULTI-NODE PERSISTENCE AGGREGATOR)
    function syncAllFirebaseLogNodes() {
        let collectedMap = new Map();

        db.ref(`keuangan/logs`).on('value', snap1 => {
            if (snap1.exists()) {
                snap1.forEach(c => {
                    const val = c.val();
                    if (val && typeof val === 'object') {
                        const k = val.id || c.key;
                        collectedMap.set(k, { id: k, ...val });
                    }
                });
            }

            db.ref(`keuangan/activity_logs`).once('value', snap2 => {
                if (snap2.exists()) {
                    snap2.forEach(c => {
                        const val = c.val();
                        if (val && typeof val === 'object') {
                            const k = val.id || c.key;
                            collectedMap.set(k, { id: k, ...val });
                        }
                    });
                }

                db.ref(`keuangan/pelatih`).once('value', snap3 => {
                    if (snap3.exists()) {
                        snap3.forEach(pSnap => {
                            const p = pSnap.val();
                            if (p && p.activityLogs && typeof p.activityLogs === 'object') {
                                Object.keys(p.activityLogs).forEach(lk => {
                                    const val = p.activityLogs[lk];
                                    if (val && typeof val === 'object') {
                                        const k = val.id || lk;
                                        collectedMap.set(k, { id: k, ...val });
                                    }
                                });
                            }
                        });
                    }

                    window.firebaseLogsCache = Array.from(collectedMap.values());
                    renderLogsFromAllSources();
                });
            });
        });
    }

    syncAllFirebaseLogNodes();
}

function renderLogsFromAllSources() {
    let combined = [];

    // BACA PURE HANYA DARI FIREBASE REALTIME DATABASE CLOUD
    if (window.firebaseLogsCache && Array.isArray(window.firebaseLogsCache)) {
        combined = [...window.firebaseLogsCache];
    }

    combined.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    const cachedLogsList = combined;

    const badgeLogs = document.getElementById("countTabLogs");
    if (badgeLogs) badgeLogs.innerText = cachedLogsList.length;

    renderLogsTable(cachedLogsList);
}

function renderLogsTable(logsArray) {
    const tbody = document.getElementById("tabelSystemLogs");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (logsArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:20px;">Belum ada histori log aktivitas yang tercatat.</td></tr>`;
        return;
    }

    logsArray.forEach(item => {
        let badgeAksi = '<span class="badge-status info">AKTIVITAS</span>';
        if (item.aksi === "LOGIN") badgeAksi = '<span class="badge-status success"><i class="fa-solid fa-right-to-bracket"></i> LOGIN</span>';
        else if (item.aksi === "LOGOUT") badgeAksi = '<span class="badge-status rejected"><i class="fa-solid fa-right-from-bracket"></i> LOGOUT</span>';
        else if (item.aksi === "LOGIN_GAGAL") badgeAksi = '<span class="badge-status rejected"><i class="fa-solid fa-shield-cat"></i> LOGIN GAGAL</span>';
        else if (item.aksi === "TARIK_TUNAI") badgeAksi = '<span class="badge-status pending"><i class="fa-solid fa-hand-holding-dollar"></i> TARIK TUNAI</span>';
        else if (item.aksi === "ACC_PENCAIRAN") badgeAksi = '<span class="badge-status success"><i class="fa-solid fa-bolt"></i> ACC PENCAIRAN</span>';
        else if (item.aksi === "HAPUS_DATA") badgeAksi = '<span class="badge-status rejected"><i class="fa-solid fa-trash"></i> HAPUS DATA</span>';

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><input type="checkbox" class="cb-log" value="${item.id}"></td>
            <td><strong>${formatTanggalIndo(item.timestamp)}</strong></td>
            <td><strong>${item.userNama}</strong><br><small style="color:#94a3b8;">${item.userHp}</small> <span class="badge-status purple" style="font-size:9px;">${item.role}</span></td>
            <td>${badgeAksi}</td>
            <td>
                <i class="fa-solid fa-mobile-screen" style="color:var(--primary);"></i> <strong>${item.device || 'Mobile/PC'}</strong><br>
                <small style="color:#34d399;"><i class="fa-solid fa-battery-three-quarters"></i> Baterai: ${item.baterai || 'Unknown'}</small>
            </td>
            <td>
                <i class="fa-solid fa-wifi" style="color:#f59e0b;"></i> <strong>${item.jaringan || 'Wi-Fi'}</strong><br>
                <small style="color:#60a5fa;"><i class="fa-solid fa-network-wired"></i> IP: ${item.ip || 'Local'}</small>
            </td>
            <td style="font-size:12px; color:#e2e8f0;">${item.deskripsi}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// ADMIN TAB SWITCHER LOGIC
// ==========================================
function switchAdminTab(tabName, btnEl) {
    document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");

    const secMaster = document.getElementById("secMasterPelatih");
    const secPencairan = document.getElementById("secPencairan");
    const secKehadiran = document.getElementById("secKehadiran");
    const secSetting = document.getElementById("secSettingCair");
    const secLogs = document.getElementById("secLogs");

    const secSekolah = document.getElementById("secSekolah");
    if (secMaster) secMaster.style.display = (tabName === 'pelatih') ? 'block' : 'none';
    if (secSekolah) secSekolah.style.display = (tabName === 'sekolah') ? 'block' : 'none';
    if (secPencairan) secPencairan.style.display = (tabName === 'penarikan') ? 'block' : 'none';
    if (secKehadiran) secKehadiran.style.display = (tabName === 'kehadiran') ? 'block' : 'none';
    if (secSetting) secSetting.style.display = (tabName === 'setting') ? 'block' : 'none';
    if (secLogs) secLogs.style.display = (tabName === 'logs') ? 'block' : 'none';
}

// ==========================================
// MASTER & REKAP SEKOLAH ENGINE
// ==========================================
function openModalTambahSekolahCepat() {
    const nama = prompt("🎓 Tambah Nama Sekolah Baru:\nMasukkan nama sekolah (misal: SMPN 1 / SMA 2):");
    if (!nama || nama.trim() === "") return;

    const cleanNama = nama.trim();
    showLoading("Menyimpan Data Sekolah Baru...", 10);
    const newRef = db.ref(`keuangan/sekolah`).push();
    newRef.set({
        id: newRef.key,
        namaSekolah: cleanNama,
        createdAt: new Date().toISOString()
    }).then(() => {
        hideLoading();
        // Otomatis set select dropdown ke sekolah yang baru saja dibuat
        setTimeout(() => {
            const selectEl = document.getElementById("selectSekolahAdmin");
            if (selectEl) selectEl.value = newRef.key;
        }, 300);
        alert(`🎓 Sekolah "${cleanNama}" berhasil ditambahkan & otomatis terpilih!`);
    }).catch(err => {
        hideLoading();
        alert("❌ Gagal menyimpan sekolah: " + err.message);
    });
}

function handleAdminTambahSekolah(e) {
    e.preventDefault();
    const inputEl = document.getElementById("inputNamaSekolahBaru");
    const namaSekolah = inputEl ? inputEl.value.trim() : "";

    if (!namaSekolah) {
        alert("❌ Masukkan nama sekolah!");
        return;
    }

    showLoading("Menyimpan Data Sekolah Baru...", 10);
    const newRef = db.ref(`keuangan/sekolah`).push();
    newRef.set({
        id: newRef.key,
        namaSekolah: namaSekolah,
        createdAt: new Date().toISOString()
    }).then(() => {
        hideLoading();
        if (inputEl) inputEl.value = "";
        alert(`🎓 Sekolah "${namaSekolah}" berhasil ditambahkan!`);
    }).catch(err => {
        hideLoading();
        alert("❌ Gagal menyimpan sekolah: " + err.message);
    });
}

function adminHapusSekolah(sekolahId, namaSekolah) {
    if (confirm(`Apakah Anda yakin ingin menghapus data sekolah "${namaSekolah}"?`)) {
        showLoading("Menghapus Data Sekolah...", 10);
        db.ref(`keuangan/sekolah/${sekolahId}`).remove().then(() => {
            hideLoading();
            alert(`✅ Sekolah "${namaSekolah}" berhasil dihapus.`);
        }).catch(err => {
            hideLoading();
            alert("❌ Gagal menghapus: " + err.message);
        });
    }
}

function adminEditSekolah(sekolahId, namaSekolahLama) {
    const namaBaru = prompt(`Ubah Nama Sekolah:\nMasukkan nama baru untuk "${namaSekolahLama}":`, namaSekolahLama);
    if (!namaBaru || namaBaru.trim() === "" || namaBaru.trim() === namaSekolahLama) return;

    const cleanNamaBaru = namaBaru.trim();
    showLoading(`Memperbarui Nama Sekolah & Rekap Terkait...`, 10);

    // 1. Update master data sekolah
    db.ref(`keuangan/sekolah/${sekolahId}`).update({
        namaSekolah: cleanNamaBaru,
        updatedAt: new Date().toISOString()
    }).then(() => {
        // 2. Cascade update seluruh data kehadiran yang mengacu pada sekolah ini (sekolahId atau namaSekolah)
        db.ref(`keuangan/kehadiran`).once('value', snapshot => {
            let updates = {};
            if (snapshot.exists()) {
                snapshot.forEach(c => {
                    const item = c.val();
                    if (item.sekolahId === sekolahId || item.namaSekolah === namaSekolahLama) {
                        updates[`keuangan/kehadiran/${c.key}/namaSekolah`] = cleanNamaBaru;
                        updates[`keuangan/kehadiran/${c.key}/sekolahId`] = sekolahId;
                    }
                });
            }

            if (Object.keys(updates).length > 0) {
                db.ref().update(updates).then(() => {
                    hideLoading();
                    alert(`✅ Nama Sekolah berhasil diperbarui menjadi "${cleanNamaBaru}"! Seluruh rekap kehadiran pelatih otomatis menyesuaikan.`);
                }).catch(err => {
                    hideLoading();
                    alert("❌ Gagal update rekap kehadiran: " + err.message);
                });
            } else {
                hideLoading();
                alert(`✅ Nama Sekolah berhasil diperbarui menjadi "${cleanNamaBaru}"!`);
            }
        });
    }).catch(err => {
        hideLoading();
        alert("❌ Gagal memperbarui sekolah: " + err.message);
    });
}

function renderRekapSekolahAdmin() {
    const tbody = document.getElementById("tabelRekapSekolah");
    if (!tbody) return;
    tbody.innerHTML = "";

    const masterMap = window.masterSekolahMap || new Map();
    const kehadiranList = window.cachedKehadiranList || [];

    if (masterMap.size === 0 && kehadiranList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">Belum ada master data sekolah yang ditambahkan. Silakan tambah nama sekolah pada form di atas.</td></tr>`;
        return;
    }

    // Kelompokkan kehadiran berdasarkan sekolahId atau namaSekolah
    let rekapMap = new Map();

    // Inisialisasi dari master data sekolah
    masterMap.forEach((namaSekolah, key) => {
        rekapMap.set(key, {
            id: key,
            namaSekolah: namaSekolah,
            frekuensiCount: 0,
            pelatihList: [],
            totalJam: 0,
            totalHonor: 0
        });
    });

    kehadiranList.forEach(item => {
        const sklId = item.sekolahId || "";
        let mapKey = sklId;

        if (!mapKey) {
            let foundKey = "";
            masterMap.forEach((val, k) => {
                if (val === item.namaSekolah) foundKey = k;
            });
            mapKey = foundKey || item.namaSekolah || "Sekolah Regular";
        }

        const nmSekolah = (sklId && masterMap.has(sklId)) 
            ? masterMap.get(sklId) 
            : (item.namaSekolah || "Sekolah Regular");

        if (!rekapMap.has(mapKey)) {
            rekapMap.set(mapKey, {
                id: sklId || "",
                namaSekolah: nmSekolah,
                frekuensiCount: 0,
                pelatihList: [],
                totalJam: 0,
                totalHonor: 0
            });
        }

        const data = rekapMap.get(mapKey);
        data.namaSekolah = nmSekolah;
        data.frekuensiCount += 1;
        if (item.namaPelatih) {
            data.pelatihList.push({
                nama: item.namaPelatih,
                tanggal: item.tanggal || "",
                honor: item.honor || 0
            });
        }
        data.totalJam += Number(item.durasiJam || 2);
        data.totalHonor += Number(item.honor || 0);
    });

    rekapMap.forEach((val, key) => {
        let pelatihDisplay = `<span style="color:#64748b; font-size:12px; font-style:italic;">Belum ada riwayat mengajar</span>`;
        if (val.pelatihList.length > 0) {
            const itemsHTML = val.pelatihList.map(p => {
                const tglFormatted = p.tanggal ? formatTanggalRingkas(p.tanggal) : "-";
                return `
                    <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(30, 41, 59, 0.7); border:1px solid rgba(56, 189, 248, 0.25); border-radius:8px; padding:4px 10px; margin:2px 4px 2px 0; backdrop-filter:blur(4px);">
                        <div style="display:flex; align-items:center; gap:5px;">
                            <i class="fa-solid fa-user-gear" style="color:#38bdf8; font-size:11px;"></i>
                            <strong style="color:#f8fafc; font-size:12px; font-weight:600;">${p.nama}</strong>
                        </div>
                        <span style="background:rgba(251, 191, 36, 0.15); color:#fbbf24; border:1px solid rgba(251, 191, 36, 0.3); padding:2px 7px; border-radius:6px; font-size:10px; font-weight:700; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
                            <i class="fa-regular fa-calendar-check" style="font-size:10px;"></i> ${tglFormatted}
                        </span>
                    </div>
                `;
            }).join("");
            pelatihDisplay = `<div style="max-height:110px; overflow-y:auto; padding:2px 0; display:flex; flex-wrap:wrap; gap:4px;">${itemsHTML}</div>`;
        }

        const frekuensiDisplay = val.frekuensiCount > 0
            ? `<span class="badge-status success" style="font-size:12px; font-weight:700;"><i class="fa-solid fa-check"></i> Diajar ${val.frekuensiCount}x</span>`
            : `<span class="badge-status pending" style="font-size:11px; background:rgba(100,116,139,0.15); color:#94a3b8;"><i class="fa-solid fa-circle-minus"></i> Belum ada rekap</span>`;

        const btnEdit = val.id ? `<button class="btn-action-satset" style="background:#f59e0b; color:#000; padding:5px 12px; font-size:12px;" onclick="adminEditSekolah('${val.id}', '${val.namaSekolah.replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen-to-square"></i> Edit Nama</button>` : `<span style="color:#64748b;">-</span>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong style="font-size:14px; color:#38bdf8;"><i class="fa-solid fa-school"></i> ${val.namaSekolah}</strong></td>
            <td>${frekuensiDisplay}</td>
            <td>${pelatihDisplay}</td>
            <td>${val.totalJam} Jam</td>
            <td style="color:#10b981; font-weight:700;">${formatRupiah(val.totalHonor)}</td>
            <td>${btnEdit}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Admin Input & Edit Kehadiran Mengajar Pelatih
function adminTambahKehadiran(noHp, tanggal, kegiatan, durasiJam, honor, editKey = "", sekolahId = "", namaSekolah = "") {
    if (!noHp || !tanggal || !honor) {
        alert("❌ Pilih pelatih, tanggal, dan nominal honor mengajar!");
        return;
    }

    showLoading("Menyimpan Data Kehadiran...", 10);
    db.ref(`keuangan/pelatih/${noHp}`).once('value', snapshot => {
        if (snapshot.exists()) {
            const pelatih = snapshot.val();
            
            if (editKey) {
                // UPDATE DATA KEHADIRAN YANG SUDAH ADA
                db.ref(`keuangan/kehadiran/${editKey}`).update({
                    noHp: noHp,
                    namaPelatih: pelatih.nama,
                    sekolahId: sekolahId || "",
                    namaSekolah: namaSekolah || "Sekolah Regular",
                    tanggal: tanggal,
                    kegiatan: kegiatan || "Mengajar Latihan",
                    durasiJam: Number(durasiJam || 2),
                    honor: Number(honor),
                    updatedAt: new Date().toISOString()
                }).then(() => {
                    hideLoading();
                    alert(`✅ Data Kehadiran Coach ${pelatih.nama} berhasil diperbarui!`);
                    closeModalKehadiranAdmin();
                }).catch(err => {
                    hideLoading();
                    alert("❌ Gagal menyimpan: " + err.message);
                });
            } else {
                // TAMBAH DATA KEHADIRAN BARU
                const refKehadiran = db.ref(`keuangan/kehadiran`).push();
                refKehadiran.set({
                    id: refKehadiran.key,
                    noHp: noHp,
                    namaPelatih: pelatih.nama,
                    sekolahId: sekolahId || "",
                    namaSekolah: namaSekolah || "Sekolah Regular",
                    tanggal: tanggal,
                    kegiatan: kegiatan || "Mengajar Latihan",
                    durasiJam: Number(durasiJam || 2),
                    statusAbsen: "Hadir",
                    honor: Number(honor),
                    createdAt: new Date().toISOString()
                }).then(() => {
                    hideLoading();
                    alert(`✅ Kehadiran & Honor Mengajar Coach ${pelatih.nama} berhasil dicatat!`);
                    closeModalKehadiranAdmin();
                }).catch(err => {
                    hideLoading();
                    alert("❌ Gagal menyimpan: " + err.message);
                });
            }
        } else {
            hideLoading();
            alert("❌ Akun pelatih tidak ditemukan!");
        }
    }).catch(err => {
        hideLoading();
        alert("❌ Koneksi terhambat: " + err.message);
    });
}

// Admin ACC Penarikan Tunai SAT SET
function accPenarikanSatSet(keyPenarikan, statusTarget) {
    if (confirm(`Apakah Anda yakin ingin memproses pengajuan pencairan ini menjadi: ${statusTarget.toUpperCase()}?`)) {
        showLoading(`Memproses ACC Status (${statusTarget.toUpperCase()})...`, 10);
        db.ref(`keuangan/penarikan/${keyPenarikan}`).update({
            status: statusTarget,
            processedAt: new Date().toISOString()
        }).then(() => {
            hideLoading();
            alert(`⚡ BERHASIL SAT SET! Status pencairan telah diperbarui menjadi ${statusTarget.toUpperCase()}.`);
        }).catch(err => {
            hideLoading();
            alert("❌ Gagal memproses: " + err.message);
        });
    }
}

// Admin Hapus Kehadiran
function hapusKehadiranAdmin(keyKehadiran) {
    if (confirm("Hapus data kehadiran ini? Honor terkait akan dikurangi secara otomatis.")) {
        showLoading("Menghapus Data Kehadiran...", 10);
        db.ref(`keuangan/kehadiran/${keyKehadiran}`).remove().then(() => {
            hideLoading();
            alert("✅ Data kehadiran berhasil dihapus.");
        }).catch(err => {
            hideLoading();
            alert("❌ Gagal menghapus: " + err.message);
        });
    }
}

// Admin Simpan / Atur Tanggal Pencairan Honor Pelatih
function adminSimpanTanggalCair(tglBaru) {
    showLoading("Menyimpan Tanggal Cair...", 10);
    db.ref(`keuangan/config/tglCair`).set(tglBaru).then(() => {
        hideLoading();
        alert(tglBaru ? `✅ Berhasil mengatur jadwal pencairan honor pada tanggal: ${formatTanggalIndo(tglBaru)}` : `✅ Jadwal pencairan dikosongkan (pencairan dibuka setiap hari).`);
    }).catch(err => {
        hideLoading();
        alert("❌ Gagal menyimpan jadwal pencairan: " + err.message);
    });
}

// Admin Nonaktifkan / Aktifkan Akun Pelatih
function adminToggleStatusPelatih(noHp, statusTarget) {
    const statusTxt = statusTarget === "disabled" ? "NONAKTIFKAN" : "AKTIFKAN";
    if (confirm(`Apakah Anda yakin ingin me-${statusTxt} akun pelatih (${noHp})?`)) {
        showLoading(`Memproses Status Akun (${statusTxt})...`, 10);
        db.ref(`keuangan/pelatih/${noHp}`).update({
            statusAccount: statusTarget
        }).then(() => {
            hideLoading();
            alert(`✅ Akun pelatih berhasil di-${statusTxt}kan!`);
        }).catch(err => {
            hideLoading();
            alert("❌ Gagal memproses: " + err.message);
        });
    }
}

// Admin Toggle Hide Dana Per Akun Pelatih
function adminToggleHideDanaPelatih(noHp, hideTarget) {
    const actionTxt = hideTarget ? "SEMBUNYIKAN" : "TAMPILKAN";
    if (confirm(`Apakah Anda yakin ingin me-${actionTxt} semua data saldo & nominal honor pada akun pelatih (${noHp})?`)) {
        showLoading(`Memproses Status Hide Dana (${actionTxt})...`, 10);
        db.ref(`keuangan/pelatih/${noHp}`).update({
            hideDana: hideTarget
        }).then(() => {
            hideLoading();
            alert(`✅ Data saldo & honor akun pelatih (${noHp}) berhasil di-${actionTxt}kan! Pelatih tetap bisa login tetapi nominal uang disembunyikan.`);
        }).catch(err => {
            hideLoading();
            alert("❌ Gagal memproses: " + err.message);
        });
    }
}

// Admin Toggle Hide Dana Global (Semua Akun)
function adminToggleHideDanaGlobal() {
    db.ref(`keuangan/config/hideDanaGlobal`).once('value', snapshot => {
        const current = snapshot.val() === true;
        const target = !current;
        const msg = target 
            ? "⚠️ SEMBUNYIKAN SEMUA DANA:\nApakah Anda yakin ingin SEMBUNYIKAN nominal saldo & honor pada SEMUA AKUN PELATIH?"
            : "✅ TAMPILKAN SEMUA DANA:\nApakah Anda yakin ingin MENAMPILKAN KEMBALI nominal saldo & honor pada semua akun pelatih?";
        
        if (confirm(msg)) {
            showLoading("Memproses Global Hide Dana...", 10);
            db.ref(`keuangan/config/hideDanaGlobal`).set(target).then(() => {
                hideLoading();
                alert(target ? "🙈 Berhasil! Semua nominal saldo & honor di seluruh akun pelatih telah disembunyikan." : "👁️ Berhasil! Nominal saldo & honor diseluruh akun pelatih kembali ditampilkan.");
            }).catch(err => {
                hideLoading();
                alert("❌ Gagal memproses: " + err.message);
            });
        }
    });
}

// Admin Hapus Permanen Akun Pelatih (Single)
function adminHapusPelatih(noHp, namaPelatih) {
    if (confirm(`⚠️ WARN (Verifikasi 1): Apakah Anda yakin ingin MENGHAPUS PERMANEN akun pelatih Coach ${namaPelatih} (${noHp})?`)) {
        const check = prompt(`⚠️ VERIFIKASI 2/2 KEAMANAN:\nKetik 'HAPUS' (huruf besar semua) untuk menghapus akun Coach ${namaPelatih} secara permanen:`);
        if (check === "HAPUS") {
            showLoading(`Menghapus Akun Coach ${namaPelatih}...`, 10);
            db.ref(`keuangan/pelatih/${noHp}`).remove().then(() => {
                hideLoading();
                alert(`✅ Akun Coach ${namaPelatih} berhasil dihapus permanen.`);
            }).catch(err => {
                hideLoading();
                alert("❌ Gagal menghapus: " + err.message);
            });
        } else {
            alert("❌ Verifikasi kedua gagal. Penghapusan dibatalkan.");
        }
    }
}

// ==========================================
// BATCH SELECT ALL & DELETE LOGIC (VERIFIKASI 2X)
// ==========================================

// 1. Rekap Kehadiran
function toggleSelectAllKehadiran(masterCb) {
    const cbs = document.querySelectorAll(".cb-kehadiran");
    cbs.forEach(cb => cb.checked = masterCb.checked);
    updateSelectedKehadiranCount();
}

function updateSelectedKehadiranCount() {
    const selected = document.querySelectorAll(".cb-kehadiran:checked");
    const master = document.getElementById("selectAllKehadiran");
    const allCbs = document.querySelectorAll(".cb-kehadiran");
    if (master && allCbs.length > 0) {
        master.checked = (selected.length === allCbs.length);
    }
    const btnHapus = document.getElementById("btnHapusMassalKehadiran");
    const countSpan = document.getElementById("countSelectedKehadiran");
    if (btnHapus && countSpan) {
        countSpan.innerText = selected.length;
        btnHapus.style.display = selected.length > 0 ? "inline-flex" : "none";
    }
}

function adminHapusMassalKehadiran() {
    const selected = document.querySelectorAll(".cb-kehadiran:checked");
    if (selected.length === 0) {
        alert("❌ Pilih minimal 1 data rekap kehadiran yang ingin dihapus!");
        return;
    }

    const count = selected.length;
    // VERIFIKASI 1/2
    if (confirm(`⚠️ [VERIFIKASI 1/2] Apakah Anda YAKIN ingin menghapus ${count} data rekap kehadiran yang dicentang secara permanen?`)) {
        // VERIFIKASI 2/2
        const check = prompt(`🚨 [VERIFIKASI 2/2 - VERIFIKASI GANDA]\nPenghapusan ini TIDAK BISA DIBATALKAN!\n\nKetik tulisan 'HAPUS' (huruf besar semua) untuk memproses hapus permanen ${count} data kehadiran:`);
        
        if (check === "HAPUS") {
            showLoading(`Menghapus ${count} Data Kehadiran...`, 10);
            let updates = {};
            selected.forEach(cb => {
                updates[`keuangan/kehadiran/${cb.value}`] = null;
            });
            db.ref().update(updates).then(() => {
                hideLoading();
                alert(`✅ VERIFIKASI BERHASIL! ${count} data rekap kehadiran berhasil dihapus permanen dari database.`);
            }).catch(err => {
                hideLoading();
                alert("❌ Gagal menghapus data: " + err.message);
            });
        } else {
            alert("❌ Verifikasi 2 gagal / dibatalkan. Data aman dan tidak ada yang dihapus.");
        }
    }
}

// 2. Master Pelatih
function toggleSelectAllPelatih(masterCb) {
    const cbs = document.querySelectorAll(".cb-pelatih");
    cbs.forEach(cb => cb.checked = masterCb.checked);
    updateSelectedPelatihCount();
}

function updateSelectedPelatihCount() {
    const selected = document.querySelectorAll(".cb-pelatih:checked");
    const master = document.getElementById("selectAllPelatih");
    const allCbs = document.querySelectorAll(".cb-pelatih");
    if (master && allCbs.length > 0) {
        master.checked = (selected.length === allCbs.length);
    }
    const btnHapus = document.getElementById("btnHapusMassalPelatih");
    const countSpan = document.getElementById("countSelectedPelatih");
    if (btnHapus && countSpan) {
        countSpan.innerText = selected.length;
        btnHapus.style.display = selected.length > 0 ? "inline-flex" : "none";
    }
}

function adminHapusMassalPelatih() {
    const selected = document.querySelectorAll(".cb-pelatih:checked");
    if (selected.length === 0) {
        alert("❌ Pilih minimal 1 akun pelatih yang ingin dihapus!");
        return;
    }

    const count = selected.length;
    // VERIFIKASI 1/2
    if (confirm(`⚠️ [VERIFIKASI 1/2] Apakah Anda YAKIN ingin menghapus PERMANEN ${count} akun pelatih yang dicentang?`)) {
        // VERIFIKASI 2/2
        const check = prompt(`🚨 [VERIFIKASI 2/2 - VERIFIKASI GANDA]\nHapus akun pelatih secara permanen!\n\nKetik tulisan 'HAPUS' (huruf besar semua) untuk memproses ${count} akun pelatih:`);
        
        if (check === "HAPUS") {
            showLoading(`Menghapus ${count} Akun Pelatih...`, 10);
            let updates = {};
            selected.forEach(cb => {
                updates[`keuangan/pelatih/${cb.value}`] = null;
            });
            db.ref().update(updates).then(() => {
                hideLoading();
                alert(`✅ VERIFIKASI BERHASIL! ${count} akun pelatih berhasil dihapus permanen.`);
            }).catch(err => {
                hideLoading();
                alert("❌ Gagal menghapus akun: " + err.message);
            });
        } else {
            alert("❌ Verifikasi 2 gagal / dibatalkan. Akun pelatih aman.");
        }
    }
}

// 3. Rekap Penarikan Dana
function toggleSelectAllPenarikan(masterCb) {
    const cbs = document.querySelectorAll(".cb-penarikan");
    cbs.forEach(cb => cb.checked = masterCb.checked);
    updateSelectedPenarikanCount();
}

function updateSelectedPenarikanCount() {
    const selected = document.querySelectorAll(".cb-penarikan:checked");
    const master = document.getElementById("selectAllPenarikan");
    const allCbs = document.querySelectorAll(".cb-penarikan");
    if (master && allCbs.length > 0) {
        master.checked = (selected.length === allCbs.length);
    }
    const btnHapus = document.getElementById("btnHapusMassalPenarikan");
    const countSpan = document.getElementById("countSelectedPenarikan");
    if (btnHapus && countSpan) {
        countSpan.innerText = selected.length;
        btnHapus.style.display = selected.length > 0 ? "inline-flex" : "none";
    }
}

function adminHapusMassalPenarikan() {
    const selected = document.querySelectorAll(".cb-penarikan:checked");
    if (selected.length === 0) {
        alert("❌ Pilih minimal 1 rekap pengajuan penarikan yang ingin dihapus!");
        return;
    }

    const count = selected.length;
    // VERIFIKASI 1/2
    if (confirm(`⚠️ [VERIFIKASI 1/2] Apakah Anda YAKIN ingin menghapus ${count} riwayat pengajuan penarikan dana yang dicentang?`)) {
        // VERIFIKASI 2/2
        const check = prompt(`🚨 [VERIFIKASI 2/2 - VERIFIKASI GANDA]\nKetik tulisan 'HAPUS' (huruf besar semua) untuk menghapus permanen ${count} data riwayat penarikan:`);
        
        if (check === "HAPUS") {
            showLoading(`Menghapus ${count} Riwayat Penarikan...`, 10);
            let updates = {};
            selected.forEach(cb => {
                updates[`keuangan/penarikan/${cb.value}`] = null;
            });
            db.ref().update(updates).then(() => {
                hideLoading();
                alert(`✅ VERIFIKASI BERHASIL! ${count} data riwayat penarikan berhasil dihapus permanen.`);
            }).catch(err => {
                hideLoading();
                alert("❌ Gagal menghapus data penarikan: " + err.message);
            });
        } else {
            alert("❌ Verifikasi 2 gagal / dibatalkan. Data riwayat penarikan aman.");
        }
    }
}

// ==========================================
// PREVIEW FOTO PROFIL ADMIN LIGHTBOX MODAL
// ==========================================
function previewFotoPelatihAdmin(fotoUrl, namaPelatih) {
    if (!document.getElementById("modalPreviewFotoAdmin")) {
        const div = document.createElement("div");
        div.id = "modalPreviewFotoAdmin";
        div.className = "modal-backdrop";
        div.innerHTML = `
            <div class="modal-box" style="text-align:center; max-width:400px;">
                <div class="modal-header">
                    <h3 id="previewFotoTitle"><i class="fa-solid fa-id-badge" style="color:var(--primary);"></i> Foto Profil Pelatih</h3>
                    <button class="btn-close-modal" onclick="closePreviewFotoAdmin()">&times;</button>
                </div>
                <div style="margin: 16px 0;">
                    <img id="previewFotoImg" src="" style="width:100%; max-height:350px; border-radius:14px; object-fit:cover; border:2px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                </div>
                <button class="btn-submit-form" style="background:rgba(255,255,255,0.1); color:#fff;" onclick="closePreviewFotoAdmin()">Tutup Preview</button>
            </div>
        `;
        document.body.appendChild(div);
    }
    document.getElementById("previewFotoTitle").innerHTML = `<i class="fa-solid fa-id-badge" style="color:var(--primary);"></i> Coach ${namaPelatih}`;
    document.getElementById("previewFotoImg").src = fotoUrl;
    document.getElementById("modalPreviewFotoAdmin").classList.add("active");
}

function closePreviewFotoAdmin() {
    const modal = document.getElementById("modalPreviewFotoAdmin");
    if (modal) modal.classList.remove("active");
}
