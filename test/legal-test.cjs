// The privacy and terms pages: they exist, are public pages like the rest, link to each other and from every footer,
// and carry no unfinished marker. Run: node test/legal-test.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
let fails = 0;
const check = (name, ok) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) fails++; };
const strip = (h) => h.replace(/<!--[\s\S]*?-->/g, "");

for (const f of ["privacy.html", "terms.html"]) {
  const html = fs.readFileSync(path.join(root, f), "utf8");
  const text = strip(html);
  check(`${f}: same head as other pages (manifest, theme script, stylesheet)`,
    html.includes('rel="manifest"') && html.includes("localStorage.getItem(\"theme\")") && html.includes("css/style.css"));
  check(`${f}: has header, footer and shared scripts`,
    html.includes('id="site-header"') && html.includes('id="site-footer"') && html.includes("js/components.js"));
  check(`${f}: not marked noindex (Google must be able to read it)`, !/noindex/i.test(html));
  check(`${f}: names the contact email`, text.includes("robotics@dawsonschool.org"));
  check(`${f}: no TODO or placeholder text`, !/TODO|TBD|\[TO CONFIRM|lorem/i.test(text));
  check(`${f}: no inline styles (colours live in the css tokens)`, !/style\s*=|<style/i.test(text));
}
const priv = strip(fs.readFileSync(path.join(root, "privacy.html"), "utf8"));
check("privacy: states the Google scopes and that the password is never seen",
  /openid/.test(priv) && /email/.test(priv) && /profile/.test(priv) && /never see your Google password/.test(priv));
check("privacy: says no selling/sharing and no analytics trackers", /sell/.test(priv) && /analytics trackers/.test(priv));
check("privacy: AI names/ids are not sent, and AI is admin-enabled", /name or user ID/.test(priv) && /admin turns them on/.test(priv));
check("privacy: does not invent a retention period or consent claim", !/\b\d+ (days|months|years)\b(?! )/.test(priv.replace(/14 days/g, "")) && !/consent|parental|under 13|COPPA|GDPR/i.test(priv));
check("privacy links to terms; terms links to privacy",
  priv.includes('href="terms.html"') && strip(fs.readFileSync(path.join(root, "terms.html"), "utf8")).includes('href="privacy.html"'));
const comps = fs.readFileSync(path.join(root, "js/components.js"), "utf8");
check("footer links to both pages (on the portal host too, through pageHref)",
  comps.includes('pageHref("privacy.html")') && comps.includes('pageHref("terms.html")'));
const caddy = fs.readFileSync(path.join(root, "container/Caddyfile"), "utf8");
check("pages are not portal paths (public hosts serve them)", !/privacy\.html|terms\.html/.test(caddy));
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
