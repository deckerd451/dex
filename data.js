// Data definitions for the Dex static site. Nodes and links define the
// synthetic innovation ecosystem used to demonstrate Dex’s graph.
// Colours are encoded per type and reused in CSS by injecting
// appropriate style attributes.

// NOTE: This copy of the sample data has been modified from the upstream
// repository to resolve network‑related errors when loading placeholder
// images. The original code pointed at https://via.placeholder.com which
// cannot be resolved in some environments (resulting in
// ERR_NAME_NOT_RESOLVED errors). To avoid these issues the image URLs
// below now point at https://placehold.co instead. placehold.co is a
// free service for generating simple placeholder images and is
// accessible from the runtime environment. If you wish to supply your
// own images, update the `image_url` fields accordingly.

window.DEX_DATA = {
  /**
   * Colour palette for each node category. These hues are used to
   * drive the pulsing glow animation defined in CSS. Feel free to
   * customise these values to adjust vibrancy or meaning. See
   * style.css for the corresponding animation definitions.
   */
  nodeColors: {
    startup: '#00ffd9',        // neon aqua for startups (AI/biotech)
    investor: '#ff00ff',       // bright magenta for investors
    university: '#ff493f',     // vibrant coral for universities
    serviceProvider: '#ffee00',// electric yellow for service providers
    incubator: '#7eff00',      // lime green for incubators/accelerators
    // Colour for individual community members. People are rendered as
    // their own cluster and use a bright cyan to stand out against
    // organisations. When you load a community CSV, nodes with
    // category `person` will inherit this colour.
    person: '#00cfff'
  },
  /**
   * Colour palette for each link type. Connection colours reflect the
   * nature of the relationship (e.g. spin‑outs are cool cyan, investments
   * are warm orange). These colours control the glow of the lines
   * connecting nodes.
   */
  linkColors: {
    spinout: '#00bfff',     // sky blue for spin‑out relationships
    investment: '#ffa500',  // orange for investment deals
    support: '#ff1493',     // deep pink for incubator support
    service: '#40e0d0',     // turquoise for legal services
    consulting: '#adff2f',  // green yellow for consulting
    // Colour used for interest‑based connections between people and
    // organisations. These links appear when a person shares one or
    // more interests with a company or institution in the network.
    interest: '#00aaff'
  },
  nodes: [
    {
      id: 'startup1',
      name: 'AI Diagnostics Co',
      type: 'startup',
      category: 'startup',
      size: 10,
      description: 'A healthtech startup developing AI algorithms to assist radiologists with early disease detection.',
      website: 'https://example.com/ai-diagnostics',
      // Use placehold.co instead of via.placeholder.com to avoid DNS errors
      image_url: 'https://placehold.co/200x200?text=AI+Diagnostics'
    },
    {
      id: 'startup2',
      name: 'NeuroTech Labs',
      type: 'startup',
      category: 'startup',
      size: 9,
      description: 'A Georgia Tech spin‑out building brain‑computer interfaces for neuroprosthetics.',
      website: 'https://example.com/neurotech-labs',
      image_url: 'https://placehold.co/200x200?text=NeuroTech'
    },
    {
      id: 'startup3',
      name: 'BioGenix',
      type: 'startup',
      category: 'startup',
      size: 8,
      description: 'A biotech company using CRISPR to develop precision therapeutics.',
      website: 'https://example.com/biogenix',
      image_url: 'https://placehold.co/200x200?text=BioGenix'
    },
    {
      id: 'vc1',
      name: 'Seed Capital Partners',
      type: 'investor',
      category: 'investor',
      size: 12,
      description: 'A venture capital firm focused on early stage healthtech and life science startups.',
      website: 'https://example.com/seed-capital',
      image_url: 'https://placehold.co/200x200?text=Seed+Capital'
    },
    {
      id: 'vc2',
      name: 'Frontier Ventures',
      type: 'investor',
      category: 'investor',
      size: 13,
      description: 'A growth equity fund investing in frontier technologies including neurotech and AI.',
      website: 'https://example.com/frontier-ventures',
      image_url: 'https://placehold.co/200x200?text=Frontier'
    },
    {
      id: 'gatech',
      name: 'Georgia Tech',
      type: 'university',
      category: 'university',
      size: 14,
      description: 'A leading public research university and a prolific source of spin‑out companies across engineering and life sciences.',
      website: 'https://gatech.edu',
      image_url: 'https://placehold.co/200x200?text=Georgia+Tech'
    },
    {
      id: 'emory',
      name: 'Emory University',
      type: 'university',
      category: 'university',
      size: 14,
      description: 'A private research university in Atlanta known for its medical school and biotechnology research.',
      website: 'https://emory.edu',
      image_url: 'https://placehold.co/200x200?text=Emory'
    },
    {
      id: 'incubator1',
      name: 'ATDC Incubator',
      type: 'incubator',
      category: 'incubator',
      size: 10,
      description: 'An incubator at Georgia Tech providing mentorship and resources to early stage startups.',
      website: 'https://example.com/atdc',
      image_url: 'https://placehold.co/200x200?text=ATDC'
    },
    {
      id: 'service1',
      name: 'LawTech Partners',
      type: 'serviceProvider',
      category: 'serviceProvider',
      size: 9,
      description: 'A law firm specialising in intellectual property and regulatory affairs for biotech startups.',
      website: 'https://example.com/lawtech',
      image_url: 'https://placehold.co/200x200?text=LawTech'
    },
    {
      id: 'service2',
      name: 'BioConsulting Group',
      type: 'serviceProvider',
      category: 'serviceProvider',
      size: 8,
      description: 'A consultancy helping startups navigate clinical trial design and regulatory strategy.',
      website: 'https://example.com/bioconsulting',
      image_url: 'https://placehold.co/200x200?text=BioConsulting'
    }
  ],
  links: [
    { source: 'gatech', target: 'startup2', type: 'spinout', description: 'NeuroTech Labs is a spin‑out from Georgia Tech.' },
    { source: 'vc1', target: 'startup1', type: 'investment', description: 'Seed Capital Partners invested in AI Diagnostics Co.' },
    { source: 'vc2', target: 'startup2', type: 'investment', description: 'Frontier Ventures invested in NeuroTech Labs.' },
    { source: 'vc2', target: 'startup3', type: 'investment', description: 'Frontier Ventures invested in BioGenix.' },
    { source: 'incubator1', target: 'startup1', type: 'support', description: 'ATDC provides incubation services to AI Diagnostics Co.' },
    { source: 'incubator1', target: 'startup2', type: 'support', description: 'ATDC provides incubation services to NeuroTech Labs.' },
    { source: 'service1', target: 'startup1', type: 'service', description: 'LawTech Partners represents AI Diagnostics Co. on IP matters.' },
    { source: 'service1', target: 'startup3', type: 'service', description: 'LawTech Partners represents BioGenix on regulatory matters.' },
    { source: 'service2', target: 'startup2', type: 'consulting', description: 'BioConsulting Group is advising NeuroTech Labs on clinical trial design.' },
    { source: 'service2', target: 'startup3', type: 'consulting', description: 'BioConsulting Group is advising BioGenix on regulatory strategy.' }
  ]
};

// Sample persona alerts keyed by persona. In a production system these would
// come from a backend service and be dynamically generated. Here they reflect
// the examples provided in the Dex presentation.
window.DEX_ALERTS = {
  founder: [
    {
      id: 'alert-f-1',
      title: '2 new investors funding AI diagnostics in your city',
      description: 'Seed Capital Partners and Frontier Ventures have both announced new seed funds focused on AI in healthcare. Explore their profiles and add them to your watchlist.'
    },
    {
      id: 'alert-f-2',
      title: 'New incubator programme now accepting applications',
      description: 'ATDC has opened applications for its next cohort. Early stage startups working on diagnostics are encouraged to apply.'
    }
  ],
  investor: [
    {
      id: 'alert-i-1',
      title: '3 neurotech startups spun out of Georgia Tech this week',
      description: 'Georgia Tech has announced three new neurotech spinouts. Two are focused on brain–computer interfaces and one on neural imaging. Review the startups to see if they fit your thesis.'
    },
    {
      id: 'alert-i-2',
      title: 'Emory spinout raises Series A',
      description: 'BioGenix, a recent spin‑out from Emory, has closed a $20M Series A round. Competitive investors are moving quickly in this space.'
    }
  ],
  university: [
    {
      id: 'alert-u-1',
      title: '2 Emory spinouts just raised Series A',
      description: 'BioGenix and another Emory spin‑out have both closed Series A rounds this week. Analyse the investors involved and update your internal records.'
    },
    {
      id: 'alert-u-2',
      title: 'New tech transfer regulations announced',
      description: 'The USPTO has released updated guidance on IP ownership for university spinouts. Review the new rules and adjust your processes accordingly.'
    }
  ],
  serviceProvider: [
    {
      id: 'alert-s-1',
      title: '5 Atlanta startups raised funding this week',
      description: 'Multiple Atlanta‑area startups have closed funding rounds this week. There may be opportunities to offer legal, regulatory or consulting services.'
    },
    {
      id: 'alert-s-2',
      title: 'Emerging biotech companies lack regulatory support',
      description: 'A number of early stage biotech companies in the region are struggling to navigate FDA requirements. Reach out to offer guidance and services.'
    }
  ]
};
