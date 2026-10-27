/*
  ============================================================
  SITE CONTENT — edit this file to update almost everything
  ============================================================
  This is the single place to change team info, robots,
  sponsors, events, and images. Every page reads from here, so a
  change here shows up everywhere it's used.

  IMAGES: photos come from Google Drive only (they are not kept in git).
    1. Right click the image in Drive -> Share -> "Anyone with the link"
    2. Copy the file ID from the share link
       (drive.google.com/file/d/FILE_ID_HERE/view)
    3. Use this format, with a width that fits where it's shown:
       https://lh3.googleusercontent.com/d/FILE_ID_HERE=w800
       (logo w200, hero w1600, robots/history w800, headshots and
       logos w400, gallery thumbnails w600; see README)
  That format renders as an <img>, unlike the raw "/view" share link.

  LINKS: a url of "#" means "not set yet" — pages hide those links
  (or show them as "coming soon") instead of linking nowhere.
*/

const SITE = {
  teamNumber: "2972",
  teamName: "Gears & Buccaneers",
  school: "Dawson School",
  location: "Lafayette, Colorado",
  founded: "2008",
  tagline: "Real-world engineering, fundraising, and competition.",
  mission: "To build a confident and capable next generation through competitive robotics.",
  email: "robotics@dawsonschool.org",
  instagram: "https://www.instagram.com/frc2972/",
  instagramHandle: "@frc2972",
  github: "https://github.com/Gears-and-Buccaneers",
  logo: "brand/team-2972-logo-256.png",
  heroImage: "assets/brand/team-2025.jpg",
  schoolLogo: "assets/brand/dawson-school.png",
  schoolUrl: "https://www.dawsonschool.org",
};

// The Blue Alliance links are built from the team number — never stored.
const tbaTeamYear = (year) => `https://www.thebluealliance.com/team/${SITE.teamNumber}/${year}`;
const tbaEvent = (key) => `https://www.thebluealliance.com/event/${key}`;

// Upcoming competitions — edit dates/events each season
const SCHEDULE_2027 = [
  { event: "Denver Regional", dates: "Spring 2027, dates to come", location: "Denver, CO" }, // TODO: exact dates when FIRST posts them
  { event: "Intermountain West Regional", dates: "Spring 2027, dates to come", location: "Utah" }, // TODO: exact dates and city
];

// Events the team goes to most years (from the old Calendar page)
const ANNUAL_EVENTS = [
  { name: "Denver Regional", when: "Spring", description: "Our home regional." },
  { name: "Out-of-state Regional", when: "Spring", description: "A second regional each season, recently Utah, Kansas City, Oklahoma, and Minnesota." },
  { name: "KCMT Offseason Tournament", when: "Fall", description: "The Kendrick Castillo Memorial Tournament, a Colorado offseason event." },
  { name: "Broomfield Days", when: "Fall", description: "Robot demos for the local community." },
];

// Google Calendar shared with the team (also a portal tile in infra/config/apps.json)
const TEAM_CALENDAR_URL =
  "https://calendar.google.com/calendar/embed?src=c_4e72069c8bd9568f2218c71e58a6ed7cbb7471b08fb6410b0405c95acc4da73a%40group.calendar.google.com";

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

const VALUES = [
  { name: "Respect", text: "Treat people, equipment, and spaces with care." },
  { name: "Growth", text: "Learn new skills, try hard things, and improve every day." },
  { name: "Safety", text: "Protect yourself and your teammates at all times." },
  { name: "Teamwork", text: "Communicate, support each other, and solve problems together." },
  { name: "Ownership", text: "Take responsibility for your work, tools, and commitments." },
  { name: "Inclusion", text: "Everyone belongs, contributes, and can succeed here." },
  { name: "Fun", text: "Enjoy the challenge and the journey." },
];

const STRATEGY = [
  { name: "Lead with students", text: "Students design, build, code, plan, and make key decisions." },
  { name: "Mentor up", text: "Experienced students teach new students; everyone learns by doing." },
  { name: "Work safely and professionally", text: "Follow procedures, use PPE, and represent the team well." },
  { name: "Build smart", text: "Use CAD, CAM, and testing to design robots that are reliable and competitive." },
  { name: "Show up", text: "Commit to meetings, communicate clearly, and follow through on tasks." },
  { name: "Improve continuously", text: "Reflect, iterate, and upgrade both the robot and the team culture." },
  { name: "Engage the community", text: "Compete hard, share knowledge, and inspire others through outreach." },
];

// Team history: a short timeline of milestones plus a "today" block. Text may contain links.
// To add photos from the past or present, give a milestone an `image` (Drive path) and `imageAlt`.
const HISTORY = {
  // Each year lists "comp" (competition results) and "team" (space, shop, organization) items; comp shows first.
  milestones: [
    { year: "2008", items: [
      { kind: "team", text: "Founded as Robotics Club (RC) Dawson by a Dawson physics teacher, working out of the back of the physics room." },
    ] },
    { year: "2009", items: [
      { kind: "comp", text: "Our first FRC season." },
    ] },
    { year: "2011", items: [
      { kind: "comp", text: `Won the <a href="robot.html?year=2011">Colorado Regional</a> with an aggressive defensive strategy.` },
    ] },
    { year: "2013", items: [
      { kind: "comp", text: "Built our best robot of the team's first five years and moved into the top 25, where we stayed until 2017." },
    ] },
    { year: "2014", items: [
      { kind: "comp", text: "Ranked 7th at the Colorado Regional and captained the 4th alliance to the semifinals." },
    ] },
    { year: "2019", items: [
      { kind: "comp", text: "Ranked 9th in qualifiers and captained alliance 8 in Colorado." },
    ] },
    { year: "2021", items: [
      { kind: "team", text: "Moved out of the physics room and into a new, larger space." },
    ] },
    { year: "2023", items: [
      { kind: "comp", text: "Ranked 9th and led alliance 7 at the Green Country Regional." },
      { kind: "team", text: "Started a machine shop and wrote the team's first handbook." },
    ] },
    { year: "2025", items: [
      { kind: "team", text: "Added a lathe and a CNC router to the shop." },
    ] },
    { year: "2026", items: [
      { kind: "comp", text: `Our robot <a href="robot.html?year=2026">Theseus</a> won the Utah Regional as the second pick of Alliance 2.` },
      { kind: "team", text: "Building a permanent two-thirds-length practice field." },
    ] },
  ],
  today: {
    heading: "Where we are now",
    paragraphs: [
      `Team 2972 is growing and doing well. Grants from the Dawson Parent Association and private
      donations have turned a back room into a real workshop, and we are building a permanent
      two-thirds-length practice field. Students machine parts on a lathe, a CNC mill and a CNC router, cut stock on
      horizontal and vertical bandsaws and a miter saw, and prototype on new 3D printers and a laser
      engraver/cutter. A new parts library keeps the components we need on hand, so we spend our time
      building instead of waiting on orders. Students learn to design, make and wire a competition
      robot with mentors and parent volunteers beside them.`,
    ],
    image: "assets/brand/team-2025.jpg",
    imageAlt: "Team 2972 at a 2025 regional",
  },
};

/*
  ROBOTS — one object per season, newest first.

  Required: year, game.
  Everything else is optional; a page section only shows when its field is set.
    name          Robot name. Leave "" if unknown (shows "<year> Robot", e.g. "2022 Robot").
    status        "In service", "Retired", ...
    image         Main photo. Leave "" if there is no photo yet.
    photoSource   Caption for where the photo came from, e.g. "Screenshot from QF2 video".
    tagline       One line for the archive card.
    stats         One-line season summary, e.g. "2 events · best rank #9 · alliance captain".
    gameSummary   What the game was.
    gameVideo     YouTube URL of the official game animation.
    reveal        YouTube URL of the robot reveal video.
    description   A paragraph about the robot.
    specs         [{ label, value }] quick facts.
    mechanisms    [{ name, text }] subsystems / abilities.
    results       [{ event, result, tba }] — tba is the TBA event key (e.g. "2025mnum").
    awards        ["Colorado Regional Winners", ...]
    gallery       [image urls]
    videos        [YouTube urls] embedded on the page.
    matchVideos   [{ label, url }] links to match videos.
    binder        Technical binder / info sheet URL.
    buildBlog     [{ label, url }] build threads and blog posts.
    links         [{ label, url }] CAD, code, and anything else.
  The Blue Alliance link for the season is added automatically.
*/
const ROBOTS = [
  {
    year: "2026",
    game: "REBUILT",
    name: "Theseus",
    status: "In service",
    image: "", // TODO: add a photo of Theseus
    tagline: "Utah Regional winners.",
    stats: "3 events · Utah Regional Winners · 2nd pick, Alliance 2",
    gameSummary: "", // TODO: describe the 2026 game, REBUILT
    description: "", // TODO: describe Theseus
    results: [
      { event: "Denver Regional", result: "Rank 49 of 55 (2-7-0)", tba: "2026code" },
      { event: "Utah Regional", result: "Rank 38 of 42 — 2nd pick of Alliance 2, won the event", tba: "2026utwv" },
      { event: "Kendrick Castillo Memorial Tournament (KCMT)", result: "Rank 14 of 31 (7-5-0) — 2nd pick, Alliance 5", tba: "2026cokc" },
    ],
    awards: ["Utah Regional Winners"],
    links: [],
  },
  {
    year: "2025",
    game: "Reefscape",
    name: "Sea Bunny",
    status: "In service",
    image: "assets/robots/2025-sea-bunny.jpg",
    tagline: "Three-stage elevator that scores Coral on every level.",
    stats: "2 events · best rank #27 at KCMT · 3rd pick, Alliance 5",
    gameSummary: `Reefscape is the 2025 game, themed around clean oceans. Two alliances of three
    robots each score PVC pipes (called Coral) and playground balls (called Algae) onto goals. At
    the end of each match, robots move to a truss structure called the Barge and climb metal Cages
    to earn additional points.`,
    gameVideo: "https://www.youtube.com/watch?v=YWbxcjlY9JY",
    specs: [
      { label: "Weight", value: "120 lbs" },
      { label: "Dimensions", value: '30" W x 30" L x 86" H' },
      { label: "Drive system", value: "4-wheel SDS MK4i swerve drive" },
    ],
    mechanisms: [
      { name: "Elevator", text: "Three-stage, continuous elevator." },
      { name: "Coral scoring", text: "Scores Coral on all levels." },
      { name: "Climber", text: "Deployable low-hang cage climber." },
      { name: "Algae picker", text: "Removed during the season." },
    ],
    results: [
      { event: "Colorado Springs Scrimmage", result: "Scrimmage" },
      { event: "Minnesota North Star Regional", result: "Rank 42 of 47 (3-8-0)", tba: "2025mnum" },
      { event: "Kendrick Castillo Memorial Tournament (KCMT)", result: "Rank 27 of 40 — 3rd pick, Alliance 5", tba: "2025cokc" },
    ],
    gallery: [
      "assets/robots/2025-sea-bunny-cad.png",
      "assets/gallery/2025-competition-1.jpg",
      "assets/gallery/2025-competition-2.jpg",
      "assets/gallery/2025-competition-3.jpg",
      "assets/gallery/2025-competition-4.jpg",
      "assets/gallery/2025-competition-5.jpg",
      "assets/gallery/2025-competition-6.jpg",
      "assets/gallery/2025-competition-7.jpg",
      "assets/gallery/2025-build-1.jpg",
      "assets/gallery/2025-build-2.jpg",
      "assets/gallery/2025-build-3.jpg",
      "assets/gallery/2025-build-4.jpg",
      "assets/gallery/2025-build-5.jpg",
      "assets/gallery/2025-build-6.jpg",
      "assets/gallery/2025-build-7.jpg",
      "assets/gallery/2025-build-8.jpg",
      "assets/gallery/2025-build-9.jpg",
      "assets/gallery/2025-build-10.jpg",
      "assets/gallery/2025-build-11.jpg",
      "assets/gallery/2025-build-12.jpg",
      "assets/gallery/2025-build-13.jpg",
      "assets/gallery/2025-build-14.jpg",
    ],
    videos: ["https://www.youtube.com/watch?v=CB1DmHxDGQw"],
    links: [
      { label: "Code (GitHub)", url: "https://github.com/Gears-and-Buccaneers/2025" },
      { label: "CAD (Onshape)", url: "https://cad.onshape.com/documents/387aadf923da0d9d66a856c8/w/577516ee2b5ebb1d84a14e4d/e/7b791fb20206737e0edf2701" },
    ],
  },
  {
    year: "2024",
    game: "Crescendo",
    name: "Sea Shanty",
    status: "Retired",
    image: "assets/robots/2024-sea-shanty.jpg",
    tagline: "Picked for playoff alliances at both regionals.",
    stats: "3 events · best rank #18 at KCMT · playoffs at both regionals",
    gameSummary: `Crescendo is the 2024 game, themed around music. Two alliances of three robots
    each shoot orange rings (called Notes) into goals, and hang on chains at the end of the match.`,
    description: "", // TODO: describe Sea Shanty
    results: [
      { event: "Green Country Regional", result: "Rank 22 of 43 — 2nd pick, Alliance 7", tba: "2024oktu" },
      { event: "Greater Kansas City Regional", result: "Rank 20 of 42 — 2nd pick, Alliance 5", tba: "2024mokc" },
      { event: "Kendrick Castillo Memorial Tournament (KCMT)", result: "Rank 18 of 45", tba: "2024cokc" },
    ],
    gallery: ["assets/robots/2024-sea-shanty-2.jpg"],
    links: [],
  },
  {
    year: "2023",
    game: "Charged Up",
    name: "Scurvy",
    status: "Retired",
    image: "assets/robots/2023-scurvy.jpg",
    tagline: "Telescoping arm and a 12-auto playbook.",
    stats: "2 regionals · rank #9 at Green Country · alliance captain",
    gameSummary: `Charged Up is the 2023 game. Two alliances of three robots each place cones and
    cubes onto a grid of scoring nodes, then drive onto and balance a tilting Charge Station.`,
    description: `Scurvy is very narrow and light, making him ideal for a triple balance on the
    Charge Station. To prevent sliding off after climbing, we lock our wheels.`,
    specs: [
      { label: "Frame", value: '24" x 35" rectangular chassis' },
      { label: "Drive system", value: "Swerve drive, Falcon 500 motors" },
      { label: "Autonomous", value: "12 different autos, 100% success rate" },
    ],
    mechanisms: [
      { name: "Gripper", text: "Dual pneumatics on a 4-bar mechanism with automatic piece orientation. Picks up cones and cubes from the player station and the ground." },
      { name: "Boom", text: "Two-stage AndyMark Climber-in-a-Box on a 10:1 CIM. Extends and retracts 46\" in 0.5 seconds, placing cubes on all levels and cones on the bottom and middle." },
      { name: "Auto", text: "Every permutation of placing a piece on any level, auto-balancing the Charge Station, and exiting the community." },
      { name: "Drivetrain", text: "Each swerve module has a drive motor and a turning motor for effortless maneuverability and fast turning." },
    ],
    results: [
      { event: "Utah Regional", result: "Rank 24 of 44 (5-7-0)", tba: "2023utwv" },
      { event: "Green Country Regional", result: "Rank 9 of 47 — Captain, Alliance 7", tba: "2023oktu" },
    ],
    binder: "assets/robots/2023-scurvy-info-sheet.png",
    links: [],
  },
  /*
    Older seasons: robot names after 2014 come from FIRST's event records
    (frc-events.firstinspires.org). FIRST carries a name forward when a team
    doesn't update it, so a name that repeats the previous year is left blank
    and noted here instead.
  */
  {
    year: "2022",
    game: "Rapid React",
    name: "", // FIRST records say "Helga" (carried over from 2018) — confirm
    stats: "2 regionals · rebuilding year",
    gameSummary: "Rapid React is the 2022 game. Robots shoot Cargo balls into a central Hub and climb the rungs of a Hangar at the end of the match.",
    results: [
      { event: "Colorado Regional", result: "Rank 41 of 41 (1-12-0)", tba: "2022code" },
      { event: "Utah Regional", result: "Rank 32 of 40 (3-8-0)", tba: "2022utwv" },
    ],
  },
  {
    year: "2021",
    game: "Infinite Recharge at Home",
    name: "", // FIRST records say "Helga" (carried over from 2018) — confirm
    stats: "Remote season during COVID-19",
    gameSummary: "In 2021, COVID-19 moved FRC online. Teams completed remote skills challenges with their 2020 robots instead of in-person events.",
    results: [],
  },
  {
    year: "2020",
    game: "Infinite Recharge",
    name: "", // FIRST records say "Helga" (carried over from 2018) — confirm
    stats: "1 regional before the season was cut short by COVID-19",
    gameSummary: "Infinite Recharge is the 2020 game. Robots shoot Power Cells into a Power Port, spin a Control Panel, and hang from a Generator Switch.",
    results: [
      { event: "Utah Regional", result: "Rank 49 of 54 (2-8-0)", tba: "2020utwv" },
    ],
  },
  {
    year: "2019",
    game: "Destination: Deep Space",
    name: "", // FIRST records say "Helga" (carried over from 2018) — confirm
    image: "assets/robots/2019-robot.jpg",
    stats: "2 regionals · rank #9 in Colorado · alliance captain",
    gameSummary: "Destination: Deep Space is the 2019 game. Robots place Hatch Panels and Cargo on Rockets and a Cargo Ship, starting with a vision-limited Sandstorm period, and climb onto the HAB platform at the end.",
    results: [
      { event: "Colorado Regional", result: "Rank 9 of 53 — Captain, Alliance 8 (quarterfinals)", tba: "2019code" },
      { event: "Utah Regional", result: "Rank 22 of 49 — 2nd pick, Alliance 7 (quarterfinals)", tba: "2019utwv" },
    ],
  },
  {
    year: "2018",
    game: "Power Up",
    name: "Helga",
    stats: "1 regional · rank #15 · semifinalist",
    gameSummary: "Power Up is the 2018 game, themed as an arcade video game. Robots place Power Cubes on Switches and a Scale, and climb at the end of the match.",
    results: [
      { event: "Utah Regional", result: "Rank 15 of 52 — 2nd pick, Alliance 2 (semifinals)", tba: "2018utwv" },
    ],
  },
  {
    year: "2017",
    game: "Steamworks",
    name: "", // FIRST records say "Sir Lancebot" (carried over from 2016) — confirm
    stats: "1 regional · rank #31",
    gameSummary: "Steamworks is the 2017 game, themed around steampunk airships. Robots deliver Gears to the Airship, shoot Fuel into the Boiler, and climb ropes at the end of the match.",
    results: [
      { event: "Utah Regional", result: "Rank 31 of 48 (4-5-1)", tba: "2017utwv" },
    ],
  },
  {
    year: "2016",
    game: "Stronghold",
    name: "Sir Lancebot",
    stats: "2 regionals · best rank #17",
    gameSummary: "Stronghold is the 2016 game, themed as a medieval siege. Robots breach defenses, shoot Boulders into the opposing Castle tower, and scale it at the end of the match.",
    results: [
      { event: "Colorado Regional", result: "Rank 17 of 48 (6-5-0)", tba: "2016code" },
      { event: "Las Vegas Regional", result: "Rank 29 of 49 (4-7-0)", tba: "2016nvlv" },
    ],
  },
  {
    year: "2015",
    game: "Recycle Rush",
    name: "George",
    stats: "2 regionals · best rank #23",
    gameSummary: "Recycle Rush is the 2015 game. Robots stack Totes and top them with Recycling Containers, with no defense between alliances.",
    results: [
      { event: "Arkansas Rock City Regional", result: "Rank 32 — 2nd pick in playoffs", tba: "2015arfa" },
      { event: "Colorado Regional", result: "Rank 23", tba: "2015code" },
    ],
  },
  {
    year: "2014",
    game: "Aerial Assist",
    name: "",
    stats: "2 regionals · rank #7 in Colorado · alliance captain",
    gameSummary: "Aerial Assist is the 2014 game. Alliance partners pass large exercise balls to each other and score them in goals, earning bonus points for assists and truss shots.",
    results: [
      { event: "Hub City Regional", result: "Rank 17 (7-7-0) — 2nd pick in playoffs", tba: "2014txlu" },
      { event: "Colorado Regional", result: "Rank 7 (10-6-0) — Captain, Alliance 4 (semifinals)", tba: "2014code" },
    ],
  },
  {
    year: "2013",
    game: "Ultimate Ascent",
    name: "Odd-Job",
    stats: "1 regional · rank #17 · playoffs",
    gameSummary: "Ultimate Ascent is the 2013 game. Robots shoot flying discs into goals and climb a metal pyramid at the end of the match.",
    description: `Our best robot to date at the time, moving the team into the top 25. Our alliance was the
    first to block two cross-court frisbee shots from "King TeC" (2169).`,
    results: [
      { event: "Colorado Regional", result: "Rank 17 (6-7-0) — 2nd pick in playoffs", tba: "2013code" },
    ],
    videos: ["https://www.youtube.com/watch?v=ysP5KEcw9FU"],
    matchVideos: [
      { label: "Quarterfinal 1-2: blocking 2169's frisbee shots", url: "https://youtu.be/xhr9v2J8u3k?t=110" },
    ],
  },
  {
    year: "2012",
    game: "Rebound Rumble",
    name: "",
    stats: "1 regional",
    gameSummary: "Rebound Rumble is the 2012 game. Robots shoot foam basketballs into hoops and balance on bridges at the end of the match.",
    results: [
      { event: "Greater Kansas City Regional", result: "Rank 56 (3-6-0)", tba: "2012kc" },
    ],
  },
  {
    year: "2011",
    game: "Logo Motion",
    name: "",
    stats: "Colorado Regional Winners · Championship qualifier",
    gameSummary: "Logo Motion is the 2011 game. Robots hang inflatable tubes on pegs to form the FIRST logo, then deploy minibots that race up poles at the end of the match.",
    description: `Our motto was "Is that fear I see?" Despite a barely operational robot, we won
    the Colorado Regional with an aggressive defensive strategy.`,
    results: [
      { event: "Colorado Regional", result: "Rank 39 (9-7-0) — won the event", tba: "2011co" },
      { event: "FIRST Championship, Archimedes Division", result: "Rank 88 (0-10-0)", tba: "2011arc" },
    ],
    awards: ["Colorado Regional Winners"],
  },
  {
    year: "2010",
    game: "Breakaway",
    name: "",
    stats: "1 regional",
    gameSummary: "Breakaway is the 2010 game. Robots kick soccer balls into goals over a field divided by bumps, and hang from a tower at the end of the match.",
    results: [
      { event: "Colorado Regional", result: "Rank 39 (1-5-3)", tba: "2010co" },
    ],
  },
  {
    year: "2009",
    game: "Lunacy",
    name: "",
    stats: "Rookie season",
    gameSummary: "Lunacy is the 2009 game, played on a slippery floor that simulates the moon's low gravity. Robots tow trailers and score Orbit Balls into the opposing alliance's trailers.",
    results: [
      { event: "Colorado Regional", result: "Rank 27 (3-4-0)", tba: "2009co" },
    ],
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
      { name: "Dawson School", logo: "assets/brand/dawson-school.png" },
      { name: "Dawson Parent Association", logo: "assets/placeholder-sponsor.svg" },
      { name: "Haas", logo: "assets/placeholder-sponsor.svg" },
      { name: "Hagerty", logo: "assets/placeholder-sponsor.svg" },
    ],
  },
];

const SPONSOR_PACKET_URL = "https://drive.google.com/file/d/1pQur7KkQSo5CY8GExVnrh-9iaMpoMrnf/view?usp=sharing";

// Outreach / community events — add one object per event
const OUTREACH_EVENTS = [
  { name: "Broomfield Days", date: "Annual", description: "Robot demos for the Broomfield community.", image: "assets/placeholder-event.svg" }, // TODO: photo + write-up
  { name: "Dawson Fest", date: "Annual", description: "Showing our robot to Dawson families.", image: "assets/placeholder-event.svg" }, // TODO: photo + write-up
  { name: "Qualcomm Demo Day", date: "", description: "A robot demo and visit with Qualcomm.", image: "assets/placeholder-event.svg" }, // TODO: date, photo + write-up
  { name: "Hirsh Precision Products Visit", date: "", description: "A demo day with our sponsor Hirsh Precision Products.", image: "assets/placeholder-event.svg" }, // TODO: date, photo + write-up
];

// Resources / documents — label + link. A url of "#" is hidden until it's set.
const RESOURCE_LINKS = [
  { category: "Team Documents", items: [
    { label: "Student, Family, and Mentor Handbook 2025–2026", url: "https://docs.google.com/document/d/1cmYxwgvPZEGiw9m3zzVnzU7u41QOKLFab4hHGOfGd5U/edit?usp=sharing" },
    { label: "Game Analysis and Planning Template", url: "https://docs.google.com/document/d/1fZVxb6nVicIAbYfuTFl0PZAnThBFkbATEzExnshtqF0/edit?usp=sharing" },
    { label: "Team logo (PNG, 2400 × 2400, white on black)", url: "brand/team-2972-logo.png", download: "team-2972-logo.png" },
  ]},
  { category: "Software & Controls", items: [
    { label: "Team GitHub", url: "https://github.com/Gears-and-Buccaneers" },
    { label: "WPILib documentation", url: "https://docs.wpilib.org" },
    { label: "Driver Station", url: "https://docs.wpilib.org/en/stable/docs/software/driverstation/driver-station.html" },
    { label: "CTRE Phoenix Tuner X", url: "https://v6.docs.ctr-electronics.com/en/stable/docs/tuner/index.html" },
    { label: "AdvantageKit", url: "https://docs.advantagekit.org" },
    { label: "AdvantageScope", url: "https://docs.advantagescope.org" },
    { label: "PathPlanner", url: "https://pathplanner.dev" },
    { label: "AprilTags", url: "https://docs.wpilib.org/en/stable/docs/software/vision-processing/apriltag/apriltag-intro.html" },
  ]},
  { category: "CAD & Manufacturing", items: [
    { label: "Onshape for FRC (frcdesign.org)", url: "http://frcdesign.org" },
    { label: "3D CAD/CAM Modeling Overview", url: "#cad-overview" },
  ]},
  { category: "Electronics", items: [
    { label: "FRC Wiring Basics", url: "https://docs.wpilib.org/en/stable/docs/zero-to-robot/step-1/intro-to-frc-robot-wiring.html" },
    { label: "Getting Started with Electronics", url: "https://www.chiefdelphi.com/t/how-to-get-started-with-electronics/507902/8" },
  ]},
  { category: "Game Analysis and Strategy", items: [
    { label: "Game Analysis and Strategy Workshop (Team 1100)", url: "https://www.youtube.com/watch?v=CEKrkLYDAO0" },
    { label: "Strategic Design Workshop (Citrus Circuits)", url: "https://www.youtube.com/watch?v=G6X3SrMmX3g&list=PL6j32uphg3L9sVDfxSlGSCuZr67C7WBE5&index=1" },
    { label: "Scouting", url: "#" }, // TODO
  ]},
  { category: "General FRC", items: [
    { label: "FIRST", url: "https://www.firstinspires.org" },
    { label: "Chief Delphi (FRC forum)", url: "https://www.chiefdelphi.com" },
    { label: "The Blue Alliance", url: "https://www.thebluealliance.com" },
    { label: "Statbotics", url: "https://www.statbotics.io" },
    { label: "Help Now Call Center (Compass Alliance)", url: "https://www.thecompassalliance.org/call-center" },
  ]},
  { category: "Branding", items: [
    { label: "Logo & brand assets", url: "#" }, // TODO
  ]},
  { category: "Workshop", items: [
    { label: "Workshop location & hours", url: "#" }, // TODO
  ]},
];

// 3D CAD/CAM overview (from the old Resources page)
const CAD_OVERVIEW = [
  { heading: "What are 3D models?", body: `3D models are digital versions of real parts. Instead of drawing something on
    paper, we build it on the computer in full 3D. This lets us see how the robot will look and how
    everything will fit together before we make anything in real life.` },
  { heading: "Why 3D modeling matters", list: [
    "See the whole robot before we build it",
    "Check if parts crash into each other",
    "Change designs quickly (a single edit updates the whole model)",
    "Measure weight and balance",
    "Make the robot look cleaner and work better",
  ], after: `At Team ${SITE.teamNumber}, we use Onshape for CAD because it's easy to learn, works in the
    browser, and lets everyone work together on the same model.` },
  { heading: "What is CAM?", body: `CAM is the step after CAD. If CAD is the design, CAM is the instructions.
    CAM turns our 3D models into the machine steps needed to actually make the parts using CNC machines,
    routers, laser cutters, or 3D printers. Think of CAD as drawing a cookie cutter, and CAM as
    generating the actual recipe and baking steps.` },
  { heading: "Why CAM matters", list: [
    "Make custom parts that fit perfectly",
    "Cut metal and plastic accurately",
    "Preview mistakes before we actually cut anything",
    "Print parts with the right strength and settings",
  ] },
  { heading: "Tools we use", list: [
    "Onshape CAM Studio — easy toolpaths connected directly to our CAD",
    "Fusion 360 CAM — for more advanced CNC work",
    "Bambu Studio & OrcaSlicer — for slicing 3D prints so the printer knows what to do",
  ] },
  { heading: "How it all fits together", list: [
    "CAD → We design the robot in Onshape.",
    "CAM → We create the cutting/printing instructions.",
    "Manufacturing → We CNC, laser-cut, or 3D print the parts.",
    "Assembly → We build the robot knowing things will actually fit.",
  ] },
];

// Portal tiles (Task App, Calendar, Handbook, …) live in infra/config/apps.json, not here.

// Media galleries
const MEDIA_PHOTOS = [
  "assets/brand/team-2025.jpg",
  "assets/brand/hero-field.jpg",
  "assets/brand/students-lab.jpg",
  "assets/outreach/community-fair.jpg",
  "assets/outreach/sponsor-visit.jpg",
  "assets/gallery/2025-competition-1.jpg",
  "assets/gallery/2025-build-1.jpg",
  "assets/history/physics-room-2017.jpg",
];
const MEDIA_VIDEOS = [
  "https://www.youtube.com/embed/CB1DmHxDGQw",
  "https://www.youtube.com/embed/ysP5KEcw9FU",
];
const MEDIA_PUBLICITY = [
  // TODO: add press/publicity links, e.g. { title: "...", url: "#", outlet: "..." }
];
