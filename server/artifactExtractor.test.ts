import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArtifactOrJsonFiles } from '../src/services/deliveryEngine';

test('extractArtifactOrJsonFiles: successfully parses Claude Artifact blocks (### FILE: ...)', () => {
  const sampleClaudeOutput = `
<thinking>
We need a robust scraper with requirements.txt and a handover guide.
Edge cases: rate limits, missing HTML elements, network timeout.
</thinking>

### FILE: scraper.py
\`\`\`python
import httpx
from bs4 import BeautifulSoup

def scrape_data(url: str):
    response = httpx.get(url, timeout=10.0)
    soup = BeautifulSoup(response.text, "html.parser")
    return [item.text.strip() for item in soup.select(".item")]

if __name__ == "__main__":
    print(scrape_data("https://example.com"))
\`\`\`

### FILE: requirements.txt
\`\`\`text
httpx>=0.25.0
beautifulsoup4>=4.12.0
\`\`\`

### FILE: 99-Client-Handover-Guide.md
\`\`\`markdown
# راهنمای تحویل کارفرما
نحوه اجرای اسکریپت:
1. \`pip install -r requirements.txt\`
2. \`python scraper.py\`
\`\`\`
`;

  const files = extractArtifactOrJsonFiles(sampleClaudeOutput);
  assert.equal(Object.keys(files).length, 3);
  assert.ok(files['scraper.py']);
  assert.ok(files['requirements.txt']);
  assert.ok(files['99-Client-Handover-Guide.md']);
  assert.ok(files['scraper.py'].includes('def scrape_data'));
  assert.ok(files['requirements.txt'].includes('httpx>=0.25.0'));
  assert.ok(files['99-Client-Handover-Guide.md'].includes('راهنمای تحویل کارفرما'));
});

test('extractArtifactOrJsonFiles: successfully falls back to legacy JSON format', () => {
  const sampleJsonOutput = JSON.stringify({
    files: {
      'app.py': 'print("hello world")',
      'README.md': '# Project Documentation'
    }
  });

  const files = extractArtifactOrJsonFiles(sampleJsonOutput);
  assert.equal(Object.keys(files).length, 2);
  assert.equal(files['app.py'], 'print("hello world")');
  assert.equal(files['README.md'], '# Project Documentation');
});

test('extractArtifactOrJsonFiles: handles code with escaped quotes and backslashes without corruption', () => {
  const sampleCode = `
### FILE: regex_tool.py
\`\`\`python
import re

REGEX = r'^[a-zA-Z0-9_\\-\\.]+@[a-zA-Z0-9\\-]+\\.[a-zA-Z0-9\\-\\.]+$'

def validate(email: str) -> bool:
    return bool(re.match(REGEX, email))
\`\`\`
`;

  const files = extractArtifactOrJsonFiles(sampleCode);
  assert.equal(Object.keys(files).length, 1);
  assert.ok(files['regex_tool.py']);
  assert.ok(files['regex_tool.py'].includes('validate(email'));
});
