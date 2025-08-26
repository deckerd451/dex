// Main JavaScript for the Dex static application.
// Orchestrates persona selection, graph rendering, watchlist
// management, alert presentation, Supabase persistence and theme
// toggling. Also draws a starry background inspired by
// CharlestonHacks and exposes interactive connections (synapses).

import { supabaseClient } from './supabaseClient.js';

(async () => {
  /**
   * Initialise the starfield background. Canvas covers the entire
   * page and slowly drifts small white dots downward to simulate
   * a moving star field. Behind all content thanks to CSS.
   */
  function initStarfield() {
    const canvas = document.getElementById('starfield');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    let stars = [];
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      stars = [];
      const count = 200;
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 2 + 0.5,
          speed: Math.random() * 0.1 + 0.05,
          alpha: Math.random() * 0.5 + 0.5
        });
      }
    }
    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
        star.y += star.speed;
        if (star.y > height) {
          star.y = 0;
          star.x = Math.random() * width;
          star.size = Math.random() * 2 + 0.5;
          star.speed = Math.random() * 0.1 + 0.05;
          star.alpha = Math.random() * 0.5 + 0.5;
        }
      }
      requestAnimationFrame(draw);
    }
    resize();
    window.addEventListener('resize', resize);
    draw();
  }

  // Global app data
  const DATA = window.DEX_DATA;
  const ALERTS = window.DEX_ALERTS;

  // Persistent state
  let persona = localStorage.getItem('dex-persona') || null;
  let watchlist = [];
  let notes = {};
  let selectedNode = null;
  let selectedLink = null;

  // Supabase integration
  const usesSupabase = true;
  const supabase = supabaseClient;
  let currentUser = null;

  let communityDataLoaded = false;
  async function loadCommunityData() {
    if (communityDataLoaded) return;
    try {
      const { data, error } = await supabase
        .from('community')
        .select('*');
      if (error) {
        console.error('❌ Failed to load community data:', error.message);
        return;
      }
      if (data && data.length > 0) {
        console.log(`✅ Loaded ${data.length} community members`);
        const newNodes = data.map(row => ({
          id: row.id || ('person-' + Math.random().toString(36).slice(2)),
          name: row.name || row.email || 'Unknown',
          type: 'person',
          category: 'person',
          size: 6 + (typeof row.endorsements === 'number'
                     ? Math.min(row.endorsements, 4) : 0),
          description: row.bio || 'No description provided.',
          website: '',
          image_url: row.image_url || undefined,
          interests: Array.isArray(row.interests)
            ? row.interests.map(s => String(s).toLowerCase())
            : []
        }));
        DATA.nodes.push(...newNodes);
        communityDataLoaded = true;
      } else {
        console.warn('⚠️ Community table returned no rows.');
      }
    } catch (err) {
      console.error('❌ Exception loading community data:', err);
    }
  }

  // DOM elements
  const personaSelectorEl = document.getElementById('persona-selector');
  const personaOptionsEl = document.getElementById('persona-options');
  const dexAppEl = document.getElementById('dex-app');
  const personaBadgeEl = document.getElementById('persona-badge');
  const changePersonaEl = document.getElementById('change-persona');
  const themeToggleEl = document.getElementById('theme-toggle');
  const graphContainerEl = document.getElementById('graph-container');
  const detailsPanelEl = document.getElementById('details-panel');
  const watchlistPanelEl = document.getElementById('watchlist-panel');
  const alertsPanelEl = document.getElementById('alerts-panel');
  const suggestPanelEl = document.getElementById('suggest-panel');
  const instructionsPanelEl = document.getElementById('instructions-panel');
  const authScreenEl = document.getElementById('auth-screen');
  const authFormEl = document.getElementById('auth-form');
  const authEmailEl = document.getElementById('auth-email');
  const authMessageEl = document.getElementById('auth-message');
  const signOutBtn = document.getElementById('sign-out');

  // Persona definitions
  const personaList = [
    { id: 'founder', label: 'Founder (Early-stage Startup)' },
    { id: 'investor', label: 'Investor (VC Associate)' },
    { id: 'university', label: 'University Tech Transfer' },
    { id: 'serviceProvider', label: 'Service Provider' }
  ];
  function renderPersonaOptions() {
    personaOptionsEl.innerHTML = '';
    personaList.forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'persona-option';
      btn.textContent = p.label;
      btn.addEventListener('click', () => setPersona(p.id));
      personaOptionsEl.appendChild(btn);
    });
  }

  async function setPersona(id) {
    persona = id;
    localStorage.setItem('dex-persona', id);
    personaBadgeEl.textContent = id.charAt(0).toUpperCase() + id.slice(1);
    personaBadgeEl.style.display = 'inline-block';
    personaSelectorEl.classList.add('hidden');
    dexAppEl.classList.remove('hidden');
    await loadCommunityData();
    updateAlertsPanel();
    updateWatchlistPanel();
    updateSuggestionsPanel();
    renderInstructionsPanel();
    renderGraph();
  }

  function resetPersona() {
    localStorage.removeItem('dex-persona');
    persona = null;
    selectedNode = null;
    selectedLink = null;
    personaBadgeEl.style.display = 'none';
    personaSelectorEl.classList.remove('hidden');
    dexAppEl.classList.add('hidden');
    detailsPanelEl.innerHTML = '<h3>Node details</h3><p>Click on a node to see its details.</p>';
    watchlistPanelEl.innerHTML = '<h3>Watchlist</h3><p class="empty-text">Your watchlist is empty.</p>';
    alertsPanelEl.innerHTML = '<h3>Alerts</h3><p class="empty-text">No new alerts.</p>';
    suggestPanelEl.innerHTML = '<h3>Suggestions</h3><p class="empty-text">Select a persona to see suggestions.</p>';
  }

  // --- all your graph / panels / suggestions functions remain unchanged ---
  // (no need to paste them all again here; keep exactly as in your version)

  /**
   * Supabase Auth
   */
  async function initAuth() {
    // Bind auth state change
    supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        handleSignedIn(session.user);
      } else {
        handleSignedOut();
      }
    });
    // Restore session
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) {
      handleSignedIn(session.user);
    } else {
      handleSignedOut();
    }
  }

  function handleSignedOut() {
    currentUser = null;
    watchlist = [];
    notes = {};
    signOutBtn.classList.add('hidden');
    authScreenEl.classList.remove('hidden');
    personaSelectorEl.classList.add('hidden');
    dexAppEl.classList.add('hidden');
    personaBadgeEl.style.display = 'none';
    bindAuthForm();
  }

  function handleSignedIn(user) {
    currentUser = user;
    authScreenEl.classList.add('hidden');
    signOutBtn.classList.remove('hidden');
    Promise.all([loadWatchlistFromStorage(), loadNotesFromStorage()]).then(() => {
      if (persona) {
        personaBadgeEl.textContent = persona.charAt(0).toUpperCase() + persona.slice(1);
        personaBadgeEl.style.display = 'inline-block';
        personaSelectorEl.classList.add('hidden');
        dexAppEl.classList.remove('hidden');
        updateAlertsPanel();
        updateWatchlistPanel();
        updateSuggestionsPanel();
        renderGraph();
        updateDetailsPanel();
      } else {
        personaSelectorEl.classList.remove('hidden');
        dexAppEl.classList.add('hidden');
      }
    });
  }

  function bindAuthForm() {
    if (!authFormEl) return;
    authMessageEl.textContent = '';
    authFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = authEmailEl.value.trim();
      if (!email) return;
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.href }
        });
        authMessageEl.textContent = error
          ? error.message
          : 'Check your email for a magic sign-in link.';
      } catch {
        authMessageEl.textContent = 'Failed to send magic link.';
      }
    }, { once: true });
  }

  function bindSignOut() {
    signOutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
  }

  // Init
  async function init() {
    initStarfield();
    renderPersonaOptions();
    bindThemeToggle();
    bindChangePersona();
    bindSignOut();
    await initAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
