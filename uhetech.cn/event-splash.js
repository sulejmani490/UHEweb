(function () {
  const DEFAULT_EVENT_SLIDE = {
    image: '/images/总理府活动.png',
    text: '这是你的梦想吗？',
    durationMs: 4400,
    camera: 'focus-zoom',
    objectPosition: '50% 48%',
  };

  const DEFAULT_EVENT_CONFIG = {
    enabled: false,
    homepageOnly: true,
    image: DEFAULT_EVENT_SLIDE.image,
    text: DEFAULT_EVENT_SLIDE.text,
    imageMs: DEFAULT_EVENT_SLIDE.durationMs,
    exitMs: 720,
    homeRevealMs: 2850,
    frostFrameEnabled: true,
    frostInMs: 2700,
    slideTransitionMs: 1100,
    slides: [{ ...DEFAULT_EVENT_SLIDE }],
  };

  const CAMERA_PRESETS = new Set([
    'focus-zoom',
    'slow-zoom',
    'pan-left',
    'pan-right',
    'drift-up',
    'still',
  ]);

  const getCameraPosition = (camera) => {
    if (camera === 'focus-zoom') return '50% 48%';
    if (camera === 'pan-left') return '56% 50%';
    if (camera === 'pan-right') return '44% 50%';
    if (camera === 'drift-up') return '50% 56%';
    return '50% 50%';
  };

  const normalizeCamera = (value) => {
    const camera = String(value || '').trim();
    return CAMERA_PRESETS.has(camera) ? camera : DEFAULT_EVENT_SLIDE.camera;
  };

  const normalizeAssetPath = (value, fallback = DEFAULT_EVENT_SLIDE.image) => {
    const rawValue = String(value || '').trim();
    if (!rawValue) return fallback;
    if (
      /^(?:[a-z]+:)?\/\//i.test(rawValue) ||
      rawValue.startsWith('data:') ||
      rawValue.startsWith('blob:')
    ) {
      return rawValue;
    }
    return rawValue.startsWith('/')
      ? rawValue
      : `/${rawValue.replace(/^\.?\//, '')}`;
  };

  const normalizeSlide = (value, fallback = DEFAULT_EVENT_SLIDE) => {
    const source =
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const fallbackSlide = { ...DEFAULT_EVENT_SLIDE, ...fallback };
    const camera = normalizeCamera(source.camera || fallbackSlide.camera);
    const durationMs = Math.max(
      1400,
      Number(source.durationMs ?? source.imageMs ?? fallbackSlide.durationMs) ||
        DEFAULT_EVENT_SLIDE.durationMs
    );

    return {
      image: normalizeAssetPath(source.image || source.src, fallbackSlide.image),
      text:
        String(source.text ?? source.caption ?? fallbackSlide.text).trim() ||
        fallbackSlide.text,
      durationMs,
      camera,
      objectPosition:
        String(source.objectPosition || fallbackSlide.objectPosition || getCameraPosition(camera)).trim() ||
        getCameraPosition(camera),
    };
  };

  const readConfig = (data) => {
    const source =
      data?.siteEvent && typeof data.siteEvent === 'object' && !Array.isArray(data.siteEvent)
        ? data.siteEvent
        : {};
    const legacyImage = normalizeAssetPath(source.image, DEFAULT_EVENT_CONFIG.image);
    const legacyText =
      String(source.text || DEFAULT_EVENT_CONFIG.text).trim() || DEFAULT_EVENT_CONFIG.text;
    const legacyImageMs = Math.max(
      1400,
      Number(source.imageMs) || DEFAULT_EVENT_CONFIG.imageMs
    );
    const legacySlide = normalizeSlide({
      image: legacyImage,
      text: legacyText,
      durationMs: legacyImageMs,
      camera: source.camera || DEFAULT_EVENT_SLIDE.camera,
      objectPosition: source.objectPosition || DEFAULT_EVENT_SLIDE.objectPosition,
    });
    const sourceSlides = Array.isArray(source.slides) ? source.slides : [];
    const slides = sourceSlides.length
      ? sourceSlides.map((slide, index) =>
          normalizeSlide(slide, index === 0 ? legacySlide : DEFAULT_EVENT_SLIDE)
        )
      : [legacySlide];
    const firstSlide = slides[0] || legacySlide;
    const lastSlide = slides[slides.length - 1] || firstSlide;
    const frostInMs = Math.max(
      900,
      Math.min(
        lastSlide.durationMs,
        Number(source.frostInMs) || Math.round(lastSlide.durationMs * 0.62)
      )
    );
    const slideTransitionMs = Math.max(
      0,
      Math.min(2200, Number(source.slideTransitionMs) || DEFAULT_EVENT_CONFIG.slideTransitionMs)
    );

    return {
      ...DEFAULT_EVENT_CONFIG,
      ...source,
      enabled: source.enabled === true,
      homepageOnly: source.homepageOnly !== false,
      image: firstSlide.image,
      text: firstSlide.text,
      imageMs: firstSlide.durationMs,
      exitMs: Math.max(260, Number(source.exitMs) || DEFAULT_EVENT_CONFIG.exitMs),
      homeRevealMs: Math.max(900, Number(source.homeRevealMs) || DEFAULT_EVENT_CONFIG.homeRevealMs),
      frostFrameEnabled: source.frostFrameEnabled !== false,
      frostInMs,
      frostDelayMs: Math.max(0, lastSlide.durationMs - frostInMs),
      slideTransitionMs,
      slides,
      totalSlideMs: slides.reduce((sum, slide) => sum + slide.durationMs, 0),
      lastSlideMs: lastSlide.durationMs,
    };
  };

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));

  const getTimingVars = (config) => ({
    '--event-image-ms': `${config.frostInMs || config.lastSlideMs || config.imageMs}ms`,
    '--event-total-slide-ms': `${config.totalSlideMs || config.imageMs}ms`,
    '--event-exit-ms': `${config.exitMs}ms`,
    '--event-home-reveal-ms': `${config.homeRevealMs}ms`,
    '--event-slide-transition-ms': `${config.slideTransitionMs}ms`,
    '--event-media-release-ms': `${Math.round(config.exitMs * 0.95)}ms`,
    '--event-grain-in-ms': `${Math.round((config.frostInMs || config.lastSlideMs || config.imageMs) * 0.92)}ms`,
    '--event-logo-reveal-ms': `${Math.round(config.homeRevealMs * 0.58)}ms`,
    '--event-wave-ms': `${Math.round(config.homeRevealMs * 0.72)}ms`,
    '--event-wave-delay-ms': `${Math.round(config.homeRevealMs * 0.23)}ms`,
    '--event-intro-delay-ms': `${Math.round(config.homeRevealMs * 0.46)}ms`,
    '--event-sponsor-delay-ms': `${Math.round(config.homeRevealMs * 0.50)}ms`,
    '--event-music-delay-ms': `${Math.round(config.homeRevealMs * 0.54)}ms`,
    '--event-footer-delay-ms': `${Math.round(config.homeRevealMs * 0.58)}ms`,
    '--event-library-delay-ms': `${Math.round(config.homeRevealMs * 0.62)}ms`,
    '--event-theme-delay-ms': `${Math.round(config.homeRevealMs * 0.66)}ms`,
    '--event-background-delay-ms': `${Math.round(config.homeRevealMs * 0.69)}ms`,
  });

  const applyTimingVars = (target, config) => {
    Object.entries(getTimingVars(config)).forEach(([name, value]) => {
      target.style.setProperty(name, value);
    });
  };

  const clearTimingVars = (target, config) => {
    Object.keys(getTimingVars(config)).forEach((name) => {
      target.style.removeProperty(name);
    });
  };

  const preloadImage = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });

  const createFrostLayers = () => {
    const fragment = document.createDocumentFragment();

    const frostField = document.createElement('div');
    frostField.className = 'event-splash-frost-field';

    const edgeFrame = document.createElement('div');
    edgeFrame.className = 'event-splash-edge-frame';
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      const edge = document.createElement('div');
      edge.className = `event-splash-edge event-splash-edge--${side}`;
      ['core', 'ash', 'rime'].forEach((layerName) => {
        const layer = document.createElement('span');
        layer.className = `event-splash-edge-layer event-splash-edge-${layerName}`;
        edge.appendChild(layer);
      });
      edgeFrame.appendChild(edge);
    });

    const frostVeil = document.createElement('div');
    frostVeil.className = 'event-splash-frost-veil';

    const grain = document.createElement('div');
    grain.className = 'event-splash-grain';

    fragment.append(frostField, edgeFrame, frostVeil, grain);
    return fragment;
  };

  const ensureFrostLayers = (overlay) => {
    if (overlay.dataset.frostLayersReady === 'true') return false;
    overlay.append(createFrostLayers());
    overlay.dataset.frostLayersReady = 'true';
    return true;
  };

  const createSplash = (config) => {
    const overlay = document.createElement('div');
    overlay.className = config.frostFrameEnabled
      ? 'event-splash is-slideshow has-frost-frame'
      : 'event-splash is-slideshow is-plain';
    overlay.setAttribute('role', 'presentation');
    overlay.setAttribute('aria-hidden', 'true');
    applyTimingVars(overlay, config);

    const stage = document.createElement('div');
    stage.className = 'event-splash-slide-stage';

    const captions = document.createElement('div');
    captions.className = 'event-splash-caption-stage';

    const transition = document.createElement('div');
    transition.className = 'event-splash-transition';
    transition.setAttribute('aria-hidden', 'true');

    config.slides.forEach((slide, index) => {
      const slideElement = document.createElement('div');
      slideElement.className = `event-splash-slide event-camera-${slide.camera}`;
      slideElement.dataset.slideIndex = String(index);
      slideElement.style.setProperty('--event-slide-duration', `${slide.durationMs}ms`);
      slideElement.style.setProperty('--event-camera-duration', `${Math.round(slide.durationMs * 1.75)}ms`);
      slideElement.style.setProperty('--event-slide-position', slide.objectPosition);

      const image = document.createElement('img');
      image.className = 'event-splash-slide-image';
      image.alt = '';
      image.src = slide.image;

      const title = document.createElement('p');
      title.className = 'event-splash-slide-title';
      title.dataset.slideIndex = String(index);
      title.style.setProperty('--event-slide-duration', `${slide.durationMs}ms`);
      title.textContent = slide.text;

      slideElement.append(image);
      stage.append(slideElement);
      captions.append(title);
    });

    overlay.append(stage);
    overlay.append(transition);
    overlay.append(captions);
    return overlay;
  };

  const setActiveElements = (overlay, selector, activeIndex, previousIndex = null) => {
    const hasActiveIndex = Number.isInteger(activeIndex);
    overlay.querySelectorAll(selector).forEach((element, index) => {
      element.classList.toggle('is-active', hasActiveIndex && index === activeIndex);
      element.classList.toggle(
        'is-before',
        hasActiveIndex && index < activeIndex && index !== previousIndex
      );
      element.classList.toggle('is-exiting', index === previousIndex);
    });
  };

  const setActiveSlide = (overlay, activeIndex, previousIndex = null) => {
    setActiveElements(overlay, '.event-splash-slide', activeIndex, previousIndex);
    setActiveElements(overlay, '.event-splash-slide-title', activeIndex, previousIndex);
  };

  const setTransitioningSlide = (overlay, activeIndex, previousIndex) => {
    setActiveElements(overlay, '.event-splash-slide', activeIndex, previousIndex);
    setActiveElements(overlay, '.event-splash-slide-title', null, previousIndex);
  };

  const clearExitingStates = (overlay) => {
    ['.event-splash-slide', '.event-splash-slide-title'].forEach((selector) => {
      overlay.querySelectorAll(selector).forEach((element, index) => {
        element.classList.remove('is-exiting');
      });
    });
  };

  const playSlideTransition = async (overlay, fromIndex, toIndex, transitionMs) => {
    const transition = overlay.querySelector('.event-splash-transition');
    if (transitionMs <= 0 || !transition) {
      setActiveSlide(overlay, toIndex);
      return;
    }

    transition.classList.remove('is-running');
    void transition.offsetWidth;
    transition.classList.add('is-running');
    setTransitioningSlide(overlay, toIndex, fromIndex);
    await wait(transitionMs);
    transition.classList.remove('is-running');
    clearExitingStates(overlay);
    setActiveSlide(overlay, toIndex);
  };

  const playSlides = async (overlay, config) => {
    const lastSlideIndex = config.slides.length - 1;
    let activeIndex = 0;

    for (let index = 0; index < config.slides.length; index += 1) {
      if (index === 0) {
        setActiveSlide(overlay, 0);
      } else {
        const transitionMs = Math.min(
          config.slideTransitionMs,
          Math.max(0, Math.floor(config.slides[index - 1].durationMs * 0.45)),
          Math.max(0, Math.floor(config.slides[index].durationMs * 0.45))
        );
        await playSlideTransition(overlay, activeIndex, index, transitionMs);
      }
      activeIndex = index;

      if (index === lastSlideIndex && config.frostFrameEnabled) {
        const frostDelayMs = Math.min(config.slides[index].durationMs, config.frostDelayMs || 0);
        if (frostDelayMs > 0) {
          await wait(frostDelayMs);
        }
        ensureFrostLayers(overlay);
        await nextFrame();
        overlay.classList.add('is-frost-active');
        await wait(Math.max(0, config.slides[index].durationMs - frostDelayMs));
        continue;
      }

      const nextSlide = config.slides[index + 1];
      const nextTransitionMs = nextSlide
        ? Math.min(
            config.slideTransitionMs,
            Math.max(0, Math.floor(config.slides[index].durationMs * 0.45)),
            Math.max(0, Math.floor(nextSlide.durationMs * 0.45))
          )
        : 0;
      await wait(Math.max(0, config.slides[index].durationMs - nextTransitionMs));
    }
  };

  const play = async (data, options = {}) => {
    const config = readConfig(data);
    const routeState = options.routeState || null;
    const shouldPlay =
      config.enabled &&
      (!config.homepageOnly || routeState?.viewId === '#landing-view');

    if (!shouldPlay) {
      return false;
    }

    document.body.classList.add('event-splash-active', 'event-splash-preparing');
    applyTimingVars(document.body, config);

    await Promise.all(config.slides.map((slide) => preloadImage(slide.image)));

    const overlay = createSplash(config);
    document.body.appendChild(overlay);

    await nextFrame();
    await playSlides(overlay, config);

    document.body.classList.add('event-splash-reveal');
    document.getElementById('intro')?.classList.add('visible');
    overlay.classList.add(config.frostFrameEnabled ? 'is-home-revealing' : 'is-leaving');

    await wait(config.frostFrameEnabled ? config.homeRevealMs : config.exitMs);
    overlay.remove();

    if (!config.frostFrameEnabled) {
      await wait(config.homeRevealMs);
    }

    document.body.classList.remove('event-splash-active');
    document.body.classList.remove('event-splash-preparing', 'event-splash-reveal');
    clearTimingVars(document.body, config);
    return true;
  };

  window.EventSplash = {
    DEFAULT_EVENT_CONFIG,
    readConfig,
    play,
  };
})();
