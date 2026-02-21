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

// --- FUNGSI FETCH DATA DARI SUPABASE ---
async function fetchOrders() {
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*')
            .order('id', { ascending: false });
        
        if (error) {
            console.error("Error fetching orders:", error);
            return;
        }
        allOrders = data || [];
        
        // Update UI jika sedang berada di halaman yang relevan
        if (!document.getElementById('view-orders').classList.contains('hidden')) {
            renderOrderList();
        }
        if (document.getElementById('view-kredit') && !document.getElementById('view-kredit').classList.contains('hidden')) {
            renderKreditList();
        }
    } catch (err) {
        console.error("Network error saat mengambil data:", err);
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
// --- UPDATE: SIMPAN KE SUPABASE (MODIFIED DENGAN TRY...CATCH & FIX LOGIKA RENDER) ---
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

    const newOrder = {
        customer: nama,
        whatsapp: wa,
        date: new Date().toISOString(),
        payment: 'cash',
        status: 'baru', 
        items: state.selectedServiceIds.map(id => {
            const srv = services.find(s => s.id === id);
            return { name: srv.name, qty: state.quantities[id], unit: srv.unit, price: srv.price };
        }),
        total: state.total
    };

    try {
        // Insert to Supabase
        const { data, error } = await supabaseClient.from('orders').insert([newOrder]);

        if (error) {
            // Tangkap error spesifik dari server Supabase (misal RLS / payload salah)
            let errorMsg = error.message || error.details || JSON.stringify(error);
            alert("GAGAL MENYIMPAN KE SERVER!\n\nDetail Error:\n" + errorMsg);
            console.error("Insert error detail:", error);
        } else {
            // FIX LOGIKA: Pindah halaman dulu SEBELUM menarik data
            // Supaya saat data ditarik, fungsi render tidak diblokir oleh pengecekan halaman 'hidden'
            switchToOrders(); 
            await fetchOrders(); 
            resetForm();
        }
    } catch (err) {
        // Tangkap error jaringan (HP offline, gagal konek API, dll)
        alert("Gagal menyimpan pesanan. Cek koneksi internet.");
        console.error("Network/System error saat insert:", err);
    } finally {
        // Kembalikan UI tombol seperti semula apapun hasilnya
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
    
    // FIX PENGAMANAN UI: Selalu paksa render list tiap kali halaman Data Pesanan dibuka
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
        let summaryService = order.items && order.items.length > 0 ? order.items[0].name : 'Layanan';
        if (order.items && order.items.length > 1) {
            summaryService += ` (+${order.items.length - 1})`;
        }
        let paymentDot = order.payment === 'kredit' 
            ? '<span class="w-2 h-2 rounded-full bg-red-400 absolute top-2 right-2 shadow-sm"></span>' 
            : '';
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
            statusText = "BARU";
        }

        return `
        <div class="bg-white rounded-xl px-4 py-3 shadow-sm border border-brand-100 mb-2 hover:bg-brand-50 transition-colors cursor-pointer relative" onclick="openOrderDetail(${order.id})">
            ${paymentDot}
            <div class="grid grid-cols-[30px_1fr_1.2fr_1.3fr] gap-2 items-center">
                <span class="text-xs font-bold text-gray-400">${index + 1}</span>
                <div class="flex flex-col items-start justify-center min-w-0 text-left">
                    <span class="text-xs font-bold text-brand-900 truncate w-full">${order.customer}</span>
                    <span class="text-[8px] font-bold border px-1 py-0.5 rounded mt-0.5 w-max ${statusColor}">${statusText}</span>
                </div>
                <span class="text-[11px] text-gray-500 truncate">${summaryService}</span>
                <div class="flex items-center justify-end text-right">
                    <span class="text-xs font-extrabold text-brand-600">${formatRupiah(order.total)}</span>
                    <i class="fas fa-chevron-right text-[10px] text-gray-300 ml-2"></i>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function openOrderDetail(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    currentOrderId = id;

    const detailName = document.getElementById('detail-name');
    const detailWa = document.getElementById('detail-wa');
    const detailDate = document.getElementById('detail-date');
    const detailTotal = document.getElementById('detail-total');
    const detailItems = document.getElementById('detail-items');

    if(detailName) detailName.innerText = order.customer;
    if(detailWa) detailWa.innerText = order.whatsapp ? order.whatsapp : '-';
    if(detailDate) detailDate.innerText = formatTanggalLokal(order.date);
    if(detailTotal) detailTotal.innerText = formatRupiah(order.total);

    if(detailItems && order.items) {
        detailItems.innerHTML = order.items.map(item => `
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

    if(ticketItems && order.items) {
        ticketItems.innerHTML = order.items.map(item => `
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
    const orderIndex = allOrders.findIndex(o => o.id === currentOrderId);
    if (orderIndex > -1) {
        if (allOrders[orderIndex].status === 'proses') {
            alert("Selesaikan pesanan terlebih dahulu untuk mengubah status pembayaran.");
            return;
        }
        
        allOrders[orderIndex].payment = method;
        refreshPaymentUI(method);
        renderOrderList();
        
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
    const currentOrder = allOrders.find(o => o.id === currentOrderId);
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
    const orderIndex = allOrders.findIndex(o => o.id === currentOrderId);
    if (orderIndex > -1) {
        allOrders[orderIndex].status = status;
        refreshStatusUI(status);
        refreshPaymentUI(allOrders[orderIndex].payment);
        renderOrderList(); 
        
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
        let summaryService = order.items && order.items.length > 0 ? order.items.map(i => i.name).join(', ') : 'Layanan';
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
        if(inputArea) inputArea.classList.add('hidden');
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
