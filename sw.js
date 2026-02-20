// Nama cache dan versinya. Ubah versi (misal v2) jika ada update besar pada CSS/JS.
const CACHE_NAME = 'ziedan-laundry-pwa-v1';

// Daftar file inti yang wajib disimpan di cache HP pengguna agar bisa dibuka offline dan mempercepat loading
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './logo.jpg',
    './manifest.json',
    './intro.mp4' // Kita cache videonya agar loading kedua kalinya instan!
];

// Event INSTALL: Browser mendownload dan menyimpan file ke cache HP
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Event FETCH: Strategi "Cache First, Fallback to Network"
// Jika file ada di cache, pakai yang di cache (super cepat). Jika tidak, baru ambil dari internet.
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cache jika ada
                if (response) {
                    return response;
                }
                // Lanjut ambil dari jaringan (network) jika tidak ada di cache
                return fetch(event.request);
            })
    );
});

// Event ACTIVATE: Membersihkan cache lama jika versi CACHE_NAME diganti
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
