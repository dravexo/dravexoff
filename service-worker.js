const CACHE_NAME = 'dravexo-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './game.js',
  './sounds.js', // Sound system ko cache karein
  './logo.png',
  './jump.mpeg',
  './coin.mpeg',
  './stomp.mpeg',
  './death.mpeg',
  './win.mpeg',
  './powerup.mpeg',
  './grapple.mpeg',
  './dash.mpeg',
  './laser.mpeg',
  './music.mpeg',
  './home.mpeg',
  './click.mpeg',
  './land.mpeg',
  './bg_far.png',
  './bg_mid.png'
];

// Install Event - Cache Files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch Event - Serve from Cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});