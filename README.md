# SIO Assistant — Proof of Concept

Working demo for **Bahrain Tender Board 3/2026/SIO** — Chat Bot Solution, Social Insurance
Organization, Kingdom of Bahrain. Built by Nanta Tech.

## Run it

Needs Node 18 or newer. Nothing to install.

```bash
cp .env.example .env        # add your Anthropic API key
npm start                   # http://localhost:3000
```

In VS Code you can also press **F5** — the launch config starts the server and opens the browser.

The key stays in `.env` on the server side; the browser calls `/api/chat` and never sees it.

## Demo path

Roughly four minutes, and it lights all eight items on the coverage rail:

1. Ask an English question about pension eligibility → **Conversational AI**
2. Ask in Arabic (a sample sits in the side panel) → **Multilingual + RTL**
3. Press the microphone and speak a question → **Voice interaction**
4. "My salary is 800 BHD and I have 24 years of service" → **Indicative benefit estimate**
5. Tap the ✆ icon to switch the channel to WhatsApp, ask again → **Omnichannel**
6. Open **Knowledge base**, edit an article, return and re-ask → **KB management**
7. File a complaint → ticket reference appears → **Escalation**
8. Open **Conversation log** and **Dashboard**, export the CSV → **Logging + dashboard**

**Reset demo data** in the bottom-left restores the starting state between demos.

## Before showing it to SIO

- Replace the sample rule values (Knowledge base → Benefit calculation rules) with the real
  figures from SIO's regulations. They are placeholders and labelled as such.
- Review the ten seed knowledge articles against SIO's published service descriptions.
- Speech input needs Chrome or Edge. Typing works in every browser.

## Layout

```
server.js            Node server + Anthropic proxy (no dependencies)
public/index.html    Markup
public/styles.css    Styling
public/app.js        Chat engine, rule engine, KB, logs, dashboard
CLAUDE.md            Context for Claude Code
.env.example         Copy to .env
```

## What this POC is not

Integration with SIO core systems, SSO, production security hardening, hosting and Bahrainisation
compliance are addressed in the technical bid. The demo states this on screen rather than implying
coverage it does not have.
