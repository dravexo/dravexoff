const CACHE_NAME = 'dravexo-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './game.js',
  './logo.png',
  './jump.wav',
  './coin.wav',
  './stomp.wav',
  './death.wav',
  './win.wav',
  './powerup.wav',
  './grapple.wav',
  './dash.wav',
  './laser.wav',
  './music.mp3',
  './click.wav',
  './land.wav',
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