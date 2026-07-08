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


  const cancelAutoScroll = (element) => {
    if (!element) return;
    element._timelineManualPan = true;
    element._timelineScrollToken = (element._timelineScrollToken || 0) + 1;
  };

  const animateScroll = (element, to, duration, easingFunc) => {
    return new Promise(resolve => {
      const token = (element._timelineScrollToken || 0) + 1;
      element._timelineScrollToken = token;
      const start = element.scrollLeft;
      const change = to - start;
      let startTime = 0;

      const animate = currentTime => {
        if (element._timelineScrollToken !== token) {
          resolve(false);
          return;
        }

        if (startTime === 0) startTime = currentTime;
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easingFunc(progress);

        element.scrollLeft = start + change * easedProgress;

        if (elapsed < duration) {
          requestAnimationFrame(animate);
        } else {
          resolve(true);
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

  const enableDragPan = (container) => {
    if (!container) return;

    if (typeof container._timelineDragCleanup === 'function') {
      container._timelineDragCleanup();
    }

    const dragThreshold = 6;
    let dragState = null;
    let suppressClickUntil = 0;
    let lastPointerDownAt = 0;

    const getMaxScrollLeft = () =>
      Math.max(0, container.scrollWidth - container.clientWidth);

    const isDragAllowed = () =>
      container.classList.contains('is-ready') &&
      !container.classList.contains('is-settling') &&
      container.dataset.dragEnabled === 'true';

    const startDrag = (event, pointerId = null) => {
      if (!isDragAllowed()) return false;
      if (event.button !== 0 || getMaxScrollLeft() <= 0) return false;

      dragState = {
        pointerId,
        startX: event.clientX,
        startScrollLeft: container.scrollLeft,
        dragging: false,
      };

      return true;
    };

    const moveDrag = (event) => {
      if (!dragState) return false;

      const deltaX = event.clientX - dragState.startX;
      if (!dragState.dragging && Math.abs(deltaX) < dragThreshold) return false;

      if (!dragState.dragging) {
        dragState.dragging = true;
        cancelAutoScroll(container);
        container.classList.add('is-dragging');
        if (
          dragState.pointerId !== null &&
          event.currentTarget === container &&
          typeof container.setPointerCapture === 'function'
        ) {
          try {
            container.setPointerCapture(dragState.pointerId);
          } catch (_error) {
            // Pointer capture can fail if the browser has already retargeted the pointer.
          }
        }
      }

      container.scrollLeft = dragState.startScrollLeft - deltaX;
      event.preventDefault();
      return true;
    };

    const finishDrag = (event) => {
      if (!dragState) return;

      const wasDragging = dragState.dragging;
      try {
        if (
          dragState.pointerId !== null &&
          container.hasPointerCapture?.(dragState.pointerId)
        ) {
          container.releasePointerCapture(dragState.pointerId);
        }
      } catch (_error) {
        // Pointer capture may already be released by the browser.
      }

      dragState = null;
      container.classList.remove('is-dragging');

      if (wasDragging) {
        suppressClickUntil = performance.now() + 350;
        event?.preventDefault();
      }
    };

    const onPointerDown = (event) => {
      if (!startDrag(event, event.pointerId)) return;
      lastPointerDownAt = performance.now();
    };

    const onPointerMove = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      moveDrag(event);
    };

    const onPointerUp = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      finishDrag(event);
    };

    const onPointerCancel = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      finishDrag(event);
    };

    const onMouseDown = (event) => {
      if (dragState || performance.now() - lastPointerDownAt < 500) return;
      if (!startDrag(event)) return;
      event.preventDefault();
    };

    const onMouseMove = (event) => {
      if (!dragState || dragState.pointerId !== null) return;
      moveDrag(event);
    };

    const onMouseUp = (event) => {
      if (!dragState || dragState.pointerId !== null) return;
      finishDrag(event);
    };

    const onClickCapture = (event) => {
      if (performance.now() <= suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('click', onClickCapture, true);

    container._timelineDragCleanup = () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('click', onClickCapture, true);
      container.classList.remove('is-dragging');
      dragState = null;
    };
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

  const markTimelineReadyForDrag = (container) => {
    if (!container) return;
    container.classList.remove('is-wiping', 'is-settling');
    container.classList.add('is-ready');
    container.dataset.dragEnabled = 'true';
    container.style.overflow = 'auto';
  };

  const playTimelineDetailTransition = (sourceElement, title, onMidpoint) => {
    if (
      !sourceElement ||
      typeof onMidpoint !== 'function' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      onMidpoint?.();
      return;
    }

    document.querySelector('.timeline-detail-transition')?.remove();

    const rect = sourceElement.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'timeline-detail-transition';

    const card = document.createElement('div');
    card.className = 'timeline-detail-transition-card';
    card.style.setProperty('--start-left', `${rect.left}px`);
    card.style.setProperty('--start-top', `${rect.top}px`);
    card.style.setProperty('--start-width', `${Math.max(48, rect.width)}px`);
    card.style.setProperty('--start-height', `${Math.max(42, rect.height)}px`);

    const kicker = document.createElement('span');
    kicker.className = 'timeline-detail-transition-kicker';
    kicker.textContent = 'ARCHIVE RECORD';

    const heading = document.createElement('strong');
    heading.textContent = title || sourceElement.textContent.trim() || '重大事件';

    card.append(kicker, heading);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.classList.add('timeline-detail-transitioning');

    requestAnimationFrame(() => {
      overlay.classList.add('is-expanding');
    });

    window.setTimeout(() => {
      onMidpoint();
    }, 360);

    window.setTimeout(() => {
      overlay.classList.add('is-leaving');
    }, 780);

    window.setTimeout(() => {
      overlay.remove();
      document.body.classList.remove('timeline-detail-transitioning');
    }, 1120);
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
            playTimelineDetailTransition(
              label,
              evt.title || branch.title || '时间支线',
              () => navigateCallback({ viewId: '#detail-view', history })
            );
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
    enableDragPan(container);
    container.innerHTML = '';
    container.scrollLeft = 0;
    container.classList.remove('is-wiping', 'is-ready', 'is-settling');
    container.dataset.dragEnabled = 'false';
    container._timelineManualPan = false;
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
              const reachedEnd = await animateScroll(container, maxScrollLeft, 3000, easeInOutCubic);
              if (!reachedEnd || container._timelineManualPan) return;
              await new Promise(resolve => setTimeout(resolve, 800));
              if (container._timelineManualPan) return;
              const returnedStart = await animateScroll(container, 0, 2500, easeInOutCubic);
              if (returnedStart) {
                markTimelineReadyForDrag(container);
              }
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
      markTimelineReadyForDrag(container);
      timeline.querySelector('.timeline-arrow')?.classList.add('is-revealing');
      focusEraInContainer(
        container,
        timeline,
        allEras,
        options.focusEraIndex
      );
    }

    const openEraDetail = (e) => {
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
          const titleSource = eraNode.querySelector('.era-title') || eraNode;
          playTimelineDetailTransition(
            titleSource,
            titleSource.textContent.trim(),
            () => navigateCallback({ viewId: '#detail-view', history })
          );
        }
      }
    };

    timeline.addEventListener('click', openEraDetail);
  };

  return { init };

})();

window.Timeline = Timeline;
