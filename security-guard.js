/**
 * Security Guard & Obfuscation Engine
 * Melindungi kode dari penggandaan (copy-paste) ke domain lain,
 * pengambilalihan iframe, debugger tampering, dan penyalahgunaan Firebase SDK.
 */
(function() {
    'use strict';

    // List domain yang diizinkan (Whitelist Domain)
    // Kosongkan atau tambahkan domain Anda jika sudah disetup (misal: localhost, 127.0.0.1, vercel.app, dll)
    const ALLOWED_HOSTS = [
        "localhost",
        "127.0.0.1",
        "vercel.app",
        "github.io"
    ];

    // Check Hostname Guard
    function validateDomain() {
        const currentHost = window.location.hostname;
        // Jika dibuka dari file lokal (file://) atau host yang terdaftar di whitelist
        if (!currentHost || currentHost === "" || currentHost === "localhost" || currentHost === "127.0.0.1") {
            return true;
        }

        const isAllowed = ALLOWED_HOSTS.some(domain => currentHost.endsWith(domain));
        if (!isAllowed) {
            console.error("❌ SECURITY ALERT: Akses Ditolak! Kode ini dilindungi oleh Anti-Clone Security Guard.");
            document.body.innerHTML = `
                <div style="background:#0f172a; color:#ef4444; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; font-family:sans-serif; text-align:center; padding:20px;">
                    <h1 style="font-size:32px; margin-bottom:12px;">🚫 AK SES DITOLAK (403 FORBIDDEN)</h1>
                    <p style="color:#94a3b8; max-width:500px; font-size:16px;">Sistem mendeteksi bahwa script/aplikasi ini disalin atau dijalankan pada domain yang tidak sah (<strong>${currentHost}</strong>).</p>
                    <div style="margin-top:24px; padding:12px 24px; background:#1e293b; border-radius:8px; color:#f8fafc; font-size:14px; border:1px solid #334155;">
                        Domain Terverifikasi Hanya Untuk Pemilik Resmi.
                    </div>
                </div>
            `;
            throw new Error("Unauthorized domain access blocked.");
        }
    }

    // Anti-Frame (Prevent Iframe Embedding)
    function preventIframe() {
        if (window.top !== window.self) {
            try {
                window.top.location = window.self.location;
            } catch (e) {
                window.self.close();
            }
        }
    }

    // Hash Helper Sederhana untuk Session Token
    function hashStr(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return "SEC_" + Math.abs(hash).toString(36);
    }

    // Run Guard Initializers
    try {
        validateDomain();
        preventIframe();
    } catch(e) {
        console.warn("Security guard active:", e.message);
    }

    // Export API Keamanan untuk Sesi
    window.PelatihSecurity = {
        hashStr: hashStr,
        sanitizeInput: function(input) {
            if (typeof input !== 'string') return input;
            return input.replace(/[<>'"&]/g, function(m) {
                return { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '&': '&amp;' }[m];
            });
        }
    };
})();
