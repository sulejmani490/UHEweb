// timeline.js - V3.9.3 (Branch events use detail-view UI)

const Timeline = (() => {

 const createEraNode = (eraData, catIndex, itemIndex, parseAndColorText) => {
    const eraContainer = document.createElement('div');
    eraContainer.className = 'timeline-era';
    eraContainer.dataset.catIndex = catIndex;
    eraContainer.dataset.itemPath = itemIndex;

    const title = document.createElement('h2');
    title.className = 'era-title';
    title.innerHTML = parseAndColorText(eraData.title);

    const node = document.createElement('div');
    node.className = 'event-node';

    // 🔥 如果 era 有 marker: 'fiery'，加上特效类
    if (eraData.marker === 'fiery') {
        node.classList.add('event-node--fiery');
        eraContainer.classList.add('timeline-era--fiery'); // 可选：标题也稍微染色
    }

    eraContainer.appendChild(title);
    eraContainer.appendChild(node);
    return eraContainer;
};


  const animateScroll = (element, to, duration, easingFunc) => {
    return new Promise(resolve => {
      const start = element.scrollLeft;
      const change = to - start;
      let startTime = 0;

      const animate = currentTime => {
        if (startTime === 0) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easingFunc(progress);

        element.scrollLeft = start + change * easedProgress;

        if (elapsed < duration) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  };

  const easeInOutCubic = t =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const focusEraInContainer = (container, timeline, allEras, focusEraIndex) => {
    if (!container || !timeline || !allEras?.length) return;
    if (!Number.isInteger(focusEraIndex)) return;

    const targetEra = allEras[focusEraIndex];
    if (!targetEra) return;

    requestAnimationFrame(() => {
      const targetCenter =
        timeline.offsetLeft + targetEra.offsetLeft + targetEra.offsetWidth / 2;
      const nextScrollLeft = Math.max(
        0,
        targetCenter - container.clientWidth / 2
      );
      container.scrollTo({ left: nextScrollLeft, behavior: 'auto' });
    });
  };

  // ========= 分支时间线渲染 =========
  const setBranchesActive = (timeline, immediate = false) => {
    if (!timeline) return;

    timeline.querySelectorAll('.timeline-branch').forEach((branchEl) => {
      if (immediate) {
        branchEl.classList.add('is-immediate');
      }
      branchEl.classList.add('is-activating');
    });
  };

  const scheduleBranchReveal = (
    timeline,
    curtainStartLeft,
    timelineWidth,
    totalWipeDuration,
    colorSnapDelay
  ) => {
    if (!timeline) return;

    const usableWidth = Math.max(1, timelineWidth - curtainStartLeft);

    timeline.querySelectorAll('.timeline-branch').forEach((branchEl) => {
      const revealPoint = Number(branchEl.dataset.revealPoint || 0);
      const revealTime =
        ((revealPoint - curtainStartLeft) / usableWidth) *
        totalWipeDuration *
        0.9;

      setTimeout(
        () => branchEl.classList.add('is-activating'),
        Math.max(0, revealTime) + colorSnapDelay + 120
      );
    });
  };

  const renderBranches = (
    categoryData,
    catIndex,
    timeline,
    parseAndColorText,
    navigateCallback
  ) => {
    const branches = categoryData.branches || [];
    if (!branches.length) return;

    const allEras = Array.from(timeline.querySelectorAll('.timeline-era'));
    if (!allEras.length) return;

    const timelineWidth = timeline.scrollWidth || timeline.offsetWidth || 1;

    branches.forEach((branch, branchIndex) => {
      const fromIdx = branch.fromEraIndex ?? 0;
      const toIdx = branch.toEraIndex ?? (allEras.length - 1);
      const fromEra = allEras[fromIdx];
      const toEra = allEras[toIdx];
      if (!fromEra || !toEra) return;

      const startCenter = fromEra.offsetLeft + fromEra.offsetWidth / 2;
      const endCenter = toEra.offsetLeft + toEra.offsetWidth / 2;
      if (endCenter <= startCenter) return;

      const branchEl = document.createElement('div');
      branchEl.className = 'timeline-branch';
      branchEl.dataset.branchId = branch.id || `branch-${branchIndex}`;
      branchEl.dataset.position = branch.position === 'above' ? 'above' : 'below';
      branchEl.dataset.revealPoint = String(startCenter);

      const laneIndex = Number.isFinite(branch.laneIndex)
        ? branch.laneIndex
        : branchIndex;
      const baseOffset = 60;
      const laneGap = 40;
      const direction = branch.position === 'above' ? -1 : 1;
      const offsetY = direction * (baseOffset + laneIndex * laneGap);
      branchEl.style.setProperty('--branch-offset-y', `${offsetY}px`);

      const leftPercent = (startCenter / timelineWidth) * 100;
      const widthPercent = ((endCenter - startCenter) / timelineWidth) * 100;
      branchEl.style.left = `${leftPercent}%`;
      branchEl.style.width = `${widthPercent}%`;

      const branchColor =
        (window.colorPalette &&
          branch.color &&
          window.colorPalette[branch.color]) ||
        'var(--accent-color)';

      const lineEl = document.createElement('div');
      lineEl.className = 'timeline-branch-line';
      lineEl.style.backgroundColor = branchColor;
      branchEl.appendChild(lineEl);

      const events = branch.events || [];
      const count = events.length || 1;

      events.forEach((evt, eventIndex) => {
       const node = document.createElement('div');
node.className = 'timeline-branch-node';
node.style.borderColor = branchColor;
node.style.boxShadow = `0 0 8px ${branchColor}`;

// 🔥 支线事件也可以冒火：marker: 'fiery'
if (evt.marker === 'fiery') {
    node.classList.add('timeline-branch-node--fiery');
}


        const ratio = count === 1 ? 0.5 : eventIndex / (count - 1);
        node.style.left = `${ratio * 100}%`;
        node.style.setProperty('--branch-node-delay', `${220 + eventIndex * 90}ms`);

        const label = document.createElement('div');
        label.className = 'timeline-branch-label';
        label.innerHTML = parseAndColorText(evt.title || '');
        node.appendChild(label);

        if (evt.details) {
          node.title = evt.details.replace(/\n/g, ' ');
        }

        // 🔗 改这里：支线事件也走 detail-view，而不是 alert
        node.addEventListener('click', (e) => {
          e.stopPropagation();

          if (typeof navigateCallback === 'function') {
            const history = [
              { type: 'category', catIndex },
              {
                type: 'branchEvent',
                catIndex,
                branchIndex,
                eventIndex
              }
            ];
            navigateCallback({ viewId: '#detail-view', history });
          } else if (evt.details) {
            // 兜底 fallback，真的出问题再退回 alert
            alert(evt.title + '\n\n' + evt.details);
          }
        });

        branchEl.appendChild(node);
      });

      timeline.appendChild(branchEl);
    });
  };

  // ========= init =========
  const init = (
    view,
    catIndex,
    navigateCallback,
    parseAndColorText,
    playAnimation = true,
    options = {}
  ) => {
    const container = view.querySelector('.timeline-container');
    container.innerHTML = '';
    container.scrollLeft = 0;
    container.classList.remove('is-wiping', 'is-ready', 'is-settling');
    container.style.overflow = 'hidden';

    const categoryData = websiteData.categories[catIndex];
    if (!categoryData?.eras?.length) return;

    const timeline = document.createElement('div');
    timeline.className = 'timeline';
    categoryData.eras.forEach((era, eraIndex) => {
      const eraNode = createEraNode(era, catIndex, eraIndex, parseAndColorText);
      timeline.appendChild(eraNode);
    });

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'timeline-arrow');
    arrow.setAttribute('viewBox', '0 0 15 20');
    arrow.innerHTML = '<path d="M0,0 L15,10 L0,20 Z"></path>';
    timeline.appendChild(arrow);
    container.appendChild(timeline);

    const allEras = timeline.querySelectorAll('.timeline-era');
    if (allEras.length === 0) return;
    const firstEra = allEras[0];
    firstEra.classList.add('first-era');

    // ★ 渲染分支时间线（带 catIndex + navigateCallback）
    renderBranches(categoryData, catIndex, timeline, parseAndColorText, navigateCallback);

    if (playAnimation) {
      // --- [路径A: 执行完整入场动画] ---
      const curtain = document.createElement('div');
      curtain.className = 'timeline-curtain';
      const firstEraClone = firstEra.cloneNode(true);
      firstEraClone.classList.add('era-clone');
      const focusRing = document.createElement('div');
      focusRing.className = 'focus-ring';
      firstEraClone.appendChild(focusRing);
      container.insertBefore(curtain, timeline);
      container.appendChild(firstEraClone);

      requestAnimationFrame(() => {
        setTimeout(() => {
          firstEraClone.classList.add('visible');
          focusRing.classList.add('is-appearing');
        }, 50);

        setTimeout(() => {
          const containerWidth = container.offsetWidth;
          const firstEraCenter = timeline.offsetLeft + firstEra.offsetLeft + firstEra.offsetWidth / 2;
          const initialCenter = containerWidth / 2;
          const deltaX = firstEraCenter - initialCenter;
          focusRing.classList.remove('is-appearing');
          focusRing.classList.add('is-fading');
          requestAnimationFrame(() => {
            firstEraClone.classList.add('is-moving');
            firstEraClone.style.transform =
              `translateX(${deltaX}px) translate(-50%, -50%) scale(1)`;
          });

          setTimeout(async () => {
            requestAnimationFrame(() => {
              firstEra.style.transition = 'none';
              firstEra.style.opacity = '1';
              firstEraClone.classList.add('is-vanishing');
            });

            firstEraClone.addEventListener(
              'transitionend',
              () => firstEraClone.remove(),
              { once: true }
            );

            container.classList.add('is-wiping');
            const curtainStartLeft =
              timeline.offsetLeft + firstEra.offsetLeft + firstEra.offsetWidth;
            curtain.style.left = `${curtainStartLeft}px`;
            curtain.style.width = `calc(100% - ${curtainStartLeft}px)`;

            const erasToReveal = timeline.querySelectorAll('.timeline-era:not(.first-era)');
            const totalWipeDuration = 4500;
            const colorSnapDelay = 250;
            const timelineWidth = timeline.scrollWidth;

            for (let i = 0; i < erasToReveal.length; i++) {
              const era = erasToReveal[i];
              const eraRevealPoint =
                timeline.offsetLeft + era.offsetLeft + (era.offsetWidth / 2);
              if (eraRevealPoint > curtainStartLeft) {
                const revealTime =
                  ((eraRevealPoint - curtainStartLeft) /
                    (timelineWidth - curtainStartLeft)) *
                  totalWipeDuration *
                  0.9;
                setTimeout(
                  () => era.classList.add('is-activating'),
                  Math.max(0, revealTime) + colorSnapDelay
                );
              }
            }

            scheduleBranchReveal(
              timeline,
              curtainStartLeft,
              timelineWidth,
              totalWipeDuration,
              colorSnapDelay
            );

            const lineAnimationDuration = 2500;
            setTimeout(
              () => container.querySelector('.timeline-arrow')?.classList.add('is-revealing'),
              lineAnimationDuration * 0.8
            );

            const totalAnimationTime = 4500;
            setTimeout(async () => {
              container.style.overflow = 'auto';
              if (curtain) curtain.style.display = 'none';
              container.classList.add('is-settling');

              const maxScrollLeft = container.scrollWidth - container.clientWidth;
              await animateScroll(container, maxScrollLeft, 3000, easeInOutCubic);
              await new Promise(resolve => setTimeout(resolve, 800));
              await animateScroll(container, 0, 2500, easeInOutCubic);
            }, 100 + totalAnimationTime);
          }, 1200);
        }, 800);
      });
    } else {
      // --- [路径B: 无动画，直接展示最终状态] ---
      allEras.forEach(era => {
        era.classList.add('is-activating');
        era.style.opacity = '1';
        era.style.transform = 'scale(1)';
      });

      timeline.classList.add('timeline--settled');
      setBranchesActive(timeline, true);
      container.classList.add('is-ready');
      timeline.querySelector('.timeline-arrow')?.classList.add('is-revealing');
      container.style.overflow = 'auto';
      focusEraInContainer(
        container,
        timeline,
        allEras,
        options.focusEraIndex
      );
    }

    timeline.addEventListener('click', (e) => {
      const eraNode = e.target.closest('.timeline-era');
      if (eraNode && !eraNode.classList.contains('era-clone')) {
        const catIndexFromDom = parseInt(eraNode.dataset.catIndex);
        const itemPath = eraNode.dataset.itemPath;
        if (!isNaN(catIndexFromDom) && itemPath !== undefined) {
          const history = [
            { type: 'category', catIndex: catIndexFromDom },
            { type: 'item', catIndex: catIndexFromDom, itemPath: itemPath.toString() }
          ];
          container.classList.remove('is-wiping');
          navigateCallback({ viewId: '#detail-view', history });
        }
      }
    });
  };

  return { init };

})();

window.Timeline = Timeline;
