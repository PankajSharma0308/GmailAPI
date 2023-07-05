import  Express  from 'express';
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

const app = Express();

// Credentials and API keys from env.
const credentials = {
  client_id: process.env.API_CLIENT_ID,
  client_secret: process.env.API_CLIENT_SECRET,
  redirect_uris: [process.env.API_REDIRECT_URI],
};

const TOKEN = {
  access_token: process.env.API_ACCESS_TOKEN,
  refresh_token: process.env.API_REFRESH_TOKEN,
  token_type: process.env.API_TOKEN_TYPE,
};

// Initialize with current timestamp
let lastEmailTimestamp = Math.floor(Date.now() / 1000);

// Load Gmail API client
async function loadGmailClient() {
  try {
    const { client_id, client_secret, redirect_uris } = credentials;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(TOKEN);
    return oAuth2Client;

  } catch (err) {
    console.error('Error loading Gmail client -> ', err);
    throw err;
  }
}

// Check if a label exists by name
async function labelExists(auth, labelName) {
  const gmail = google.gmail({ version: 'v1', auth });

  try{
    const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
    const labels = labelsResponse.data.labels;
    return labels.find((label) => label.name === labelName);

  }catch (err){
    console.error('Error checking labels -> ', err);
    throw err;
  }
}

// Create a label if it doesn't exist
const createLabelIfNotExists = async (auth, labelName) => {
  if (await labelExists(auth, labelName)) {
    console.log(`Label "${labelName}" already exists.`);
  } else {
    console.log(`Label "${labelName}" created successfully.`);
    const gmail = google.gmail({ version: 'v1', auth });
    const labelObject = {
      userId: 'me',
      resource: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    };
    const createdLabel = await gmail.users.labels.create(labelObject);
    console.log('Created label:', createdLabel.data);
  }
};

// Auto-reply to new and first-time messages
async function autoReplyToNewMessages(auth) {
  const gmail = google.gmail({ version: 'v1', auth });

  const labelName = 'Custom_reply';
  await createLabelIfNotExists(auth, labelName);

  // Retrieve the label ID
  const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
  const label = labelsResponse.data.labels.find((label) => label.name === labelName);
  const repliedLabelId = label.id;

  setInterval(async () => {
    let nextPageToken = null;
    let allThreads = [];

    do {
      const threadsResponse = await gmail.users.threads.list({
        userId: 'me',
        q: `is:unread after:${lastEmailTimestamp}`,
        pageToken: nextPageToken,
      });

      const threads = threadsResponse.data.threads;
      if (threads && threads.length > 0) {
        allThreads.push(...threads);
        nextPageToken = threadsResponse.data.nextPageToken;
      }
    } while (nextPageToken);

    for (const thread of allThreads) {
      const threadResponse = await gmail.users.threads.get({
        userId: 'me',
        id: thread.id,
      });

      const messages = threadResponse.data.messages;
      const firstMessage = messages[0];

      if (messages.length === 1 && firstMessage.internalDate > lastEmailTimestamp) {
        const replyMessage = {
          raw: Buffer.from(
              `From: "Pankaj Sharma" <pankaj.s.0308@gmail.com>\n` +
              `To: ${firstMessage.payload.headers.find((h) => h.name === 'From').value}\n` +
              `Subject: Re: ${firstMessage.payload.headers.find((h) => h.name === 'Subject').value}\n` +
              `Content-Type: text/plain; charset="UTF-8"\n\n` +
              `Thank you for you email. I am on vacation. \n This is an Automated reply.\n`
          ).toString('base64'),
        };
        gmail.users.messages.send({ userId: 'me', resource: replyMessage });

        gmail.users.threads.modify({
          userId: 'me',
          id: thread.id,
          addLabelIds: [repliedLabelId],
        });

        console.log(`Auto-reply sent to ${firstMessage.payload.headers.find((h) => h.name === 'From').value}`);
      }
    }

    // Update the last processed email timestamp
    lastEmailTimestamp = Math.floor(Date.now() / 1000);
  }, 60000); // 1 minute interval
}

// Start the Express server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  async function startApp() {
    try {
      const auth = await loadGmailClient();
      await autoReplyToNewMessages(auth);
    } catch (err) {
      console.error('Error:', err);
    }
  }
  startApp();
});
