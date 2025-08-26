// Main JavaScript for the Dex static application.  This file
// orchestrates persona selection, graph rendering, watchlist
// management, alert presentation, optional Supabase persistence and
// theme toggling.  It also draws a starry background inspired by
// CharlestonHacks and exposes interactive connections (synapses) in
// the graph.

// Wrap everything in an async immediately invoked function so we can
// use top‑level await to conditionally import the Supabase client.
(async () => {
  /**
   * Initialise the starfield background.  A canvas covers the entire
   * page and slowly drifts small white dots downward to simulate a
   * moving star field.  The canvas sits behind all other content
   * thanks to CSS (see style.css) and does not intercept pointer
   * events.
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
      // Generate a field of stars with random positions, sizes and speeds
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
        // Move star downward.  When a star exits the bottom, recycle
        // it to the top with a new random horizontal position and
        // attributes.
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

  const DATA = window.DEX_DATA;
  const ALERTS = window.DEX_ALERTS;

  // Persistent state
  let persona = localStorage.getItem('dex-persona') || null;
  // In memory watchlist and notes.  These will be populated from
  // Supabase if configured or from localStorage otherwise.
  let watchlist = [];
  let notes = {};
  let selectedNode = null;
  let selectedLink = null; // Track currently selected link (connection)
  // Supabase variables
  let supabaseClient = null;
  let currentUser = null;
  let usesSupabase = false;

  // Flag to indicate that community data has been loaded from CSV.
  let communityDataLoaded = false;

  /**
   * Attempt to fetch an additional community CSV file and merge the
   * results into the global DATA object.  The file should be placed
   * in the same directory as index.html and named
   * "Supabase Snippet Community Data Retrieval.csv".  Each row should
   * contain at least a name, description, interests and image URL.
   * This function heuristically assigns a type to each person based
   * on keywords in the role or organisation columns and creates
   * links to existing entities when interests overlap.  If the file
   * cannot be retrieved, the function quietly returns and the
   * application continues using the built‑in sample data.
   */
  async function loadCommunityData() {
    // Only load community data once per session
    if (communityDataLoaded) return;
    try {
      let text = null;
      // Try to load a simple community CSV first.  Users may provide
      // their export as "Community.csv".  If that fails, fall back to the
      // legacy filename with spaces.  Both requests are attempted via
      // fetch() so they work when served from a local filesystem or
      // GitHub Pages.  Any network or file errors will be silently
      // ignored and the built‑in sample data will remain.
      const candidates = ['Community.csv', 'Supabase Snippet Community Data Retrieval.csv'];
      for (const fname of candidates) {
        try {
          const resp = await fetch(encodeURI(fname));
          if (resp.ok) {
            text = await resp.text();
            break;
          }
        } catch (err) {
          // ignore and try next candidate
        }
      }
      if (!text) {
        // If no CSV data was found, attempt to fetch from Supabase
        // below.  We do not return here because we still want
        // Supabase to run.  Note: the rest of the CSV processing is
        // skipped when text is null.
      }
      let newNodes = [];
      let newLinks = [];
      // If we successfully loaded a CSV, parse it into person nodes
      if (text) {
        const lines = text.trim().split(/\r?\n/);
        if (lines.length >= 2) {
          const header = lines.shift().split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((h) => h.trim());
          // Helper to slugify names into ids
          const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$|/g, '');
          // Determine column indices for common fields
          const idxName = header.findIndex((h) => /name/i.test(h));
          const idxDesc = header.findIndex((h) => /summary|bio|description/i.test(h));
          const idxRole = header.findIndex((h) => /role|title|function/i.test(h));
          const idxOrg = header.findIndex((h) => /company|organisation|organization/i.test(h));
          const idxInterests = header.findIndex((h) => /interests/i.test(h));
          const idxImg = header.findIndex((h) => /image|photo|avatar/i.test(h));
          lines.forEach((line) => {
            const cells = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
            const name = cells[idxName] ? cells[idxName].replace(/^\"|\"$/g, '') : '';
            if (!name) return;
            const desc = cells[idxDesc] ? cells[idxDesc].replace(/^\"|\"$/g, '') : '';
            const role = cells[idxRole] ? cells[idxRole].toLowerCase() : '';
            const org = cells[idxOrg] ? cells[idxOrg].toLowerCase() : '';
            const interestsRaw = cells[idxInterests] ? cells[idxInterests].toLowerCase() : '';
            const interests = interestsRaw ? interestsRaw.split(/;|,|\|/).map((s) => s.trim()).filter(Boolean) : [];
            const image = cells[idxImg] ? cells[idxImg].trim() : '';
            // Determine type based on role or organisation
            let type = 'serviceProvider';
            const combined = role + ' ' + org;
            if (/investor|vc|venture|capital|fund|associate/.test(combined)) {
              type = 'investor';
            } else if (/incubator|accelerator/.test(combined)) {
              type = 'incubator';
            } else if (/university|college|faculty/.test(combined)) {
              type = 'university';
            } else if (/startup|founder|ceo|cto/.test(combined)) {
              type = 'startup';
            }
            const id = slugify(name) || ('person-' + Math.random().toString(36).slice(2));
            const node = {
              id,
              name,
              type,
              category: type,
              size: 6,
              description: desc || 'No description provided.',
              website: '',
              image_url: image || undefined,
              interests
            };
            newNodes.push(node);
          });
        }
      }
      // If Supabase is configured, attempt to fetch rows from the
      // 'community' table and convert them into person nodes.  The
      // schema is expected to include: id (uuid), name (text), bio
      // (text), image_url (text) and interests (array).  Extra
      // fields (skills, endorsements) are ignored here but could be
      // used to influence node size or type in future versions.
      if (usesSupabase && supabaseClient) {
        try {
          const { data: rows, error } = await supabaseClient.from('community').select('*');
          if (!error && rows && Array.isArray(rows)) {
            rows.forEach((row) => {
              const id = row.id || ('person-' + Math.random().toString(36).slice(2));
              const name = row.name || row.email || 'Unknown';
              const desc = row.bio || '';
              const interests = Array.isArray(row.interests) ? row.interests.map((s) => String(s).toLowerCase()) : [];
              const image = row.image_url || '';
              // Determine type for community members. We classify
              // everyone pulled from Supabase as a 'person' unless
              // interests suggest otherwise. You can customise this
              // mapping based on your schema.
              const node = {
                id: String(id),
                name,
                type: 'person',
                category: 'person',
                size: 6 + (typeof row.endorsements === 'number' ? Math.min(row.endorsements, 4) : 0),
                description: desc || 'No description provided.',
                website: '',
                image_url: image || undefined,
                interests
              };
              newNodes.push(node);
            });
          } else if (error) {
            console.warn('Supabase community fetch error:', error.message);
          }
        } catch (err2) {
          console.warn('Supabase community fetch failed:', err2.message);
        }
      }
      // Build connections between new nodes and existing sample
      if (newNodes.length > 0) {
        // Preprocess existing descriptions for interest matching
        const existingNodes = DATA.nodes;
        existingNodes.forEach((en) => {
          en._fullText = (en.name + ' ' + en.description).toLowerCase();
        });
        newNodes.forEach((pn) => {
          existingNodes.forEach((en) => {
            if (!pn.interests || pn.interests.length === 0) return;
            const match = pn.interests.some((interest) => en._fullText.includes(interest));
            if (match) {
              newLinks.push({
                source: pn.id,
                target: en.id,
                type: 'interest',
                description: `${pn.name} shares interest(s) with ${en.name}`
              });
            }
          });
        });
        // Merge into global data
        DATA.nodes = DATA.nodes.concat(newNodes);
        DATA.links = DATA.links.concat(newLinks);
      }
      communityDataLoaded = true;
    } catch (err) {
      console.warn('Community data load failed:', err.message);
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
  // Authentication elements
  const authScreenEl = document.getElementById('auth-screen');
  const authFormEl = document.getElementById('auth-form');
  const authEmailEl = document.getElementById('auth-email');
  const authMessageEl = document.getElementById('auth-message');
  const signOutBtn = document.getElementById('sign-out');

  // Persona definitions
  const personaList = [
    { id: 'founder', label: 'Founder (Early‑stage Startup)' },
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
      btn.addEventListener('click', () => {
        setPersona(p.id);
      });
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
    // Load any additional community members from CSV before
    // displaying the graph.  This ensures that new nodes are available
    // for suggestions and visualisation.  We await here to avoid
    // rendering the graph twice unnecessarily.
    await loadCommunityData();
    updateAlertsPanel();
    updateWatchlistPanel();
    updateSuggestionsPanel();
    renderInstructionsPanel();
    renderGraph();
  }

  function resetPersona() {
    // Remove the stored persona and reload the persona selector. Also
    // clear any selection and panels.  Watchlist and notes are
    // persisted separately.
    localStorage.removeItem('dex-persona');
    persona = null;
    selectedNode = null;
    selectedLink = null;
    personaBadgeEl.style.display = 'none';
    personaSelectorEl.classList.remove('hidden');
    dexAppEl.classList.add('hidden');
    detailsPanelEl.innerHTML = '<h3>Node details</h3><p>Click on a node in the graph to see its details.</p>';
    watchlistPanelEl.innerHTML = '<h3>Watchlist</h3><p class="empty-text">Your watchlist is empty. Click on nodes to add them here.</p>';
    alertsPanelEl.innerHTML = '<h3>Alerts</h3><p class="empty-text">There are no new alerts right now.</p>';
    suggestPanelEl.innerHTML = '<h3>Suggestions</h3><p class="empty-text">Select a persona to see suggestions.</p>';
  }

  // Graph state variables: references to SVG elements, simulation
  // handles and data structures for nodes, links and labels.  For
  // connections we maintain two arrays: `linkEls` for the visible
  // lines and `hitLineEls` for invisible but thick lines that
  // capture click events on the connections.  Without these hit
  // lines, thin strokes are difficult to click.
  let svgEl, graphGroup, nodeEls, linkEls, hitLineEls, textEls, nodes, links, neighbourMap;
  let hitNodeEls; // For capturing node clicks with larger targets
  let simulationId = null;
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;

  /**
   * Build a neighbour map keyed by node ID.  Each entry contains a
   * Set of node IDs directly connected to the key.  This structure
   * accelerates highlighting and suggestion calculations.
   */
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

  /**
   * Render the force‑directed graph.  Creates SVG elements for
   * nodes, links and labels; attaches event handlers; and runs a
   * simple physics simulation to position the nodes.  Supports
   * zooming and panning.
   */
  function renderGraph() {
    buildNeighbourMap();
    // Cancel any existing simulation loop
    if (simulationId !== null) {
      cancelAnimationFrame(simulationId);
      simulationId = null;
    }
    // Clear previous SVG
    graphContainerEl.innerHTML = '';
    const width = graphContainerEl.clientWidth;
    const height = graphContainerEl.clientHeight;
    // Create SVG and group for nodes and links
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', width);
    svgEl.setAttribute('height', height);
    graphGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svgEl.appendChild(graphGroup);
    graphContainerEl.appendChild(svgEl);
    // Prepare deep copies of nodes and links; assign random positions
    const nodeMap = {};
    nodes = DATA.nodes.map((n) => {
      const node = Object.assign({}, n);
      node.x = Math.random() * width;
      node.y = Math.random() * height;
      node.vx = 0;
      node.vy = 0;
      node.fx = 0;
      node.fy = 0;
      nodeMap[node.id] = node;
      return node;
    });
    links = DATA.links.map((l) => {
      return {
        source: nodeMap[l.source],
        target: nodeMap[l.target],
        type: l.type,
        description: l.description
      };
    });
    // Create line elements for links.  To improve clickability of
    // connections, each link is represented by two SVG line
    // elements: a visible line (`linkEls`) and an invisible but
    // wider hit line (`hitLineEls`).  The hit line has a much
    // larger stroke width and transparent stroke so clicks are
    // easier to register.  The visible line handles the actual
    // drawing and styling.
    hitLineEls = [];
    linkEls = [];
    links.forEach((linkObj) => {
      // Invisible hit line for easier click detection
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hit.setAttribute('stroke-width', '18');
      hit.setAttribute('stroke', '#000');
      hit.setAttribute('stroke-opacity', '0');
      // Disable pointer events on hit lines – interactions are
      // handled via fallback detection on the entire SVG.  This
      // prevents large invisible strokes from capturing clicks over
      // nodes.
      hit.setAttribute('pointer-events', 'none');
      graphGroup.appendChild(hit);
      hitLineEls.push(hit);
      // Visible line with glow
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.classList.add('link-line');
      // Assign per‑connection glow colour using CSS custom property
      const colour = DATA.linkColors[linkObj.type] || '#888';
      line.style.setProperty('--link-colour', colour);
      line.setAttribute('stroke', colour);
      line.setAttribute('stroke-width', '1');
      // Disable pointer events so nodes beneath remain clickable.  Link
      // clicks are detected via fallback detection on the SVG.
      line.setAttribute('pointer-events', 'none');
      graphGroup.appendChild(line);
      linkEls.push(line);
    });
    // Create circle elements for nodes
    hitNodeEls = [];
    nodeEls = [];
    // Variables to support dragging behaviour for repositionable nodes
    let draggingNode = null;
    const dragOffset = { x: 0, y: 0 };
    // Helper to update SVG positions outside the simulation.  When
    // dragging a node, we need to synchronise the graphical elements
    // without waiting for the simulation tick.
    const updatePositionsInstant = () => {
      // Update links
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
      // Update nodes and hit targets
      nodes.forEach((n, i) => {
        nodeEls[i].setAttribute('cx', n.x);
        nodeEls[i].setAttribute('cy', n.y);
        hitNodeEls[i].setAttribute('cx', n.x);
        hitNodeEls[i].setAttribute('cy', n.y);
      });
      // Update labels
      nodes.forEach((n, i) => {
        const dyOffset = 14;
        textEls[i].setAttribute('x', n.x);
        textEls[i].setAttribute('y', n.y - dyOffset);
      });
    };
    nodes.forEach((node, index) => {
      // Determine the visible radius based on the node's size.  A
      // minimum ensures people and small organisations remain legible,
      // while larger organisations scale up slightly for emphasis.
      const radius = node.size ? Math.max(4, 3 + node.size * 0.25) : 5;
      // Create a larger invisible hit circle to make small nodes easier to
      // click and drag.  Scale the hit radius with the visible radius
      // to ensure proportional click targets.
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('r', radius * 3);
      hit.setAttribute('fill', '#ffffff');
      hit.setAttribute('fill-opacity', '0.01');
      hit.setAttribute('stroke', 'none');
      hit.setAttribute('pointer-events', 'all');
      // Clicking selects the node for details
      hit.addEventListener('click', (event) => {
        event.stopPropagation();
        onNodeSelect(node);
      });
      // Start dragging on mousedown; record offset between the
      // pointer and node centre.  Cancel any running simulation so
      // manual repositioning feels immediate.
      hit.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        const rect = svgEl.getBoundingClientRect();
        const px = (event.clientX - rect.left - offsetX) / scale;
        const py = (event.clientY - rect.top - offsetY) / scale;
        draggingNode = node;
        dragOffset.x = node.x - px;
        dragOffset.y = node.y - py;
        // Halt the simulation so the dragged node doesn't keep
        // moving under physics.  We'll resume if necessary when
        // dragging ends.
        if (simulationId !== null) {
          cancelAnimationFrame(simulationId);
          simulationId = null;
        }
        // Zero out velocity to prevent residual drift
        node.vx = 0;
        node.vy = 0;
      });
      graphGroup.appendChild(hit);
      hitNodeEls.push(hit);
      // Create the visible glowing circle
      const vis = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      vis.setAttribute('r', radius);
      vis.classList.add('node-circle');
      const colour = DATA.nodeColors[node.type] || '#888';
      vis.style.setProperty('--pulse-colour', colour);
      vis.setAttribute('fill', colour);
      vis.setAttribute('stroke', colour);
      vis.setAttribute('title', node.name);
      vis.addEventListener('click', (event) => {
        event.stopPropagation();
        onNodeSelect(node);
      });
      vis.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        const rect = svgEl.getBoundingClientRect();
        const px = (event.clientX - rect.left - offsetX) / scale;
        const py = (event.clientY - rect.top - offsetY) / scale;
        draggingNode = node;
        dragOffset.x = node.x - px;
        dragOffset.y = node.y - py;
        if (simulationId !== null) {
          cancelAnimationFrame(simulationId);
          simulationId = null;
        }
        node.vx = 0;
        node.vy = 0;
      });
      vis.addEventListener('mouseover', () => {
        vis.setAttribute('stroke-width', '2');
      });
      vis.addEventListener('mouseout', () => {
        vis.setAttribute('stroke-width', '1');
      });
      graphGroup.appendChild(vis);
      nodeEls.push(vis);
    });
    // Create text elements for labels
    textEls = nodes.map((node) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = node.name;
      text.classList.add('node-label');
      graphGroup.appendChild(text);
      return text;
    });
    // Background click: if the click is close to a link, select the link;
    // otherwise clear selection.  We compute the click position in
    // graph coordinates (accounting for pan and zoom) and measure
    // the perpendicular distance to each link segment.  If the
    // minimum distance is below a threshold (scaled by zoom), we
    // treat the click as a link selection.  This fallback makes
    // connections easier to click even when pointer events on
    // individual lines fail.
    svgEl.addEventListener('click', (evt) => {
      // Ignore if any modifier key is held (to support zoom or pan)
      if (evt.defaultPrevented) return;
      const rect = svgEl.getBoundingClientRect();
      // Map from screen coordinates to graph space by reversing
      // the current transform (translation and scale)
      const x = (evt.clientX - rect.left - offsetX) / scale;
      const y = (evt.clientY - rect.top - offsetY) / scale;
      let nearest = null;
      let minDist = Infinity;
      // Distance function: perpendicular distance from point p to
      // segment a-b
      function distToSegment(px, py, ax, ay, bx, by) {
        // Compute squared distance
        const dx = bx - ax;
        const dy = by - ay;
        if (dx === 0 && dy === 0) {
          const dxp = px - ax;
          const dyp = py - ay;
          return Math.sqrt(dxp * dxp + dyp * dyp);
        }
        // Parameter t for projection
        let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
        t = Math.max(0, Math.min(1, t));
        const projX = ax + t * dx;
        const projY = ay + t * dy;
        const dX = px - projX;
        const dY = py - projY;
        return Math.sqrt(dX * dX + dY * dY);
      }
      links.forEach((l) => {
        const d = distToSegment(x, y, l.source.x, l.source.y, l.target.x, l.target.y);
        if (d < minDist) {
          minDist = d;
          nearest = l;
        }
      });
      // Determine a threshold based on current scale.  The threshold
      // decreases as we zoom in, but we cap it at 20 pixels in
      // screen space so links remain clickable.
      const thresholdScreen = 25; // pixels
      const thresholdGraph = thresholdScreen / scale;
      if (nearest && minDist <= thresholdGraph) {
        onLinkSelect(nearest);
      } else {
        onNodeSelect(null);
      }
    });
    // Implement zoom and pan
    offsetX = 0;
    offsetY = 0;
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
      const targetTag = e.target.tagName.toLowerCase();
      if (targetTag === 'svg' || targetTag === 'g') {
        isPanning = true;
        panStart.x = e.clientX;
        panStart.y = e.clientY;
      }
    });
    svgEl.addEventListener('mousemove', (e) => {
      // If a node is currently being dragged, update its position in
      // graph space and synchronise all positions immediately.  We map
      // from screen to graph coordinates using the current pan/zoom.
      if (draggingNode) {
        const rect = svgEl.getBoundingClientRect();
        const px = (e.clientX - rect.left - offsetX) / scale;
        const py = (e.clientY - rect.top - offsetY) / scale;
        draggingNode.x = px + dragOffset.x;
        draggingNode.y = py + dragOffset.y;
        updatePositionsInstant();
        return;
      }
      // Otherwise perform panning when the user drags the background.
      if (!isPanning) return;
      offsetX += e.clientX - panStart.x;
      offsetY += e.clientY - panStart.y;
      panStart.x = e.clientX;
      panStart.y = e.clientY;
      updateTransform();
    });
    svgEl.addEventListener('mouseup', () => {
      // End both dragging and panning on mouse up
      if (draggingNode) {
        draggingNode = null;
      }
      isPanning = false;
    });
    svgEl.addEventListener('mouseleave', () => {
      if (draggingNode) {
        draggingNode = null;
      }
      isPanning = false;
    });
    // Simulation parameters tuned for clustered, legible layouts.
    // Link distance sets the ideal length of edges; increasing this
    // spreads nodes further apart.  Strength scales the spring
    // force; low values produce gentle attraction.
    // Shorten the link distance slightly and use a weaker spring so
    // nodes settle into clusters with a graceful, slower motion.  A
    // shorter distance keeps related nodes together while preserving
    // legibility.  Link strength is low to minimise jitter.
    const linkDistance = 90;
    const linkStrength = 0.015;
    // Charge strength controls global repulsion between all nodes.
    // A mild negative value creates some breathing space without
    // overwhelming the clustering forces.
    const chargeStrength = -200;
    // Centering force gently pulls the entire graph toward the
    // middle of the view, preventing drift.
    const centerStrength = 0.0015;
    // Damping slows node velocities to achieve stability.  Lower
    // values slow the simulation faster.
    // Increase damping so the simulation dissipates energy more
    // quickly, producing a slower but less chaotic motion when a
    // persona is selected.  Higher damping values shorten the
    // duration of the scrambling phase.
    const damping = 0.75;
    // Cluster parameters.  Each unique category (from node.category) is
    // assigned to a point on a circle of radius clusterRadius around
    // the centre of the canvas.  Nodes are pulled toward their
    // category's centre by clusterStrength.
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
    // Reduce clusterStrength to gently pull nodes toward their
    // categories while allowing a graceful, slower reorganisation.
    const clusterStrength = 0.1;
    // Force simulation tick function
    function tick() {
      // Reset accumulated forces
      nodes.forEach((n) => {
        n.fx = 0;
        n.fy = 0;
      });
      // Link forces
      links.forEach((l) => {
        const dx = l.target.x - l.source.x;
        const dy = l.target.y - l.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = dist - linkDistance;
        const force = linkStrength * diff / dist;
        const fx = dx * force;
        const fy = dy * force;
        l.source.fx += fx;
        l.source.fy += fy;
        l.target.fx -= fx;
        l.target.fy -= fy;
      });
      // Charge (repulsion) forces
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];
          let dx = n2.x - n1.x;
          let dy = n2.y - n1.y;
          const dist2 = dx * dx + dy * dy + 0.01;
          const force = chargeStrength / dist2;
          const fx = dx * force;
          const fy = dy * force;
          n1.fx -= fx;
          n1.fy -= fy;
          n2.fx += fx;
          n2.fy += fy;
        }
      }
      // Centering force
      nodes.forEach((n) => {
        n.fx += (width / 2 - n.x) * centerStrength;
        n.fy += (height / 2 - n.y) * centerStrength;
      });
      // Cluster force: pull each node toward its category centre
      nodes.forEach((n) => {
        const centre = clusterCenters[n.category];
        if (centre) {
          n.fx += (centre.x - n.x) * clusterStrength;
          n.fy += (centre.y - n.y) * clusterStrength;
        }
      });
      // Integrate velocities and update positions
      nodes.forEach((n) => {
        n.vx = (n.vx + n.fx) * damping;
        n.vy = (n.vy + n.fy) * damping;
        n.x += n.vx;
        n.y += n.vy;
      });
      // Update link positions (both hit lines and visible lines)
      links.forEach((l, i) => {
        // Hit line
        hitLineEls[i].setAttribute('x1', l.source.x);
        hitLineEls[i].setAttribute('y1', l.source.y);
        hitLineEls[i].setAttribute('x2', l.target.x);
        hitLineEls[i].setAttribute('y2', l.target.y);
        // Visible line
        linkEls[i].setAttribute('x1', l.source.x);
        linkEls[i].setAttribute('y1', l.source.y);
        linkEls[i].setAttribute('x2', l.target.x);
        linkEls[i].setAttribute('y2', l.target.y);
      });
      // Update node positions (both visible and hit circles)
      nodes.forEach((n, i) => {
        nodeEls[i].setAttribute('cx', n.x);
        nodeEls[i].setAttribute('cy', n.y);
        hitNodeEls[i].setAttribute('cx', n.x);
        hitNodeEls[i].setAttribute('cy', n.y);
      });
      // Update label positions slightly above the node
      nodes.forEach((n, i) => {
        // Offset labels above the node by a fixed amount.  The
        // constant should be large enough to separate the label from
        // the glowing dot but small enough to keep it near the node.
        const dyOffset = 14;
        textEls[i].setAttribute('x', n.x);
        textEls[i].setAttribute('y', n.y - dyOffset);
      });
      tickCount++;
      if (tickCount < maxTicks) {
        simulationId = requestAnimationFrame(tick);
      } else {
        simulationId = null;
      }
    }
    let tickCount = 0;
    // Reduce the number of ticks to shorten the scrambling phase.  The
    // simulation will run for this many frames before stopping.  A
    // lower value produces a more ordered appearance more quickly.
    const maxTicks = 100;
    simulationId = requestAnimationFrame(tick);
  }

  /**
   * Highlight the currently selected node or link by adjusting
   * opacities and stroke colours.  When a link is selected, only
   * that link and its endpoints are emphasised; when a node is
   * selected, the node and its neighbours are emphasised.  When
   * nothing is selected, everything is reset.
   */
  function highlightSelection() {
    if (!nodes || !nodeEls || !linkEls) return;
    if (selectedLink) {
      // Highlight the selected link and its endpoints
      const srcId = selectedLink.source.id;
      const tgtId = selectedLink.target.id;
      nodes.forEach((n, i) => {
        const emphasised = (n.id === srcId || n.id === tgtId);
        nodeEls[i].setAttribute('opacity', emphasised ? 1 : 0.2);
        nodeEls[i].setAttribute('stroke-width', emphasised ? 2 : 1);
      });
      links.forEach((l, i) => {
        const emphasised = (l === selectedLink);
        linkEls[i].setAttribute('opacity', emphasised ? 1 : 0.05);
        linkEls[i].setAttribute('stroke-width', emphasised ? '2' : '1');
        // keep hit line width constant for clickability
        hitLineEls[i].setAttribute('stroke-width', '18');
      });
      return;
    }
    const neighbours = selectedNode && neighbourMap[selectedNode.id] ? neighbourMap[selectedNode.id] : null;
    nodes.forEach((n, i) => {
      let opac;
      let strokeWidth;
      if (!selectedNode) {
        opac = 1;
        strokeWidth = 1;
      } else {
        if (n.id === selectedNode.id || (neighbours && neighbours.has(n.id))) {
          opac = 1;
        } else {
          opac = 0.2;
        }
        strokeWidth = n.id === selectedNode.id ? 2 : 1;
      }
      nodeEls[i].setAttribute('opacity', opac);
      nodeEls[i].setAttribute('stroke-width', strokeWidth);
    });
    links.forEach((l, i) => {
      let opac;
      if (!selectedNode) {
        opac = 0.8;
      } else {
        if (l.source.id === selectedNode.id || l.target.id === selectedNode.id) {
          opac = 1;
        } else {
          opac = 0.05;
        }
      }
      linkEls[i].setAttribute('opacity', opac);
      // Do not override stroke colour; just adjust width slightly
      linkEls[i].setAttribute('stroke-width', '1');
      // hit line width constant
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

  /**
   * Render the details panel based on the current selection.  When a
   * connection (link) is selected, display the relationship
   * description and quick actions to open the connected nodes.  When a
   * node is selected, display its details, notes and watchlist
   * actions.  When nothing is selected, show a hint.
   */
  function updateDetailsPanel() {
    // Connection selected
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
    // Node selected
    if (selectedNode) {
      const node = selectedNode;
      let html = '';
      html += '<div class="details-header">';
      html += `<h3>${node.name}</h3>`;
      html += '<button class="close-button" aria-label="Close details">×</button>';
      html += '</div>';
      // Insert photo if available
      if (node.image_url) {
        // Wrap in a container to set custom pulse colour for glow on image
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
      // Bind actions
      detailsPanelEl.querySelector('.close-button').addEventListener('click', () => {
        onNodeSelect(null);
      });
      detailsPanelEl.querySelector('.watchlist-button').addEventListener('click', () => {
        addToWatchlist(node);
      });
      const notesTextarea = detailsPanelEl.querySelector('#notes-textarea');
      detailsPanelEl.querySelector('.save-note-button').addEventListener('click', () => {
        const text = notesTextarea.value;
        notes[node.id] = text;
        saveNoteToStorage(node.id, text);
      });
      return;
    }
    // Nothing selected
    detailsPanelEl.innerHTML = '<h3>Node details</h3><p>Click on a node in the graph to see its details.</p>';
  }

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
    changePersonaEl.addEventListener('click', () => {
      resetPersona();
    });
  }

  /**
   * Authentication and Supabase integration
   *
   * If a Supabase project URL and anon key are provided via the global
   * variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`, this function
   * initialises the Supabase client, binds the auth form and sign‑out
   * button, and restores any stored watchlist and notes from the
   * database.  When no Supabase configuration is present, the
   * application falls back to using localStorage for persistence and
   * bypasses the auth screen entirely.
   */
  async function initAuth() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (url && key) {
      try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        supabaseClient = createClient(url, key);
        usesSupabase = true;
      } catch (err) {
        console.error('Failed to load Supabase client:', err);
        usesSupabase = false;
      }
    }
    if (!usesSupabase) {
      authScreenEl.classList.add('hidden');
      signOutBtn.classList.add('hidden');
      loadFromLocalStorage();
      return;
    }
    bindSignOut();
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        handleSignedIn(session.user);
      } else {
        handleSignedOut();
      }
    });
    const { data: { session } } = await supabaseClient.auth.getSession();
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
        const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
        if (error) {
          authMessageEl.textContent = error.message;
        } else {
          authMessageEl.textContent = 'Check your email for a magic sign‑in link.';
        }
      } catch (err) {
        authMessageEl.textContent = 'Failed to send magic link.';
      }
    }, { once: true });
  }

  function bindSignOut() {
    signOutBtn.addEventListener('click', async () => {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
    });
  }

  function loadFromLocalStorage() {
    try {
      watchlist = JSON.parse(localStorage.getItem('dex-watchlist') || '[]');
    } catch (e) {
      watchlist = [];
    }
    try {
      notes = JSON.parse(localStorage.getItem('dex-notes') || '{}');
    } catch (e) {
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
      const { data, error } = await supabaseClient
        .from('watchlists')
        .select('node_id, name, type')
        .eq('user_id', currentUser.id);
      if (error) {
        console.warn('Could not fetch watchlist from Supabase:', error.message);
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
      const { data, error } = await supabaseClient
        .from('notes')
        .select('node_id, note')
        .eq('user_id', currentUser.id);
      if (error) {
        console.warn('Could not fetch notes from Supabase:', error.message);
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
    const rows = watchlist.map((item) => ({ user_id: currentUser.id, node_id: item.id, name: item.name, type: item.type }));
    try {
      const { error } = await supabaseClient.from('watchlists').upsert(rows, { onConflict: ['user_id', 'node_id'] });
      if (error) console.warn('Error saving watchlist to Supabase:', error.message);
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
      const { error } = await supabaseClient
        .from('notes')
        .upsert({ user_id: currentUser.id, node_id: nodeId, note: text }, { onConflict: ['user_id', 'node_id'] });
      if (error) console.warn('Error saving note to Supabase:', error.message);
    } catch (err) {
      console.warn('Error saving note:', err);
    }
  }

  /**
   * Suggestions: produce a list of nodes that the user might want to
   * explore next.  This simple implementation ranks nodes by the
   * number of connections (degree) and rewards nodes that are
   * directly connected to items in your watchlist.  Excludes nodes
   * already in your watchlist.
   */
  function updateSuggestionsPanel() {
    let html = '<h3>Suggestions</h3>';
    if (!persona) {
      html += '<p class="empty-text">Select a persona to see suggestions.</p>';
      suggestPanelEl.innerHTML = html;
      return;
    }
    // Ensure neighbourMap is available
    if (!neighbourMap) buildNeighbourMap();
    // Build degree map for nodes based on overall connectivity
    const degreeMap = {};
    DATA.links.forEach((l) => {
      degreeMap[l.source] = (degreeMap[l.source] || 0) + 1;
      degreeMap[l.target] = (degreeMap[l.target] || 0) + 1;
    });
    const watchIds = new Set(watchlist.map((w) => w.id));
    // Gather neighbours of the watchlist
    const watchNeighbours = new Set();
    watchlist.forEach((item) => {
      const neighbours = neighbourMap[item.id] || new Set();
      neighbours.forEach((id) => watchNeighbours.add(id));
    });
    // Gather interests of watchlist items if available
    const watchInterests = new Set();
    watchlist.forEach((item) => {
      const wn = DATA.nodes.find((n) => n.id === item.id);
      if (wn && wn.interests) wn.interests.forEach((i) => watchInterests.add(i.toLowerCase()));
    });
    // Compute a priority score and reasons for each candidate
    const candidates = DATA.nodes
      .filter((n) => !watchIds.has(n.id))
      .map((n) => {
        let score = 0;
        const reasons = [];
        // High priority if connected directly to watchlist
        if (watchNeighbours.has(n.id)) {
          score += 5;
          reasons.push('connected to your watchlist');
        }
        // Add score for degree (popularity)
        const deg = degreeMap[n.id] || 0;
        score += deg * 0.5;
        if (deg > 0) reasons.push(`${deg} connections in the network`);
        // Add score for shared interests
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
        // Bonus if node type matches persona
        if (persona && n.type === persona) {
          score += 1;
          reasons.push('matches your persona');
        }
        return { node: n, score, reasons };
      })
      .filter((entry) => entry.score > 0);
    // Sort by descending score
    candidates.sort((a, b) => b.score - a.score);
    // Limit to top 5
    const top = candidates.slice(0, 5);
    if (top.length === 0) {
      html += '<p class="empty-text">No suggestions available.</p>';
      suggestPanelEl.innerHTML = html;
      return;
    }
    html += '<p class="suggest-intro">Dex suggests the following entities in order of relevance. The first items are most closely connected to your watchlist and interests.</p>';
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

  /**
   * Populate the instructions panel with guidance on using Dex.  This
   * content explains how to select a persona, explore the graph,
   * manage your watchlist and interpret the suggestions list.  It is
   * called when the persona is set.
   */
  function renderInstructionsPanel() {
    let html = '<h3>How to use Dex</h3>';
    html += '<p><strong>Select your persona:</strong> Choose the role that best describes you to tailor alerts and recommendations to your needs.</p>';
    html += '<p><strong>Explore the graph:</strong> Each glowing dot represents an organisation or person.  Colours correspond to roles (startups, investors, universities, incubators, service providers and individuals).  Lines (synapses) show relationships such as investments, spin‑outs, services and shared interests.  Pan and zoom to explore the network.  You can also reposition any node by dragging it to a new location.</p>';
    html += '<p><strong>View details:</strong> Click on a node to see a description, a photo (if available), external links and your personal notes.  Click on a connection to learn how two entities relate and jump between them.</p>';
    html += '<p><strong>Build your watchlist:</strong> Add entities to your watchlist to keep track of them.  Dex uses your watchlist and interests to prioritise recommendations and highlight opportunities.</p>';
    html += '<p><strong>Understand suggestions:</strong> The suggestions panel orders people and organisations by their relevance to you.  The reasons beneath each name explain why it could be valuable to connect next—such as shared interests, direct connections or popularity.</p>';
    html += '<p><strong>Make connections:</strong> Start with the top suggestion and work your way down.  As you explore and add items to your watchlist, Dex continually refreshes the order based on your evolving interests.</p>';
    instructionsPanelEl.innerHTML = html;
  }

  // Initialise the application once the DOM is ready
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