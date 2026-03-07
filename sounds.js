// sounds.js - Dravexo Sound System (तुम्हारे स्टाइल में)

let saveData = {};
try {
    saveData = JSON.parse(localStorage.getItem('dravexoSaveData')) || {};
} catch (e) {
    saveData = {};
}

// Volume और सेटिंग्स लोड करो
let globalVolume = parseFloat(saveData.volume);
if (isNaN(globalVolume)) globalVolume = 0.5;

let musicVolume = parseFloat(saveData.musicVolume);
if (isNaN(musicVolume)) musicVolume = 0.5;

let soundEnabled = saveData.soundEnabled !== false; // डिफ़ॉल्ट true

// --- Sound System --- (बिल्कुल वैसा जैसा तुमने लिखा)
const sounds = {
    jump:    new Audio("jump.mpeg"),
    coin:    new Audio("coin.mpeg"),
    stomp:   new Audio("stomp.mpeg"),
    death:   new Audio("death.mpeg"),
    win:     new Audio("win.mpeg"),
    powerup: new Audio("powerup.mpeg"),
    grapple: new Audio("grapple.mpeg"),
    dash:    new Audio("dash.mpeg"),
    shoot:   new Audio("laser.mpeg"),
    click:   new Audio("click.mpeg"),
    land:    new Audio("land.mpeg"),
    // Music
    music: new Audio("music.mpeg"),
    home:  new Audio("home.mpeg")
};

// Music को लूप कर दो
sounds.music.loop = true;
sounds.home.loop = true;

// वॉल्यूम पहले से सेट कर दो
sounds.music.volume = musicVolume;
sounds.home.volume = musicVolume;

let currentMusic = null;      // अभी कौन सा म्यूजिक चल रहा है
let fadeInterval = null;      // fade के लिए

// साउंड इफेक्ट्स प्ले करने का फंक्शन (cloneNode से overlap सपोर्ट)
function playSound(key) {
    if (!soundEnabled || !sounds[key]) return;

    // SFX के लिए clone बनाओ ताकि कई बार एक साथ बज सकें
    if (key !== 'music' && key !== 'home') {
        const clone = sounds[key].cloneNode(true);
        clone.volume = globalVolume;
        clone.play().catch(err => console.warn("SFX play fail:", key, err));
    }
}

// म्यूजिक प्ले करने का फंक्शन
function playMusic(key) {
    if (!soundEnabled || !sounds[key]) return;

    // पुराना म्यूजिक बंद करो
    if (currentMusic && currentMusic !== sounds[key]) {
        stopMusic();
    }

    currentMusic = sounds[key];
    currentMusic.volume = musicVolume;
    currentMusic.currentTime = 0;
    const playPromise = currentMusic.play();
    if (playPromise !== undefined) {
        playPromise.catch(err => {
            console.warn("Music play fail:", key, err);
            // अगर ऑटोप्ले फेल हो जाता है, तो इसे रीसेट करें ताकि पहली क्लिक पर फिर से कोशिश की जा सके
            currentMusic = null;
        });
    }
}

// म्यूजिक तुरंत बंद
function stopMusic() {
    if (currentMusic) {
        currentMusic.pause();
        currentMusic.currentTime = 0;
        currentMusic = null;
    }
    if (fadeInterval) clearInterval(fadeInterval);
}

// म्यूजिक धीरे-धीरे फेड आउट
function fadeOutMusic(duration = 1000) {
    if (!currentMusic || currentMusic.paused) return;

    const stepTime = 50;
    const steps = duration / stepTime;
    const volStep = currentMusic.volume / steps;

    if (fadeInterval) clearInterval(fadeInterval);

    fadeInterval = setInterval(() => {
        if (currentMusic && currentMusic.volume > volStep) {
            currentMusic.volume -= volStep;
        } else {
            if (currentMusic) {
                currentMusic.volume = 0;
                currentMusic.pause();
                currentMusic.currentTime = 0;
            }
            clearInterval(fadeInterval);
            fadeInterval = null;
            currentMusic = null;
        }
    }, stepTime);
}

// म्यूजिक वॉल्यूम बदलो (स्लाइडर से)
function setMusicVolume(vol) {
    musicVolume = Math.max(0, Math.min(1, vol));
    saveData.musicVolume = musicVolume;
    localStorage.setItem('dravexoSaveData', JSON.stringify(saveData));

    if (currentMusic) {
        currentMusic.volume = musicVolume;
    }
}

// SFX वॉल्यूम बदलो (स्लाइडर से)
function setGlobalVolume(vol) {
    globalVolume = Math.max(0, Math.min(1, vol));
    saveData.volume = globalVolume;
    localStorage.setItem('dravexoSaveData', JSON.stringify(saveData));
    // नए SFX इसी वॉल्यूम से बजेंगे (पुराने क्लोन नहीं बदलेंगे)
}

// साउंड ऑन/ऑफ टॉगल
function setSoundEnabled(enabled) {
    soundEnabled = !!enabled;
    saveData.soundEnabled = soundEnabled;
    localStorage.setItem('dravexoSaveData', JSON.stringify(saveData));

    if (!soundEnabled && currentMusic) {
        currentMusic.pause();
    }
}

// गेम के लिए एक्सपोर्ट (game.js में इस्तेमाल होगा)
window.playSound       = playSound;
window.playMusic       = playMusic;
window.stopMusic       = stopMusic;
window.fadeOutMusic    = fadeOutMusic;
window.setMusicVolume  = setMusicVolume;
window.setGlobalVolume = setGlobalVolume;
window.setSoundEnabled = setSoundEnabled;

// पेज छोड़ते समय सेव कर दो
window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        localStorage.setItem('dravexoSaveData', JSON.stringify(saveData));
    }
});