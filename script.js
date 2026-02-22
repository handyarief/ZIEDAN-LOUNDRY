// --- DATABASE LAYANAN (LOCAL) ---
const services = [
    { id: 0, name: "Cuci Komplit", price: 7000, unit: "kg" },
    { id: 1, name: "Setrika Saja", price: 4000, unit: "kg" },
    { id: 2, name: "Bed Cover", price: 25000, unit: "pcs" },
    { id: 3, name: "Express Cuci Komplit", price: 10000, unit: "kg" },
    { id: 4, name: "Express Setrika", price: 7000, unit: "kg" }
];

// --- KONFIGURASI SUPABASE ---
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
let currentDetailKreditName = null; // NEW: Menyimpan nama pelanggan yang rincian kreditnya sedang dibuka

// --- HELPER FUNGSI TANGGAL ---
function formatTanggalLokal(isoString) {
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString; 
        
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return d.toLocaleDateString('id-ID', options);
    } catch (e) {
        return isoString;
    }
}

function formatTanggalSingkat(isoString) {
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    } catch (e) {
        return '-';
    }
}

// --- HELPER BACA & TULIS LOKAL STORAGE ---
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

// --- SINKRONISASI PENDING ORDERS KE SUPABASE ---
async function syncPendingOrders() {
    const pending = getPendingOrders();
    if (pending.length === 0) return;

    console.log(`Mencoba sync ${pending.length} pesanan pending ke server...`);
    const stillPending = [];

    for (const order of pending) {
        try {
            const orderToUpload = {
                ...order,
                items: typeof order.items === 'string' ? order.items : JSON.stringify(order.items)
            };
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
            const localOrders = getLocalOrders();
            const pendingOrders = getPendingOrders();
            const merged = [...pendingOrders.map(o => ({...o, _isPending: true})), ...localOrders];
            allOrders = merged;
            
            if (!document.getElementById('view-orders').classList.contains('hidden')) renderOrderList();
            if (document.getElementById('view-kredit') && !document.getElementById('view-kredit').classList.contains('hidden')) renderKreditList();
            return;
        }

        allOrders = data || [];
        saveLocalOrders(allOrders);
        
        if (!document.getElementById('view-orders').classList.contains('hidden')) renderOrderList();
        if (document.getElementById('view-kredit') && !document.getElementById('view-kredit').classList.contains('hidden')) renderKreditList();
    } catch (err) {
        console.error("Network error saat mengambil data:", err);
        const localOrders = getLocalOrders();
        const pendingOrders = getPendingOrders();
        allOrders = [...pendingOrders.map(o => ({...o, _isPending: true})), ...localOrders];
        
        if (!document.getElementById('view-orders').classList.contains('hidden')) renderOrderList();
        if (document.getElementById('view-kredit') && !document.getElementById('view-kredit').classList.contains('hidden')) renderKreditList();
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
    fetchOrders(); 
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
// --- SIMPAN KE SUPABASE + FALLBACK LOKAL ---
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
    
    const btnSimpan = document.querySelector('#footer-total button');
    const originalText = btnSimpan.innerHTML;
    btnSimpan.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i><span>MENYIMPAN...</span>';
    btnSimpan.disabled = true;

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
        total: state.total,
        kredit_paid: 0 
    };

    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .insert([newOrder])
            .select();

        if (error) {
            let errorMsg = error.message || error.details || JSON.stringify(error);
            console.error("Insert error detail:", error);

            const localId = 'local_' + Date.now();
            const localOrder = { ...newOrder, id: localId, _localId: localId, _isPending: true, items: itemsArray };

            const pending = getPendingOrders();
            pending.unshift(localOrder);
            savePendingOrders(pending);

            allOrders.unshift(localOrder);
            saveLocalOrders(allOrders);

            switchToOrders();
            resetForm();

            alert("⚠️ GAGAL MENYIMPAN KE SERVER!\nPesanan disimpan sementara di perangkat ini.");
        } else {
            if (data && data.length > 0) {
                allOrders.unshift(data[0]);
                saveLocalOrders(allOrders);
            }
            switchToOrders(); 
            resetForm();
            fetchOrders(); 
        }
    } catch (err) {
        console.error("Network/System error saat insert:", err);

        const localId = 'local_' + Date.now();
        const localOrder = { ...newOrder, id: localId, _localId: localId, _isPending: true, items: itemsArray };

        const pending = getPendingOrders();
        pending.unshift(localOrder);
        savePendingOrders(pending);

        allOrders.unshift(localOrder);
        saveLocalOrders(allOrders);

        switchToOrders();
        resetForm();

        alert("📶 TIDAK DAPAT TERHUBUNG KE SERVER!\nPesanan disimpan sementara di perangkat ini.");
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

// --- FUNGSI HAPUS PESANAN ---
async function hapusPesanan(id, event) {
    if (event) event.stopPropagation();

    const konfirmasi = confirm("Apakah Anda yakin ingin menghapus pesanan ini? Data yang dihapus tidak bisa dikembalikan.");
    if (!konfirmasi) return;

    const orderIndex = allOrders.findIndex(o => o.id == id);
    if (orderIndex === -1) return;

    const targetOrder = allOrders[orderIndex];
    const targetCustomerName = targetOrder.customer;
    const isKredit = targetOrder.payment === 'kredit';

    allOrders.splice(orderIndex, 1);
    saveLocalOrders(allOrders);

    renderOrderList();
    
    const viewKreditDetail = document.getElementById('view-kredit-detail');
    const viewKredit = document.getElementById('view-kredit');

    if (viewKredit && !viewKredit.classList.contains('hidden')) {
        renderKreditList();
    }

    if (viewKreditDetail && !viewKreditDetail.classList.contains('hidden') && isKredit) {
        const sisaKredit = allOrders.filter(o => o.customer.trim().toUpperCase() === targetCustomerName.trim().toUpperCase() && o.payment === 'kredit');
        if (sisaKredit.length > 0) {
            openKreditDetail(targetCustomerName); 
        } else {
            closeKreditDetail(); 
        }
    }

    if (targetOrder._isPending) {
        let pending = getPendingOrders();
        pending = pending.filter(o => o.id != id);
        savePendingOrders(pending);
    } else {
        try {
            const { error } = await supabaseClient.from('orders').delete().eq('id', targetOrder.id);
            if (error) {
                console.error("Gagal menghapus pesanan dari server:", error);
                alert("Terjadi kesalahan saat menghapus data di server.");
                fetchOrders();
            }
        } catch (err) {
            console.error("Error jaringan saat menghapus:", err);
            alert("Gagal terhubung ke server untuk menghapus data.");
            fetchOrders(); 
        }
    }
}

async function hapusSemuaKreditPelanggan(customerName, event) {
    if (event) event.stopPropagation();

    const konfirmasi = confirm(`Apakah Anda yakin ingin menghapus SEMUA data kredit untuk pelanggan: ${customerName}? Data yang dihapus tidak bisa dikembalikan.`);
    if (!konfirmasi) return;

    const targetName = customerName.trim().toUpperCase();
    
    const ordersToDelete = allOrders.filter(o => o.customer.trim().toUpperCase() === targetName && o.payment === 'kredit');
    if (ordersToDelete.length === 0) return;

    const idsToDelete = ordersToDelete.map(o => o.id);
    
    allOrders = allOrders.filter(o => !idsToDelete.includes(o.id));
    saveLocalOrders(allOrders);

    let pending = getPendingOrders();
    pending = pending.filter(o => !idsToDelete.includes(o.id));
    savePendingOrders(pending);

    renderOrderList();
    renderKreditList();
    
    const serverIds = ordersToDelete.filter(o => !o._isPending).map(o => o.id);
    
    if (serverIds.length > 0) {
        try {
            const { error } = await supabaseClient.from('orders').delete().in('id', serverIds);
            if (error) {
                console.error("Gagal menghapus beberapa data dari server:", error);
                alert("Beberapa data mungkin gagal terhapus sepenuhnya di server.");
                fetchOrders();
            }
        } catch (err) {
            console.error("Error jaringan saat menghapus massal:", err);
            alert("Gagal terhubung ke server untuk menghapus semua data.");
            fetchOrders();
        }
    }
}

// --- RENDER ORDER LIST ---
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
        const itemsArray = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
        let summaryService = itemsArray.length > 0 ? itemsArray[0].name : 'Layanan';
        if (itemsArray.length > 1) {
            summaryService += ` (+${itemsArray.length - 1})`;
        }

        let pendingBadge = order._isPending
            ? '<span class="w-2 h-2 rounded-full bg-orange-400 absolute top-2 right-2 shadow-sm" title="Menunggu upload ke server"></span>'
            : (order.payment === 'kredit' ? '<span class="w-2 h-2 rounded-full bg-red-400 absolute top-2 right-2 shadow-sm"></span>' : '');

        let statusColor = "bg-yellow-50 text-yellow-600 border-yellow-100";
        let statusText = "PROSES";
        
        if (order.status === 'selesai') {
            if (order.payment === 'cash') {
                statusColor = "bg-green-50 text-green-600 border-green-100";
                statusText = "SELESAI<br>CASH";
            } else {
                statusColor = "bg-red-50 text-red-600 border-red-100";
                statusText = "SELESAI<br>KREDIT";
            }
        } else if (order.status === 'baru') {
            statusColor = "bg-blue-50 text-blue-500 border-blue-100";
            statusText = order._isPending ? "PENDING<br>UPLOAD" : "BARU";
        }

        const idAttr = typeof order.id === 'string' ? `'${order.id}'` : order.id;

        return `
        <div class="bg-white rounded-xl px-4 py-3 shadow-sm border ${order._isPending ? 'border-orange-200' : 'border-brand-100'} mb-2 hover:bg-brand-50 transition-colors cursor-pointer relative" onclick="openOrderDetail(${idAttr})">
            ${pendingBadge}
            <div class="grid grid-cols-[18px_1.4fr_1fr_55px_55px_30px] gap-1.5 items-center">
                <span class="text-xs font-bold text-gray-400">${index + 1}</span>
                
                <div class="flex items-center min-w-0 text-left pr-1">
                    <span class="text-[10px] font-bold text-brand-900 leading-tight break-words w-full line-clamp-2">${order.customer}</span>
                </div>
                
                <div class="flex items-center min-w-0 text-left pr-1">
                    <span class="text-[9px] text-gray-500 font-medium leading-tight break-words w-full line-clamp-2">${summaryService}</span>
                </div>
                
                <div class="flex items-center justify-center">
                    <span class="text-[8px] font-bold border px-1.5 py-0.5 rounded-lg inline-block text-center leading-tight ${statusColor}">${statusText}</span>
                </div>
                
                <div class="flex items-center justify-end text-right">
                    <span class="text-[9px] font-extrabold text-brand-600 whitespace-nowrap">${formatRupiah(order.total)}</span>
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
    const order = allOrders.find(o => o.id == id);
    if (!order) return;
    currentOrderId = order.id;

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
        // UPDATE: Render item pada nota bergaya neon futuristik
        ticketItems.innerHTML = itemsArray.map(item => `
            <div class="flex justify-between items-center text-[10px] text-slate-300 border-b border-dashed border-slate-700/50 last:border-0 py-2.5">
                <div class="flex flex-col">
                    <span class="font-bold text-cyan-50 tracking-wide">${item.name}</span>
                    <span class="text-[9px] text-cyan-500/80 font-mono mt-0.5">@ ${formatRupiah(item.price || 0)}</span>
                </div>
                <span class="font-black bg-cyan-950/40 text-cyan-300 px-2.5 py-1 rounded-lg border border-cyan-800/50 shadow-[0_0_10px_rgba(6,182,212,0.1)] font-mono tracking-widest">${item.qty} ${item.unit.toUpperCase()}</span>
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
        if (badgeTicket) { badgeTicket.innerText = "CASH"; badgeTicket.className = "text-[8px] bg-emerald-950/50 text-emerald-400 px-2.5 py-1 rounded border border-emerald-500/30 font-black uppercase tracking-widest text-center min-w-[65px] shadow-[0_0_10px_rgba(16,185,129,0.1)] backdrop-blur-sm"; }
        btnCash.className = baseBtnClassActive + disabledStateClass + "border-green-500 bg-green-500 text-white";
        btnKredit.className = baseBtnClassInactive + disabledStateClass;
    } else {
        const classKredit = "text-[10px] bg-red-50 text-red-600 px-2.5 py-1 rounded-lg border border-red-100 font-bold uppercase tracking-wider shadow-sm inline-block";
        if (badgeDetail) { badgeDetail.innerText = "KREDIT"; badgeDetail.className = classKredit; }
        if (badgeTicket) { badgeTicket.innerText = "KREDIT"; badgeTicket.className = "text-[8px] bg-rose-950/50 text-rose-400 px-2.5 py-1 rounded border border-rose-500/30 font-black uppercase tracking-widest text-center min-w-[65px] shadow-[0_0_10px_rgba(244,63,94,0.1)] backdrop-blur-sm"; }
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
        btnProses.className = "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-yellow-500 bg-yellow-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md";
        btnSelesai.className = classInactive;
        if(ticketBadge) {
            ticketBadge.innerText = "PROSES";
            ticketBadge.className = "text-[8px] bg-blue-950/50 text-blue-400 px-2.5 py-1 rounded border border-blue-500/30 font-black uppercase tracking-widest text-center min-w-[65px] shadow-[0_0_10px_rgba(59,130,246,0.1)] backdrop-blur-sm";
        }
    } else if (status === 'selesai') {
        btnProses.className = classInactive;
        btnSelesai.className = "flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-green-500 bg-green-500 text-white font-bold text-xs transition-all active:scale-95 shadow-md";
        if(ticketBadge) {
            ticketBadge.innerText = "SELESAI";
            ticketBadge.className = "text-[8px] bg-cyan-950/50 text-cyan-400 px-2.5 py-1 rounded border border-cyan-500/30 font-black uppercase tracking-widest text-center min-w-[65px] shadow-[0_0_10px_rgba(34,211,238,0.1)] backdrop-blur-sm";
        }
    } else {
        btnProses.className = classInactive;
        btnSelesai.className = classInactive;
        if(ticketBadge) {
            ticketBadge.innerText = "BARU";
            ticketBadge.className = "text-[8px] bg-slate-800/80 text-slate-300 px-2.5 py-1 rounded border border-slate-600/50 font-black uppercase tracking-widest text-center min-w-[65px] shadow-[0_0_10px_rgba(148,163,184,0.1)] backdrop-blur-sm";
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
    const originalTicketElement = document.getElementById('ticket-area');
    const btnDownload = document.getElementById('btn-download');
    const originalContent = btnDownload.innerHTML;
    
    btnDownload.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Memproses Nota Bayar...</span>';
    btnDownload.disabled = true;
    btnDownload.classList.add('opacity-70');

    const offScreenContainer = document.createElement('div');
    offScreenContainer.style.position = 'absolute';
    offScreenContainer.style.left = '-9999px';
    offScreenContainer.style.top = '0';
    offScreenContainer.style.width = '450px'; 
    // UPDATE: Background disesuaikan ke dark blue agar canvas tidak clash dengan elemen putih
    offScreenContainer.style.backgroundColor = '#0b1120'; 
    
    const clone = originalTicketElement.cloneNode(true);
    clone.style.height = 'auto';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.classList.remove('overflow-y-auto');
    clone.style.padding = '40px'; 

    offScreenContainer.appendChild(clone);
    document.body.appendChild(offScreenContainer);

    html2canvas(clone, { 
        scale: 3, 
        backgroundColor: "#0b1120", // Background render dirubah menjadi gelap
        useCORS: true,
        allowTaint: true,
        windowWidth: 450 
    })
    .then(canvas => {
        document.body.removeChild(offScreenContainer);
        btnDownload.innerHTML = originalContent;
        btnDownload.disabled = false;
        btnDownload.classList.remove('opacity-70');
        
        const image = canvas.toDataURL("image/jpeg", 1.0);
        const link = document.createElement('a');
        const ticketNameEl = document.getElementById('ticket-name');
        const custName = ticketNameEl ? ticketNameEl.innerText.replace(/[^a-z0-9]/gi, '_').toUpperCase() : 'CUST';
        
        link.download = `NOTA-BAYAR-ZIEDAN-${custName}.jpg`;
        link.href = image;
        link.click();
    }).catch(error => {
        if(document.body.contains(offScreenContainer)) {
            document.body.removeChild(offScreenContainer);
        }
        btnDownload.innerHTML = originalContent;
        btnDownload.disabled = false;
        btnDownload.classList.remove('opacity-70');
        console.error("Gagal memproses Nota Bayar: ", error);
        alert("Terjadi kesalahan saat memproses Nota Bayar.");
    });
}

function closeOrderDetail() {
    currentOrderId = null; 
    document.getElementById('view-order-detail').classList.add('hidden');
    document.getElementById('view-orders').classList.remove('hidden');
}
// --- RENDER KREDIT LIST ---
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
            groupedKredit[keyName] = { displayName: order.customer, totalAmount: 0, paidAmount: 0, transactionCount: 0 };
        }
        groupedKredit[keyName].totalAmount += order.total;
        groupedKredit[keyName].paidAmount += (order.kredit_paid || 0);
        groupedKredit[keyName].transactionCount += 1;
    });

    const groupedArray = Object.values(groupedKredit);
    container.innerHTML = groupedArray.map((data, index) => {
        const sisa = data.totalAmount - data.paidAmount;

        const nameStr = data.displayName.replace(/'/g, "\\'"); 
        
        let badgeSisaHtml = sisa <= 0 
            ? `<span class="text-[7px] font-black border px-1.5 py-0.5 rounded bg-green-50 text-green-600 border-green-100 uppercase tracking-tighter whitespace-nowrap">LUNAS</span>`
            : `<span class="text-[7px] font-black border px-1.5 py-0.5 rounded bg-red-50 text-red-600 border-red-100 uppercase tracking-tighter whitespace-nowrap">${formatRupiah(sisa)}</span>`;

        return `
        <div class="bg-white rounded-xl px-4 py-3 shadow-sm border border-red-100 mb-2 hover:bg-red-50 transition-colors relative cursor-pointer active:scale-[0.98]" onclick="openKreditDetail('${nameStr}')">
            <div class="grid grid-cols-[18px_1.2fr_60px_35px_55px_25px] gap-1.5 items-center">
                <span class="text-xs font-bold text-gray-400">${index + 1}</span>
                
                <div class="flex items-center min-w-0 text-left pr-1">
                    <span class="text-[10px] font-bold text-brand-900 leading-tight break-words w-full line-clamp-2">${data.displayName}</span>
                </div>

                <div class="flex items-center justify-center">
                    ${badgeSisaHtml}
                </div>

                <div class="flex items-center justify-center">
                    <span class="text-[10px] text-gray-500 font-bold bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 whitespace-nowrap">${data.transactionCount}x</span>
                </div>
                
                <div class="flex items-center justify-end text-right">
                    <span class="text-[9px] font-black text-gray-400 whitespace-nowrap">${formatRupiah(data.totalAmount)}</span>
                </div>

                <button onclick="hapusSemuaKreditPelanggan('${nameStr}', event)" class="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100 transition-all ml-auto focus:outline-none" title="Hapus Semua Kredit ${data.displayName}">
                    <i class="fas fa-trash-alt text-[10px] pointer-events-none"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

// --- RINCIAN KREDIT ---
function openKreditDetail(customerName) {
    const targetName = customerName.trim().toUpperCase();
    currentDetailKreditName = targetName;
    const customerOrders = allOrders.filter(o => o.customer.trim().toUpperCase() === targetName && o.payment === 'kredit');
    
    if (customerOrders.length === 0) {
        closeKreditDetail();
        return;
    }

    const titleEl = document.getElementById('kredit-detail-title');
    if (titleEl) titleEl.innerText = `Rincian: ${customerOrders[0].customer}`;

    let itemsHTML = '';
    let totalKreditAll = 0;
    let totalPaidAll = 0;
    let counter = 1;

    customerOrders.forEach(order => {
        totalKreditAll += order.total;
        totalPaidAll += (order.kredit_paid || 0);
        
        const sisaOrder = order.total - (order.kredit_paid || 0);
        
        const isLunas = sisaOrder <= 0;
        const statusLunasHtml = isLunas ? `<span class="text-[8px] font-black bg-green-100 text-green-600 px-1 py-0.5 rounded uppercase leading-none">LUNAS</span>` : '';

        const itemsArr = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
        const idAttr = typeof order.id === 'string' ? `'${order.id}'` : order.id;

        itemsArr.forEach(item => {
            itemsHTML += `
            <div class="grid grid-cols-[16px_1.4fr_35px_40px_1fr_25px] gap-1.5 py-2.5 border-b border-gray-100 last:border-0 items-center text-gray-700 hover:bg-gray-50 transition-colors px-1 -mx-1 rounded-lg">
                <span class="text-[10px] font-bold text-gray-400">${counter++}</span>
                <div class="flex flex-col min-w-0 pr-1">
                    <div class="flex items-start gap-1.5 flex-wrap">
                        <span class="text-[11px] font-bold text-brand-900 leading-snug break-words">${item.name}</span>
                        ${statusLunasHtml}
                    </div>
                </div>
                <span class="text-[9px] font-extrabold bg-brand-50 text-brand-900 px-1 py-1 rounded border border-brand-100 text-center whitespace-nowrap">${item.qty}${item.unit.toUpperCase()}</span>
                <span class="text-[9px] text-gray-500 font-medium text-center leading-tight">${formatTanggalSingkat(order.date)}</span>
                <span class="text-[11px] font-extrabold ${isLunas ? 'text-green-500' : 'text-red-500'} text-right">${formatRupiah(item.qty * (item.price || 0))}</span>
                
                <button onclick="hapusPesanan(${idAttr}, event)" class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all ml-auto focus:outline-none" title="Hapus Transaksi">
                    <i class="fas fa-times text-[10px] pointer-events-none"></i>
                </button>
            </div>
            `;
        });
    });

    const sisaKredit = totalKreditAll - totalPaidAll;
    
    document.getElementById('kredit-detail-items').innerHTML = itemsHTML;
    document.getElementById('kredit-detail-total').innerText = formatRupiah(totalKreditAll);
    document.getElementById('kredit-detail-paid').innerText = formatRupiah(totalPaidAll);
    document.getElementById('kredit-detail-sisa').innerText = formatRupiah(sisaKredit);
    
    window.currentSisaKredit = sisaKredit;
    window.currentTotalKredit = totalKreditAll;
    window.currentPaidKredit = totalPaidAll;
    
    document.getElementById('view-kredit').classList.add('hidden');
    document.getElementById('view-kredit-detail').classList.remove('hidden');
}

function closeKreditDetail() {
    currentDetailKreditName = null;
    document.getElementById('view-kredit-detail').classList.add('hidden');
    document.getElementById('view-kredit').classList.remove('hidden');
    renderKreditList();
}
// --- LOGIKA PEMBAYARAN KREDIT (MODAL & PROSES) ---
function openModalBayarKredit() {
    document.getElementById('kredit-pay-sisa').innerText = formatRupiah(window.currentSisaKredit || 0);
    document.getElementById('input-kredit-pay').value = '';
    
    const modal = document.getElementById('kredit-pay-modal');
    const modalContent = document.getElementById('kredit-pay-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
    }, 10);
}

function closeModalBayarKredit() {
    const modal = document.getElementById('kredit-pay-modal');
    const modalContent = document.getElementById('kredit-pay-modal-content');
    modal.classList.add('opacity-0');
    modalContent.classList.remove('scale-100');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function fillBayarPenuh() {
    document.getElementById('input-kredit-pay').value = window.currentSisaKredit || 0;
}

async function prosesBayarKredit() {
    const inputVal = parseInt(document.getElementById('input-kredit-pay').value);
    if (isNaN(inputVal) || inputVal <= 0) {
        alert("Masukkan nominal pembayaran yang valid.");
        return;
    }

    if (inputVal > window.currentSisaKredit) {
        alert("Nominal pembayaran melebihi sisa tagihan!");
        return;
    }

    const btn = document.getElementById('btn-proses-kredit');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>MEMPROSES...</span>';
    btn.disabled = true;

    let customerOrders = allOrders.filter(o => o.customer.trim().toUpperCase() === currentDetailKreditName && o.payment === 'kredit');
    customerOrders.sort((a, b) => new Date(a.date) - new Date(b.date));

    let sisaBayarInput = inputVal;

    for (let order of customerOrders) {
        if (sisaBayarInput <= 0) break;

        let sisaTagihanOrder = order.total - (order.kredit_paid || 0);
        
        if (sisaTagihanOrder > 0) {
            let bayarUntukOrderIni = Math.min(sisaBayarInput, sisaTagihanOrder);
            order.kredit_paid = (order.kredit_paid || 0) + bayarUntukOrderIni;
            sisaBayarInput -= bayarUntukOrderIni;

            saveLocalOrders(allOrders);
            if (order._isPending) {
                const pending = getPendingOrders();
                const pi = pending.findIndex(o => o.id == order.id);
                if (pi > -1) { 
                    pending[pi].kredit_paid = order.kredit_paid; 
                    savePendingOrders(pending); 
                }
            } else {
                await supabaseClient.from('orders')
                    .update({ kredit_paid: order.kredit_paid }) 
                    .eq('id', order.id);
            }
        }
    }

    btn.innerHTML = originalHtml;
    btn.disabled = false;
    closeModalBayarKredit();
    
    openKreditDetail(currentDetailKreditName);
}

// --- LOGIKA CETAK NOTA KREDIT ---
function cetakRekapKredit() {
    const customerOrders = allOrders.filter(o => o.customer.trim().toUpperCase() === currentDetailKreditName && o.payment === 'kredit');
    
    document.getElementById('kt-name').innerText = customerOrders[0].customer;
    document.getElementById('kt-date').innerText = formatTanggalLokal(new Date().toISOString());
    
    let itemsHTML = '';
    customerOrders.forEach(order => {
        const sisaOrder = order.total - (order.kredit_paid || 0);
        const isLunas = sisaOrder <= 0;
        
        // UPDATE: Tag lunas bergaya badge neon
        const tagLunas = isLunas ? ` <span class="text-[8px] bg-emerald-950/50 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 font-black tracking-widest ml-1 shadow-[0_0_8px_rgba(16,185,129,0.1)]">LUNAS</span>` : '';

        const itemsArr = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
        itemsArr.forEach(item => {
            // UPDATE: Desain list item bergaya dark futuristic
            itemsHTML += `
            <div class="flex justify-between items-center text-[10px] text-slate-300 border-b border-dashed border-slate-700/50 last:border-0 py-2.5">
                <div class="flex flex-col">
                    <span class="font-bold text-cyan-50 tracking-wide">${item.name} <span class="text-cyan-500/80 font-mono">(${item.qty}${item.unit.toUpperCase()})</span>${tagLunas}</span>
                    <span class="text-[9px] text-slate-500 font-mono mt-0.5">${formatTanggalSingkat(order.date)}</span>
                </div>
                <span class="font-mono font-black ${isLunas ? 'text-slate-600 line-through' : 'text-cyan-300'} whitespace-nowrap">${formatRupiah(item.qty * (item.price || 0))}</span>
            </div>
            `;
        });
    });

    document.getElementById('kt-items').innerHTML = itemsHTML;
    document.getElementById('kt-total').innerText = formatRupiah(window.currentTotalKredit);
    document.getElementById('kt-paid').innerText = formatRupiah(window.currentPaidKredit);
    document.getElementById('kt-sisa').innerText = formatRupiah(window.currentSisaKredit);

    const modal = document.getElementById('kredit-ticket-modal');
    const modalContent = document.getElementById('kredit-ticket-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
        modalContent.classList.add('scale-100');
    }, 10);
}

function closeKreditTicketModal() {
    const modal = document.getElementById('kredit-ticket-modal');
    const modalContent = document.getElementById('kredit-ticket-modal-content');
    modal.classList.add('opacity-0');
    modalContent.classList.remove('scale-100');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function downloadKreditTicket() {
    const originalElement = document.getElementById('kredit-ticket-area');
    const btnDownload = document.getElementById('btn-download-kt');
    const originalContent = btnDownload.innerHTML;
    
    btnDownload.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Memproses Nota...</span>';
    btnDownload.disabled = true;
    btnDownload.classList.add('opacity-70');

    const offScreenContainer = document.createElement('div');
    offScreenContainer.style.position = 'absolute';
    offScreenContainer.style.left = '-9999px';
    offScreenContainer.style.top = '0';
    offScreenContainer.style.width = '450px'; 
    // UPDATE: Background disesuaikan ke dark blue
    offScreenContainer.style.backgroundColor = '#0b1120'; 
    
    const clone = originalElement.cloneNode(true);
    clone.style.height = 'auto';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.classList.remove('overflow-y-auto');
    clone.style.padding = '40px'; 

    offScreenContainer.appendChild(clone);
    document.body.appendChild(offScreenContainer);

    // UPDATE: backgroundColor diubah ke gelap saat dirender
    html2canvas(clone, { scale: 3, backgroundColor: "#0b1120", useCORS: true, allowTaint: true, windowWidth: 450 })
    .then(canvas => {
        document.body.removeChild(offScreenContainer);
        btnDownload.innerHTML = originalContent;
        btnDownload.disabled = false;
        btnDownload.classList.remove('opacity-70');
        
        const image = canvas.toDataURL("image/jpeg", 1.0);
        const link = document.createElement('a');
        const custName = document.getElementById('kt-name').innerText.replace(/[^a-z0-9]/gi, '_').toUpperCase();
        
        link.download = `NOTA-TAGIHAN-KREDIT-${custName}.jpg`;
        link.href = image;
        link.click();
    }).catch(error => {
        if(document.body.contains(offScreenContainer)) document.body.removeChild(offScreenContainer);
        btnDownload.innerHTML = originalContent;
        btnDownload.disabled = false;
        btnDownload.classList.remove('opacity-70');
        alert("Terjadi kesalahan saat memproses Nota Tagihan.");
    });
}

// --- UTILITIES LAINNYA ---
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

initApp();
