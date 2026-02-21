// --- DATABASE LAYANAN (LOCAL) ---
const services = [
    { id: 0, name: "Cuci Komplit", price: 7000, unit: "kg" },
    { id: 1, name: "Setrika Saja", price: 4000, unit: "kg" },
    { id: 2, name: "Bed Cover", price: 25000, unit: "pcs" },
    { id: 3, name: "Express Cuci Komplit", price: 10000, unit: "kg" },
    { id: 4, name: "Express Setrika", price: 7000, unit: "kg" }
];

// --- KONFIGURASI SUPABASE ---
// CATATAN DEV: Menggunakan Legacy anon public key (JWT) yang valid untuk otorisasi database frontend
const SUPABASE_URL = 'https://qgezrmiuwkmwfglblqet.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZXpybWl1d2ttd2ZnbGJscWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDk5NzAsImV4cCI6MjA4NzE4NTk3MH0.qxd3eTWFfQC6QEl56xzvJFHcmAO7gqsx17cEaCTkkRg';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- KONSTANTA LOKAL STORAGE ---
const LS_ORDERS_KEY = 'ziedan_local_orders';
const LS_PENDING_KEY = 'ziedan_pending_orders';

// --- STATE MANAGEMENT ---
let state = {
    selectedServiceIds: [], 
    quantities: {}, 
    total: 0
};
let allOrders = [];
let currentOrderId = null;

// --- HELPER FUNGSI TANGGAL (BARU) ---
// Memastikan tampilan di layar tetap format Indonesia, meskipun di DB disimpen standar ISO
function formatTanggalLokal(isoString) {
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString; // Fallback jika data lama bukan ISO
        return d.toLocaleString('id-ID');
    } catch (e) {
        return isoString;
    }
}

// --- FIX: HELPER BACA & TULIS LOKAL STORAGE ---
function getLocalOrders() {
    try {
        const raw = localStorage.getItem(LS_ORDERS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveLocalOrders(orders) {
    try {
        localStorage.setItem(LS_ORDERS_KEY, JSON.stringify(orders));
    } catch (e) {
        console.warn("Gagal menyimpan ke localStorage:", e);
    }
}

function getPendingOrders() {
    try {
        const raw = localStorage.getItem(LS_PENDING_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function savePendingOrders(orders) {
    try {
        localStorage.setItem(LS_PENDING_KEY, JSON.stringify(orders));
    } catch (e) {
        console.warn("Gagal menyimpan pending orders:", e);
    }
}

// --- FIX: SINKRONISASI PENDING ORDERS KE SUPABASE ---
// Dipanggil saat aplikasi online, mencoba upload ulang data yang gagal sebelumnya
async function syncPendingOrders() {
    const pending = getPendingOrders();
    if (pending.length === 0) return;

    console.log(`Mencoba sync ${pending.length} pesanan pending ke server...`);
    const stillPending = [];

    for (const order of pending) {
        try {
            // Pastikan items terformat JSON string saat upload
            const orderToUpload = {
                ...order,
                items: typeof order.items === 'string' ? order.items : JSON.stringify(order.items)
            };
            // Hapus field lokal sebelum upload
            delete orderToUpload._localId;
            delete orderToUpload._isPending;

            const { error } = await supabaseClient.from('orders').insert([orderToUpload]).select();
            if (error) {
                console.warn("Gagal sync pending order:", error.message);
                stillPending.push(order);
            } else {
                console.log("Pending order berhasil di-sync:", order.customer);
            }
        } catch (e) {
            stillPending.push(order);
        }
    }

    savePendingOrders(stillPending);

    if (stillPending.length < pending.length) {
        // Ada yang berhasil di-sync, refresh data
        fetchOrders();
    }
}

// --- FUNGSI FETCH DATA DARI SUPABASE ---
async function fetchOrders() {
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*')
            .order('id', { ascending: false });
        
        if (error) {
            console.error("Error fetching orders:", error);
            // FIX: Fallback ke data lokal jika server gagal
            const localOrders = getLocalOrders();
            const pendingOrders = getPendingOrders();
            // Gabungkan: pending (belum ter-upload) + local cache dari server
            const merged = [...pendingOrders.map(o => ({...o, _isPending: true})), ...localOrders];
            // Deduplicate berdasarkan _localId atau id
            allOrders = merged;
            
            if (!document.getElementById('view-orders').classList.contains('hidden')) {
                renderOrderList();
            }
            if (document.getElementById('view-kredit') && !document.getElementById('view-kredit').classList.contains('hidden')) {
                renderKreditList();
            }
            return;
        }

        allOrders = data || [];
        
        // FIX: Cache data server ke localStorage sebagai backup
        saveLocalOrders(allOrders);
        
        // Update UI jika sedang berada di halaman yang relevan
        if (!document.getElementById('view-orders').classList.contains('hidden')) {
            renderOrderList();
        }
        if (document.getElementById('view-kredit') && !document.getElementById('view-kredit').classList.contains('hidden')) {
            renderKreditList();
        }
    } catch (err) {
        console.error("Network error saat mengambil data:", err);
        // FIX: Fallback ke data lokal cache jika network error
        const localOrders = getLocalOrders();
        const pendingOrders = getPendingOrders();
        allOrders = [...pendingOrders.map(o => ({...o, _isPending: true})), ...localOrders];
        
        if (!document.getElementById('view-orders').classList.contains('hidden')) {
            renderOrderList();
        }
        if (document.getElementById('view-kredit') && !document.getElementById('view-kredit').classList.contains('hidden')) {
            renderKreditList();
        }
    }
}

// --- FUNGSI NAVIGASI HEADER ---
function toggleMenu() {
    const menu = document.getElementById('menu-overlay');
    const btn = document.getElementById('menu-btn');
    if (menu && btn) {
        menu.classList.toggle('hidden');
        if (!menu.classList.contains('hidden')) {
            menu.style.display = 'flex';
        } else {
            setTimeout(() => { menu.style.display = ''; }, 300); 
        }
        btn.classList.toggle('active');
    }
}

function navTo(page) {
    if (page === 'home') { backToHome(); } 
    else if (page === 'orders') { switchToOrders(); renderOrderList(); } 
    else if (page === 'kredit') { switchToKredit(); }
    toggleMenu(); 
}

// --- FUNGSI UTAMA ---
function initApp() {
    services.forEach(srv => {
        const input = document.getElementById(`input-${srv.id}`);
        if(input) input.value = 1;
        state.quantities[srv.id] = 1;
    });
    hitungTotal();
    fetchOrders(); // Load data dari database saat aplikasi dibuka
    
    // FIX: Coba sync pending orders setelah app init
    setTimeout(() => syncPendingOrders(), 2000);
}

function toggleService(index) {
    const serviceIndex = state.selectedServiceIds.indexOf(index);
    const inputArea = document.getElementById(`input-area-${index}`);
    const inputField = document.getElementById(`input-${index}`);

    if (serviceIndex > -1) {
        state.selectedServiceIds.splice(serviceIndex, 1);
        if (inputArea) inputArea.classList.add('hidden');
    } else {
        state.selectedServiceIds.push(index);
        if (inputArea) inputArea.classList.remove('hidden');
        if (!state.quantities[index] || state.quantities[index] === 0) {
            state.quantities[index] = 1;
            if (inputField) inputField.value = 1;
        }
    }
    updateServiceUI();
    hitungTotal();
}

function updateServiceUI() {
    services.forEach((srv, idx) => {
        const card = document.getElementById(`srv-${idx}`);
        const checkIcon = card?.querySelector('.check-icon');
        if (!card) return;
        if (state.selectedServiceIds.includes(idx)) {
            card.classList.remove('border-white', 'shadow-sm');
            card.classList.add('border-brand-500', 'bg-brand-100', 'shadow-md', 'ring-1', 'ring-brand-500');
            if(checkIcon) {
                checkIcon.classList.remove('opacity-0', 'scale-50');
                checkIcon.classList.add('opacity-100', 'scale-100');
            }
        } else {
            card.classList.add('border-white', 'shadow-sm');
            card.classList.remove('border-brand-500', 'bg-brand-100', 'shadow-md', 'ring-1', 'ring-brand-500');
            if(checkIcon) {
                checkIcon.classList.add('opacity-0', 'scale-50');
                checkIcon.classList.remove('opacity-100', 'scale-100');
            }
        }
    });
}

function updateQty(id, value) {
    let val = parseFloat(value);
    if (isNaN(val) || val < 0) val = 0;
    state.quantities[id] = val;
    hitungTotal();
}

function hitungTotal() {
    state.total = 0;
    state.selectedServiceIds.forEach(id => {
        const service = services.find(s => s.id === id);
        if (service) {
            const qty = state.quantities[id] || 0;
            state.total += (qty * service.price);
        }
    });
    state.total = Math.ceil(state.total);
    const totalEl = document.getElementById('txtTotal');
    if(totalEl) totalEl.innerText = formatRupiah(state.total);
}

function formatRupiah(angka) {
    return "Rp " + angka.toLocaleString('id-ID');
}
// --- FIX UTAMA: SIMPAN KE SUPABASE + FALLBACK LOKAL ---
async function prosesPesanan() {
    const nama = document.getElementById('custName').value.trim();
    const wa = document.getElementById('custWa').value.trim();
    
    if (!nama) {
        shakeElement('custName');
        alert("Nama Pelanggan wajib diisi!");
        return;
    }
    if (state.selectedServiceIds.length === 0) {
        alert("Pilih minimal satu layanan!");
        return;
    }
    
    // Loading UI
    const btnSimpan = document.querySelector('#footer-total button');
    const originalText = btnSimpan.innerHTML;
    btnSimpan.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i><span>MENYIMPAN...</span>';
    btnSimpan.disabled = true;

    // FIX 1: Susun items sebagai array JS — supabase-js v2 handles serialisasi otomatis ke jsonb
    const itemsArray = state.selectedServiceIds.map(id => {
        const srv = services.find(s => s.id === id);
        return { name: srv.name, qty: state.quantities[id], unit: srv.unit, price: srv.price };
    });

    const newOrder = {
        customer: nama,
        whatsapp: wa || null,
        date: new Date().toISOString(),
        payment: 'cash',
        status: 'baru', 
        items: itemsArray,
        total: state.total
    };

    // FIX 2: Coba insert ke Supabase dulu
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .insert([newOrder])
            .select();

        if (error) {
            // FIX 3: Pesan error lebih informatif dengan hint solusi
            let errorMsg = error.message || error.details || JSON.stringify(error);
            let hint = '';

            if (error.code === '42501' || (errorMsg && errorMsg.toLowerCase().includes('row-level security'))) {
                hint = '\n\n💡 SOLUSI: Aktifkan INSERT policy untuk role "anon" di Supabase Dashboard → Authentication → Policies → tabel "orders".';
            } else if (error.code === 'PGRST116' || (errorMsg && errorMsg.toLowerCase().includes('not found'))) {
                hint = '\n\n💡 SOLUSI: Tabel "orders" tidak ditemukan. Pastikan tabel sudah dibuat di Supabase.';
            } else if (errorMsg && errorMsg.toLowerCase().includes('invalid input syntax')) {
                hint = '\n\n💡 SOLUSI: Tipe kolom "items" di database harus diset ke "jsonb".';
            }

            console.error("Insert error detail:", error);

            // FIX 4: Simpan lokal sebagai fallback jika server gagal
            const localId = 'local_' + Date.now();
            const localOrder = {
                ...newOrder,
                id: localId,
                _localId: localId,
                _isPending: true,
                items: itemsArray
            };

            const pending = getPendingOrders();
            pending.unshift(localOrder);
            savePendingOrders(pending);

            allOrders.unshift(localOrder);
            saveLocalOrders(allOrders);

            switchToOrders();
            resetForm();

            alert(
                "⚠️ GAGAL MENYIMPAN KE SERVER!\n\n" +
                "Pesanan disimpan sementara di perangkat ini dan akan otomatis di-upload saat server kembali normal.\n\n" +
                "Detail Error:\n" + errorMsg + hint
            );

        } else {
            // Optimistic UI Update
            if (data && data.length > 0) {
                allOrders.unshift(data[0]);
                saveLocalOrders(allOrders);
            }
            
            switchToOrders(); 
            resetForm();
            fetchOrders(); 
        }
    } catch (err) {
        // FIX 5: Network error — simpan lokal + tampilkan pesan jelas
        console.error("Network/System error saat insert:", err);

        const localId = 'local_' + Date.now();
        const localOrder = {
            ...newOrder,
            id: localId,
            _localId: localId,
            _isPending: true,
            items: itemsArray
        };

        const pending = getPendingOrders();
        pending.unshift(localOrder);
        savePendingOrders(pending);

        allOrders.unshift(localOrder);
        saveLocalOrders(allOrders);

        switchToOrders();
        resetForm();

        alert(
            "📶 TIDAK DAPAT TERHUBUNG KE SERVER!\n\n" +
            "Pesanan disimpan sementara di perangkat ini.\n" +
            "Akan otomatis di-upload ke server saat koneksi pulih.\n\n" +
            "Pastikan:\n" +
            "• Koneksi internet aktif\n" +
            "• Proyek Supabase tidak dalam status pause (cek di dashboard)"
        );
    } finally {
        btnSimpan.innerHTML = originalText;
        btnSimpan.disabled = false;
    }
}

function switchToOrders() {
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-orders').classList.remove('hidden');
    document.getElementById('view-order-detail').classList.add('hidden'); 
    document.getElementById('view-kredit')?.classList.add('hidden'); 
    document.getElementById('view-kredit-detail')?.classList.add('hidden');
    const footer = document.getElementById('footer-total');
    if(footer) footer.classList.add('translate-y-full', 'opacity-0');
    
    renderOrderList(); 
}

function backToHome() {
    document.getElementById('view-orders').classList.add('hidden');
    document.getElementById('view-order-detail').classList.add('hidden');
    document.getElementById('view-kredit')?.classList.add('hidden'); 
    document.getElementById('view-kredit-detail')?.classList.add('hidden');
    document.getElementById('view-home').classList.remove('hidden');
    const footer = document.getElementById('footer-total');
    if(footer) footer.classList.remove('translate-y-full', 'opacity-0');
}

function switchToKredit() {
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-orders').classList.add('hidden');
    document.getElementById('view-order-detail').classList.add('hidden');
    document.getElementById('view-kredit-detail')?.classList.add('hidden');
    document.getElementById('view-kredit').classList.remove('hidden');
    const footer = document.getElementById('footer-total');
    if(footer) footer.classList.add('translate-y-full', 'opacity-0');
    
    renderKreditList(); 
}

// --- FUNGSI HAPUS PESANAN (BARU) ---
async function hapusPesanan(id, event) {
    // Stop event bubbling agar tidak membuka halaman detail
    if (event) {
        event.stopPropagation();
    }

    const konfirmasi = confirm("Apakah Anda yakin ingin menghapus pesanan ini? Data yang dihapus tidak bisa dikembalikan.");
    if (!konfirmasi) return;

    const orderIndex = allOrders.findIndex(o => o.id == id);
    if (orderIndex === -1) return;

    const targetOrder = allOrders[orderIndex];

    // 1. Hapus secara optimistik dari state lokal
    allOrders.splice(orderIndex, 1);
    saveLocalOrders(allOrders);

    // Render ulang segera agar UI responsif
    renderOrderList();
    if (!document.getElementById('view-kredit').classList.contains('hidden')) {
        renderKreditList();
    }

    // 2. Hapus dari sumber aslinya (Local Pending ATAU Supabase Server)
    if (targetOrder._isPending) {
        // Hapus dari data yang menunggu sinkronisasi
        let pending = getPendingOrders();
        pending = pending.filter(o => o.id != id);
        savePendingOrders(pending);
    } else {
        // Hapus dari database Supabase
        try {
            const { error } = await supabaseClient
                .from('orders')
                .delete()
                .eq('id', targetOrder.id);
                
            if (error) {
                console.error("Gagal menghapus pesanan dari server:", error);
                alert("Terjadi kesalahan saat menghapus data di server.");
                // Jika mau revert data, panggil fetchOrders() lagi
                fetchOrders();
            }
        } catch (err) {
            console.error("Error jaringan saat menghapus:", err);
            alert("Gagal terhubung ke server untuk menghapus data.");
            fetchOrders(); // Sinkronkan kembali jika gagal
        }
    }
}
// --- RENDER ORDER LIST (DIPERBARUI) ---
function renderOrderList() {
    const container = document.getElementById('order-list');
    if (allOrders.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-40">
                <i class="fas fa-inbox text-4xl mb-3 text-brand-500"></i>
                <p class="text-xs font-bold text-brand-900">Belum ada data pesanan</p>
            </div>
        `;
        return;
    }
    container.innerHTML = allOrders.map((order, index) => {
        // items bisa berupa string JSON (dari DB lama) atau array (dari state lokal)
        const itemsArray = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
        let summaryService = itemsArray.length > 0 ? itemsArray[0].name : 'Layanan';
        if (itemsArray.length > 1) {
            summaryService += ` (+${itemsArray.length - 1})`;
        }

        // Badge orange jika pesanan pending lokal, merah jika kredit
        let pendingBadge = order._isPending
            ? '<span class="w-2 h-2 rounded-full bg-orange-400 absolute top-2 right-2 shadow-sm" title="Menunggu upload ke server"></span>'
            : (order.payment === 'kredit' ? '<span class="w-2 h-2 rounded-full bg-red-400 absolute top-2 right-2 shadow-sm"></span>' : '');

        let statusColor = "bg-yellow-50 text-yellow-600 border-yellow-100";
        let statusText = "PROSES";
        
        if (order.status === 'selesai') {
            if (order.payment === 'cash') {
                statusColor = "bg-green-50 text-green-600 border-green-100";
                statusText = "SELESAI CASH";
            } else {
                statusColor = "bg-red-50 text-red-600 border-red-100";
                statusText = "SELESAI KREDIT";
            }
        } else if (order.status === 'baru') {
            statusColor = "bg-blue-50 text-blue-500 border-blue-100";
            statusText = order._isPending ? "PENDING UPLOAD" : "BARU";
        }

        // Gunakan string ID untuk onclick agar kompatibel dengan localId (string) dan DB id (number)
        const idAttr = typeof order.id === 'string' ? `'${order.id}'` : order.id;

        // UPDATE: Perubahan Grid dan Posisi Status
        return `
        <div class="bg-white rounded-xl px-4 py-3 shadow-sm border ${order._isPending ? 'border-orange-200' : 'border-brand-100'} mb-2 hover:bg-brand-50 transition-colors cursor-pointer relative" onclick="openOrderDetail(${idAttr})">
            ${pendingBadge}
            <div class="grid grid-cols-[25px_1fr_auto_1fr_30px] gap-2 items-center">
                <span class="text-xs font-bold text-gray-400">${index + 1}</span>
                
                <div class="flex flex-col items-start justify-center min-w-0 text-left pr-2">
                    <span class="text-xs font-bold text-brand-900 truncate w-full">${order.customer}</span>
                    <span class="text-[10px] text-gray-500 truncate w-full mt-0.5">${summaryService}</span>
                </div>
                
                <div class="flex items-center justify-center">
                    <span class="text-[8px] font-bold border px-1.5 py-0.5 rounded-full inline-block whitespace-nowrap ${statusColor}">${statusText}</span>
                </div>
                
                <div class="flex items-center justify-end text-right">
                    <span class="text-xs font-extrabold text-brand-600">${formatRupiah(order.total)}</span>
                </div>
                
                <button onclick="hapusPesanan(${idAttr}, event)" class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all ml-auto focus:outline-none" title="Hapus Pesanan">
                    <i class="fas fa-trash-alt text-xs pointer-events-none"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

function openOrderDetail(id) {
    // FIX: Cari order dengan == agar kompatibel string & number id
    const order = allOrders.find(o => o.id == id);
    if (!order) return;
    currentOrderId = order.id;

    // FIX: items bisa berupa string JSON atau array
    const itemsArray = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);

    const detailName = document.getElementById('detail-name');
    const detailWa = document.getElementById('detail-wa');
    const detailDate = document.getElementById('detail-date');
    const detailTotal = document.getElementById('detail-total');
    const detailItems = document.getElementById('detail-items');

    if(detailName) detailName.innerText = order.customer;
    if(detailWa) detailWa.innerText = order.whatsapp ? order.whatsapp : '-';
    if(detailDate) detailDate.innerText = formatTanggalLokal(order.date);
    if(detailTotal) detailTotal.innerText = formatRupiah(order.total);

    if(detailItems) {
        detailItems.innerHTML = itemsArray.map(item => `
            <div class="flex justify-between items-center text-sm text-gray-700 border-b border-gray-100 last:border-0 py-3">
                <div class="flex flex-col">
                    <span class="font-bold text-brand-900">${item.name}</span>
                    <span class="text-xs text-gray-500">@ ${formatRupiah(item.price || 0)}</span>
                </div>
                <span class="font-extrabold bg-brand-50 text-brand-900 px-3 py-1.5 rounded-lg border border-brand-100">${item.qty} ${item.unit}</span>
            </div>
        `).join('');
    }

    const ticketName = document.getElementById('ticket-name');
    const ticketWa = document.getElementById('ticket-wa');
    const ticketDate = document.getElementById('ticket-date');
    const ticketTotal = document.getElementById('ticket-total');
    const ticketItems = document.getElementById('ticket-items');

    if(ticketName) ticketName.innerText = order.customer;
    if(ticketWa) ticketWa.innerText = order.whatsapp ? order.whatsapp : '-';
    if(ticketDate) ticketDate.innerText = formatTanggalLokal(order.date);
    if(ticketTotal) ticketTotal.innerText = formatRupiah(order.total);

    if(ticketItems) {
        ticketItems.innerHTML = itemsArray.map(item => `
            <div class="flex justify-between items-center text-xs text-gray-600 border-b border-gray-100 last:border-0 py-2">
                <div class="flex flex-col">
                    <span class="font-bold text-brand-900">${item.name}</span>
                    <span class="text-[10px] text-gray-500">@ ${formatRupiah(item.price || 0)}</span>
                </div>
                <span class="font-extrabold bg-brand-50 text-brand-900 px-2 py-1 rounded border border-brand-100">${item.qty} ${item.unit}</span>
            </div>
        `).join('');
    }

    refreshPaymentUI(order.payment);
    refreshStatusUI(order.status || 'proses'); 

    document.getElementById('view-orders').classList.add('hidden');
    document.getElementById('view-kredit')?.classList.add('hidden'); 
    document.getElementById('view-kredit-detail')?.classList.add('hidden');
    document.getElementById('view-order-detail').classList.remove('hidden');
}

async function updatePayment(method) {
    if (!currentOrderId) return;
    const orderIndex = allOrders.findIndex(o => o.id == currentOrderId);
    if (orderIndex > -1) {
        if (allOrders[orderIndex].status === 'proses') {
            alert("Selesaikan pesanan terlebih dahulu untuk mengubah status pembayaran.");
            return;
        }
        
        allOrders[orderIndex].payment = method;
        refreshPaymentUI(method);
        renderOrderList();

        // FIX: Jika pesanan masih pending lokal, update lokal saja
        if (allOrders[orderIndex]._isPending) {
            saveLocalOrders(allOrders);
            const pending = getPendingOrders();
            const pi = pending.findIndex(o => o.id == currentOrderId);
            if (pi > -1) { pending[pi].payment = method; savePendingOrders(pending); }
            return;
        }
        
        const { error } = await supabaseClient.from('orders').update({ payment: method }).eq('id', currentOrderId);
        if (error) console.error("Error updating payment:", error);
    }
}

function refreshPaymentUI(paymentStatus) {
    const badgeDetail = document.getElementById('payment-badge');
    const badgeTicket = document.getElementById('ticket-payment-badge');
    const btnCash = document.getElementById('btn-pay-cash');
    const btnKredit = document.getElementById('btn-pay-kredit');

    if (!btnCash || !btnKredit) return;
    const currentOrder = allOrders.find(o => o.id == currentOrderId);
    const isProses = currentOrder ? currentOrder.status === 'proses' : false;
    
    let baseBtnClassActive = "flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs transition-all shadow-md ";
    let baseBtnClassInactive = "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 font-bold text-xs transition-all ";
    let disabledStateClass = isProses ? "opacity-50 cursor-not-allowed pointer-events-none " : "active:scale-95 ";

    if (paymentStatus === 'cash') {
        const classLunas = "text-[10px] bg-green-50 text-green-600 px-2.5 py-1 rounded-lg border border-green-100 font-bold uppercase tracking-wider shadow-sm inline-block";
        if (badgeDetail) { badgeDetail.innerText = "CASH"; badgeDetail.className = classLunas; }
        if (badgeTicket) { badgeTicket.innerText = "CASH"; badgeTicket.className = classLunas; }
        btnCash.className = baseBtnClassActive + disabledStateClass + "border-green-500 bg-green-500 text-white";
        btnKredit.className = baseBtnClassInactive + disabledStateClass;
    } else {
        const classKredit = "text-[10px] bg-red-50 text-red-600 px-2.5 py-1 rounded-lg border border-red-100 font-bold uppercase tracking-wider shadow-sm inline-block";
        if (badgeDetail) { badgeDetail.innerText = "KREDIT"; badgeDetail.className = classKredit; }
        if (badgeTicket) { badgeTicket.innerText = "KREDIT"; badgeTicket.className = classKredit; }
        btnCash.className = baseBtnClassInactive + disabledStateClass;
        btnKredit.className = baseBtnClassActive + disabledStateClass + "border-red-500 bg-red-500 text-white";
    }
}
async function updateOrderStatus(status) {
    if (!currentOrderId) return;
    const orderIndex = allOrders.findIndex(o => o.id == currentOrderId);
    if (orderIndex > -1) {
        allOrders[orderIndex].status = status;
        refreshStatusUI(status);
        refreshPaymentUI(allOrders[orderIndex].payment);
        renderOrderList();

        // FIX: Jika pesanan masih pending lokal, update lokal saja
        if (allOrders[orderIndex]._isPending) {
            saveLocalOrders(allOrders);
            const pending = getPendingOrders();
            const pi = pending.findIndex(o => o.id == currentOrderId);
            if (pi > -1) { pending[pi].status = status; savePendingOrders(pending); }
            return;
        }
        
        const { error } = await supabaseClient.from('orders').update({ status: status }).eq('id', currentOrderId);
        if (error) console.error("Error updating status:", error);
    }
}

function refreshStatusUI(status) {
    const btnProses = document.getElementById('btn-status-proses');
    const btnSelesai = document.getElementById('btn-status-selesai');
    const ticketBadge = document.getElementById('ticket-status-badge');
    if (!btnProses || !btnSelesai) return;

    const classInactive = "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 font-bold text-xs transition-all active:scale-95";

    if (status === 'proses') {
        btnProses.className = "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-yellow-500 bg-yellow-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md";
        btnSelesai.className = classInactive;
        if(ticketBadge) {
            ticketBadge.innerText = "PROSES";
            ticketBadge.className = "text-[10px] bg-yellow-50 text-yellow-600 px-2.5 py-1 rounded-lg border border-yellow-100 font-bold uppercase tracking-wider shadow-sm inline-block";
        }
    } else if (status === 'selesai') {
        btnProses.className = classInactive;
        btnSelesai.className = "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-green-500 bg-green-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md";
        if(ticketBadge) {
            ticketBadge.innerText = "SELESAI";
            ticketBadge.className = "text-[10px] bg-green-50 text-green-600 px-2.5 py-1 rounded-lg border border-green-100 font-bold uppercase tracking-wider shadow-sm inline-block";
        }
    } else {
        btnProses.className = classInactive;
        btnSelesai.className = classInactive;
        if(ticketBadge) {
            ticketBadge.innerText = "BARU";
            ticketBadge.className = "text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg border border-blue-100 font-bold uppercase tracking-wider shadow-sm inline-block";
        }
    }
}

function openTicketModal() {
    const modal = document.getElementById('ticket-modal');
    const modalContent = document.getElementById('ticket-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
    }, 10);
}

function closeTicketModal() {
    const modal = document.getElementById('ticket-modal');
    const modalContent = document.getElementById('ticket-modal-content');
    modal.classList.add('opacity-0');
    modalContent.classList.remove('scale-100');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function downloadETicket() {
    const ticketElement = document.getElementById('ticket-area');
    const btnDownload = document.getElementById('btn-download');
    const originalContent = btnDownload.innerHTML;
    btnDownload.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Memproses...</span>';
    btnDownload.disabled = true;
    btnDownload.classList.add('opacity-70');

    html2canvas(ticketElement, { scale: 2, backgroundColor: "#ffffff", useCORS: true })
    .then(canvas => {
        btnDownload.innerHTML = originalContent;
        btnDownload.disabled = false;
        btnDownload.classList.remove('opacity-70');
        const image = canvas.toDataURL("image/png", 1.0);
        const link = document.createElement('a');
        const randomId = Math.floor(Math.random() * 10000);
        link.download = `E-Ticket-Ziedan-Laundry-${randomId}.png`;
        link.href = image;
        link.click();
    }).catch(error => {
        btnDownload.innerHTML = originalContent;
        btnDownload.disabled = false;
        btnDownload.classList.remove('opacity-70');
        console.error("Gagal memproses E-Ticket: ", error);
        alert("Terjadi kesalahan saat menyimpan E-Ticket. Pastikan browser mendukung fitur ini.");
    });
}

function closeOrderDetail() {
    currentOrderId = null; 
    document.getElementById('view-order-detail').classList.add('hidden');
    document.getElementById('view-orders').classList.remove('hidden');
}

function renderKreditList() {
    const container = document.getElementById('kredit-list');
    const kreditOrders = allOrders.filter(o => o.payment === 'kredit');

    if (kreditOrders.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-40">
                <i class="fas fa-hand-holding-dollar text-4xl mb-3 text-red-400"></i>
                <p class="text-xs font-bold text-red-900">Belum ada data kredit</p>
            </div>
        `;
        return;
    }

    const groupedKredit = {};
    kreditOrders.forEach(order => {
        const keyName = order.customer.trim().toUpperCase(); 
        if (!groupedKredit[keyName]) {
            groupedKredit[keyName] = { displayName: order.customer, totalAmount: 0, transactionCount: 0 };
        }
        groupedKredit[keyName].totalAmount += order.total;
        groupedKredit[keyName].transactionCount += 1;
    });

    const groupedArray = Object.values(groupedKredit);
    container.innerHTML = groupedArray.map((data, index) => {
        return `
        <div class="bg-white rounded-xl px-4 py-3 shadow-sm border border-red-100 mb-2 hover:bg-red-50 transition-colors relative cursor-pointer active:scale-[0.98]" onclick="openKreditDetail('${data.displayName}')">
            <div class="grid grid-cols-[30px_1fr_1fr_1.3fr] gap-2 items-center">
                <span class="text-xs font-bold text-gray-400">${index + 1}</span>
                <div class="flex flex-col items-start justify-center min-w-0 text-left">
                    <span class="text-xs font-bold text-brand-900 truncate w-full">${data.displayName}</span>
                    <span class="text-[8px] font-bold border px-1 py-0.5 rounded mt-0.5 w-max bg-red-50 text-red-600 border-red-100">BELUM LUNAS</span>
                </div>
                <span class="text-[11px] text-gray-500 font-bold text-center bg-gray-50 rounded-lg py-1 border border-gray-100">${data.transactionCount} Trans.</span>
                <div class="flex items-center justify-end text-right">
                    <span class="text-xs font-extrabold text-red-600">${formatRupiah(data.totalAmount)}</span>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function openKreditDetail(customerName) {
    const targetName = customerName.trim().toUpperCase();
    const customerOrders = allOrders.filter(o => o.customer.trim().toUpperCase() === targetName && o.payment === 'kredit');
    if (customerOrders.length === 0) return;

    const latestWa = customerOrders[0].whatsapp || '-';
    document.getElementById('kredit-detail-name').innerText = customerOrders[0].customer; 
    document.getElementById('kredit-detail-wa').innerText = latestWa;

    let itemsHTML = '';
    let totalKreditAll = 0;

    customerOrders.forEach(order => {
        // FIX: items bisa berupa string JSON atau array
        const itemsArr = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
        let summaryService = itemsArr.length > 0 ? itemsArr.map(i => i.name).join(', ') : 'Layanan';
        totalKreditAll += order.total;
        itemsHTML += `
            <div class="flex justify-between items-center text-sm text-gray-700 border-b border-gray-100 last:border-0 py-3">
                <div class="flex flex-col min-w-0 pr-2">
                    <span class="font-bold text-brand-900 truncate">${summaryService}</span>
                    <span class="text-[10px] text-gray-400 mt-0.5"><i class="far fa-clock mr-1"></i>${formatTanggalLokal(order.date)}</span>
                </div>
                <span class="font-extrabold text-red-500 whitespace-nowrap">${formatRupiah(order.total)}</span>
            </div>
        `;
    });

    document.getElementById('kredit-detail-items').innerHTML = itemsHTML;
    document.getElementById('kredit-detail-total').innerText = formatRupiah(totalKreditAll);
    document.getElementById('view-kredit').classList.add('hidden');
    document.getElementById('view-kredit-detail').classList.remove('hidden');
}

function closeKreditDetail() {
    document.getElementById('view-kredit-detail').classList.add('hidden');
    document.getElementById('view-kredit').classList.remove('hidden');
    renderKreditList();
}

function resetForm() {
    document.getElementById('custName').value = "";
    document.getElementById('custWa').value = "";
    state.selectedServiceIds = [];
    state.quantities = {};
    state.total = 0;
    
    services.forEach(srv => {
        const inputArea = document.getElementById(`input-area-${srv.id}`);
        const inputField = document.getElementById(`input-${srv.id}`);
        
        if(inputArea) inputArea.classList.add('hidden');
        if(inputField) inputField.value = 1;
        
        state.quantities[srv.id] = 1;
    });
    
    updateServiceUI();
    hitungTotal();
}

function shakeElement(id) {
    const el = document.getElementById(id);
    if(el) {
        el.classList.add('ring-2', 'ring-red-500', 'animate-pulse');
        setTimeout(() => { el.classList.remove('ring-2', 'ring-red-500', 'animate-pulse'); }, 500);
    }
}

// Inisialisasi Aplikasi
initApp();
