/**
* Template Name: Instant
* Template URL: https://bootstrapmade.com/newtemplate-bootstrap-website-template/
* Updated: Jul 07 2025 with Bootstrap v5.3.7
* Author: BootstrapMade.com
* License: https://bootstrapmade.com/license/
*/

(function() {
  "use strict";

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  if (!window.location.hash) {
    window.addEventListener('load', () => window.scrollTo(0, 0));
  }

  /**
   * Apply .scrolled class to the body as the page is scrolled down
   */
  function toggleScrolled() {
    const selectBody = document.querySelector('body');
    const selectHeader = document.querySelector('#header');
    if (!selectHeader.classList.contains('scroll-up-sticky') && !selectHeader.classList.contains('sticky-top') && !selectHeader.classList.contains('fixed-top')) return;
    window.scrollY > 100 ? selectBody.classList.add('scrolled') : selectBody.classList.remove('scrolled');
  }

  document.addEventListener('scroll', toggleScrolled);
  window.addEventListener('load', toggleScrolled);

  /**
   * Mobile nav toggle
   */
  const mobileNavToggleBtn = document.querySelector('.mobile-nav-toggle');

  function mobileNavToogle() {
    document.querySelector('body').classList.toggle('mobile-nav-active');
    mobileNavToggleBtn.classList.toggle('bi-list');
    mobileNavToggleBtn.classList.toggle('bi-x');
  }
  if (mobileNavToggleBtn) {
    mobileNavToggleBtn.addEventListener('click', mobileNavToogle);
  }

  /**
   * Hide mobile nav on same-page/hash links
   */
  document.querySelectorAll('#navmenu a').forEach(navmenu => {
    navmenu.addEventListener('click', () => {
      if (document.querySelector('.mobile-nav-active')) {
        mobileNavToogle();
      }
    });

  });

  /**
   * Toggle mobile nav dropdowns
   */
  document.querySelectorAll('.navmenu .toggle-dropdown').forEach(navmenu => {
    navmenu.addEventListener('click', function(e) {
      e.preventDefault();
      this.parentNode.classList.toggle('active');
      this.parentNode.nextElementSibling.classList.toggle('dropdown-active');
      e.stopImmediatePropagation();
    });
  });

  /**
   * Scroll top button
   */
  let scrollTop = document.querySelector('.scroll-top');

  function toggleScrollTop() {
    if (scrollTop) {
      window.scrollY > 100 ? scrollTop.classList.add('active') : scrollTop.classList.remove('active');
    }
  }
  scrollTop.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

  window.addEventListener('load', toggleScrollTop);
  document.addEventListener('scroll', toggleScrollTop);

  /**
   * Animation on scroll function and init
   */
  function aosInit() {
    AOS.init({
      duration: 600,
      easing: 'ease-in-out',
      once: true,
      mirror: false
    });
  }
  window.addEventListener('load', aosInit);

  /**
   * Initiate glightbox
   */
  const glightbox = GLightbox({
    selector: '.glightbox'
  });

  /**
   * Initiate Pure Counter
   */
  new PureCounter();

  /**
   * Init typed.js
   */
  const selectTyped = document.querySelector('.typed');
  if (selectTyped) {
    let typed_strings = selectTyped.getAttribute('data-typed-items');
    typed_strings = typed_strings.split(',');
    new Typed('.typed', {
      strings: typed_strings,
      loop: true,
      typeSpeed: 50,
      backSpeed: 20,
      backDelay: 2000
    });
  }

  /**
   * Render hero laptop test cards from data
   */
  const heroTestCards = [
    {
      id: 'cpu',
      type: 'sparkline',
      icon: 'bi-thermometer-half',
      label: 'CPU',
      title: '78°C',
      subtitle: 'Средняя температура',
      points: [12, 18, 31, 20, 24, 14, 20, 29, 21, 14, 23, 35, 26, 20, 24]
    },
    {
      id: 'cpuAlt',
      type: 'sparkline',
      icon: 'bi-thermometer-high',
      label: 'CPU',
      title: '94°C',
      subtitle: 'Пиковая температура',
      points: [18, 26, 39, 31, 44, 34, 48, 41, 54, 45, 58, 50, 63, 56, 68]
    },
    {
      id: 'display',
      type: 'metric',
      icon: 'bi-display',
      label: 'Дисплей',
      title: '2.5K 240 Гц',
      subtitle: '100% DCI-P3',
      progress: 90
    },
    {
      id: 'battery',
      type: 'metric',
      icon: 'bi-battery-half',
      label: '<span class="problem-label">Проблема</span>',
      title: '1.5 ч',
      subtitle: 'Плохая батарея',
      progress: 15
    },
    {
      id: 'batteryAlt',
      type: 'metric',
      icon: 'bi-exclamation-triangle-fill',
      label: '<span class="problem-label">Проблема</span>',
      title: '135W',
      subtitle: 'Ограниченное питание',
      progress: 35
    },
    {
      id: 'fps',
      type: 'fps',
      icon: 'bi-speedometer2',
      label: 'Средний FPS <span class="fps-gpu-text">(5070 115W FHD)</span>',
      rows: [
        { name: 'Cyberpunk 2077', value: '118 FPS', progress: 72 },
        { name: 'Alan Wake 2', value: '74 FPS', progress: 45 },
        { name: 'STALKER 2', value: '96 FPS', progress: 58 }
      ]
    },
    {
      id: 'fpsAlt',
      type: 'fps',
      icon: 'bi-speedometer2',
      label: 'Средний FPS <span class="fps-gpu-text">(5070 115W FHD)</span>',
      rows: [
        { name: 'CS2', value: '291 FPS', progress: 100 },
        { name: 'Forza Horizon 6', value: '165 FPS', progress: 100 },
        { name: '007 First Light', value: '102 FPS', progress: 62 }
      ]
    },
    {
      id: 'noise',
      type: 'sparkline',
      icon: 'bi-soundwave',
      label: 'Шум',
      title: '52 dB',
      subtitle: 'Низкий уровень шума',
      points: [12, 14, 20, 11, 13, 19, 8, 15, 9, 18, 7, 12, 22, 10, 8]
    }
  ];

  const heroTestCardById = heroTestCards.reduce((cards, card) => {
    cards[card.id] = card;
    return cards;
  }, {});

  const heroTestSlots = ['cpu', 'display', 'battery', 'fps'];
  const heroTestFrames = [
    {
      cpu: 'cpu',
      display: 'display',
      battery: 'battery',
      fps: 'fps'
    },
    {
      cpu: 'cpuAlt',
      display: 'noise',
      battery: 'batteryAlt',
      fps: 'fpsAlt'
    }
  ];

  function progressMarkup(progress) {
    return `<div class="test-progress" style="--progress: ${progress}%"><span></span></div>`;
  }

  function sparklineMarkup(points) {
    const width = 148;
    const height = 42;
    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;
    const step = width / (points.length - 1);
    const d = points.map((point, index) => {
      const x = Math.round(index * step);
      const y = Math.round(height - ((point - min) / range) * (height - 8) - 4);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return `<svg class="test-sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}" pathLength="100"></path></svg>`;
  }

  function renderHeroTestCardContent(card) {
    const label = `<div class="card-label"><i class="bi ${card.icon}"></i><span>${card.label}</span></div>`;

    if (card.type === 'fps') {
      const rows = card.rows.map(row => `
        <div class="fps-row">
          <span class="game-name"><i class="bi bi-fire"></i>${row.name}</span>
          ${progressMarkup(row.progress)}
          <span class="fps-value">${row.value}</span>
        </div>
      `).join('');

      return `<div class="test-card-content">${label}${rows}</div>`;
    }

    const subtitle = card.subtitle ? `<div class="card-subtitle">${card.subtitle}</div>` : '';
    const value = card.value ? `<div class="card-value">${card.value}</div>` : '';
    const progress = card.progress ? progressMarkup(card.progress) : '';
    const sparkline = card.points ? sparklineMarkup(card.points) : '';

    return `
      <div class="test-card-content">
        ${label}
        <div class="card-title">${card.title}</div>
        ${value}
        ${subtitle}
        ${progress}
        ${sparkline}
      </div>
    `;
  }

  function renderHeroTestCard(card, slot = card.id) {
    const cardClass = `test-card ${slot}-card ${card.id}-data`;

    return `
      <article class="${cardClass}" data-slot="${slot}" data-card-id="${card.id}">
        ${renderHeroTestCardContent(card)}
      </article>
    `;
  }

  const heroTestCardsContainer = document.querySelector('#heroTestCards');
  if (heroTestCardsContainer) {
    let activeHeroTestFrame = 0;

    function renderHeroTestFrame(frameIndex) {
      const frame = heroTestFrames[frameIndex];
      return heroTestSlots.map(slot => renderHeroTestCard(heroTestCardById[frame[slot]], slot)).join('');
    }

    function replaceHeroTestCard(slot, nextCard) {
      const currentCard = heroTestCardsContainer.querySelector(`[data-slot="${slot}"]`);
      if (!currentCard || currentCard.dataset.cardId === nextCard.id) {
        return;
      }

      const currentContent = currentCard.querySelector('.test-card-content');
      if (!currentContent) {
        return;
      }

      currentCard.classList.add('is-line-animating');
      currentContent.classList.add('is-fading');

      window.setTimeout(() => {
        const template = document.createElement('template');
        template.innerHTML = renderHeroTestCardContent(nextCard).trim();
        const nextContentElement = template.content.firstElementChild;

        nextContentElement.classList.add('is-fading');
        currentCard.classList.remove(`${currentCard.dataset.cardId}-data`);
        currentCard.classList.add(`${nextCard.id}-data`);
        currentCard.dataset.cardId = nextCard.id;
        currentContent.replaceWith(nextContentElement);
        window.requestAnimationFrame(() => {
          nextContentElement.classList.remove('is-fading');
          nextContentElement.offsetHeight;
          nextContentElement.classList.add('is-progress-animating');
        });
        window.setTimeout(() => {
          nextContentElement.classList.remove('is-progress-animating');
        }, 900);
        window.setTimeout(() => {
          currentCard.classList.remove('is-line-animating');
        }, 200);
      }, 620);
    }

    function showHeroTestFrame(frameIndex) {
      activeHeroTestFrame = frameIndex;
      const frame = heroTestFrames[activeHeroTestFrame];

      heroTestSlots.forEach(slot => {
        replaceHeroTestCard(slot, heroTestCardById[frame[slot]]);
      });
    }

    function showNextHeroTestFrame() {
      const nextFrame = (activeHeroTestFrame + 1) % heroTestFrames.length;
      showHeroTestFrame(nextFrame);
    }

    heroTestCardsContainer.innerHTML = renderHeroTestFrame(activeHeroTestFrame);
    heroTestCardsContainer.addEventListener('mouseover', (event) => {
      const card = event.target.closest('.test-card');
      if (!card || !heroTestCardsContainer.contains(card)) return;
      card.classList.add('is-hovered');
    });
    heroTestCardsContainer.addEventListener('mouseout', (event) => {
      const card = event.target.closest('.test-card');
      if (!card || !heroTestCardsContainer.contains(card)) return;
      if (card.contains(event.relatedTarget)) return;
      card.classList.remove('is-hovered');
    });
    heroTestCardsContainer.querySelectorAll('.test-card-content').forEach(content => {
      window.requestAnimationFrame(() => {
        content.offsetHeight;
        content.classList.add('is-progress-animating');
        window.setTimeout(() => {
          content.classList.remove('is-progress-animating');
        }, 900);
      });
    });

    if (heroTestFrames.length > 1) {
      window.setInterval(showNextHeroTestFrame, 4200);
    }
  }

  /**
   * Init swiper sliders
   */
  function initSwiper() {
    document.querySelectorAll(".init-swiper").forEach(function(swiperElement) {
      let config = JSON.parse(
        swiperElement.querySelector(".swiper-config").innerHTML.trim()
      );

      if (swiperElement.classList.contains("swiper-tab")) {
        initSwiperWithCustomPagination(swiperElement, config);
      } else {
        new Swiper(swiperElement, config);
      }
    });
  }

  window.addEventListener("load", initSwiper);

  /**
   * Frequently Asked Questions Toggle
   */
  document.querySelectorAll('.faq-item h3, .faq-item .faq-toggle, .faq-item .faq-header').forEach((faqItem) => {
    faqItem.addEventListener('click', () => {
      faqItem.parentNode.classList.toggle('faq-active');
    });
  });

  /**
   * Correct scrolling position upon page load for URLs containing hash links.
   */
  window.addEventListener('load', function(e) {
    if (window.location.hash) {
      if (document.querySelector(window.location.hash)) {
        setTimeout(() => {
          let section = document.querySelector(window.location.hash);
          let scrollMarginTop = getComputedStyle(section).scrollMarginTop;
          window.scrollTo({
            top: section.offsetTop - parseInt(scrollMarginTop),
            behavior: 'smooth'
          });
        }, 100);
      }
    }
  });

  /**
   * Navmenu Scrollspy
   */
  let navmenulinks = document.querySelectorAll('.navmenu a');

  function navmenuScrollspy() {
    navmenulinks.forEach(navmenulink => {
      if (!navmenulink.hash) return;
      let section = document.querySelector(navmenulink.hash);
      if (!section) return;
      let position = window.scrollY + 200;
      if (position >= section.offsetTop && position <= (section.offsetTop + section.offsetHeight)) {
        document.querySelectorAll('.navmenu a.active').forEach(link => link.classList.remove('active'));
        navmenulink.classList.add('active');
      } else {
        navmenulink.classList.remove('active');
      }
    })
  }
  window.addEventListener('load', navmenuScrollspy);
  document.addEventListener('scroll', navmenuScrollspy);

})();
