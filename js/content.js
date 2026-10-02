/*
  ============================================================
  SITE CONTENT — edit this file to update almost everything
  ============================================================
  This is the single place to change team info, mentors, robots,
  sponsors, events, and images. Every page reads from here, so a
  change here shows up everywhere it's used.

  IMAGES: paste a Google Drive "shareable link" image URL as the
  value. Easiest way to get a usable direct-image URL from Drive:
    1. Right click the image in Drive -> Share -> "Anyone with the link"
    2. Copy the file ID from the share link
       (drive.google.com/file/d/FILE_ID_HERE/view)
    3. Use this format:
       https://lh3.googleusercontent.com/d/FILE_ID_HERE
  That format reliably renders as a hotlinked <img>, unlike the
  raw "/view" share link.
*/

const SITE = {
  teamNumber: "2972",
  teamName: "Gears & Buccaneers",
  school: "Dawson School",
  location: "Lafayette, Colorado",
  tagline: "Real-world engineering, fundraising, and competition.",
  mission: "To build a confident and capable next generation through competitive robotics.",
  email: "robotics@dawsonschool.org",
  instagram: "https://www.instagram.com/frc2972/",
  instagramHandle: "@frc2972",
  logo: "assets/placeholder-logo.svg",
  heroImage: "assets/placeholder-hero.svg",
};

// Upcoming competitions — edit dates/events each season
const SCHEDULE_2026 = [
  { event: "Denver Regional", dates: "April 8–11, 2026", location: "Denver, CO" },
  { event: "Utah Regional", dates: "April 16–18, 2026", location: "Salt Lake City, UT" },
];

// About Dawson School blurb (used on About page + Home)
const ABOUT_SCHOOL = {
  heading: "About Dawson School",
  body: `Team ${SITE.teamNumber} consists of students mainly from Dawson School, an
  independent, private, college-prep school serving students in grades K-12 on a
  107-acre campus in ${SITE.location}. Dawson's small class sizes and hands-on
  approach to learning give our students the freedom to dive deep into engineering,
  design, and teamwork long before college.`,
};

const ABOUT_FIRST = {
  heading: "What is FIRST Robotics?",
  body: `FIRST Robotics Competition (FRC) challenges high school students to design,
  build, and program an industrial-size robot in just six weeks to compete in a new
  game each season. Teams combine the excitement of sport with the rigor of science
  and technology — working alongside professional engineers and mentors to solve a
  common problem. Along the way, students learn to manage a real budget, market their
  brand, and work as a business as much as an engineering team.`,
};

// Mentors & coaches — add/remove people freely, order = display order
const MENTORS = [
  {
    name: "Tessa Rider",
    role: "Head Coach",
    bio: "Dawson School alumna ('11) and parent. M.E. in Nuclear Engineering from the Colorado School of Mines.",
    photo: "assets/placeholder-headshot.svg",
    current: true,
  },
  {
    name: "Jacob Goldman",
    role: "Lead Mentor",
    bio: "Dawson School alumnus ('15). B.S. in Computer Science & Entrepreneurship from the University of Denver. Startup founder.",
    photo: "assets/placeholder-headshot.svg",
    current: true,
  },
  {
    name: "Rami Mouro",
    role: "All-Around Mentor",
    bio: "Extensive FIRST experience as an FTC volunteer and Field Technical Advisor. Works at Qualcomm.",
    photo: "assets/placeholder-headshot.svg",
    current: true,
  },
  {
    name: "John Fu",
    role: "Electronics Mentor",
    bio: "Hardware Engineer at Cesium Astro.",
    photo: "assets/placeholder-headshot.svg",
    current: true,
  },
  {
    name: "Lisa Kistner",
    role: "Parent Volunteer",
    bio: "Architect.",
    photo: "assets/placeholder-headshot.svg",
    current: true,
  },
  {
    name: "Gavin Kistner",
    role: "Programming & Software Mentor",
    bio: "Software Engineer at NVIDIA.",
    photo: "assets/placeholder-headshot.svg",
    current: true,
  },
];

const PAST_MENTORS = ["Terry Young", "Ryan Depew", "Erik Nickerson", "Kyle Miner"];

// Robots by season — newest first. Add a new object each season.
const ROBOTS = [
  {
    year: "2025",
    game: "Reefscape",
    name: "Sea Bunny",
    status: "In service",
    image: "assets/placeholder-robot.svg",
    specs: [
      { label: "Weight", value: "120 lbs" },
      { label: "Dimensions", value: '30" W x 30" L x 86" H' },
      { label: "Drive system", value: "4-wheel SDS MK4i swerve drive" },
      { label: "Primary mechanism", value: "Three-stage continuous elevator" },
      { label: "Scoring", value: "Coral placement on all levels, algae picker, deployable low-hang cage climb" },
    ],
    description: `Built for Reefscape, where alliances score by placing PVC pipes ("Coral") and
    playground balls ("Algae") onto goals, and climbing a truss structure ("Barge") for
    bonus points at match end.`,
    results: [
      { event: "Minnesota North Star Regional", result: "Rank 42" },
      { event: "Kansas City Regional (KCMT)", result: "Rank 27 — 3rd pick, Alliance 5" },
    ],
    links: [
      { label: "GitHub", url: "#" },
      { label: "Onshape CAD", url: "#" },
    ],
  },
  {
    year: "2024",
    game: "Crescendo",
    name: "TODO: robot name",
    status: "Retired",
    image: "assets/placeholder-robot.svg",
    specs: [],
    description: "TODO: add 2024 Crescendo robot description, specs, and results.",
    results: [],
    links: [],
  },
  {
    year: "2023",
    game: "Charged Up",
    name: "TODO: robot name",
    status: "Retired",
    image: "assets/placeholder-robot.svg",
    specs: [],
    description: "TODO: add 2023 Charged Up robot description, specs, and results.",
    results: [],
    links: [],
  },
];

// Sponsors — grouped by tier. Add/remove/reorder freely.
const SPONSOR_TIERS = [
  {
    tier: "2025 Sponsors",
    sponsors: [
      // TODO: add current-year sponsor names + logos as they confirm
    ],
  },
  {
    tier: "2024 Sponsors",
    sponsors: [
      { name: "BAE Systems", logo: "assets/placeholder-sponsor.svg" },
      { name: "Syniti", logo: "assets/placeholder-sponsor.svg" },
      { name: "NVIDIA", logo: "assets/placeholder-sponsor.svg" },
      { name: "Hirsh Precision Products", logo: "assets/placeholder-sponsor.svg" },
      { name: "The Goldman Family", logo: "assets/placeholder-sponsor.svg" },
      { name: "Dawson School", logo: "assets/placeholder-sponsor.svg" },
      { name: "Dawson Parent Association", logo: "assets/placeholder-sponsor.svg" },
      { name: "Hass", logo: "assets/placeholder-sponsor.svg" },
      { name: "Hagerity", logo: "assets/placeholder-sponsor.svg" },
    ],
  },
];

const SPONSOR_PACKET_URL = "#"; // TODO: paste Google Drive link to sponsorship packet PDF

// Outreach / community events — add one object per event
const OUTREACH_EVENTS = [
  // TODO: add outreach events, e.g.
  // { name: "Dawson FLL Scrimmage", date: "Jan 2026", description: "Hosted a scrimmage for local FIRST LEGO League teams.", image: "assets/placeholder-event.svg" },
];

// Resources / documents — label + Drive (or other) link
const RESOURCE_LINKS = [
  { category: "Documents & Code", items: [
    { label: "Team GitHub", url: "#" },
    { label: "Onshape CAD models", url: "#" },
  ]},
  { category: "Handbook", items: [
    { label: "Team Handbook (PDF)", url: "#" },
  ]},
  { category: "Branding", items: [
    { label: "Logo & brand assets", url: "#" },
  ]},
  { category: "Workshop", items: [
    { label: "Workshop location & hours", url: "#" },
  ]},
  { category: "3D CAD Modeling Overview", items: [
    { label: "CAD onboarding guide", url: "#" },
  ]},
];

// Media galleries — Drive image links
const MEDIA_PHOTOS = [
  // TODO: add photo URLs, e.g. "assets/placeholder-gallery.svg"
];
const MEDIA_VIDEOS = [
  // TODO: add YouTube/Drive video embed URLs
];
const MEDIA_PUBLICITY = [
  // TODO: add press/publicity links, e.g. { title: "...", url: "#", outlet: "..." }
];
