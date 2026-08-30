/* ===================================================================
   MIDNIGHT CINEMA — SCRIPT.JS (V3)
   Consumes the Flask backend's TMDB-enriched /recommend response.
   The browser talks ONLY to Flask — never to TMDB directly, and the
   TMDB token never appears anywhere in this file.

   API fields consumed per recommendation:
     movie_id, title, release_year, rating, popularity, similarity_score,
     poster_url, backdrop_url, overview, release_date, runtime, genres,
     trailer { name, key, url } | null
   =================================================================== */

const API_BASE_URL = "http://127.0.0.1:5000";

// A very small allowlist check for the YouTube video IDs the backend
// produces. We only ever build embed URLs from keys matching this.
const YOUTUBE_KEY_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

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

const trailerModal = document.getElementById("trailerModal");
const trailerOverlay = document.getElementById("trailerOverlay");
const trailerCloseBtn = document.getElementById("trailerCloseBtn");
const trailerFrame = document.getElementById("trailerFrame");
const trailerModalTitle = document.getElementById("trailerModalTitle");

const heroPanel = document.getElementById("heroPanel");
const heroPanelBackdrop = document.getElementById("heroPanelBackdrop");
const heroPanelContent = document.getElementById("heroPanelContent");

const searchSuggestions = document.getElementById("searchSuggestions");

const watchlistRegion = document.getElementById("watchlistRegion");

// ---------- LANDING / AUTH DOM REFERENCES ----------
const landingView = document.getElementById("landingView");
const appView = document.getElementById("appView");
const enterCinemaBtn = document.getElementById("enterCinemaBtn");
const createAccountBtn = document.getElementById("createAccountBtn");
const landingWelcomeBack = document.getElementById("landingWelcomeBack");

const navLoginBtn = document.getElementById("navLoginBtn");
const navLogoutBtn = document.getElementById("navLogoutBtn");
const navUserLabel = document.getElementById("navUserLabel");

const authModal = document.getElementById("authModal");
const authModalOverlay = document.getElementById("authModalOverlay");
const authModalClose = document.getElementById("authModalClose");

const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");

const loginForm = document.getElementById("loginForm");
const loginIdentifier = document.getElementById("loginIdentifier");
const loginPassword = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");

const registerForm = document.getElementById("registerForm");
const registerUsername = document.getElementById("registerUsername");
const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");
const registerConfirmPassword = document.getElementById("registerConfirmPassword");
const registerMessage = document.getElementById("registerMessage");
const registerSubmitBtn = document.getElementById("registerSubmitBtn");

const switchToRegister = document.getElementById("switchToRegister");
const switchToLogin = document.getElementById("switchToLogin");

let lastFocusedBeforeAuthModal = null;

// Holds the current recommendation set so a card can be promoted to
// "featured" client-side, without another network request.
let currentRecommendations = [];
let currentSearchedMovie = "";
let lastFocusedBeforeModal = null;

// ---------- AUTHENTICATION STATE ----------
// The backend session is always the source of truth for whether
// someone is logged in — this is just a client-side mirror of it,
// refreshed via checkAuth() / after login / register / logout.
let authState = { authenticated: false, user: null };

// Client-side cache of the current user's watchlist, populated from
// GET /api/watchlist. The database is the source of truth; this
// cache just avoids a network round trip on every render.
let watchlistCache = [];
let watchlistLoaded = false;

// Default (pre-search) hero panel markup, restored by resetHeroPanel().
const HERO_PANEL_DEFAULT_MARKUP = `
  <span class="atmos-panel__eyebrow">Screen 01</span>
  <span class="atmos-panel__title">Now<br>Showing</span>
  <span class="atmos-panel__footer">The Personal Film Archive</span>
`;

// ---------- MOBILE NAV ----------
function closeMobileNav() {
  if (!navLinks.classList.contains("is-open")) return;
  navLinks.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
}

navToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

// Close the mobile menu when tapping/clicking outside the navbar.
document.addEventListener("click", (event) => {
  if (!navLinks.classList.contains("is-open")) return;
  if (navbar.contains(event.target)) return;
  closeMobileNav();
});

// ---------- NAVIGATION (HOME / DISCOVER / WATCHLIST) ----------

/**
 * Sets the active state on every nav link (header + footer) whose
 * data-nav-link matches the given key ("home" | "discover" | "watchlist").
 */
function setActiveNav(key) {
  document.querySelectorAll("[data-nav-link]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.navLink === key);
  });
}

// Clicking any nav link (header or footer) closes the mobile menu and
// optimistically marks it active; scroll-spy below keeps it in sync
// as the user continues scrolling.
document.querySelectorAll("[data-nav-link]").forEach((link) => {
  link.addEventListener("click", () => {
    setActiveNav(link.dataset.navLink);
    closeMobileNav();
  });
});

// Scroll-spy: highlights HOME / DISCOVER / WATCHLIST as their sections
// cross the middle of the viewport.
(function initScrollSpy() {
  const spyTargets = [
    { id: "hero", key: "home" },
    { id: "selection", key: "discover" },
    { id: "watchlist", key: "watchlist" }
  ]
    .map((entry) => ({ ...entry, el: document.getElementById(entry.id) }))
    .filter((entry) => entry.el);

  if (!("IntersectionObserver" in window) || spyTargets.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const match = spyTargets.find((target) => target.el === entry.target);
        if (match) setActiveNav(match.key);
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
  );

  spyTargets.forEach((target) => observer.observe(target.el));
})();

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

// ---------- API HELPER ----------

/**
 * Shared fetch wrapper for every call to the Flask backend.
 * `credentials: "include"` is what lets the browser send/receive the
 * signed session cookie Flask issues on login — without it the
 * backend would never recognize an authenticated request.
 */
async function apiFetch(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
  } catch (networkError) {
    return { ok: false, status: 0, data: null, networkError: true };
  }

  let data = null;
  try {
    data = await response.json();
  } catch (parseError) {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
}

// ---------- LANDING / APP VIEW SWITCHING ----------

function showLandingView() {
  if (landingView) landingView.hidden = false;
  if (appView) appView.hidden = true;
  document.body.classList.remove("is-in-cinema");
}

function showAppView() {
  if (landingView) landingView.hidden = true;
  if (appView) appView.hidden = false;
  document.body.classList.add("is-in-cinema");
}

// ---------- AUTH-AWARE UI ----------

/**
 * Reflects the current authState across the nav (Login/Logout,
 * "Welcome back") and the landing page's entry buttons. Never
 * touches the Watchlist section directly — renderWatchlist() owns
 * that and is called separately wherever authState changes.
 */
function updateAuthUI() {
  const isAuthed = authState.authenticated;
  const name = isAuthed && authState.user ? authState.user.name : "";

  if (navLoginBtn) navLoginBtn.hidden = isAuthed;
  if (navLogoutBtn) navLogoutBtn.hidden = !isAuthed;

  if (navUserLabel) {
    navUserLabel.hidden = !isAuthed;
    navUserLabel.textContent = isAuthed ? `Welcome back, ${name}.` : "";
  }

  if (landingWelcomeBack) {
    landingWelcomeBack.hidden = !isAuthed;
    landingWelcomeBack.textContent = isAuthed ? `Welcome back, ${name}.` : "";
  }
}

/**
 * Confirms the current session with the backend. The frontend never
 * assumes authentication from anything stored locally — this is the
 * only source of truth for whether the visitor is signed in.
 */
async function checkAuth() {
  const { ok, data } = await apiFetch("/api/auth/me");

  authState = ok && data && data.authenticated
    ? { authenticated: true, user: data.user }
    : { authenticated: false, user: null };

  updateAuthUI();
  return authState;
}

async function loginUser(identifier, password) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password })
  });
}

async function registerUser(username, email, password, confirmPassword) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      email,
      password,
      confirm_password: confirmPassword
    })
  });
}

async function logoutUser() {
  await apiFetch("/api/auth/logout", { method: "POST" });

  authState = { authenticated: false, user: null };
  watchlistCache = [];

  updateAuthUI();
  renderWatchlist();
  closeMobileNav();
  showLandingView();
}

// ---------- AUTH MODAL ----------

function clearAuthMessages() {
  if (loginMessage) {
    loginMessage.hidden = true;
    loginMessage.textContent = "";
  }
  if (registerMessage) {
    registerMessage.hidden = true;
    registerMessage.textContent = "";
  }
}

function showAuthMessage(panel, text) {
  const el = panel === "register" ? registerMessage : loginMessage;
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

/**
 * Opens the auth modal to either the login or register panel.
 * `leadText`, when given, is shown as a short line above the form —
 * used for the "your archive is waiting" prompt when an unauthenticated
 * visitor tries to save a film.
 */
function openAuthModal(panel, leadText) {
  if (!authModal) return;

  lastFocusedBeforeAuthModal = document.activeElement;
  clearAuthMessages();

  const authModalLead = document.getElementById("authModalLead");
  if (authModalLead) {
    authModalLead.textContent = leadText || "";
    authModalLead.hidden = !leadText;
  }

  switchAuthPanel(panel);

  authModal.hidden = false;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", handleAuthModalKeydown);

  const firstInput = panel === "register" ? registerUsername : loginIdentifier;
  if (firstInput) firstInput.focus();
}

function closeAuthModal() {
  authModal.hidden = true;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", handleAuthModalKeydown);

  if (lastFocusedBeforeAuthModal && typeof lastFocusedBeforeAuthModal.focus === "function") {
    lastFocusedBeforeAuthModal.focus();
  }
}

function switchAuthPanel(panel) {
  clearAuthMessages();

  const showRegister = panel === "register";
  if (loginPanel) loginPanel.hidden = showRegister;
  if (registerPanel) registerPanel.hidden = !showRegister;

  const firstInput = showRegister ? registerUsername : loginIdentifier;
  if (firstInput) firstInput.focus();
}

function handleAuthModalKeydown(event) {
  if (event.key === "Escape") closeAuthModal();
}

if (authModalClose) authModalClose.addEventListener("click", closeAuthModal);
if (authModalOverlay) authModalOverlay.addEventListener("click", closeAuthModal);
if (switchToRegister) switchToRegister.addEventListener("click", () => switchAuthPanel("register"));
if (switchToLogin) switchToLogin.addEventListener("click", () => switchAuthPanel("login"));

if (navLoginBtn) navLoginBtn.addEventListener("click", () => openAuthModal("login"));
if (navLogoutBtn) navLogoutBtn.addEventListener("click", () => logoutUser());

if (enterCinemaBtn) {
  enterCinemaBtn.addEventListener("click", () => {
    if (authState.authenticated) {
      showAppView();
    } else {
      openAuthModal("login");
    }
  });
}

if (createAccountBtn) {
  createAccountBtn.addEventListener("click", () => openAuthModal("register"));
}

// ---------- AUTH FORMS ----------

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAuthMessages();

    const identifier = loginIdentifier.value.trim();
    const password = loginPassword.value;

    if (!identifier || !password) {
      showAuthMessage("login", "The archive couldn't verify those credentials.");
      return;
    }

    loginSubmitBtn.disabled = true;

    const { ok, data } = await loginUser(identifier, password);

    loginSubmitBtn.disabled = false;

    if (!ok || !data || !data.authenticated) {
      showAuthMessage("login", (data && data.error) || "The archive couldn't verify those credentials.");
      return;
    }

    authState = { authenticated: true, user: data.user };
    loginForm.reset();
    closeAuthModal();
    updateAuthUI();
    showAppView();
    await loadWatchlist();
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAuthMessages();

    const username = registerUsername.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value;
    const confirmPassword = registerConfirmPassword.value;

    if (!username || !email || !password || !confirmPassword) {
      showAuthMessage("register", "Every field is required to join the archive.");
      return;
    }

    if (password !== confirmPassword) {
      showAuthMessage("register", "The passwords don't match.");
      return;
    }

    registerSubmitBtn.disabled = true;

    const { ok, data } = await registerUser(username, email, password, confirmPassword);

    registerSubmitBtn.disabled = false;

    if (!ok || !data || !data.authenticated) {
      showAuthMessage("register", (data && data.error) || "Please enter a valid email.");
      return;
    }

    authState = { authenticated: true, user: data.user };
    registerForm.reset();
    closeAuthModal();
    updateAuthUI();
    showAppView();
    await loadWatchlist();
  });
}

// ---------- UTILITIES ----------

/**
 * Escapes HTML-sensitive characters for safe insertion as TEXT
 * content inside a template literal that becomes innerHTML.
 */
function escapeHTML(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

/**
 * Converts a similarity_score (0–1) into a rounded percentage.
 * This is the ML recommender's match score — never the TMDB rating.
 */
function toMatchPercent(similarityScore) {
  const percent = Math.round(Number(similarityScore) * 100);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
}

/**
 * Formats the TMDB rating cleanly, e.g. 8.5.
 */
function formatRating(rating) {
  const num = Number(rating);
  return Number.isFinite(num) && num > 0 ? num.toFixed(1) : null;
}

function formatYear(year) {
  if (year === null || year === undefined || year === "") return null;
  const num = Number(year);
  return Number.isFinite(num) ? String(Math.trunc(num)) : String(year);
}

/**
 * Formats an ISO release_date ("2014-11-05") as "05 NOV 2014"
 * without letting timezone parsing shift the day. Falls back to
 * release_year, then null.
 */
function formatReleaseDate(releaseDate, releaseYear) {
  if (typeof releaseDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(releaseDate)) {
    const [y, m, d] = releaseDate.slice(0, 10).split("-").map(Number);
    const months = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
    ];
    if (y && m >= 1 && m <= 12 && d) {
      return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
    }
  }
  return formatYear(releaseYear);
}

/**
 * Converts a runtime in minutes into "2H 49M". Returns null for
 * missing/invalid/zero values so the caller can hide the chip.
 */
function formatRuntime(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return null;

  const hours = Math.floor(total / 60);
  const mins = Math.round(total % 60);

  if (hours <= 0) return `${mins}M`;
  return `${hours}H ${String(mins).padStart(2, "0")}M`;
}

/**
 * Validates a TMDB video key looks like a YouTube video ID before
 * it's ever used to build an embed URL.
 */
function isValidYouTubeKey(key) {
  return typeof key === "string" && YOUTUBE_KEY_PATTERN.test(key);
}

// ---------- RENDERING: STATE SCREENS ----------

function clearStatusRegion() {
  statusRegion.innerHTML = "";
}

function showEmptyState() {
  clearStatusRegion();
  statusRegion.appendChild(emptyState);
  resultsWrap.hidden = true;
  resetHeroPanel();
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

// ---------- IMAGE HELPERS ----------

/**
 * Wires up a lazily-loaded <img> against a poster/backdrop URL.
 * On success it fades the image in over the typographic fallback
 * that's already in the DOM; on failure (or missing URL) the
 * fallback simply stays visible. Never leaves a broken-image icon.
 */
function attachImage({ container, url, alt, sizeAttr }) {
  if (!url) return;

  const img = document.createElement("img");
  img.className =
    sizeAttr === "backdrop"
      ? "featured__backdrop-img"
      : sizeAttr === "hero"
      ? "atmos-panel__backdrop-img"
      : "poster-frame__img";
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";

  img.addEventListener("load", () => {
    container.classList.add("has-image");
  });

  img.addEventListener("error", () => {
    img.remove();
  });

  img.src = url;
  container.appendChild(img);
}

// ---------- HERO PANEL (dynamic "miniature cinema screen") ----------

/**
 * Restores the hero-side panel to its atmospheric, pre-search state.
 */
function resetHeroPanel() {
  if (!heroPanel) return;

  heroPanel.classList.remove("has-movie");
  heroPanelBackdrop.classList.remove("has-image");
  heroPanelBackdrop.innerHTML = "";
  heroPanelContent.innerHTML = HERO_PANEL_DEFAULT_MARKUP;
}

/**
 * Builds up to 2 small genre tags for the compact hero panel.
 */
function buildHeroPanelGenresMarkup(genres) {
  if (!Array.isArray(genres) || genres.length === 0) return "";

  const tags = genres
    .filter((g) => typeof g === "string" && g.trim().length > 0)
    .slice(0, 2)
    .map((g) => `<span class="genre-tag genre-tag--sm">${escapeHTML(g)}</span>`)
    .join("");

  return tags ? `<div class="atmos-panel__genres">${tags}</div>` : "";
}

/**
 * Updates the hero-side panel with the currently featured movie's real
 * data. Uses the backdrop when available, falling back to the poster,
 * and finally to the existing typographic panel if neither loads.
 */
function renderHeroPanel(movie) {
  if (!heroPanel) return;

  heroPanel.classList.add("has-movie");

  const matchPercent = toMatchPercent(movie.similarity_score);
  const hasMatch = movie.similarity_score !== undefined && movie.similarity_score !== null;
  const metaParts = [
    formatYear(movie.release_year),
    formatRating(movie.rating) ? `&#9733; ${escapeHTML(formatRating(movie.rating))}` : null
  ].filter(Boolean);

  heroPanelContent.innerHTML = `
    <div class="atmos-panel__top">
      <span class="atmos-panel__eyebrow">Screen 01 &middot; Now Showing</span>
      ${hasMatch ? `<span class="atmos-panel__match-badge">${matchPercent}% Match</span>` : ""}
    </div>
    <div class="atmos-panel__bottom">
      <span class="atmos-panel__movie-title">${escapeHTML(movie.title)}</span>
      ${metaParts.length ? `<span class="atmos-panel__movie-meta">${metaParts.join(" &middot; ")}</span>` : ""}
      ${buildHeroPanelGenresMarkup(movie.genres)}
    </div>
  `;

  heroPanelBackdrop.innerHTML = "";
  heroPanelBackdrop.classList.remove("has-image");
  attachImage({
    container: heroPanelBackdrop,
    url: movie.backdrop_url || movie.poster_url,
    alt: "",
    sizeAttr: "hero"
  });
}

// ---------- RENDERING: SHARED PIECES ----------

function buildPosterFallbackMarkup(title, filmNo) {
  return `
    <div class="poster-frame__fallback">
      <span class="poster__eyebrow">Midnight Cinema</span>
      <span class="poster__title">${escapeHTML(title)}</span>
      <div class="poster__footer">
        <span>Film No. ${escapeHTML(filmNo)}</span>
        <span>Archive</span>
      </div>
    </div>
  `;
}

function buildGenreTagsMarkup(genres) {
  if (!Array.isArray(genres) || genres.length === 0) return "";

  const tags = genres
    .filter((g) => typeof g === "string" && g.trim().length > 0)
    .map((g) => `<span class="genre-tag">${escapeHTML(g)}</span>`)
    .join("");

  return tags ? `<div class="genre-tags">${tags}</div>` : "";
}

function buildOverviewMarkup(overview) {
  const trimmed = typeof overview === "string" ? overview.trim() : "";

  if (!trimmed) {
    return `
      <div class="overview">
        <p class="overview__label">About the Film</p>
        <p class="overview__text overview__text--empty">No synopsis available in the archive.</p>
      </div>
    `;
  }

  return `
    <div class="overview">
      <p class="overview__label">About the Film</p>
      <p class="overview__text">${escapeHTML(trimmed)}</p>
    </div>
  `;
}

function buildMetaLineMarkup(movie) {
  const parts = [];

  const dateLabel = formatReleaseDate(movie.release_date, movie.release_year);
  if (dateLabel) parts.push(`<span>${escapeHTML(dateLabel)}</span>`);

  const ratingLabel = formatRating(movie.rating);
  if (ratingLabel) parts.push(`<span class="rating">&#9733; ${escapeHTML(ratingLabel)}</span>`);

  const runtimeLabel = formatRuntime(movie.runtime);
  if (runtimeLabel) parts.push(`<span class="runtime-chip">${escapeHTML(runtimeLabel)}</span>`);

  return parts.join("");
}

function buildTrailerTriggerMarkup(trailer) {
  if (!trailer || !isValidYouTubeKey(trailer.key)) return "";

  return `
    <button type="button" class="trailer-trigger" data-role="trailer-trigger">
      <span class="trailer-trigger__icon">&#9654;</span>
      <span>Watch Trailer</span>
    </button>
  `;
}

/**
 * Builds the "Add to Watchlist" / "In Watchlist" toggle button used on
 * the featured screening. data-watchlist-id lets updateWatchlistButtons()
 * find and refresh this exact button (and any others for the same film)
 * after an add/remove.
 */
function buildWatchlistTriggerMarkup(movie) {
  const active = isInWatchlist(movie.movie_id);

  return `
    <button
      type="button"
      class="watchlist-trigger${active ? " is-active" : ""}"
      data-role="watchlist-trigger"
      data-watchlist-id="${movie.movie_id}"
      aria-pressed="${active}"
    >
      <span class="watchlist-trigger__icon" data-watchlist-icon>${active ? "&#10003;" : "&#43;"}</span>
      <span data-watchlist-label>${active ? "In Watchlist" : "Add to Watchlist"}</span>
    </button>
  `;
}

// ---------- RENDERING: FEATURED FILM ----------

/**
 * Builds "Tonight's Screening" — the visual centerpiece — using the
 * movie's real TMDB backdrop and poster where available, and a
 * Midnight Cinema fallback where they aren't.
 */
function renderFeaturedMovie(movie, filmNumber) {
  const matchPercent = toMatchPercent(movie.similarity_score);
  const title = escapeHTML(movie.title);
  const filmNo = String(filmNumber).padStart(4, "0");

  featuredEl.innerHTML = `
    <div class="featured__backdrop" id="featuredBackdrop">
      <div class="featured__backdrop-scrim"></div>
    </div>

    <div class="featured__poster poster-frame" id="featuredPosterFrame">
      ${buildPosterFallbackMarkup(movie.title, filmNo)}
    </div>

    <div class="featured__info">
      <p class="featured__label">Tonight's Screening</p>
      <h3 class="featured__title">${title}</h3>

      <div class="featured__meta">
        ${buildMetaLineMarkup(movie)}
      </div>

      ${buildGenreTagsMarkup(movie.genres)}

      <div class="match">
        <div class="match__number">${matchPercent}<span>Match</span></div>
        <div class="match__bar">
          <div class="match__bar-fill" data-fill="${matchPercent}"></div>
        </div>
      </div>

      ${buildOverviewMarkup(movie.overview)}

      <div class="featured__actions">
        ${buildTrailerTriggerMarkup(movie.trailer)}
        ${buildWatchlistTriggerMarkup(movie)}
      </div>
    </div>
  `;

  // Wire up the real backdrop / poster images (fallbacks already rendered).
  const backdropContainer = featuredEl.querySelector("#featuredBackdrop");
  attachImage({
    container: backdropContainer,
    url: movie.backdrop_url,
    alt: "",
    sizeAttr: "backdrop"
  });

  const posterContainer = featuredEl.querySelector("#featuredPosterFrame");
  attachImage({
    container: posterContainer,
    url: movie.poster_url,
    alt: `${movie.title} poster`,
    sizeAttr: "poster"
  });

  // Trailer trigger, if present.
  const trailerBtn = featuredEl.querySelector('[data-role="trailer-trigger"]');
  if (trailerBtn) {
    trailerBtn.addEventListener("click", () => openTrailerModal(movie.trailer, movie.title));
  }

  // Watchlist toggle.
  const watchlistBtn = featuredEl.querySelector('[data-role="watchlist-trigger"]');
  if (watchlistBtn) {
    watchlistBtn.addEventListener("click", () => toggleWatchlist(movie));
  }

  // Keep the hero-side "miniature cinema screen" in sync with whatever
  // is currently featured.
  renderHeroPanel(movie);
}

// ---------- RENDERING: MOVIE CARDS ----------

/**
 * Builds a smaller programme-style card using the real TMDB poster
 * where available. Clicking a card promotes it to the featured
 * screening without a new network request.
 */
function createMovieCard(movie, filmNumber, index) {
  const matchPercent = toMatchPercent(movie.similarity_score);
  const title = escapeHTML(movie.title);
  const year = escapeHTML(formatYear(movie.release_year) || "—");
  const ratingLabel = formatRating(movie.rating);
  const filmNo = String(filmNumber).padStart(4, "0");

  const card = document.createElement("article");
  card.className = "movie-card";
  card.style.animationDelay = `${index * 70}ms`;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View ${movie.title} as tonight's screening`);

  const hasTrailer = movie.trailer && isValidYouTubeKey(movie.trailer.key);
  const inWatchlist = isInWatchlist(movie.movie_id);

  card.innerHTML = `
    <div class="movie-card__poster poster-frame">
      ${buildPosterFallbackMarkup(movie.title, filmNo)}
      <div class="movie-card__overlay"><span>View Film</span></div>
    </div>
    <div class="movie-card__body">
      <h4 class="movie-card__title">${title}</h4>
      <div class="movie-card__meta">
        <span>${year}</span>
        ${ratingLabel ? `<span class="rating">&#9733; ${escapeHTML(ratingLabel)}</span>` : "<span></span>"}
      </div>
      <div class="movie-card__match">
        <div class="movie-card__match-bar">
          <div class="movie-card__match-fill" data-fill="${matchPercent}"></div>
        </div>
        <span class="movie-card__match-value">${matchPercent}%</span>
      </div>
      <div class="movie-card__actions">
        ${hasTrailer ? `<button type="button" class="card-action-btn card-action-btn--trailer" data-role="card-trailer">Trailer</button>` : ""}
        <button
          type="button"
          class="card-action-btn card-action-btn--watchlist${inWatchlist ? " is-active" : ""}"
          data-role="card-watchlist"
          data-watchlist-id="${movie.movie_id}"
          aria-pressed="${inWatchlist}"
        >
          <span data-watchlist-label>${inWatchlist ? "In Watchlist" : "Add to Watchlist"}</span>
        </button>
      </div>
    </div>
  `;

  const posterContainer = card.querySelector(".poster-frame");
  attachImage({
    container: posterContainer,
    url: movie.poster_url,
    alt: `${movie.title} poster`,
    sizeAttr: "poster"
  });

  const promote = () => promoteToFeatured(movie.movie_id);
  card.addEventListener("click", promote);
  card.addEventListener("keydown", (event) => {
    // Ignore keydowns that bubbled up from the nested trailer/watchlist
    // buttons — those already handle their own activation.
    if (event.target !== card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      promote();
    }
  });

  // Per-card trailer trigger. stopPropagation keeps this from also
  // promoting the card into the featured slot.
  const trailerBtn = card.querySelector('[data-role="card-trailer"]');
  if (trailerBtn) {
    trailerBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openTrailerModal(movie.trailer, movie.title);
    });
  }

  // Per-card watchlist toggle. Same stopPropagation requirement.
  const watchlistBtn = card.querySelector('[data-role="card-watchlist"]');
  if (watchlistBtn) {
    watchlistBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleWatchlist(movie);
    });
  }

  return card;
}

// ---------- WATCHLIST (database-backed, per user) ----------
//
// The database is the source of truth. watchlistCache is just a
// client-side mirror of GET /api/watchlist so isInWatchlist() and
// the various render functions can stay synchronous. It's loaded
// fresh on login and cleared on logout.

function isInWatchlist(movieId) {
  return watchlistCache.some((entry) => entry.movie_id === movieId);
}

/**
 * Picks out only the fields the backend watchlist API expects,
 * mirroring the WatchlistItem model in database.py.
 */
function toWatchlistEntry(movie) {
  return {
    movie_id: movie.movie_id,
    title: movie.title,
    poster_url: movie.poster_url ?? null,
    backdrop_url: movie.backdrop_url ?? null,
    release_year: movie.release_year ?? null,
    rating: movie.rating ?? null,
    similarity_score: movie.similarity_score ?? null,
    overview: movie.overview ?? null,
    release_date: movie.release_date ?? null,
    runtime: movie.runtime ?? null,
    genres: Array.isArray(movie.genres) ? movie.genres : [],
    trailer: movie.trailer ?? null
  };
}

/**
 * Loads the authenticated user's watchlist from the backend into
 * watchlistCache and re-renders the Watchlist section. Called after
 * checkAuth() confirms a session, and after login/register.
 */
async function loadWatchlist() {
  if (!authState.authenticated) {
    watchlistCache = [];
    watchlistLoaded = true;
    renderWatchlist();
    return;
  }

  const { ok, data } = await apiFetch("/api/watchlist");

  watchlistCache = ok && data && Array.isArray(data.watchlist) ? data.watchlist : [];
  watchlistLoaded = true;

  renderWatchlist();
  updateWatchlistButtons();
}

/**
 * Adds a film to the authenticated user's watchlist. Updates the
 * local cache optimistically so the UI feels instant, then confirms
 * against the backend and rolls back on failure. If the visitor
 * isn't signed in, this opens the sign-in prompt instead of
 * fabricating local-only state.
 */
async function addToWatchlist(movie) {
  if (!authState.authenticated) {
    openAuthModal("login", "Your archive is waiting. Sign in to keep your screenings.");
    return;
  }

  if (isInWatchlist(movie.movie_id)) return;

  watchlistCache.unshift(toWatchlistEntry(movie));
  updateWatchlistButtons();
  renderWatchlist();

  const { ok } = await apiFetch("/api/watchlist", {
    method: "POST",
    body: JSON.stringify(toWatchlistEntry(movie))
  });

  if (!ok) {
    watchlistCache = watchlistCache.filter((entry) => entry.movie_id !== movie.movie_id);
    updateWatchlistButtons();
    renderWatchlist();
  }
}

/**
 * Removes a film from the authenticated user's watchlist, optimistically
 * updating the UI and rolling back if the backend call fails.
 */
async function removeFromWatchlist(movieId) {
  if (!authState.authenticated) return;

  const previous = watchlistCache;
  watchlistCache = watchlistCache.filter((entry) => entry.movie_id !== movieId);
  updateWatchlistButtons();
  renderWatchlist();

  const { ok } = await apiFetch(`/api/watchlist/${movieId}`, { method: "DELETE" });

  if (!ok) {
    watchlistCache = previous;
    updateWatchlistButtons();
    renderWatchlist();
  }
}

function toggleWatchlist(movie) {
  if (isInWatchlist(movie.movie_id)) {
    removeFromWatchlist(movie.movie_id);
  } else {
    addToWatchlist(movie);
  }
}

/**
 * Refreshes every rendered watchlist toggle button (featured screening
 * + any recommendation cards currently in the DOM) to reflect the
 * latest saved state — no re-fetch or full re-render required.
 */
function updateWatchlistButtons() {
  document.querySelectorAll("[data-watchlist-id]").forEach((btn) => {
    const movieId = Number(btn.dataset.watchlistId);
    const active = isInWatchlist(movieId);

    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));

    const label = btn.querySelector("[data-watchlist-label]");
    if (label) label.textContent = active ? "In Watchlist" : "Add to Watchlist";

    const icon = btn.querySelector("[data-watchlist-icon]");
    if (icon) icon.innerHTML = active ? "&#10003;" : "&#43;";
  });
}

/**
 * Cinematic empty state for the Watchlist section — deliberately not
 * the generic "No movies found." copy.
 */
function buildWatchlistEmptyStateMarkup() {
  return `
    <div class="empty-state">
      <p class="empty-state__label">Screen 02 &middot; Your Archive</p>
      <p class="empty-state__title">Your screening list is empty.</p>
      <p class="empty-state__copy">Save a film and it will wait here for you.</p>
    </div>
  `;
}

/**
 * Shown in place of the Watchlist when a logged-out visitor reaches
 * it. Never renders another user's data — there's simply no data to
 * show until the visitor signs in.
 */
function buildWatchlistAuthPromptMarkup() {
  return `
    <div class="empty-state">
      <p class="empty-state__label">Screen 02 &middot; Your Archive</p>
      <p class="empty-state__title">Your archive is waiting.</p>
      <p class="empty-state__copy">Sign in to keep your screenings.</p>
      <div class="empty-state__actions">
        <button type="button" class="landing__btn landing__btn--primary landing__btn--sm" data-role="watchlist-signin">Sign In</button>
        <button type="button" class="landing__btn landing__btn--ghost landing__btn--sm" data-role="watchlist-create-account">Create Account</button>
      </div>
    </div>
  `;
}

/**
 * Builds a saved-film card for the Watchlist section. Reuses the same
 * movie-card visual language as the recommendation grid. Selecting the
 * card views it as the featured screening; the Remove action deletes
 * it from the Watchlist without affecting card-promotion behavior.
 */
function createWatchlistCard(movie, filmNumber) {
  const hasMatch = movie.similarity_score !== undefined && movie.similarity_score !== null;
  const matchPercent = hasMatch ? toMatchPercent(movie.similarity_score) : null;
  const title = escapeHTML(movie.title);
  const year = escapeHTML(formatYear(movie.release_year) || "—");
  const ratingLabel = formatRating(movie.rating);
  const filmNo = String(filmNumber).padStart(4, "0");
  const hasTrailer = movie.trailer && isValidYouTubeKey(movie.trailer.key);

  const card = document.createElement("article");
  card.className = "movie-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `View ${movie.title}`);

  card.innerHTML = `
    <div class="movie-card__poster poster-frame">
      ${buildPosterFallbackMarkup(movie.title, filmNo)}
      <div class="movie-card__overlay"><span>View Film</span></div>
    </div>
    <div class="movie-card__body">
      <h4 class="movie-card__title">${title}</h4>
      <div class="movie-card__meta">
        <span>${year}</span>
        ${ratingLabel ? `<span class="rating">&#9733; ${escapeHTML(ratingLabel)}</span>` : "<span></span>"}
      </div>
      ${
        hasMatch
          ? `<div class="movie-card__match">
              <div class="movie-card__match-bar">
                <div class="movie-card__match-fill" data-fill="${matchPercent}"></div>
              </div>
              <span class="movie-card__match-value">${matchPercent}%</span>
            </div>`
          : ""
      }
      <div class="movie-card__actions">
        ${hasTrailer ? `<button type="button" class="card-action-btn card-action-btn--trailer" data-role="card-trailer">Trailer</button>` : ""}
        <button type="button" class="card-action-btn card-action-btn--remove" data-role="watchlist-remove">Remove</button>
      </div>
    </div>
  `;

  const posterContainer = card.querySelector(".poster-frame");
  attachImage({
    container: posterContainer,
    url: movie.poster_url,
    alt: `${movie.title} poster`,
    sizeAttr: "poster"
  });

  const view = () => viewWatchlistMovie(movie);
  card.addEventListener("click", view);
  card.addEventListener("keydown", (event) => {
    if (event.target !== card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      view();
    }
  });

  const trailerBtn = card.querySelector('[data-role="card-trailer"]');
  if (trailerBtn) {
    trailerBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openTrailerModal(movie.trailer, movie.title);
    });
  }

  const removeBtn = card.querySelector('[data-role="watchlist-remove"]');
  removeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    removeFromWatchlist(movie.movie_id);
  });

  return card;
}

/**
 * Rebuilds the entire Watchlist section: a sign-in prompt when
 * logged out, an elegant empty state when logged in with nothing
 * saved yet, or a card grid of every saved film — always sourced
 * from watchlistCache, never from localStorage.
 */
function renderWatchlist() {
  watchlistRegion.innerHTML = "";

  if (!authState.authenticated) {
    watchlistRegion.innerHTML = buildWatchlistAuthPromptMarkup();

    const signInBtn = watchlistRegion.querySelector('[data-role="watchlist-signin"]');
    if (signInBtn) signInBtn.addEventListener("click", () => openAuthModal("login"));

    const createAccountBtn = watchlistRegion.querySelector('[data-role="watchlist-create-account"]');
    if (createAccountBtn) createAccountBtn.addEventListener("click", () => openAuthModal("register"));

    return;
  }

  if (watchlistCache.length === 0) {
    watchlistRegion.innerHTML = buildWatchlistEmptyStateMarkup();
    return;
  }

  const grid = document.createElement("div");
  grid.className = "card-grid";
  watchlistCache.forEach((movie, i) => grid.appendChild(createWatchlistCard(movie, i + 1)));
  watchlistRegion.appendChild(grid);
  animateMatchBars(watchlistRegion);
}

/**
 * Selecting a saved film from the Watchlist views it the same way a
 * search result would: as the featured screening (with the hero panel
 * and watchlist state updating too), reusing the existing rendering
 * pipeline rather than duplicating it.
 */
function viewWatchlistMovie(movie) {
  displayRecommendations(movie.title, [movie], "From Your Watchlist");

  const selectionEl = document.getElementById("selection");
  if (selectionEl) {
    selectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
 * by the remaining results as a card grid. An optional custom title
 * lets callers other than search (e.g. the Watchlist) reuse this same
 * pipeline without the "Because You Watched" search-specific phrasing.
 */
function displayRecommendations(searchedMovie, recommendations, titleOverride) {
  clearStatusRegion();

  currentRecommendations = recommendations;
  currentSearchedMovie = searchedMovie;

  selectionTitle.textContent = titleOverride || `Because You Watched ${searchedMovie}`;
  screenLabel.textContent = "Screen 01 · Now Showing";

  renderResultsFromState();
  resultsWrap.hidden = false;
  animateMatchBars(resultsWrap);
}

/**
 * Rebuilds the featured section + card grid from currentRecommendations,
 * where index 0 is always treated as the featured screening.
 */
function renderResultsFromState() {
  cardGrid.innerHTML = "";

  const [first, ...rest] = currentRecommendations;
  renderFeaturedMovie(first, 1);

  if (rest.length > 0) {
    rest.forEach((movie, i) => {
      cardGrid.appendChild(createMovieCard(movie, i + 2, i));
    });
    beyondWrap.hidden = false;
  } else {
    beyondWrap.hidden = true;
  }

  animateMatchBars(resultsWrap);
}

/**
 * Promotes a recommendation (by movie_id) to the featured slot and
 * moves the previous featured film back into the card grid. No
 * network request — this is a client-side reorder of data we
 * already have.
 */
function promoteToFeatured(movieId) {
  const index = currentRecommendations.findIndex((m) => m.movie_id === movieId);
  if (index <= 0) return;

  const [selected] = currentRecommendations.splice(index, 1);
  currentRecommendations.unshift(selected);

  renderResultsFromState();

  const selectionEl = document.getElementById("selection");
  if (selectionEl) {
    selectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ---------- TRAILER MODAL ----------

function openTrailerModal(trailer, title) {
  if (!trailer || !isValidYouTubeKey(trailer.key)) return;

  lastFocusedBeforeModal = document.activeElement;

  trailerModalTitle.textContent = title || "";

  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0`;
  iframe.title = `${title || "Movie"} trailer`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;

  trailerFrame.innerHTML = "";
  trailerFrame.appendChild(iframe);

  trailerModal.hidden = false;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", handleTrailerKeydown);

  trailerCloseBtn.focus();
}

function closeTrailerModal() {
  trailerFrame.innerHTML = ""; // removing the iframe stops playback
  trailerModal.hidden = true;
  document.body.style.overflow = "";
  document.removeEventListener("keydown", handleTrailerKeydown);

  if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
    lastFocusedBeforeModal.focus();
  }
}

function handleTrailerKeydown(event) {
  if (event.key === "Escape") {
    closeTrailerModal();
  }
}

trailerCloseBtn.addEventListener("click", closeTrailerModal);
trailerOverlay.addEventListener("click", closeTrailerModal);

// ---------- API ----------

/**
 * Fetches recommendations for a given movie title from the
 * Flask backend and renders the appropriate state. The backend
 * already enriches each result with TMDB data — the browser never
 * talks to TMDB directly.
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
      "The Screening Could Not Be Loaded.",
      "Please try again."
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
      "The Screening Could Not Be Loaded.",
      (data && data.error) || "Please try again."
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

const suggestionButtons = searchSuggestions
  ? Array.from(searchSuggestions.querySelectorAll(".suggestion-chip"))
  : [];

/**
 * Shared entry point for kicking off a search — used by the form submit
 * handler and every clickable search suggestion, so the loading/disabled
 * state and the actual fetch logic only live in one place.
 */
function runSearch(movieTitle) {
  searchButton.disabled = true;
  suggestionButtons.forEach((btn) => {
    btn.disabled = true;
  });

  getRecommendations(movieTitle).finally(() => {
    searchButton.disabled = false;
    suggestionButtons.forEach((btn) => {
      btn.disabled = false;
    });
  });
}

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

  runSearch(movieTitle);
}

searchForm.addEventListener("submit", handleSearchSubmit);

// Clickable search suggestions: populate the input, then run the exact
// same search flow as a manual submit.
suggestionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const title = btn.dataset.suggestion;
    if (!title) return;
    movieInput.value = title;
    runSearch(title);
  });
});

// ---------- INITIALIZATION ----------

// Initialize with the empty state on load (also resets the hero panel).
showEmptyState();

/**
 * On load: confirm the session with the backend (never assume
 * authentication from anything stored locally), then show the
 * landing page or step straight into the cinema accordingly, and
 * load the watchlist only once we know who — if anyone — is signed in.
 */
(async function initApp() {
  await checkAuth();

  if (authState.authenticated) {
    showAppView();
  } else {
    showLandingView();
  }

  await loadWatchlist();
})();