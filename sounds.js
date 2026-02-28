// --- Sound Settings ---
let globalVolume = parseFloat(localStorage.getItem('dravexoVolume'));
if (isNaN(globalVolume)) globalVolume = 0.5;

let musicVolume = parseFloat(localStorage.getItem('dravexoMusicVolume'));
if (isNaN(musicVolume)) musicVolume = 0.5;

let soundEnabled = localStorage.getItem('dravexoSoundEnabled') !== 'false';

// --- Sound System ---
function createSound(src, loop = false, isMusic = false) {
  const sound = new Audio(src);
  sound.loop = loop;
  let fadeInterval;

  return {
    play: () => {
      if (!soundEnabled) return;

      // Short sounds (SFX) ke liye clone banate hain taaki overlap ho sake
      if (!isMusic && !loop) {
          const clone = sound.cloneNode();
          clone.volume = Math.max(0, Math.min(1, globalVolume));
          const playPromise = clone.play();
          if (playPromise !== undefined) {
              playPromise.catch(e => {});
          }
          return;
      }

      // Music ke liye single instance use karte hain
      clearInterval(fadeInterval);
      let vol = isMusic ? musicVolume : globalVolume;
      if (!Number.isFinite(vol)) vol = 0.5;
      sound.volume = Math.max(0, Math.min(1, vol));
      sound.currentTime = 0;
      const playPromise = sound.play();
      if (playPromise !== undefined) {
          playPromise.catch(e => console.warn(`Sound error (${src}):`, e));
      }
    },
    resume: () => {
      if (!soundEnabled) return;
      clearInterval(fadeInterval);
      
      let vol = isMusic ? musicVolume : globalVolume;
      if (!Number.isFinite(vol)) vol = 0.5; 
      sound.volume = Math.max(0, Math.min(1, vol)); 
      
      const playPromise = sound.play();
      if (playPromise !== undefined) {
          playPromise.catch(e => console.warn(`Sound error (${src}):`, e));
      }
    },
    stop: () => {
        clearInterval(fadeInterval);
        sound.pause();
    },
    setVolume: (vol) => {
        sound.volume = vol;
    },
    fadeOut: (duration = 1000) => {
        if (sound.paused) return;
        const stepTime = 50;
        const steps = duration / stepTime;
        const volStep = sound.volume / steps;
        clearInterval(fadeInterval);
        fadeInterval = setInterval(() => {
            if (sound.volume > volStep) {
                sound.volume -= volStep;
            } else {
                sound.volume = 0;
                sound.pause();
                clearInterval(fadeInterval);
            }
        }, stepTime);
    }
  };
}

// --- Load Sounds Here ---
// Apni files assets folder mein daalein aur yahan naam change karein
let jumpSound = createSound("jump.mpeg", false);
let coinSound = createSound("coin.mpeg");
let stompSound = createSound("stomp.mpeg");
let deathSound = createSound("death.mpeg");
let levelWinSound = createSound("win.mpeg");
let powerUpSound = createSound("powerup.mpeg");
let grappleSound = createSound("grapple.mpeg");
let dashSound = createSound("dash.mpeg");
let shootSound = createSound("laser.mpeg", false);
let backgroundMusic = createSound("music.mpeg", true, true);
let homeMusic = createSound("home.mpeg", true, true); // New Home Music
let uiClickSound = createSound("click.mpeg");
let landSound = createSound("land.mpeg");