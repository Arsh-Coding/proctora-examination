# PROCTORA — 10-Minute Product Explainer

**Format:** spoken narration with screen directions. ~1,450 words, ~140 wpm.
**Audience:** someone who has never seen the product. No code, no file names.
**Convention:** plain text = say it out loud. `[ON SCREEN]` = what to show.

---

## 0:00 — Cold open (35s)

`[ON SCREEN] A candidate's screen mid-exam: question on the left, camera preview with a green box around the face, timer counting down.`

Let me ask you something. You've built an online test. You send the link to fifty candidates. They take it at home, alone, on their own laptops.

How do you know any of those scores mean anything?

That's the whole problem. And it's the problem this product solves.

`[ON SCREEN] Title card: PROCTORA`

This is Proctora. It's an online exam platform with proctoring built into the browser. In the next ten minutes I'll show you both sides of it — the person running the exam, and the person sitting it — and I'll be straight with you about what it can and can't catch.

---

## 0:35 — The problem, properly (65s)

`[ON SCREEN] Split screen: a plain Google Form on one side, a Zoom grid of 30 tiny faces on the other.`

Right now, if you need to run a remote assessment, you've got three options and none of them are good.

Option one, the honour system. Send a form, hope for the best. Fine for a practice quiz. Useless if the result decides who gets hired or certified.

Option two, babysit it on a video call. Actually works — for about six people. Past that you're one human trying to watch thirty video tiles, and you'll miss everything.

Option three, buy enterprise proctoring software. This is the real option, and it's genuinely powerful. But there's a catch, and it's a big one.

`[ON SCREEN] Illustration: a webcam feed with an upload arrow going to a cloud with a padlock.`

Those tools work by recording the candidate — their face, their room, their screen — and uploading it to a server. Which means three things. It's expensive, usually an annual contract. The candidate has to install an app or a browser extension. And now somebody is storing video of a nineteen-year-old's bedroom, and that's your legal problem to manage.

So a whole category of people get stuck in the middle. Bootcamps. Training providers. Certification bodies. Recruiters running a technical screen. They need results they can defend, but they can't justify any of that.

---

## 1:40 — What Proctora actually is (40s)

`[ON SCREEN] Simple diagram: Admin → one link → Candidate's browser → signals back to Admin.`

So here's the one-sentence version. Proctora lets you create an exam, share a single link, and have the candidate sit it in their browser while it watches for the things that matter — and nothing is ever recorded or uploaded.

Two people use it. An **administrator**, who builds the exam and reviews results. And a **candidate**, who just gets a link. The candidate never makes an account, never installs anything, never adds an extension. They click a URL. That's it.

Let me walk you through both sides.

---

## 2:20 — Side one: building the exam (80s)

`[ON SCREEN] Admin dashboard. Stat cards across the top.`

This is the admin console. Exams, candidates, completed attempts, average score, total violations — all live from the database.

`[ON SCREEN] Click through to "Create exam". Fill in title, description, duration.`

Creating an exam is about as simple as it gets. Title, a description the candidate sees before they start, and a duration in minutes.

`[ON SCREEN] Add a question, fill four options, click the correct letter, set marks.`

Then questions. Multiple choice, four options, you click which one is correct, and you set how many marks it's worth. Total marks add themselves up — you never type a total, so it can't disagree with the questions.

`[ON SCREEN] Hit save. Land on the exam detail page. Highlight the "Candidate exam link" card.`

And the moment you save, you get this. One link.

`[ON SCREEN] Click "Copy Exam Link".`

That's the whole distribution mechanism. Put it in an email, a Slack message, a calendar invite. Anyone with the link can attempt it once.

`[ON SCREEN] Toggle "Show answers" to reveal the correct options.`

Two details worth pointing out. The answer key lives here, on the admin side, visible to you — and it is never sent to a candidate's browser. Not hidden with CSS, not disabled. Never sent. Which means there's nothing to find in the page source.

`[ON SCREEN] Point at the "Close exam" button.`

And when you're done accepting attempts, you close the exam. Anyone mid-attempt finishes normally; new people can't start.

---

## 3:40 — Side two: the candidate arrives (90s)

`[ON SCREEN] Open the exam link in a clean browser window. Step 1 form.`

Now let's be the candidate. This is what the link opens.

Name and email. That's all it asks. The email is what limits you to one attempt — try to start a second time and it tells you you've already submitted.

`[ON SCREEN] Continue → Step 2, system check, with "Start exam" visibly greyed out.`

And here's my favourite part of the product, because it's the part that prevents the support ticket.

Before the exam opens, there's a system check. Camera, microphone, whether the browser can actually do what's needed, whether it can go fullscreen. And look — **Start exam is disabled.** You cannot begin until the environment is actually working.

`[ON SCREEN] Click "Allow camera & microphone", grant permission, checks turn green one by one.`

This matters more than it sounds. The worst possible moment to discover a broken webcam is ninety seconds into a timed exam. So it gets discovered now, while nothing is at stake and the clock isn't running.

`[ON SCREEN] Camera preview with a green box tracking the face. Mic level meter moving.`

And this is the bit people don't expect. That green box is live face detection, running **inside the browser, on this laptop.** The video isn't going anywhere. There's no upload, no server-side analysis, no recording. The camera feed never leaves the machine.

`[ON SCREEN] Scroll to the "What is monitored" list and read it on screen.`

The candidate is also told, in plain language, exactly what's being watched before they agree to start. Face present. Whether more than one face is visible. Microphone loudness — not words, just volume. Leaving the tab. Leaving fullscreen. Camera or mic being unplugged.

No surprises. I think that's the right way to do this.

---

## 5:10 — During the exam (110s)

`[ON SCREEN] Click Start exam. Fullscreen. Timer appears.`

Start exam, and two things happen. The page goes fullscreen, and the clock starts — on the server.

`[ON SCREEN] Highlight the timer.`

That distinction matters. The browser is only ever told how much time is left; it doesn't own the deadline. So changing your system clock does nothing. Closing your laptop does nothing — the exam gets submitted at its deadline whether you're there or not.

`[ON SCREEN] Answer a couple of questions. Point at the "Saved" indicator and the question navigator.`

Answering is ordinary. Pick an option, move on, jump around with the navigator. Everything saves as you go, so a dropped connection or a closed tab doesn't cost you your answers. Come back to the link and you're where you left off, with the time that's actually left.

`[ON SCREEN] Point at the strip of status chips: Camera, Microphone, Face, Audio, Fullscreen, Focus.`

And along the top, the candidate can see every signal being monitored, live. Nothing is hidden from them.

Now — the interesting part. **What actually gets flagged?**

`[ON SCREEN] Switch to another tab for two seconds, come back. Warning banner appears.`

Leave the exam window, and that's recorded. You get a warning, and it counts — one of three.

`[ON SCREEN] Press Escape to leave fullscreen. Second banner appears.`

Leave fullscreen, same thing.

`[ON SCREEN] Step out of frame for several seconds. "No face" appears, then the event lands.`

Step away from the camera, and after **six continuous seconds** of not seeing a face, that's logged.

`[ON SCREEN] Have a second person lean into frame. "2 faces" appears.`

And if a second person appears on camera, that's flagged in **two and a half seconds** — faster, and at higher severity, because someone else in the room is a much stronger signal than a candidate glancing away.

Those delays are deliberate, and they're the difference between a useful tool and an infuriating one. Six seconds means reaching for your coffee doesn't flag you. And each type has a cooldown, so if you're away for two minutes you get **one** record, not four hundred.

`[ON SCREEN] Point at the candidate's own "Recorded events" panel.`

The candidate sees their own log, as it happens. No secret file being built about them.

---

## 7:00 — Submitting (40s)

`[ON SCREEN] Click Submit. Confirmation dialog appears.`

When they submit, they get asked to confirm — and it tells them exactly how many questions they've left blank, which is the one thing you actually want to know at that moment.

`[ON SCREEN] Confirm. Submission receipt appears.`

And then... that's it. Notice what's **not** here. No score. No "you got question four wrong." No answer key.

Marking happens on the server, and the result is released by whoever is running the exam — because in a real hiring or certification process, you don't hand out scores at the buzzer.

---

## 7:40 — Back to the admin: watching and reviewing (70s)

`[ON SCREEN] Admin monitoring page for the exam, with attempts in progress.`

Meanwhile, this is what the administrator has been looking at.

`[ON SCREEN] A new attempt appears in the table on its own. Then a violation appears in the feed.`

And this page is live. Nobody refreshed it. A candidate starts, the row appears. A flag is raised, it shows up here within a second — who, what, and how serious.

So for a big cohort you're not reviewing afterwards, you're watching it happen, with a countdown per candidate and how many answers they've got in.

`[ON SCREEN] Click into a single candidate's report. Score card, then violation timeline, then answer review.`

And afterwards, every attempt has a report. The score, out of the total, as a percentage. When they started, when they submitted, when they were last seen.

`[ON SCREEN] Scroll the violation timeline.`

Then the timeline — every flag, timestamped, with a severity. Not a verdict. Evidence.

`[ON SCREEN] Scroll the answer review, showing correct vs chosen.`

And a full answer review: what the right answer was, what they picked, what they scored on each question.

---

## 8:50 — What it does NOT do (40s)

`[ON SCREEN] Plain slide, three short bullets appearing as you say them.`

Now let me be honest with you, because every product in this space oversells this.

Proctora detects **presence**. It knows whether a face is there and how many. It does not know *who* you are, it doesn't verify identity against an ID, and it doesn't track your eyes.

The audio measures **loudness only**. It doesn't transcribe you. A passing motorbike can flag you.

And the honest one: if someone reads answers off a phone under the desk, a browser cannot see that. Nothing in a web page can.

`[ON SCREEN] Emphasis slide: "Nothing auto-fails a candidate."`

Which is exactly why nothing here auto-fails anyone. Every flag goes to a human to interpret. A tool like this raises the cost of cheating and gives you a reviewable trail — it doesn't render a judgement, and it shouldn't.

---

## 9:30 — Wrap (30s)

`[ON SCREEN] Back to the admin dashboard, populated with real numbers.`

So — that's Proctora. Build an exam, share one link, and the candidate sits it under real monitoring with no account, no install, and no video ever leaving their machine. You get a score you can defend and an evidence trail you can actually review.

If you're running technical screens, certifications, or course assessments and the honour system has stopped being good enough, that's the gap this fills.

`[ON SCREEN] End card.`

Thanks for watching.

---

## Delivery notes

**Pacing.** ~1,450 words. At a natural 140 wpm that's about 10:20 with breaths. If you run long, the two safest cuts are the Option-one/two/three list at 0:35 and the answer-review beat at 8:30. Do **not** cut the 8:50 limitations section — it's what makes the rest credible.

**Set up before recording:**

- An exam already built, so you're not typing 20 fields on camera. Create a second one live only if you want to show the builder.
- Two browser windows (or one plus incognito): admin in one, candidate in the other. Never show them logged in together in the same window.
- A second person available for ~10 seconds for the multiple-faces beat. This is the single most convincing shot in the video — don't skip it.
- A real webcam. The green box tracking an actual face sells the on-device claim in a way a screenshot cannot.

**Two moments to slow down on**, because they're the differentiators and viewers will miss them at speed: the camera feed never leaving the device (4:40), and the clock living on the server (5:25).

**Tone.** The 8:50 section should sound like you're leveling with the viewer, not hedging. It's the most trust-building 40 seconds in the script — deliver it as confidence, not apology.
