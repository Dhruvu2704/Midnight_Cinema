/* ===================================================================
   MIDNIGHT CINEMA — SCRIPT.JS (V2)
   Vanilla JS. Talks to the existing Flask API at
   http://127.0.0.1:5000/recommend?movie=...
   Functionality preserved from V1: search, loading, error handling,
   escaping, recommendation rendering. Added: navbar hide-on-scroll,
   scroll-reveal, reel-rail frame counter, animated match bars.
   =================================================================== */

const API_BASE_URL = "http://127.0.0.1:5000";

// ---------- DOM REFERENCES ----------
const searchForm = document.getElementById("searchForm");
const movieInput = document.getElementById("movieInput");
const searchButton = document.getElementById("searchButton");

const statusRegion = document.getElementById("statusRegion");
const emptyState = document.getElementById("emptyState");

const resultsWrap = document.getElementById("results");
const featuredEl = document.getElementById("featured");
const beyondWrap = document.getElementById("beyondWrap");
const cardGrid = document.getElementById("cardGrid");

const selectionTitle = document.getElementById("selectionTitle");
const screenLabel = document.getElementById("screenLabel");

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
const navbar = document.getElementById("navbar");

const reelCounter = document.getElementById("reelCounter");

// ---------- MOBILE NAV ----------
navToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

// ---------- NAVBAR HIDE ON SCROLL DOWN ----------
(function initNavbarScroll() {
  let lastY = window.scrollY;
  let ticking = false;

  function onScroll() {
    const currentY = window.scrollY;
    const scrolledDown = currentY > lastY && currentY > 120;

    navbar.classList.toggle("is-hidden", scrolledDown);
    lastY = currentY;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  });
})();

// ---------- SCROLL REVEAL ----------
(function initScrollReveal() {
  const targets = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window) || targets.length === 0) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach((el) => observer.observe(el));
})();

// ---------- REEL RAIL FRAME COUNTER (decorative) ----------
(function initReelCounter() {
  if (!reelCounter) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  let frame = 1;
  setInterval(() => {
    frame = (frame % 9999) + 1;
    reelCounter.textContent = String(frame).padStart(4, "0");
  }, 2200);
})();

// ---------- UTILITIES ----------

/**
 * Escapes HTML-sensitive characters so API-provided text
 * can never be interpreted as markup (prevents XSS).
 */
function escapeHTML(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

/**
 * Converts a similarity_score (0–1) into a rounded percentage.
 */
function toMatchPercent(similarityScore) {
  const percent = Math.round(Number(similarityScore) * 100);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
}

/**
 * Formats a rating value defensively — the API is expected to
 * return a number, but we guard against missing/odd values.
 */
function formatRating(rating) {
  const num = Number(rating);
  return Number.isFinite(num) ? num.toFixed(1) : "—";
}

function formatYear(year) {
  if (year === null || year === undefined || year === "") return "—";
  const num = Number(year);
  return Number.isFinite(num) ? String(Math.trunc(num)) : String(year);
}

// ---------- RENDERING: STATE SCREENS ----------

function clearStatusRegion() {
  statusRegion.innerHTML = "";
}

function showEmptyState() {
  clearStatusRegion();
  statusRegion.appendChild(emptyState);
  resultsWrap.hidden = true;
}

function setLoadingState() {
  clearStatusRegion();
  resultsWrap.hidden = true;

  const loading = document.createElement("div");
  loading.className = "loading-state";
  loading.innerHTML = `
    <p class="loading-state__label">Screen 01 &middot; Preparing Screening</p>
    <p class="loading-state__line">The lights dim&hellip; curating tonight's screening&hellip;</p>
    <div class="projector-line" aria-hidden="true"></div>
  `;
  statusRegion.appendChild(loading);
}

function displayError(title, copy) {
  clearStatusRegion();
  resultsWrap.hidden = true;

  const error = document.createElement("div");
  error.className = "error-state";
  error.innerHTML = `
    <p class="error-state__label">Screen 01 &middot; Transmission Error</p>
    <p class="error-state__title">${escapeHTML(title)}</p>
    <p class="error-state__copy">${escapeHTML(copy)}</p>
  `;
  statusRegion.appendChild(error);
}

// ---------- RENDERING: RESULTS ----------

/**
 * Builds the large "Tonight's Screening" feature for the
 * strongest recommendation.
 */
function createFeaturedFilm(movie, filmNumber) {
  const matchPercent = toMatchPercent(movie.similarity_score);
  const title = escapeHTML(movie.title);
  const year = escapeHTML(formatYear(movie.release_year));
  const rating = escapeHTML(formatRating(movie.rating));
  const filmNo = String(filmNumber).padStart(4, "0");

  const wrap = document.createElement("div");
  wrap.className = "featured";

  wrap.innerHTML = `
    <div class="featured__poster">
      <span class="poster__eyebrow">Midnight Cinema</span>
      <span class="poster__title">${title}</span>
      <div class="poster__footer">
        <span>Film No. ${escapeHTML(filmNo)}</span>
        <span>Screen 01</span>
      </div>
      <!-- Backdrop / poster image will be inserted here in Phase 2. -->
    </div>
    <div class="featured__info">
      <p class="featured__label">Tonight's Screening</p>
      <h3 class="featured__title">${title}</h3>
      <div class="featured__meta">
        <span>${year}</span>
        <span class="rating">&#9733; ${rating}</span>
      </div>
      <p class="featured__note">Selected because its themes and atmosphere closely match your viewing history.</p>
      <div class="match">
        <div class="match__number">${matchPercent}<span>Match</span></div>
        <div class="match__bar">
          <div class="match__bar-fill" data-fill="${matchPercent}"></div>
        </div>
      </div>
    </div>
  `;

  return wrap;
}

/**
 * Builds a smaller programme-style card for the remaining
 * recommendations.
 */
function createMovieCard(movie, filmNumber, index) {
  const matchPercent = toMatchPercent(movie.similarity_score);
  const title = escapeHTML(movie.title);
  const year = escapeHTML(formatYear(movie.release_year));
  const rating = escapeHTML(formatRating(movie.rating));
  const filmNo = String(filmNumber).padStart(4, "0");

  const card = document.createElement("article");
  card.className = "movie-card";
  card.style.animationDelay = `${index * 70}ms`;

  card.innerHTML = `
    <div class="movie-card__poster">
      <span class="poster__film-no">No. ${escapeHTML(filmNo)}</span>
      <span class="poster__name">${title}</span>
      <div class="movie-card__overlay"><span>Explore</span></div>
      <!-- Poster image will be inserted here in Phase 2. -->
    </div>
    <div class="movie-card__body">
      <h4 class="movie-card__title">${title}</h4>
      <div class="movie-card__meta">
        <span>${year}</span>
        <span class="rating">&#9733; ${rating}</span>
      </div>
      <div class="movie-card__match">
        <div class="movie-card__match-bar">
          <div class="movie-card__match-fill" data-fill="${matchPercent}"></div>
        </div>
        <span class="movie-card__match-value">${matchPercent}%</span>
      </div>
    </div>
  `;

  return card;
}

/**
 * Animates all match bars from 0 to their target width. Run after
 * the elements are in the DOM so the CSS transition actually fires.
 */
function animateMatchBars(container) {
  const fills = container.querySelectorAll("[data-fill]");
  requestAnimationFrame(() => {
    fills.forEach((fill) => {
      fill.style.width = `${fill.getAttribute("data-fill")}%`;
    });
  });
}

/**
 * Renders the full recommendation set: a featured film followed
 * by the remaining results as a card grid.
 */
function displayRecommendations(searchedMovie, recommendations) {
  clearStatusRegion();

  selectionTitle.textContent = `Because You Watched ${searchedMovie}`;
  screenLabel.textContent = "Screen 01 · Now Showing";

  featuredEl.innerHTML = "";
  cardGrid.innerHTML = "";

  const [first, ...rest] = recommendations;

  featuredEl.appendChild(createFeaturedFilm(first, 1));

  if (rest.length > 0) {
    rest.forEach((movie, i) => {
      cardGrid.appendChild(createMovieCard(movie, i + 2, i));
    });
    beyondWrap.hidden = false;
  } else {
    beyondWrap.hidden = true;
  }

  resultsWrap.hidden = false;
  animateMatchBars(resultsWrap);
}

// ---------- API ----------

/**
 * Fetches recommendations for a given movie title from the
 * Flask backend and renders the appropriate state.
 */
async function getRecommendations(movieTitle) {
  setLoadingState();

  const url = `${API_BASE_URL}/recommend?movie=${encodeURIComponent(movieTitle)}`;

  let response;
  try {
    response = await fetch(url);
  } catch (networkError) {
    displayError(
      "The Projection Room Is Currently Offline.",
      "Please start the recommendation server and try again."
    );
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    displayError(
      "The Reel Came Back Damaged.",
      "The server sent back something we couldn't read. Please try again."
    );
    return;
  }

  if (response.status === 404) {
    displayError(
      "We Couldn't Find That Film In The Archive.",
      "Double-check the title and try searching again."
    );
    return;
  }

  if (!response.ok) {
    displayError(
      "Something Interrupted Tonight's Screening.",
      data && data.error ? data.error : "Please try again in a moment."
    );
    return;
  }

  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];

  if (recommendations.length === 0) {
    displayError(
      "No Screenings Found For That Film.",
      "Try another title from the archive."
    );
    return;
  }

  displayRecommendations(data.movie || movieTitle, recommendations);
}

// ---------- FORM HANDLING ----------

function handleSearchSubmit(event) {
  event.preventDefault();

  const movieTitle = movieInput.value.trim();

  if (!movieTitle) {
    displayError(
      "Enter A Film To Begin Your Screening.",
      "Type a movie title into the search field above."
    );
    return;
  }

  searchButton.disabled = true;

  getRecommendations(movieTitle).finally(() => {
    searchButton.disabled = false;
  });
}

searchForm.addEventListener("submit", handleSearchSubmit);

// Initialize with the empty state on load.
showEmptyState();