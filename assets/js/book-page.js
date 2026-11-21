/**
 * eboibd.site - Book Landing Page Specific Interactivity
 * - Swipe Gallery & Lightbox Preview
 * - Mobile Sticky Bottom Purchase Bar (shows after scrolling past hero)
 * - Smooth scroll jump to sections
 */

document.addEventListener("DOMContentLoaded", () => {
  initLightbox();
  initMobileStickyBar();
  initInsideScroll();
});

/**
 * 1. Inside Pages Lightbox Preview (Images only, no download)
 */
function initLightbox() {
  const modal = document.getElementById("lightbox-modal");
  const modalImg = document.getElementById("lightbox-image");
  const closeBtn = document.getElementById("lightbox-close");
  const galleryCards = document.querySelectorAll(".gallery-card");

  if (!modal || !modalImg) return;

  galleryCards.forEach((card) => {
    card.addEventListener("click", () => {
      const img = card.querySelector("img");
      if (img) {
        modalImg.src = img.src;
        modalImg.alt = img.alt || "ইবুক পৃষ্ঠা প্রিভিউ";
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
      }
    });
  });

  const closeModal = () => {
    modal.classList.remove("active");
    modalImg.src = "";
    document.body.style.overflow = "";
  };

  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });
}

/**
 * 2. Mobile Sticky Bottom Purchase Bar
 * Appears only on mobile after user scrolls past the hero section
 */
function initMobileStickyBar() {
  const stickyBar = document.querySelector(".mobile-buy-bar");
  const heroSection = document.querySelector(".book-hero");

  if (!stickyBar || !heroSection) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // If hero is NOT intersecting (scrolled down), show sticky bar
        if (!entry.isIntersecting) {
          stickyBar.classList.add("visible");
        } else {
          stickyBar.classList.remove("visible");
        }
      });
    },
    {
      root: null,
      threshold: 0.1
    }
  );

  observer.observe(heroSection);
}

/**
 * 3. Smooth scroll jump to TOC/Preview
 */
function initInsideScroll() {
  const btn = document.querySelector(".scroll-to-inside");
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const target = document.getElementById("inside-preview") || document.getElementById("toc");
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  });
}
