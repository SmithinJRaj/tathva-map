import { Writable } from 'node:stream'
import { createInterface } from 'node:readline'
import { openDb } from '../db.ts'
import { upsertAdmin } from '../auth.ts'

const usage = 'Usage: npm run admin -- add <username> <display name...>'

const [command, username, ...nameParts] = process.argv.slice(2)
if (command !== 'add' || !username || nameParts.length === 0) {
  console.error(usage)
  process.exit(1)
}

const dbPath = process.env.DB_PATH
if (!dbPath) {
  console.error('DB_PATH is not set')
  process.exit(1)
}

// Output is muted while the password is typed so it is not echoed.
let muted = false
const output = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) process.stdout.write(chunk)
    cb()
  },
})
const rl = createInterface({ input: process.stdin, output, terminal: true })

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    muted = true
    rl.question('', (answer) => {
      muted = false
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

const password = await ask('Password: ')
const again = await ask('Repeat password: ')
rl.close()

if (password !== again) {
  console.error('Passwords do not match')
  process.exit(1)
}
if (password.length < 10) {
  console.error('Password must be at least 10 characters')
  process.exit(1)
}

const db = openDb(dbPath)
await upsertAdmin(db, username, nameParts.join(' '), password)
db.close()
console.log(`Saved admin ${username}`)
