import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'
import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config()

const TOKEN_PATH = path.resolve('token.json')
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '525474378-8v09hhs6mi7hhfno7s6stj4ura4n38ui.apps.googleusercontent.com'
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

console.log('--- ClassVault Google Drive Authentication Setup ---')

if (!CLIENT_SECRET) {
  console.log(`
[NOTE]: To authenticate Google Drive via OAuth2 in Node.js, you need a Google Client Secret.
1. Go to Google Cloud Console -> APIs & Services -> Credentials
2. Select your OAuth 2.0 Client IDs (Web application)
3. Add Authorized redirect URI: http://localhost:3000/oauth2callback
4. Copy Client Secret and add it to your .env file:
   GOOGLE_CLIENT_ID=your_id
   GOOGLE_CLIENT_SECRET=your_secret

Alternatively, you can place a service account JSON file as "credentials.json" in this directory!
`)
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'http://localhost:3000/oauth2callback',
)

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive',
  ],
})

console.log('\nOpen this URL in your browser to authorize ClassVault:\n')
console.log(authUrl)
console.log('\nWaiting for callback on http://localhost:3000/oauth2callback ...\n')

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const reqUrl = new URL(req.url, 'http://localhost:3000')
    const code = reqUrl.searchParams.get('code')

    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code)
        tokens.client_id = CLIENT_ID
        tokens.client_secret = CLIENT_SECRET
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #16a34a;">Authentication Successful!</h1>
            <p>token.json has been created. You can close this window now.</p>
          </div>
        `)

        console.log('✓ Successfully saved token.json! Google Drive is ready.')
        server.close()
        process.exit(0)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(`Error getting token: ${err.message}`)
        console.error('Error exchanging code:', err)
      }
    }
  }
})

server.listen(3000)
