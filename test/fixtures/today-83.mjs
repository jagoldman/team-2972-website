// Fake /today.json answers in the release 8.3 shape (CONTRACT H1, C1, E1), one per kind of person, with dates counted
// from the day the test runs. Made-up people and parts only (CONTRACT top rules; CONVENTIONS §9). Hosts are the
// browser test's fake site (landing.test).
const H = (app, path) => `http://${app}.landing.test${path}`;

/** "YYYY-MM-DD", n days from `base`. */
export function dayFrom(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Thu, Nov 20", n days from `base`. */
export function niceFrom(base, n) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// The team meets today, on Tuesdays and Thursdays (practice) and on Saturdays (build): the same days everywhere.
function meetKind(base, i) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i).getDay();
  return d === 6 ? "build" : i === 0 || d === 2 || d === 4 ? "practice" : "";
}
function meetDays(base, from, to) {
  const out = [];
  for (let i = from; i < to; i++) if (meetKind(base, i)) out.push(i);
  return out;
}

function seasonFrom(base) {
  const days = meetDays(base, 0, 60).map((i) => ({ date: dayFrom(base, i), kind: meetKind(base, i) }));
  return { target: { name: "Season kickoff", date: dayFrom(base, 60), kind: "kickoff" }, days };
}

function weekFrom(base, { parent = false } = {}) {
  const practice = (i) => ({ kind: "practice", name: "Practice", startTime: "15:30", endTime: "18:00", location: "Team shop" });
  const out = [];
  for (let i = 0; i < 7; i++) {
    const kind = meetKind(base, i);
    if (kind === "practice") out.push({ date: dayFrom(base, i), href: H("calendar", "/?tab=agenda"), items: [practice(i)],
      ...(parent ? {} : { mentorsComing: i === 0 ? 2 : 0 }), snacks: i === 0 ? { names: ["Test family", "Sample family"], open: 0, modes: ["build"] } : { names: [], open: 2, modes: ["build"] } });
    else if (kind === "build") out.push({ date: dayFrom(base, i), href: H("calendar", "/?tab=agenda"), items: [{ kind: "build", name: "Build day", startTime: "10:00", endTime: "14:00", location: "Team shop" }],
      ...(parent ? {} : { mentorsComing: 1 }), snacks: { names: [], open: 2, modes: ["build"] } });
  }
  return out;
}

// Two milestones fall on meeting days this week, one later.
const milestones = (base) => { const [a, b] = meetDays(base, 1, 7); return [
  { name: "Driving on carpet", date: dayFrom(base, a), project: "Drive base", color: "#1f9d55", href: H("tasks", "/projects/1") },
  { name: "Prototype intaking", date: dayFrom(base, b), project: "Intake", color: "#d4a017", href: H("tasks", "/projects/2") },
  { name: "Design review", date: dayFrom(base, 9), project: "Shooter", color: "#3b6fd8", href: H("tasks", "/projects/3") },
]; };

const practiceRow = (signedIn) => ({ id: "calendar:practice", section: "today", title: "Practice today, 3:30 pm–6 pm",
  detail: signedIn ? "You are signed in" : "You are not signed in", href: H("calendar", "/here?tab=today"),
  ...(signedIn ? {} : { cta: { label: "Sign in", href: H("calendar", "/here/scan") } }) });

const activity = [
  { app: "Calendar", title: "Avery Test", detail: "signed in at the door", href: H("calendar", "/here"), at: new Date(Date.now() - 20 * 60000).toISOString() },
  { app: "Tasks", title: "Jordan Sample", detail: "moved “Tune the drive PID” to In progress", href: H("tasks", "/my"), at: new Date(Date.now() - 3 * 3600000).toISOString() },
  { app: "Parts & Inventory", title: "Riley Example", detail: "requested a crimp tool", href: H("parts", "/"), at: new Date(Date.now() - 26 * 3600000).toISOString() },
  { app: "Skills", title: "Casey Fake", detail: "was signed off on the lathe", href: H("skills", "/"), at: new Date(Date.now() - 50 * 3600000).toISOString() },
];

export function studentToday(base = new Date(), { signedIn = false } = {}) {
  return {
    v: 1,
    today: [practiceRow(signedIn)],
    waiting: [],
    others: [
      { id: "parts:mine:41", section: "others", title: "Bearing 1/2\" hex, flanged", detail: "", href: H("parts", "/?request=41"), mark: { word: "Ordered", tone: "ok" }, lines: ["Arrives about " + niceFrom(base, 1)] },
      { id: "skills:mine:lathe", section: "others", title: "Sign-off: Lathe", detail: "", href: H("skills", "/"), lines: ["Waiting on a mentor since Monday"] },
    ],
    next: { taskId: "t-7", title: "Cut polycarb side plates", due: dayFrom(base, 4), project: "Intake", subteam: "Fabrication", milestone: "Prototype intaking",
      href: H("tasks", "/my?task=t-7"), stuckHref: H("tasks", "/my?task=t-7&do=stuck"), partHref: H("parts", "/?new=1&task=t-7"),
      steps: { done: 1, total: 2 }, nextStep: { id: "s2", label: "Cut on the router" } },
    activity,
    season: seasonFrom(base),
    milestones: milestones(base),
    week: weekFrom(base),
  };
}

export function mentorToday(base = new Date()) {
  return {
    v: 1,
    today: [{ id: "calendar:practice", section: "today", title: "Practice today, 3:30 pm–6 pm", detail: "5 people are signed in", href: H("calendar", "/here?tab=today") }],
    waiting: [
      { id: "parts:approve:12", section: "waiting", group: "Needs your OK", title: "Motor, brushless", mark: { word: "Blocking", tone: "bad" }, detail: "",
        lines: ["$199.99, asked by Avery Test: “The shooter needs two; we have none spare.”", "Mechanisms budget: $1,838.52 left, $1,638.53 after this"],
        href: H("parts", "/?request=12"),
        acts: [{ label: "Approve", app: "parts", action: "approve", key: "12", primary: true }, { label: "Deny", app: "parts", action: "deny", key: "12", reason: true }] },
      { id: "skills:signoff:u-3:omio", section: "waiting", group: "Sign-off requests", title: "Qualified on the CNC router", detail: "Jordan Sample asks for a sign-off", href: H("skills", "/?tab=signoff"),
        acts: [{ label: "Sign off", app: "skills", action: "signoff", key: "u-3:omio" }] },
      { id: "skills:signoff:u-4:leads", section: "waiting", group: "Sign-off requests", title: "Motor power leads", detail: "Riley Example asks for a sign-off", href: H("skills", "/?tab=signoff"),
        acts: [{ label: "Sign off", app: "skills", action: "signoff", key: "u-4:leads" }] },
      { id: "tasks:stuck:t-9", section: "waiting", group: "Stuck", title: "Intake roller shafts", mark: { word: "Blocked", tone: "bad" }, detail: "Casey Fake, Intake", lines: ["Waits on the part Hex shaft, 8 in"], href: H("tasks", "/my?task=t-9") },
      { id: "parts:parts-toorder", section: "waiting", title: "5 parts are waiting to be ordered", detail: "The first must be ordered by " + niceFrom(base, 2), href: H("parts", "/?tab=toorder"), count: 5 },
    ],
    next: null,
    activity,
    season: seasonFrom(base),
    milestones: milestones(base),
    week: weekFrom(base),
  };
}

export function parentToday(base = new Date()) {
  return {
    v: 1,
    today: [
      { id: "calendar:snacks:" + dayFrom(base, 2), section: "today", title: niceFrom(base, 2) + " needs snacks", detail: "2 families needed", href: H("calendar", "/?tab=snacks"),
        modes: ["build"], acts: [{ label: "Sign up", app: "calendar", action: "snack", key: dayFrom(base, 2), primary: true }] },
      { id: "calendar:vol:4", section: "today", title: "Set up the library demo", detail: "Thu, 5:30 pm–6:15 pm, 1 more person needed", href: H("calendar", "/volunteer?e=4"),
        acts: [{ label: "Sign up", app: "calendar", action: "volunteer", key: "4" }] },
    ],
    waiting: [],
    next: null,
    activity: [],
    season: seasonFrom(base),
    week: weekFrom(base, { parent: true }),
    coming: [
      { date: dayFrom(base, 9), name: "Library robot demo", startTime: "18:00", endTime: "20:00", location: "Public library", href: H("calendar", "/?e=4") },
      { date: dayFrom(base, 25), name: "Parent meeting and season preview", startTime: "10:00", endTime: "11:30", location: "School library", href: H("calendar", "/?e=5") },
      { date: dayFrom(base, 60), name: "Season kickoff", startTime: "09:00", endTime: "13:00", location: "Team shop", href: H("calendar", "/?e=6") },
    ],
  };
}

export function eventToday(base = new Date(), { shift = true } = {}) {
  return {
    v: 1,
    today: shift ? [{ id: "compete:shift-now:1:" + dayFrom(base, 0) + ":0915", section: "today", title: "Scouting until 10:00", detail: "Then break until 11:00.", href: H("compete", "/schedule"),
      cta: { label: "Open my scouting match", href: H("compete", "/scouting") } }, practiceRow(false)] : [practiceRow(false)],
    waiting: [],
    next: { taskId: "t-7", title: "Cut polycarb side plates", href: H("tasks", "/my?task=t-7") },
    activity,
    season: seasonFrom(base),
    week: weekFrom(base),
    event: {
      name: "Test Regional",
      line: { now: "Scouting until 10:00", match: { label: "Our match now", text: "Qual 14, Red, on the field" }, robot: "On the field, battery B1 at 12.9 V" },
      pit: [
        { id: "pit-save:1:14", title: "Save the Qual 14 checklist after the match", detail: "Then start the checklist for Qual 19 (match at 1:15)", href: "/pit?tab=check", cta: { label: "Open the Pit", href: "/pit?tab=check" } },
        { id: "pit-issues:1", title: "2 open issues in the pit", detail: "Open since 9:02", lines: ["Cracked 22T sprocket on the intake", "Left elevator bearing squeaks"], href: "/pit?tab=check" },
      ],
      next: [
        { match: 19, at: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 13, 15).toISOString(), alliance: "Blue", with: [1001, 1002], against: [1003, 1004, 1005] },
        { match: 21, at: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 14, 0).toISOString(), alliance: "Red", with: [1006, 1007], against: [1008, 1009, 1010] },
      ],
    },
  };
}
