/* ============================================================================
 * music-autoplay.js —— 进入网站时播放一小段八音盒音乐
 * ----------------------------------------------------------------------------
 * 普通页面使用一个临时隐藏 audio，在首屏加载完成后立即销毁，避免音乐
 * 在页面稳定后继续占用网络和播放焦点。八音盒页面仍由 APlayer/Meting
 * 自己管理，不创建第二个音频。
 * ========================================================================== */
(function () {
  'use strict';

  var selector = '#aplayer-tao-playlist';
  var previewUrl = 'https://api.injahow.cn/meting/?server=netease&type=url&id=411314656';
  var retryTimers = [];
  var gestureBound = false;
  var observedAudio = null;
  var previewAudio = null;
  var previewStopTimer = null;
  var previewGestureBound = false;

  function isMusicPage() {
    return !!document.querySelector(selector);
  }

  function stopPreview() {
    if (previewStopTimer) {
      clearTimeout(previewStopTimer);
      previewStopTimer = null;
    }
    if (!previewAudio) return;
    try {
      previewAudio.pause();
      previewAudio.removeAttribute('src');
      previewAudio.load();
      previewAudio.remove();
    } catch (e) {}
    previewAudio = null;
    if (previewGestureBound) {
      previewGestureBound = false;
      document.removeEventListener('pointerdown', playPreview, true);
      document.removeEventListener('touchstart', playPreview, true);
      document.removeEventListener('keydown', playPreview, true);
    }
  }

  function playPreview() {
    if (!previewAudio) return;
    try {
      var result = previewAudio.play();
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (e) {}
  }

  function startPreview(fromPjax) {
    stopPreview();
    if (isMusicPage()) return;

    var audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.autoplay = true;
    audio.volume = 0.4;
    audio.setAttribute('aria-hidden', 'true');
    audio.style.display = 'none';
    audio.src = previewUrl;
    previewAudio = audio;
    document.body.appendChild(audio);

    // 浏览器允许有声自动播放时立即开始；被策略拦截则等访客第一次操作。
    playPreview();
    previewGestureBound = true;
    document.addEventListener('pointerdown', playPreview, true);
    document.addEventListener('touchstart', playPreview, true);
    document.addEventListener('keydown', playPreview, true);

    // window.load 是首屏所有资源完成的明确边界；超时只作为异常网络下的兜底。
    var stop = function () { stopPreview(); };
    if (document.readyState === 'complete') {
      // PJAX 换页没有新的 window.load，给音频一个短暂的过渡窗口。
      previewStopTimer = setTimeout(stop, fromPjax ? 1200 : 0);
    } else {
      window.addEventListener('load', stop, { once: true });
      previewStopTimer = setTimeout(stop, 12000);
    }
  }

  function getPlayer() {
    var el = document.querySelector(selector);
    if (!el) return null;
    if (el.aplayer && typeof el.aplayer.play === 'function') return el.aplayer;

    var list = window.aplayers || [];
    for (var i = 0; i < list.length; i++) {
      var ap = list[i];
      if (ap && ap.options && ap.options.container === el && typeof ap.play === 'function') return ap;
    }
    return null;
  }

  function tryPlay() {
    var ap = getPlayer();
    if (!ap) return false;
    var audio = ap.audio;
    if (!audio) return false;
    observeAudio(audio);
    if (!audio.paused) {
      clearRetries();
      unbindGesture();
      return true;
    }
    try {
      var result = ap.play();
      if (result && typeof result.then === 'function') {
        result.then(function () {
          clearRetries();
          unbindGesture();
        }).catch(function () {});
      }
    } catch (e) {}
    return !audio.paused;
  }

  function observeAudio(audio) {
    if (observedAudio === audio) return;
    observedAudio = audio;
    audio.addEventListener('canplay', tryPlay, { once: true });
    audio.addEventListener('loadeddata', tryPlay, { once: true });
  }

  function unbindGesture() {
    if (!gestureBound) return;
    gestureBound = false;
    document.removeEventListener('pointerdown', onGesture, true);
    document.removeEventListener('touchstart', onGesture, true);
    document.removeEventListener('keydown', onGesture, true);
  }

  function onGesture() {
    if (tryPlay()) unbindGesture();
  }

  function bindGesture() {
    if (gestureBound || !document.querySelector(selector)) return;
    gestureBound = true;
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('touchstart', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
  }

  function clearRetries() {
    for (var i = 0; i < retryTimers.length; i++) clearTimeout(retryTimers[i]);
    retryTimers = [];
  }

  function arm(fromPjax) {
    startPreview(!!fromPjax);
    clearRetries();
    observedAudio = null;
    if (!isMusicPage()) {
      unbindGesture();
      return;
    }
    if (typeof window.loadMeting === 'function') {
      try { window.loadMeting(); } catch (e) {}
    }
    bindGesture();
    [0, 250, 800, 1600, 3000, 6000, 10000, 15000].forEach(function (delay) {
      retryTimers.push(setTimeout(function () {
        if (tryPlay()) unbindGesture();
      }, delay));
    });
  }

  document.addEventListener('pjax:send', stopPreview);
  document.addEventListener('pjax:complete', function () { arm(true); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm, { once: true });
  else arm();
})();
