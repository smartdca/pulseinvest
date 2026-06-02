#!/usr/bin/env python3
"""Push picks.json to GitHub via API — no git push needed."""
import base64, json, os, urllib.request

token = os.environ["GH_TOKEN"]
repo  = os.environ["REPO"]

with open("picks.json", "rb") as f:
    content = base64.b64encode(f.read()).decode()

api = f"https://api.github.com/repos/{repo}/contents/picks.json"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# Get current SHA
req = urllib.request.Request(api, headers=headers)
with urllib.request.urlopen(req) as r:
    sha = json.loads(r.read())["sha"]

# Update file
body = json.dumps({
    "message": "chore: auto-update picks",
    "content": content,
    "sha": sha,
}).encode()

req2 = urllib.request.Request(api, data=body, headers=headers, method="PUT")
with urllib.request.urlopen(req2) as r:
    result = json.loads(r.read())
    print("Done:", result["commit"]["sha"])
