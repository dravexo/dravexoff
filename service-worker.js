const CACHE_NAME = 'dravexo-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './game.js',
  './assets/logo.png',
  './assets/jump.wav',
  './assets/coin.wav',
  './assets/stomp.wav',
  './assets/death.wav',
  './assets/win.wav',
  './assets/powerup.wav',
  './assets/grapple.wav',
  './assets/dash.wav',
  './assets/laser.wav',
  './assets/music.mp3',
  './assets/click.wav',
  './assets/land.wav',
  './assets/bg_far.png',
  './assets/bg_mid.png'
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