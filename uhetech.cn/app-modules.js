// app-modules.js
// Consolidated frontend modules for:
// - global theme management
// - library rendering
// - novel reader
// - AI chat assistant
// - character archive
//
// Tuning guide:
// - All frequently adjusted thresholds are collected in APP_MODULE_SETTINGS.
// - Page navigation and route switching stay in script.js.

window.APP_MODULE_SETTINGS = window.APP_MODULE_SETTINGS || {
  library: {
    // Delay between library card reveal animations.
    cardStaggerMs: 50,
    // Fallback cover used when a novel item has no image.
    placeholderImage: 'images/placeholder.png',
  },
  reader: {
    // Default reader font size on first open.
    defaultFontSize: 19,
    // Smallest font size allowed by the reader controls.
    minFontSize: 12,
    // Largest font size allowed by the reader controls.
    maxFontSize: 28,
    // Scroll distance that hides chrome in immersive reading mode.
    scrollHideThreshold: 100,
    // Minimum horizontal swipe distance for chapter switching.
    swipeThreshold: 50,
    // Highlight lifetime for deep-linked paragraphs.
    highlightDurationMs: 2500,
    // Delay before restoring scroll position after chapter render.
    initialScrollDelayMs: 300,
  },
  ai: {
    // Number of recent turns kept in the request context sent to the backend.
    conversationLimit: 10,
    // First assistant message rendered when the chat window opens.
    /* introMessage:
      '你好！我是“人类帝国”世界的专家。你可以问我关于人物、事件或世界观的任何问题。',
    thinkingMessage: '正在思考中...',
    archiveNotice: '为保持对话流畅，部分较早的记忆已被归档。',
    */
    /*
    introMessage: '你好，我是“人类帝国”世界观助手。你可以问我关于人物、事件或设定的任何问题。',
    thinkingMessage: '正在思考中...',
    archiveNotice: '为保持对话流畅，较早的部分对话已被归档。',
    */
    introMessage: '\u4f60\u597d\uff0c\u6211\u662f\u201c\u4eba\u7c7b\u5e1d\u56fd\u201d\u4e16\u754c\u89c2\u52a9\u624b\u3002\u4f60\u53ef\u4ee5\u95ee\u6211\u5173\u4e8e\u4eba\u7269\u3001\u4e8b\u4ef6\u6216\u8bbe\u5b9a\u7684\u4efb\u4f55\u95ee\u9898\u3002',
    thinkingMessage: '\u6b63\u5728\u601d\u8003\u4e2d...',
    archiveNotice: '\u4e3a\u4fdd\u6301\u5bf9\u8bdd\u6d41\u7545\uff0c\u8f83\u65e9\u7684\u90e8\u5206\u5bf9\u8bdd\u5df2\u88ab\u5f52\u6863\u3002',
  },
  characters: {
    // Preview excerpt length shown on character cards.
    snippetLength: 72,
    // Prevent recursive side-panel rendering from nesting too deeply.
    maxNestedSectionLevel: 3,
  },
};

(() => {
  'use strict';

  const settings = window.APP_MODULE_SETTINGS;

  const stripColorMarkup = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/\[\[\w+\|(.+?)\]\]/g, '$1');
  };

  const renderColorMarkup = (text) => {
    if (!text || typeof text !== 'string') return '';

    let html = text.replace(/\[\[(\w+)\|(.+?)\]\]/g, (match, colorName, content) => {
      const palette = window.colorPalette || {};
      const colorHex = palette[colorName] || palette.black || '#000';
      return `<span style="color: ${colorHex}; font-weight: inherit;">${content}</span>`;
    });

    html = html.replace(
      /\[\[link\|([\w\d\-_,，\s]+)\|([\w\d-]+)\|(.+?)\]\]/g,
      (match, novelId, paragraphId, content) => {
        return `<a href="#" class="novel-link" data-novel-id="${novelId.trim()}" data-goto-id="${paragraphId.trim()}">${content}</a>`;
      }
    );

    return html;
  };

  const escapeHtml = (text) =>
    String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  (() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const AppTheme = {
      current: 'light',
      listeners: new Set(),
      _userOverride: false,

      init() {
        const prefersDark = mediaQuery.matches;
        this.current = prefersDark ? 'dark' : 'light';
        this._applyTheme(this.current);

        mediaQuery.addEventListener('change', (event) => {
          if (!this._userOverride) {
            this.setTheme(event.matches ? 'dark' : 'light', { user: false });
          }
        });
      },

      _applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        this.current = theme;

        this.listeners.forEach((listener) => {
          try {
            listener(theme);
          } catch (error) {
            console.error('[AppTheme] listener error:', error);
          }
        });
      },

      setTheme(theme, options = { user: true }) {
        if (theme !== 'light' && theme !== 'dark') {
          console.warn('[AppTheme] invalid theme:', theme);
          return;
        }

        if (options.user) {
          this._userOverride = true;
        }

        this._applyTheme(theme);
      },

      toggle(options = { user: true }) {
        const nextTheme = this.current === 'light' ? 'dark' : 'light';
        this.setTheme(nextTheme, options);
      },

      subscribe(listener) {
        if (typeof listener !== 'function') return () => {};

        this.listeners.add(listener);

        try {
          listener(this.current);
        } catch (error) {
          console.error('[AppTheme] initial listener error:', error);
        }

        return () => this.listeners.delete(listener);
      },
    };

    window.AppTheme = AppTheme;
    AppTheme.init();
  })();

  const LibraryRenderer = (() => {
    let view;
    let gridContainer;
    let titleEl;
    let isInitialized = false;
    let isClickBound = false;
    let novelsCache = null;
    let novelsPromise = null;

    const resolveManifest = () => {
      if (typeof window.__loadNovelManifest === 'function') {
        return window.__loadNovelManifest();
      }

      if (Array.isArray(novelsCache)) return Promise.resolve(novelsCache);
      if (Array.isArray(window.__novelManifestCache)) {
        novelsCache = window.__novelManifestCache;
        return Promise.resolve(novelsCache);
      }
      if (novelsPromise) return novelsPromise;

      novelsPromise = fetch('/novels_data/manifest.json', { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load novel manifest: ${response.status}`);
          }
          return response.json();
        })
        .then((novels) => {
          novelsCache = Array.isArray(novels) ? novels : [];
          window.__novelManifestCache = novelsCache;
          return novelsCache;
        })
        .catch((error) => {
          novelsPromise = null;
          throw error;
        });

      return novelsPromise;
    };

    const init = () => {
      view = document.getElementById('library-view');
      if (!view) {
        console.error('LibraryRenderer: missing #library-view');
        return;
      }

      gridContainer = view.querySelector('.novel-grid');
      titleEl = view.querySelector('.library-title');

      if (gridContainer && !isClickBound) {
        gridContainer.addEventListener('click', (event) => {
          const card = event.target.closest('.novel-card');
          const novelId = card?.dataset?.novelId;

          if (!novelId) return;
          if (window.globalNavigator?.gotoNovelLocation) {
            window.globalNavigator.gotoNovelLocation(novelId, null);
          }
        });

        isClickBound = true;
      }

      isInitialized = true;
    };

    const render = () => {
      if (!isInitialized || !gridContainer || !titleEl) {
        console.error('LibraryRenderer: render called before init');
        return;
      }

      titleEl.classList.remove('animate-in');
      gridContainer.innerHTML = '<p style="color: #aaa;">正在从中央文库调取档案...</p>';

      requestAnimationFrame(() => {
        void titleEl.offsetWidth;
        titleEl.classList.add('animate-in');
      });

      resolveManifest()
        .then((novels) => {
          if (!Array.isArray(novels) || novels.length === 0) {
            gridContainer.innerHTML = '<p>文库中暂无小说。</p>';
            return;
          }

          gridContainer.innerHTML = novels
            .map((novel) => {
              /*
              const plainTitle = stripColorMarkup(novel.title || '未命名小说');
              */
              const plainTitle = stripColorMarkup(novel.title || 'Untitled novel');
              const safeTitle = escapeHtml(plainTitle);
              const image = novel.image || settings.library.placeholderImage;
              return `
                <div class="novel-card" data-novel-id="${escapeHtml(novel.id || '')}" title="${safeTitle}">
                  <div class="novel-cover" style="background-image: url('${image}')"></div>
                  <h3 class="novel-title">${safeTitle}</h3>
                </div>
              `;
            })
            .join('');

          const cards = gridContainer.querySelectorAll('.novel-card');
          requestAnimationFrame(() => {
            cards.forEach((card, index) => {
              void card.offsetWidth;
              card.style.transitionDelay = `${index * settings.library.cardStaggerMs}ms`;
              card.classList.add('animate-in');
            });
          });
        })
        .catch((error) => {
          console.error('LibraryRenderer: failed to load novels', error);
          gridContainer.innerHTML =
            '<p style="color: red; font-weight: bold;">⚠️ 档案库连接失败，请检查 novels_data/manifest.json。</p>';
        });
    };

    return { init, render };
  })();

  window.LibraryRenderer = LibraryRenderer;

  const NovelReader = (() => {
    let view;
    let contentEl;
    let tocPanel;
    let controls;
    let contentWrapper;
    let currentNovelData = null;
    let currentChapterIndex = 0;
    let isInitialized = false;

    const novelCache = new Map();

    const userPreferences = {
      fontSize: settings.reader.defaultFontSize,
      theme: 'light',
      load() {
        const savedSize = localStorage.getItem('novelReader_fontSize');

        if (savedSize) {
          this.fontSize = parseInt(savedSize, 10);
        }
      },
      save() {
        localStorage.setItem('novelReader_fontSize', this.fontSize);
      },
    };

    const getUnifiedTheme = () => {
      if (window.AppTheme?.current === 'dark' || window.AppTheme?.current === 'light') {
        return window.AppTheme.current;
      }

      const rootTheme = document.documentElement?.dataset?.theme;
      if (rootTheme === 'dark' || rootTheme === 'light') {
        return rootTheme;
      }

      return userPreferences.theme === 'dark' ? 'dark' : 'light';
    };

    const applyPreferences = () => {
      if (!view || !contentEl) return;

      const themeBtn = document.getElementById('reader-theme-toggle');
      const isDark = getUnifiedTheme() === 'dark';
      userPreferences.theme = isDark ? 'dark' : 'light';

      view.classList.toggle('dark-mode', isDark);
      if (themeBtn) {
        /*
        themeBtn.textContent = isDark ? '🌙' : '☀️';
      }

        */
        themeBtn.textContent = isDark ? 'Light' : 'Dark';
      }
      ['library-view', 'category-view', 'list-view', 'detail-view', 'reader-view'].forEach((id) => {
        const element = document.getElementById(id);
        if (!element) return;

        element.classList.remove('library-dark', 'library-light');
        element.classList.add(isDark ? 'library-dark' : 'library-light');
      });

      contentEl.style.fontSize = `${userPreferences.fontSize}px`;
    };

    const renderTOC = () => {
      if (!tocPanel || !currentNovelData) return;

      let tocHtml = '<ul>';
      currentNovelData.chapters.forEach((chapter) => {
        tocHtml += `<li><a href="#${chapter.id}">${chapter.title}</a></li>`;
      });
      tocHtml += '</ul>';
      tocPanel.innerHTML = tocHtml;
    };

    const renderNovel = () => {
      if (!contentEl || !currentNovelData) return;

      let html = '';
      currentNovelData.chapters.forEach((chapter) => {
        html += `<h2 id="${chapter.id}">${chapter.title}</h2>`;
        chapter.paragraphs.forEach((paragraph) => {
          html += `<p id="${paragraph.id}" data-chapter-id="${chapter.id}">${paragraph.html || ''}</p>`;
        });
      });

      contentEl.innerHTML = html;
      renderTOC();
    };

    const scrollToParagraph = (paragraphId, blockPosition = 'center') => {
      const target = document.getElementById(paragraphId);
      if (!target || !contentWrapper || !currentNovelData) {
        return;
      }

      const chapterId =
        target.tagName === 'H2' ? target.id : target.dataset.chapterId;

      if (chapterId) {
        currentChapterIndex = currentNovelData.chapters.findIndex((chapter) => chapter.id === chapterId);
      }

      contentWrapper.scrollTo({
        top:
          target.offsetTop -
          (blockPosition === 'center'
            ? contentWrapper.clientHeight / 2 - target.clientHeight / 2
            : 100),
        behavior: 'smooth',
      });

      target.classList.add('highlighted-paragraph');
      setTimeout(() => target.classList.remove('highlighted-paragraph'), settings.reader.highlightDurationMs);
    };

    const changeChapter = (direction) => {
      if (!currentNovelData || currentNovelData.chapters.length === 0) return;

      const newIndex = currentChapterIndex + direction;
      if (newIndex < 0 || newIndex >= currentNovelData.chapters.length) return;

      currentChapterIndex = newIndex;
      scrollToParagraph(currentNovelData.chapters[currentChapterIndex].id, 'start');
    };

    const toggleTheme = (button) => {
      if (window.AppTheme) {
        window.AppTheme.toggle({ user: true });
        applyPreferences();
        return;
      }

      if (!view) return;

      view.classList.toggle('dark-mode');
      const isDark = view.classList.contains('dark-mode');
      userPreferences.theme = isDark ? 'dark' : 'light';
      /*
      button.textContent = isDark ? '🌙' : '☀️';

      */
      button.textContent = isDark ? 'Light' : 'Dark';
      applyPreferences();
      userPreferences.save();
    };

    const changeFontSize = (delta) => {
      if (!contentEl) return;

      userPreferences.fontSize = Math.max(
        settings.reader.minFontSize,
        Math.min(settings.reader.maxFontSize, userPreferences.fontSize + delta)
      );
      contentEl.style.fontSize = `${userPreferences.fontSize}px`;
      userPreferences.save();
    };

    const toggleTOC = () => {
      if (tocPanel) {
        tocPanel.classList.toggle('visible');
      }
    };

    const loadNovel = async (novelId) => {
      if (novelCache.has(novelId)) {
        return novelCache.get(novelId);
      }

      const response = await fetch(`./novels_data/${encodeURIComponent(novelId)}.json`, {
        cache: 'no-cache',
      });

      if (!response.ok) {
        throw new Error(`小说文件未找到: ${novelId}.json`);
      }

      const novel = await response.json();
      novelCache.set(novelId, novel);
      return novel;
    };

    const init = () => {
      if (isInitialized) return;

      view = document.getElementById('reader-view');
      if (!view) return;

      contentEl = document.getElementById('reader-content');
      tocPanel = document.querySelector('.reader-toc-panel');
      controls = document.querySelector('.reader-controls');
      contentWrapper = document.querySelector('.reader-content-wrapper');

      if (!contentEl || !tocPanel || !controls || !contentWrapper) {
        console.error('NovelReader: required DOM nodes are missing');
        return;
      }

      userPreferences.load();
      applyPreferences();

      if (window.AppTheme && !view.dataset.themeSyncBound) {
        window.AppTheme.subscribe(() => {
          applyPreferences();
        });
        view.dataset.themeSyncBound = '1';
      }

      controls.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        switch (target.id) {
          case 'reader-theme-toggle':
            toggleTheme(target);
            break;
          case 'reader-font-decrease':
            changeFontSize(-1);
            break;
          case 'reader-font-increase':
            changeFontSize(1);
            break;
          case 'reader-toc-toggle':
            toggleTOC();
            break;
          default:
            break;
        }
      });

      tocPanel.addEventListener('click', (event) => {
        if (event.target.tagName !== 'A') return;

        event.preventDefault();
        const targetId = event.target.getAttribute('href')?.substring(1);
        if (!targetId) return;

        scrollToParagraph(targetId, 'start');
        toggleTOC();
      });

      let lastScrollTop = 0;
      contentWrapper.addEventListener(
        'scroll',
        () => {
          const scrollTop = contentWrapper.scrollTop;
          const hideThreshold = settings.reader.scrollHideThreshold;

          if (scrollTop > lastScrollTop && scrollTop > hideThreshold) {
            view.classList.add('immersive');
          } else {
            view.classList.remove('immersive');
          }

          lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
        },
        { passive: true }
      );

      let touchStartX = 0;
      contentWrapper.addEventListener(
        'touchstart',
        (event) => {
          touchStartX = event.touches[0].clientX;
        },
        { passive: true }
      );

      contentWrapper.addEventListener(
        'touchend',
        (event) => {
          const swipeDistance = event.changedTouches[0].clientX - touchStartX;
          const threshold = settings.reader.swipeThreshold;

          if (swipeDistance > threshold) {
            changeChapter(-1);
          } else if (swipeDistance < -threshold) {
            changeChapter(1);
          }
        },
        { passive: true }
      );

      isInitialized = true;
    };

    const open = async (novelId, paragraphId = null) => {
      try {
        if (contentWrapper) {
          contentWrapper.scrollTop = 0;
        }
        if (view) {
          view.classList.remove('immersive');
        }

        currentNovelData = await loadNovel(novelId);
        renderNovel();

        const fallbackTarget = currentNovelData.chapters[0]?.id || null;
        const targetId = paragraphId || fallbackTarget;
        if (targetId) {
          setTimeout(
            () => scrollToParagraph(targetId, 'start'),
            settings.reader.initialScrollDelayMs
          );
        }
      } catch (error) {
        console.error('NovelReader: failed to load novel', error);
        if (contentEl) {
          contentEl.innerHTML =
            '<p style="text-align:center; color:red;">加载小说内容失败，请检查文件是否存在。</p>';
        }
      }
    };

    return { init, open };
  })();

  window.NovelReader = NovelReader;

  const AIAgent = (() => {
    const API_ENDPOINT = window.appConfig?.API_ENDPOINT;

    let fab;
    let chatWindow;
    let closeBtn;
    let messagesContainer;
    let input;
    let sendBtn;
    let newChatBtn;
    let isInitialized = false;
    let conversationHistory = [];

    const addMessage = (text, sender, type = 'message') => {
      const message = document.createElement('div');

      if (type === 'notification') {
        message.classList.add('system-notification-response');
      } else {
        message.classList.add('message', `${sender}-response`);
      }

      if (sender === 'ai') {
        message.innerHTML = text
          .replace(/\[REF:(.*?):([a-zA-Z0-9-]+)\]/g, (match, novelId, paragraphId) => {
            return ` <a href="#" class="novel-link" data-novel-id="${novelId.trim()}" data-goto-id="${paragraphId.trim()}">[原文出处]</a>`;
          })
          .replace(/\n/g, '<br>');
      } else {
        message.appendChild(document.createTextNode(text));
      }

      messagesContainer.appendChild(message);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return message;
    };

    const startNewChat = () => {
      if (!messagesContainer || !input || !sendBtn) return;

      conversationHistory = [];
      messagesContainer.innerHTML = `<div class="message ai-response">${settings.ai.introMessage}</div>`;
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    };

    const toggleWindow = () => {
      if (!chatWindow || !input) return;

      chatWindow.classList.toggle('hidden');
      if (!chatWindow.classList.contains('hidden')) {
        input.focus();
      }
    };

    const sendMessage = async () => {
      if (!input || !sendBtn || !messagesContainer || !API_ENDPOINT) return;

      const query = input.value.trim();
      if (!query) return;

      addMessage(query, 'user');
      input.value = '';
      input.disabled = true;
      sendBtn.disabled = true;

      const thinkingMessage = addMessage(settings.ai.thinkingMessage, 'ai');
      thinkingMessage.classList.add('thinking');

      try {
        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, history: conversationHistory }),
        });

        if (!response.ok) {
          throw new Error(`网络响应错误: ${response.status} ${await response.text()}`);
        }

        const data = await response.json();
        /*
        const aiText = data?.output?.text ?? '抱歉，我没有得到有效的回复。';

        */
        const aiText = data?.output?.text ?? 'Sorry, I did not receive a valid response.';
        thinkingMessage.remove();
        addMessage(aiText, 'ai');

        conversationHistory.push({ role: 'user', content: query });
        conversationHistory.push({ role: 'assistant', content: aiText });

        if (conversationHistory.length > settings.ai.conversationLimit) {
          conversationHistory = conversationHistory.slice(-settings.ai.conversationLimit);

          const lastMessage = messagesContainer.lastElementChild;
          if (!lastMessage || !lastMessage.classList.contains('system-notification-response')) {
            addMessage(settings.ai.archiveNotice, 'system', 'notification');
          }
        }
      } catch (error) {
        console.error('AIAgent: request failed', error);
        thinkingMessage.remove();
        /*
        addMessage('抱歉，我的大脑好像短路了... 请检查后端服务或网络连接。', 'ai');
        */
        addMessage('Sorry, the request failed. Please check the network or backend service.', 'ai');
      } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    };

    const handleMessageClick = (event) => {
      const link = event.target.closest('a.novel-link');
      if (!link) return;

      event.preventDefault();

      const novelId = link.dataset.novelId;
      const paragraphId = link.dataset.gotoId;

      if (!novelId || !paragraphId) return;

      if (window.globalNavigator?.gotoNovelLocation) {
        window.globalNavigator.gotoNovelLocation(novelId, paragraphId);
        toggleWindow();
      } else {
        console.error("AIAgent: globalNavigator.gotoNovelLocation is missing");
        /*
        alert('跳转功能似乎出了点问题，请联系管理员。');
        */
        alert('Jump failed. Please contact the administrator.');
      }
    };

    const init = () => {
      if (isInitialized) return;

      fab = document.getElementById('ai-fab');
      chatWindow = document.getElementById('ai-chat-window');
      closeBtn = chatWindow?.querySelector('.close-chat') || null;
      messagesContainer = chatWindow?.querySelector('.chat-messages') || null;
      input = document.getElementById('chat-input');
      sendBtn = document.getElementById('chat-send');
      newChatBtn = document.getElementById('new-chat-btn');

      if (!fab || !chatWindow || !closeBtn || !messagesContainer || !input || !sendBtn) {
        console.error('AIAgent: required DOM nodes are missing');
        return;
      }

      fab.addEventListener('click', toggleWindow);
      closeBtn.addEventListener('click', toggleWindow);
      sendBtn.addEventListener('click', sendMessage);

      if (newChatBtn) {
        newChatBtn.addEventListener('click', startNewChat);
      }

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });

      messagesContainer.addEventListener('click', handleMessageClick);
      isInitialized = true;
    };

    return { init };
  })();

  window.AIAgent = AIAgent;

  const CharacterArchive = (() => {
    const state = {
      initialized: false,
      websiteData: null,
      items: [],
      filtered: [],
      selectedOriginalIndex: -1,
    };

    const elements = {
      root: null,
      grid: null,
      detail: null,
      search: null,
      empty: null,
      clearBtn: null,
    };

    const normalize = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const safeText = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));

    const getCharactersCategory = (data) => {
      if (!data || !Array.isArray(data.categories)) return null;
      return data.categories.find(
        (category) => category && (category.id === 'characters' || category.title === '人物档案')
      ) || null;
    };

    const renderSubItems = (subItems, level = 0) => {
      if (!Array.isArray(subItems) || subItems.length === 0) return '';

      const blocks = subItems
        .map((subItem) => {
          /*
          const title = renderColorMarkup(safeText(subItem.title || '未命名'));
          */
          const title = renderColorMarkup(safeText(subItem.title || 'Untitled'));
          const details = safeText(subItem.details);
          const detailsHtml = details
            ? `<div class="character-section-text">${renderColorMarkup(details)}</div>`
            : '';
          const childHtml = renderSubItems(
            subItem.subItems,
            Math.min(level + 1, settings.characters.maxNestedSectionLevel)
          );

          return `
            <div class="character-section level-${level}">
              <div class="character-section-title">${title}</div>
              ${detailsHtml}
              ${childHtml}
            </div>
          `;
        })
        .join('');

      return `<div class="character-sections">${blocks}</div>`;
    };

    const cardHtml = (item, index) => {
      /*
      const rawTitle = safeText(item?.title || '未命名');
      const plainTitle = stripColorMarkup(rawTitle) || '未命名';
      */
      const rawTitle = safeText(item?.title || 'Untitled');
      const plainTitle = stripColorMarkup(rawTitle) || 'Untitled';
      const details = stripColorMarkup(safeText(item?.details));
      const snippet = details
        ? details.length > settings.characters.snippetLength
          ? `${details.slice(0, settings.characters.snippetLength)}…`
          : details
        : '（暂无简介）';

      const image = item?.image ? safeText(item.image) : '';
      const avatarHtml = image
        ? `<img class="character-avatar-img" src="${image}" alt="${plainTitle}">`
        : '<div class="character-avatar-fallback">NO IMAGE</div>';

      return `
        <div class="character-card" role="button" tabindex="0" data-idx="${index}">
          <div class="character-avatar">${avatarHtml}</div>
          <div class="character-meta">
            <div class="character-name">${renderColorMarkup(rawTitle)}</div>
            <div class="character-snippet">${renderColorMarkup(snippet)}</div>
          </div>
        </div>
      `;
    };

    const renderCards = (list) => {
      if (!elements.grid) return;

      if (!Array.isArray(list) || list.length === 0) {
        elements.grid.innerHTML = '';
        if (elements.empty) elements.empty.hidden = false;
        return;
      }

      if (elements.empty) elements.empty.hidden = true;
      elements.grid.innerHTML = list.map(cardHtml).join('');
    };

    const renderDetail = (item) => {
      if (!elements.detail) return;

      if (!item) {
        elements.detail.innerHTML = `
          <div class="character-detail-placeholder">
            <div class="character-detail-title">选择一个人物</div>
            <div class="character-detail-text">该页面从 website-data.json 的 characters 分类读取（title / details / image / subItems）。</div>
          </div>
        `;
        return;
      }

      const title = safeText(item.title || 'Untitled');
      const image = item.image ? safeText(item.image) : '';
      const imageHtml = image
        ? `<img class="character-detail-img" src="${image}" alt="${stripColorMarkup(title)}">`
        : '';
      const details = safeText(item.details);
      const detailsHtml = details
        ? `<div class="character-detail-text">${renderColorMarkup(details)}</div>`
        : '<div class="character-detail-text faint">（暂无正文）</div>';
      const sectionsHtml = renderSubItems(item.subItems, 0);

      elements.detail.innerHTML = `
        <div class="character-detail-inner">
          <div class="character-detail-name">${renderColorMarkup(title)}</div>
          ${imageHtml}
          ${detailsHtml}
          ${sectionsHtml}
        </div>
      `;
    };

    const highlightCard = (filteredIndex) => {
      if (!elements.grid) return;

      elements.grid.querySelectorAll('.character-card').forEach((card) => {
        card.classList.remove('active');
      });

      const activeCard = elements.grid.querySelector(`.character-card[data-idx="${filteredIndex}"]`);
      if (activeCard) {
        activeCard.classList.add('active');
      }
    };

    const applyFilter = (query) => {
      const normalizedQuery = normalize(stripColorMarkup(safeText(query)));

      if (!normalizedQuery) {
        state.filtered = state.items.slice();
      } else {
        state.filtered = state.items.filter((item) => {
          const title = normalize(stripColorMarkup(safeText(item?.title)));
          const details = normalize(stripColorMarkup(safeText(item?.details)));
          return title.includes(normalizedQuery) || details.includes(normalizedQuery);
        });
      }

      renderCards(state.filtered);

      const previousItem = state.items[state.selectedOriginalIndex];
      const filteredIndex = previousItem ? state.filtered.indexOf(previousItem) : -1;

      if (filteredIndex !== -1) {
        highlightCard(filteredIndex);
        renderDetail(previousItem);
      } else {
        state.selectedOriginalIndex = -1;
        renderDetail(null);
      }
    };

    const bindEventsOnce = () => {
      if (state.initialized) return;

      if (elements.grid) {
        elements.grid.addEventListener('click', (event) => {
          const card = event.target.closest('.character-card');
          if (!card) return;

          const filteredIndex = parseInt(card.dataset.idx, 10);
          if (Number.isNaN(filteredIndex)) return;

          const item = state.filtered[filteredIndex];
          state.selectedOriginalIndex = state.items.indexOf(item);
          highlightCard(filteredIndex);
          renderDetail(item);
        });

        elements.grid.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;

          const card = event.target.closest('.character-card');
          if (!card) return;

          event.preventDefault();
          card.click();
        });
      }

      if (elements.search) {
        elements.search.addEventListener('input', () => {
          applyFilter(elements.search.value);
        });
      }

      if (elements.clearBtn) {
        elements.clearBtn.addEventListener('click', () => {
          if (elements.search) {
            elements.search.value = '';
            elements.search.focus();
          }
          applyFilter('');
        });
      }

      state.initialized = true;
    };

    const init = async ({ websiteData } = {}) => {
      state.websiteData = websiteData || window.__websiteData || { categories: [] };

      elements.root = document.getElementById('character-archive');
      elements.grid = document.getElementById('character-grid');
      elements.detail = document.getElementById('character-detail');
      elements.search = document.getElementById('character-search');
      elements.empty = document.getElementById('character-empty');
      elements.clearBtn = document.getElementById('character-clear');

      if (!elements.root || !elements.grid || !elements.detail) return;

      const category = getCharactersCategory(state.websiteData);
      state.items = Array.isArray(category?.items) ? category.items : [];
      state.filtered = state.items.slice();

      renderCards(state.filtered);
      renderDetail(null);
      bindEventsOnce();

      if (elements.search?.value) {
        applyFilter(elements.search.value);
      }
    };

    return { init };
  })();

  window.CharacterArchive = CharacterArchive;
})();
