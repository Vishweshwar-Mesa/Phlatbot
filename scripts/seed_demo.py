# Usage (from the repo root): python3 scripts/seed_demo.py  -- WIPES all data, then loads the brief-based demo.
# Seeds clearly-labelled SAMPLE data on production: constraints from the brief, Pune listings, one published shortlist.
import json, time, urllib.request
env = dict(l.split("=",1) for l in open(".env.local").read().splitlines() if "=" in l and not l.startswith("#"))
SU, SK = env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
U = "https://phlatmatch.vercel.app"
def req(url, data=None, method=None, sb=False):
    h = {"apikey": SK, "Authorization": "Bearer " + SK, "Prefer": "return=representation"} if sb else {}
    h["content-type"] = "application/json"
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers=h, method=method)
    try: resp = urllib.request.urlopen(r, timeout=300); return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
sb = lambda path, data=None, method=None: json.loads(req(f"{SU}/rest/v1/{path}", data, method, sb=True)[1] or "null")

# clean slate
for p in ["votes?created_at=not.is.null", "assessments?created_at=not.is.null", "no_go_confirmations?participant_id=not.is.null",
          "preferences?participant_id=not.is.null", "rate_limits?key=not.is.null", "listings?id=not.is.null", "batch_runs?id=not.is.null"]:
    req(f"{SU}/rest/v1/{p}", method="DELETE", sb=True)
req(f"{SU}/rest/v1/participants?id=not.is.null", {"form_submitted_at": None, "telegram_user_id": None}, "PATCH", sb=True)
people = {p["name"]: p for p in sb("participants?select=id,name,form_token")}

S = lambda **o: {"location": None, "normalized_locality": None, "monthly_rent": None, "floor": None, "has_lift": None,
  "has_parking": None, "bathrooms": None, "pet_friendly": None, "bachelor_friendly": None, "furnishing": None,
  "security_deposit": None, "brokerage": None, "available_from": None, "notice_period_months": None, "other_notes": None,
  "extraction_confidence": "high", "latitude": None, "longitude": None, **o}
LISTINGS = [
  # --- The three listings described in the brief (only what the brief states; the rest stays null = "not confirmed")
  ("FROM THE BRIEF: Riya's find, a 3BHK in Baner she loved", S(normalized_locality="Baner", location="Baner, Pune", other_notes="3BHK")),
  ("FROM THE BRIEF: Meera's find in Kothrud that fit the budget", S(normalized_locality="Kothrud", location="Kothrud, Pune")),
  ("FROM THE BRIEF: Kavita's find, ticked every box except it was on the fifth floor with no lift", S(floor="5", has_lift=False)),
  # --- Extra sample listings (not from the brief) so there are real options to compare
  ("SAMPLE: 3BHK in Wakad near Hinjewadi", S(normalized_locality="Wakad", monthly_rent=54000, floor="9 of 14", has_lift=True, has_parking=True, bathrooms=2, pet_friendly=False, bachelor_friendly=True, furnishing="semi", security_deposit=160000, other_notes="near Hinjewadi IT park, clubhouse, security, power backup, water supply 24x7, balcony")),
  ("SAMPLE: 3BHK in Balewadi", S(normalized_locality="Balewadi", monthly_rent=58500, floor="2 of 4", has_lift=None, has_parking=True, bathrooms=2, bachelor_friendly=True, furnishing="semi", security_deposit=175000, other_notes="balcony, natural light, near Hinjewadi, quiet")),
  ("SAMPLE: 3BHK in Aundh", S(normalized_locality="Aundh", monthly_rent=60000, floor="4 of 7", has_lift=True, has_parking=True, bathrooms=3, pet_friendly=False, bachelor_friendly=True, furnishing="furnished", security_deposit=180000, other_notes="balcony, gym in society, power backup, near bus stop, quiet lane")),
  ("SAMPLE: 3BHK in Viman Nagar", S(normalized_locality="Viman Nagar", monthly_rent=69000, floor="3 of 8", has_lift=True, has_parking=True, bathrooms=3, bachelor_friendly=True, furnishing="furnished", security_deposit=207000, other_notes="balcony, near airport, gym")),
]
for i, (title, s) in enumerate(LISTINGS):
    sb("listings", {"raw_text": title, "submitted_by_telegram_id": 0, "submitted_by_name": ("From the brief" if title.startswith("FROM THE BRIEF") else "Sample data"),
       "structured": s, "extraction_status": "ok", "status": "awaiting_preferences", "confirmed_at": "2026-09-27T06:00:00Z",
       "submitted_at": "2026-09-27T06:00:00Z", "dedupe_hash": f"sample-{i}"}, "POST")

def approve(name, label):
    tok = people[name]["form_token"]
    code, body = req(f"{U}/api/form/{tok}/relevance", {"label": label}, "POST")
    d = json.loads(body); assert d.get("verdict") == "RELEVANT", (label, d)
    return {"label": d["label"], "weight": 0, "approval": d["approval"]}
def form(name, custom=(), **o):
    tok = people[name]["form_token"]
    cs = []
    for label, w in custom:
        c = approve(name, label); c["weight"] = w; cs.append(c)
    body = {"max_rent": 20000, "min_bathrooms": 2, "no_go_areas": [], "requires_lift": False, "requires_parking": False,
            "requires_pet_friendly": False, "requires_bachelor_friendly": True, "starter_weights": {}, "custom": cs, **o}
    print(name, req(f"{U}/api/form/{tok}", body, "POST"))

# FROM THE BRIEF: Riya won't live in Kothrud (more than 20 min from her gym and family); Kavita can't do Baner
# (commute to her Hinjewadi office); Meera needs a lift (knee condition). Rent caps and 2 bathrooms are SAMPLE
# values (the brief gives none). Other hard minimums are left "Not required" because the brief doesn't state them.
form("Riya", max_rent=22000, no_go_areas=["Kothrud"],
     starter_weights={"Furnished": 3, "Balcony": 2}, custom=[("Close to my gym and family", 5)])
form("Meera", max_rent=20000, requires_lift=True,
     starter_weights={"Balcony": 3, "Quiet locality": 4, "Natural light / ventilation": 3})
form("Kavita", max_rent=21000, no_go_areas=["Baner"],
     starter_weights={"Society amenities (power backup, security)": 3}, custom=[("Near Hinjewadi", 5)])

for _ in range(40):
    time.sleep(3)
    st = [l["status"] for l in sb("listings?select=status")]
    if all(x == "assessed_unpublished" for x in st): break
print("statuses:", st)
code, body = req(f"{U}/api/app/{people['Riya']['form_token']}/reassess", {}, "POST")
print("publish:", code, body)
batch = json.loads(body)["batchRunId"]
req(f"{SU}/rest/v1/rate_limits?key=not.is.null", method="DELETE", sb=True)  # let the user try Publish now
run = sb(f"batch_runs?id=eq.{batch}&select=shortlist,also_qualified")[0]
names = {l["id"]: l["structured"]["normalized_locality"] for l in sb("listings?select=id,structured")}
print("shortlist:", [names[i] for i in run["shortlist"]], "| also:", [names[i] for i in run["also_qualified"]])
# One sealed vote so the reveal state is visible
first = run["shortlist"][0]
print("Meera votes:", req(f"{U}/api/app/{people['Meera']['form_token']}/vote", {"batchId": batch, "listingId": first, "reaction": "interested", "comment": "Sample vote"}, "POST"))
for a in sb("assessments?select=listing_id,qualify_count,soft_score,per_person"):
    print(f"  {names[a['listing_id']]:14} qualify={a['qualify_count']} fit={None if a['soft_score'] is None else round(a['soft_score']*100)}%  " +
          "; ".join(f"{p['name']}: {'OK' if p['status']=='qualifies' else p['reasons'][0]}" for p in a["per_person"]))
