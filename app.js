// Main JavaScript for the Dex static application.
// Orchestrates persona selection, graph rendering, watchlist
// management, alert presentation, Supabase persistence and theme
// toggling. Also draws a starry background inspired by
// CharlestonHacks and exposes interactive connections (synapses).

import { supabaseClient } from './supabaseClient.js';

(async () => {
  /**
   * Initialise the starfield background
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

  // Supabase integration (single definition)
  const supabase = supabaseClient;
  let usesSupabase = true;
  let currentUser = null;

  // Community data loader
  let communityDataLoaded = false;
  async function loadCommunityData() {
    if (communityDataLoaded) return;
    try {
      const { data, error } = await supabase.from('community').select('*');
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
    detailsPanelEl.innerHTML = '<h3>Node details</h3><p>Click a node to see its details.</p>';
    watchlistPanelEl.innerHTML = '<h3>Watchlist</h3><p class="empty-text">Your watchlist is empty.</p>';
    alertsPanelEl.innerHTML = '<h3>Alerts</h3><p class="empty-text">No new alerts.</p>';
    suggestPanelEl.innerHTML = '<h3>Suggestions</h3><p class="empty-text">Select a persona to see suggestions.</p>';
  }
  // --- GRAPH + UI FUNCTIONS ---

  // Graph state variables
  let svgEl, graphGroup, nodeEls, linkEls, hitLineEls, textEls, nodes, links, neighbourMap;
  let hitNodeEls; // For capturing node clicks with larger targets
  let simulationId = null;
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;

  /** Build neighbour map for fast lookups */
  function buildNeighbourMap() {
    const map = {};
    DATA.links.forEach((l) => {
      map[l.source] = map[l.source] || new Set();
      map[l.target] = map[l.target] || new Set();
      map[l.source].add(l.target);
      map[l.target].add(l.source);
    });
    neighbourMap = map;
  }

  /** Render the force-directed graph */
  function renderGraph() {
    buildNeighbourMap();

    // Cancel existing simulation
    if (simulationId !== null) {
      cancelAnimationFrame(simulationId);
      simulationId = null;
    }

    // Clear previous SVG
    graphContainerEl.innerHTML = '';
    const width = graphContainerEl.clientWidth;
    const height = graphContainerEl.clientHeight;

    // Create SVG + group
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', width);
    svgEl.setAttribute('height', height);
    graphGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svgEl.appendChild(graphGroup);
    graphContainerEl.appendChild(svgEl);

    // Deep copy nodes/links
    const nodeMap = {};
    nodes = DATA.nodes.map((n) => {
      const node = Object.assign({}, n);
      node.x = Math.random() * width;
      node.y = Math.random() * height;
      node.vx = node.vy = node.fx = node.fy = 0;
      nodeMap[node.id] = node;
      return node;
    });
    links = DATA.links.map((l) => ({
      source: nodeMap[l.source],
      target: nodeMap[l.target],
      type: l.type,
      description: l.description
    }));

    // Lines (visible + invisible hit lines)
    hitLineEls = [];
    linkEls = [];
    links.forEach((linkObj) => {
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hit.setAttribute('stroke-width', '18');
      hit.setAttribute('stroke', '#000');
      hit.setAttribute('stroke-opacity', '0');
      hit.setAttribute('pointer-events', 'none');
      graphGroup.appendChild(hit);
      hitLineEls.push(hit);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.classList.add('link-line');
      const colour = DATA.linkColors[linkObj.type] || '#888';
      line.style.setProperty('--link-colour', colour);
      line.setAttribute('stroke', colour);
      line.setAttribute('stroke-width', '1');
      line.setAttribute('pointer-events', 'none');
      graphGroup.appendChild(line);
      linkEls.push(line);
    });

    // Circles for nodes
    hitNodeEls = [];
    nodeEls = [];
    let draggingNode = null;
    const dragOffset = { x: 0, y: 0 };

    const updatePositionsInstant = () => {
      links.forEach((l, i) => {
        hitLineEls[i].setAttribute('x1', l.source.x);
        hitLineEls[i].setAttribute('y1', l.source.y);
        hitLineEls[i].setAttribute('x2', l.target.x);
        hitLineEls[i].setAttribute('y2', l.target.y);
        linkEls[i].setAttribute('x1', l.source.x);
        linkEls[i].setAttribute('y1', l.source.y);
        linkEls[i].setAttribute('x2', l.target.x);
        linkEls[i].setAttribute('y2', l.target.y);
      });
      nodes.forEach((n, i) => {
        nodeEls[i].setAttribute('cx', n.x);
        nodeEls[i].setAttribute('cy', n.y);
        hitNodeEls[i].setAttribute('cx', n.x);
        hitNodeEls[i].setAttribute('cy', n.y);
      });
      nodes.forEach((n, i) => {
        textEls[i].setAttribute('x', n.x);
        textEls[i].setAttribute('y', n.y - 14);
      });
    };

    nodes.forEach((node) => {
      const radius = node.size ? Math.max(4, 3 + node.size * 0.25) : 5;

      // Large invisible hit circle
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('r', radius * 3);
      hit.setAttribute('fill', '#fff');
      hit.setAttribute('fill-opacity', '0.01');
      hit.setAttribute('stroke', 'none');
      hit.setAttribute('pointer-events', 'all');
      hit.addEventListener('click', (e) => { e.stopPropagation(); onNodeSelect(node); });
      hit.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const rect = svgEl.getBoundingClientRect();
        const px = (e.clientX - rect.left - offsetX) / scale;
        const py = (e.clientY - rect.top - offsetY) / scale;
        draggingNode = node;
        dragOffset.x = node.x - px;
        dragOffset.y = node.y - py;
        if (simulationId !== null) {
          cancelAnimationFrame(simulationId);
          simulationId = null;
        }
        node.vx = node.vy = 0;
      });
      graphGroup.appendChild(hit);
      hitNodeEls.push(hit);

      // Visible circle
      const vis = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      vis.setAttribute('r', radius);
      vis.classList.add('node-circle');
      const colour = DATA.nodeColors[node.type] || '#888';
      vis.style.setProperty('--pulse-colour', colour);
      vis.setAttribute('fill', colour);
      vis.setAttribute('stroke', colour);
      vis.setAttribute('title', node.name);
      vis.addEventListener('click', (e) => { e.stopPropagation(); onNodeSelect(node); });
      vis.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const rect = svgEl.getBoundingClientRect();
        const px = (e.clientX - rect.left - offsetX) / scale;
        const py = (e.clientY - rect.top - offsetY) / scale;
        draggingNode = node;
        dragOffset.x = node.x - px;
        dragOffset.y = node.y - py;
        if (simulationId !== null) {
          cancelAnimationFrame(simulationId);
          simulationId = null;
        }
        node.vx = node.vy = 0;
      });
      vis.addEventListener('mouseover', () => vis.setAttribute('stroke-width', '2'));
      vis.addEventListener('mouseout', () => vis.setAttribute('stroke-width', '1'));
      graphGroup.appendChild(vis);
      nodeEls.push(vis);
    });

    // Text labels
    textEls = nodes.map((node) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = node.name;
      text.classList.add('node-label');
      graphGroup.appendChild(text);
      return text;
    });

    // Background click → select link or clear
    svgEl.addEventListener('click', (evt) => {
      const rect = svgEl.getBoundingClientRect();
      const x = (evt.clientX - rect.left - offsetX) / scale;
      const y = (evt.clientY - rect.top - offsetY) / scale;
      let nearest = null;
      let minDist = Infinity;
      function distToSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
        t = Math.max(0, Math.min(1, t));
        const projX = ax + t * dx;
        const projY = ay + t * dy;
        return Math.hypot(px - projX, py - projY);
      }
      links.forEach((l) => {
        const d = distToSegment(x, y, l.source.x, l.source.y, l.target.x, l.target.y);
        if (d < minDist) { minDist = d; nearest = l; }
      });
      const thresholdGraph = 25 / scale;
      if (nearest && minDist <= thresholdGraph) {
        onLinkSelect(nearest);
      } else {
        onNodeSelect(null);
      }
    });

    // Zoom & pan
    offsetX = offsetY = 0;
    scale = 1;
    let isPanning = false;
    const panStart = { x: 0, y: 0 };
    function updateTransform() {
      graphGroup.setAttribute('transform', `translate(${offsetX},${offsetY}) scale(${scale})`);
    }
    svgEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY * -0.001;
      const newScale = Math.max(0.5, Math.min(4, scale * (1 + delta)));
      const rect = svgEl.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      offsetX = px - (px - offsetX) * (newScale / scale);
      offsetY = py - (py - offsetY) * (newScale / scale);
      scale = newScale;
      updateTransform();
    });
    svgEl.addEventListener('mousedown', (e) => {
      if (e.target.tagName.toLowerCase() === 'svg' || e.target.tagName.toLowerCase() === 'g') {
        isPanning = true;
        panStart.x = e.clientX;
        panStart.y = e.clientY;
      }
    });
    svgEl.addEventListener('mousemove', (e) => {
      if (draggingNode) {
        const rect = svgEl.getBoundingClientRect();
        const px = (e.clientX - rect.left - offsetX) / scale;
        const py = (e.clientY - rect.top - offsetY) / scale;
        draggingNode.x = px + dragOffset.x;
        draggingNode.y = py + dragOffset.y;
        updatePositionsInstant();
        return;
      }
      if (!isPanning) return;
      offsetX += e.clientX - panStart.x;
      offsetY += e.clientY - panStart.y;
      panStart.x = e.clientX;
      panStart.y = e.clientY;
      updateTransform();
    });
    svgEl.addEventListener('mouseup', () => { draggingNode = null; isPanning = false; });
    svgEl.addEventListener('mouseleave', () => { draggingNode = null; isPanning = false; });

    // --- Physics simulation ---
    const linkDistance = 90;
    const linkStrength = 0.015;
    const chargeStrength = -200;
    const centerStrength = 0.0015;
    const damping = 0.75;
    const categories = [...new Set(nodes.map((n) => n.category))];
    const clusterRadius = Math.min(width, height) * 0.4;
    const angleStep = (2 * Math.PI) / categories.length;
    const clusterCenters = {};
    categories.forEach((cat, idx) => {
      const angle = idx * angleStep;
      clusterCenters[cat] = {
        x: width / 2 + clusterRadius * Math.cos(angle),
        y: height / 2 + clusterRadius * Math.sin(angle)
      };
    });
    const clusterStrength = 0.1;

    function tick() {
      nodes.forEach((n) => { n.fx = n.fy = 0; });
      links.forEach((l) => {
        const dx = l.target.x - l.source.x;
        const dy = l.target.y - l.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = dist - linkDistance;
        const force = linkStrength * diff / dist;
        const fx = dx * force, fy = dy * force;
        l.source.fx += fx; l.source.fy += fy;
        l.target.fx -= fx; l.target.fy -= fy;
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i], n2 = nodes[j];
          let dx = n2.x - n1.x, dy = n2.y - n1.y;
          const dist2 = dx * dx + dy * dy + 0.01;
          const force = chargeStrength / dist2;
          const fx = dx * force, fy = dy * force;
          n1.fx -= fx; n1.fy -= fy;
          n2.fx += fx; n2.fy += fy;
        }
      }
      nodes.forEach((n) => {
        n.fx += (width / 2 - n.x) * centerStrength;
        n.fy += (height / 2 - n.y) * centerStrength;
        const centre = clusterCenters[n.category];
        if (centre) {
          n.fx += (centre.x - n.x) * clusterStrength;
          n.fy += (centre.y - n.y) * clusterStrength;
        }
      });
      nodes.forEach((n) => {
        n.vx = (n.vx + n.fx) * damping;
        n.vy = (n.vy + n.fy) * damping;
        n.x += n.vx;
        n.y += n.vy;
      });
      links.forEach((l, i) => {
        hitLineEls[i].setAttribute('x1', l.source.x);
        hitLineEls[i].setAttribute('y1', l.source.y);
        hitLineEls[i].setAttribute('x2', l.target.x);
        hitLineEls[i].setAttribute('y2', l.target.y);
        linkEls[i].setAttribute('x1', l.source.x);
        linkEls[i].setAttribute('y1', l.source.y);
        linkEls[i].setAttribute('x2', l.target.x);
        linkEls[i].setAttribute('y2', l.target.y);
      });
      nodes.forEach((n, i) => {
        nodeEls[i].setAttribute('cx', n.x);
        nodeEls[i].setAttribute('cy', n.y);
        hitNodeEls[i].setAttribute('cx', n.x);
        hitNodeEls[i].setAttribute('cy', n.y);
        textEls[i].setAttribute('x', n.x);
        textEls[i].setAttribute('y', n.y - 14);
      });
      tickCount++;
      if (tickCount < maxTicks) simulationId = requestAnimationFrame(tick);
      else simulationId = null;
    }
    let tickCount = 0;
    const maxTicks = 100;
    simulationId = requestAnimationFrame(tick);
  }

  /** Highlight selection */
  function highlightSelection() {
    if (!nodes || !nodeEls || !linkEls) return;
    if (selectedLink) {
      const srcId = selectedLink.source.id, tgtId = selectedLink.target.id;
      nodes.forEach((n, i) => {
        const emphasised = (n.id === srcId || n.id === tgtId);
        nodeEls[i].setAttribute('opacity', emphasised ? 1 : 0.2);
        nodeEls[i].setAttribute('stroke-width', emphasised ? 2 : 1);
      });
      links.forEach((l, i) => {
        const emphasised = (l === selectedLink);
        linkEls[i].setAttribute('opacity', emphasised ? 1 : 0.05);
        linkEls[i].setAttribute('stroke-width', emphasised ? '2' : '1');
        hitLineEls[i].setAttribute('stroke-width', '18');
      });
      return;
    }
    const neighbours = selectedNode && neighbourMap[selectedNode.id] ? neighbourMap[selectedNode.id] : null;
    nodes.forEach((n, i) => {
      const emphasised = !selectedNode || n.id === selectedNode.id || (neighbours && neighbours.has(n.id));
      nodeEls[i].setAttribute('opacity', emphasised ? 1 : 0.2);
      nodeEls[i].setAttribute('stroke-width', (selectedNode && n.id === selectedNode.id) ? 2 : 1);
    });
    links.forEach((l, i) => {
      const emphasised = !selectedNode || l.source.id === selectedNode.id || l.target.id === selectedNode.id;
      linkEls[i].setAttribute('opacity', emphasised ? 1 : 0.05);
      linkEls[i].setAttribute('stroke-width', '1');
      hitLineEls[i].setAttribute('stroke-width', '18');
    });
  }

  function onNodeSelect(node) {
    selectedNode = node;
    selectedLink = null;
    highlightSelection();
    updateDetailsPanel();
  }

  function onLinkSelect(link) {
    selectedLink = link;
    selectedNode = null;
    highlightSelection();
    updateDetailsPanel();
  }
  /** Update details panel */
  function updateDetailsPanel() {
    if (selectedLink) {
      const src = selectedLink.source;
      const tgt = selectedLink.target;
      let html = '';
      html += '<div class="details-header">';
      html += '<h3>Connection</h3>';
      html += '<button class="close-button" aria-label="Close details">×</button>';
      html += '</div>';
      html += `<p class="link-description">${selectedLink.description || 'No description provided.'}</p>`;
      html += '<div class="connection-actions">';
      html += `<button class="open-node-button" data-id="${src.id}">Open ${src.name}</button>`;
      html += `<button class="open-node-button" data-id="${tgt.id}">Open ${tgt.name}</button>`;
      html += '</div>';
      detailsPanelEl.innerHTML = html;

      // Bind actions
      detailsPanelEl.querySelector('.close-button').addEventListener('click', () => {
        selectedLink = null;
        highlightSelection();
        updateDetailsPanel();
      });
      detailsPanelEl.querySelectorAll('.open-node-button').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const node = DATA.nodes.find((n) => n.id === id);
          if (node) onNodeSelect(node);
        });
      });
      return;
    }

    if (selectedNode) {
      const node = selectedNode;
      let html = '';
      html += '<div class="details-header">';
      html += `<h3>${node.name}</h3>`;
      html += '<button class="close-button" aria-label="Close details">×</button>';
      html += '</div>';
      if (node.image_url) {
        html += `<img src="${node.image_url}" alt="${node.name}" class="node-photo" style="--pulse-colour: ${DATA.nodeColors[node.type] || '#888'}"/>`;
      }
      html += `<p class="node-type">${node.type}</p>`;
      html += `<p class="node-description">${node.description}</p>`;
      if (node.website) {
        html += `<p class="node-website"><a href="${node.website}" target="_blank" rel="noopener noreferrer">Visit website</a></p>`;
      }
      html += '<button class="watchlist-button">Add to watchlist</button>';
      html += '<div class="notes-section">';
      html += '<label for="notes-textarea">Notes</label>';
      html += `<textarea id="notes-textarea" rows="3">${notes[node.id] || ''}</textarea>`;
      html += '<button class="save-note-button">Save notes</button>';
      html += '</div>';
      detailsPanelEl.innerHTML = html;

      detailsPanelEl.querySelector('.close-button').addEventListener('click', () => onNodeSelect(null));
      detailsPanelEl.querySelector('.watchlist-button').addEventListener('click', () => addToWatchlist(node));
      const notesTextarea = detailsPanelEl.querySelector('#notes-textarea');
      detailsPanelEl.querySelector('.save-note-button').addEventListener('click', () => {
        const text = notesTextarea.value;
        notes[node.id] = text;
        saveNoteToStorage(node.id, text);
      });
      return;
    }

    // Default
    detailsPanelEl.innerHTML = '<h3>Node details</h3><p>Click on a node in the graph to see its details.</p>';
  }

  /** Watchlist management */
  function addToWatchlist(node) {
    if (!watchlist.some((n) => n.id === node.id)) {
      watchlist.push({ id: node.id, name: node.name, type: node.type });
      saveWatchlistToStorage();
      updateWatchlistPanel();
      updateSuggestionsPanel();
    }
  }

  function removeFromWatchlist(id) {
    watchlist = watchlist.filter((n) => n.id !== id);
    saveWatchlistToStorage();
    updateWatchlistPanel();
    updateSuggestionsPanel();
    if (selectedNode && selectedNode.id === id) {
      onNodeSelect(null);
    }
  }

  function updateWatchlistPanel() {
    let html = '<h3>Watchlist</h3>';
    if (watchlist.length === 0) {
      html += '<p class="empty-text">Your watchlist is empty. Click on nodes to add them here.</p>';
      watchlistPanelEl.innerHTML = html;
      return;
    }
    html += '<ul>';
    watchlist.forEach((item) => {
      html += `<li><button class="watchlist-name" data-id="${item.id}">${item.name}</button><button class="remove-button" data-id="${item.id}">×</button></li>`;
    });
    html += '</ul>';
    watchlistPanelEl.innerHTML = html;

    watchlistPanelEl.querySelectorAll('.watchlist-name').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const node = DATA.nodes.find((n) => n.id === id);
        if (node) onNodeSelect(node);
      });
    });
    watchlistPanelEl.querySelectorAll('.remove-button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        removeFromWatchlist(id);
      });
    });
  }

  /** Alerts */
  function updateAlertsPanel() {
    let html = '<h3>Alerts</h3>';
    const a = persona ? ALERTS[persona] || [] : [];
    if (!a || a.length === 0) {
      html += '<p class="empty-text">There are no new alerts right now.</p>';
      alertsPanelEl.innerHTML = html;
      return;
    }
    html += '<ul>';
    a.forEach((alert) => {
      html += `<li class="alert-item"><strong class="alert-title">${alert.title}</strong><p class="alert-description">${alert.description}</p></li>`;
    });
    html += '</ul>';
    alertsPanelEl.innerHTML = html;
  }

  /** Theme toggling */
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dex-theme', next);
    updateThemeButton();
  }

  function updateThemeButton() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    if (current === 'dark') {
      themeToggleEl.innerHTML = '<svg class="theme-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" /></svg>';
    } else {
      themeToggleEl.innerHTML = '<svg class="theme-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" /></svg>';
    }
  }

  function bindThemeToggle() {
    themeToggleEl.addEventListener('click', toggleTheme);
    updateThemeButton();
  }

  function bindChangePersona() {
    changePersonaEl.addEventListener('click', resetPersona);
  }
  /** Authentication + Supabase integration */
  async function initAuth() {
    if (!usesSupabase) {
      authScreenEl.classList.add('hidden');
      signOutBtn.classList.add('hidden');
      loadFromLocalStorage();
      return;
    }

    bindSignOut();

    supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        handleSignedIn(session.user);
      } else {
        handleSignedOut();
      }
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) {
      handleSignedIn(session.user);
    } else {
      handleSignedOut();
    }
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
        if (error) {
          authMessageEl.textContent = error.message;
        } else {
          authMessageEl.textContent = 'Check your email for a magic sign-in link.';
        }
      } catch (err) {
        authMessageEl.textContent = 'Failed to send magic link.';
      }
    });
  }

  function bindSignOut() {
    signOutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
  }

  function handleSignedIn(user) {
    currentUser = user;
    authScreenEl.classList.add('hidden');
    signOutBtn.classList.remove('hidden');
    loadWatchlistFromStorage();
    loadNotesFromStorage();
    if (persona) {
      dexAppEl.classList.remove('hidden');
    }
  }

  function handleSignedOut() {
    currentUser = null;
    authScreenEl.classList.remove('hidden');
    signOutBtn.classList.add('hidden');
    dexAppEl.classList.add('hidden');
    bindAuthForm();
  }

  /** Local + Supabase persistence */
  function loadFromLocalStorage() {
    try {
      watchlist = JSON.parse(localStorage.getItem('dex-watchlist') || '[]');
    } catch {
      watchlist = [];
    }
    try {
      notes = JSON.parse(localStorage.getItem('dex-notes') || '{}');
    } catch {
      notes = {};
    }
    updateWatchlistPanel();
    updateSuggestionsPanel();
  }

  async function loadWatchlistFromStorage() {
    if (!usesSupabase || !currentUser) {
      loadFromLocalStorage();
      return;
    }
    try {
      const { data, error } = await supabase
        .from('watchlists')
        .select('node_id, name, type')
        .eq('user_id', currentUser.id);
      if (error) {
        console.warn('Could not fetch watchlist:', error.message);
        loadFromLocalStorage();
      } else {
        watchlist = data.map((row) => ({ id: row.node_id, name: row.name, type: row.type }));
      }
    } catch (err) {
      console.warn('Error fetching watchlist:', err);
      loadFromLocalStorage();
    }
    updateWatchlistPanel();
    updateSuggestionsPanel();
  }

  async function loadNotesFromStorage() {
    if (!usesSupabase || !currentUser) {
      loadFromLocalStorage();
      return;
    }
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('node_id, note')
        .eq('user_id', currentUser.id);
      if (error) {
        console.warn('Could not fetch notes:', error.message);
        loadFromLocalStorage();
      } else {
        notes = {};
        data.forEach((row) => {
          notes[row.node_id] = row.note;
        });
      }
    } catch (err) {
      console.warn('Error fetching notes:', err);
      loadFromLocalStorage();
    }
  }

  async function saveWatchlistToStorage() {
    if (!usesSupabase || !currentUser) {
      localStorage.setItem('dex-watchlist', JSON.stringify(watchlist));
      return;
    }
    const rows = watchlist.map((item) => ({
      user_id: currentUser.id,
      node_id: item.id,
      name: item.name,
      type: item.type
    }));
    try {
      const { error } = await supabase.from('watchlists').upsert(rows, {
        onConflict: ['user_id', 'node_id']
      });
      if (error) console.warn('Error saving watchlist:', error.message);
    } catch (err) {
      console.warn('Error saving watchlist:', err);
    }
  }

  async function saveNoteToStorage(nodeId, text) {
    if (!usesSupabase || !currentUser) {
      localStorage.setItem('dex-notes', JSON.stringify(notes));
      return;
    }
    try {
      const { error } = await supabase.from('notes').upsert(
        { user_id: currentUser.id, node_id: nodeId, note: text },
        { onConflict: ['user_id', 'node_id'] }
      );
      if (error) console.warn('Error saving note:', error.message);
    } catch (err) {
      console.warn('Error saving note:', err);
    }
  }

  /** Suggestions */
  function updateSuggestionsPanel() {
    let html = '<h3>Suggestions</h3>';
    if (!persona) {
      html += '<p class="empty-text">Select a persona to see suggestions.</p>';
      suggestPanelEl.innerHTML = html;
      return;
    }
    if (!neighbourMap) buildNeighbourMap();

    const degreeMap = {};
    DATA.links.forEach((l) => {
      degreeMap[l.source] = (degreeMap[l.source] || 0) + 1;
      degreeMap[l.target] = (degreeMap[l.target] || 0) + 1;
    });

    const watchIds = new Set(watchlist.map((w) => w.id));
    const watchNeighbours = new Set();
    const watchInterests = new Set();

    watchlist.forEach((item) => {
      const neighbours = neighbourMap[item.id] || new Set();
      neighbours.forEach((id) => watchNeighbours.add(id));

      const wn = DATA.nodes.find((n) => n.id === item.id);
      if (wn && wn.interests) {
        wn.interests.forEach((i) => watchInterests.add(i.toLowerCase()));
      }
    });

    const candidates = DATA.nodes
      .filter((n) => !watchIds.has(n.id))
      .map((n) => {
        let score = 0;
        const reasons = [];

        if (watchNeighbours.has(n.id)) {
          score += 5;
          reasons.push('connected to your watchlist');
        }

        const deg = degreeMap[n.id] || 0;
        score += deg * 0.5;
        if (deg > 0) reasons.push(`${deg} connections in the network`);

        let sharedCount = 0;
        if (n.interests) {
          n.interests.forEach((i) => {
            if (watchInterests.has(i.toLowerCase())) sharedCount++;
          });
        }
        if (sharedCount > 0) {
          score += sharedCount * 2;
          reasons.push(`shares ${sharedCount} interest${sharedCount > 1 ? 's' : ''} with your watchlist`);
        }

        if (persona && n.type === persona) {
          score += 1;
          reasons.push('matches your persona');
        }

        return { node: n, score, reasons };
      })
      .filter((entry) => entry.score > 0);

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 5);

    if (top.length === 0) {
      html += '<p class="empty-text">No suggestions available.</p>';
      suggestPanelEl.innerHTML = html;
      return;
    }

    html += '<p class="suggest-intro">Dex suggests the following entities in order of relevance.</p>';
    html += '<ol class="suggest-list">';
    top.forEach((entry) => {
      const n = entry.node;
      const expl = entry.reasons.join(', ');
      html += `<li data-id="${n.id}"><strong>${n.name}</strong><br><span class="reason-text">${expl}</span></li>`;
    });
    html += '</ol>';
    suggestPanelEl.innerHTML = html;

    suggestPanelEl.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const node = DATA.nodes.find((n) => n.id === id);
        if (node) onNodeSelect(node);
      });
    });
  }
  /** Instructions */
  function renderInstructionsPanel() {
    let html = '<h3>How to use Dex</h3>';
    html += '<p><strong>Select your persona:</strong> Choose the role that best describes you to tailor alerts and recommendations.</p>';
    html += '<p><strong>Explore the graph:</strong> Each glowing dot represents an organisation or person. Colours correspond to roles (startups, investors, universities, incubators, service providers and individuals). Lines (synapses) show relationships. Pan and zoom to explore. Drag nodes to reposition.</p>';
    html += '<p><strong>View details:</strong> Click a node to see a description, photo, external links and notes. Click a connection to see how two entities relate.</p>';
    html += '<p><strong>Build your watchlist:</strong> Add entities to your watchlist to track them. Dex uses your watchlist and interests to prioritise recommendations.</p>';
    html += '<p><strong>Understand suggestions:</strong> Suggestions are ordered by relevance. Reasons show why a node might matter — shared interests, direct connections or popularity.</p>';
    html += '<p><strong>Make connections:</strong> Start with the top suggestion and work your way down. Dex refreshes suggestions as your watchlist evolves.</p>';
    instructionsPanelEl.innerHTML = html;
  }

  /** Initialise the application */
  async function init() {
    initStarfield();
    renderPersonaOptions();
    bindThemeToggle();
    bindChangePersona();
    await initAuth();

    if (!usesSupabase) {
      if (persona) {
        personaBadgeEl.textContent = persona.charAt(0).toUpperCase() + persona.slice(1);
        personaBadgeEl.style.display = 'inline-block';
        personaSelectorEl.classList.add('hidden');
        dexAppEl.classList.remove('hidden');
        updateAlertsPanel();
        updateWatchlistPanel();
        updateSuggestionsPanel();
        renderInstructionsPanel();
        renderGraph();
        updateDetailsPanel();
      } else {
        personaSelectorEl.classList.remove('hidden');
        dexAppEl.classList.add('hidden');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
