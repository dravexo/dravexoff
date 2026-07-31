const canvas = document.getElementById("game");
const ctx = canvas ? canvas.getContext("2d") : null;
if (!ctx) {
    console.error("Canvas context not available!");
}
let gameState = 'START_SCREEN'; // Can be: START_SCREEN, PLAYING, GAME_OVER, GAME_WON

// --- Safe localStorage wrapper ---
function safeGetItem(key, fallback) {
    try {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
    } catch (e) {
        console.warn("localStorage getItem failed:", key, e);
        return fallback;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn("localStorage setItem failed:", key, e);
    }
}

// --- Consolidated Save Data ---
// saveData is initialized by sounds.js (window.saveData), just assign to it
try {
    saveData = JSON.parse(safeGetItem('dravexoSaveData', '{}')) || {};
} catch (e) {
    console.warn("Failed to parse save data", e);
    saveData = {};
}

// Migration for old keys (if new data is empty but old exists)
try {
    if (Object.keys(saveData).length === 0 && safeGetItem('dravexoHighScore')) {
        saveData.highScore = parseInt(safeGetItem('dravexoHighScore', '0')) || 0;
        saveData.totalCoins = parseInt(safeGetItem('dravexoTotalCoins', '0')) || 0;
    }
} catch (e) {
    console.warn("Migration failed", e);
}

let selectedCharacter = saveData.selectedCharacter || 'cyan';
let unlockedCharacters = saveData.unlockedCharacters || ['cyan'];
let currentLevelIndex = parseInt(saveData.currentLevel) || 0;
let touchEnabled = saveData.touchEnabled !== false; // Default true if not explicitly false
let maxLevelReached = parseInt(saveData.maxLevel) || 0;
let initialEnemies = [];
let consecutiveLosses = 0; // Track losses on the same level
let initialCoins = [];
let stars = [];
let shakeDuration = 0;
let shakeIntensity = 0;
let floatingTexts = [];

// --- Sprite / Image System ---
const sprites = {};
const spritePromises = [];

function loadSprite(key, src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
            sprites[key] = img;
            resolve(img);
        };
        img.onerror = () => {
            console.warn(`Failed to load sprite: ${src}`); // Don't reject, just warn
            resolve(null); // Resolve anyway to avoid blocking game
        };
    });
}

// Load Sprites (Apni photos assets folder mein daalein aur naam match karein)
// Player Skins
spritePromises.push(loadSprite('player_cyan', 'player_cyan.png'));
spritePromises.push(loadSprite('player_green', 'player_green.png'));
spritePromises.push(loadSprite('player_walker', 'player_walker.png'));
spritePromises.push(loadSprite('player_purple', 'player_purple.png'));
spritePromises.push(loadSprite('player_orange', 'player_orange.png'));
spritePromises.push(loadSprite('player_red', 'player_red.png'));
spritePromises.push(loadSprite('player_gold', 'player_gold.png'));
spritePromises.push(loadSprite('player_dark', 'player_dark.png'));
spritePromises.push(loadSprite('player_flyer', 'player_flyer.png'));
// Note: player_shooter and player_boss use procedural rendering (no sprite files)
// Enemies
spritePromises.push(loadSprite('enemy_patrol', 'enemy_patrol.png'));
spritePromises.push(loadSprite('enemy_fly', 'enemy_fly.png'));
spritePromises.push(loadSprite('enemy_shooter', 'enemy_shooter.png'));
spritePromises.push(loadSprite('enemy_boss', 'enemy_boss.png'));

// Game constants
const GRAVITY = 0.5;
const BASE_SPEED = 4;
const BASE_JUMP_FORCE = -11;
const WALL_SLIDE_SPEED = 1;
const GRAPPLE_MAX_RANGE = 300;
const GRAPPLE_PULL_SPEED = -10; // Pulling up, so negative
const BASE_DASH_SPEED = 12;
const BASE_DASH_DURATION = 10; // in frames
const DASH_COOLDOWN = 60; // in frames (1 second at 60fps)

let camera = {
  x: 0,
  y: 0,
  width: 800,
  height: 400,
  lerpFactor: 0.15 // Improved camera speed for mobile
};

let lastSafePos = { x: 50, y: 300 }; // Track last safe ground position
let player = {
  x: 50,
  y: 300,
  w: 30,
  h: 30,
  dx: 0,
  dy: 0,
  speed: 4, // Dynamic stats
  jumpForce: -11,
  dashDuration: 10,
  onGround: false,
  jumps: 0,
  maxJumps: 1, // Default to a single jump
  isDashing: false,
  dashTimer: 0,
  dashCooldown: 0,
  facingDirection: 1, // 1 for right, -1 for left
  isTouchingWall: false,
  wallDirection: 0,
  isGrappling: false,
  grapplePoint: { x: 0, y: 0 },
  hasShield: false,
  color: 'cyan', // Add color property for character selection
  invincible: false,
  invincibleTimer: 0,
  gravityScale: 1, // For characters like Flyer
  coyoteTimer: 0, // For better jump feel
  jumpBuffer: 0   // For better jump feel
};

// Load saved settings from localStorage
let score = 0;
let highScore = parseInt(saveData.highScore) || 0;
let totalCoins = parseInt(saveData.totalCoins) || 0;
let selectedBackgroundAnimation = saveData.backgroundAnimation || 'indianGradient';
let unlockedBackgrounds = saveData.unlockedBackgrounds || ['indianGradient'];
let selectedLandColor = saveData.landColor || 'default';
let unlockedLandColors = saveData.unlockedLandColors || ['default'];

// --- UI Elements ---
const homeScreen = document.getElementById('home-screen');
const startBtn = document.getElementById('start-btn');
const newGameBtn = document.getElementById('new-game-btn');
const characterBtn = document.getElementById('character-btn');
const session1Btn = document.getElementById('session1-btn');
const session2Btn = document.getElementById('session2-btn');
const session3Btn = document.getElementById('session3-btn');
const session4Btn = document.getElementById('session4-btn');
const session5Btn = document.getElementById('session5-btn');
const sessionSelectScreen = document.getElementById('session-select-screen');
const closeSessionsBtn = document.getElementById('close-sessions-btn');
const totalCoinsDisplay = document.getElementById('total-coins-display');
const dailyRewardBtn = document.getElementById('daily-reward-btn');
const dailyRewardPopup = document.getElementById('daily-reward-popup');
const claimRewardBtn = document.getElementById('claim-reward-btn');
const closeRewardBtn = document.getElementById('close-reward-btn');
const dailyRewardCloseX = document.getElementById('daily-reward-close-x');
const dailyRewardMessage = document.getElementById('daily-reward-message');
const gameUI = document.getElementById('game-ui');
const hudLevel = document.getElementById('hud-level');
const touchControls = document.getElementById('touch-controls');
const settingsMenu = document.getElementById('settings-menu');
const settingsIconBtn = document.getElementById('settings-icon-btn');
const closeSettingsBtn = document.getElementById('close-settings');
const resetProgressBtn = document.getElementById('reset-progress-btn');
const soundToggle = document.getElementById('sound-toggle');
const volumeSlider = document.getElementById('volume-slider');
const touchToggle = document.getElementById('touch-toggle');
const graphicsToggle = document.getElementById('graphics-toggle');
const musicVolumeSlider = document.getElementById('music-volume-slider');
const tutorialBtn = document.getElementById('tutorial-btn');
const editControlsBtn = document.getElementById('edit-controls-btn');
const editUI = document.getElementById('edit-ui');
const saveControlsBtn = document.getElementById('save-controls-btn');
const resetControlsBtn = document.getElementById('reset-controls-btn');
const controlSizeSlider = document.getElementById('control-size-slider');
const privacyBtn = document.getElementById('privacy-btn');
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const tutorialScreen = document.getElementById('tutorial-screen');
const closeTutorialBtn = document.getElementById('close-tutorial'); // Add new UI elements for background animation selection
const backgroundAnimationSelectContainer = document.getElementById('background-animation-select');
const bgAnimBtn = document.getElementById('bg-anim-btn');
const backgroundSelectScreen = document.getElementById('background-select-screen');
const closeBgBtn = document.getElementById('close-bg-btn');
const landBtn = document.getElementById('land-btn');
const landSelectScreen = document.getElementById('land-select-screen');
const landSelectContainer = document.getElementById('land-select-container');
const closeLandBtn = document.getElementById('close-land-btn');
const levelSelectScreen = document.getElementById('level-select-screen');
const levelsContainer = document.getElementById('levels-container');
const characterSelectScreen = document.getElementById('character-select-screen');
const closeCharacterBtn = document.getElementById('close-character-btn');
const randomCharBtn = document.getElementById('random-char-btn');
const closeLevelsBtn = document.getElementById('close-levels-btn');
const levelCompleteScreen = document.getElementById('level-complete-screen');
const nextLevelBtn = document.getElementById('next-level-btn');
const levelHomeBtn = document.getElementById('level-home-btn');
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverTitle = document.getElementById('game-over-title');
const restartBtn = document.getElementById('restart-btn');
const skipLevelBtn = document.getElementById('skip-level-btn'); // New Skip Button
const homeBtn = document.getElementById('home-btn');
const pauseBtn = document.getElementById('pause-btn');
const pauseMenu = document.getElementById('pause-menu');
const clickToStartScreen = document.getElementById('click-to-start-screen');
const realStartBtn = document.getElementById('real-start-btn');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseHomeBtn = document.getElementById('pause-home-btn');
const watchAdBtn = document.getElementById('watch-ad-btn');
const highScoreDisplay = document.getElementById('high-score-display');
let bgCache = document.createElement('canvas');
let isEditingControls = false;
let selectedEditButton = null; // Track which button is being resized

// --- Custom Popup Elements ---
const messagePopup = document.getElementById('message-popup');
const messageTitle = document.getElementById('message-title');
const messageText = document.getElementById('message-text');
const messageOkBtn = document.getElementById('message-ok-btn');
const confirmPopup = document.getElementById('confirm-popup');
const confirmTitle = document.getElementById('confirm-title');
const confirmText = document.getElementById('confirm-text');
const confirmYesBtn = document.getElementById('confirm-yes-btn');
const confirmNoBtn = document.getElementById('confirm-no-btn');
let confirmCallback = null;

// --- Resolution & Scaling Logic ---
let scaleFactor = 1;
function resizeGame() {
    // Use Device Pixel Ratio for HD/Sharp Images
    // Cap at 1.5 to prevent lag on high-res mobile screens (Performance Fix)
    const dpr = Math.min(window.devicePixelRatio || 1, 1.0); // Reduced to 1.0 for 60FPS smoothness
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    
    // --- ZOOM FIX FOR MOBILE ---
    // Calculate scale to fit height (Base height is 400)
    let scale = canvas.height / 400;

    // If width is too narrow (Portrait Mode), scale based on width instead
    // This prevents the game from being extremely zoomed in
    if (canvas.width / scale < 600) {
        scale = canvas.width / 600;
    }
    
    scaleFactor = scale;
    
    // Update camera logical size
    camera.width = canvas.width / scaleFactor;
    camera.height = canvas.height / scaleFactor;
    
    generateStars(); // Regenerate stars for new size
    updateBackgroundCache(); // Update cached background
}
window.addEventListener('resize', resizeGame);

// --- Save Data Function ---
function saveGameData() {
    safeSetItem('dravexoSaveData', JSON.stringify(saveData));
}

function updateCurrencyDisplay() {
    if (totalCoinsDisplay) {
        totalCoinsDisplay.innerText = totalCoins;
        // Trigger Animation
        totalCoinsDisplay.classList.remove('currency-pop');
        void totalCoinsDisplay.offsetWidth; // Force reflow to restart animation
        totalCoinsDisplay.classList.add('currency-pop');
    }
}

// --- Juice Functions (Screen Shake & Floating Text) ---
function startShake(duration, intensity) {
    shakeDuration = duration;
    shakeIntensity = intensity;
}

function spawnFloatingText(x, y, text, color='white') {
    floatingTexts.push({x, y, text, color, life: 50, yOffset: 0});
}

// --- Loading Screen Logic ---
window.addEventListener('load', async () => {
    // 1. Wait for all sprites to load
    try {
        await Promise.all(spritePromises);
        console.log("All sprites loaded");
    } catch (e) {
        console.error("Error loading sprites", e);
    }
    
    // 2. Simulate a bit of extra loading time for UI feel or ensure bar fills
    if (loadingBar) loadingBar.style.width = '100%';
    
    // 3. Fade out loading screen and start game loop
    setTimeout(() => {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
            // Show the click-to-start screen to get user interaction for sound
            if (clickToStartScreen) clickToStartScreen.classList.remove('hidden');
            requestAnimationFrame(loop);
        }, 500);
    }, 500);
});

function updateSessionButtons() {
    if (session2Btn) {
        if (maxLevelReached >= 25) {
            session2Btn.disabled = false;
            session2Btn.innerText = "SESSION 2";
        } else {
            session2Btn.disabled = true;
            session2Btn.innerText = "SESSION 2 🔒";
        }
    }
    if (session3Btn) {
        if (maxLevelReached >= 50) {
            session3Btn.disabled = false;
            session3Btn.innerText = "SESSION 3";
        } else {
            session3Btn.disabled = true;
            session3Btn.innerText = "SESSION 3 🔒";
        }
    }
    if (session4Btn) {
        if (maxLevelReached >= 75) {
            session4Btn.disabled = false;
            session4Btn.innerText = "SESSION 4";
        } else {
            session4Btn.disabled = true;
            session4Btn.innerText = "SESSION 4 🔒";
        }
    }
    if (session5Btn) {
        if (maxLevelReached >= 100) {
            session5Btn.disabled = false;
            session5Btn.innerText = "SESSION 5";
        } else {
            session5Btn.disabled = true;
            session5Btn.innerText = "SESSION 5 🔒";
        }
    }
}

function showHomeScreen() {
    homeScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden'); // Ensure game over screen is hidden
    settingsMenu.classList.add('hidden'); // Ensure settings hidden
    sessionSelectScreen.classList.add('hidden');
    tutorialScreen.classList.add('hidden');
    consecutiveLosses = 0; // Reset losses on home screen
    levelSelectScreen.classList.add('hidden');
    characterSelectScreen.classList.add('hidden');
    levelCompleteScreen.classList.add('hidden');
    gameUI.classList.add('hidden'); // Hide HUD on home screen
    pauseBtn.classList.add('hidden'); // Hide pause button on home screen
    if (touchControls) touchControls.classList.add('hidden');
    if (highScoreDisplay) highScoreDisplay.innerText = highScore;
    updateSessionButtons(); // Update session locks    
    // Stop other music and play home music. playMusic handles the switch.
    playMusic('home');       // Play home music
    canvas.style.display = 'none'; // Hide canvas so home screen appears separately (and doesn't draw over)
    updateCurrencyDisplay();
}

function hideHomeScreen() {
    homeScreen.classList.add('hidden');
    if (touchControls && touchEnabled) {
        touchControls.classList.remove('hidden');
    }
    gameUI.classList.remove('hidden'); // Show HUD
    canvas.style.display = 'block'; // Show canvas when game starts
}

function showGameOverMenu(win) {
    gameOverScreen.classList.remove('hidden');
    if (touchControls) touchControls.classList.add('hidden');
    gameUI.classList.add('hidden'); // Hide HUD
    pauseBtn.classList.add('hidden'); // Hide pause button on game over
    
    if (win) {
        gameOverTitle.innerText = "YOU WIN!";
        gameOverTitle.style.color = "gold";
        if (skipLevelBtn) skipLevelBtn.classList.add('hidden'); // Hide skip on win
    } else {
        gameOverTitle.innerText = "GAME OVER";
        gameOverTitle.style.color = "#e74c3c";
        
        // Show Skip Button if lost 3 or more times
        if (skipLevelBtn) {
            if (consecutiveLosses >= 3) {
                skipLevelBtn.classList.remove('hidden');
            } else {
                skipLevelBtn.classList.add('hidden');
            }
        }
    }
}

// --- Difficulty Scaling ---
function getDifficultyFactor() {
    // No scaling for the first 3 levels.
    // Then, increase difficulty by 8% each level.
    // Capped at a 2x multiplier.
    const scalingStartsAtLevel = 3; // Scaling begins on Level 4
    const factorPerLevel = 0.12; // Increased difficulty scaling
    if (currentLevelIndex < scalingStartsAtLevel) {
        return 1.0;
    }
    const multiplier = 1.0 + (currentLevelIndex - scalingStartsAtLevel) * factorPerLevel;
    return Math.min(2.0, multiplier); // Cap at 2x difficulty
}

// Set initial state of sound toggle and add listener to save changes
soundToggle.checked = soundEnabled;
soundToggle.addEventListener('change', () => {
    soundEnabled = soundToggle.checked;
    saveData.soundEnabled = soundEnabled;
    saveGameData();
});

// --- Touch Controls Toggle ---
if (touchToggle) {
    touchToggle.checked = touchEnabled;
    touchToggle.addEventListener('change', () => {
        touchEnabled = touchToggle.checked;
        saveData.touchEnabled = touchEnabled;
        saveGameData();
        // Update visibility immediately if playing
        if (gameState === 'PLAYING' && touchControls) {
            if (touchEnabled) touchControls.classList.remove('hidden');
            else touchControls.classList.add('hidden');
        }
    });
}

// --- Graphics Toggle Logic ---
let graphicsMode = saveData.graphics || 'auto'; // Default to Smooth for Photos

function applyGraphics() {
    if (graphicsMode === 'pixelated') {
        canvas.style.imageRendering = 'pixelated';
    } else {
        canvas.style.imageRendering = 'auto'; // Smooth/Blurry
    }
}

if (graphicsToggle) {
    graphicsToggle.checked = (graphicsMode === 'pixelated');
    graphicsToggle.addEventListener('change', () => {
        graphicsMode = graphicsToggle.checked ? 'pixelated' : 'auto';
        saveData.graphics = graphicsMode;
        saveGameData();
        applyGraphics(); // Apply immediately
        playSound('click');
    });
}
applyGraphics(); // Apply on startup

// --- Volume Slider Logic ---
if (volumeSlider) {
    volumeSlider.value = globalVolume;
    volumeSlider.addEventListener('input', (e) => {
        globalVolume = parseFloat(e.target.value);
        saveData.volume = globalVolume;
        saveGameData();
    });
}

// --- Music Volume Slider Logic ---
if (musicVolumeSlider) {
    musicVolumeSlider.value = musicVolume;
    musicVolumeSlider.addEventListener('input', (e) => {
        musicVolume = parseFloat(e.target.value);
        saveData.musicVolume = musicVolume;
        saveGameData();
        setMusicVolume(musicVolume);
    });
}

// --- Settings & Tutorial Logic ---
settingsIconBtn.addEventListener('click', () => {
    playSound('click');
    settingsMenu.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
    playSound('click');
    settingsMenu.classList.add('hidden');
});

tutorialBtn.addEventListener('click', () => {
    playSound('click');
    tutorialScreen.classList.remove('hidden');
});

// --- Edit Controls Logic ---
function selectEditButton(btn) {
    if (selectedEditButton) {
        // Reset style of previously selected button
        selectedEditButton.style.borderColor = "rgba(255, 255, 255, 0.5)"; 
        selectedEditButton.style.zIndex = "";
    }
    selectedEditButton = btn;
    if (btn) {
        // Highlight new selection
        btn.style.borderColor = "#e74c3c"; // Red highlight
        btn.style.zIndex = "1000"; // Bring to top
        
        // Update slider to match this button's current size
        const currentWidth = parseFloat(btn.style.width) || 70;
        const scale = currentWidth / 70;
        if (controlSizeSlider) controlSizeSlider.value = scale;
    }
}

function applySavedControls() {
    const saved = saveData.controlLayout;
    if (saved) {
        ['left-btn', 'right-btn', 'jump-btn', 'dash-btn', 'grapple-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn && saved[id]) {
                btn.style.position = 'fixed';
                btn.style.left = saved[id].left;
                btn.style.top = saved[id].top;
                btn.style.bottom = 'auto';
                btn.style.right = 'auto';
                
                // Apply saved size if it exists
                if (saved[id].width) btn.style.width = saved[id].width;
                if (saved[id].height) btn.style.height = saved[id].height;
                if (saved[id].fontSize) btn.style.fontSize = saved[id].fontSize;
            }
        });
    }
}
// Apply saved positions on startup
applySavedControls();

if (editControlsBtn) {
    editControlsBtn.addEventListener('click', () => {
        playSound('click');
        settingsMenu.classList.add('hidden');
        homeScreen.classList.add('hidden'); // Hide home screen to see controls clearly
        
        // Show controls and edit UI
        if (touchControls) touchControls.classList.remove('hidden');
        editUI.classList.remove('hidden');
        isEditingControls = true;

        // Visual cue for editing
        document.querySelectorAll('#touch-controls button').forEach(btn => {
            btn.style.border = '2px dashed #f1c40f';
            btn.style.transform = 'scale(1.1)';
        });
        
        // Auto-select the jump button initially so slider works immediately
        const jumpBtn = document.getElementById('jump-btn');
        if (jumpBtn) selectEditButton(jumpBtn);
    });
}

if (controlSizeSlider) {
    controlSizeSlider.addEventListener('input', (e) => {
        const scale = parseFloat(e.target.value);
        if (selectedEditButton) {
            const baseSize = 70; // Default CSS size
            const baseFont = 24; // Default font size
            selectedEditButton.style.width = (baseSize * scale) + 'px';
            selectedEditButton.style.height = (baseSize * scale) + 'px';
            selectedEditButton.style.fontSize = (baseFont * scale) + 'px';
        }
    });
}

if (saveControlsBtn) {
    saveControlsBtn.addEventListener('click', () => {
        playSound('click');
        // Save positions
        const layout = {};
        ['left-btn', 'right-btn', 'jump-btn', 'dash-btn', 'grapple-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                const rect = btn.getBoundingClientRect();
                layout[id] = {
                    left: rect.left + 'px',
                    top: rect.top + 'px'
                };
                // Save individual sizes
                if (btn.style.width) layout[id].width = btn.style.width;
                if (btn.style.height) layout[id].height = btn.style.height;
                if (btn.style.fontSize) layout[id].fontSize = btn.style.fontSize;

                // Reset visual styles
                btn.style.border = '';
                btn.style.transform = '';
            }
        });
        saveData.controlLayout = layout;
        saveGameData();
        
        isEditingControls = false;
        editUI.classList.add('hidden');
        homeScreen.classList.remove('hidden');
        settingsMenu.classList.remove('hidden');
        
        // Hide controls again if we are not playing
        if (gameState !== 'PLAYING') {
            touchControls.classList.add('hidden');
        }
    });
}

if (resetControlsBtn) {
    resetControlsBtn.addEventListener('click', () => {
        playSound('click');
        if (confirm("Reset controls to default positions and size?")) {
            delete saveData.controlLayout;
            saveGameData();
            
            // Reset styles
            ['left-btn', 'right-btn', 'jump-btn', 'dash-btn', 'grapple-btn'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.style.position = ''; // Revert to CSS flexbox
                    btn.style.left = '';
                    btn.style.top = '';
                    btn.style.width = ''; // Revert to CSS size
                    btn.style.height = '';
                    btn.style.fontSize = '';
                }
            });
            controlSizeSlider.value = 1;
        }
    });
}

function makeDraggable(btn) {
    let offsetX, offsetY;
    
    const onStart = (e) => {
        if (!isEditingControls) return;
        e.preventDefault();
        e.stopPropagation();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = btn.getBoundingClientRect();
        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;
        
        // Select this button for resizing
        selectEditButton(btn);

        const onMove = (moveEvent) => {
            if (!isEditingControls) return;
            moveEvent.preventDefault();
            const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
            
            btn.style.position = 'fixed';
            btn.style.left = (moveX - offsetX) + 'px';
            btn.style.top = (moveY - offsetY) + 'px';
            btn.style.bottom = 'auto';
            btn.style.right = 'auto';
        };

        const onEnd = () => {
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
        };

        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    };

    btn.addEventListener('touchstart', onStart, { passive: false });
    btn.addEventListener('mousedown', onStart);
}

if (privacyBtn) {
    privacyBtn.addEventListener('click', () => {
        playSound('click');
        window.location.href = 'privacy.html';
    });
}

closeTutorialBtn.addEventListener('click', () => {
    playSound('click');
    tutorialScreen.classList.add('hidden');
});

// --- Reset Progress Logic ---
if (resetProgressBtn) {
    resetProgressBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to lock all levels? This will reset your progress.")) {
            saveData.maxLevel = 0;
            saveData.currentLevel = 0;
            saveGameData();
            maxLevelReached = 0;
            if (session2Btn) {
                session2Btn.disabled = true;
                session2Btn.innerText = "SESSION 2 🔒";
            }
            if (session3Btn) {
                session3Btn.disabled = true;
                session3Btn.innerText = "SESSION 3 🔒";
            }
            if (session4Btn) {
                session4Btn.disabled = true;
                session4Btn.innerText = "SESSION 4 🔒";
            }
            if (session5Btn) {
                session5Btn.disabled = true;
                session5Btn.innerText = "SESSION 5 🔒";
            }
            updateSessionButtons();

            populateLevelSelect(); // Refresh the buttons to show locks
            playSound('click');
        }
    });
}

// --- Level Select Logic ---
let currentSessionStart = 0;
let currentSessionEnd = 20;

if (session1Btn) {
    session1Btn.addEventListener('click', () => {
        playSound('click');
        currentSessionStart = 0;
        currentSessionEnd = 25;
        document.querySelector('#level-select-screen h2').innerText = "SESSION 1";
        populateLevelSelect();
        sessionSelectScreen.classList.add('hidden');
        levelSelectScreen.classList.remove('hidden');
    });
}

session2Btn.addEventListener('click', () => {
    playSound('click');
    currentSessionStart = 25;
    currentSessionEnd = 50;
    document.querySelector('#level-select-screen h2').innerText = "SESSION 2";
    populateLevelSelect();
    sessionSelectScreen.classList.add('hidden');
    levelSelectScreen.classList.remove('hidden');
});

if (session3Btn) {
    session3Btn.addEventListener('click', () => {
        playSound('click');
        currentSessionStart = 50;
        currentSessionEnd = 75;
        document.querySelector('#level-select-screen h2').innerText = "SESSION 3";
        populateLevelSelect();
        sessionSelectScreen.classList.add('hidden');
        levelSelectScreen.classList.remove('hidden');
    });
}
if (session4Btn) {
    session4Btn.addEventListener('click', () => {
        playSound('click');
        currentSessionStart = 75;
        currentSessionEnd = 100;
        document.querySelector('#level-select-screen h2').innerText = "SESSION 4";
        populateLevelSelect();
        sessionSelectScreen.classList.add('hidden');
        levelSelectScreen.classList.remove('hidden');
    });
}
if (session5Btn) {
    session5Btn.addEventListener('click', () => {
        playSound('click');
        currentSessionStart = 100;
        currentSessionEnd = 125;
        document.querySelector('#level-select-screen h2').innerText = "SESSION 5";
        populateLevelSelect();
        sessionSelectScreen.classList.add('hidden');
        levelSelectScreen.classList.remove('hidden');
    });
}

closeLevelsBtn.addEventListener('click', () => {
    playSound('click');
    levelSelectScreen.classList.add('hidden');
    sessionSelectScreen.classList.remove('hidden'); // Go back to session select
});

closeSessionsBtn.addEventListener('click', () => {
    playSound('click');
    sessionSelectScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
});

function populateLevelSelect() {
    levelsContainer.innerHTML = '';
    levels.slice(currentSessionStart, currentSessionEnd).forEach((level, i) => {
        const index = currentSessionStart + i; // Calculate real index
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        
        if (index > maxLevelReached) {
            btn.classList.add('locked');
            btn.innerText = '🔒';
            btn.disabled = true; // Disable the button so it cannot be clicked
        } else {
            btn.innerText = index + 1;
            btn.addEventListener('click', () => {
                playSound('click');
                // Force landscape mode on mobile (Removed - unreliable)
                // playMusic will handle stopping the old track, so stopMusic() is not needed here.
                currentLevelIndex = index;
                score = 0; // Reset score for new run
                consecutiveLosses = 0; // Reset losses
                gameState = 'PLAYING';
                hideHomeScreen();
                levelSelectScreen.classList.add('hidden');
                reset(true); // Keep the level index we just set
                playMusic('music');
            });
        }
        levelsContainer.appendChild(btn);
    });
}

// --- Custom Popup Logic ---
function showMessage(title, text) {
    if(messagePopup) {
        messageTitle.innerText = title;
        messageText.innerText = text;
        messagePopup.classList.remove('hidden');
    } else {
        alert(text);
    }
}

function showConfirm(title, text, onYes) {
    if(confirmPopup) {
        confirmTitle.innerText = title;
        confirmText.innerText = text;
        confirmCallback = onYes;
        confirmPopup.classList.remove('hidden');
    } else {
        if(confirm(text)) {
            onYes();
        }
    }
}

if(messageOkBtn) {
    messageOkBtn.addEventListener('click', () => {
        playSound('click');
        messagePopup.classList.add('hidden');
    });
}

if(confirmYesBtn) {
    confirmYesBtn.addEventListener('click', () => {
        playSound('click');
        confirmPopup.classList.add('hidden');
        if(confirmCallback) confirmCallback();
        confirmCallback = null;
    });
}

if(confirmNoBtn) {
    confirmNoBtn.addEventListener('click', () => {
        playSound('click');
        confirmPopup.classList.add('hidden');
        confirmCallback = null;
    });
}

// --- Background Animation Data & Selection ---
const backgroundAnimations = {
    'indianGradient': { name: 'India', price: 0 },
    'starfield': { name: 'Space', price: 500 },
    'retroGrid': { name: 'Retro', price: 1000 },
    'matrix': { name: 'Matrix', price: 1500 },
    'fire': { name: 'Inferno', price: 2000 },
    'snow': { name: 'Blizzard', price: 2500 },
    'rain': { name: 'Storm', price: 3000 },
    'underwater': { name: 'Ocean', price: 3500 },
    'cyberpunk': { name: 'Neon', price: 4000 },
    'forest': { name: 'Forest', price: 5000 }
};

function populateBackgroundAnimationSelect() {
    const container = document.getElementById('background-animation-select');
    container.innerHTML = ''; // Clear existing options

    const grid = document.createElement('div');
    grid.className = 'bg-options-grid';

    for (const animKey in backgroundAnimations) {
        const anim = backgroundAnimations[animKey];

        const card = document.createElement('div');
        card.className = 'bg-option';
        
        const isUnlocked = unlockedBackgrounds.includes(animKey);
        const isSelected = animKey === selectedBackgroundAnimation;

        if (isSelected) card.classList.add('selected');
        if (!isUnlocked) card.classList.add('locked');

        // Preview Canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'bg-preview';
        canvas.width = 140;
        canvas.height = 100;
        
        // Draw static preview
        const ctxPreview = canvas.getContext('2d');
        drawBackgroundPreview(ctxPreview, animKey, 140, 100);

        // HTML Structure
        card.innerHTML = `
            <div class="bg-name">${anim.name}</div>
            ${isUnlocked 
                ? (isSelected ? '<div style="color:#2ecc71;font-size:12px;margin-top:auto;">SELECTED</div>' : '<div style="color:#aaa;font-size:12px;margin-top:auto;">OWNED</div>')
                : `<button class="buy-bg-btn">💰 ${anim.price}</button>`
            }
        `;
        
        // Insert canvas at the top
        card.insertBefore(canvas, card.firstChild);

        card.onclick = (e) => {
            if (isUnlocked) {
                playSound('click');
                selectedBackgroundAnimation = animKey;
                saveData.backgroundAnimation = selectedBackgroundAnimation;
                saveGameData();
                updateBackgroundCache(); // Refresh cache on change
                populateBackgroundAnimationSelect(); // Refresh UI to show selection
            } else {
                // Buy Logic
                // Fix: Use closest to handle clicks on text/icons inside button
                if (e.target.closest('.buy-bg-btn')) {
                    if (totalCoins >= anim.price) {
                        showConfirm("UNLOCK BACKGROUND", `Buy ${anim.name} for ${anim.price} Coins?`, () => {
                            playSound('coin');
                            totalCoins -= anim.price;
                            unlockedBackgrounds.push(animKey);
                            
                            // Save Data
                            saveData.totalCoins = totalCoins;
                            saveData.unlockedBackgrounds = unlockedBackgrounds;
                            
                            // Auto-select
                            selectedBackgroundAnimation = animKey;
                            saveData.backgroundAnimation = selectedBackgroundAnimation;
                            saveGameData();
                            updateBackgroundCache();
                            
                            updateCurrencyDisplay();
                            populateBackgroundAnimationSelect();
                            showMessage("SUCCESS", `${anim.name} Unlocked!`);
                        });
                    } else {
                        showMessage("LOCKED", "Not enough coins!");
                    }
                }
            }
        };

        grid.appendChild(card);
    }
    container.appendChild(grid);
}

// Helper to draw previews in the settings menu
function drawBackgroundPreview(ctx, type, w, h) {
    ctx.save();
    // Fill background
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);
    
    if (type === 'indianGradient') {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#ff9933'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#138808');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'navy'; ctx.beginPath(); ctx.arc(w/2, h/2, 10, 0, Math.PI*2); ctx.stroke();
    } else if (type === 'starfield') {
        ctx.fillStyle = "white";
        for(let i=0; i<20; i++) ctx.fillRect(Math.random()*w, Math.random()*h, 1, 1);
    } else if (type === 'retroGrid') {
        ctx.fillStyle = "#2c003e"; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle = "magenta"; ctx.beginPath();
        ctx.moveTo(0, h*0.8); ctx.lineTo(w, h*0.8);
        ctx.moveTo(w/2, h/2); ctx.lineTo(0, h);
        ctx.moveTo(w/2, h/2); ctx.lineTo(w, h);
        ctx.stroke();
    } else if (type === 'matrix') {
        ctx.fillStyle = "black"; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "#0f0"; ctx.font = "10px monospace";
        ctx.fillText("1 0 1", 10, 20); ctx.fillText("0 1 0", 50, 40);
    } else if (type === 'fire') {
        const g = ctx.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, "red"); g.addColorStop(1, "yellow");
        ctx.fillStyle = g; ctx.fillRect(0, h/2, w, h/2);
    } else if (type === 'snow') {
        ctx.fillStyle = "#34495e"; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "white";
        for(let i=0; i<10; i++) ctx.beginPath(), ctx.arc(Math.random()*w, Math.random()*h, 2, 0, Math.PI*2), ctx.fill();
    } else if (type === 'rain') {
        ctx.fillStyle = "#001"; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle = "cyan"; ctx.beginPath();
        for(let i=0; i<10; i++) { let x = Math.random()*w; ctx.moveTo(x, 0); ctx.lineTo(x-5, 10); }
        ctx.stroke();
    } else if (type === 'underwater') {
        ctx.fillStyle = "#004466"; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.arc(w/2, h/2, 5, 0, Math.PI*2); ctx.stroke();
    } else if (type === 'cyberpunk') {
        ctx.fillStyle = "#050510"; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "cyan"; ctx.fillRect(10, 10, 20, 40);
        ctx.fillStyle = "magenta"; ctx.fillRect(40, 20, 30, 10);
    } else if (type === 'forest') {
        ctx.fillStyle = "#052e16"; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "#14532d"; ctx.beginPath(); ctx.moveTo(10, h); ctx.lineTo(20, h-20); ctx.lineTo(30, h); ctx.fill();
    }
    ctx.restore();
}

// --- Land Color Data & Selection ---
const landColors = {
    'default': { name: 'Default (Dynamic)', color: 'lime', price: 0 },
    'grass': { name: 'Grass Green', color: '#2ecc71', price: 100 },
    'dirt': { name: 'Dirt Brown', color: '#8B4513', price: 200 },
    'stone': { name: 'Stone Grey', color: '#7f8c8d', price: 300 },
    'sand': { name: 'Desert Sand', color: '#f1c40f', price: 400 },
    'snow': { name: 'Snow White', color: '#ecf0f1', price: 500 },
    'lava': { name: 'Magma Red', color: '#c0392b', price: 600 },
    'water': { name: 'Ocean Blue', color: '#3498db', price: 700 },
    'midnight': { name: 'Midnight', color: '#2c3e50', price: 800 },
    'void': { name: 'Void Black', color: '#000000', price: 900 },
    'gold': { name: 'Pure Gold', color: '#ffd700', price: 1000 },
    'silver': { name: 'Silver', color: '#bdc3c7', price: 1100 },
    'pink': { name: 'Bubblegum', color: '#ff69b4', price: 1200 },
    'toxic': { name: 'Toxic Slime', color: '#7fff00', price: 1300 },
    'purple': { name: 'Royal Purple', color: '#8e44ad', price: 1400 },
    'orange': { name: 'Sunset Orange', color: '#e67e22', price: 1500 },
    'teal': { name: 'Teal', color: '#16a085', price: 1600 },
    'maroon': { name: 'Maroon', color: '#800000', price: 1700 },
    'olive': { name: 'Olive', color: '#808000', price: 1800 },
    'navy': { name: 'Navy Blue', color: '#000080', price: 1900 },
    'chocolate': { name: 'Chocolate', color: '#d2691e', price: 2000 },
    'mint': { name: 'Mint Green', color: '#98ff98', price: 2100 },
    'crimson': { name: 'Crimson', color: '#dc143c', price: 2200 },
    'steel': { name: 'Steel Blue', color: '#4682b4', price: 2300 }
};

function populateLandSelect() {
    landSelectContainer.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'bg-options-grid'; // Reuse existing grid class

    for (const key in landColors) {
        const land = landColors[key];
        const card = document.createElement('div');
        card.className = 'bg-option'; // Reuse existing card class

        const isUnlocked = unlockedLandColors.includes(key);
        const isSelected = key === selectedLandColor;

        if (isSelected) card.classList.add('selected');
        if (!isUnlocked) card.classList.add('locked');

        // Preview Canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'bg-preview';
        canvas.width = 140;
        canvas.height = 100;
        const ctxPreview = canvas.getContext('2d');
        
        // Draw Preview Block
        ctxPreview.fillStyle = "#222";
        ctxPreview.fillRect(0, 0, 140, 100);
        // Draw a 3D block in center
        const colorToDraw = (key === 'default') ? 'lime' : land.color;
        draw3DBlockPreview(ctxPreview, 30, 30, 80, 40, colorToDraw);

        card.innerHTML = `
            <div class="bg-name">${land.name}</div>
            ${isUnlocked 
                ? (isSelected ? '<div style="color:#2ecc71;font-size:12px;margin-top:auto;">SELECTED</div>' : '<div style="color:#aaa;font-size:12px;margin-top:auto;">OWNED</div>')
                : `<button class="buy-bg-btn">💰 ${land.price}</button>`
            }
        `;
        card.insertBefore(canvas, card.firstChild);

        card.onclick = (e) => {
            if (isUnlocked) {
                playSound('click');
                selectedLandColor = key;
                saveData.landColor = selectedLandColor;
                saveGameData();
                populateLandSelect();
            } else {
                if (e.target.closest('.buy-bg-btn')) {
                    if (totalCoins >= land.price) {
                        showConfirm("UNLOCK LAND", `Buy ${land.name} for ${land.price} Coins?`, () => {
                            playSound('coin');
                            totalCoins -= land.price;
                            unlockedLandColors.push(key);
                            saveData.totalCoins = totalCoins;
                            saveData.unlockedLandColors = unlockedLandColors;
                            selectedLandColor = key;
                            saveData.landColor = selectedLandColor;
                            saveGameData();
                            updateCurrencyDisplay();
                            populateLandSelect();
                            showMessage("SUCCESS", `${land.name} Unlocked!`);
                        });
                    } else {
                        showMessage("LOCKED", "Not enough coins!");
                    }
                }
            }
        };
        grid.appendChild(card);
    }
    landSelectContainer.appendChild(grid);
}

// Helper for Land Preview
function draw3DBlockPreview(ctx, x, y, w, h, color) {
    const depth = 10;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.2)"; // Side
    ctx.beginPath(); ctx.moveTo(x+w, y); ctx.lineTo(x+w+depth, y-depth); ctx.lineTo(x+w+depth, y+h-depth); ctx.lineTo(x+w, y+h); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)"; // Top
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x+depth, y-depth); ctx.lineTo(x+w+depth, y-depth); ctx.lineTo(x+w, y); ctx.fill();
}

// --- Character Data & Selection ---
const characters = {
    'cyan': { name: 'Pixel Bot', color: 'cyan', price: 0, ability: 'Balanced' },
    'green': { name: 'Slime', color: '#2ecc71', price: 500, ability: 'Super Jump' },
    'purple': { name: 'Void', color: '#9b59b6', price: 1000, ability: 'Long Dash' },
    'orange': { name: 'Inferno', color: '#e67e22', price: 2000, ability: 'Super Speed' },
    'red': { name: 'Crimson', color: '#e74c3c', price: 3500, ability: 'Start w/ Shield' },
    'gold': { name: 'Midas', color: '#f1c40f', price: 5000, ability: 'Double Coins' },
    'dark': { name: 'Ninja', color: '#2c3e50', price: 8000, ability: 'Triple Jump' },
    'walker': { name: 'Red Walker', color: '#c0392b', price: 3000, ability: 'Fast & Agile' },
    'flyer': { name: 'Purple Flyer', color: '#8e44ad', price: 4500, ability: 'Moon Gravity' },
    'shooter': { name: 'Mecha Turret', color: '#34495e', price: 6000, ability: 'Start w/ Shield' },
    'boss': { name: 'The Boss', color: '#8e44ad', price: 15000, ability: 'Giant Size' }
};

// Helper function to draw character previews on UI Canvas
function drawCharacterPreview(ctx, charKey, color) {
    // Clear canvas
    ctx.clearRect(0, 0, 100, 100);
    
    // Scale and center
    ctx.save();
    ctx.translate(50, 50); // Center of 100x100
    ctx.scale(2.0, 2.0); // Double size for better visibility
    ctx.translate(-15, -15); // Offset to center the 30x30 character

    if (charKey === 'walker') {
        // Walker Skin
        ctx.fillStyle = "#922b21"; 
        ctx.fillRect(5, 25, 8, 12); // Leg
        ctx.fillRect(17, 25, 8, 12); // Leg
        ctx.fillStyle = "#c0392b";
        ctx.fillRect(0, 0, 30, 30); // Body
        ctx.fillStyle = "white";
        ctx.fillRect(4, 6, 8, 8); ctx.fillRect(18, 6, 8, 8); // Eyes
        ctx.fillStyle = "black";
        ctx.fillRect(6, 8, 4, 4); ctx.fillRect(20, 8, 4, 4); // Pupils
        // Eyebrows
        ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(12, 8); ctx.lineTo(12, 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(28, 4); ctx.lineTo(18, 8); ctx.lineTo(18, 2); ctx.fill();

    } else if (charKey === 'flyer') {
        // Flyer Skin
        ctx.fillStyle = "#6c3483"; 
        ctx.fillRect(8, 25, 4, 10); ctx.fillRect(18, 25, 4, 10); // Legs
        ctx.fillStyle = "#8e44ad";
        ctx.fillRect(0, 0, 30, 30); // Body
        // Wings
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-12, -5); ctx.lineTo(0, 5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(30, 10); ctx.lineTo(42, -5); ctx.lineTo(30, 5); ctx.fill();
        // Eye
        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(10, 8, 10, 8);

    } else if (charKey === 'shooter') {
        // Shooter Skin
        ctx.fillStyle = "#2c3e50";
        ctx.beginPath(); ctx.moveTo(5, 25); ctx.lineTo(-8, 40); ctx.lineTo(5, 30); ctx.fill(); // Leg
        ctx.beginPath(); ctx.moveTo(25, 25); ctx.lineTo(38, 40); ctx.lineTo(25, 30); ctx.fill(); // Leg
        ctx.fillStyle = "#34495e";
        ctx.fillRect(0, 0, 30, 30); // Body
        ctx.fillStyle = "black";
        ctx.fillRect(30, 8, 8, 8); // Barrel
        ctx.fillStyle = "red";
        ctx.fillRect(11, 4, 8, 4); // Sensor

    } else if (charKey === 'boss') {
        // Boss Skin
        ctx.fillStyle = "#8e44ad";
        ctx.fillRect(-5, -5, 40, 40); // Big Body
        ctx.fillStyle = "white";
        ctx.fillRect(5, 5, 10, 10); ctx.fillRect(25, 5, 10, 10); // Eyes
        ctx.fillStyle = "red";
        ctx.fillRect(7, 7, 6, 6); ctx.fillRect(27, 7, 6, 6); // Pupils

    } else {
        // Default Robot (Pixel Bot)
        // Back Limbs
        ctx.fillStyle = "#2c3e50";
        ctx.fillRect(-3, 10, 6, 15); // Arm
        ctx.fillRect(6, 24, 12, 6); // Foot
        // Body
        ctx.fillStyle = color;
        ctx.fillRect(0, 12, 30, 18);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(4, 16, 22, 10); // Chest
        // Head
        ctx.fillStyle = "#bdc3c7";
        ctx.fillRect(3, 0, 24, 15);
        // Eyes
        ctx.fillStyle = "black";
        ctx.fillRect(8, 6, 4, 4); ctx.fillRect(18, 6, 4, 4);
        // Front Limbs
        ctx.fillStyle = "#34495e";
        ctx.fillRect(12, 10, 6, 15); // Arm
        ctx.fillRect(21, 24, 12, 6); // Foot
    }
    ctx.restore();
}

function populateCharacterSelect() {
    const container = document.getElementById('character-list');
    container.innerHTML = ''; // Clear existing options to prevent duplicates

    // Define Groups
    const heroKeys = ['cyan', 'green', 'purple', 'orange', 'red', 'gold', 'dark'];
    const villainKeys = ['walker', 'flyer', 'shooter', 'boss'];

    const createGroup = (title, keys) => {
        // Create Header
        const header = document.createElement('h3');
        header.className = 'char-section-title';
        header.innerText = title;
        container.appendChild(header);

        // Create Options Container
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'character-options';
        
        keys.forEach(charKey => {
            if (!characters[charKey]) return;
            const charData = characters[charKey];
            const option = document.createElement('div');
            option.className = 'character-option';
            const isUnlocked = unlockedCharacters.includes(charKey);
            const isSelected = charKey === selectedCharacter;

            if (isSelected) option.classList.add('selected');
            if (!isUnlocked) option.classList.add('locked');

            option.dataset.char = charKey;
            
            // HTML Structure for Card
            option.innerHTML = `
                <canvas class="char-preview" width="100" height="100"></canvas>
                <div class="char-name">${charData.name}</div>
                <div class="char-ability">${charData.ability}</div>
                ${isUnlocked 
                    ? (isSelected ? '<div style="color:#2ecc71;font-size:12px;">SELECTED</div>' : '<div style="color:#aaa;font-size:12px;">OWNED</div>')
                    : `<button class="buy-char-btn">💰 ${charData.price}</button>`
                }
            `;

            // Draw the character preview
            const ctx = option.querySelector('canvas').getContext('2d');
            drawCharacterPreview(ctx, charKey, charData.color);

            // Click Handler
            option.onclick = (e) => {
                if (isUnlocked) {
                    // Select Character
                    playSound('click');
                    selectedCharacter = charKey;
                    saveData.selectedCharacter = selectedCharacter;
                    saveGameData();
                    populateCharacterSelect(); // Refresh UI
                } else {
                    // Buy Character
                    if (e.target.closest('.buy-char-btn')) {
                        if (totalCoins >= charData.price) {
                            showConfirm("UNLOCK HERO", `Buy ${charData.name} for ${charData.price} Coins?`, () => {
                                playSound('coin');
                                totalCoins -= charData.price;
                                unlockedCharacters.push(charKey);
                                
                                // Save Data
                                saveData.totalCoins = totalCoins;
                                saveData.unlockedCharacters = unlockedCharacters;
                                
                                // Auto-select and refresh
                                selectedCharacter = charKey;
                                saveData.selectedCharacter = selectedCharacter;
                                saveGameData();
                                
                                updateCurrencyDisplay();
                                populateCharacterSelect();
                                showMessage("SUCCESS", `${charData.name} Unlocked!`);
                            });
                        } else {
                            showMessage("LOCKED", "Not enough coins!");
                        }
                    }
                }
            };
            optionsContainer.appendChild(option);
        });
        container.appendChild(optionsContainer);
    };

    // Create the two sections
    createGroup("HEROES", heroKeys);
    createGroup("VILLAINS", villainKeys);
}

characterBtn.addEventListener('click', () => {
    playSound('click');
    homeScreen.classList.add('hidden');
    populateCharacterSelect(); // Refresh selection state
    characterSelectScreen.classList.remove('hidden');
});

// --- Background Animation Button Logic ---
if (bgAnimBtn) {
    bgAnimBtn.addEventListener('click', () => {
        playSound('click');
        homeScreen.classList.add('hidden');
        populateBackgroundAnimationSelect(); // Refresh UI
        backgroundSelectScreen.classList.remove('hidden');
    });
}

if (closeBgBtn) {
    closeBgBtn.addEventListener('click', () => {
        playSound('click');
        backgroundSelectScreen.classList.add('hidden');
        homeScreen.classList.remove('hidden');
    });
}

// --- Land Button Logic ---
if (landBtn) {
    landBtn.addEventListener('click', () => {
        playSound('click');
        homeScreen.classList.add('hidden');
        populateLandSelect();
        landSelectScreen.classList.remove('hidden');
    });
}
if (closeLandBtn) {
    closeLandBtn.addEventListener('click', () => {
        playSound('click');
        landSelectScreen.classList.add('hidden');
        homeScreen.classList.remove('hidden');
    });
}

// --- Watch Ad Button Logic ---
function updateAdButton() {
    if (watchAdBtn) {
        watchAdBtn.style.display = 'none'; // Hide ad button for no-ads version
    }
}

if (watchAdBtn) {
    updateAdButton(); // Initial check
    watchAdBtn.addEventListener('click', () => {
        playSound('click');
    });
}

closeCharacterBtn.addEventListener('click', () => {
    playSound('click');
    characterSelectScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
});

if (randomCharBtn) {
    randomCharBtn.addEventListener('click', () => {
        playSound('click');
        if (unlockedCharacters.length > 0) {
            const randomIndex = Math.floor(Math.random() * unlockedCharacters.length);
            selectedCharacter = unlockedCharacters[randomIndex];
            saveData.selectedCharacter = selectedCharacter;
            saveGameData();
            populateCharacterSelect(); // Refresh UI to show selection
        }
    });
}

// --- LEVEL DATA ---
let platforms = [];
let enemies = [];
let coins = [];
let projectiles = [];
let goal = {};
let powerUps = [];
let playerStart = {};
let checkpoints = [];
let respawnPoint = {};

const levels = [
  // Level 1 - Now wider!
  {
    width: 1600, // Level width
    height: 400, // Level height
    platforms: [
      { x: 0, y: 350, w: 1000, h: 50, fake: false }, // Longer ground
      { x: 300, y: 260, w: 120, h: 20, fake: true },
      { x: 450, y: 180, w: 100, h: 20, fake: false, dx: 2 },
      { x: 1100, y: 350, w: 500, h: 50, fake: false }, // More ground
      { x: 1200, y: 250, w: 100, h: 20, fake: false },
      { x: 1400, y: 150, w: 100, h: 20, fake: false },
    ],
    enemies: [
      { x: 200, y: 320, w: 30, h: 30, dx: 1.5, patrol: 150, type: 'patrol' },
      { x: 600, y: 100, w: 35, h: 25, dy: 1, patrol: 80, type: 'fly' },
      { x: 1300, y: 320, w: 30, h: 30, dx: 2, patrol: 50, type: 'patrol' },
    ],
    coins: [
      { x: 100, y: 300, w: 15, h: 15 },
      { x: 150, y: 300, w: 15, h: 15 },
      { x: 350, y: 230, w: 15, h: 15 },
      { x: 500, y: 150, w: 15, h: 15 },
      { x: 1250, y: 220, w: 15, h: 15 },
      { x: 1450, y: 120, w: 15, h: 15 },
    ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 1550, y: 300, w: 20, h: 50 }, // Goal at the far end
    checkpoints: [
      { x: 800, y: 300, w: 20, h: 50, activated: false }
    ]
  },
  // Level 2
  {
    width: 800,
    height: 400,
    platforms: [
      { x: 0, y: 350, w: 150, h: 50, fake: false },
      { x: 250, y: 280, w: 100, h: 20, fake: false },
      { x: 450, y: 220, w: 100, h: 20, fake: false, dx: -1.5 },
      { x: 650, y: 150, w: 100, h: 20, fake: false },
      { x: 400, y: 350, w: 150, h: 50, fake: true }, // Trap! Floor looks real but kills you
      // Gate Structure (Pack Gate)
      { x: 460, y: 250, w: 20, h: 100, fake: true }, // Left Pillar
      { x: 520, y: 250, w: 20, h: 100, fake: true }, // Right Pillar
      { x: 460, y: 230, w: 80, h: 20, fake: true }   // Top Bar
    ],
    enemies: [
      { x: 450, y: 320, w: 30, h: 30, dx: 2, patrol: 50, type: 'patrol' },
      { x: 700, y: 100, w: 35, h: 25, dy: 2, patrol: 40, type: 'fly' }
    ],
    coins: [
      { x: 280, y: 250, w: 15, h: 15 },
      { x: 480, y: 190, w: 15, h: 15 },
      { x: 680, y: 120, w: 15, h: 15 },
      { x: 450, y: 300, w: 15, h: 15 },
    ],
    powerUps: [
      { x: 280, y: 220, w: 25, h: 25, type: 'doubleJump' },
      { x: 600, y: 300, w: 25, h: 25, type: 'shield' }
    ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 490, y: 300, w: 20, h: 50 },
    checkpoints: [
        { x: 420, y: 300, w: 20, h: 50, activated: false }
    ]
  },
  // Level 3 - Vertical Climb
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 100, h: 50 }, { x: 180, y: 300, w: 80, h: 20 }, { x: 350, y: 250, w: 80, h: 20, dx: 1 }, { x: 550, y: 200, w: 80, h: 20, fake: true }, { x: 700, y: 150, w: 100, h: 20 }, { x: 500, y: 100, w: 80, h: 20 }, { x: 300, y: 80, w: 80, h: 20 } ],
    enemies: [ { x: 550, y: 50, w: 35, h: 25, dy: 1, patrol: 40, type: 'fly' } ],
    coins: [ { x: 200, y: 270, w: 15, h: 15 }, { x: 370, y: 220, w: 15, h: 15 }, { x: 570, y: 170, w: 15, h: 15 }, { x: 320, y: 50, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 325, y: 30, w: 20, h: 50 }
  },
  // Level 4 - Long Jumps
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 100, h: 50 }, { x: 250, y: 350, w: 50, h: 20 }, { x: 450, y: 350, w: 50, h: 20 }, { x: 650, y: 350, w: 150, h: 50 } ],
    enemies: [ { x: 680, y: 320, w: 30, h: 30, dx: 2, patrol: 50, type: 'patrol' } ],
    coins: [ { x: 175, y: 320, w: 15, h: 15 }, { x: 375, y: 320, w: 15, h: 15 }, { x: 575, y: 320, w: 15, h: 15 } ],
    powerUps: [ { x: 60, y: 300, w: 25, h: 25, type: 'doubleJump' } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 750, y: 300, w: 20, h: 50 }
  },
  // Level 5 - Moving Platforms
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 100, h: 50 }, { x: 150, y: 300, w: 100, h: 20, dx: 2 }, { x: 400, y: 250, w: 100, h: 20, dx: -2 }, { x: 650, y: 200, w: 100, h: 20, dx: 2 }, { x: 400, y: 150, w: 100, h: 20, dx: -2 }, { x: 150, y: 100, w: 100, h: 20, dx: 2 }, { x: 0, y: 50, w: 100, h: 20 } ],
    enemies: [],
    coins: [ { x: 200, y: 270, w: 15, h: 15 }, { x: 450, y: 220, w: 15, h: 15 }, { x: 700, y: 170, w: 15, h: 15 }, { x: 450, y: 120, w: 15, h: 15 }, { x: 200, y: 70, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 50, y: 0, w: 20, h: 50 }
  },
  // Level 6 - Enemy Gauntlet
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 800, h: 50 }, { x: 385, y: 280, w: 30, h: 70} ],
    enemies: [
        { x: 150, y: 320, w: 30, h: 30, dx: 3, patrol: 40, type: 'patrol' },
        { x: 300, y: 320, w: 30, h: 30, dx: -3, patrol: 40, type: 'patrol' },
        { x: 600, y: 320, w: 30, h: 30, dx: -3, patrol: 40, type: 'patrol' },
        { x: 400, y: 200, w: 35, h: 25, dy: 2, patrol: 100, type: 'fly' },
        // Shooter enemy on a pillar
        { x: 700, y: 320, w: 30, h: 30, type: 'shooter', shootCooldown: 120 }
    ],
    coins: [ { x: 100, y: 250, w: 15, h: 15 }, { x: 250, y: 250, w: 15, h: 15 }, { x: 550, y: 250, w: 15, h: 15 }, { x: 700, y: 250, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 750, y: 300, w: 20, h: 50 }
  },
  // Level 7 - Troll Central
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 100, h: 50 }, { x: 200, y: 280, w: 100, h: 20, fake: true }, { x: 400, y: 220, w: 100, h: 20 }, { x: 600, y: 160, w: 100, h: 20, fake: true }, { x: 400, y: 100, w: 100, h: 20 }, { x: 200, y: 350, w: 600, h: 10, fake: false } ],
    enemies: [],
    coins: [ { x: 420, y: 190, w: 15, h: 15 }, { x: 450, y: 190, w: 15, h: 15 }, { x: 480, y: 190, w: 15, h: 15 }, { x: 420, y: 70, w: 15, h: 15 }, { x: 480, y: 70, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 440, y: 50, w: 20, h: 50 }
  },
  // Level 8 - The Drop
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 50, w: 150, h: 20 }, { x: 700, y: 350, w: 100, h: 50 }, { x: 400, y: 200, w: 80, h: 20, dx: 3 }, { x: 100, y: 280, w: 80, h: 20 } ],
    enemies: [ { x: 200, y: 150, w: 35, h: 25, dy: 2, patrol: 80, type: 'fly' }, { x: 600, y: 250, w: 35, h: 25, dy: -2, patrol: 80, type: 'fly' } ],
    coins: [ { x: 120, y: 250, w: 15, h: 15 }, { x: 430, y: 170, w: 15, h: 15 }, { x: 730, y: 320, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 0 },
    goal: { x: 740, y: 300, w: 20, h: 50 }
  },
  // Level 9 - Double Jump Required
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 150, h: 50 }, { x: 250, y: 300, w: 100, h: 20 }, { x: 400, y: 350, w: 150, h: 20, fake: false }, { x: 700, y: 200, w: 100, h: 20 } ],
    enemies: [],
    coins: [ { x: 450, y: 320, w: 15, h: 15 }, { x: 750, y: 170, w: 15, h: 15 } ],
    powerUps: [ { x: 100, y: 300, w: 25, h: 25, type: 'doubleJump' } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 740, y: 150, w: 20, h: 50 }
  },
  // Level 10 - The Bridge
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 100, h: 50 }, { x: 150, y: 350, w: 500, h: 20 }, { x: 700, y: 350, w: 100, h: 50 } ],
    enemies: [ { x: 200, y: 320, w: 30, h: 30, dx: 2, patrol: 20, type: 'patrol' }, { x: 350, y: 320, w: 30, h: 30, dx: 2, patrol: 20, type: 'patrol' }, { x: 500, y: 320, w: 30, h: 30, dx: 2, patrol: 20, type: 'patrol' } ],
    coins: [ { x: 170, y: 300, w: 15, h: 15 }, { x: 320, y: 300, w: 15, h: 15 }, { x: 470, y: 300, w: 15, h: 15 }, { x: 620, y: 300, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 750, y: 300, w: 20, h: 50 }
  },
  // Level 11 - Remix
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 800, h: 50 }, { x: 100, y: 280, w: 100, h: 20, dx: 2 }, { x: 300, y: 220, w: 100, h: 20, fake: true }, { x: 500, y: 160, w: 100, h: 20, dx: -2 }, { x: 300, y: 100, w: 100, h: 20 } ],
    enemies: [ { x: 150, y: 250, w: 30, h: 30, dx: 2, patrol: 30, type: 'patrol' } ],
    coins: [ { x: 150, y: 250, w: 15, h: 15 }, { x: 550, y: 130, w: 15, h: 15 }, { x: 350, y: 70, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 340, y: 50, w: 20, h: 50 }
  },
  // Level 12
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 100, h: 50 }, { x: 150, y: 350, w: 20, h: 20 }, { x: 220, y: 350, w: 20, h: 20 }, { x: 290, y: 350, w: 20, h: 20 }, { x: 400, y: 300, w: 100, h: 20 }, { x: 550, y: 250, w: 100, h: 20 }, { x: 700, y: 200, w: 100, h: 20 } ],
    enemies: [ { x: 410, y: 270, w: 30, h: 30, dx: 1, patrol: 60, type: 'patrol' } ],
    coins: [ { x: 150, y: 320, w: 15, h: 15 }, { x: 220, y: 320, w: 15, h: 15 }, { x: 290, y: 320, w: 15, h: 15 }, { x: 750, y: 170, w: 15, h: 15 } ],
    powerUps: [ { x: 50, y: 300, w: 25, h: 25, type: 'doubleJump' } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 740, y: 150, w: 20, h: 50 }
  },
  // Level 13
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 800, h: 50 }, { x: 200, y: 250, w: 80, h: 20, dx: 3 }, { x: 500, y: 150, w: 80, h: 20, dx: -3 } ],
    enemies: [ { x: 100, y: 200, w: 35, h: 25, dy: 2, patrol: 100, type: 'fly' }, { x: 700, y: 200, w: 35, h: 25, dy: -2, patrol: 100, type: 'fly' } ],
    coins: [ { x: 230, y: 220, w: 15, h: 15 }, { x: 530, y: 120, w: 15, h: 15 }, { x: 400, y: 50, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 750, y: 300, w: 20, h: 50 }
  },
  // Level 14
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 50, h: 50 }, { x: 100, y: 300, w: 50, h: 20 }, { x: 200, y: 250, w: 50, h: 20 }, { x: 300, y: 200, w: 50, h: 20 }, { x: 400, y: 250, w: 50, h: 20 }, { x: 500, y: 300, w: 50, h: 20 }, { x: 600, y: 350, w: 200, h: 50 } ],
    enemies: [ { x: 650, y: 320, w: 30, h: 30, dx: 2, patrol: 80, type: 'patrol' } ],
    coins: [ { x: 110, y: 270, w: 15, h: 15 }, { x: 210, y: 220, w: 15, h: 15 }, { x: 310, y: 170, w: 15, h: 15 }, { x: 410, y: 220, w: 15, h: 15 }, { x: 510, y: 270, w: 15, h: 15 } ],
    playerStart: { x: 20, y: 300 },
    goal: { x: 750, y: 300, w: 20, h: 50 }
  },
  // Level 15
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 800, h: 50 }, { x: 150, y: 250, w: 100, h: 20, fake: true }, { x: 350, y: 180, w: 100, h: 20, fake: true }, { x: 550, y: 110, w: 100, h: 20, fake: true } ],
    enemies: [],
    coins: [ { x: 400, y: 320, w: 15, h: 15 } ],
    powerUps: [ { x: 50, y: 300, w: 25, h: 25, type: 'doubleJump' } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 750, y: 300, w: 20, h: 50 }
  },
  // Level 16
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 100, h: 50 }, { x: 700, y: 350, w: 100, h: 50 }, { x: 200, y: 200, w: 400, h: 20 } ],
    enemies: [ { x: 220, y: 170, w: 30, h: 30, dx: 4, patrol: 150, type: 'patrol' }, { x: 580, y: 170, w: 30, h: 30, dx: -4, patrol: 150, type: 'patrol' } ],
    coins: [ { x: 380, y: 150, w: 15, h: 15 }, { x: 400, y: 150, w: 15, h: 15 }, { x: 420, y: 150, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 750, y: 300, w: 20, h: 50 }
  },
  // Level 17
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 150, h: 50 }, { x: 200, y: 300, w: 100, h: 20, dx: 1 }, { x: 350, y: 250, w: 100, h: 20, dx: -1 }, { x: 500, y: 200, w: 100, h: 20, dx: 1 }, { x: 650, y: 150, w: 100, h: 20 } ],
    enemies: [ { x: 660, y: 120, w: 30, h: 30, dx: 1, patrol: 30, type: 'patrol' } ],
    coins: [ { x: 250, y: 270, w: 15, h: 15 }, { x: 400, y: 220, w: 15, h: 15 }, { x: 550, y: 170, w: 15, h: 15 } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 700, y: 100, w: 20, h: 50 }
  },
  // Level 18
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 800, h: 50 } ],
    enemies: [ { x: 100, y: 250, w: 35, h: 25, dy: 2, patrol: 80, type: 'fly' }, { x: 250, y: 250, w: 35, h: 25, dy: -2, patrol: 80, type: 'fly' }, { x: 400, y: 250, w: 35, h: 25, dy: 2, patrol: 80, type: 'fly' }, { x: 550, y: 250, w: 35, h: 25, dy: -2, patrol: 80, type: 'fly' }, { x: 700, y: 250, w: 35, h: 25, dy: 2, patrol: 80, type: 'fly' } ],
    coins: [ { x: 100, y: 320, w: 15, h: 15 }, { x: 250, y: 320, w: 15, h: 15 }, { x: 400, y: 320, w: 15, h: 15 }, { x: 550, y: 320, w: 15, h: 15 }, { x: 700, y: 320, w: 15, h: 15 } ],
    playerStart: { x: 20, y: 300 },
    goal: { x: 780, y: 300, w: 20, h: 50 }
  },
  // Level 19
  {
    width: 800,
    height: 400,
    platforms: [ { x: 0, y: 350, w: 100, h: 50 }, { x: 150, y: 300, w: 100, h: 20, fake: true }, { x: 300, y: 250, w: 100, h: 20 }, { x: 450, y: 200, w: 100, h: 20, fake: true }, { x: 600, y: 150, w: 100, h: 20 }, { x: 450, y: 100, w: 100, h: 20, fake: true }, { x: 300, y: 50, w: 100, h: 20 } ],
    enemies: [],
    coins: [ { x: 325, y: 220, w: 15, h: 15 }, { x: 625, y: 120, w: 15, h: 15 }, { x: 325, y: 20, w: 15, h: 15 } ],
    powerUps: [ { x: 50, y: 300, w: 25, h: 25, type: 'doubleJump' } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: 340, y: 0, w: 20, h: 50 }
  },
  // Level 20 - Final Challenge
  {
    width: 800,
    height: 400,
    platforms: [ 
        { x: 0, y: 350, w: 800, h: 50 }, // Arena Floor
        { x: 100, y: 250, w: 150, h: 20 }, // Left Platform
        { x: 550, y: 250, w: 150, h: 20 }, // Right Platform
        { x: 325, y: 150, w: 150, h: 20 }  // Top Platform
    ],
    enemies: [ 
        { x: 360, y: 100, w: 80, h: 80, type: 'boss', hp: 5, maxHp: 5, shootTimer: 150, startY: 100 } 
    ],
    coins: [],
    powerUps: [ { x: 50, y: 300, w: 25, h: 25, type: 'doubleJump' }, { x: 700, y: 300, w: 25, h: 25, type: 'shield' } ],
    playerStart: { x: 50, y: 300 },
    goal: { x: -1000, y: -1000, w: 0, h: 0 } // Hidden goal until boss dies
  },
  // --- SESSION 2 LEVELS (21-25) ---
  // Level 21: The Lava Pit
  {
    width: 800, height: 400,
    platforms: [{x:0,y:350,w:100,h:50}, {x:200,y:300,w:50,h:20}, {x:350,y:300,w:50,h:20}, {x:500,y:300,w:50,h:20}, {x:650,y:300,w:50,h:20}, {x:750,y:250,w:50,h:50}],
    enemies: [{x:200,y:200,w:30,h:30,type:'fly',patrol:50,dy:2}, {x:500,y:200,w:30,h:30,type:'fly',patrol:50,dy:2}],
    coins: [{x:215,y:270,w:15,h:15}, {x:515,y:270,w:15,h:15}],
    playerStart: {x:20,y:300}, goal: {x:760,y:200,w:20,h:50}
  },
  // Level 22: Sky High
  {
    width: 800, height: 400,
    platforms: [{x:0,y:350,w:100,h:50}, {x:150,y:250,w:80,h:20}, {x:300,y:150,w:80,h:20}, {x:450,y:250,w:80,h:20}, {x:600,y:150,w:80,h:20}, {x:750,y:350,w:50,h:50}],
    enemies: [{x:320,y:120,w:30,h:30,type:'shooter',shootCooldown:100}],
    coins: [{x:330,y:120,w:15,h:15}, {x:630,y:120,w:15,h:15}],
    playerStart: {x:20,y:300}, goal: {x:760,y:300,w:20,h:50}
  },
  // Level 23: Don't Stop (Moving Platforms)
  {
    width: 800, height: 400,
    platforms: [{x:0,y:350,w:100,h:50}, {x:150,y:300,w:100,h:20,dx:3}, {x:400,y:200,w:100,h:20,dx:-3}, {x:650,y:300,w:100,h:20,dx:3}],
    enemies: [{x:400,y:350,w:30,h:30,type:'patrol',dx:2,patrol:100}],
    coins: [{x:200,y:250,w:15,h:15}, {x:450,y:150,w:15,h:15}],
    playerStart: {x:20,y:300}, goal: {x:750,y:250,w:20,h:50}
  },
  // Level 24: Sniper Alley
  {
    width: 1000, height: 400,
    platforms: [{x:0,y:350,w:200,h:50}, {x:300,y:300,w:50,h:20}, {x:500,y:300,w:50,h:20}, {x:700,y:300,w:50,h:20}, {x:900,y:350,w:100,h:50}],
    enemies: [
        {x:310,y:270,w:30,h:30,type:'shooter',shootCooldown:90},
        {x:510,y:270,w:30,h:30,type:'shooter',shootCooldown:90},
        {x:710,y:270,w:30,h:30,type:'shooter',shootCooldown:90}
    ],
    coins: [{x:400,y:250,w:15,h:15}, {x:600,y:250,w:15,h:15}],
    playerStart: {x:50,y:300}, goal: {x:920,y:300,w:20,h:50}
  },
  // Level 25: Cyber Core (Session 2 Boss)
  {
    width: 800, height: 400,
    platforms: [
        {x:0,y:350,w:800,h:50}, 
        {x:100,y:250,w:150,h:20}, {x:550,y:250,w:150,h:20}, 
        {x:325,y:150,w:150,h:20}
    ],
    enemies: [{x:600,y:150,w:60,h:60,type:'boss2',hp:7,maxHp:7,timer:0,state:'idle'}],
    coins: [],
    powerUps: [{x:50,y:300,w:25,h:25,type:'shield'}],
    playerStart: {x:50,y:300}, goal: {x:-1000,y:-1000,w:0,h:0}
  },
  // Level 26: Ice Cavern (Slippery)
  {
    width: 800, height: 400, type: 'ice', // New Ice Type
    platforms: [{x:0,y:350,w:800,h:50}, {x:200,y:300,w:100,h:20}, {x:500,y:250,w:100,h:20}],
    enemies: [{x:300,y:320,w:30,h:30,type:'patrol',dx:2,patrol:100}],
    coins: [{x:250,y:250,w:15,h:15}, {x:550,y:200,w:15,h:15}],
    powerUps: [],
    playerStart: {x:50,y:300}, goal: {x:750,y:200,w:20,h:50}
  }
];

// --- Level Sanitization ---
levels.forEach(lvl => {
    lvl.type = lvl.type || 'normal';
    lvl.powerUps = lvl.powerUps || [];
    lvl.checkpoints = lvl.checkpoints || [];
    lvl.enemies = lvl.enemies || [];
});

// --- PROCEDURAL LEVEL GENERATOR (To reach 125 Levels) ---
function generateLevels() {
    const totalLevelsNeeded = 125;
    const currentCount = levels.length;

    for (let i = currentCount; i < totalLevelsNeeded; i++) {
        const difficulty = 1 + (i * 0.05); // Increase difficulty
        const isBossLevel = (i + 1) % 25 === 0; // Every 25th level is a boss

        let newLevel = {
            width: 800 + (i * 10), // Levels get longer
            height: 400,
            platforms: [{x:0, y:350, w: 200, h:50}], // Start platform
            enemies: [],
            coins: [],
            playerStart: {x: 50, y: 300},
            goal: {x: 0, y: 0, w: 20, h: 50},
            type: 'normal'
        };

        // Assign Theme based on Session (25 levels per session)
        if (i >= 25 && i < 50) newLevel.type = 'ice';      // Session 2
        else if (i >= 50 && i < 75) newLevel.type = 'lava'; // Session 3
        else if (i >= 75 && i < 100) newLevel.type = 'space'; // Session 4
        else if (i >= 100) newLevel.type = 'cyber';        // Session 5

        if (isBossLevel) {
            // Boss Arena
            newLevel.width = 800;
            newLevel.platforms.push({x:0, y:350, w:800, h:50});
            // Boss 3 (Level 50) starts at 10 HP, then increases slowly (+1 HP every 5 levels roughly)
            const bossHp = 10 + Math.floor((i - 49) / 5);
            newLevel.enemies.push({x:600, y:200, w:60, h:60, type:'boss', hp: bossHp, maxHp: bossHp, shootTimer: 100, startY: 200});
            newLevel.goal = {x: -1000, y: -1000, w:0, h:0}; // Hidden goal
        } else {
            // Procedural Platforms
            let currentX = 200;
            let currentY = 300;
            while (currentX < newLevel.width - 100) {
                const gap = 50 + Math.random() * 100 * difficulty;
                const width = 80 + Math.random() * 100;
                const heightChange = (Math.random() - 0.5) * 100;
                
                // Add vertical variation
                if (Math.random() < 0.3) currentY -= 50; // Step up
                
                currentX += gap;
                currentY += heightChange;
                if (currentY > 350) currentY = 350;
                if (currentY < 100) currentY = 100;

                newLevel.platforms.push({x: currentX, y: currentY, w: width, h: 20});

                // Add Enemy?
                if (Math.random() < 0.4) {
                    const type = Math.random() > 0.5 ? 'patrol' : 'fly';
                    newLevel.enemies.push({x: currentX + 20, y: currentY - 30, w: 30, h: 30, type: type, dx: 2, patrol: width/2, startY: currentY - 30});
                }
                // Add Coin?
                if (Math.random() < 0.6) {
                    newLevel.coins.push({x: currentX + width/2, y: currentY - 40, w: 15, h: 15});
                }
            }
            // Goal at end
            newLevel.platforms.push({x: newLevel.width - 150, y: 300, w: 150, h: 50});
            newLevel.goal = {x: newLevel.width - 50, y: 250, w: 20, h: 50};
        }
        levels.push(newLevel);
    }
}
generateLevels(); // Generate remaining levels on startup

let keys = {};
let justPressed = {}; // To track single key presses for actions like jumping

document.addEventListener("keydown", e => {
    if (!keys[e.key]) { // If the key wasn't already down
        justPressed[e.key] = true;
    }
    keys[e.key] = true;
});
document.addEventListener("keyup", e => keys[e.key] = false);

function generateStars() {
    stars = []; // Clear existing stars
    const numStars = 150;
    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: Math.random() * camera.width, // Use logical width
            y: Math.random() * camera.height,
            size: Math.random() * 2
        });
    }
}

// --- Image Loading ---
let backgroundLayers = [];
function createImage(src, factor) {
    const img = new Image();
    img.src = src;
    // Set a default height for scaling, assuming images might not load instantly
    img.height = canvas.height;
    return { img, factor };
}

// Load background images. Assumes you have these in your 'assets' folder.
// The factor controls the scroll speed (lower = slower/further away).
backgroundLayers.push(createImage("bg_far.png", 0.2));
backgroundLayers.push(createImage("bg_mid.png", 0.5));

function clampCamera(levelWidth, levelHeight) {
    if (camera.x < 0) camera.x = 0;
    if (camera.y < 0) camera.y = 0;
    if (levelWidth && camera.x + camera.width > levelWidth) {
        camera.x = levelWidth - camera.width;
    }
    if (levelHeight && camera.y + camera.height > levelHeight) {
        camera.y = levelHeight - camera.height;
    }
}

function loadLevel(levelIndex) {
  const level = levels[levelIndex];
  // Deep copy to prevent modifying the original level data
  platforms = JSON.parse(JSON.stringify(level.platforms));
  initialEnemies = JSON.parse(JSON.stringify(level.enemies));
  initialCoins = JSON.parse(JSON.stringify(level.coins));
  goal = JSON.parse(JSON.stringify(level.goal));
  powerUps = JSON.parse(JSON.stringify(level.powerUps || [])); // Use || [] for backward compatibility
  checkpoints = JSON.parse(JSON.stringify(level.checkpoints || []));
  playerStart = JSON.parse(JSON.stringify(level.playerStart));
  projectiles = []; // Clear projectiles on new level

  // Auto-save the current level index so the player can resume later
  saveData.currentLevel = currentLevelIndex;
  saveGameData();

  // --- Apply Difficulty Scaling to moving platforms ---
  const difficultyFactor = getDifficultyFactor();
  platforms.forEach(p => {
      if (p.dx) {
          p.dx *= difficultyFactor;
      }
  });

  player.x = playerStart.x;
  player.y = playerStart.y;
  player.dx = 0;
  player.dy = 0;
  player.jumps = 0;
  player.maxJumps = 1; // Reset abilities
  player.isTouchingWall = false;
  player.isGrappling = false;
  player.hasShield = false;
  player.isDashing = false; // Reset dash state to prevent stuck movement
  player.dashTimer = 0;
  player.dashCooldown = 0;
  player.facingDirection = 1;
  player.invincible = false;
  player.invincibleTimer = 0;
  respawnPoint = JSON.parse(JSON.stringify(playerStart));
  lastSafePos = JSON.parse(JSON.stringify(playerStart)); // Reset safe pos
  player.w = 30; // Reset size
  player.h = 30;

  // --- Apply Character Abilities ---
  player.speed = BASE_SPEED;
  player.jumpForce = BASE_JUMP_FORCE;
  player.dashDuration = BASE_DASH_DURATION;
  player.gravityScale = 1;

  if (selectedCharacter === 'green') player.jumpForce = -13; // Slime: Super Jump
  if (selectedCharacter === 'purple') player.dashDuration = 15; // Void: Long Dash
  if (selectedCharacter === 'orange') player.speed = 6; // Inferno: Super Speed
  if (selectedCharacter === 'red') player.hasShield = true; // Crimson: Start with Shield
  if (selectedCharacter === 'dark') player.maxJumps = 3; // Ninja: Triple Jump
  
  // Enemy Skin Abilities
  if (selectedCharacter === 'walker') player.speed = 5.5; // Fast Walker
  if (selectedCharacter === 'flyer') player.gravityScale = 0.6; // Low Gravity
  if (selectedCharacter === 'shooter') player.hasShield = true; // Turret Shield
  if (selectedCharacter === 'boss') { player.w = 50; player.h = 50; player.hasShield = true; } // Giant Boss
  
  // Apply Level Type Effects
  if (level.type === 'space') player.gravityScale *= 0.6; // Low Gravity in Space

  // Midas handled in coin collection

  // --- Camera Snap ---
  // Center camera on player start, then clamp
  camera.x = player.x + player.w / 2 - camera.width / 2;
  camera.y = player.y + player.h / 2 - camera.height / 2;
  clampCamera(level.width || camera.width, level.height || camera.height);
  spawnEnemies();
  spawnCoins();
}

// Reset game to the very beginning
function reset(keepLevel = false) {
    if (!keepLevel) {
        score = 0;
        currentLevelIndex = 0; // Reset to level 1
        consecutiveLosses = 0;
    }
    player.color = characters[selectedCharacter].color; // Set player color on reset
    gameState = 'PLAYING';
    pauseBtn.classList.remove('hidden'); // Show pause button when playing
    gameUI.classList.remove('hidden'); // Ensure HUD is visible
    if (touchControls && touchEnabled) {
        touchControls.classList.remove('hidden'); // Ensure touch controls are visible
    }
    loadLevel(currentLevelIndex);

}

function spawnEnemies() {
  // Create a deep copy and add original positions for patrol logic
  if (!initialEnemies) return;

  const difficultyFactor = getDifficultyFactor();

  enemies = JSON.parse(JSON.stringify(initialEnemies)).map(enemy => {
    enemy.startX = enemy.x;
    enemy.startY = enemy.y;

    // Apply difficulty scaling to speed
    if (enemy.dx) {
        enemy.dx *= difficultyFactor;
    }
    if (enemy.dy) {
        enemy.dy *= difficultyFactor;
    }

    // Add shooter-specific properties and scale them
    if (enemy.type === 'shooter') {
        const baseCooldown = enemy.shootCooldown || 120;
        enemy.shootCooldown = Math.max(30, baseCooldown / difficultyFactor); // Make them shoot faster, but not too fast
        enemy.shootTimer = Math.random() * enemy.shootCooldown; // Randomize initial shot
    }
    return enemy;
  });
}

function spawnCoins() {
  // Create a deep copy of the initial coins to reset them
  if (!initialCoins) return;
  coins = JSON.parse(JSON.stringify(initialCoins));
}

function playerDie() {
    playSound('death');
    fadeOutMusic(1000); // Fade out music on death instead of stopping abruptly
    // startShake(20, 10); // Screen Shake removed (Vibration hataya)
    consecutiveLosses++; // Increment loss counter
    gameState = 'GAME_OVER';

    const finalScore = Math.floor(score / 10);
    if (finalScore > highScore) {
        highScore = finalScore;
        saveData.highScore = highScore;
        saveGameData();
    }

    showGameOverMenu(false);
}

// --- SEPARATE ENEMY CALCULATION (PHYSICS & LOGIC) ---
function updateEnemyLogic(enemy, i) {
    // --- Movement AI based on type ---
    switch (enemy.type) {
      case 'patrol':
        // Moves left and right within a patrol range
        enemy.x += enemy.dx;
        if (Math.abs(enemy.x - enemy.startX) > enemy.patrol) {
          enemy.dx *= -1;
        }

        // Apply Gravity for Jumping Enemies
        if (enemy.dy || enemy.y < enemy.startY) {
            enemy.dy = (enemy.dy || 0) + GRAVITY;
            enemy.y += enemy.dy;
            if (enemy.y >= enemy.startY) {
                enemy.y = enemy.startY; // Land back on original level
                enemy.dy = 0;
            }
        }
        break;
      case 'fly':
        // Moves up and down within a patrol range
        enemy.y += enemy.dy;
        if (Math.abs(enemy.y - enemy.startY) > enemy.patrol) {
          enemy.dy *= -1;
        }
        break;
      case 'shooter':
        enemy.shootTimer--;
        if (enemy.shootTimer <= 0) {
            // Fire a projectile towards the player
            const projectileSpeed = 5 * getDifficultyFactor();
            const direction = Math.sign((player.x + player.w / 2) - (enemy.x + enemy.w / 2));
            projectiles.push({
                x: enemy.x + enemy.w / 2 - 4, // Center the projectile
                y: enemy.y + enemy.h / 2 - 4,
                w: 8, h: 8,
                dx: direction * projectileSpeed,
            });
            playSound('shoot');
            enemy.shootTimer = enemy.shootCooldown; // Reset cooldown
        }
        break;
      case 'boss':
        // Boss Movement: Float towards player X
        const dist = player.x - enemy.x;
        enemy.dx = Math.sign(dist) * 1.5; // Slow chase
        enemy.x += enemy.dx;
        
        // Hover effect
        enemy.y = enemy.startY + Math.sin(Date.now() / 500) * 50;

        enemy.shootTimer--;
        if (enemy.shootTimer <= 0) {
            // Shoot aimed projectile at player
            const angle = Math.atan2((player.y + player.h/2) - (enemy.y + enemy.h/2), (player.x + player.w/2) - (enemy.x + enemy.w/2));
            const speed = 7;
            projectiles.push({
                x: enemy.x + enemy.w/2, y: enemy.y + enemy.h/2, w: 15, h: 15,
                dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed
            });
            playSound('shoot');
            enemy.shootTimer = (enemy.hp / enemy.maxHp) * 120 + 50; // Shoot slower (Easier)
        }
        break;
      case 'boss2':
        // Session 2 Boss AI
        enemy.timer = (enemy.timer || 0) + 1;
        enemy.state = enemy.state || 'idle';
        
        // Hover animation
        enemy.y = (enemy.startY || 200) + Math.sin(Date.now() / 200) * 20;

        if (enemy.state === 'idle') {
            if (enemy.timer > 60) {
                enemy.state = 'shoot';
                enemy.timer = 0;
            }
        } else if (enemy.state === 'shoot') {
            if (enemy.timer % 20 === 0 && enemy.timer < 60) {
                // Shoot spread of 3 projectiles
                const baseAngle = Math.atan2((player.y + player.h/2) - (enemy.y + enemy.h/2), (player.x + player.w/2) - (enemy.x + enemy.w/2));
                [-0.3, 0, 0.3].forEach(offset => {
                    const angle = baseAngle + offset;
                    projectiles.push({
                        x: enemy.x + enemy.w/2, y: enemy.y + enemy.h/2, w: 12, h: 12,
                        dx: Math.cos(angle) * 8, dy: Math.sin(angle) * 8
                    });
                });
                playSound('shoot');
            }
            if (enemy.timer > 80) {
                enemy.state = 'dash';
                enemy.timer = 0;
                enemy.targetX = Math.random() * 600 + 100; // Pick random X
            }
        } else if (enemy.state === 'dash') {
            // Fast movement to target X
            const dx = (enemy.targetX - enemy.x) * 0.15;
            enemy.x += dx;
            if (Math.abs(enemy.targetX - enemy.x) < 10 || enemy.timer > 40) {
                enemy.state = 'idle';
                enemy.timer = 0;
            }
        }
        break;
    }

    // Check for collision with player
    if (
      player.x < enemy.x + enemy.w &&
      player.x + player.w > enemy.x &&
      player.y < enemy.y + enemy.h &&
      player.y + player.h > enemy.y
    ) {
      handleEnemyCollision(enemy, i);
    }
}

function drawStartScreen() {
  // Now handled by DOM overlay (index.html + style.css)
}

function drawGameOverScreen() {
  // Now handled by DOM overlay
}

function drawGameWonScreen() {
  // Now handled by DOM overlay
}

function handleEnemyCollision(enemy, i) {
      if (enemy.type === 'boss' || enemy.type === 'boss2') {
          // --- Boss Collision Logic ---
          const isStomp = player.dy > 0 && player.y + player.h < enemy.y + 30;
          const isDashAttack = player.isDashing;

          if (isStomp || isDashAttack) {
              enemy.hp--;
              playSound('stomp');
              startShake(5, 5); // Shake on hit
              player.dy = -12; // Big bounce off boss
              
              if (isDashAttack) {
                  player.isDashing = false; 
                  player.dx = -player.facingDirection * 8; // Bounce back
              }

              if (enemy.hp <= 0) {
                  enemies.splice(i, 1);
                  score += 5000;
                  spawnFloatingText(enemy.x, enemy.y, "+5000", "gold");
                  // Spawn Goal in center
                  goal = { x: 400, y: 300, w: 40, h: 60 };
                  playSound('win');
              }
          } else {
              // Player hit by boss
              if (!player.invincible) {
                  if (player.hasShield) {
                      player.hasShield = false;
                      player.dy = -5;
                      player.dx = -player.facingDirection * 5;
                  } else {
                      playerDie();
                  }
              }
          }
      } else {
        // --- Normal Enemy Logic ---
        if (player.isDashing) {
            enemies.splice(i, 1);
            playSound('stomp');
            startShake(5, 5);
            score += 150;
            spawnFloatingText(enemy.x, enemy.y, "+150", "#e74c3c");
        } else if (player.dy > 0 && player.y + player.h < enemy.y + 25) {
            enemies.splice(i, 1);
            player.dy = -5;
            playSound('stomp');
            startShake(3, 3);
            score += 100;
            spawnFloatingText(enemy.x, enemy.y, "+100", "white");
        } else {
        // Player is hit by the enemy (unless dashing)
        if (!player.isDashing && !player.invincible) {
          if (player.hasShield) {
            player.hasShield = false; // Shield breaks
            player.dy = -5; // Knockback
            player.dx = -player.facingDirection * 5;
            startShake(5, 5);
          } else {
            playerDie();
          }
        }
      }
      }
}

function update() {
  const level = levels[currentLevelIndex];
  const isIceLevel = level.type === 'ice';

  // --- Update Juice (Shake & Text) ---
  if (shakeDuration > 0) shakeDuration--;
  
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.life--;
      ft.yOffset -= 1; // Float up
      if (ft.life <= 0) {
          floatingTexts.splice(i, 1);
      }
  }

  // --- Cooldowns and Timers ---
  if (player.dashCooldown > 0) player.dashCooldown--;
  if (player.dashTimer > 0) player.dashTimer--;
  
  if (player.invincible) {
      player.invincibleTimer--;
      if (player.invincibleTimer <= 0) player.invincible = false;
  }

  if (hudLevel) {
      hudLevel.innerText = "Level: " + (currentLevelIndex + 1);
  }

  // --- State Updates & Input Cancels ---
  // Check for end of dash
  if (player.isDashing && player.dashTimer <= 0) {
    player.isDashing = false;
    player.dy = 0; // Prevent sudden fall after dash
  }
  // Check for end of grapple
  if (player.isGrappling && player.y <= player.grapplePoint.y) {
    player.isGrappling = false;
    player.y = player.grapplePoint.y;
    player.dy = 0;
  }

  // --- Coyote Time & Jump Buffer Logic ---
  if (player.onGround) {
      player.coyoteTimer = 6; // 6 frames grace period
  } else {
      if (player.coyoteTimer > 0) player.coyoteTimer--;
  }

  const rawJumpPressed = justPressed[" "] || justPressed["Space"] || justPressed["w"] || justPressed["W"] || justPressed["ArrowUp"];
  if (rawJumpPressed) {
      player.jumpBuffer = 6; // Buffer jump for 6 frames
  }
  if (player.jumpBuffer > 0) player.jumpBuffer--;

  // Cancel grapple with jump
  if (player.isGrappling && rawJumpPressed) {
    player.isGrappling = false;
  }

  // --- Handle Input & State-based Movement ---
  const grapplePressed = justPressed["e"] || justPressed["E"];
  if (grapplePressed) {
    if (player.isGrappling) {
      player.isGrappling = false; // Cancel if already grappling
    } else if (!player.isDashing) {
      // Find a grapple point straight above
      let closestHit = null;
      let closestDist = GRAPPLE_MAX_RANGE;

      platforms.forEach(p => {
        // Is the player horizontally aligned with the platform?
        if (!p.fake && player.x + player.w > p.x && player.x < p.x + p.w) {
          if (player.y > p.y + p.h) { // Is the platform above the player?
            const dist = player.y - (p.y + p.h);
            if (dist < closestDist) {
              closestDist = dist;
              closestHit = { x: player.x + player.w / 2, y: p.y + p.h };
            }
          }
        }
      });

      if (closestHit) {
        player.isGrappling = true;
        player.grapplePoint = closestHit;
        playSound('grapple');
        player.onGround = false;
        player.jumps = 1; // Using grapple counts as a jump
      }
    }
  }

  // --- Handle Input & State-based Movement ---
  const dashPressed = justPressed["Shift"];
  if (dashPressed && player.dashCooldown <= 0 && !player.isDashing) {
    player.isDashing = true;
    player.dashTimer = player.dashDuration; // Use dynamic duration
    player.dashCooldown = DASH_COOLDOWN;
    playSound('dash');
  }

  if (player.isGrappling) {
    player.dy = GRAPPLE_PULL_SPEED;
    player.dx = 0;
  } else if (player.isDashing) {
    player.dy = 0; // No gravity during dash
    player.dx = player.facingDirection * BASE_DASH_SPEED; // Dash speed remains constant
  } else {
    // Normal Player movement
    if (keys["a"] || keys["A"] || keys["ArrowLeft"]) {
      if (isIceLevel && player.onGround) {
          player.dx -= 0.5; // Acceleration on ice
          if (player.dx < -player.speed) player.dx = -player.speed;
      } else {
          player.dx = -player.speed; // Instant speed on normal ground
      }
      player.facingDirection = -1;
    } else if (keys["d"] || keys["D"] || keys["ArrowRight"]) {
      if (isIceLevel && player.onGround) {
          player.dx += 0.5; // Acceleration on ice
          if (player.dx > player.speed) player.dx = player.speed;
      } else {
          player.dx = player.speed;
      }
      player.facingDirection = 1;
    } else {
      if (isIceLevel && player.onGround) {
          // Slippery Friction
          player.dx *= 0.96; 
          if (Math.abs(player.dx) < 0.1) player.dx = 0;
      } else {
          player.dx = 0;
      }
    }

      // Player jump logic
      if (player.jumpBuffer > 0) {
        if (player.isTouchingWall && !player.onGround) { // Wall Jump
          player.dy = player.jumpForce; // Use dynamic jump
          player.dx = -player.wallDirection * player.speed * 1.5; // Push away from wall
          player.facingDirection = -player.wallDirection;
          playSound('jump');
          player.jumpBuffer = 0; // Consume buffer

          // Enemies Jump (Wall Jump)
          enemies.forEach(e => {
            if (e.type === 'patrol' && e.y >= e.startY) e.dy = BASE_JUMP_FORCE;
          });
        } else if (player.coyoteTimer > 0 || player.jumps < player.maxJumps) { // Normal / Double Jump (using Coyote)
          player.dy = player.jumpForce; // Use dynamic jump
          playSound('jump');
          player.onGround = false;
          player.jumps++;
          player.jumpBuffer = 0; // Consume buffer
          player.coyoteTimer = 0; // Consume coyote time

          // Enemies Jump (Normal Jump)
          enemies.forEach(e => {
            if (e.type === 'patrol' && e.y >= e.startY) e.dy = BASE_JUMP_FORCE;
          });
        }
      }

      // Apply gravity or wall slide speed
      if (player.isTouchingWall && !player.onGround && player.dy > 0) {
        player.dy = WALL_SLIDE_SPEED;
      } else {
        player.dy += GRAVITY * player.gravityScale;
      }
  }

  player.x += player.dx;
  player.y += player.dy;

  player.onGround = false;
    player.isTouchingWall = false; // Reset before collision checks

  // Platform collision and movement
  platforms.forEach(p => {
    // Move the platform if it has a velocity
    if (p.dx) {
      p.x += p.dx;
      const levelWidth = levels[currentLevelIndex].width || camera.width;
      // Bounce off the level edges, not canvas edges
      if (p.x + p.w > levelWidth || p.x < 0) {
        p.dx *= -1;
      }
    }
    
    // Check for collision with the player
    // We check if the player is falling (dy > 0) and if the player's bottom edge
    // is intersecting with the top of the platform.
    if (
      player.x < p.x + p.w && player.x + player.w > p.x &&
      player.y + player.h > p.y && player.y + player.h < p.y + 20 &&
      player.dy >= 0 // Check for landing or sliding on top
    ) {
      if (p.fake) {
        playerDie();
      } else {
        if (player.dy > GRAVITY) {
            playSound('land');
            if (player.dy > 10) startShake(3, 2); // Shake on heavy landing
        }
        player.y = p.y - player.h;
        player.dy = 0;
        player.onGround = true;
        lastSafePos = { x: player.x, y: player.y }; // Update safe position when on ground
        player.jumps = 0; // Reset jumps on landing
        if (p.dx) {
            player.x += p.dx;
        }
      }
    }

    // Wall collision check (separate from landing)
    if (!p.fake && !player.onGround && player.y + player.h > p.y && player.y < p.y + p.h) {
        // Hitting wall on player's right
        if (player.dx > 0 && (player.x + player.w) > p.x && player.x < p.x) {
            player.x = p.x - player.w;
            player.isTouchingWall = true;
            player.wallDirection = 1;
        } // Hitting wall on player's left
        else if (player.dx < 0 && player.x < (p.x + p.w) && player.x + player.w > p.x + p.w) {
            player.x = p.x + p.w;
            player.isTouchingWall = true;
            player.wallDirection = -1;
        }
    }
  });

  // Enemy logic
  for (let i = enemies.length - 1; i >= 0; i--) {
    updateEnemyLogic(enemies[i], i);
  }

  // Projectile logic
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.dx;
    if (proj.dy) proj.y += proj.dy; // Add vertical movement support

    // Check for collision with player
    if (
        player.x < proj.x + proj.w &&
        player.x + player.w > proj.x &&
        player.y < proj.y + proj.h &&
        player.y + player.h > proj.y
    ) {
        if (!player.isDashing && !player.invincible) {
            if (player.hasShield) {
                player.hasShield = false; // Shield breaks
                player.dy = -5; // Knockback
                player.dx = -player.facingDirection * 5;
            } else {
                playerDie();
            }
        }
        projectiles.splice(i, 1); // Remove projectile on hit
        return; // Stop processing this projectile
    }

    // Remove projectile if it goes off-screen
    if (proj.x < camera.x - 50 || proj.x > camera.x + camera.width + 50) {
        projectiles.splice(i, 1);
    }
  }

  // Coin collection logic
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    if (
      player.x < coin.x + coin.w &&
      player.x + player.w > coin.x &&
      player.y < coin.y + coin.h &&
      player.y + player.h > coin.y
    ) {
      coins.splice(i, 1); // Remove the coin
      playSound('coin');
      
      // Midas Ability: Double Coins
      const coinValue = (selectedCharacter === 'gold') ? 20 : 10;
      const scoreValue = (selectedCharacter === 'gold') ? 100 : 50;

      score += scoreValue; // Increase score
      totalCoins += coinValue; // Add to persistent wallet
      saveData.totalCoins = totalCoins;
      saveGameData();
      spawnFloatingText(coin.x, coin.y, "+" + scoreValue, "gold");
    }
  }

  // Power-up collection logic
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const powerUp = powerUps[i];
    if (
      player.x < powerUp.x + powerUp.w &&
      player.x + player.w > powerUp.x &&
      player.y < powerUp.y + powerUp.h &&
      player.y + player.h > powerUp.y
    ) {
      if (powerUp.type === 'doubleJump') {
        player.maxJumps = 2;
        playSound('powerup');
        spawnFloatingText(powerUp.x, powerUp.y, "DOUBLE JUMP!", "cyan");
      } else if (powerUp.type === 'shield') {
        player.hasShield = true;
        playSound('powerup');
        spawnFloatingText(powerUp.x, powerUp.y, "SHIELD!", "blue");
      }
      powerUps.splice(i, 1); // Remove the power-up
      score += 200; // Bonus score for power-up
    }
  }

  // Checkpoint activation
  checkpoints.forEach(cp => {
      if (!cp.activated &&
          player.x < cp.x + cp.w &&
          player.x + player.w > cp.x &&
          player.y < cp.y + cp.h &&
          player.y + player.h > cp.y
      ) {
          // Deactivate other checkpoints in the level
          checkpoints.forEach(otherCp => otherCp.activated = false);
          cp.activated = true;
          // Respawn player standing on the ground at the checkpoint's location
          respawnPoint = { x: cp.x, y: cp.y + cp.h - player.h };
          playSound('powerup'); // Reuse sound
      }
  });

  // --- Goal Collision ---
  if (
    goal &&
    player.x < goal.x + goal.w &&
    player.x + player.w > goal.x &&
    player.y < goal.y + goal.h &&
    player.y + player.h > goal.y
  ) {
    playSound('win');
    stopMusic(); // Stop music on win
      consecutiveLosses = 0; // Reset losses on win
      currentLevelIndex++;
      
      // Update max level reached
      if (currentLevelIndex > maxLevelReached) {
          maxLevelReached = currentLevelIndex;
          saveData.maxLevel = maxLevelReached;
          saveGameData();
          populateLevelSelect(); // Update UI
      }

    if (currentLevelIndex < levels.length) {
      // Show Level Complete Screen
      levelCompleteScreen.classList.remove('hidden');
      gameUI.classList.add('hidden');
      pauseBtn.classList.add('hidden');
      gameState = 'LEVEL_COMPLETE';
      // loadLevel will be called by the next level button
    } else {
      gameState = 'GAME_WON';
      // Check and set high score when the game is won
      const finalScore = Math.floor(score / 10);
      if (finalScore > highScore) {
          highScore = finalScore;
          saveData.highScore = highScore;
          saveGameData();
      }
      showGameOverMenu(true);
    }
  }

  // If player falls off the screen, reset the game
  if (player.y > canvas.height) {
    playerDie();
  }

  // Increment score
  score++;

  // --- Camera Follow Logic ---
  const levelWidth = level.width || camera.width;
  const levelHeight = level.height || camera.height;

  // Target for the camera to look at (center of the player)
  const targetX = player.x + player.w / 2 - camera.width / 2;
  const targetY = player.y + player.h / 2 - camera.height / 2;

  // Smoothly interpolate the camera's position towards the target (lerp)
  camera.x += (targetX - camera.x) * camera.lerpFactor;
  camera.y += (targetY - camera.y) * camera.lerpFactor;

  // Clamp the camera to the level boundaries
  clampCamera(levelWidth, levelHeight);
}

function draw3DBlock(x, y, w, h, color, depth = 4) {
    // Front Face
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);

    // Top Face - Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)"; // Highlight overlay
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + depth, y - depth);
    ctx.lineTo(x + w + depth, y - depth);
    ctx.lineTo(x + w, y);
    ctx.fill();
    
    // Side Face (Right) - Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; // Shadow overlay
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + depth, y - depth);
    ctx.lineTo(x + w + depth, y + h - depth);
    ctx.lineTo(x + w, y + h);
    ctx.fill();
}

function draw() {
  // Apply scaling for High DPI / Fullscreen
  ctx.save();
  ctx.scale(scaleFactor, scaleFactor);

  // Draw the selected background animation
  drawBackground();
  
  // --- Apply Screen Shake ---
  if (shakeDuration > 0) {
      const dx = (Math.random() - 0.5) * shakeIntensity;
      const dy = (Math.random() - 0.5) * shakeIntensity;
      ctx.translate(dx, dy);
  }

  // --- Draw Game World (translated by camera) ---
  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y)); // Use integers for better performance

  // Draw Shield (if active)
  if (player.hasShield) {
    ctx.strokeStyle = "rgba(0, 255, 255, 0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x + player.w / 2, player.y + player.h / 2, player.w * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }

  // --- Draw Player ---
  // Set base color from selected character, but allow overrides for states
  if (!player.invincible || Math.floor(Date.now() / 100) % 2 !== 0) {
      
  // --- TRY DRAWING SPRITE (PHOTO) FIRST ---
  const spriteKey = 'player_' + selectedCharacter;
  if (sprites[spriteKey] && sprites[spriteKey].complete && sprites[spriteKey].naturalWidth !== 0) {
      ctx.save();
      ctx.translate(player.x + player.w/2, player.y + player.h/2);
      ctx.scale(player.facingDirection, 1); // Flip sprite based on direction
      ctx.drawImage(sprites[spriteKey], -player.w/2 - 5, -player.h/2 - 5, player.w + 10, player.h + 10); // Draw slightly larger than hitbox
      ctx.restore();
  } else {
      
  // --- ENEMY SKINS RENDERING ---
  if (selectedCharacter === 'walker') {
      // Walker Skin
      const time = Date.now();
      const walkCycle = player.onGround && player.dx !== 0 ? Math.sin(time / 100) * 5 : 0;
      ctx.fillStyle = "#922b21"; 
      // Legs
      ctx.fillRect(player.x + 5, player.y + player.h - 5, 8, 12 + walkCycle); 
      ctx.fillRect(player.x + player.w - 13, player.y + player.h - 5, 8, 12 - walkCycle);
      // Body
      draw3DBlock(player.x, player.y, player.w, player.h, "#c0392b");
      // Eyes
      ctx.fillStyle = "white";
      ctx.fillRect(player.x + 4, player.y + 6, 8, 8);
      ctx.fillRect(player.x + player.w - 12, player.y + 6, 8, 8);
      // Pupils
      ctx.fillStyle = "black";
      const look = player.facingDirection * 2;
      ctx.fillRect(player.x + 6 + look, player.y + 8, 4, 4);
      ctx.fillRect(player.x + player.w - 10 + look, player.y + 8, 4, 4);
      // Eyebrows
      ctx.beginPath(); ctx.moveTo(player.x + 2, player.y + 4); ctx.lineTo(player.x + 12, player.y + 8); ctx.lineTo(player.x + 12, player.y + 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(player.x + player.w - 2, player.y + 4); ctx.lineTo(player.x + player.w - 12, player.y + 8); ctx.lineTo(player.x + player.w - 12, player.y + 2); ctx.fill();

  } else if (selectedCharacter === 'flyer') {
      // Flyer Skin
      const sway = player.onGround ? 0 : Math.sin(Date.now() / 200) * 3;
      ctx.fillStyle = "#6c3483"; 
      ctx.fillRect(player.x + 8 + sway, player.y + player.h - 5, 4, 10);
      ctx.fillRect(player.x + player.w - 12 + sway, player.y + player.h - 5, 4, 10);
      // Body
      draw3DBlock(player.x, player.y, player.w, player.h, "#8e44ad");
      // Wings
      const flap = player.onGround ? 0 : Math.sin(Date.now() / 50) * 8;
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.beginPath(); ctx.moveTo(player.x, player.y + 10); ctx.lineTo(player.x - 12, player.y - 5 + flap); ctx.lineTo(player.x, player.y + 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(player.x + player.w, player.y + 10); ctx.lineTo(player.x + player.w + 12, player.y - 5 + flap); ctx.lineTo(player.x + player.w, player.y + 5); ctx.fill();
      // Eye
      ctx.fillStyle = "#f1c40f";
      ctx.fillRect(player.x + player.w/2 - 5, player.y + 8, 10, 8);

  } else if (selectedCharacter === 'shooter') {
      // Shooter Skin
      ctx.fillStyle = "#2c3e50";
      // Legs
      ctx.beginPath(); ctx.moveTo(player.x + 5, player.y + player.h - 5); ctx.lineTo(player.x - 8, player.y + player.h + 10); ctx.lineTo(player.x + 5, player.y + player.h); ctx.fill();
      ctx.beginPath(); ctx.moveTo(player.x + player.w - 5, player.y + player.h - 5); ctx.lineTo(player.x + player.w + 8, player.y + player.h + 10); ctx.lineTo(player.x + player.w - 5, player.y + player.h); ctx.fill();
      // Body
      draw3DBlock(player.x, player.y, player.w, player.h, "#34495e");
      // Barrel
      ctx.fillStyle = "black";
      if (player.facingDirection > 0) ctx.fillRect(player.x + player.w, player.y + 8, 8, 8);
      else ctx.fillRect(player.x - 8, player.y + 8, 8, 8);
      // Sensor
      ctx.fillStyle = "red";
      ctx.fillRect(player.x + player.w/2 - 4, player.y + 4, 8, 4);

  } else if (selectedCharacter === 'boss') {
      // Boss Skin
      draw3DBlock(player.x, player.y, player.w, player.h, "#8e44ad");
      // Big Eyes
      ctx.fillStyle = "white";
      ctx.fillRect(player.x + 10, player.y + 10, 10, 10);
      ctx.fillRect(player.x + player.w - 20, player.y + 10, 10, 10);
      ctx.fillStyle = "red";
      const look = player.facingDirection * 3;
      ctx.fillRect(player.x + 12 + look, player.y + 12, 6, 6);
      ctx.fillRect(player.x + player.w - 18 + look, player.y + 12, 6, 6);

  } else {
  // --- DEFAULT ROBOT RENDERING ---
  let pColor = player.color;
  if (player.isGrappling) {
      pColor = "pink";
  } else if (player.isDashing) {
      pColor = "yellow";
  } else if (player.isTouchingWall && !player.onGround) {
      pColor = "orange";
  }
  const depth = 4;

  // Animation values
  const time = Date.now();
  const walkCycle = player.onGround && player.dx !== 0 ? Math.sin(time / 150) : 0;
  const bobCycle = player.onGround && player.dx !== 0 ? Math.sin(time / 75) * 1.5 : 0;
  const bodyYOffset = bobCycle;

  // --- Draw Jetpack/Jump Flames ---
  if (!player.onGround && player.dy > -player.jumpForce / 2) {
      const flameCount = player.jumps > 1 ? 5 : 3; // More flames for double jump
      for (let i = 0; i < flameCount; i++) {
          const flameX = player.x + player.w / 2 + (Math.random() - 0.5) * (player.w * 0.6);
          const flameY = player.y + player.h + Math.random() * 10;
          const flameSize = Math.random() * 8 + 4;
          const flameColor = Math.random() > 0.5 ? 'orange' : 'yellow';
          ctx.fillStyle = flameColor;
          ctx.beginPath();
          ctx.arc(flameX, flameY, flameSize / 2, 0, Math.PI * 2);
          ctx.fill();
      }
  }

  // --- Arms & Feet Positions ---
  const armW = 5;
  const armH = player.h * 0.55;
  const armY = player.y + player.h * 0.45 + bodyYOffset;
  const armSwing = walkCycle * 20;

  const footW = player.w / 2.5;
  const footH = 6;
  const footY = player.y + player.h - footH;
  const footStride = walkCycle * 3;

  // --- Draw Back Limbs (drawn first to appear behind) ---
  // Back Arm
  ctx.save();
  ctx.translate(player.x + player.w / 2, armY + armH / 4);
  ctx.rotate(-armSwing * Math.PI / 180);
  draw3DBlock(-armW / 2, -armH / 4, armW, armH, "#34495e", 2); // Darker arm
  ctx.restore();
  // Back Foot
  draw3DBlock(player.x + player.w * 0.1, footY - footStride, footW, footH, "#2c3e50", 3);

  // --- Body ---
  const bodyH = player.h * 0.6;
  const bodyW = player.w;
  const bodyX = player.x;
  const bodyY = player.y + player.h * 0.4 + bodyYOffset;
  draw3DBlock(bodyX, bodyY, bodyW, bodyH, pColor, depth);

  // --- Head ---
  const headH = player.h * 0.5;
  const headW = player.w * 0.8;
  const headX = player.x + (player.w - headW) / 2;
  const headY = player.y + bodyYOffset;
  draw3DBlock(headX, headY, headW, headH, "#bdc3c7", depth); // Silver head

  // --- Eyes ---
  const eyeY = headY + headH * 0.4;
  const eyeSize = 4;
  const eyeXOffset = player.facingDirection * 1;
  // Left Eye
  const leftEyeX = headX + headW * 0.3;
  ctx.fillStyle = "white";
  ctx.fillRect(leftEyeX - eyeSize / 2, eyeY - eyeSize / 2, eyeSize, eyeSize);
  ctx.fillStyle = "black";
  ctx.fillRect(leftEyeX - eyeSize / 4 + eyeXOffset, eyeY - eyeSize / 4, eyeSize / 2, eyeSize / 2);
  // Right Eye
  const rightEyeX = headX + headW * 0.7;
  ctx.fillStyle = "white";
  ctx.fillRect(rightEyeX - eyeSize / 2, eyeY - eyeSize / 2, eyeSize, eyeSize);
  ctx.fillStyle = "black";
  ctx.fillRect(rightEyeX - eyeSize / 4 + eyeXOffset, eyeY - eyeSize / 4, eyeSize / 2, eyeSize / 2);

  // --- Draw Front Limbs ---
  // Front Arm
  ctx.save();
  ctx.translate(player.x + player.w / 2, armY + armH / 4);
  ctx.rotate(armSwing * Math.PI / 180);
  draw3DBlock(-armW / 2, -armH / 4, armW, armH, "#567", 2); // Lighter arm
  ctx.restore();
  // Front Foot
  draw3DBlock(player.x + player.w * 0.9 - footW, footY + footStride, footW, footH, "#34495e", 3);
  } // End of Default Robot
  } // End of Sprite Check
  }

  // Draw platforms
  platforms.forEach(p => {
    const levelType = levels[currentLevelIndex].type;
    let colorToUse = "lime"; // Fallback

    if (selectedLandColor !== 'default' && landColors[selectedLandColor]) {
        // Use selected custom color
        colorToUse = landColors[selectedLandColor].color;
    } else {
        // Use Default Dynamic Colors
        if (levelType === 'ice') colorToUse = "#aed6f1";
        else if (levelType === 'lava') colorToUse = "#c0392b";
        else if (levelType === 'space') colorToUse = "#8e44ad";
        else if (levelType === 'cyber') colorToUse = "#2ecc71";
        else colorToUse = "lime";
    }

    draw3DBlock(p.x, p.y, p.w, p.h, colorToUse);
  });

  // Draw enemies
  enemies.forEach(enemy => {
    // Try drawing enemy sprite
    const enemySpriteKey = 'enemy_' + enemy.type;
    if (sprites[enemySpriteKey] && sprites[enemySpriteKey].complete && sprites[enemySpriteKey].naturalWidth !== 0) {
        ctx.drawImage(sprites[enemySpriteKey], enemy.x - 5, enemy.y - 5, enemy.w + 10, enemy.h + 10);
        // Draw HP bar for boss if needed
        if (enemy.type === 'boss' || enemy.type === 'boss2') { /* ... existing HP bar logic ... */ }
    } else {
    // Fallback to procedural drawing
    if (enemy.type === 'boss') {
        draw3DBlock(enemy.x, enemy.y, enemy.w, enemy.h, "#8e44ad"); // Purple Boss
        // Draw Boss HP Bar
        const barW = enemy.w;
        const barH = 8;
        const pct = Math.max(0, enemy.hp / enemy.maxHp);
        ctx.fillStyle = "red";
        ctx.fillRect(enemy.x, enemy.y - 20, barW, barH);
        ctx.fillStyle = "lime";
        ctx.fillRect(enemy.x, enemy.y - 20, barW * pct, barH);
    } else {
    if (enemy.type === 'boss2') {
        draw3DBlock(enemy.x, enemy.y, enemy.w, enemy.h, "#95a5a6"); // Silver Boss
        // Draw Boss HP Bar
        const barW = enemy.w;
        const barH = 8;
        const pct = Math.max(0, enemy.hp / enemy.maxHp);
        ctx.fillStyle = "red";
        ctx.fillRect(enemy.x, enemy.y - 20, barW, barH);
        ctx.fillStyle = "cyan"; // Cyan HP for cyber boss
        ctx.fillRect(enemy.x, enemy.y - 20, barW * pct, barH);
    } else {
        // --- New Enemy Looks ---
        if (enemy.type === 'patrol') {
            // Walker Animation
            const time = Date.now();
            const walkCycle = Math.sin(time / 100) * 5;
            
            // Draw Limbs (Hath aur Per)
            ctx.fillStyle = "#922b21"; // Darker red legs/arms

            // Legs (moving up and down)
            ctx.fillRect(enemy.x + 5, enemy.y + enemy.h - 5, 8, 12 + walkCycle); 
            ctx.fillRect(enemy.x + enemy.w - 13, enemy.y + enemy.h - 5, 8, 12 - walkCycle);

            // Walker Body
            draw3DBlock(enemy.x, enemy.y, enemy.w, enemy.h, "#c0392b");
            
            // Eyes background
            ctx.fillStyle = "white";
            ctx.fillRect(enemy.x + 4, enemy.y + 6, 8, 8);
            ctx.fillRect(enemy.x + enemy.w - 12, enemy.y + 6, 8, 8);
            
            // Pupils (Tracking Player)
            ctx.fillStyle = "black";
            const look = player.x > enemy.x ? 2 : -2;
            ctx.fillRect(enemy.x + 6 + look, enemy.y + 8, 4, 4);
            ctx.fillRect(enemy.x + enemy.w - 10 + look, enemy.y + 8, 4, 4);
            
            // Angry Eyebrows
            ctx.beginPath();
            ctx.moveTo(enemy.x + 2, enemy.y + 4);
            ctx.lineTo(enemy.x + 12, enemy.y + 8);
            ctx.lineTo(enemy.x + 12, enemy.y + 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(enemy.x + enemy.w - 2, enemy.y + 4);
            ctx.lineTo(enemy.x + enemy.w - 12, enemy.y + 8);
            ctx.lineTo(enemy.x + enemy.w - 12, enemy.y + 2);
            ctx.fill();

        } else if (enemy.type === 'fly') {
            // Flyer: Purple with flapping wings
            
            // Dangling Legs (Latakte hue per)
            const sway = Math.sin(Date.now() / 200) * 3;
            ctx.fillStyle = "#6c3483"; // Darker purple
            ctx.fillRect(enemy.x + 8 + sway, enemy.y + enemy.h - 5, 4, 10);
            ctx.fillRect(enemy.x + enemy.w - 12 + sway, enemy.y + enemy.h - 5, 4, 10);

            // Body
            draw3DBlock(enemy.x, enemy.y, enemy.w, enemy.h, "#8e44ad");
            
            // Wings Animation
            const flap = Math.sin(Date.now() / 50) * 8;
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            // Left Wing
            ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y + 10); ctx.lineTo(enemy.x - 12, enemy.y - 5 + flap); ctx.lineTo(enemy.x, enemy.y + 5); ctx.fill();
            // Right Wing
            ctx.beginPath(); ctx.moveTo(enemy.x + enemy.w, enemy.y + 10); ctx.lineTo(enemy.x + enemy.w + 12, enemy.y - 5 + flap); ctx.lineTo(enemy.x + enemy.w, enemy.y + 5); ctx.fill();
            
            // Cyclops Eye
            ctx.fillStyle = "#f1c40f"; // Yellow
            ctx.fillRect(enemy.x + enemy.w/2 - 5, enemy.y + 8, 10, 8);

        } else if (enemy.type === 'shooter') {
            // Shooter: Dark Grey Turret
            
            // Mechanical Legs (Tripod style)
            ctx.fillStyle = "#2c3e50";
            // Left Leg
            ctx.beginPath(); ctx.moveTo(enemy.x + 5, enemy.y + enemy.h - 5); ctx.lineTo(enemy.x - 8, enemy.y + enemy.h + 10); ctx.lineTo(enemy.x + 5, enemy.y + enemy.h); ctx.fill();
            // Right Leg
            ctx.beginPath(); ctx.moveTo(enemy.x + enemy.w - 5, enemy.y + enemy.h - 5); ctx.lineTo(enemy.x + enemy.w + 8, enemy.y + enemy.h + 10); ctx.lineTo(enemy.x + enemy.w - 5, enemy.y + enemy.h); ctx.fill();

            // Body
            draw3DBlock(enemy.x, enemy.y, enemy.w, enemy.h, "#34495e");
            
            // Cannon Barrel (Aims at player)
            ctx.fillStyle = "black";
            const dir = player.x > enemy.x ? 1 : -1;
            if (dir > 0) ctx.fillRect(enemy.x + enemy.w, enemy.y + 8, 8, 8);
            else ctx.fillRect(enemy.x - 8, enemy.y + 8, 8, 8);
            
            // Red Sensor Light
            ctx.fillStyle = `rgba(231, 76, 60, ${Math.abs(Math.sin(Date.now()/200))})`;
            ctx.fillRect(enemy.x + enemy.w/2 - 4, enemy.y + 4, 8, 4);

        } else {
            // Default fallback
            draw3DBlock(enemy.x, enemy.y, enemy.w, enemy.h, "red");
        }
    }
    } // End Sprite Check
    }
  });

  // Draw projectiles
  projectiles.forEach(proj => {
      draw3DBlock(proj.x, proj.y, proj.w, proj.h, "magenta");
  });

  // Draw coins
  coins.forEach(coin => {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(coin.x + coin.w / 2, coin.y + coin.h / 2, coin.w / 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw Power-ups
  powerUps.forEach(powerUp => {
    if (powerUp.type === 'doubleJump') {
      // Draw a simple icon for the power-up
      ctx.fillStyle = "white";
      ctx.fillRect(powerUp.x, powerUp.y, powerUp.w, powerUp.h);
      ctx.fillStyle = "cyan";
      ctx.fillRect(powerUp.x + 4, powerUp.y + 4, powerUp.w - 8, powerUp.h - 8);
    } else if (powerUp.type === 'shield') {
      ctx.fillStyle = "white";
      ctx.fillRect(powerUp.x, powerUp.y, powerUp.w, powerUp.h);
      ctx.fillStyle = "blue";
      ctx.fillRect(powerUp.x + 4, powerUp.y + 4, powerUp.w - 8, powerUp.h - 8);
    }
  });

  // Draw Checkpoints
  checkpoints.forEach(cp => {
      ctx.fillStyle = cp.activated ? 'gold' : 'rgba(200, 200, 200, 0.7)';
      ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
  });

  // Draw Grapple Rope
  if (player.isGrappling) {
    ctx.strokeStyle = "grey";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.x + player.w / 2, player.y + player.h / 2);
    ctx.lineTo(player.grapplePoint.x, player.grapplePoint.y);
    ctx.stroke();
  }
  // Draw Goal
  if (goal) {
    // Draw Gate Structure
    ctx.fillStyle = "#8B4513"; // Dark Wood/Stone
    // Left Pillar
    draw3DBlock(goal.x, goal.y, goal.w / 4, goal.h, "#8B4513", 2);
    // Right Pillar
    draw3DBlock(goal.x + goal.w * 0.75, goal.y, goal.w / 4, goal.h, "#8B4513", 2);
    // Top Arch
    ctx.fillStyle = "#A0522D";
    ctx.fillRect(goal.x, goal.y - 10, goal.w, 15);
    // Inner "Portal"
    ctx.fillStyle = "rgba(100, 0, 150, 0.5)"; // Mystical purple inside
    ctx.fillRect(goal.x + goal.w / 4, goal.y, goal.w / 2, goal.h);
  }

  // --- Draw Floating Texts ---
  floatingTexts.forEach(ft => {
      ctx.fillStyle = ft.color;
      ctx.font = "bold 16px Arial";
      ctx.strokeStyle = "black";
      ctx.lineWidth = 2;
      ctx.strokeText(ft.text, ft.x, ft.y + ft.yOffset);
      ctx.fillText(ft.text, ft.x, ft.y + ft.yOffset);
  });

  ctx.restore();
  ctx.restore(); // Restore the scaleFactor save

}

// --- Background Optimization ---

function updateBackgroundCache() {
    // Size the cache to match the logical camera size
    bgCache.width = camera.width; 
    bgCache.height = camera.height;
    const ctxBg = bgCache.getContext('2d');

    if (selectedBackgroundAnimation === 'indianGradient') {
        const gradient = ctxBg.createLinearGradient(0, 0, 0, bgCache.height);
        gradient.addColorStop(0, '#ff9933'); // Saffron
        gradient.addColorStop(0.5, '#ffffff'); // White
        gradient.addColorStop(1, '#138808'); // Green
        ctxBg.fillStyle = gradient;
        ctxBg.fillRect(0, 0, bgCache.width, bgCache.height);

        // Ashoka Chakra
        ctxBg.strokeStyle = '#000080';
        ctxBg.lineWidth = 2;
        ctxBg.beginPath();
        ctxBg.arc(bgCache.width / 2, bgCache.height / 2, 50, 0, Math.PI * 2);
        ctxBg.stroke();
        
        ctxBg.beginPath();
        for (let i = 0; i < 24; i++) {
            const angle = (i * 15) * Math.PI / 180;
            ctxBg.moveTo(bgCache.width / 2, bgCache.height / 2);
            ctxBg.lineTo(bgCache.width / 2 + Math.cos(angle) * 50, bgCache.height / 2 + Math.sin(angle) * 50);
        }
        ctxBg.stroke();
    }
}

function drawBackground() {
    // Clear screen and draw base background
    if (selectedBackgroundAnimation === 'indianGradient') {
        // Use cached image instead of redrawing paths every frame
        ctx.drawImage(bgCache, 0, 0);

    } else if (selectedBackgroundAnimation === 'starfield') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, camera.width, camera.height);
        ctx.fillStyle = 'white';
        stars.forEach(star => {
            ctx.fillRect(star.x, star.y, star.size * 1.5, star.size * 1.5); // Optimized: Rect instead of Arc
        });

    } else if (selectedBackgroundAnimation === 'retroGrid') {
        // Synthwave Style
        ctx.fillStyle = "#2c003e"; // Dark Purple
        ctx.fillRect(0, 0, camera.width, camera.height);
        
        // Sun
        const sunY = camera.height * 0.3;
        const sunX = camera.width * 0.5;
        const grad = ctx.createLinearGradient(0, 0, 0, camera.height);
        grad.addColorStop(0, "#ffcc00"); grad.addColorStop(1, "#ff00cc");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sunX, sunY, 60, 0, Math.PI, true); ctx.fill();

        // Grid
        ctx.strokeStyle = "rgba(255, 0, 255, 0.5)";
        ctx.lineWidth = 2;
        const time = Date.now() / 100;
        const horizon = camera.height * 0.5;
        
        // Moving Horizontal Lines
        for (let i = 0; i < 10; i++) {
            const y = horizon + ((time + i * 20) % 200) * (camera.height/200);
            if (y > horizon) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(camera.width, y); ctx.stroke();
            }
        }
        // Perspective Vertical Lines
        for (let i = -10; i < 20; i++) {
            ctx.beginPath(); ctx.moveTo(sunX + i * 100, camera.height); ctx.lineTo(sunX, horizon); ctx.stroke();
        }

    } else if (selectedBackgroundAnimation === 'matrix') {
        ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
        ctx.fillRect(0, 0, camera.width, camera.height);
        ctx.fillStyle = "#0f0";
        ctx.font = "14px monospace";
        const time = Math.floor(Date.now() / 50);
        for (let i = 0; i < camera.width / 20; i++) {
            const y = (time * 10 + i * 50) % (camera.height + 100) - 50;
            ctx.fillText(String.fromCharCode(0x30A0 + (i % 96)), i * 20, y);
        }

    } else if (selectedBackgroundAnimation === 'fire') {
        ctx.fillStyle = "#200000";
        ctx.fillRect(0, 0, camera.width, camera.height);
        const time = Date.now() / 5;
        for (let i = 0; i < 50; i++) {
            const x = (i * 30 + Math.sin(time/100 + i)*20) % camera.width;
            const y = camera.height - ((time + i * 10) % camera.height);
            const size = Math.random() * 20 + 10;
            ctx.fillStyle = `rgba(255, ${Math.random()*150}, 0, ${1 - y/camera.height})`;
            ctx.fillRect(x, y, size, size); // Optimized: Rect instead of Arc
        }

    } else if (selectedBackgroundAnimation === 'snow') {
        ctx.fillStyle = "#2c3e50";
        ctx.fillRect(0, 0, camera.width, camera.height);
        ctx.fillStyle = "white";
        const time = Date.now() / 10;
        for (let i = 0; i < 100; i++) {
            const x = (i * 17 + time) % camera.width;
            const y = (i * 13 + time) % camera.height;
            ctx.fillRect(x, y, (i%3)+2, (i%3)+2); // Optimized: Rect instead of Arc
        }

    } else if (selectedBackgroundAnimation === 'rain') {
        ctx.fillStyle = "#050510";
        ctx.fillRect(0, 0, camera.width, camera.height);
        ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        const time = Date.now() * 0.8;
        for (let i = 0; i < 100; i++) {
            const x = (i * 37) % camera.width;
            const y = (time + i * 50) % camera.height;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 15); ctx.stroke();
        }

    } else if (selectedBackgroundAnimation === 'underwater') {
        const g = ctx.createLinearGradient(0, 0, 0, camera.height);
        g.addColorStop(0, "#006994"); g.addColorStop(1, "#001e33");
        ctx.fillStyle = g; ctx.fillRect(0, 0, camera.width, camera.height);
        // Bubbles
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        const time = Date.now() / 20;
        for(let i=0; i<20; i++) {
            const x = (i * 50 + Math.sin(time/50 + i)*20) % camera.width;
            const y = (camera.height - (time + i*30) % camera.height);
            ctx.beginPath(); ctx.arc(x, y, (i%5)+2, 0, Math.PI*2); ctx.stroke();
        }

    } else if (selectedBackgroundAnimation === 'cyberpunk') {
        ctx.fillStyle = "#050510"; ctx.fillRect(0, 0, camera.width, camera.height);
        const time = Date.now();
        // Random Neon Shapes
        if (Math.floor(time / 500) % 2 === 0) {
            ctx.fillStyle = "rgba(0, 255, 255, 0.1)";
            ctx.fillRect(100, 100, 50, 200);
            ctx.fillStyle = "rgba(255, 0, 255, 0.1)";
            ctx.fillRect(camera.width - 150, 50, 100, 300);
        }
        // Grid floor
        ctx.strokeStyle = "cyan";
        ctx.beginPath(); ctx.moveTo(0, camera.height-50); ctx.lineTo(camera.width, camera.height-50); ctx.stroke();

    } else if (selectedBackgroundAnimation === 'forest') {
        ctx.fillStyle = "#052e16"; ctx.fillRect(0, 0, camera.width, camera.height);
        // Trees (Static silhouettes)
        ctx.fillStyle = "#14532d";
        for(let i=0; i<10; i++) {
            const x = i * 100;
            const h = 100 + (i%3)*30;
            ctx.beginPath(); 
            ctx.moveTo(x, camera.height); 
            ctx.lineTo(x+30, camera.height-h); 
            ctx.lineTo(x+60, camera.height); 
            ctx.fill();
        }

    } else {
        // Dynamic background color based on level
        const hue = (currentLevelIndex * 137) % 360; // Rotate hue for each level
        ctx.fillStyle = `hsl(${hue}, 30%, 20%)`;
        ctx.fillRect(0, 0, camera.width, camera.height);
    }

    // Draw Parallax Background on top of selected static/animated background
    // This part should remain, as parallax is a separate layer
    backgroundLayers.forEach(layer => {
        if (!layer.img.complete || layer.img.naturalHeight === 0) return;
        const scrollX = (camera.x * layer.factor);
        const w = layer.img.width;
        const h = camera.height;
        const startX = - (scrollX % w);
        
        // Loop to fill the entire screen width (Fix for wide screens)
        for (let x = startX; x < camera.width; x += w) {
            ctx.drawImage(layer.img, x, 0, w, h);
        }
    });
}

let lastTime = 0;
const timeStep = 1000 / 60; // Target 60 FPS
let accumulator = 0;

function loop(timestamp) {
  if (!timestamp) timestamp = performance.now(); // Safety check if called manually
  if (!lastTime) lastTime = timestamp;
  let deltaTime = timestamp - lastTime;
  lastTime = timestamp;

  // Cap deltaTime to prevent spiral of death (e.g. if tab was inactive)
  if (deltaTime > 100) deltaTime = 100;

  accumulator += deltaTime;

  let updated = false;
  while (accumulator >= timeStep) {
    if (gameState === 'PLAYING') {
      update();
      updated = true;
    }
    accumulator -= timeStep;
  }

  draw();

  // Only clear inputs if we actually updated the game logic or if we are not playing
  if (updated || gameState !== 'PLAYING') {
      justPressed = {};
  }

  requestAnimationFrame(loop);
}
 
// Start the game loop
stopMusic(); // Stop any previous music when script reloads

// --- Fix: Stop Sound when Game is Minimized (Mobile Home/Tabs) ---
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        saveGameData(); // Save data immediately when app is minimized/closed
        stopMusic();
    } else {
        // Resume based on current state
        if (gameState === 'START_SCREEN') {
            playMusic('home');
        } else if (gameState === 'PLAYING') {
            playMusic('music');
        }
    }
});

// --- Daily Reward Logic ---
function checkDailyReward() {
    const lastClaimDate = saveData.lastClaimDate;
    const storedStreak = parseInt(saveData.dailyStreak) || 0;
    const now = new Date();
    const todayStr = now.toDateString(); // e.g., "Mon Jan 01 2024"

    dailyRewardPopup.classList.remove('hidden');

    // Determine current state
    let isClaimedToday = (lastClaimDate === todayStr);
    let currentStreak = storedStreak;
    
    // Check if streak is broken (if not claimed today)
    if (!isClaimedToday) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();
        
        if (lastClaimDate !== yesterdayStr) {
            currentStreak = 0; // Reset if missed a day
        }
    }

    // If not claimed today, the potential streak for today is current + 1
    // If claimed today, the streak is just currentStreak
    const displayStreak = isClaimedToday ? currentStreak : currentStreak + 1;
    
    // Generate Grid
    const grid = document.getElementById('daily-reward-grid');
    grid.innerHTML = '';
    
    const rewards = [10, 25, 45, 75, 100, 500, 999];
    
    // Visual index of "Today" (0-6)
    const todayIndex = (displayStreak - 1) % 7; 

    // Streak Bonus: +50 coins for every full week of streak
    const weeksCompleted = Math.floor((displayStreak - 1) / 7);
    const streakBonus = weeksCompleted * 50;

    rewards.forEach((amount, index) => {
        const dayBox = document.createElement('div');
        dayBox.className = 'reward-day-box';
        
        // Determine status
        if (index < todayIndex) {
            dayBox.classList.add('claimed');
            dayBox.innerHTML = `<div style="font-size:12px;color:#aaa;">Day ${index + 1}</div><div class="reward-day-amount">✅</div>`;
        } else if (index === todayIndex) {
            if (isClaimedToday) {
                dayBox.classList.add('claimed');
                dayBox.innerHTML = `<div style="font-size:12px;color:#aaa;">Day ${index + 1}</div><div class="reward-day-amount">✅</div>`;
            } else {
                dayBox.classList.add('active');
                dayBox.innerHTML = `<div style="font-size:12px;color:#fff;">Day ${index + 1}</div><div class="reward-day-amount">${amount}</div>`;
            }
        } else {
            dayBox.innerHTML = `<div style="font-size:12px;color:#aaa;">Day ${index + 1}</div><div class="reward-day-amount">${amount}</div>`;
        }
        
        grid.appendChild(dayBox);
    });

    // Button Logic
    if (isClaimedToday) {
        dailyRewardMessage.innerText = "Come back tomorrow!";
        claimRewardBtn.classList.add('hidden');
    } else {
        const baseReward = rewards[todayIndex];
        const totalReward = baseReward + streakBonus;

        if (streakBonus > 0) {
            dailyRewardMessage.innerText = `Day ${todayIndex + 1} + Streak Bonus (+${streakBonus})`;
        } else {
            dailyRewardMessage.innerText = `Day ${todayIndex + 1} Reward Available!`;
        }

        claimRewardBtn.innerText = "CLAIM " + totalReward;
        claimRewardBtn.classList.remove('hidden');
        
        claimRewardBtn.onclick = () => {
            claimRewardBtn.disabled = true;
            claimRewardBtn.innerText = "CLAIMING...";

            // Give reward immediately
            playSound('coin');
            totalCoins += totalReward;
            saveData.totalCoins = totalCoins;
            saveData.lastClaimDate = todayStr;
            saveData.dailyStreak = displayStreak;
            saveGameData();
            
            updateCurrencyDisplay();
            
            // Refresh UI to show claimed state
            checkDailyReward();
        };
    }
}

if (dailyRewardBtn) {
    dailyRewardBtn.addEventListener('click', () => {
        playSound('click');
        checkDailyReward();
    });
}

if (closeRewardBtn) closeRewardBtn.addEventListener('click', () => dailyRewardPopup.classList.add('hidden'));

if (dailyRewardCloseX) dailyRewardCloseX.addEventListener('click', () => {
    playSound('click');
    dailyRewardPopup.classList.add('hidden');
});

// --- Game Over / Win Button Logic ---
restartBtn.addEventListener('click', () => {
    playSound('click');
    gameOverScreen.classList.add('hidden');
    gameState = 'PLAYING';
    
    reset(true); // Restart  
    playMusic('music');
    window.focus();
});

// Skip Level Button Click
if (skipLevelBtn) {
    skipLevelBtn.addEventListener('click', () => {
        playSound('click');
        
        consecutiveLosses = 0; // Reset losses
        currentLevelIndex++;
        
        // Unlock next level
        if (currentLevelIndex > maxLevelReached) {
            maxLevelReached = currentLevelIndex;
            saveData.maxLevel = maxLevelReached;
            saveGameData();
            populateLevelSelect();
        }

        if (currentLevelIndex < levels.length) {
            loadLevel(currentLevelIndex);
            gameState = 'PLAYING';
            gameOverScreen.classList.add('hidden');
            gameUI.classList.remove('hidden');
            pauseBtn.classList.remove('hidden');
            
            // FIX: Show touch controls again
            if (touchControls && touchEnabled) {
                touchControls.classList.remove('hidden');
            }

            playMusic('music');
        } else {
            // Game Won (if skipped last level)
            gameState = 'GAME_WON';
            showGameOverMenu(true);
        }
    });
}

homeBtn.addEventListener('click', () => {
    playSound('click');
    gameOverScreen.classList.add('hidden');
    gameState = 'START_SCREEN';
    showHomeScreen();
});

// --- Level Complete Button Logic ---
nextLevelBtn.addEventListener('click', () => {
    playSound('click');
    levelCompleteScreen.classList.add('hidden');
    gameState = 'PLAYING';
    gameUI.classList.remove('hidden');
    pauseBtn.classList.remove('hidden');
    
    loadLevel(currentLevelIndex);
    playMusic('music');
});

levelHomeBtn.addEventListener('click', () => {
    playSound('click');
    gameState = 'START_SCREEN';
    showHomeScreen();
});

// --- Pause Menu Logic ---
pauseBtn.addEventListener('click', () => {
    if (gameState === 'PLAYING') {
        playSound('click');
        gameState = 'PAUSED';
        pauseMenu.classList.remove('hidden');
        if (touchControls) touchControls.classList.add('hidden'); // Always hide on pause
        fadeOutMusic(500);
    }
});

resumeBtn.addEventListener('click', () => {
    playSound('click');
    gameState = 'PLAYING';
    pauseMenu.classList.add('hidden');
    if (touchControls && touchEnabled) {
        touchControls.classList.remove('hidden');
    }
    playMusic('music');
});

pauseRestartBtn.addEventListener('click', () => {
    playSound('click');
    pauseMenu.classList.add('hidden');
    
    reset(true); // Restart current level
});

pauseHomeBtn.addEventListener('click', () => {
    playSound('click');
    pauseMenu.classList.add('hidden');
    gameState = 'START_SCREEN';
    showHomeScreen();
});

// Start Button Logic
startBtn.addEventListener('click', () => {
    playSound('click');
    // The unreliable forceLandscape() function has been removed.
    
    // Auto-show tutorial for first-time players
    if (!saveData.tutorialSeen) {
        tutorialScreen.classList.remove('hidden');
        saveData.tutorialSeen = true;
        saveGameData();
        return; // Stop here so user sees tutorial first. They will click PLAY again after closing.
    }
    
    homeScreen.classList.add('hidden');

    // Open Session Select Screen
    updateSessionButtons(); // Ensure locks are correct
    sessionSelectScreen.classList.remove('hidden');
});

function setupTouchControls() {
  const leftBtn = document.getElementById('left-btn');
  const rightBtn = document.getElementById('right-btn');
  const jumpBtn = document.getElementById('jump-btn');
  const dashBtn = document.getElementById('dash-btn');
  const grappleBtn = document.getElementById('grapple-btn');

  if (!leftBtn) return; // Don't run if controls aren't in the DOM

  const handleInput = (e, key, isPressed) => {
    if (isEditingControls) return; // Disable game input while editing
    if (e.cancelable) e.preventDefault(); // Stop browser from scrolling or zooming
    
    if (isPressed && !keys[key]) {
        justPressed[key] = true;
        if (navigator.vibrate) navigator.vibrate(50); // Vibrate for 50ms
    }
    keys[key] = isPressed;
  };

  const addListeners = (btn, key) => {
      // Touch events
      btn.addEventListener('touchstart', e => handleInput(e, key, true), { passive: false });
      btn.addEventListener('touchend', e => handleInput(e, key, false), { passive: false });
      btn.addEventListener('touchcancel', e => handleInput(e, key, false), { passive: false }); // Fix: Handle interruptions
      btn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); }, false); // Fix: No right-click menu
      
      // Mouse events (for desktop testing)
      btn.addEventListener('mousedown', e => handleInput(e, key, true));
      btn.addEventListener('mouseup', e => handleInput(e, key, false));
      btn.addEventListener('mouseleave', e => handleInput(e, key, false));
  };

  // Enable dragging for editing
  makeDraggable(leftBtn);
  makeDraggable(rightBtn);
  makeDraggable(jumpBtn);
  makeDraggable(dashBtn);
  makeDraggable(grappleBtn);

  addListeners(leftBtn, 'a');
  addListeners(rightBtn, 'd');
  addListeners(jumpBtn, ' ');
  addListeners(dashBtn, 'Shift');
  addListeners(grappleBtn, 'e');
}

// Set up touch listeners when the script loads
setupTouchControls();

// --- Auto-Rotate / Force Landscape Logic ---
// The unreliable forceLandscape() function has been removed.
// A CSS-based warning is now used instead (see style.css and the #orientation-warning div).

// --- Click to Start Logic (Fix for sound autoplay) ---
if (realStartBtn) {
    realStartBtn.addEventListener('click', () => {
        // This is the first user interaction, so audio will be allowed.
        clickToStartScreen.classList.add('hidden');
        // Show the actual home screen, which will handle playing the music.
        showHomeScreen();
    });
}

// --- Auto-Enable Touch Controls on Mobile ---
window.addEventListener('touchstart', () => {
    if (!touchEnabled) {
        touchEnabled = true;
        saveData.touchEnabled = true;
        saveGameData();
        if (gameState === 'PLAYING' && touchControls) {
            touchControls.classList.remove('hidden');
        }
        if (touchToggle) touchToggle.checked = true;
    }
}, { passive: true });

// --- Internet Connection Check ---
const internetPopup = document.getElementById('internet-popup');
const closeInternetBtn = document.getElementById('close-internet-btn');

function checkInternetConnection() {
    const isOnline = navigator.onLine;
    if (!isOnline) {
        if (internetPopup) internetPopup.classList.remove('hidden');
    } else {
        if (internetPopup) internetPopup.classList.add('hidden');
    }
    return isOnline;
}

window.addEventListener('online', checkInternetConnection);
window.addEventListener('offline', checkInternetConnection);

if (closeInternetBtn) {
    closeInternetBtn.addEventListener('click', () => {
        if (internetPopup) internetPopup.classList.add('hidden');
    });
}

// Check on startup
checkInternetConnection();

// --- Initial Setup (Moved to end to ensure all functions are defined) ---
resizeGame(); // Set initial size

// Inject Orientation Warning HTML
const warningDiv = document.createElement('div');
warningDiv.id = 'orientation-warning';
warningDiv.innerHTML = '<h2>Please Rotate Device ↻</h2><p>Landscape mode required</p>';
document.body.appendChild(warningDiv);
 
generateStars();
loadLevel(0); // Load level 1 background
populateCharacterSelect(); // Create character options
populateBackgroundAnimationSelect(); // Populate background animation options
populateLevelSelect(); // Create level buttons
gameState = 'START_SCREEN';
showHomeScreen(); // Show the new Home Page

// Loop is now started in the load event listener to ensure all assets are ready.
