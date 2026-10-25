import test from 'node:test';
import assert from 'node:assert/strict';
import { runLocalStaticInspection } from '../src/services/arbiterEngine';

test('runLocalStaticInspection: flags lazy stubs and placeholders (TODO, pass)', () => {
  const filesWithStubs = {
    'main.py': `
import os

def calculate_analytics(data):
    # TODO: implement this logic later
    pass
`
  };

  const findings = runLocalStaticInspection(filesWithStubs);
  const stubFindings = findings.filter(f => f.issue.includes('Lazy Stub'));
  assert.ok(stubFindings.length >= 1, 'Should detect lazy stub in code');
});

test('runLocalStaticInspection: flags phantom imports missing from requirements.txt', () => {
  const filesWithPhantomImports = {
    'scraper.py': `
import httpx
from bs4 import BeautifulSoup

def run():
    print("scraping")
`,
    'requirements.txt': `
requests>=2.31.0
`
  };

  const findings = runLocalStaticInspection(filesWithPhantomImports);
  const phantomFindings = findings.filter(f => f.issue.includes('Phantom Import') || f.issue.includes('عدم ثبت پکیج'));
  assert.ok(phantomFindings.length >= 1, 'Should detect phantom imports httpx or beautifulsoup4');
});

test('runLocalStaticInspection: flags missing requirements.txt when external packages are used', () => {
  const filesMissingReqs = {
    'bot.py': `
import telegram
from telegram.ext import Application
`
  };

  const findings = runLocalStaticInspection(filesMissingReqs);
  const reqFindings = findings.filter(f => f.file === 'requirements.txt');
  assert.ok(reqFindings.length >= 1, 'Should flag missing requirements.txt');
});

test('runLocalStaticInspection: approves clean, well-formed package with guide and complete requirements', () => {
  const cleanPackage = {
    'main.py': `
import sys
import httpx

def main():
    res = httpx.get("https://example.com", timeout=5.0)
    print("Status:", res.status_code)

if __name__ == "__main__":
    main()
`,
    'requirements.txt': 'httpx>=0.25.0\n',
    '99-Client-Handover-Guide.md': '# Complete Setup & Execution Guide'
  };

  const findings = runLocalStaticInspection(cleanPackage);
  assert.equal(findings.filter(f => f.severity === 'CRITICAL').length, 0);
});
