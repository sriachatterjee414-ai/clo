# Arcade Hub

This version has shared player accounts and a global leaderboard.

## Player accounts
- New players choose a unique username (2-16 characters).
- They also create a 4-8 digit PIN.
- The username is unique without regard to capitalization, so `Sria` and `sria` cannot both exist.
- The username/PIN can be used to log in on another phone or computer.
- Game scores, wins, levels and follows are saved to that player's account.

## Run on your computer
1. Install Node.js 18+.
2. Open this folder in Command Prompt.
3. Run:
   `npm start`
4. Open:
   `http://localhost:3000`

## Put it online
Upload the whole folder to GitHub and deploy the Node app on a host that can run `npm start`.

The app is designed so every device uses the same server and therefore sees the same leaderboard.

### Important for a real public launch
The included `data.json` storage is simple file storage. Some free hosting services can erase local files when the server restarts. For permanent public accounts/scores, connect this API to a persistent database (such as Supabase/Postgres) or use a hosting plan with persistent storage.

## Account security
PINs are stored as PBKDF2 hashes, not as plain-text PINs. The browser keeps a login token so the player stays signed in on that device.
