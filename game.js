const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let gameState = 'START_SCREEN'; // Can be: START_SCREEN, PLAYING, GAME_OVER, GAME_WON
let globalVolume = parseFloat(localStorage.getItem('dravexoVolume'));
if (isNaN(globalVolume)) globalVolume = 0.5;

let selectedCharacter = localStorage.getItem('dravexoSelectedCharacter') || 'cyan';
let currentLevelIndex = 0;
let musicVolume = parseFloat(localStorage.getItem('dravexoMusicVolume'));
if (isNaN(musicVolume)) musicVolume = 0.5;

let soundEnabled = localStorage.getItem('dravexoSoundEnabled') !== 'false';
let touchEnabled = localStorage.getItem('dravexoTouchEnabled') !== 'false'; // Default to true
let maxLevelReached = parseInt(localStorage.getItem('dravexoMaxLevel')) || 0;
let initialEnemies = [];
let initialCoins = [];
let stars = [];

// Game constants
const GRAVITY = 0.5;
const PLAYER_SPEED = 4;
const JUMP_FORCE = -11;
const WALL_SLIDE_SPEED = 1;
const GRAPPLE_MAX_RANGE = 300;
const GRAPPLE_PULL_SPEED = -10; // Pulling up, so negative
const DASH_SPEED = 12;
const DASH_DURATION = 10; // in frames
const DASH_COOLDOWN = 60; // in frames (1 second at 60fps)

let camera = {
  x: 0,
  y: 0,
  width: canvas.width,
  height: canvas.height,
  lerpFactor: 0.08 // A smaller value gives smoother camera movement
};

let lastSafePos = { x: 50, y: 300 }; // Track last safe ground position
let player = {
  x: 50,
  y: 300,
  w: 30,
  h: 30,
  dx: 0,
  dy: 0,
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
  invincibleTimer: 0
};

// Load saved settings from localStorage
let score = 0;
let highScore = localStorage.getItem('dravexoHighScore') || 0;
let selectedBackgroundAnimation = localStorage.getItem('dravexoBackgroundAnimation') || 'indianGradient'; // Default background

// --- UI Elements ---
const homeScreen = document.getElementById('home-screen');
const startBtn = document.getElementById('start-btn');
const newGameBtn = document.getElementById('new-game-btn');
const levelsBtn = document.getElementById('levels-btn');
const characterBtn = document.getElementById('character-btn');
const session2Btn = document.getElementById('session2-btn');
const highScoreDisplay = document.getElementById('ui-highscore');
const gameUI = document.getElementById('game-ui');
const hudScore = document.getElementById('hud-score');
const hudLevel = document.getElementById('hud-level');
const touchControls = document.getElementById('touch-controls');
const settingsMenu = document.getElementById('settings-menu');
const settingsIconBtn = document.getElementById('settings-icon-btn');
const closeSettingsBtn = document.getElementById('close-settings');
const resetProgressBtn = document.getElementById('reset-progress-btn');
const soundToggle = document.getElementById('sound-toggle');
const volumeSlider = document.getElementById('volume-slider');
const touchToggle = document.getElementById('touch-toggle');
const musicVolumeSlider = document.getElementById('music-volume-slider');
const customJumpInput = document.getElementById('custom-jump');
const customDeathInput = document.getElementById('custom-death');
const customCoinInput = document.getElementById('custom-coin');
const customMusicInput = document.getElementById('custom-music');
const tutorialBtn = document.getElementById('tutorial-btn');
const privacyBtn = document.getElementById('privacy-btn');
const homePrivacyBtn = document.getElementById('home-privacy-btn'); // New button on Home Screen
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const privacyScreen = document.getElementById('privacy-screen');
const closePrivacyBtn = document.getElementById('close-privacy-btn');
const tutorialScreen = document.getElementById('tutorial-screen');
const closeTutorialBtn = document.getElementById('close-tutorial'); // Add new UI elements for background animation selection
const backgroundAnimationSelectContainer = document.getElementById('background-animation-select');
const levelSelectScreen = document.getElementById('level-select-screen');
const levelsContainer = document.getElementById('levels-container');
const characterSelectScreen = document.getElementById('character-select-screen');
const closeCharacterBtn = document.getElementById('close-character-btn');
const closeLevelsBtn = document.getElementById('close-levels-btn');
const levelCompleteScreen = document.getElementById('level-complete-screen');
const levelScoreDisplay = document.getElementById('level-score-display');
const nextLevelBtn = document.getElementById('next-level-btn');
const levelHomeBtn = document.getElementById('level-home-btn');
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverTitle = document.getElementById('game-over-title');
const finalScoreDisplay = document.getElementById('final-score-display');
const restartBtn = document.getElementById('restart-btn');
const homeBtn = document.getElementById('home-btn');
const pauseBtn = document.getElementById('pause-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseHomeBtn = document.getElementById('pause-home-btn');
function playSound(sound) {
    if (soundEnabled) {
        sound.play();
    }
}

// --- Loading Screen Logic ---
window.addEventListener('load', () => {
    let progress = 0;
    const interval = setInterval(() => {
        progress += 2; // Speed of loading bar
        if (loadingBar) loadingBar.style.width = progress + '%';
        
        if (progress >= 100) {
            clearInterval(interval);
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 500);
        }
    }, 20); // Update every 20ms
});

function showHomeScreen() {
    homeScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden'); // Ensure game over screen is hidden
    settingsMenu.classList.add('hidden'); // Ensure settings hidden
    tutorialScreen.classList.add('hidden');
    levelSelectScreen.classList.add('hidden');
    characterSelectScreen.classList.add('hidden');
    levelCompleteScreen.classList.add('hidden');
    gameUI.classList.add('hidden'); // Hide HUD on home screen
    pauseBtn.classList.add('hidden'); // Hide pause button on home screen
    if (touchControls) touchControls.classList.add('hidden');
    if (highScoreDisplay) highScoreDisplay.innerText = highScore;
    canvas.style.display = 'none'; // Hide canvas so home screen appears separately
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
    } else {
        gameOverTitle.innerText = "GAME OVER";
        gameOverTitle.style.color = "#e74c3c";
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
    localStorage.setItem('dravexoSoundEnabled', soundEnabled);
});

// --- Touch Controls Toggle ---
if (touchToggle) {
    touchToggle.checked = touchEnabled;
    touchToggle.addEventListener('change', () => {
        touchEnabled = touchToggle.checked;
        localStorage.setItem('dravexoTouchEnabled', touchEnabled);
        // Update visibility immediately if playing
        if (gameState === 'PLAYING' && touchControls) {
            if (touchEnabled) touchControls.classList.remove('hidden');
            else touchControls.classList.add('hidden');
        }
    });
}

// --- Volume Slider Logic ---
if (volumeSlider) {
    volumeSlider.value = globalVolume;
    volumeSlider.addEventListener('input', (e) => {
        globalVolume = parseFloat(e.target.value);
        localStorage.setItem('dravexoVolume', globalVolume);
        // Update background music immediately
        backgroundMusic.setVolume(globalVolume);
    });
}

// --- Music Volume Slider Logic ---
if (musicVolumeSlider) {
    musicVolumeSlider.value = musicVolume;
    musicVolumeSlider.addEventListener('input', (e) => {
        musicVolume = parseFloat(e.target.value);
        localStorage.setItem('dravexoMusicVolume', musicVolume);
        backgroundMusic.setVolume(musicVolume);
    });
}

// --- Settings & Tutorial Logic ---
settingsIconBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    settingsMenu.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    settingsMenu.classList.add('hidden');
});

tutorialBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    tutorialScreen.classList.remove('hidden');
});

if (privacyBtn) {
    privacyBtn.addEventListener('click', () => {
        playSound(uiClickSound);
        settingsMenu.classList.add('hidden'); // Hide settings to show privacy clearly
        privacyScreen.classList.remove('hidden');
    });
}

// --- Home Screen Privacy Button ---
if (homePrivacyBtn) {
    homePrivacyBtn.addEventListener('click', () => {
        playSound(uiClickSound);
        // Show privacy screen directly
        privacyScreen.classList.remove('hidden');
    });
}

if (closePrivacyBtn) {
    closePrivacyBtn.addEventListener('click', () => {
        playSound(uiClickSound);
        privacyScreen.classList.add('hidden');
        settingsMenu.classList.remove('hidden'); // Return to settings
    });
}

closeTutorialBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    tutorialScreen.classList.add('hidden');
});

// --- Reset Progress Logic ---
if (resetProgressBtn) {
    resetProgressBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to lock all levels? This will reset your progress.")) {
            localStorage.setItem('dravexoMaxLevel', '0');
            maxLevelReached = 0;
            
            // Lock Session 1 and Session 2 buttons immediately
            if (levelsBtn) {
                levelsBtn.disabled = true;
                levelsBtn.innerText = 'SESSION 1 🔒';
            }
            if (session2Btn) {
                session2Btn.disabled = true;
                session2Btn.innerText = "SESSION 2 🔒";
            }

            populateLevelSelect(); // Refresh the buttons to show locks
            playSound(uiClickSound);
        }
    });
}

// --- Level Select Logic ---
let currentSessionStart = 0;
let currentSessionEnd = 20;

levelsBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    currentSessionStart = 0;
    currentSessionEnd = 20;
    document.querySelector('#level-select-screen h2').innerText = "SESSION 1";
    populateLevelSelect();
    levelSelectScreen.classList.remove('hidden');
});

session2Btn.addEventListener('click', () => {
    playSound(uiClickSound);
    currentSessionStart = 20;
    currentSessionEnd = 40;
    document.querySelector('#level-select-screen h2').innerText = "SESSION 2";
    populateLevelSelect();
    levelSelectScreen.classList.remove('hidden');
});

closeLevelsBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    levelSelectScreen.classList.add('hidden');
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
                playSound(uiClickSound);
                currentLevelIndex = index;
                score = 0; // Reset score for new run
                gameState = 'PLAYING';
                hideHomeScreen();
                levelSelectScreen.classList.add('hidden');
                reset(true); // Keep the level index we just set
                backgroundMusic.play();
            });
        }
        levelsContainer.appendChild(btn);
    });
}

// --- Background Animation Data & Selection ---
const backgroundAnimations = {
    'indianGradient': { name: 'Indian Gradient' },
    'starfield': { name: 'Starfield' },
    'none': { name: 'Dynamic Colors' }
};

function populateBackgroundAnimationSelect() {
    const container = document.getElementById('background-animation-select');
    container.innerHTML = ''; // Clear existing options

    for (const animKey in backgroundAnimations) {
        const anim = backgroundAnimations[animKey];

        const label = document.createElement('label');
        label.className = 'background-option-label';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'background-animation';
        input.value = animKey;
        input.checked = (animKey === selectedBackgroundAnimation);

        input.addEventListener('change', (event) => {
            playSound(uiClickSound);
            selectedBackgroundAnimation = event.target.value;
            localStorage.setItem('dravexoBackgroundAnimation', selectedBackgroundAnimation);
        });

        const span = document.createElement('span');
        span.textContent = anim.name;

        label.appendChild(input);
        label.appendChild(span);
        container.appendChild(label);
    }
}

// --- Character Data & Selection ---
const characters = {
    'cyan': { name: 'Dravexo', color: 'cyan' },
    'green': { name: 'Slime', color: '#2ecc71' },
    'purple': { name: 'Void', color: '#9b59b6' },
    'orange': { name: 'Inferno', color: '#e67e22' },
    'red': { name: 'Crimson', color: '#e74c3c' },
    'gold': { name: 'Midas', color: '#f1c40f' },
    'dark': { name: 'Ninja', color: '#2c3e50' }
};

function populateCharacterSelect() {
    const container = document.getElementById('character-list');
    container.innerHTML = ''; // Clear existing options to prevent duplicates
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'character-options';
    optionsContainer.style.justifyContent = 'center'; // Center them in the new screen

    for (const charKey in characters) {
        const option = document.createElement('div');
        option.className = 'character-option';
        option.style.backgroundColor = characters[charKey].color;
        option.dataset.char = charKey;
        option.innerText = characters[charKey].name.charAt(0); // Show first letter (e.g., 'N' for Ninja)

        option.addEventListener('click', () => {
            // Save selection to localStorage
            selectedCharacter = option.dataset.char;
            localStorage.setItem('dravexoSelectedCharacter', selectedCharacter);

            // Visual feedback
            document.querySelectorAll('.character-option').forEach(opt => opt.style.borderColor = '#555');
            option.style.borderColor = 'white';
            
            // Play special sounds for specific characters
            if (charKey === 'gold') {
                playSound(coinSound); // Midas makes a coin sound
            } else if (charKey === 'dark') {
                playSound(dashSound); // Ninja makes a dash sound
            } else {
                playSound(uiClickSound);
            }
        });
        
        // Highlight currently selected
        if (charKey === selectedCharacter) {
            option.style.borderColor = 'white';
        }

        optionsContainer.appendChild(option);
    }
    container.appendChild(optionsContainer);
}

characterBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    populateCharacterSelect(); // Refresh selection state
    characterSelectScreen.classList.remove('hidden');
});

closeCharacterBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    characterSelectScreen.classList.add('hidden');
});

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
    platforms: [ { x: 0, y: 350, w: 150, h: 50 }, { x: 400, y: 350, w: 150, h: 20, fake: true }, { x: 700, y: 200, w: 100, h: 20 } ],
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
        { x: 360, y: 100, w: 80, h: 80, type: 'boss', hp: 20, maxHp: 20, shootTimer: 100, startY: 100 } 
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
    enemies: [{x:600,y:150,w:60,h:60,type:'boss2',hp:35,maxHp:35,timer:0,state:'idle'}],
    coins: [],
    powerUps: [{x:50,y:300,w:25,h:25,type:'shield'}],
    playerStart: {x:50,y:300}, goal: {x:-1000,y:-1000,w:0,h:0}
  }
];

let keys = {};
let justPressed = {}; // To track single key presses for actions like jumping

document.addEventListener("keydown", e => {
    if (!keys[e.key]) { // If the key wasn't already down
        justPressed[e.key] = true;
    }
    keys[e.key] = true;
});
document.addEventListener("keyup", e => keys[e.key] = false);

// --- Audio ---
// Helper function to load and play sounds
function createSound(src, loop = false, isMusic = false) {
  const sound = new Audio(src);
    sound.loop = loop;
    let fadeInterval;

  return {
    play: () => {
      if (!soundEnabled) return;
      clearInterval(fadeInterval);
      
      let vol = isMusic ? musicVolume : globalVolume;
      if (!Number.isFinite(vol)) vol = 0.5; // Safety check
      sound.volume = Math.max(0, Math.min(1, vol)); // Clamp volume
      
      sound.currentTime = 0; // Allow sound to be replayed quickly
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

// Load your sound files here. Make sure you have an 'assets' folder.
let jumpSound = createSound("assets/jump.wav", false);
let coinSound = createSound("assets/coin.wav");
let stompSound = createSound("assets/stomp.wav");
let deathSound = createSound("assets/death.wav");
let levelWinSound = createSound("assets/win.wav");
let powerUpSound = createSound("assets/powerup.wav");
let grappleSound = createSound("assets/grapple.wav");
let dashSound = createSound("assets/dash.wav");
let shootSound = createSound("assets/laser.wav", false); // Sound for the new enemy
let backgroundMusic = createSound("assets/music.mp3", true, true);
let uiClickSound = createSound("assets/click.wav");
let landSound = createSound("assets/land.wav");

function generateStars() {
    stars = []; // Clear existing stars
    const numStars = 150;
    for (let i = 0; i < numStars; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2
        });
    }
}

// --- Custom Sound Logic ---
function handleCustomSound(inputElement, soundVarName, isLoop = false) {
    if (!inputElement) return;
    inputElement.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const objectURL = URL.createObjectURL(file);
            
            // Special handling for background music to stop old track
            if (soundVarName === 'backgroundMusic') {
                backgroundMusic.stop();
                backgroundMusic = createSound(objectURL, true, true);
                if (gameState === 'PLAYING') {
                    backgroundMusic.play();
                }
            } else if (soundVarName === 'jumpSound') {
                jumpSound = createSound(objectURL, false);
                jumpSound.play(); // Preview sound
            } else if (soundVarName === 'deathSound') {
                deathSound = createSound(objectURL, false);
                deathSound.play(); // Preview sound
            } else if (soundVarName === 'coinSound') {
                coinSound = createSound(objectURL, false);
                coinSound.play(); // Preview sound
            }
            
            // Reset input so same file can be selected again if needed
            // e.target.value = ''; 
        }
    });
}

handleCustomSound(customJumpInput, 'jumpSound');
handleCustomSound(customDeathInput, 'deathSound');
handleCustomSound(customCoinInput, 'coinSound');
handleCustomSound(customMusicInput, 'backgroundMusic', true);

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
backgroundLayers.push(createImage("assets/bg_far.png", 0.2));
backgroundLayers.push(createImage("assets/bg_mid.png", 0.5));

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

  // --- Camera Snap ---
  // Center camera on player start, then clamp
  camera.x = player.x + player.w / 2 - camera.width / 2;
  camera.y = player.y + player.h / 2 - camera.height / 2;
  clampCamera(level.width || canvas.width, level.height || canvas.height);
  spawnEnemies();
  spawnCoins();
}

// Reset game to the very beginning
function reset(keepLevel = false) {
    if (!keepLevel) {
        score = 0;
        currentLevelIndex = 0; // Reset to level 1
    }
    player.color = characters[selectedCharacter].color; // Set player color on reset
    gameState = 'PLAYING';
    pauseBtn.classList.remove('hidden'); // Show pause button when playing
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
    deathSound.play();
    backgroundMusic.stop();
    gameState = 'GAME_OVER';

    const finalScore = Math.floor(score / 10);
    if (finalScore > highScore) {
        highScore = finalScore;
        localStorage.setItem('dravexoHighScore', highScore);
    }
    showGameOverMenu(false);
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


function update() {
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

  const jumpPressed = justPressed[" "] || justPressed["Space"] || justPressed["w"] || justPressed["W"] || justPressed["ArrowUp"];
  // Cancel grapple with jump
  if (player.isGrappling && jumpPressed) {
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
        grappleSound.play();
        player.onGround = false;
        player.jumps = 1; // Using grapple counts as a jump
      }
    }
  }

  // --- Handle Input & State-based Movement ---
  const dashPressed = justPressed["Shift"];
  if (dashPressed && player.dashCooldown <= 0 && !player.isDashing) {
    player.isDashing = true;
    player.dashTimer = DASH_DURATION;
    player.dashCooldown = DASH_COOLDOWN;
    dashSound.play();
  }

  if (player.isGrappling) {
    player.dy = GRAPPLE_PULL_SPEED;
    player.dx = 0;
  } else if (player.isDashing) {
    player.dy = 0; // No gravity during dash
    player.dx = player.facingDirection * DASH_SPEED;
  } else {
    // Normal Player movement
    if (keys["a"] || keys["A"] || keys["ArrowLeft"]) {
      player.dx = -PLAYER_SPEED;
      player.facingDirection = -1;
    } else if (keys["d"] || keys["D"] || keys["ArrowRight"]) {
      player.dx = PLAYER_SPEED;
      player.facingDirection = 1;
    } else {
      player.dx = 0;
    }

      // Player jump logic
      if (jumpPressed) {
        if (player.isTouchingWall && !player.onGround) { // Wall Jump
          player.dy = JUMP_FORCE;
          player.dx = -player.wallDirection * PLAYER_SPEED * 1.5; // Push away from wall
          player.facingDirection = -player.wallDirection;
          playSound(jumpSound);

          // Enemies Jump (Wall Jump)
          enemies.forEach(e => {
            if (e.type === 'patrol' && e.y >= e.startY) e.dy = JUMP_FORCE;
          });
        } else if (player.jumps < player.maxJumps) { // Normal / Double Jump
          player.dy = JUMP_FORCE;
          jumpSound.play();
          player.onGround = false;
          player.jumps++;

          // Enemies Jump (Normal Jump)
          enemies.forEach(e => {
            if (e.type === 'patrol' && e.y >= e.startY) e.dy = JUMP_FORCE;
          });
        }
      }

      // Apply gravity or wall slide speed
      if (player.isTouchingWall && !player.onGround && player.dy > 0) {
        player.dy = WALL_SLIDE_SPEED;
      } else {
        player.dy += GRAVITY;
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
      const levelWidth = levels[currentLevelIndex].width || canvas.width;
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
            playSound(landSound);
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
    // --- Movement AI based on type ---
    const enemy = enemies[i];
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
            playSound(shootSound);
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
            playSound(shootSound);
            enemy.shootTimer = (enemy.hp / enemy.maxHp) * 100 + 30; // Shoot faster as HP drops
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
                playSound(shootSound);
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
      if (enemy.type === 'boss' || enemy.type === 'boss2') {
          // --- Boss Collision Logic ---
          const isStomp = player.dy > 0 && player.y + player.h < enemy.y + 30;
          const isDashAttack = player.isDashing;

          if (isStomp || isDashAttack) {
              enemy.hp--;
              playSound(stompSound);
              player.dy = -12; // Big bounce off boss
              
              if (isDashAttack) {
                  player.isDashing = false; 
                  player.dx = -player.facingDirection * 8; // Bounce back
              }

              if (enemy.hp <= 0) {
                  enemies.splice(i, 1);
                  score += 5000;
                  // Spawn Goal in center
                  goal = { x: 400, y: 300, w: 40, h: 60 };
                  playSound(levelWinSound);
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
            playSound(stompSound);
            score += 150;
        } else if (player.dy > 0 && player.y + player.h < enemy.y + 25) {
            enemies.splice(i, 1);
            player.dy = -5;
            stompSound.play();
            score += 100;
        } else {
        // Player is hit by the enemy (unless dashing)
        if (!player.isDashing && !player.invincible) {
          if (player.hasShield) {
            player.hasShield = false; // Shield breaks
            player.dy = -5; // Knockback
            player.dx = -player.facingDirection * 5;
          } else {
            playerDie();
          }
        }
      }
      }
    }
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
      playSound(coinSound);
      score += 50; // Increase score
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
        playSound(powerUpSound);
      } else if (powerUp.type === 'shield') {
        player.hasShield = true;
        playSound(powerUpSound);
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
          playSound(powerUpSound); // Reuse sound
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
    levelWinSound.play();
      currentLevelIndex++;
      
      // Update max level reached
      if (currentLevelIndex > maxLevelReached) {
          maxLevelReached = currentLevelIndex;
          localStorage.setItem('dravexoMaxLevel', maxLevelReached);
          populateLevelSelect(); // Update UI
      }

    if (currentLevelIndex < levels.length) {
      // Show Level Complete Screen
      levelCompleteScreen.classList.remove('hidden');
      gameUI.classList.add('hidden');
      pauseBtn.classList.add('hidden');
      backgroundMusic.stop();
      gameState = 'LEVEL_COMPLETE';
      // loadLevel will be called by the next level button
    } else {
      gameState = 'GAME_WON';
      backgroundMusic.stop();
      // Check and set high score when the game is won
      const finalScore = Math.floor(score / 10);
      if (finalScore > highScore) {
          highScore = finalScore;
          localStorage.setItem('dravexoHighScore', highScore);
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
  const level = levels[currentLevelIndex];
  const levelWidth = level.width || canvas.width;
  const levelHeight = level.height || canvas.height;

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
    // Side Face (Right) - Shadow
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + depth, y - depth);
    ctx.lineTo(x + w + depth, y + h - depth);
    ctx.lineTo(x + w, y + h);
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; // Shadow overlay
    ctx.fill();

    // Top Face - Highlight
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + depth, y - depth);
    ctx.lineTo(x + w + depth, y - depth);
    ctx.lineTo(x + w, y);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)"; // Highlight overlay
    ctx.fill();

    // Front Face
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function draw() {
  // Draw the selected background animation
  drawBackground();
  
  // --- Draw Game World (translated by camera) ---
  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y)); // Use Math.round for crisp pixels

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
  if (!player.onGround && player.dy > -JUMP_FORCE / 2) {
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
  }

  // Draw platforms
  platforms.forEach(p => {
    draw3DBlock(p.x, p.y, p.w, p.h, "lime");
  });

  // Draw enemies
  enemies.forEach(enemy => {
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

  ctx.restore();

}

function drawBackground() {
    // Clear screen and draw base background
    if (selectedBackgroundAnimation === 'indianGradient') {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#ff9933'); // Saffron
        gradient.addColorStop(0.5, '#ffffff'); // White
        gradient.addColorStop(1, '#138808'); // Green
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ashoka Chakra
        ctx.strokeStyle = '#000080';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 50, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 24; i++) {
            const angle = (i * 15) * Math.PI / 180;
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, canvas.height / 2);
            ctx.lineTo(canvas.width / 2 + Math.cos(angle) * 50, canvas.height / 2 + Math.sin(angle) * 50);
            ctx.stroke();
        }
    } else if (selectedBackgroundAnimation === 'starfield') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        stars.forEach(star => {
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
        });
    } else {
        // Dynamic background color based on level
        const hue = (currentLevelIndex * 137) % 360; // Rotate hue for each level
        ctx.fillStyle = `hsl(${hue}, 30%, 20%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw Parallax Background on top of selected static/animated background
    // This part should remain, as parallax is a separate layer
    backgroundLayers.forEach(layer => {
        if (!layer.img.complete || layer.img.naturalHeight === 0) return;
        const scrollX = (camera.x * layer.factor);
        const x = - (scrollX % layer.img.width);
        ctx.drawImage(layer.img, x, 0, layer.img.width, canvas.height);
        ctx.drawImage(layer.img, x + layer.img.width, 0, layer.img.width, canvas.height);
    });
}

function loop() {
  // The main game loop now acts as a state machine.
  // It will only update the game logic when we are in the 'PLAYING' state.
  if (gameState === 'PLAYING') {
    update();
  }
  
  draw();

  // Draw overlay screens on top of the game
  // Game Over / Won screens are now DOM elements, so no canvas drawing needed here
  // START_SCREEN is now handled by DOM, so we don't draw text on canvas for it.

  // Clear single-press keys at the end of the frame
  justPressed = {};

  requestAnimationFrame(loop);
}
 
// Start the game loop
// Stop any previous music and reset state when the script reloads
backgroundMusic.stop();

// Initial Setup
generateStars();
loadLevel(0); // Load level 1 background
populateCharacterSelect(); // Create character options
populateBackgroundAnimationSelect(); // Populate background animation options
populateLevelSelect(); // Create level buttons
gameState = 'START_SCREEN';
showHomeScreen(); // Show the new Home Page

loop();

// --- Game Over / Win Button Logic ---
restartBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    gameOverScreen.classList.add('hidden');
    gameState = 'PLAYING';
    reset(true); // Restart  
    backgroundMusic.play();
    window.focus();
});

homeBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    gameOverScreen.classList.add('hidden');
    gameState = 'START_SCREEN';
    showHomeScreen();
});

// --- Level Complete Button Logic ---
nextLevelBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    levelCompleteScreen.classList.add('hidden');
    gameState = 'PLAYING';
    gameUI.classList.remove('hidden');
    pauseBtn.classList.remove('hidden');
    loadLevel(currentLevelIndex);
    backgroundMusic.play();
});

levelHomeBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    gameState = 'START_SCREEN';
    showHomeScreen();
});

// --- Pause Menu Logic ---
pauseBtn.addEventListener('click', () => {
    if (gameState === 'PLAYING') {
        playSound(uiClickSound);
        gameState = 'PAUSED';
        pauseMenu.classList.remove('hidden');
        if (touchControls) touchControls.classList.add('hidden'); // Always hide on pause
    }
});

resumeBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    gameState = 'PLAYING';
    pauseMenu.classList.add('hidden');
    if (touchControls && touchEnabled) {
        touchControls.classList.remove('hidden');
    }
});

pauseRestartBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    pauseMenu.classList.add('hidden');
    reset(true); // Restart current level
});

pauseHomeBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    pauseMenu.classList.add('hidden');
    gameState = 'START_SCREEN';
    showHomeScreen();
});

// Start Button Logic
startBtn.addEventListener('click', () => {
    playSound(uiClickSound);
    // Continue from the highest level reached
    currentLevelIndex = Math.min(maxLevelReached, levels.length - 1);
    score = 0;
    gameState = 'PLAYING';
    hideHomeScreen();
    reset(true);
    backgroundMusic.play();
    window.focus();
});

function setupTouchControls() {
  const leftBtn = document.getElementById('left-btn');
  const rightBtn = document.getElementById('right-btn');
  const jumpBtn = document.getElementById('jump-btn');
  const dashBtn = document.getElementById('dash-btn');
  const grappleBtn = document.getElementById('grapple-btn');

  if (!leftBtn) return; // Don't run if controls aren't in the DOM

  const handleInput = (e, key, isPressed) => {
    if (e.cancelable) e.preventDefault(); // Stop browser from scrolling or zooming
    
    if (isPressed && !keys[key]) {
        justPressed[key] = true;
    }
    keys[key] = isPressed;
  };

  const addListeners = (btn, key) => {
      // Touch events
      btn.addEventListener('touchstart', e => handleInput(e, key, true), { passive: false });
      btn.addEventListener('touchend', e => handleInput(e, key, false), { passive: false });
      
      // Mouse events (for desktop testing)
      btn.addEventListener('mousedown', e => handleInput(e, key, true));
      btn.addEventListener('mouseup', e => handleInput(e, key, false));
      btn.addEventListener('mouseleave', e => handleInput(e, key, false));
  };

  addListeners(leftBtn, 'a');
  addListeners(rightBtn, 'd');
  addListeners(jumpBtn, ' ');
  addListeners(dashBtn, 'Shift');
  addListeners(grappleBtn, 'e');
}

// Set up touch listeners when the script loads
setupTouchControls();
