const instances = new WeakMap();

const stopOtherVideos = (current) => {
  document.querySelectorAll('[data-hls-video] video').forEach((video) => {
    if (video !== current && !video.paused) video.pause();
  });
};

const showError = (figure) => {
  figure.querySelector('[data-hls-error]')?.removeAttribute('hidden');
  figure.querySelector('.hls-video__play')?.setAttribute('hidden', '');
};

const attach = async (figure) => {
  const video = figure.querySelector('video[data-hls-src]');
  if (!video) return;
  const src = video.dataset.hlsSrc;
  figure.dataset.ready = '';
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
  } else {
    try {
      const { default: Hls } = await import('hls.js');
      if (!Hls.isSupported()) return showError(figure);
      const hls = new Hls({ autoStartLoad: false });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) showError(figure); });
      instances.set(video, hls);
    } catch { showError(figure); }
  }
  video.addEventListener('play', () => {
    stopOtherVideos(video);
    instances.get(video)?.startLoad();
  });
  video.addEventListener('error', () => showError(figure));
};

document.querySelectorAll('[data-hls-video]').forEach((figure) => {
  const video = figure.querySelector('video');
  figure.querySelector('.hls-video__play')?.addEventListener('click', async () => {
    if (!figure.hasAttribute('data-ready')) await attach(figure);
    video.controls = true;
    video?.play().catch(() => showError(figure));
  }, { once: true });
});
