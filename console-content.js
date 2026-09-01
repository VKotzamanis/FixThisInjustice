// console-content.js — extended content: form cues per exercise + specimen card library.
// All data, no UI. Loaded after data.js.

window.FORM_CUES = {
  "Barbell bench press": {
    setup: [
      "Eyes under the bar. Squeeze shoulder blades together and DOWN toward back pockets.",
      "Plant feet flat, slight arch in lower back. Glutes touch bench at all times.",
      "Grip just outside shoulder width — forearms vertical at the bottom.",
    ],
    execution: [
      "Pull the bar out of the rack (don't press it up). Hold it locked.",
      "Lower under control to lower-chest / nipple line, touch lightly.",
      "Drive feet into floor, press in a slight arc up and back toward the rack.",
    ],
    mistakes: [
      "Elbows flared 90° from torso → shoulder impingement. Tuck to ~70°.",
      "Bouncing the bar off your chest → fake reps, injury risk. Pause briefly.",
      "Lower back flat / butt off the bench → loses leg drive + shoulder protection.",
      "Bar drifting up the chest as you press → wrong line. Press up AND back.",
    ],
    tip: "If your shoulders feel it more than your chest, you're not retracting your scapulae enough.",
  },

  "Overhead press (barbell)": {
    setup: [
      "Bar in front-rack: shelf of upper chest, elbows under bar, wrists straight.",
      "Stance hip-width, glutes + abs braced HARD. Stack rib cage over pelvis.",
      "Grip just outside shoulders — forearms vertical when looking from the side.",
    ],
    execution: [
      "Press straight up. As bar passes face, shrug and push your head THROUGH the bar.",
      "Lock out directly over mid-foot, biceps near ears.",
      "Lower under control to the front-rack. Reset breath every rep on heavy days.",
    ],
    mistakes: [
      "Hyperextending lower back → 'standing bench press'. Brace abs, squeeze glutes.",
      "Pushing the bar forward instead of up → loses leverage. Bar must travel straight.",
      "Not shrugging at lockout → leaves the upper traps disengaged.",
      "Flaring elbows out wide → use a ~30° elbow angle, not 90°.",
    ],
    tip: "Imagine pushing your body DOWN past the bar instead of pushing the bar up.",
  },

  "Incline DB press": {
    setup: [
      "Bench at 30°. Higher than 45° makes it a shoulder press.",
      "Plant feet flat. Pinch shoulder blades back as you sit down.",
      "Kick the dumbbells up onto your thighs, then back-and-down into start position.",
    ],
    execution: [
      "Start with arms locked, palms facing slightly inward (neutral-pronated).",
      "Lower under control — elbows around 45° from torso, not flared.",
      "Press up and slightly together. Don't clang the bells.",
    ],
    mistakes: [
      "Bench too steep → recruits front delts, takes upper chest out of it.",
      "Elbows flared at 90° → shoulder strain. Keep ~45-60°.",
      "Letting dumbbells drift apart at top → loses chest tension.",
      "Bouncing off chest or stopping short → use full ROM, controlled stretch.",
    ],
    tip: "The upper chest is small and stubborn — slow eccentrics (3s down) work better than heavy.",
  },

  "Lateral raises": {
    setup: [
      "DBs at sides, slight bend in elbows — bend stays locked the whole set.",
      "Lean forward 5-10° from the hips. Stack ribs over pelvis.",
      "Pinkies slightly higher than thumbs (like pouring water out of a jug).",
    ],
    execution: [
      "Raise arms OUT to the side, leading with elbows.",
      "Stop at shoulder height — going higher trades delts for traps.",
      "Lower SLOWLY (3 seconds). The eccentric is where growth happens.",
    ],
    mistakes: [
      "Using momentum / swinging the body → cheats the delts.",
      "Lifting above shoulder height → recruits traps and upper back instead.",
      "Thumbs higher than pinkies → internally rotates, hits front delts not side.",
      "Going too heavy → form breaks down. Stay strict; 8-15 lb is plenty for most.",
    ],
    tip: "Lateral raises are NOT a strength lift. Pick a weight you can do 12 strict reps with.",
  },

  "Tricep overhead extension": {
    setup: [
      "Hold dumbbell with both hands cupping the top plate, palms up (diamond).",
      "Press it overhead. Elbows close to ears, biceps nearly vertical.",
      "Stack ribs over pelvis. Slight knee bend if standing.",
    ],
    execution: [
      "Lower the weight BEHIND your head, elbows tracking forward.",
      "Get a deep stretch — the long head of the tricep needs ROM.",
      "Press up by extending at the elbows ONLY. Shoulders don't move.",
    ],
    mistakes: [
      "Elbows flaring out → shifts work to other heads, loses long-head stretch.",
      "Stopping short → no stretch = no long-head growth.",
      "Hyperextending back → use abs + glutes to anchor torso.",
      "Going too heavy → ego lift. The elbow is a small joint; respect it.",
    ],
    tip: "The long head of the tricep ONLY grows from positions where the shoulder is flexed (arms overhead).",
  },

  "Pull-ups (or lat pulldown)": {
    setup: [
      "Grip slightly wider than shoulders, palms forward (pronated).",
      "Hang dead. Shoulders depressed (down, away from ears).",
      "Cross ankles or tuck feet to prevent kipping.",
    ],
    execution: [
      "Pull elbows DOWN to your ribcage — think 'drive elbows to the floor'.",
      "Get your collarbone (not chin) to the bar.",
      "Lower under control until elbows are fully extended.",
    ],
    mistakes: [
      "Kipping / using legs to swing → cheats the back. Use band assist if needed.",
      "Half-reps from the top → no full lat engagement.",
      "Pulling with biceps → think back. If biceps fry first, you're cheating.",
      "Shrugging up at the bottom → keep shoulders pulled away from ears.",
    ],
    tip: "If you can't do one, do controlled negatives — 5s lowers from the top. Builds same range, half the strength prereq.",
  },

  "Barbell row (Pendlay)": {
    setup: [
      "Bar over mid-foot. Hinge to a flat-back position — torso parallel to floor.",
      "Grip shoulder-width, overhand. Bar resets on floor every rep.",
      "Brace core hard; back is FLAT, not rounded, not extended.",
    ],
    execution: [
      "Explosively pull the bar to LOWER chest / upper abs.",
      "Pull with the elbows back, not up. Squeeze shoulder blades together.",
      "Lower under control to the floor. Pause briefly. Reset position. Repeat.",
    ],
    mistakes: [
      "Standing up as you pull → turns it into a half-deadlift. Torso stays flat.",
      "Pulling to the belly button → too low, loses upper-back work.",
      "Rounding the lower back → injury risk. Reset every rep is what saves you.",
      "Using too much weight → form breaks first. This is a strict movement.",
    ],
    tip: "Pendlay (paused, dead-stop on floor) > continuous bent-over row for back development. Lighter, stricter.",
  },

  "DB single-arm row": {
    setup: [
      "Knee + hand on bench. Other foot planted on floor.",
      "Back FLAT (not rounded). Torso parallel to floor.",
      "DB hangs straight down from shoulder, arm extended.",
    ],
    execution: [
      "Pull the DB to your HIP, not your chest.",
      "Drive elbow back along your ribs. Elbow stays close to torso.",
      "Squeeze lat at the top. Lower slowly to full stretch.",
    ],
    mistakes: [
      "Twisting your torso to lift the weight → cheats the lat. Stay rigid.",
      "Pulling to chest level → bicep takes over. Hip-targeted = lat-targeted.",
      "Rushing the eccentric → 1.5-2s lower for full lat stretch.",
      "Letting shoulder shrug up at the bottom → keep it depressed.",
    ],
    tip: "Get a HUGE stretch at the bottom — let your shoulder blade move forward. The stretch loads the lat.",
  },

  "Face pulls": {
    setup: [
      "Cable at face height. Rope attachment.",
      "Grip with thumbs pointing toward you. Step back to load the cable.",
      "Stagger stance if needed for stability.",
    ],
    execution: [
      "Pull rope to your face, NOT your chest.",
      "Externally rotate at the top — thumbs end up pointing BEHIND your ears.",
      "Pause for 1s in the contracted position. Slow eccentric.",
    ],
    mistakes: [
      "Pulling to chest → just a horizontal row, misses rear delt + ext rotators.",
      "Skipping the external rotation → loses the whole point. Thumbs back.",
      "Going too heavy → form collapses, brings traps in. Light + perfect.",
      "Hunching forward → stand tall, chest up.",
    ],
    tip: "Face pulls are the single best 'shoulder insurance' exercise. Every Pull day, light, high reps (15-20). Forever.",
  },

  "Barbell bicep curl": {
    setup: [
      "Stand with feet hip-width. Bar at thighs, grip shoulder-width, palms up.",
      "Squeeze shoulder blades back slightly. Elbows pinned to your ribs.",
      "Brace abs to prevent torso swing.",
    ],
    execution: [
      "Curl the bar by flexing at the elbows ONLY.",
      "Squeeze biceps at the top — bar should reach upper chest, not chin.",
      "Lower SLOWLY (2-3s). The negative is where biceps grow.",
    ],
    mistakes: [
      "Swinging the torso → cheats. Reduce weight by 20%, do it strict.",
      "Moving elbows forward / shrugging shoulders → recruits front delts.",
      "Stopping short of full extension → leaves growth on the table. Full ROM.",
      "Locking wrists into extension → strains them. Keep wrist straight.",
    ],
    tip: "Use an EZ bar if straight bar bothers your wrists — biomechanically identical for the biceps.",
  },

  "Hammer curl": {
    setup: [
      "DBs at sides, palms facing each other (neutral grip).",
      "Elbows pinned to ribs. Standing tall.",
      "Slight bend in knees, abs braced.",
    ],
    execution: [
      "Curl with palms STAYING neutral (thumbs up the whole time).",
      "Bring DB up to shoulder height. Squeeze.",
      "Lower under control. Don't swing.",
    ],
    mistakes: [
      "Rotating to palms-up at the top → that's a normal curl, not hammer.",
      "Swinging body → cheats. Use a wall or lean against a post if needed.",
      "Stopping short → full ROM matters for the brachialis.",
      "Moving elbows forward → shifts load off arm.",
    ],
    tip: "Hammers target the brachialis (under the bicep) and the brachioradialis (forearm). They add ARM THICKNESS that regular curls miss.",
  },

  "Barbell back squat": {
    setup: [
      "Bar on mid-traps (low bar) or front-of-traps (high bar). Pick one and stick with it.",
      "Stance shoulder-width, toes pointed slightly out (15-30°).",
      "Brace abs hard. Big breath HELD throughout the rep.",
    ],
    execution: [
      "Sit DOWN and back, like sitting in a chair — knees track over toes.",
      "Go to at least parallel (hip crease below top of knee).",
      "Drive through whole foot — feel weight in heels AND midfoot. Stand tall.",
    ],
    mistakes: [
      "Knees caving inward → ACL strain. Push knees OUT as you stand.",
      "Looking up or excessively forward → neck strain + bar drift. Neutral spine.",
      "Stopping above parallel → not a full squat. Earn the ROM.",
      "Lower back rounding ('butt wink') at the bottom → flexibility issue, work on hip mobility, don't go below your ability.",
    ],
    tip: "Film yourself from the side. Your back angle should stay relatively constant during the lift.",
  },

  "Romanian deadlift": {
    setup: [
      "Bar at hip-crease. Grip shoulder-width, overhand or mixed.",
      "Soft bend in knees — locked in this position the entire set.",
      "Shoulder blades back, chest up, abs braced.",
    ],
    execution: [
      "Push HIPS BACK like closing a door with your butt.",
      "Lower bar along your thighs/shins — stays close to body the whole time.",
      "Go until you feel a strong hamstring stretch (usually just below knees).",
      "Drive hips FORWARD to stand up. Squeeze glutes hard at top.",
    ],
    mistakes: [
      "Bending knees more during the rep → that's a regular deadlift.",
      "Rounding lower back → injury risk. Stop when YOUR hamstrings can't go further.",
      "Bar drifting away from body → puts shear force on the spine. Drag it.",
      "Hyperextending at the top → just stand tall, glutes squeezed.",
    ],
    tip: "RDL is a HIP hinge, not a knee bend. If your knees travel forward, restart.",
  },

  "Leg press → Bulgarian split squat": {
    setup: [
      "[Leg press] Sit firmly, lower back pressed into pad. Feet shoulder-width on platform.",
      "[Bulgarian] Rear foot elevated 12-18\" behind you. Front foot far enough forward that knee tracks over ankle at bottom.",
      "Brace core. Stand tall.",
    ],
    execution: [
      "[Leg press] Lower until knees ~90°. Don't let lower back round off the pad.",
      "[Bulgarian] Lower straight down. Front knee bends, rear leg follows.",
      "Drive through the FRONT heel to stand up.",
    ],
    mistakes: [
      "[Leg press] Going too deep — lower back peels off the pad. STOP at 90°.",
      "[Leg press] Locking knees fully at the top → joint stress.",
      "[Bulgarian] Knee diving forward past toes → shift front foot further forward.",
      "[Bulgarian] Driving off the rear foot → that's a lunge. Front leg does the work.",
    ],
    tip: "Bulgarian split squat is brutally effective per joule of effort. 8 reps per leg = punishing. Brace yourself.",
  },

  "Leg curl (machine)": {
    setup: [
      "Lying or seated — same principle. Pad just above your heel / Achilles.",
      "Hips firmly anchored. Don't let butt come off the pad.",
      "Choose a weight you can complete the full ROM with.",
    ],
    execution: [
      "Curl heels toward butt. Squeeze hams at the contracted top.",
      "Pause briefly at top — 1s.",
      "Lower SLOWLY (3s) to a full stretch.",
    ],
    mistakes: [
      "Lifting hips off the pad to swing weight → useless. Anchor hips.",
      "Half reps → use less weight, full ROM.",
      "No eccentric control → letting the weight drop. 3-second negatives.",
      "Pointing toes ↔ flexing feet randomly → pick one and stick with it (flexed pulls more gastroc, pointed isolates hams more).",
    ],
    tip: "Most knee-pain issues at the gym come from imbalanced quad-to-ham ratio. Leg curls are insurance.",
  },

  "Calf raise": {
    setup: [
      "Balls of feet on edge of step / block / machine. Heels hang.",
      "Stand tall, slight knee bend.",
      "Hold onto something for balance if standing.",
    ],
    execution: [
      "Push up onto your toes, RISING AS HIGH AS POSSIBLE.",
      "Pause 1s at the top.",
      "Lower SLOWLY (3s) until you feel a deep stretch in the calves.",
    ],
    mistakes: [
      "Bouncing through reps → calves are mostly slow-twitch. Slow + heavy + paused.",
      "Short ROM → calves grow from STRETCH. Get the heel below the platform level.",
      "Bending knees mid-rep → recruits soleus more than gastroc.",
      "Going too heavy → cheats the ROM. Lighter, slower, deeper.",
    ],
    tip: "Calves are genetically stubborn. The fix is volume + slow eccentrics, not heavier weight.",
  },

  "Push-ups (3 × max)": {
    setup: [
      "Hands directly under shoulders, slightly wider than shoulder-width.",
      "Body in a straight line — head, hips, heels all aligned.",
      "Brace abs, squeeze glutes.",
    ],
    execution: [
      "Lower until chest is 1-2\" off the floor (or floor).",
      "Elbows at ~45° from torso (NOT flared 90°).",
      "Press up explosively. Lock out arms at the top.",
    ],
    mistakes: [
      "Hips sagging → no core engagement. Squeeze glutes.",
      "Butt up in the air → reduces work. Straight body.",
      "Elbows flared 90° → shoulder strain. Tuck to 45°.",
      "Half reps → chest to floor (or 1-2\" off). Earn the rep.",
    ],
    tip: "If you can't do a regular push-up, do ELEVATED ones (hands on bench) and progressively lower the surface. Knee push-ups train a different pattern and don't transfer well.",
  },

  "Trap bar DL → conventional": {
    setup: [
      "[Trap bar] Stand inside the trap bar. Grip handles, neutral grip.",
      "[Conventional] Bar over mid-foot, grip outside knees, shins almost touching bar.",
      "Hinge to a flat back, chest up, abs braced HARD.",
    ],
    execution: [
      "Push the floor away with your feet — drive through whole foot.",
      "Hips and shoulders rise TOGETHER. Don't shoot hips up first.",
      "Lock out: stand tall, squeeze glutes. Don't hyperextend.",
      "Lower in reverse — push hips back, then bend knees.",
    ],
    mistakes: [
      "Hips shooting up first → turns it into a stiff-leg deadlift, lower-back risk.",
      "Rounding lower back at the bottom → STOP. Reset position. Lower the weight if needed.",
      "Bar drifting forward → keep it OVER mid-foot the whole pull.",
      "Hyperextending at the top → just stand tall, glutes squeezed.",
    ],
    tip: "Trap bar is more forgiving — lower spine shear, more quad. Conventional > trap bar for posterior chain. Use trap bar in Phase 1 to build pattern, switch in Phase 2.",
  },

  "Weighted pull-ups": {
    setup: [
      "Belt + weight plate / dumbbell between feet / dip belt. Whatever you have.",
      "Same setup as bodyweight pull-ups.",
      "Hang dead, shoulders depressed.",
    ],
    execution: [
      "Pull elbows DOWN. Get collarbone to bar.",
      "Lower under control — DON'T let the weight yank you down.",
      "Reset between reps if needed for form.",
    ],
    mistakes: [
      "Going too heavy too fast → form breaks first. Add 2.5-5 lb per session, not 10.",
      "Half reps from the top → still half reps.",
      "Kipping for the last reps → leave those reps undone, log honestly.",
      "Dropping out of the bottom → controlled lower or it's not a real rep.",
    ],
    tip: "Weighted pull-ups are the king of upper-body strength. 1 weighted pull-up at +20 kg ≈ 5-7 bodyweight pull-ups by carryover.",
  },

  "Close-grip bench press": {
    setup: [
      "Same setup as bench press, but grip ~shoulder-width (not narrower — that strains wrists).",
      "Plant feet, arch lower back slightly, shoulder blades back.",
      "Forearms vertical at the BOTTOM, not the top.",
    ],
    execution: [
      "Lower bar to LOWER chest (sternum area).",
      "Elbows tucked to ~30° from torso.",
      "Press up — feel the triceps drive the lockout.",
    ],
    mistakes: [
      "Grip TOO narrow (<6\" between hands) → strains wrists, no benefit.",
      "Elbows flared 90° → that's a regular bench, not close-grip.",
      "Lowering to upper chest → recruits shoulders too much.",
      "Bouncing off chest → use a controlled pause.",
    ],
    tip: "Close-grip bench is the best compound triceps builder. It carries over to your regular bench by adding lockout strength.",
  },

  "Barbell row (heavier)": {
    setup: [
      "Same as Pendlay row, but you can use a slight cheat / TnT (touch-and-go).",
      "Heavier weight = slightly more torso angle (35-45° from horizontal acceptable).",
      "Brace HARD, knees soft.",
    ],
    execution: [
      "Pull bar to lower chest / upper abs.",
      "Drive elbows back and squeeze blades.",
      "Lower under control — don't slam the floor.",
    ],
    mistakes: [
      "Standing up too much → upright row territory, loses back.",
      "Rounding lower back → injury. Brace abs harder, lower weight.",
      "Letting bar drift forward → vertical pull line only.",
      "Yanking with biceps → drive elbows, not hands.",
    ],
    tip: "Heavier rows in Phase 2/3 are where back THICKNESS comes from. 5-6 reps, slightly cheaty TnT is fine here.",
  },

  "Push press": {
    setup: [
      "Bar in front-rack, same as overhead press.",
      "Stance hip-width, feet flat.",
      "Brace abs, glutes squeezed.",
    ],
    execution: [
      "QUICK quarter-squat dip — knees forward, torso STAYS UPRIGHT.",
      "Explosively drive UP — leg drive transfers into the bar.",
      "As bar passes face, finish with arm extension. Lock out overhead.",
    ],
    mistakes: [
      "Dipping with torso leaning forward → loses leg drive, dumps bar forward.",
      "Slow dip → kills the elastic energy. Quick down, explosive up.",
      "Pressing forward (not straight up) → bar drifts in front of you.",
      "Not finishing with the arms → you stopped pressing too early.",
    ],
    tip: "Push press lets you handle ~20% more weight than strict press, building overhead strength faster.",
  },

  "Rower intervals": {
    setup: [
      "Feet strapped in, balls of feet against pad.",
      "Damper setting 4-6 (not 10 — that's for elite rowers).",
      "Grip handle overhand, just outside knees.",
    ],
    execution: [
      "DRIVE order: legs → back → arms (in that sequence).",
      "RETURN order: arms → back → legs (reverse).",
      "Pull handle to your sternum, not your chin. Lean back ~10-15°.",
    ],
    mistakes: [
      "Pulling with arms first → ergometer's main offense. Legs do 60%.",
      "Slamming back at the catch → wastes energy, hurts back.",
      "Bending knees too early on return → catches the seat. Arms then back THEN knees.",
      "Pulling to chin → strains shoulders. Sternum only.",
    ],
    tip: "Damper 5 ≈ a heavy boat. Higher damper isn't 'harder' — it's slower stroke rate. Lower damper = more sprint feel.",
  },

  "Plank": {
    setup: [
      "Forearms flat on floor, elbows under shoulders.",
      "Body in a STRAIGHT line — head, hips, heels.",
      "Toes tucked, glutes squeezed, abs pulled IN toward spine.",
    ],
    execution: [
      "Hold the position. Breathe normally.",
      "Posterior pelvic tilt — slight tuck of pelvis under.",
      "Squeeze glutes + abs hard for the duration.",
    ],
    mistakes: [
      "Hips sagging → not training abs anymore. Squeeze.",
      "Butt in the air → easy mode. Get straight.",
      "Holding breath → defeats the purpose. Breathe.",
      "Holding for 5 minutes → diminishing returns. 30-60s of HARD bracing > 3 minutes of slack.",
    ],
    tip: "Quality > duration. 45s of perfect plank beats 3 min of sagging. Add weight on your back when 60s is easy.",
  },

  "Ab wheel rollout": {
    setup: [
      "Knees on a pad. Hold ab wheel handles directly under shoulders.",
      "Brace abs and glutes BEFORE you start rolling.",
      "Posterior pelvic tilt (slight tuck).",
    ],
    execution: [
      "Roll wheel forward SLOWLY, keeping the tucked-pelvis position.",
      "Go as far as you can WITHOUT lower back arching.",
      "Pull yourself back — pull with abs, not arms.",
    ],
    mistakes: [
      "Lower back arching at the bottom → INJURY. Don't go further than you can hold the tuck.",
      "Going from knees → standing too early → you'll bail. Master knees for 10 strict reps first.",
      "Pulling with arms → loses ab work. Abs flex you back.",
      "Rushing reps → 3-5s out, 1s back, no rest at the top.",
    ],
    tip: "The ab wheel is the hardest ab exercise that exists. 10 perfect reps from knees > 50 sit-ups.",
  },

  "Hanging knee raise": {
    setup: [
      "Hang from a pull-up bar, grip shoulder-width, palms forward.",
      "Shoulders depressed, slight tension in lats.",
      "Legs straight (or slightly bent), hanging neutrally.",
    ],
    execution: [
      "Posterior pelvic tilt FIRST (tuck pelvis under).",
      "Bring knees up to chest level — pelvis curls up too.",
      "Lower SLOWLY. No swinging.",
    ],
    mistakes: [
      "Swinging legs → uses momentum, no ab work.",
      "Just bending hip flexors → keep the pelvic tilt; that's the ab part.",
      "Stopping at horizontal → go higher. Knees to chest, pelvis curling.",
      "Dropping legs fast → 2-3s lower for full eccentric.",
    ],
    tip: "Without the pelvic tilt, you're just doing hip flexor raises. The TILT is what trains the abs.",
  },

  "Light walk": {
    setup: ["Comfortable shoes. Out the door."],
    execution: ["Walk. Posture upright. Breathing easy."],
    mistakes: [
      "Trying to make it cardio → defeats the recovery purpose.",
      "Phone-buried hunched walking → defeats the posture benefit.",
      "Skipping it on busy days → this is the easiest one to keep. Even 10 min counts.",
    ],
    tip: "Walking is the most underrated recovery and fat-loss tool. ~3 km/h, 20-30 min, easy conversation pace.",
  },

  "Stair climber": {
    setup: ["Set machine to moderate (8-10 of 20)."],
    execution: ["Stand tall — don't hunch over the rails. Foot fully on step."],
    mistakes: [
      "Hunching over and gripping rails → reduces calorie burn ~30%.",
      "Tip-toeing → calf cramps and inefficient.",
      "Going too fast → 20 min steady > 10 min spent + 10 min recovering.",
    ],
    tip: "Stand tall, full foot strikes. If you need to grip rails, slow down.",
  },

  "No training": {
    setup: ["Don't go to the gym."],
    execution: ["Sleep more. Eat well. Stretch if you want, walk if you want."],
    mistakes: [
      "Sneaking in 'just one workout' → defeats recovery. Trust the plan.",
      "Feeling guilty → rest is when muscle is BUILT. Sessions are when it's stimulated.",
    ],
    tip: "If you 'have to' train, do mobility work or a 20-min walk. Don't lift.",
  },
};

// ============================================================
// SPECIMEN CARDS — collectible scientific facts.
// Drop chance per logged set: ~15%. Rarity weighted: common 60%, uncommon 30%, rare 10%.
// ============================================================
window.SPECIMEN_CARDS = [
  // ---- common (60%) ----
  { id: "c001", rarity: "common", title: "Muscle protein synthesis window", category: "biology",
    body: "Post-workout protein synthesis stays elevated for ~24-48 h, not the 30-min 'anabolic window' commonly believed. Distributing 20-40 g protein across 3-5 meals daily is more important than the timing of any single one.",
    source: "Schoenfeld et al. (2013), Nutrient timing revisited." },
  { id: "c002", rarity: "common", title: "Sarcomere stretch overload", category: "biology",
    body: "Muscle fibers respond more strongly to the STRETCHED portion of a movement than to peak contraction. Slow eccentrics (3+ seconds lowering) hit the stretch maximally — and produce more hypertrophy per joule than concentrics.",
    source: "Maeo et al. (2021), Eur J Sport Sci." },
  { id: "c003", rarity: "common", title: "The 1RM is a regression, not a measurement", category: "training",
    body: "Your '1-rep max' is usually estimated from a multi-rep set using the Epley formula: 1RM ≈ weight × (1 + reps/30). A 100 kg × 5 set predicts a 116 kg max — accurate within ~5% for trained lifters.",
    source: "Epley (1985)." },
  { id: "c004", rarity: "common", title: "Caffeine + creatine ≠ cancellation", category: "supplements",
    body: "The 1996 paper claiming caffeine blunts creatine's effect tested 5 mg/kg caffeine (~350 mg) co-ingested. Modern reviews find no negative interaction with normal doses or staggered timing.",
    source: "Trexler & Smith-Ryan (2015), J Int Soc Sports Nutr." },
  { id: "c005", rarity: "common", title: "Volume drives hypertrophy", category: "training",
    body: "Across hundreds of studies, total weekly working sets (10-20 per muscle group) correlates more strongly with growth than intensity, frequency, or load. More sets → more growth, up to ~22-25 sets/wk where the curve flattens.",
    source: "Schoenfeld et al. (2017), J Sports Sci." },
  { id: "c006", rarity: "common", title: "Sleep is the strongest legal anabolic", category: "recovery",
    body: "8 hours of sleep elevates testosterone by 10-15% vs 5 hours. Growth hormone is released in 4-5 pulses per night, mostly during deep sleep. One bad night cuts strength output by 4-6%.",
    source: "Leproult & Van Cauter (2011), JAMA." },
  { id: "c008", rarity: "common", title: "Soreness ≠ growth", category: "training",
    body: "Delayed-onset muscle soreness (DOMS) reflects unaccustomed eccentric loading, not training quality. A muscle can grow significantly without ever being sore. Soreness fades within 2-3 weeks of a routine even as gains continue.",
    source: "Nosaka et al. (2002), Med Sci Sports Exerc." },
  { id: "c009", rarity: "common", title: "The thermic effect of protein", category: "nutrition",
    body: "Digesting protein costs your body ~25-30% of its calories. 200 g of protein at 4 kcal/g = 800 kcal, but the body spends ~200 kcal digesting it. Effective net: ~600 kcal. Carbs cost 5-10%, fat 0-3%.",
    source: "Westerterp (2004), Nutr Metab." },
  { id: "c010", rarity: "common", title: "The squat is not 'bad for knees'", category: "training",
    body: "Decades of biomechanics research show squatting BELOW parallel produces less knee shear force than partial squats. The 'knees over toes' warning is folk wisdom. Full ROM squats build healthier knees, not worse ones.",
    source: "Hartmann et al. (2013), Sports Med." },
  { id: "c011", rarity: "common", title: "Volume per kg", category: "biology",
    body: "Tonnage (sets × reps × weight) is a useful proxy for total muscle stimulus. A typical 4-set push session at 80 kg × 8 reps = 2,560 kg moved through one exercise alone. Across the program, you'll move ~6 million kg cumulatively.",
    source: "Mangine et al. (2015), Physiol Rep." },
  { id: "c012", rarity: "common", title: "Vietnamese coffee chemistry", category: "food",
    body: "The sweetened condensed milk in cà phê sữa đá ranges 9-13 g of fat and 22-30 g of sugar per 30 ml. Robusta beans (the standard cultivar) contain 2.2-2.7% caffeine — almost twice arabica's 1.2-1.5%. One Vietnamese stick = ~120 mg caffeine.",
    source: "Belay et al. (2008), Food Chem." },
  { id: "c014", rarity: "common", title: "Push-up biomechanics", category: "biomechanics",
    body: "A standard push-up loads ~64% of bodyweight onto the upper limbs. At a 30° elevation, that drops to ~41%. At 30° decline (feet up), it rises to ~74%. The reason push-ups feel easier in some hand positions has nothing to do with muscle activation pattern — it's just the load percentage.",
    source: "Suprak et al. (2006), J Strength Cond Res." },
  { id: "c015", rarity: "common", title: "Whey vs casein", category: "nutrition",
    body: "Whey protein digestion peaks at 60-90 minutes; casein at 3-4 hours. Whey raises plasma leucine by 220-280%, casein by 90-120%. For muscle protein synthesis, whey wins acutely; casein wins overnight. Mixing both is a tactic, not a hack.",
    source: "Boirie et al. (1997), PNAS." },

  // ---- uncommon (30%) ----
  { id: "u001", rarity: "uncommon", title: "The smallest skeletal muscle", category: "anatomy",
    body: "The stapedius muscle, attached to the stapes bone in the middle ear, is about 1 mm long. It contracts to dampen loud sounds. Without it, you'd flinch at the sound of your own voice. It is innervated by the facial nerve.",
    source: "Standring (2020), Gray's Anatomy." },
  { id: "u002", rarity: "uncommon", title: "Muscle fiber composition by location", category: "anatomy",
    body: "The soleus (calf, deep) is 80-90% slow-twitch — built for hours of standing. The orbicularis oculi (eyelid) is nearly 100% fast-twitch — blinks must be instantaneous. Most muscles are mixed 40:60 either way and rarely shift past 70:30 with training.",
    source: "Johnson et al. (1973), J Neurol Sci." },
  { id: "u003", rarity: "uncommon", title: "Milo of Croton's progressive overload", category: "training",
    body: "Per Greek tradition, 6th-century-BCE wrestler Milo of Croton carried a calf on his shoulders daily as it grew into a full-grown bull. Whether or not the story is literally true, it's the earliest known reference to progressive overload — adding load incrementally as the body adapts.",
    source: "Quintilian, Institutio Oratoria." },
  { id: "u004", rarity: "uncommon", title: "The creatine accidental discovery", category: "supplements",
    body: "Creatine was first isolated in 1832 by Michel Eugène Chevreul, from meat broth. He named it after the Greek 'kreas' (flesh). It took 160 years for the first study (Harris et al., 1992) to show oral supplementation could raise muscle stores.",
    source: "Harris et al. (1992), Clin Sci." },
  { id: "u005", rarity: "uncommon", title: "Frequency and protein synthesis", category: "training",
    body: "Training a muscle group twice per week produces ~3.1% more growth than once weekly in trained lifters; three times produces no further benefit. Below the volume threshold, frequency matters most; above it, it's invisible.",
    source: "Schoenfeld et al. (2016), Sports Med." },
  { id: "u006", rarity: "uncommon", title: "The trap-bar deadlift advantage", category: "biomechanics",
    body: "Trap-bar deadlifts produce 20-30% lower lumbar shear forces than conventional deadlifts for the same weight, due to the neutral grip and the bar's weight axis passing closer to the body's center of mass. They're also 5-8% slower at the bar — same load, less spine stress.",
    source: "Camara et al. (2016), J Strength Cond Res." },
  { id: "u007", rarity: "uncommon", title: "Why face pulls are 'mandatory'", category: "biomechanics",
    body: "Most lifters are 5-10× stronger in horizontal push (bench, dips) than horizontal pull (rows, face pulls). The resulting imbalance internally rotates the shoulders and tightens the front delts. Face pulls externally rotate, externally rotating retracts — they directly counter the problem.",
    source: "Cools et al. (2007), Br J Sports Med." },
  { id: "u008", rarity: "uncommon", title: "Genetic limits on growth", category: "biology",
    body: "Untrained men gain 4-6 kg of lean mass in the first year of structured training, 2-3 kg in year two, ~1 kg/year by year three. The exponential decay is real and not bypassable without exogenous hormones. Setting realistic expectations is itself a training skill.",
    source: "Lambert & Flynn (2002), Sports Med." },
  { id: "u009", rarity: "uncommon", title: "Coffee and exercise economy", category: "supplements",
    body: "3 mg/kg caffeine (~210 mg for a 70 kg person) reduces rate of perceived exertion by 5-7% during endurance work and improves time-to-exhaustion by 3-5%. The effect is consistent across studies but small enough that it's clearly NOT magic — about 1 extra rep on a heavy set.",
    source: "Grgic et al. (2018), Br J Sports Med." },
  { id: "u010", rarity: "uncommon", title: "Bone density and resistance training", category: "biology",
    body: "Heavy lifting (>80% 1RM) is one of only three things that increases adult bone density (the others: high-impact loading and selective drugs). Walking maintains; jogging slowly improves; lifting heavy improves measurably within 12 months.",
    source: "Watson et al. (2018), J Bone Miner Res." },
  { id: "u011", rarity: "uncommon", title: "Fiber type and aging", category: "biology",
    body: "Aging selectively destroys Type II (fast-twitch) muscle fibers — the ones responsible for power output. By age 80, a sedentary person has lost ~40% of their fast-twitch fibers but only ~10-15% of slow-twitch. Heavy training preserves fast-twitch — making it the single most important anti-aging modality known.",
    source: "Faulkner et al. (2007), Clin Exp Pharmacol Physiol." },
  { id: "u012", rarity: "uncommon", title: "The Greek pankratiast diet", category: "history",
    body: "Olympic competitors of antiquity (pankration, wrestling) ate massive amounts of meat — Galen recorded heavyweight Olympian Theagenes of Thasos eating an entire ox in a sitting. Modern protein recommendations (~1.6-2.2 g/kg) likely overlap with what these athletes ate by accident.",
    source: "Galen, De Sanitate Tuenda (2nd c. CE)." },
  { id: "u013", rarity: "uncommon", title: "The 60s spinal disc", category: "anatomy",
    body: "Intervertebral discs lose ~20% of their water content between age 30 and 60. This is why people shrink by 1-3 cm with age. Heavy spinal loading is paradoxically PROTECTIVE — load drives nutrient diffusion into the (avascular) disc.",
    source: "Adams & Roughley (2006), Spine." },
  { id: "u014", rarity: "uncommon", title: "The 'minimum effective dose'", category: "training",
    body: "Detraining studies show ONE hard set per muscle group per week, taken to within 2 reps of failure, maintains ~95% of strength for 8-12 weeks. The 'use it or lose it' threshold is much lower than people fear during travel or illness.",
    source: "Bickel et al. (2011), Med Sci Sports Exerc." },
  { id: "u015", rarity: "uncommon", title: "Why lifting heavy makes you a better runner", category: "training",
    body: "10 weeks of heavy squat training (>80% 1RM) improves 5 km running economy by 5%, primarily through stiffer Achilles tendons and faster ground contact times. Concurrent training (lifting + running) doesn't have to mean slower at either.",
    source: "Støren et al. (2008), Med Sci Sports Exerc." },

  // ---- rare (10%) ----
  { id: "r001", rarity: "rare", title: "Soleus — the marathon muscle", category: "anatomy",
    body: "The soleus contains the highest density of mitochondria of any human muscle. It can sustain >25% maximum voluntary contraction for HOURS without fatigue. Simply standing up from your chair every 30 minutes is enough to keep it engaged — the lazy upgrade nobody talks about.",
    source: "Hamilton et al. (2022), iScience." },
  { id: "r002", rarity: "rare", title: "Galen's gladiator pharmacy", category: "history",
    body: "Galen of Pergamon (2nd c. CE), physician to Roman gladiators, was the first to systematically link diet, training, and recovery. He prescribed protein-rich diets (mostly pork and beans), regular massages, and graded loading — essentially the first periodized program. He was banned from Rome for ridiculing Hippocrates.",
    source: "Galen, On the Function of the Parts of the Body." },
  { id: "r003", rarity: "rare", title: "The myostatin double-mute", category: "biology",
    body: "Belgian Blue cattle and a small number of human children carry a mutation in the myostatin gene (MSTN) that fully knocks out its function. The result: dramatic muscle hyperplasia from birth. A single human case in Germany (2004) had observable musculature in infancy and could lift 3 kg dumbbells at age 4.",
    source: "Schuelke et al. (2004), NEJM." },
  { id: "r004", rarity: "rare", title: "The pull-up gender gap (mostly) doesn't exist", category: "biomechanics",
    body: "Once strength-to-mass ratio is controlled, women's biomechanical capacity for pull-ups equals men's. The performance gap (~10× fewer reps on average) is overwhelmingly explained by body composition — women carry more fat per kg of muscle. A lean trained woman performs pull-ups indistinguishably from a similarly lean trained man.",
    source: "Vanderburgh & Flanagan (2000), Mil Med." },
  { id: "r005", rarity: "rare", title: "Lifting and the immune system", category: "biology",
    body: "Resistance training acutely depresses immune function for 2-24 hours post-session (the 'open window' theory). But chronic training raises baseline immunity — gym-goers have ~40% fewer upper-respiratory infections than sedentary controls. The trade-off is real and net-positive.",
    source: "Walsh et al. (2011), Exerc Immunol Rev." },
  { id: "r006", rarity: "rare", title: "The 18th-century deadlift", category: "history",
    body: "Strongman Thomas Topham of London (1710-1749) reportedly lifted 'three hogsheads of water', or about 800 kg, off the ground using a harness — an early form of partial deadlift. Records are unreliable, but his recorded mid-thigh pull was 270 kg, equivalent to modern world-class strength.",
    source: "Webster (1976), The Iron Game." },
  { id: "r007", rarity: "rare", title: "Why your nose runs at the gym", category: "biology",
    body: "Exercise-induced rhinitis: the nose's mucus production increases with parasympathetic activity rebounding after sympathetic arousal — your fight-or-flight system relaxes, blood vessels in nasal mucosa dilate, and you drip. It is real, common, and harmless. Athletes use intranasal anticholinergics if it's severe.",
    source: "Silvers (1992), J Allergy Clin Immunol." },
  { id: "r008", rarity: "rare", title: "Sleep deprivation = ~10% strength loss", category: "recovery",
    body: "One night of total sleep deprivation reduces 1RM bench press by 8-12% on average. Partial sleep loss (4 h × 3 nights) reduces it by 5-8%. The effect is mediated more by perceived effort than by physical capacity — strength is 'there' but feels heavier.",
    source: "Reilly & Piercy (1994), Ergonomics." },
  { id: "r009", rarity: "rare", title: "The neural-first response to training", category: "biology",
    body: "In the first 4-6 weeks of training, ~85-90% of strength gain comes from NEURAL adaptations — better motor unit recruitment, synchronization, rate coding — not muscle hypertrophy. Visible muscle growth doesn't begin contributing meaningfully until weeks 6-10.",
    source: "Sale (1988), Med Sci Sports Exerc." },
  { id: "r010", rarity: "rare", title: "The cheese-milk-mucus myth", category: "nutrition",
    body: "Despite global folk belief, dairy does not increase mucus production. The famous blinded trials gave subjects either cow's milk or soy milk and asked them to rate 'mucus feeling.' Both groups reported the same effect — it's the texture, not the composition.",
    source: "Pinnock et al. (1990), Am Rev Respir Dis." },
  { id: "r011", rarity: "rare", title: "Cold water immersion blunts hypertrophy", category: "recovery",
    body: "Ice baths within 24h of resistance training reduce long-term hypertrophy by 25-30%, likely by suppressing the inflammation that drives growth signaling. For RECOVERY between sessions: cold is fine. For GAINING SIZE: avoid it after lifting.",
    source: "Roberts et al. (2015), J Physiol." },
  { id: "r012", rarity: "rare", title: "Hand grip = mortality predictor", category: "biology",
    body: "Grip strength at age 40 predicts all-cause mortality more accurately than systolic blood pressure or BMI. Every 5 kg decrement in grip strength is associated with a 16% higher risk of death in the following decade. The mechanism is unclear; the association is robust across cultures.",
    source: "Leong et al. (2015), Lancet." },
];

// Indexable by id for fast lookup.
window.SPECIMEN_BY_ID = Object.fromEntries(window.SPECIMEN_CARDS.map(c => [c.id, c]));

// Helper: weighted random draw based on rarity.
window.drawSpecimen = function (alreadyOwned) {
  alreadyOwned = alreadyOwned || {};
  const remaining = window.SPECIMEN_CARDS.filter(c => !alreadyOwned[c.id]);
  if (remaining.length === 0) return null;
  // Weight by rarity: common 6, uncommon 3, rare 1
  const weights = { common: 6, uncommon: 3, rare: 1 };
  const pool = [];
  remaining.forEach(c => { for (let i = 0; i < weights[c.rarity]; i++) pool.push(c); });
  return pool[Math.floor(Math.random() * pool.length)];
};
