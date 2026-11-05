# Form videos (ROADMAP L9, audit E05)

One YouTube clip per library exercise, played in-app by `src/ui/components/VideoModal.tsx`.
`videoId` in `src/domain/plan/library.ts` must equal the table below; `src/domain/plan/formVideos.test.ts` reads both.

## Method (2026-11-05)
- Candidates: YouTube's own search results page (`youtube.com/results?search_query=<exercise> form`), top 12 per exercise, parsed for id, channel, length and title.
- Pick: the exact variant in the title (dumbbell vs barbell, lying vs seated, bodyweight vs loaded); a coaching, certification, clinical or equipment-maker channel; a short demo preferred over a long lecture (a longer clip was kept where it came from the movement's specialist, e.g. Squat University, Bret Contreras, Starting Strength).
- Verify: `GET https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` must return 200; title and author below are copied from that response. A missing id fails (negative controls `AAAAAAAAAAA` 404, `zzzzzzzzzzz` 400 on 2026-11-05). Whether oEmbed also refuses a clip whose owner disabled embedding was not tested.
- Length: from the search page, not from oEmbed (which carries none).
- Not checked: that each clip plays inside the app's sandboxed, privacy-enhanced frame on a phone. oEmbed 200 means the clip exists and is public, not that it plays here.
- Re-verify before a release that touches this table: rerun the oEmbed call for every id; a non-200 id becomes `null` (never a guessed replacement) until a new id is verified.

## Null ids
- `walk`: no clip picked. The results were gait-correction videos (physiotherapy and posture channels, 0:45 to 12:10), not a demo of the prescribed easy walk. The modal shows the form cues and "no clip yet".

## Title differs from the library row (judged from title and channel; no clip was watched)
- `db-rear-delt-fly`: "Dumbbell Bent-Over Raise", another name for the same movement.
- `db-overhead-press`: "Dumbbell Shoulder Press"; the library row does not fix seated or standing.
- `triceps-overhead-extension`: standing, one dumbbell; the row also allows a cable rope.
- `calf-raise`: standing with dumbbells; the row also allows a machine or bodyweight on a step.
- `leg-curl-machine`: lying machine, as the legacy search string ("lying leg curl") had it.
- `bw-step-up`: "Step Ups/Downs"; the title does not say unloaded.
- `ab-wheel-rollout`: "Strengthening the core: Ab Wheel".
- `rower-intervals`, `stair-climber`: machine technique, not an interval session.

## Table

| Exercise | Video id | Title (oEmbed) | Channel (oEmbed) | Length | Verified |
| --- | --- | --- | --- | --- | --- |
| `barbell-bench-press` | `hWbUlkb5Ms4` | How To Bench Press With Perfect Technique (5 Steps) | Jeff Nippard | 0:51 | 2026-11-05 |
| `close-grip-bench-press` | `nEF0bv2FW94` | How To: Close-Grip Barbell Bench Press | ScottHermanFitness | 1:36 | 2026-11-05 |
| `overhead-press-barbell` | `2yjwXTZQDDI` | How To: Standing Straight-Bar Military / Overhead Press | ScottHermanFitness | 2:48 | 2026-11-05 |
| `push-press` | `yklSQG1_Ovc` | Push Press \| Olympic Weightlifting Exercise Library | Catalyst Athletics | 1:37 | 2026-11-05 |
| `db-overhead-press` | `qEwKCR5JCog` | How To: Dumbbell Shoulder Press | ScottHermanFitness | 2:24 | 2026-11-05 |
| `incline-db-press` | `8iPEnn-ltC8` | How To: Dumbbell Incline Chest Press | ScottHermanFitness | 2:43 | 2026-11-05 |
| `push-up` | `WDIpL0pjun0` | How to do a Push-Up \| Proper Form & Technique \| NASM | National Academy of Sports Medicine (NASM) | 0:14 | 2026-11-05 |
| `pike-push-up` | `XckEEwa1BPI` | How to do a Pike Push-Up | National Academy of Sports Medicine (NASM) | 0:17 | 2026-11-05 |
| `bench-dip` | `c3ZGl4pAwZ4` | How To: Bench Dip | ScottHermanFitness | 1:38 | 2026-11-05 |
| `lateral-raise` | `XPPfnSEATJA` | How to do a Dumbbell Lateral Raise | National Academy of Sports Medicine (NASM) | 0:19 | 2026-11-05 |
| `db-rear-delt-fly` | `ttvfGg9d76c` | How To: Dumbbell Bent-Over Raise | ScottHermanFitness | 1:42 | 2026-11-05 |
| `triceps-overhead-extension` | `-Vyt2QdsR7E` | How To: Standing Overhead Dumbbell Tricep Extension | ScottHermanFitness | 1:43 | 2026-11-05 |
| `barbell-curl` | `dDI8ClxRS04` | Barbell Curl - Biceps Exercise - Bodybuilding.com | Bodybuilding.com | 0:45 | 2026-11-05 |
| `hammer-curl` | `zC3nLlEvin4` | How To: Dumbbell Hammer Curl | ScottHermanFitness | 2:03 | 2026-11-05 |
| `pull-up` | `XB_7En-zf_M` | How to do a Perfect Pullup | FitnessFAQs | 2:24 | 2026-11-05 |
| `chin-up` | `mRy9m2Q9_1I` | Proper Chin-Up Form | KILO Strength Society Education | 1:00 | 2026-11-05 |
| `lat-pulldown` | `AOpi-p0cJkc` | Beginner's Guide: Lat Pulldown | SilverSneakers | 2:18 | 2026-11-05 |
| `weighted-pull-up` | `HuuyDNGrCI8` | How To: Weighted Pull-Up | ScottHermanFitness | 1:52 | 2026-11-05 |
| `barbell-row-pendlay` | `cYVkgmPqRMw` | Pendlay Row \| Olympic Weightlifting Exercise Library | Catalyst Athletics | 0:56 | 2026-11-05 |
| `barbell-row` | `bm0_q9bR_HA` | How to do a Barbell Bent Over Row Pronated | National Academy of Sports Medicine (NASM) | 0:19 | 2026-11-05 |
| `db-single-arm-row` | `pYcpY20QaE8` | How To: Dumbbell Bent-Over Row (Single-Arm) | ScottHermanFitness | 2:20 | 2026-11-05 |
| `inverted-row` | `KOaCM1HMwU0` | Inverted Row | Renaissance Periodization | 0:13 | 2026-11-05 |
| `face-pull` | `eTCBSFlCJ_s` | How to do a Face Pull \| Proper Form & Technique \| NASM | National Academy of Sports Medicine (NASM) | 0:26 | 2026-11-05 |
| `barbell-back-squat` | `-bJIpOq-LWk` | How to do a Barbell Back Squat | National Academy of Sports Medicine (NASM) | 0:12 | 2026-11-05 |
| `leg-press` | `p5dCqF7wWUw` | How To Use The Leg Press Machine | PureGym | 1:01 | 2026-11-05 |
| `goblet-squat` | `MeIiIdhvXT4` | How To: Goblet Squat | ScottHermanFitness | 3:12 | 2026-11-05 |
| `bulgarian-split-squat` | `hPlKPjohFS0` | The PERFECT Bulgarian Split Squat (Avoid These Errors!) | Squat University | 5:20 | 2026-11-05 |
| `romanian-deadlift` | `xgusDooVfKU` | How to do a Romanian Deadlift (Barbell) \| Proper Form & Technique \| NASM | National Academy of Sports Medicine (NASM) | 0:20 | 2026-11-05 |
| `db-romanian-deadlift` | `aa57T45iFSE` | How to do a Dumbbell Romanian Deadlift \| Proper Form & Technique \| NASM | National Academy of Sports Medicine (NASM) | 0:31 | 2026-11-05 |
| `trap-bar-deadlift` | `FYx76NSijfU` | Trap Bar Deadlift | OPEX Fitness | 0:17 | 2026-11-05 |
| `conventional-deadlift` | `p2OPUi4xGrM` | Learning to Deadlift \| The Starting Strength Method | Starting Strength | 4:23 | 2026-11-05 |
| `leg-curl-machine` | `vl5nUdE9mWM` | How to Lying Leg Curl \| Proper Technique, Set Up, & Mistakes | Physique Development | 2:44 | 2026-11-05 |
| `nordic-hamstring-curl` | `kjv4WQXWl_A` | Nordic Hamstring Curl | Onnit Academy | 0:15 | 2026-11-05 |
| `calf-raise` | `wxwY7GXxL4k` | Standing Dumbbell Calf Raises - Calf Exercise - Bodybuilding.com | Bodybuilding.com | 0:48 | 2026-11-05 |
| `plank` | `mwlp75MS6Rg` | How to do a Plank \| Proper Form & Technique \| NASM | National Academy of Sports Medicine (NASM) | 0:15 | 2026-11-05 |
| `ab-wheel-rollout` | `_BHKT60P6bc` | Strengthening the core: Ab Wheel | UCLA Health | 0:55 | 2026-11-05 |
| `hanging-knee-raise` | `RD_A-Z15ER4` | Hanging Knee Raise | Renaissance Periodization | 0:09 | 2026-11-05 |
| `rower-intervals` | `4zWu1yuJ0_g` | Correct Rowing Machine Technique, Improve Your Rowing  \| Concept2 | concept2usa | 1:54 | 2026-11-05 |
| `stair-climber` | `ST-5lD69XqU` | How to use a Stair Climber \| Planet Fitness | Planet Fitness | 1:31 | 2026-11-05 |
| `walk` | null | - | - | - | - |
| `db-reverse-lunge` | `Q2k3kYbtOcI` | Dumbbell Reverse Lunge | OPEX Fitness | 0:12 | 2026-11-05 |
| `db-walking-lunge` | `eFWCn5iEbTU` | Dumbbell Walking Lunge | Renaissance Periodization | 0:10 | 2026-11-05 |
| `db-step-up` | `7AtIjR-QqVA` | Dumbbell Step Ups - Leg Exercise - Bodybuilding.com | Bodybuilding.com | 0:48 | 2026-11-05 |
| `db-single-leg-rdl` | `_DhDkij1vxY` | Single-Leg Dumbbell RDL \| Olympic Weightlifting Exercise Library | Catalyst Athletics | 1:04 | 2026-11-05 |
| `bw-reverse-lunge` | `Rd986_TXFXc` | Bodyweight Reverse Lunge | Glute Lab | 0:16 | 2026-11-05 |
| `bw-forward-lunge` | `MxfTNXSFiYI` | Forward Lunges Exercise Demonstration | MedStar Health | 0:17 | 2026-11-05 |
| `bw-split-squat` | `JLW4AVzdzTc` | Bodyweight Split Squat | Functional Bodybuilding | 0:20 | 2026-11-05 |
| `bw-step-up` | `elhu-WC1qk4` | Proper Step Ups/Downs | [P]rehab | 0:44 | 2026-11-05 |
| `bw-squat` | `8uoaYwS6iFM` | Squat (Bodyweight) \| Fit for the 500 \| IU Health Sports Performance | IU Health | 1:10 | 2026-11-05 |
| `bw-single-leg-rdl` | `TndTn7CibGY` | Single-Leg Romanian Deadlift (bodyweight) | Girls Gone Strong \| Women's Health & Fitness | 0:27 | 2026-11-05 |
| `barbell-hip-thrust` | `LM8XHLYJoYs` | Proper Hip Thrust Form | Bret Contreras Glute Guy | 4:35 | 2026-11-05 |
| `glute-bridge` | `PhTDzR0TpZs` | How to Do a Glute Bridge Exercise: A Guide from Physical Therapists | Hinge Health | 0:54 | 2026-11-05 |
| `leg-extension` | `YyvSfVjQeL0` | How To: Leg Extension (Cybex) | ScottHermanFitness | 2:41 | 2026-11-05 |
| `db-bench-press` | `U2wKgoUAEMo` | Dumbbell Bench Press - Modern Woman's Guide to Strength Training | Girls Gone Strong \| Women's Health & Fitness | 1:06 | 2026-11-05 |
| `db-floor-press` | `uUGDRwge4F8` | How To: Dumbbell Floor Press | ScottHermanFitness | 1:39 | 2026-11-05 |
| `incline-push-up` | `Gvm5Q29UHbk` | How to do an Incline Push-Up | National Academy of Sports Medicine (NASM) | 0:19 | 2026-11-05 |
| `cable-triceps-pushdown` | `2-LAMcpzODU` | How To: Tricep Pushdown (Life Fitness Cable) | ScottHermanFitness | 1:52 | 2026-11-05 |
| `cable-lateral-raise` | `Z5FA9aq3L6A` | How To Do Cable Lateral Raises | PureGym | 0:15 | 2026-11-05 |
| `seated-cable-row` | `UCXxvVItLoM` | Seated Cable Row | Renaissance Periodization | 0:18 | 2026-11-05 |
| `band-row` | `LSkyinhmA8k` | How To Do A Resistance Band Row | Get Healthy U - with Chris Freytag | 0:49 | 2026-11-05 |
| `door-frame-row` | `r8NzhNe9Res` | Door Frame Rows | Sul Ross State Sports Performance | 1:07 | 2026-11-05 |
| `band-pull-apart` | `bYsgk9SrJ48` | How to Do Band Pull Aparts: A Guide from Physical Therapists | Hinge Health | 1:12 | 2026-11-05 |
| `band-lateral-raise` | `yfNg5sFndbw` | Band Lateral Raise | Men's Health | 0:47 | 2026-11-05 |
| `band-curl` | `0hZboUNuogA` | Banded Bicep Curl | OPEX Fitness | 0:14 | 2026-11-05 |
| `prone-t-raise` | `yejKRcxeH90` | Prone T Raise | Functional Bodybuilding | 0:12 | 2026-11-05 |
| `dead-bug` | `BZYaCzbP09M` | Dead Bug | E3 Rehab Exercise Library | 0:19 | 2026-11-05 |
| `side-plank` | `44ND4bOB-T0` | How to do a Side Plank  \| Proper Form & Technique \| NASM | National Academy of Sports Medicine (NASM) | 0:17 | 2026-11-05 |
| `farmer-carry` | `z7E_YU9P1jU` | How to Perform the Farmer’s Carry | Dr. Carl Baird | 2:20 | 2026-11-05 |
