// ==UserScript==
// @name         Custom Native HTML5 Player with Shortcuts
// @namespace    https://gist.github.com/narcolepticinsomniac
// @version      1.0
// @description  Custom html5 player with shortcuts and v.redd.it videos with audio
// @author       narcolepticinsomniac
// @include      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/arrive/2.4.1/arrive.min.js
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

let ytID;
let ytTimeChecked;
const $$ = document.querySelector.bind(document);

const settings = {
  // delay to hide contols and cursor if inactive (set to 3000 milliseconds)
  hideControls: 3000,
  // delay for fullscreen double-click (set to 300 milliseconds)
  clickDelay: 300,
  // right-click delay to match imagus user setting (set to 0 milliseconds)
  imagusStickyDelay: 0,
  // right/left arrows keys or inner skip buttons (set to 10 seconds)
  skipNormal: 10,
  // Shift + Arrow keys or outer skip buttons (set to 30 seconds)
  skipShift: 30,
  // Ctrl + Arrow keys skip (set to 1 minute)
  skipCtrl: 1,
};


function customPlayer(v) {
  let Audio;
  let audioSync;
  let audioError;
  let videoWrapper;
  let savedTimeKey;
  let mouseDown;
  let isPlaying;
  let isSeeking;
  let earlyXposPercent;
  let preventMouseMove;
  let controlsTimeout;
  let imagusMouseTimeout;
  let imagusVid;
  let muteTillSync;
  let loaded;
  let error;
  let elToFocus;
  let clickCount = 0;
  let repeat = 0;
  const shortcutFuncs = {
    toggleCaptions: v => {
      const validTracks = [];
      for (let i = 0; i < v.textTracks.length; ++i) {
        const tt = v.textTracks[i];
        if (tt.mode === 'showing') {
          tt.mode = 'disabled';
          if (v.textTracks.addEventListener) {
            // If text track event listeners are supported
            // (they are on the most recent Chrome), add
            // a marker to remember the old track. Use a
            // listener to delete it if a different track
            // is selected.
            v.cbhtml5vsLastCaptionTrack = tt.label;

            function cleanup(e) {
              for (let i = 0; i < v.textTracks.length; ++i) {
                const ott = v.textTracks[i];
                if (ott.mode === 'showing') {
                  delete v.cbhtml5vsLastCaptionTrack;
                  v.textTracks.removeEventListener('change', cleanup);
                  return;
                }
              }
            }
            v.textTracks.addEventListener('change', cleanup);
          }
          return;
        } else if (tt.mode !== 'hidden') {
          validTracks.push(tt);
        }
      }
      // If we got here, none of the tracks were selected.
      if (validTracks.length === 0) {
        return true; // Do not prevent default if no UI activated
      }
      // Find the best one and select it.
      validTracks.sort((a, b) => {
        if (v.cbhtml5vsLastCaptionTrack) {
          const lastLabel = v.cbhtml5vsLastCaptionTrack;

          if (a.label === lastLabel && b.label !== lastLabel) {
            return -1;
          } else if (b.label === lastLabel && a.label !== lastLabel) {
            return 1;
          }
        }

        const aLang = a.language.toLowerCase();
        const bLang = b.language.toLowerCase();
        const navLang = navigator.language.toLowerCase();

        if (aLang === navLang && bLang !== navLang) {
          return -1;
        } else if (bLang === navLang && aLang !== navLang) {
          return 1;
        }

        const aPre = aLang.split('-')[0];
        const bPre = bLang.split('-')[0];
        const navPre = navLang.split('-')[0];

        if (aPre === navPre && bPre !== navPre) {
          return -1;
        } else if (bPre === navPre && aPre !== navPre) {
          return 1;
        }

        return 0;
      })[0].mode = 'showing';
    },

    togglePlay: v => {
      v.paused ? v.play() : v.pause();
    },

    toStart: v => {
      v.currentTime = 0;
    },

    toEnd: v => {
      v.currentTime = v.duration;
    },

    skipLeft: (v, key, shift, ctrl) => {
      if (shift) {
        v.currentTime -= settings.skipShift;
      } else if (ctrl) {
        v.currentTime -= settings.skipCtrl;
      } else {
        v.currentTime -= settings.skipNormal;
      }
    },

    skipRight: (v, key, shift, ctrl) => {
      if (shift) {
        v.currentTime += settings.skipShift;
      } else if (ctrl) {
        v.currentTime += settings.skipCtrl;
      } else {
        v.currentTime += settings.skipNormal;
      }
    },

    increaseVol: v => {
      if (audioError) return;
      if (v.nextSibling.querySelector('volume.disabled')) {
        v.volume = 0;
        return;
      }
      const increase = (v.volume + 0.1).toFixed(1);
      if (v.muted) {
        v.muted = !v.muted;
        v.volume = 0.1;
      } else {
        v.volume <= 0.9 ? v.volume = increase : v.volume = 1;
      }
    },

    decreaseVol: v => {
      if (audioError) return;
      if (v.nextSibling.querySelector('volume.disabled')) {
        v.volume = 0;
        return;
      }
      const decrease = (v.volume - 0.1).toFixed(1);
      v.volume >= 0.1 ? v.volume = decrease : v.volume = 0;
    },

    toggleMute: v => {
      v.muted = !v.muted;
      if (audioSync) Audio.muted = v.muted;
    },

    toggleFS: v => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        v.parentElement.classList.remove('native-fullscreen');
      } else {
        v.parentElement.classList.add('native-fullscreen');
        v.parentElement.requestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
      }
    },

    reloadVideo: v => {
      const currTime = v.currentTime;
      v.load();
      v.currentTime = currTime;
    },

    slowOrPrevFrame: (v, key, shift) => {
      if (shift) { // Less-Than
        v.currentTime -= 1 / 60;
      } else { // Comma
        if (v.playbackRate >= 0.1) {
          const decrease = (v.playbackRate - 0.1).toFixed(2);
          const rate = v.nextSibling.querySelector('rate');
          v.playbackRate = decrease;
          rate.textContent = `${v.playbackRate}x`;
          if (v.playbackRate !== 1) {
            rate.setAttribute('data-current-rate', `${v.playbackRate}x`);
          }
          if (v.playbackRate === 0.9) {
            v.classList.add('playback-rate-decreased');
          } else if (v.playbackRate === 1.1) {
            v.classList.add('playback-rate-increased');
          } else if (v.playbackRate === 1) {
            v.classList.remove('playback-rate-decreased');
            v.classList.remove('playback-rate-increased');
            rate.removeAttribute('data-current-rate');
          }
        } else {
          v.playbackRate = 0;
        }
        if (audioSync) Audio.playbackRate = v.playbackRate;
      }
    },

    fastOrNextFrame: (v, key, shift) => {
      if (shift) { // Greater-Than
        v.currentTime += 1 / 60;
      } else { // Period
        if (v.playbackRate <= 15.9) {
          const increase = (v.playbackRate += 0.1).toFixed(2);
          const rate = v.nextSibling.querySelector('rate');
          v.playbackRate = increase;
          rate.textContent = `${v.playbackRate}x`;
          if (v.playbackRate !== 1) {
            rate.setAttribute('data-current-rate', `${v.playbackRate}x`);
          }
          if (v.playbackRate === 0.9) {
            v.classList.add('playback-rate-decreased');
          } else if (v.playbackRate === 1.1) {
            v.classList.add('playback-rate-increased');
          } else if (v.playbackRate === 1) {
            v.classList.remove('playback-rate-decreased');
            v.classList.remove('playback-rate-increased');
            rate.removeAttribute('data-current-rate');
          }
        } else {
          v.playbackRate = 16;
        }
        if (audioSync) Audio.playbackRate = v.playbackRate;
      }
    },

    normalSpeed: v => { // ?
      v.playbackRate = v.defaultPlaybackRate;
      if (audioSync) Audio.playbackRate = v.playbackRate;
      v.classList.remove('playback-rate-decreased');
      v.classList.remove('playback-rate-increased');
      v.nextSibling.querySelector('rate').textContent = '1x';
      v.nextSibling.querySelector('rate').removeAttribute('data-current-rate');
    },

    toPercentage: (v, key) => {
      v.currentTime = (v.duration * (key - 48)) / 10.0;
    },
  };

  const keyFuncs = {
    32: shortcutFuncs.togglePlay, // Space
    75: shortcutFuncs.togglePlay, // K
    35: shortcutFuncs.toEnd, // End
    48: shortcutFuncs.toStart, // 0
    36: shortcutFuncs.toStart, // Home
    37: shortcutFuncs.skipLeft, // Left arrow
    74: shortcutFuncs.skipLeft, // J
    39: shortcutFuncs.skipRight, // Right arrow
    76: shortcutFuncs.skipRight, // L
    38: shortcutFuncs.increaseVol, // Up arrow
    40: shortcutFuncs.decreaseVol, // Down arrow
    77: shortcutFuncs.toggleMute, // M
    70: shortcutFuncs.toggleFS, // F
    67: shortcutFuncs.toggleCaptions, // C
    82: shortcutFuncs.reloadVideo, // R
    188: shortcutFuncs.slowOrPrevFrame, // Comma or Less-Than
    190: shortcutFuncs.fastOrNextFrame, // Period or Greater-Than
    191: shortcutFuncs.normalSpeed, // Forward slash or ?
    49: shortcutFuncs.toPercentage, // 1
    50: shortcutFuncs.toPercentage, // 2
    51: shortcutFuncs.toPercentage, // 3
    52: shortcutFuncs.toPercentage, // 4
    53: shortcutFuncs.toPercentage, // 5
    54: shortcutFuncs.toPercentage, // 6
    55: shortcutFuncs.toPercentage, // 7
    56: shortcutFuncs.toPercentage, // 8
    57: shortcutFuncs.toPercentage, // 9
  };
  const directVideo = /video/.test(document.contentType) &&
    document.body.firstElementChild === v;
  const controls = document.createElement('controls');
  const imagus = v.classList.contains('imagus') || v.classList.contains('reddit-sync');
  if (imagus && !imagusVid) {
    imagusVid = v;
    Audio = document.createElement('video');
    Audio.preload = 'auto';
    //imagusAudio.autoplay = 'true';
    Audio.className = 'imagus imagus-audio';
    Audio.style = 'display: none!important;';
    imagusVid.parentElement.insertBefore(Audio, imagusVid);
  }
  if (directVideo) {
    elToFocus = document.body;
    self === top ? document.body.classList.add('direct-video-top-level') :
      document.body.classList.add('direct-video-embed');
  } else {
    elToFocus = v;
    videoWrapper = document.createElement('videowrapper');
    v.parentNode.insertBefore(videoWrapper, v);
    videoWrapper.appendChild(v);
    if (!imagus) {
      const compStyles = getComputedStyle(v);
      const position = compStyles.getPropertyValue('position');
      const zIndex = compStyles.getPropertyValue('z-index');
      if (position === 'absolute') {
        videoWrapper.style.setProperty('--wrapper-position', `${position}`);
      }
      if (zIndex !== 'auto') {
        controls.style.setProperty('--controls-z-index', `calc(${zIndex} + 1)`);
      }
    }
  }
  v.parentNode.insertBefore(controls, v.nextSibling);
  const playButton = document.createElement('btn');
  playButton.className = 'toggle-play';
  controls.appendChild(playButton);
  const beginButton = document.createElement('btn');
  beginButton.className = 'begin';
  controls.appendChild(beginButton);
  const skipLongLeft = document.createElement('btn');
  skipLongLeft.className = 'skip-long left';
  controls.appendChild(skipLongLeft);
  const skipShortLeft = document.createElement('btn');
  skipShortLeft.className = 'skip-short left';
  controls.appendChild(skipShortLeft);
  const skipShortRight = document.createElement('btn');
  skipShortRight.className = 'skip-short right';
  controls.appendChild(skipShortRight);
  const skipLongRight = document.createElement('btn');
  skipLongRight.className = 'skip-long right';
  controls.appendChild(skipLongRight);
  const timelineWrapper = document.createElement('timelinewrapper');
  controls.appendChild(timelineWrapper);
  const currentTime = document.createElement('currenttime');
  currentTime.textContent = '0:00';
  timelineWrapper.appendChild(currentTime);
  const timeline = document.createElement('timeline');
  timelineWrapper.appendChild(timeline);
  const timeBar = document.createElement('timebar');
  timeline.appendChild(timeBar);
  const timeBuffer = document.createElement('timebuffer');
  timeBar.appendChild(timeBuffer);
  const timeProgress = document.createElement('timeprogress');
  timeBar.appendChild(timeProgress);
  const timeSlider = document.createElement('input');
  timeSlider.type = 'range';
  timeSlider.value = 0;
  timeSlider.min = 0;
  timeSlider.max = 100;
  timeSlider.step = 0.01;
  timeSlider.textContent = '';
  timeline.appendChild(timeSlider);
  const timeTooltip = document.createElement('timetooltip');
  timeTooltip.className = 'hidden';
  timeTooltip.textContent = '-:-';
  timeline.appendChild(timeTooltip);
  const totalTime = document.createElement('totaltime');
  totalTime.textContent = '-:-';
  timelineWrapper.appendChild(totalTime);
  const rateDecrease = document.createElement('btn');
  rateDecrease.className = 'rate-decrease';
  controls.appendChild(rateDecrease);
  const rate = document.createElement('rate');
  rate.textContent = '1x';
  controls.appendChild(rate);
  const rateIncrease = document.createElement('btn');
  rateIncrease.className = 'rate-increase';
  controls.appendChild(rateIncrease);
  const volume = document.createElement('volume');
  controls.appendChild(volume);
  const volumeBar = document.createElement('volumebar');
  volume.appendChild(volumeBar);
  const volumeTrail = document.createElement('volumetrail');
  volumeBar.appendChild(volumeTrail);
  const volumeSlider = document.createElement('input');
  volumeSlider.type = 'range';
  volumeSlider.min = 0;
  volumeSlider.max = 1;
  volumeSlider.step = 0.01;
  volumeSlider.textContent = '';
  volume.appendChild(volumeSlider);
  const volumeTooltip = document.createElement('volumetooltip');
  volumeTooltip.className = 'hidden';
  volumeTooltip.textContent = '0%';
  volume.appendChild(volumeTooltip);
  const muteButton = document.createElement('btn');
  muteButton.className = 'mute';
  controls.appendChild(muteButton);
  const expandButton = document.createElement('btn');
  expandButton.className = 'expand';
  controls.appendChild(expandButton);
  v.classList.remove('custom-native-player-hidden');
  if (v.querySelector('source')) v.classList.add('contains-source');
  if (videoWrapper) enforcePosition();
  volumeValues();

  v.onloadstart = () => {
    if (/v(cf)?\.redd\.it/.test(v.src) &&
      v.classList.contains('reddit-sync')) {
      const prefix = v.src.split('DASH')[0].replace('vcf.', 'v.');
      const audioSrc = `${prefix}DASH_audio.mp4`;
      Audio.src = audioSrc
      jQuery.ajax({
        type: "GET",
        url: audioSrc,
        error: function (xhr, ajaxOptions, thrownError) {
          switch (xhr.status) {
            case 403:
              Audio.src = `${prefix}audio`;
          }
        }
      });

      if (!Audio.muted) {
        muteTillSync = true;
        Audio.muted = true;
      }
      if (imagusVid.hasAttribute('loop')) Audio.setAttribute('loop', 'true');
    }
  }


  v.onloadedmetadata = () => {
    loaded = true;
    shortcutFuncs.normalSpeed(v);
    savedTimeKey = `${location.pathname}${location.search}${v.duration}`;
    const savedTime = localStorage.getItem(savedTimeKey);
    if (timeSlider.value === '0') {
      if (savedTime) v.currentTime = savedTime;
    } else if (earlyXposPercent) {
      const time = (earlyXposPercent * v.duration) / 100;
      v.currentTime = time;
    }
    currentTime.textContent = formatTime(v.currentTime);
    totalTime.textContent = formatTime(v.duration);
    v.classList.remove('disabled');
    sliderValues();
  };

  v.onloadeddata = () => {
    const imagusVreddit = /v(cf)?\.redd\.it/.test(v.src);
    const vHasAudio = hasAudio(v);
    if (!vHasAudio && !imagusVreddit) {
      v.classList.add('muted');
      volumeSlider.value = 0;
      muteButton.classList.add('disabled');
      volume.classList.add('disabled');
    } else if (vHasAudio && !imagusVreddit) {
      if (v.volume && !v.muted) v.classList.remove('muted');
      volumeValues();
      if (volume.classList.contains('disabled')) {
        muteButton.classList.remove('disabled');
        volume.classList.remove('disabled');
      }
    }
    elToFocus.focus({ preventScroll: true });
    if (v.duration <= settings.skipNormal) {
      skipShortLeft.classList.add('disabled');
      skipShortRight.classList.add('disabled');
    } else {
      skipShortLeft.classList.remove('disabled');
      skipShortRight.classList.remove('disabled');
    }
    if (v.duration <= settings.skipShift) {
      skipLongLeft.classList.add('disabled');
      skipLongRight.classList.add('disabled');
    } else {
      skipLongLeft.classList.remove('disabled');
      skipLongRight.classList.remove('disabled');
    }
    if (v.paused) {
      v.classList.add('paused');
      if (videoWrapper) videoWrapper.classList.add('paused');
    }
    if (imagus) v.currentTime = 0;
  };

  v.oncanplay = () => {
    v.oncanplay = null;
    if (!loaded) {
      v.load();
      console.log('reloaded');
    }
  };

  v.onprogress = () => {
    if (v.readyState > 1 && v.duration > 0) {
      const buffer = (v.buffered.end(v.buffered.length - 1) / v.duration) * 100;
      timeBuffer.style.width = `${buffer}%`;
    }
  };

  v.ontimeupdate = () => {
    if (v.readyState > 0) {
      if (v.duration > 0 && !mouseDown) {
        sliderValues();
        totalTime.textContent = formatTime(v.duration);
        if (!imagus && savedTimeKey) localStorage.setItem(savedTimeKey, v.currentTime)
      }
    }
  };

  v.onvolumechange = () => {
    if (audioError) return;
    if (audioSync) Audio.volume = v.volume;
    if (v.muted || !v.volume) {
      v.classList.add('muted');
      volumeSlider.value = 0;
      volumeTrail.style.width = '0';
      localStorage.setItem('videomuted', 'true');
    } else {
      v.classList.remove('muted');
      sliderValues();
      v.volume > 0.1 ? localStorage.setItem('videovolume', v.volume) :
        localStorage.setItem('videovolume', 0.1);
      localStorage.setItem('videomuted', 'false');
    }
  };

  v.onplay = () => {
    if (v === imagusVid && audioSync) Audio.play();
    v.classList.remove('paused');
    if (videoWrapper) videoWrapper.classList.remove('paused');
    v.classList.add('playing');
  };

  v.onpause = () => {
    if (v === imagusVid && audioSync) Audio.pause();
    if (!isSeeking) {
      v.classList.remove('playing');
      v.classList.add('paused');
      if (videoWrapper) videoWrapper.classList.add('paused');
    }
  };

  v.onended = () => {
    if (localStorage.getItem(savedTimeKey)) localStorage.removeItem(savedTimeKey);
    savedTimeKey = false;
  };

  v.onemptied = () => {
    if (v === imagusVid) {
      if (v.src !== '') {
        if (/v(cf)?\.redd\.it/.test(v.src)) {
          if (imagusVid.hasAttribute('loop')) Audio.setAttribute('loop', 'true');
        }
        v.parentElement.parentElement.classList.add('imagus-video-wrapper');
        window.addEventListener('click', imagusClick, true);
        document.addEventListener('keyup', imagusKeys, true);
        document.addEventListener('mousedown', imagusMouseDown, true);
        document.addEventListener('mouseup', imagusMouseUp, true);
      } else {
        audioSync = false;
        audioError = false;
        Audio.pause();
        Audio.removeAttribute('src');
        Audio.load();
        Audio.removeAttribute('loop');
        v.parentElement.parentElement.removeAttribute('class');
        timeTooltip.classList.add('hidden');
        window.removeEventListener('click', imagusClick, true);
        document.removeEventListener('keyup', imagusKeys, true);
        document.removeEventListener('mousedown', imagusMouseDown, true);
        document.removeEventListener('mouseup', imagusMouseUp, true);
      }
    }
  };

  v.onerror = () => {
    error = true;
    elToFocus.blur();
    v.classList.add('disabled');
  };

  v.onmousedown = e => {
    if (error && e.button !== 2) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.button === 0) {
      clickCount++;
      const checkState = v.paused;
      if (clickCount === 1) {
        setTimeout(() => {
          if (clickCount === 1) {
            // avoid conflicts with existing click listeners
            const recheckState = v.paused;
            if (checkState === recheckState) shortcutFuncs.togglePlay(v);
          } else {
            shortcutFuncs.toggleFS(v);
          }
          clickCount = 0;
        }, settings.clickDelay);
      }
    } else if (e.button === 2) {
      window.addEventListener('contextmenu', preventHijack, true);
    }
  };

  v.onmouseup = e => {
    if (e.button === 2) {
      setTimeout(() => {
        window.removeEventListener('contextmenu', preventHijack, true);
      }, 100);
    }
    if (error) elToFocus.blur();
  };

  v.onmousemove = () => {
    controlsTimeout ? clearTimeout(controlsTimeout) :
      v.classList.add('active');
    if (videoWrapper) videoWrapper.classList.add('active');
    controlsTimeout = setTimeout(() => {
      controlsTimeout = false;
      v.classList.remove('active');
      if (videoWrapper) videoWrapper.classList.remove('active');
    }, settings.hideControls);
  };

  new ResizeObserver(() => {
    compactControls();
  }).observe(v);

  controls.onclick = () => {
    if (error) return;
    elToFocus.focus({ preventScroll: true });
  };

  timeSlider.onmousemove = () => sliderValues();

  timeSlider.oninput = () => sliderValues();

  timeSlider.onmousedown = e => {
    if (e.button > 0) return;
    mouseDown = true;
    isSeeking = true;
    if (timeTooltip.classList.contains('hidden')) sliderValues();
    if (v.readyState > 0) {
      if (!v.paused) {
        isPlaying = true;
        v.pause();
      } else {
        isPlaying = false;
      }
    }
  };

  timeSlider.onmouseup = e => {
    if (e.button > 0) return;
    mouseDown = false;
    isSeeking = false;
    if (v.readyState > 0) {
      sliderValues();
      if (isPlaying) {
        v.play();
        isPlaying = false;
      }
    }
  };

  volumeSlider.onmousemove = () => sliderValues();

  volumeSlider.oninput = () => {
    if (v.muted) shortcutFuncs.toggleMute(v);
    sliderValues();
  };

  muteButton.onclick = e => {
    if (e.button > 0) return;
    const lastVolume = localStorage.getItem('videovolume');
    if (v.muted || v.volume) shortcutFuncs.toggleMute(v);
    v.volume = lastVolume;
    if (audioSync) Audio.muted = v.muted;
  };

  playButton.onclick = e => {
    if (e.button > 0) return;
    shortcutFuncs.togglePlay(v);
  };

  skipShortLeft.onclick = e => {
    if (e.button > 0) return;
    shortcutFuncs.skipLeft(v);
  };

  skipShortRight.onclick = e => {
    if (e.button > 0) return;
    shortcutFuncs.skipRight(v);
  };

  skipLongLeft.onclick = e => {
    if (e.button > 0) return;
    v.currentTime -= settings.skipShift;
  };

  skipLongRight.onclick = e => {
    if (e.button > 0) return;
    v.currentTime += settings.skipShift;
  };

  beginButton.onclick = e => {
    if (e.button > 0) return;
    v.currentTime = 0;
    timeSlider.value = 0;
    timeProgress.style.width = '0';
    currentTime.textContent = '0:00';
  };

  rateDecrease.onclick = e => {
    if (e.button > 0) return;
    shortcutFuncs.slowOrPrevFrame(v);
  };

  rateIncrease.onclick = e => {
    if (e.button > 0) return;
    shortcutFuncs.fastOrNextFrame(v);
  };

  rate.onclick = e => {
    if (e.button > 0) return;
    shortcutFuncs.normalSpeed(v);
  };

  rate.onmouseenter = () => {
    rate.textContent = '1x?';
  };

  rate.onmouseleave = () => {
    const currentRate = rate.getAttribute('data-current-rate');
    if (currentRate) rate.textContent = currentRate;
  };

  expandButton.onclick = e => {
    if (e.button > 0) return;
    shortcutFuncs.toggleFS(v);
  };

  // exiting fullscreen by escape key or other browser provided method
  document.onfullscreenchange = () => {
    if (!document.fullscreenElement) {
      const nativeFS = $$('.native-fullscreen');
      if (nativeFS) nativeFS.classList.remove('native-fullscreen');
    }
  };

  if (imagusVid) {
    Audio.onloadedmetadata = () => {
      audioSync = true;
      if (v.hasAttribute('autoplay')) Audio.play();
    };

    Audio.onloadeddata = () => {
      if (v.volume && !v.muted) v.classList.remove('muted');
      volumeValues(v);
      if (volume.classList.contains('disabled')) {
        muteButton.classList.remove('disabled');
        volume.classList.remove('disabled');
      }
    };

    Audio.onended = () => {
      Audio.currentTime = 0;
      if (imagusVid.hasAttribute('loop')) Audio.play();
    };

    Audio.onerror = () => {
      audioError = true;
      v.classList.add('muted');
      volumeSlider.value = 0;
      muteButton.classList.add('disabled');
      volume.classList.add('disabled');
    };
  }

  if (directVideo) {
    v.removeAttribute('tabindex');
    document.body.setAttribute('tabindex', '0');
    document.addEventListener('keydown', docHandleKeyDown, true);
    document.addEventListener('keypress', docHandleKeyOther, true);
    document.addEventListener('keyup', docHandleKeyOther, true);
  } else {
    v.addEventListener('keydown', handleKeyDown, false);
    v.addEventListener('keypress', handleKeyOther, false);
    v.addEventListener('keyup', handleKeyOther, false);
  }

  function sliderValues() {
    let slider;
    let xPosition;
    const vid = audioSync ? Audio && v : v;
    const eType = event && event.type;
    const eTime = eType === 'timeupdate';
    const eVolume = eType === 'volumechange';
    const eMeta = eType === 'loadedmetadata';
    const eData = eType === 'loadeddata';
    const eInput = eType === 'input';
    const eMouseUp = eType === 'mouseup';
    const eMouseMove = eType === 'mousemove';
    const eMouseDown = eType === 'mousedown';
    if (eMeta || eTime || eVolume || eData || !event) {
      slider = eMeta || eTime ? timeSlider : volumeSlider;
    } else {
      slider = event.target;
    }
    const tooltip = slider.nextSibling;
    const timeTarget = slider === timeSlider;
    const sliderWidth = slider.clientWidth;
    const halfSlider = sliderWidth / 2;
    const slider14ths = halfSlider / 7;
    const eX = event && event.offsetX;
    const start7 = eX <= 7;
    const end7 = eX >= sliderWidth - 7;
    if (eMouseMove || eMouseDown) {
      if (start7 || end7) {
        xPosition = start7 ? 0 : sliderWidth;
      } else {
        xPosition = eX < halfSlider ? (eX + (-7 + (eX / slider14ths))).toFixed(1) :
          (eX + ((eX - halfSlider) / slider14ths)).toFixed(1);
      }
    }
    if (eMeta || eTime || eVolume || eData || !event) {
      xPosition = eMeta || eTime ?
        ((((100 / v.duration) * v.currentTime) * sliderWidth) / 100).toFixed(1) :
        (v.volume * sliderWidth).toFixed(1);
    }
    if (eTime && event.target === imagusVid && audioSync) {
      if (imagusVid.currentTime - Audio.currentTime >= 0.1 ||
        imagusVid.currentTime - Audio.currentTime <= -0.1) {
        Audio.currentTime = imagusVid.currentTime + 0.06;
        console.log('time sync corrected');
        if (muteTillSync && Audio.readyState > 2) {
          Audio.muted = false;
          muteTillSync = false;
          console.log('unmuted after time correct');
        }
      } else if (muteTillSync && Audio.readyState > 2) {
        Audio.muted = false;
        muteTillSync = false;
        console.log('unmuted');
      }
    }
    if (eInput || eMouseUp) xPosition = +tooltip.getAttribute('data-x-position');
    const xPosPercent = timeTarget ? (xPosition / sliderWidth) * 100 :
      Math.round((xPosition / sliderWidth) * 100);
    let time = (xPosPercent * v.duration) / 100;
    if (eInput || eMeta || eTime || eVolume || eData || !event) {
      const valueTrail = timeTarget ? timeProgress : volumeTrail;
      const offset = halfSlider < xPosition ? -7 + (xPosition / slider14ths) :
        (xPosition - halfSlider) / slider14ths;
      slider.value = timeTarget ? xPosPercent : xPosPercent / 100;
      valueTrail.style.width = `calc(${xPosPercent}% - ${offset}px)`;
      if (eInput && !timeTarget) {
        if (start7 || end7) {
          vid.volume = start7 ? 0 : 1;
        } else {
          vid.volume = xPosPercent / 100;
        }
      }
      if (eInput && timeTarget && v.readyState > 0) currentTime.textContent = formatTime(time);
      if (eTime) currentTime.textContent = formatTime(v.currentTime);
      if (eInput && timeTarget && v.readyState < 1) earlyXposPercent = xPosPercent;
      if (eMeta && !tooltip.classList.contains('hidden')) {
        xPosition = +tooltip.getAttribute('data-x-position');
        time = (xPosition / sliderWidth) * v.duration;
        tooltip.textContent = formatTime(time);
      }
    } else if (eMouseUp) {
      if (audioSync) {
        if (start7 || end7) {
          Audio.currentTime = start7 ? 0 : v.duration;
        } else {
          Audio.currentTime = time;
        }
      }
      if (start7 || end7) {
        v.currentTime = start7 ? 0 : v.duration;
      } else {
        v.currentTime = time;
      }
      preventMouseMove = true;
      setTimeout(() => {
        preventMouseMove = false;
      }, 10);
    } else if (eMouseMove || eMouseDown) {
      if (!preventMouseMove || eMouseDown) {
        tooltip.dataset.xPosition = xPosition;
        tooltip.style.left = `${eX}px`;
        if (v.readyState > 0 && timeTarget) tooltip.textContent = formatTime(time);
        if (!timeTarget) tooltip.textContent = `${xPosPercent}%`;
      }
      tooltip.classList.remove('hidden');
      preventMouseMove = false;
    }
  }

  function formatTime(t) {
    let seconds = Math.round(t);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) seconds -= minutes * 60;
    if (seconds.toString().length === 1) seconds = `0${seconds}`;
    return `${minutes}:${seconds}`;
  }

  function volumeValues() {
    const videovolume = localStorage.getItem('videovolume');
    const videomuted = localStorage.getItem('videomuted');
    if ((!videovolume && !videomuted) ||
      (videovolume && videovolume === '1' &&
        videomuted && videomuted !== 'true')) {
      v.volume = 1;
      volumeSlider.value = 1;
      volumeTrail.style.width = '100%';
      localStorage.setItem('videovolume', v.volume);
      localStorage.setItem('videomuted', 'false');
    } else if (videomuted && videomuted === 'true') {
      v.classList.add('muted');
      volumeSlider.value = 0;
      volumeTrail.style.width = '0';
      v.muted = true;
    } else {
      v.volume = videovolume;
      if (audioSync) Audio.volume = v.volume;
      sliderValues();
      if (!volumeSlider.clientWidth) {
        new MutationObserver((_, observer) => {
          const volumeWidthSet = v.parentElement.querySelector('volume input').clientWidth;
          if (volumeWidthSet) {
            sliderValues();
            observer.disconnect();
          }
        }).observe(v.parentElement, { childList: true, subtree: true, attributes: true });
      }
    }
  }

  function hasAudio() {
    return v.mozHasAudio ||
      Boolean(v.webkitAudioDecodedByteCount) ||
      Boolean(v.audioTracks && v.audioTracks.length);
  }

  function compactControls() {
    const width = v.clientWidth;
    width && width < 892 ? v.classList.add('compact') : v.classList.remove('compact');
    width && width < 412 ? v.classList.add('compact-2') : v.classList.remove('compact-2');
    width && width < 316 ? v.classList.add('compact-3') : v.classList.remove('compact-3');
    width && width < 246 ? v.classList.add('compact-4') : v.classList.remove('compact-4');
  }

  function imagusMouseDown(e) {
    const vid = $$('.imagus-video-wrapper');
    if (vid && e.button === 2) {
      e.stopImmediatePropagation();
      imagusMouseTimeout = setTimeout(() => {
        imagusMouseTimeout = 'sticky';
      }, settings.imagusStickyDelay);
    }
  }

  function imagusMouseUp(e) {
    const vid = $$('.imagus-video-wrapper');
    if (vid && e.button === 2) {
      if (imagusMouseTimeout === 'sticky') {
        vid.classList.add('stickied');
        if (volume.classList.contains('disabled')) volumeSlider.value = 0;
        document.removeEventListener('mousedown', imagusMouseDown, true);
        document.removeEventListener('mouseup', imagusMouseUp, true);
      } else {
        clearInterval(imagusMouseTimeout);
        imagusMouseTimeout = false;
      }
    }
  }

  function imagusClick(e) {
    const imagusStickied = $$('.imagus-video-wrapper.stickied');
    if (imagusStickied) {
      if (e.target.closest('.imagus-video-wrapper.stickied')) {
        e.stopImmediatePropagation();
      } else {
        imagusStickied.removeAttribute('class');
        e.preventDefault();
      }
    }
  }

  function imagusKeys(e) {
    const vid = $$('.imagus-video-wrapper');
    if (vid) {
      if (e.keyCode === 13 || e.keyCode === 90) {
        vid.classList.add('stickied');
        if (volume.classList.contains('disabled')) volumeSlider.value = 0;
        document.removeEventListener('keyup', imagusKeys, true);
        document.removeEventListener('mousedown', imagusMouseDown, true);
        document.removeEventListener('mouseup', imagusMouseUp, true);
      }
    }
  }

  function handleKeyDown(e) {
    if (e.altKey || e.metaKey) return true; // Do not activate
    const func = keyFuncs[e.keyCode];
    if (func) {
      if ((func.length < 3 && e.shiftKey) ||
        (func.length < 4 && e.ctrlKey)) return true; // Do not activate
      func(e.target, e.keyCode, e.shiftKey, e.ctrlKey);
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  function handleKeyOther(e) {
    if (e.altKey || e.metaKey) return true; // Do not prevent default
    const func = keyFuncs[e.keyCode];
    if (func) {
      if ((func.length < 3 && e.shiftKey) ||
        (func.length < 4 && e.ctrlKey)) return true; // Do not prevent default
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  function docHandleKeyDown(e) {
    if (document.body !== document.activeElement ||
      e.altKey || e.metaKey) return true; // Do not activate
    const func = keyFuncs[e.keyCode];
    if (func) {
      if ((func.length < 3 && e.shiftKey) ||
        (func.length < 4 && e.ctrlKey)) return true; // Do not activate
      func(v, e.keyCode, e.shiftKey, e.ctrlKey);
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  function docHandleKeyOther(e) {
    if (document.body !== document.activeElement ||
      e.altKey || e.metaKey) return true; // Do not prevent default
    const func = keyFuncs[e.keyCode];
    if (func) {
      if ((func.length < 3 && e.shiftKey) ||
        (func.length < 4 && e.ctrlKey)) return true; // Do not prevent default
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  // circumvent any scripts attempting to hijack video context menus
  function preventHijack(e) {
    e.stopPropagation();
    e.stopImmediatePropagation();
    const redirectEvent = e.target.ownerDocument.createEvent('MouseEvents');
    redirectEvent.initMouseEvent(e, e.bubbles, e.cancelable);
    return e;
  }

  function enforcePosition() {
    setTimeout(() => {
      let controlsDisplaced = controls !== v.nextSibling;
      const vidDisplaced = videoWrapper !== v.parentNode;
      if (vidDisplaced || controlsDisplaced) {
        if (vidDisplaced) videoWrapper.appendChild(v);
        controlsDisplaced = v !== controls.previousSibling;
        if (controlsDisplaced) videoWrapper.insertBefore(controls, v.nextSibling);
        const bs =
          videoWrapper.querySelectorAll('videowrapper > *:not(video):not(controls)');
        for (let i = 0; i < bs.length; ++i) {
          bs[i].remove();
        }
      }
      repeat++;
      if (repeat < 10) enforcePosition.call(this);
    }, 100);
  }
}

function ytSaveCurrentTime(v) {
  v.addEventListener('loadstart', ytCheckSavedTime);
  v.addEventListener('loadeddata', ytCheckSavedTime);

  v.ontimeupdate = () => {
    if (v.currentTime > 0 && ytTimeChecked) localStorage.setItem(ytID, v.currentTime);
  };

  v.onended = () => {
    if (localStorage.getItem(ytID)) localStorage.removeItem(ytID);
  };
}

function ytCheckSavedTime(e) {
  ytID = location.href.replace(/.*?\/(watch\?v=|embed\/)(.*?)(\?|&|$).*/, '$2');
  const savedTime = localStorage.getItem(ytID);
  const timeURL = /(\?|&)(t(ime_continue)?|start)=[1-9]/.test(location.href);
  const ytStart = $$('.ytp-clip-start:not([style*="left: 0%;"])');
  if (e.type === 'loadstart') {
    ytTimeChecked = false;
    if ((!ytStart || !savedTime) && !timeURL) ytTimeChecked = true;
    if (ytStart) ytStart.click();
    if (ytTimeChecked && savedTime) e.target.currentTime = savedTime;
    e.target.focus({ preventScroll: true });
    if (self === top) window.scroll({ top: 0, behavior: 'smooth' });
  } else if (e.type === 'loadeddata' && !ytTimeChecked) {
    if (savedTime) e.target.currentTime = savedTime;
    ytTimeChecked = true;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  document.arrive(
    'video[controls], video[style*="visibility: inherit !important"]',
    { fireOnAttributesModification: true, existing: true }, v => {
      if (!v.parentNode.parentNode) return;
      const vP = v.parentNode;
      const vPP = v.parentNode.parentNode;
      const imagus = !v.hasAttribute('controls') &&
        $$('html > div[style*="z-index: 2147483647"]') === v.parentNode;
      const vidOrParentsIdOrClass =
        `${v.id}${v.classList}${vP.id}${vP.classList}${vPP.id}${vPP.classList}`;
      const exclude = v.classList.contains('custom-native-player') ||
        v.classList.contains('imagus') ||
        /(v(ideo)?|me)(-|_)?js|jw|jplay|plyr|kalt|flowp|wisti/i.test(vidOrParentsIdOrClass);
      if (imagus || (v.hasAttribute('controls') && !exclude)) {
        if (imagus) v.classList.add('imagus');
        v.classList.add('custom-native-player');
        v.classList.add('custom-native-player-hidden');
        v.setAttribute('tabindex', '0');
        v.setAttribute('preload', 'auto');
        v.removeAttribute('controls');
        customPlayer(v);
      }
    });
});

if (/^https?:\/\/www\.youtube\.com/.test(location.href)) {
  document.arrive(
    'video[src*="youtube.com"]',
    { fireOnAttributesModification: true, existing: true }, v => {
      ytSaveCurrentTime(v);
    });
}
