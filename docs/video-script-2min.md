# PROCTORA — short script (2000 character cap)

Condensed version of `video-script-10min.md`. Pure narration: no screen
directions, no markdown, no special characters, so it can be pasted directly
into a text-to-speech tool or used as a short-form voiceover.

Roughly 2 minutes at a natural speaking pace.

---

You've built an online test. You send the link to fifty candidates. They take it at home, alone. How do you know those scores mean anything?

That's what Proctora solves. It's an online exam platform with proctoring built into the browser.

You create an exam, multiple choice questions, marks, a duration, and you get one link. That's the whole distribution. Email it, Slack it, done. Candidates need no account, no install, no extension.

When a candidate opens the link they enter their name and email, then hit a system check. Camera, microphone, fullscreen. Start stays disabled until everything passes, because the worst time to find a broken webcam is ninety seconds into a timed exam.

Then the exam opens fullscreen and the clock starts, on the server. Changing your system clock does nothing. Close your laptop and it still submits at the deadline.

While they work, Proctora watches. No face visible for six seconds gets logged. A second person on camera, two and a half seconds. Leaving the tab, leaving fullscreen, losing a camera, a noisy room, all recorded with a severity. And here's the part that matters. The video never leaves their machine. Face detection runs on the device. Nothing is recorded or uploaded, only the flags.

The administrator watches it live. Attempts appear, flags stream in, no refresh. Afterwards every attempt has a report: the score, marked on the server, a timestamped timeline of every flag, and a full answer review.

One honest note. This detects presence, not identity. It measures loudness, not words. A phone under the desk is invisible to any browser. So nothing auto fails anyone. Every flag goes to a human to judge.

Proctora raises the cost of cheating and gives you an evidence trail you can defend. Build an exam, share a link, trust the result.
