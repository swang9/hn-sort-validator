# hn-sort-validator

Automated validator that confirms Hacker News surfaces its newest 100 articles 
in correct chronological order. Built with Playwright and Node.js.

![CI](https://github.com/swang9/hn-sort-validator/actions/workflows/test.yml/badge.svg)

## What it does

Navigates HN's `/newest` feed, paginates until 100 articles are collected, 
then validates all of the following:

- Articles are sorted newest → oldest (ties allowed)
- Ranks are sequential 1–100 with no gaps
- No duplicate article URLs
- All articles have titles
- All timestamps are valid ISO format
- No missing timestamps

Generates an HTML report and JSON artifact on every run, pass or fail.
Screenshots and Playwright traces are captured automatically on failure.

## Run it

```bash
npm install
npx playwright install chromium

# Required deliverable — exits with code 1 on failure
npm run validate

# Full test suite including unit tests
npm test
