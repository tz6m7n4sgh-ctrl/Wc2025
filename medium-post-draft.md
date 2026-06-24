# I Rebuilt My World Cup App by Talking to an AI Agent. Here's How It Went.

I didn't write much code for the last version of my World Cup 2026 prediction app. I described what I wanted, looked at what came back, and pointed at the parts that were wrong. Twenty-four times. That was the whole job.

This is a small story about what it actually feels like to build software with an AI coding agent — not the demo version, the real one, with stale data feeds and a phone in my hand catching bugs.

## The setup

I had an old app my friends already used to predict World Cup results. It worked, but it was a single tangled file, and I wanted to rebuild it properly without my users ever noticing the switch. So the first rule I gave the agent was simple: *keep the real data, keep the same URL, don't break anyone.*

It wired up the existing database first, deployed the new version to a hidden `/preview/` path, and only promoted it to the live site once I'd compared the two side by side. Nobody lost a prediction. That patience — staging before shipping — set the tone for everything after.

## The part nobody tells you about

Most of the journey wasn't features. It was me opening the app on my phone, seeing something slightly off, and screenshotting it.

A match showed as "live" thirty minutes behind reality. It turned out my phone sits half an hour off UTC, and the app was trusting the device clock. We pinned every time to the tournament's timezone instead.

Finished matches kept flashing "LIVE" because a lazy data feed never admitted they'd ended. So we let the clock overrule the feed: past a sane match length, the game is over, full stop.

A green "+3" points badge was invisible — white text on a background color that didn't exist. One missing CSS variable. Easy to miss, easy to fix, impossible to un-see once a friend asks why the screen is blank there.

None of these were in any spec. They came from *using* the thing, and the loop — screenshot in, fix out, merged automatically — was fast enough that it never felt like filing bug reports. It felt like editing.

## The detective episode

My favorite moment was a single missing score. Paraguay versus Turkey just… wouldn't fill in. Every other match synced fine.

The obvious guess was a spelling mismatch — "Turkey" versus "Türkiye." But the agent checked, and that wasn't it; the other Turkey games worked. The real reason was sneakier: Turkey's fixtures carried ID numbers from a *different* data feed than the league everything else came from. The app was politely asking a source that would never have that match.

The fix was to look each stubborn game up directly by its own ID, then write the score back to the database so even people without the premium feed would see it. That kind of root-cause digging — past the obvious explanation to the boring true one — is exactly the work I'd have given up on at 11pm on my own.

## Small wins, shipped constantly

Not everything was firefighting. Along the way we put the lineups on an actual football pitch, made the layout breathe on tablets, restored the analytics I'd quietly lost in the migration, and brought back the live ticker that scrolls scores across the bottom of every screen.

The last request was the most ordinary and the most satisfying: a close button on a menu, a dropdown to browse any team's fixtures, and tapping a group to see its matches. Before building it, the agent showed me a mockup. I said "proceed." Ten minutes later it was live.

## What I actually learned

Working this way doesn't remove judgment — it relocates it. I stopped thinking about syntax and spent all my attention on *is this right?* The agent was relentless about the parts I'm lazy about: it ran a full test suite before every deploy, kept the old version as a backup, and never once shipped something it hadn't checked.

But it was still me deciding the timezone should follow the tournament, me noticing the badge was invisible, me saying which "different" I meant. The taste was mine. The typing wasn't.

Twenty-four pull requests, zero broken weekends for my users, and an app I'm genuinely proud of. If you've been waiting for permission to build the thing you keep describing to people — this is what it looks like now. You describe it, and you steer.
