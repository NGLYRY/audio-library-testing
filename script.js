const musicContainer = document.getElementById('music-container')
const playBtn = document.getElementById('play')
const replaySecondBtn = document.getElementById('replaySecond')
const backwardBtn = document.getElementById('backward') 

const audio = document.getElementById('audio')
const speedSlider = document.getElementById('speedSlider');
const currentSpeed = document.getElementById('currentSpeed');
const maxSourcesInput = document.getElementById('maxSourcesInput');
const currentMaxSources = document.getElementById('currentMaxSources');

// Backward parameters controls
const segmentLengthInput = document.getElementById('segmentLengthInput');
const currentSegmentLength = document.getElementById('currentSegmentLength');
const periodInput = document.getElementById('periodInput');
const currentPeriod = document.getElementById('currentPeriod');
const stepInput = document.getElementById('stepInput');
const currentStep = document.getElementById('currentStep');
const backwardSpeed = document.getElementById('backwardSpeed');

let audioContext;
let audioSource;
let gainNode;
let isWebAudioConnected = false;

let speed = 1.0; // Default playbackspeed
const progress = document.getElementById('progress')
const progressContainer = document.getElementById('progress-container')
const currTime = document.querySelector('#currTime');
const durTime = document.querySelector('#durTime');

const API_KEY = "fae6aef01046408cb7e2c932adcf6e42"; // replace this with your key https://www.assemblyai.com/
const uploadUrl = "https://api.assemblyai.com/v2/upload";
const transcribeUrl = "https://api.assemblyai.com/v2/transcript";

const songs = ['selectedpoems_01_furlong_64kb', 'selectedpoems_02_furlong_64kb', 'selectedpoems_03_furlong_64kb', 'round.mp3', 'manwhothinks'];


let songIndex = 4;

// Variable to track if we're in replay mode
let isReplayingSecond = false;
let replayTimeout;

// ===== BACKWARD PLAYBACK SYSTEM =====
// Backward parameters
let dynamicBackwardParams = {
    segmentDuration: 2.0,
    period: 1500,
    step: 1.5
};

// Function to get current backward parameters
function getBackwardParams() {
    return {
        segmentDuration: parseFloat(segmentLengthInput.value),
        period: parseInt(periodInput.value),
        step: parseFloat(stepInput.value)
    };
}

// Function to calculate backward speed
function calculateBackwardSpeed() {
    const params = getBackwardParams();
    return (params.step / (params.period / 1000)).toFixed(2);
}

// Function to update parameter displays
function updateParameterDisplays() {
    const params = getBackwardParams();
    currentSegmentLength.textContent = params.segmentDuration.toFixed(1);
    currentPeriod.textContent = params.period;
    currentStep.textContent = params.step.toFixed(1);
    backwardSpeed.textContent = calculateBackwardSpeed() + 'x';
    
    // Update dynamic parameters
    dynamicBackwardParams = params;
}

// Function to handle speed changes (positive and negative)
function handleSpeedChange(newSpeed) {
    if (newSpeed === 0) {
        // Zero speed - pause playback
        console.log('Zero speed detected - pausing playback');
        
        // Exit backward mode if active
        if (backwardMode) {
            exitBackwardMode();
        }
        
        // Pause the audio
        audio.pause();
        manualPause = true;
        updatePlayButton();
        
    } else if (newSpeed < 0) {
        console.log('Negative speed detected:', newSpeed.toFixed(1), '- entering/updating backward mode');
        
        // Calculate backward period based on speed
        const backwardPeriod = Math.round((dynamicBackwardParams.step / Math.abs(newSpeed)) * 1000);
        periodInput.value = backwardPeriod;
        updateParameterDisplays();

        // If buffer isn't loaded, kick off load early to avoid decode latency
        if (!audioBuffer && audioContext) {
            loadAudioBuffer().catch(console.error);
        }

        // If already in backward mode, just update the timer/period instead of exiting and re-entering.
        if (backwardMode) {
            // Parameters were already updated above, get the new period
            const newPeriod = dynamicBackwardParams.period;
            
            // Only restart the timer if the period has changed significantly (more than 10% difference)
            // This prevents stuttering during slider dragging
            if (currentTimerPeriod !== null && newPeriod !== currentTimerPeriod) {
                const periodChange = Math.abs((newPeriod - currentTimerPeriod) / currentTimerPeriod);
                
                // Only restart timer if period changed significantly (>10%)
                if (periodChange > 0.1) {
                    if (backwardTimer) {
                        clearInterval(backwardTimer);
                    }
                    currentTimerPeriod = newPeriod;
                    backwardTimer = setInterval(() => {
                        if (!backwardMode || manualPause) return;
                        virtualPosition = Math.max(0, virtualPosition - dynamicBackwardParams.step);
                        playBackwardSegment(virtualPosition);
                        updateProgressDisplay();
                    }, newPeriod);
                }
            } else if (currentTimerPeriod === null || !backwardTimer) {
                // Timer doesn't exist, create it
                if (backwardTimer) {
                    clearInterval(backwardTimer);
                }
                currentTimerPeriod = newPeriod;
                backwardTimer = setInterval(() => {
                    if (!backwardMode || manualPause) return;
                    virtualPosition = Math.max(0, virtualPosition - dynamicBackwardParams.step);
                    playBackwardSegment(virtualPosition);
                    updateProgressDisplay();
                }, newPeriod);
            }
            return;
        }

        // Not currently in backward mode — enter it after a short debounce so dragging doesn't thrash
        if (!backwardMode) {
            setTimeout(() => {
                // if slider still negative, enter backward mode
                if (parseFloat(speedSlider.value) < 0) {
                    enterBackwardMode();
                    updatePlayButton();
                }
            }, 150); // slightly longer debounce for negative -> avoids start/stop while dragging
        }
    } else {
        // Positive speed - normal forward playback
        console.log('Positive speed detected:', newSpeed.toFixed(1), '- using normal playback');
        
        // Exit backward mode if active
        if (backwardMode) {
            exitBackwardMode();
        }
        
        // Set normal playback rate
        audio.playbackRate = newSpeed;
        
        // If audio was paused due to zero speed, resume playing
        if (manualPause && audio.paused) {
            audio.play().catch(console.error);
            manualPause = false;
            updatePlayButton();
        }
    }
}

// Backward playback state
let manualPause = false;
let backwardMode = false;
let virtualPosition = 0;

// Backward playback variables
let backwardTimer = null;
let currentTimerPeriod = null; // Track the period currently used by the timer
let lastSources = [];
let audioBuffer = null;

// Initialize Web Audio API and to bugfix github
function initWebAudio() {
    try {
        // Create AudioContext only after user interaction
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Create gain node for volume control
        if (!gainNode) {
            gainNode = audioContext.createGain();
        }
        
        // Connect audio element to Web Audio API
        if (!isWebAudioConnected && audio) {
            audioSource = audioContext.createMediaElementSource(audio);
            audioSource.connect(gainNode);
            gainNode.connect(audioContext.destination);
            isWebAudioConnected = true;
        }
        
        console.log('Web Audio API initialized successfully');
        return true;
    } catch (error) {
        console.error('Web Audio API not supported:', error);
        return false;
    }
}

// Load audio buffer for backward playback
async function loadAudioBuffer() {
    if (audioBuffer) return audioBuffer;
    
    try {
        console.log('Loading audio buffer for backward playback...');
        const response = await fetch(audio.src);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log('Audio buffer loaded successfully');
        return audioBuffer;
    } catch (error) {
        console.error('Error loading audio buffer:', error);
        return null;
    }
}

// Play a segment of audio for backward mode
function playSegment(startTime, duration, playbackRate = 1.0) {
    if (!audioBuffer || !audioContext) {
        console.error('Cannot play segment: Audio buffer or context not ready');
        return null;
    }
    
    try {
        const source = audioContext.createBufferSource();
        const segmentGain = audioContext.createGain();

        source.buffer = audioBuffer;
        source.playbackRate.value = playbackRate;

        // Connect with its gain node so we can apply smooth crossfades
        source.connect(segmentGain);
        segmentGain.connect(audioContext.destination);

        const now = audioContext.currentTime;
        const fade = Math.min(0.03, duration / 6); // 30ms or smaller fraction

        // Audio rounding:Start with gain 0, ramp up quickly to avoid clicks, then ramp down before end
        segmentGain.gain.setValueAtTime(0, now);
        segmentGain.gain.linearRampToValueAtTime(1.0, now + fade);
        segmentGain.gain.setValueAtTime(1.0, now + duration - fade);
        segmentGain.gain.linearRampToValueAtTime(0, now + duration);

        // Start the source scheduled to play immediately (sample offset = startTime)
        source.start(now, startTime, duration);
        
        const segmentData = {
            source: source,
            gainNode: segmentGain,
            startTime: startTime,
            duration: duration
        };
        
        // Segment cleanup 
        source.onended = () => {
            console.log('Segment ended:', startTime.toFixed(2), 'to', (startTime + duration).toFixed(2));
            try {
                source.disconnect();
                segmentGain.disconnect();
            } catch (e) {}
        };
        
        return segmentData;
    } catch (error) {
        console.error('Error playing segment:', error);
        return null;
    }
}

// Stop all active sources
function stopAllSources(sources) {
    sources.forEach(item => {
        try {
            if (item.source) {
                item.source.stop();
                item.source.disconnect();
            }
            if (item.gainNode) {
                item.gainNode.disconnect();
            }
        } catch (e) {
            // Ignore errors from already stopped sources
        }
    });
    return [];
}

// Play a backward segment at the right spot
function playBackwardSegment(endPosition) {
    console.log('Playing backward segment at position:', endPosition.toFixed(2));
    
    // Don't play new segments if manually paused
    if (manualPause) {
        console.log('Skipping backward segment - manual pause active');
        return false;
    }
    
    // Get current max sources from user input
    const currentMaxSources = parseInt(maxSourcesInput.value) || 2;
    
    // Clean up old sources if we have too many
    if (lastSources.length >= currentMaxSources) {
        console.log(`Cleaning up older sources (count: ${lastSources.length}, max: ${currentMaxSources})`);
        const oldestSource = lastSources.shift();
        try {
            if (oldestSource.source) oldestSource.source.stop();
            if (oldestSource.gainNode) oldestSource.gainNode.disconnect();
        } catch (e) {
            // Ignore errors from already stopped sources
        }
    }
    
    if (!audioBuffer) {
        console.error('Cannot play backward segment: Audio buffer not loaded');
        return false;
    }
    
    // Calculate segment boundaries using dynamic parameters
    const segmentEnd = Math.min(audioBuffer.duration, Math.max(0, endPosition));
    const segmentStart = Math.max(0, segmentEnd - dynamicBackwardParams.segmentDuration);
    const segmentDuration = segmentEnd - segmentStart;
    
    console.log(`Segment: ${segmentStart.toFixed(2)}s to ${segmentEnd.toFixed(2)}s (${segmentDuration.toFixed(2)}s)`);
    
    if (segmentDuration < 0.05) {
        console.warn('Segment too short, skipping');
        return false;
    }
    
    const segmentData = playSegment(segmentStart, segmentDuration, 1.0);
    if (segmentData) {
        lastSources.push(segmentData);
        return true;
    }
    
    return false;
}

// Start backward playback mode
function startBackwardMode() {
    console.log('Starting backward playback mode at position:', virtualPosition.toFixed(2));
    
    // Ensure audio context is ready
    if (!audioContext || audioContext.state === 'suspended') {
        console.log('Audio context not ready, attempting to resume');
        resumeAudioContext().then(() => {
            if (backwardMode) {
                setTimeout(() => startBackwardMode(), 100);
            }
        });
        return false;
    }
    
    // Stop any existing timer
    if (backwardTimer) {
        console.log('Clearing existing backward timer');
        clearInterval(backwardTimer);
        backwardTimer = null;
        currentTimerPeriod = null;
    }
    
    // Clear any active sources
    console.log('Stopping all active sources');
    lastSources = stopAllSources(lastSources);
    
    // Mute HTML audio element during backward mode
    audio.muted = true;
    
    // Immediately play the first segment at current position
    console.log('Playing first backward segment');
    const success = playBackwardSegment(virtualPosition);
    
    if (!success) {
        console.error('Failed to play initial backward segment');
        backwardMode = false;
        audio.muted = false;
        return false;
    }
    
    // Set up timer to play segments at regular intervals using dynamic parameters
    console.log('Setting up interval timer for segments every', dynamicBackwardParams.period, 'ms');
    currentTimerPeriod = dynamicBackwardParams.period;
    backwardTimer = setInterval(() => {
        // Only add new segments if we're still in backward mode and not paused
        if (!backwardMode) {
            clearInterval(backwardTimer);
            backwardTimer = null;
            return;
        }
        
        // Skip playing new segments if manually paused
        if (manualPause) {
            console.log('Backward playback paused, skipping new segment');
            return;
        }
        
        // Step backward for the next segment using dynamic step size
        virtualPosition = Math.max(0, virtualPosition - dynamicBackwardParams.step);
        
        console.log('Timer triggered: playing segment at position', virtualPosition.toFixed(2));
        playBackwardSegment(virtualPosition);
        
        // Update progress display
        updateProgressDisplay();
    }, dynamicBackwardParams.period);
    
    console.log('Backward mode started successfully');
    return true;
}

// Stop backward playback mode
function stopBackwardMode() {
    console.log('Stopping backward playback mode');
    
    // Clear interval first
    if (backwardTimer) {
        clearInterval(backwardTimer);
        backwardTimer = null;
    }
    
    currentTimerPeriod = null;
    
    // Then stop all sources with proper cleanup
    lastSources = stopAllSources(lastSources);
    
    backwardMode = false;
    audio.muted = false;
    
    return true;
}

// Enter backward mode
async function enterBackwardMode() {
    if (backwardMode) {
        console.log('Already in backward mode');
        return;
    }
    
    console.log('Entering backward mode');
    
    // Initialize Web Audio, just to make sure it's always there
    if (!audioContext) {
        const success = initWebAudio();
        if (!success) {
            console.error('Failed to initialize Web Audio API');
            return;
        }
    }
    
    // Ensure audio context is running
    await resumeAudioContext();
    
    // Load audio buffer, just to make sure it's always there
    if (!audioBuffer) {
        console.log('Loading audio buffer for backward playback...');
        await loadAudioBuffer();
        if (!audioBuffer) {
            console.error('Failed to load audio buffer');
            return;
        }
    }
    
    // Set backward mode state
    backwardMode = true;
    manualPause = false;
    
    // Store current position and mute main audio
    virtualPosition = audio.currentTime;
    audio.muted = true;
    
    console.log('Starting backward mode from position:', virtualPosition.toFixed(2));
    
    // Start backward playback
    const success = startBackwardMode();
    if (!success) {
        console.error('Failed to start backward mode');
        backwardMode = false;
        audio.muted = false;
    }
    
    // Update button states
    updateBackwardButton();
    updatePlayButton();
}

// Exit backward mode
function exitBackwardMode() {
    if (!backwardMode) return;
    
    console.log('Exiting backward mode at position:', virtualPosition.toFixed(2));
    
    // Stop backward playback
    stopBackwardMode();
    
    // Resume normal playback from current virtual position
    audio.currentTime = virtualPosition;
    audio.muted = false;
    
    // Play if it was playing before
    if (!manualPause) {
        audio.play().catch(console.error);
    }
    
    console.log('Resumed forward playback at position:', virtualPosition.toFixed(2));
    
    // Update button states
    updateBackwardButton();
    updatePlayButton();
}

// Toggle backward mode
function toggleBackwardMode() {
    if (backwardMode) {
        exitBackwardMode();
        // Reset speed slider to positive value when exiting backward mode
        speedSlider.value = 1.0;
        currentSpeed.textContent = '1.0x';
        audio.playbackRate = 1.0;
    } else {
        // Set speed slider to a default negative value when entering backward mode
        speedSlider.value = -1.0;
        currentSpeed.textContent = '-1.0x';
        handleSpeedChange(-1.0);
    }
}

// Update backward button appearance
function updateBackwardButton() {
    if (!backwardBtn) return;
    
    if (backwardMode) {
        backwardBtn.classList.add('active');
        backwardBtn.style.backgroundColor = '#ff4444';
    } else {
        backwardBtn.classList.remove('active');
        backwardBtn.style.backgroundColor = '';
    }
}

// Update play/pause button appearance
function updatePlayButton() {
    if (!playBtn) return;
    
    const isPlaying = (!audio.paused && !backwardMode) || (backwardMode && !manualPause);
    
    if (isPlaying) {
        // Show pause button
        musicContainer.classList.add('play');
        playBtn.querySelector('i.fas').classList.remove('fa-play');
        playBtn.querySelector('i.fas').classList.add('fa-pause');
        playBtn.childNodes[0].textContent = 'Pause';
    } else {
        // Show play button
        musicContainer.classList.remove('play');
        playBtn.querySelector('i.fas').classList.add('fa-play');
        playBtn.querySelector('i.fas').classList.remove('fa-pause');
        playBtn.childNodes[0].textContent = 'Play';
    }
}

// Update progress display for backward mode
function updateProgressDisplay() {
    if (!backwardMode) return;
    
    // Update progress bar based on virtual position
    const progressPercent = (virtualPosition / audio.duration) * 100;
    progress.style.width = `${progressPercent}%`;
    
    // Update time display
    updateTimeDisplay(virtualPosition);
}

// Update time display
function updateTimeDisplay(time) {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    const formattedTime = `${min}:${sec.toString().padStart(2, '0')}`;
    
    if (currTime) {
        currTime.innerHTML = formattedTime;
    }
}
// ===== END BACKWARD PLAYBACK SYSTEM =====

// Resume AudioContext (required for some browsers)
async function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log('AudioContext resumed');
        } catch (error) {
            console.error('Failed to resume AudioContext:', error);
        }
    }
}

// Initially load song details into DOM
loadSong(songs[songIndex]);

function loadSong(song) {
    // Stop backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
    
    // Clear audio buffer when loading new song
    audioBuffer = null;
    
    audio.src = `mp3s/${song}.mp3`;
    
    // Preload audio buffer for backward playback
    setTimeout(() => {
        if (audioContext) {
            loadAudioBuffer().catch(console.error);
        }
    }, 1000);
}

async function playSong() {
    // Exit backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
    
    // Initialize Web Audio API on first user interaction
    if (!audioContext) {
        const success = initWebAudio();
        if (!success) {
            console.warn('Web Audio API failed to initialize, falling back to basic audio');
        }
    }
    
    // Resume audio context if suspended
    await resumeAudioContext();
    
    manualPause = false;
    
    try {
        await audio.play();
        updatePlayButton();
    } catch (error) {
        console.error('Failed to play audio:', error);
    }
}

function pauseSong() {
    manualPause = true;
    
    // Pause backward playback if active
    if (backwardMode) {
        // The segments will auto-stop due to manualPause flag
        console.log('Pausing backward playback');
    }
    
    audio.pause();
    updatePlayButton();
}

function replayLastSecond() {
    // Exit backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
    
    const currentTime = audio.currentTime;
    const replayStartTime = Math.max(0, currentTime - 1); 
    const wasPlaying = !audio.paused;
    
    clearTimeout(replayTimeout);
    
    isReplayingSecond = true;
    
    // Jump back 1 second
    audio.currentTime = replayStartTime;
    
    // Start playing from that point
    if (!wasPlaying) {
        playSong();
    }
    
    // Set timeout to pause after 1 second (or less if near beginning)
    const replayDuration = Math.min(1000, (currentTime - replayStartTime) * 1000);
    
    replayTimeout = setTimeout(() => {
        // If it wasn't playing before, pause it after the replay
        if (!wasPlaying) {
            pauseSong();
        }
        // Reset the flag
        isReplayingSecond = false;
        
        // If it was playing, continue from where we would have been
        if (wasPlaying) {
            audio.currentTime = currentTime;
        }
    }, replayDuration);
}

function updateProgress(e) {
    if (backwardMode) {
        // In backward mode, we update progress display separately
        return;
    }
    
    const { duration, currentTime } = e.srcElement;
    const progressPercent = (currentTime / duration) * 100;
    progress.style.width = `${progressPercent}%`;
    
    // Update virtual position for consistency
    virtualPosition = currentTime;
}

function setProgress(e) {
    const width = this.clientWidth;
    const clickX = e.offsetX;
    const duration = audio.duration;
    const newTime = (clickX / width) * duration;
    
    // Update position
    audio.currentTime = newTime;
    virtualPosition = newTime;
    
    // Check if speed is negative (backward mode)
    const currentSpeed = parseFloat(speedSlider.value);
    
    if (currentSpeed < 0) {
        // Speed is negative - enter backward mode
        console.log('Progress bar clicked with negative speed, entering backward mode');
        
        // Exit backward mode if already active, then enter with new position
        if (backwardMode) {
            exitBackwardMode();
        }
        
        // Update the period based on current speed and enter backward mode
        const backwardPeriod = Math.round((dynamicBackwardParams.step / Math.abs(currentSpeed)) * 1000);
        periodInput.value = backwardPeriod;
        updateParameterDisplays();
        
        // Enter backward mode with the new position
        setTimeout(() => {
            enterBackwardMode();
        }, 100);
        
    } else {
        // Speed is positive - normal forward playback
        if (backwardMode) {
            exitBackwardMode();
        }
        
        // Automatically start playing when clicking progress bar
        if (audio.paused) {
            playSong();
        }
    }
}

//get duration & currentTime for Time of song
function DurTime (e) {
    if (backwardMode) {
        // time display is separate from backward mode
        return;
    }
    
    const {duration,currentTime} = e.srcElement;
    var sec;
    var sec_d;

    // define minutes currentTime
    let min = (currentTime==null)? 0:
     Math.floor(currentTime/60);
     min = min <10 ? '0'+min:min;

    // define seconds currentTime
    function get_sec (x) {
        if(Math.floor(x) >= 60){
            
            for (var i = 1; i<=60; i++){
                if(Math.floor(x)>=(60*i) && Math.floor(x)<(60*(i+1))) {
                    sec = Math.floor(x) - (60*i);
                    sec = sec <10 ? '0'+sec:sec;
                }
            }
        }else{
         	sec = Math.floor(x);
         	sec = sec <10 ? '0'+sec:sec;
         }
    } 

    get_sec (currentTime,sec);

    // change currentTime DOM - add null check
    if(currTime) currTime.innerHTML = min +':'+ sec;

    // define minutes duration
    let min_d = (isNaN(duration) === true)? '0':
        Math.floor(duration/60);
     min_d = min_d <10 ? '0'+min_d:min_d;


     function get_sec_d (x) {
        if(Math.floor(x) >= 60){
            
            for (var i = 1; i<=60; i++){
                if(Math.floor(x)>=(60*i) && Math.floor(x)<(60*(i+1))) {
                    sec_d = Math.floor(x) - (60*i);
                    sec_d = sec_d <10 ? '0'+sec_d:sec_d;
                }
            }
        }else{
         	sec_d = (isNaN(duration) === true)? '0':
         	Math.floor(x);
         	sec_d = sec_d <10 ? '0'+sec_d:sec_d;
         }
    } 

    // define seconds duration
    
    get_sec_d (duration);

    // change duration DOM - add null check
    if(durTime) durTime.innerHTML = min_d +':'+ sec_d;
        
};

// Speed control
audio.playbackRate = parseFloat(speedSlider.value);
currentSpeed.textContent = `${parseFloat(speedSlider.value).toFixed(1)}x`;

// Debounce function to prevent rapid changes
let speedTimeout;

// Add event listener for slider changes with debouncing
speedSlider.addEventListener('input', () => {
    const newSpeed = parseFloat(speedSlider.value);
    
    // display immediately for smooth UI feedback
    currentSpeed.textContent = `${newSpeed.toFixed(1)}x`;
    
    // Clear previous timeout
    clearTimeout(speedTimeout);
    
    // Set new timeout to update playback rate after user stops dragging
    speedTimeout = setTimeout(() => {
        handleSpeedChange(newSpeed);
    }, 100); // 100ms delay
});

// Also handle when user releases the slider (for immediate response)
speedSlider.addEventListener('change', () => {
    clearTimeout(speedTimeout);
    const newSpeed = parseFloat(speedSlider.value);
    handleSpeedChange(newSpeed);
    currentSpeed.textContent = `${newSpeed.toFixed(1)}x`;
});

// Handle max sources input changes
maxSourcesInput.addEventListener('input', () => {
    const newMaxSources = parseInt(maxSourcesInput.value);
    currentMaxSources.textContent = newMaxSources;
    
    // If in backward mode and have too many sources, clean up immediately
    if (backwardMode && lastSources.length > newMaxSources) {
        console.log(`Reducing active sources from ${lastSources.length} to ${newMaxSources}`);
        while (lastSources.length > newMaxSources) {
            const oldestSource = lastSources.shift();
            try {
                if (oldestSource.source) oldestSource.source.stop();
                if (oldestSource.gainNode) oldestSource.gainNode.disconnect();
            } catch (e) {
                // Ignore errors from already stopped sources
            }
        }
    }
});

// Handle backward parameter changes
segmentLengthInput.addEventListener('input', updateParameterDisplays);
periodInput.addEventListener('input', updateParameterDisplays);
stepInput.addEventListener('input', updateParameterDisplays);

// Initialize parameter displays
updateParameterDisplays();

// Event listeners for play button
playBtn.addEventListener('click', () => {
  const currentSpeedVal = parseFloat(speedSlider.value);
  const isPlaying = (!audio.paused && !backwardMode) || (backwardMode && !manualPause);

  if (isPlaying) {
    // If currently playing in either mode, pause
    pauseSong();
    return;
  }

  if (currentSpeedVal < 0) {
    // Negative speed: play in backward mode
    if (!backwardMode) {
      enterBackwardMode();
    } else {
      manualPause = false;
    }
    updatePlayButton();
  } else if (currentSpeedVal === 0) {
    // Zero speed: remain paused
    pauseSong();
  } else {
    // Positive speed: normal forward play
    playSong();
  }
});

// replay last second button
replaySecondBtn.addEventListener('click', replayLastSecond);

// 1x backward button
backwardBtn.addEventListener('click', toggleBackwardMode);


// time/song update
audio.addEventListener('timeupdate', updateProgress);

// Click on progress bar
progressContainer.addEventListener('click', setProgress);

audio.addEventListener('ended', () => {
    pauseSong();
    // Exit backward mode if active
    if (backwardMode) {
        exitBackwardMode();
    }
    updatePlayButton();
});

// Time of song
audio.addEventListener('timeupdate', DurTime);

// Handles initial user interaction
function handleFirstInteraction() {
    if (!audioContext) {
        initWebAudio();
    }
    // remove event listeners after first interaction
    document.removeEventListener('click', handleFirstInteraction);
    document.removeEventListener('keydown', handleFirstInteraction);
}

// event listeners for first user interaction
document.addEventListener('click', handleFirstInteraction);
document.addEventListener('keydown', handleFirstInteraction);
