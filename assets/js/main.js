/**
 * eboibd.site - Main Site Interactivity
 */

document.addEventListener("DOMContentLoaded", () => {
  initStickyHeader();
  initMobileMenu();
  initScrollReveal();
  initFaqAccordions();
  initCountUp();
});

/**
 * 1. Sticky Header Scroll Effect
 */
function initStickyHeader() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();
}

/**
 * 2. Mobile Menu Drawer Toggle
 */
function initMobileMenu() {
  const toggleBtn = document.querySelector(".mobile-nav-toggle");
  const drawer = document.querySelector(".mobile-drawer");
  if (!toggleBtn || !drawer) return;

  const toggle = () => {
    const isOpen = drawer.classList.contains("open");
    if (isOpen) {
      drawer.classList.remove("open");
      toggleBtn.classList.remove("active");
      document.body.style.overflow = "";
    } else {
      drawer.classList.add("open");
      toggleBtn.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  };

  toggleBtn.addEventListener("click", toggle);

  // Close when clicking nav links
  drawer.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      drawer.classList.remove("open");
      toggleBtn.classList.remove("active");
      document.body.style.overflow = "";
    });
  });
}

/**
 * 3. Intersection Observer for Scroll Reveals
 */
function initScrollReveal() {
  const revealElements = document.querySelectorAll(".reveal");
  if (!revealElements.length) return;

  // Check prefers-reduced-motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealElements.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          obs.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      threshold: 0.12,
      rootMargin: "0px 0px -40px 0px"
    }
  );

  revealElements.forEach((el) => observer.observe(el));
}

/**
 * 4. FAQ Accordion Toggle with rotating + icon
 */
function initFaqAccordions() {
  const faqItems = document.querySelectorAll(".faq-item");
  if (!faqItems.length) return;

  faqItems.forEach((item) => {
    const questionBtn = item.querySelector(".faq-question");
    if (!questionBtn) return;

    questionBtn.addEventListener("click", () => {
      const isActive = item.classList.contains("active");

      // Optional: close other open items in the same container
      faqItems.forEach((other) => {
        if (other !== item) other.classList.remove("active");
      });

      if (isActive) {
        item.classList.remove("active");
      } else {
        item.classList.add("active");
      }
    });
  });
}

/**
 * 5. Animated Count-Up for Numbers
 */
function initCountUp() {
  const countElements = document.querySelectorAll("[data-count]");
  if (!countElements.length) return;

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  countElements.forEach((el) => observer.observe(el));
}

function animateCount(el) {
  const target = parseInt(el.getAttribute("data-count"), 10);
  if (isNaN(target)) return;

  const isBangla = el.getAttribute("data-bangla") !== "false";
  const duration = 1600;
  const startTime = performance.now();

  const step = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out quad
    const easeProgress = 1 - (1 - progress) * (1 - progress);
    const current = Math.floor(easeProgress * target);

    el.textContent = isBangla ? toBanglaNumber(current) : current;

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = isBangla ? toBanglaNumber(target) : target;
    }
  };

  requestAnimationFrame(step);
}
